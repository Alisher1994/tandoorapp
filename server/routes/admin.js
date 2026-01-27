const express = require('express');
const pool = require('../database/connection');
const { authenticate, requireOperator, requireRestaurantAccess } = require('../middleware/auth');
const { sendOrderUpdateToUser } = require('../bot/notifications');
const { 
  logActivity, 
  getIpFromRequest, 
  getUserAgentFromRequest,
  ACTION_TYPES, 
  ENTITY_TYPES 
} = require('../services/activityLogger');

const router = express.Router();

// All routes require authentication and operator/superadmin role
router.use(authenticate);
router.use(requireOperator);

// =====================================================
// ИНФОРМАЦИЯ О ТЕКУЩЕМ ПОЛЬЗОВАТЕЛЕ
// =====================================================

// Получить информацию о текущем операторе и его ресторанах
router.get('/me', (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    full_name: req.user.full_name,
    role: req.user.role,
    active_restaurant_id: req.user.active_restaurant_id,
    active_restaurant_name: req.user.active_restaurant_name,
    restaurants: req.user.restaurants || []
  });
});

// Переключить активный ресторан
router.post('/switch-restaurant', async (req, res) => {
  try {
    const { restaurant_id } = req.body;
    
    if (!restaurant_id) {
      return res.status(400).json({ error: 'ID ресторана обязателен' });
    }
    
    // Check if user has access to this restaurant (superadmin has access to all)
    if (req.user.role !== 'superadmin') {
      const accessCheck = await pool.query(`
        SELECT 1 FROM operator_restaurants 
        WHERE user_id = $1 AND restaurant_id = $2
      `, [req.user.id, restaurant_id]);
      
      if (accessCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Нет доступа к этому ресторану' });
      }
    }
    
    // Update active restaurant
    await pool.query(
      'UPDATE users SET active_restaurant_id = $1 WHERE id = $2',
      [restaurant_id, req.user.id]
    );
    
    // Get restaurant name
    const restaurantResult = await pool.query(
      'SELECT name FROM restaurants WHERE id = $1',
      [restaurant_id]
    );
    
    res.json({ 
      message: 'Ресторан переключен',
      active_restaurant_id: restaurant_id,
      active_restaurant_name: restaurantResult.rows[0]?.name
    });
  } catch (error) {
    console.error('Switch restaurant error:', error);
    res.status(500).json({ error: 'Ошибка переключения ресторана' });
  }
});

// =====================================================
// ЗАКАЗЫ
// =====================================================

// Получить заказы (фильтруются по активному ресторану)
router.get('/orders', async (req, res) => {
  try {
    const { status } = req.query;
    const restaurantId = req.user.active_restaurant_id;
    
    let query = `
      SELECT o.*, u.username, u.full_name as user_name, u.telegram_id,
             r.name as restaurant_name,
             pb.full_name as processed_by_name,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', oi.id,
                   'product_name', oi.product_name,
                   'quantity', oi.quantity,
                   'unit', oi.unit,
                   'price', oi.price,
                   'total', oi.total
                 )
               ) FILTER (WHERE oi.id IS NOT NULL),
               '[]'
             ) as items
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN users pb ON o.processed_by = pb.id
      LEFT JOIN restaurants r ON o.restaurant_id = r.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;
    
    // Filter by restaurant (operators see only their restaurant, superadmin sees all)
    if (restaurantId && req.user.role !== 'superadmin') {
      query += ` AND o.restaurant_id = $${paramCount}`;
      params.push(restaurantId);
      paramCount++;
    } else if (restaurantId) {
      // Superadmin with active restaurant - filter by it
      query += ` AND o.restaurant_id = $${paramCount}`;
      params.push(restaurantId);
      paramCount++;
    }
    
    if (status && status !== 'all') {
      query += ` AND o.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    query += ' GROUP BY o.id, u.username, u.full_name, u.telegram_id, r.name, pb.full_name ORDER BY o.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Admin orders error:', error);
    res.status(500).json({ error: 'Ошибка получения заказов' });
  }
});

// Обновить статус заказа
router.patch('/orders/:id/status', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { status, comment } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Статус обязателен' });
    }
    
    await client.query('BEGIN');
    
    // Get order and check access
    const orderCheck = await client.query(
      'SELECT * FROM orders WHERE id = $1',
      [req.params.id]
    );
    
    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    
    const oldOrder = orderCheck.rows[0];
    
    // Check restaurant access for operators
    if (req.user.role !== 'superadmin' && oldOrder.restaurant_id !== req.user.active_restaurant_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Нет доступа к этому заказу' });
    }
    
    // Update order
    const orderResult = await client.query(`
      UPDATE orders SET 
        status = $1, 
        processed_by = $2,
        processed_at = CASE WHEN processed_at IS NULL THEN CURRENT_TIMESTAMP ELSE processed_at END,
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = $3 
      RETURNING *
    `, [status, req.user.id, req.params.id]);
    
    const order = orderResult.rows[0];
    
    // Add status history
    await client.query(
      'INSERT INTO order_status_history (order_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
      [order.id, status, req.user.id, comment || null]
    );
    
    await client.query('COMMIT');
    
    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: order.restaurant_id,
      actionType: status === 'cancelled' ? ACTION_TYPES.CANCEL_ORDER : ACTION_TYPES.UPDATE_ORDER_STATUS,
      entityType: ENTITY_TYPES.ORDER,
      entityId: order.id,
      entityName: `Заказ #${order.order_number}`,
      oldValues: { status: oldOrder.status },
      newValues: { status: order.status },
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    // Get user telegram_id and send notification
    const userResult = await pool.query(
      'SELECT telegram_id FROM users WHERE id = $1',
      [order.user_id]
    );
    
    if (userResult.rows[0]?.telegram_id) {
      await sendOrderUpdateToUser(userResult.rows[0].telegram_id, order, status);
    }
    
    res.json({
      message: 'Статус заказа обновлен',
      order
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Ошибка обновления статуса' });
  } finally {
    client.release();
  }
});

// Update order items (add, remove, change quantity)
router.put('/orders/:id/items', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Список товаров обязателен' });
    }
    
    await client.query('BEGIN');
    
    // Get order and check access
    const orderCheck = await client.query(
      'SELECT * FROM orders WHERE id = $1',
      [req.params.id]
    );
    
    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    
    const order = orderCheck.rows[0];
    
    // Check restaurant access
    if (req.user.role !== 'superadmin' && order.restaurant_id !== req.user.active_restaurant_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Нет доступа к этому заказу' });
    }
    
    // Delete old items
    await client.query('DELETE FROM order_items WHERE order_id = $1', [req.params.id]);
    
    // Insert new items
    let newTotal = 0;
    for (const item of items) {
      const itemTotal = parseFloat(item.price) * parseFloat(item.quantity);
      newTotal += itemTotal;
      
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit, price, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.params.id, item.product_id || null, item.product_name, item.quantity, item.unit || 'шт', item.price, itemTotal]
      );
    }
    
    // Update order total
    await client.query(
      'UPDATE orders SET total_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newTotal, req.params.id]
    );
    
    await client.query('COMMIT');
    
    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: order.restaurant_id,
      actionType: ACTION_TYPES.UPDATE_ORDER,
      entityType: ENTITY_TYPES.ORDER,
      entityId: order.id,
      entityName: `Заказ #${order.order_number}`,
      newValues: { items_count: items.length, total: newTotal },
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    res.json({
      message: 'Товары обновлены',
      total_amount: newTotal
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update order items error:', error);
    res.status(500).json({ error: 'Ошибка обновления товаров' });
  } finally {
    client.release();
  }
});

// =====================================================
// ТОВАРЫ
// =====================================================

// Получить товары (фильтруются по активному ресторану)
router.get('/products', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    
    let query = `
      SELECT p.*, c.name_ru as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE 1=1
    `;
    const params = [];
    
    if (restaurantId) {
      query += ' AND p.restaurant_id = $1';
      params.push(restaurantId);
    }
    
    query += ' ORDER BY p.sort_order, p.name_ru';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Admin products error:', error);
    res.status(500).json({ error: 'Ошибка получения товаров' });
  }
});

// Создать товар
router.post('/products', async (req, res) => {
  try {
    const {
      category_id, name_ru, name_uz, description_ru, description_uz,
      image_url, price, unit, barcode, in_stock, sort_order
    } = req.body;
    
    const restaurantId = req.user.active_restaurant_id;
    
    if (!restaurantId) {
      return res.status(400).json({ error: 'Выберите ресторан' });
    }
    
    if (!name_ru || !price) {
      return res.status(400).json({ error: 'Название и цена обязательны' });
    }
    
    const result = await pool.query(`
      INSERT INTO products (
        restaurant_id, category_id, name_ru, name_uz, description_ru, description_uz,
        image_url, price, unit, barcode, in_stock, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      restaurantId, category_id, name_ru, name_uz, description_ru, description_uz,
      image_url, price, unit || 'шт', barcode, in_stock !== false, sort_order || 0
    ]);
    
    const product = result.rows[0];
    
    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId,
      actionType: ACTION_TYPES.CREATE_PRODUCT,
      entityType: ENTITY_TYPES.PRODUCT,
      entityId: product.id,
      entityName: product.name_ru,
      newValues: product,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    res.status(201).json(product);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Ошибка создания товара' });
  }
});

// Обновить товар
router.put('/products/:id', async (req, res) => {
  try {
    const {
      category_id, name_ru, name_uz, description_ru, description_uz,
      image_url, price, unit, barcode, in_stock, sort_order
    } = req.body;
    
    // Get old values and check access
    const oldResult = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    const oldProduct = oldResult.rows[0];
    
    // Check restaurant access
    if (req.user.role !== 'superadmin' && oldProduct.restaurant_id !== req.user.active_restaurant_id) {
      return res.status(403).json({ error: 'Нет доступа к этому товару' });
    }
    
    const result = await pool.query(`
      UPDATE products SET
        category_id = $1, name_ru = $2, name_uz = $3, description_ru = $4, description_uz = $5,
        image_url = $6, price = $7, unit = $8, barcode = $9, in_stock = $10, sort_order = $11,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
      RETURNING *
    `, [
      category_id, name_ru, name_uz, description_ru, description_uz,
      image_url, price, unit, barcode, in_stock !== false, sort_order || 0, req.params.id
    ]);
    
    const product = result.rows[0];
    
    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: product.restaurant_id,
      actionType: ACTION_TYPES.UPDATE_PRODUCT,
      entityType: ENTITY_TYPES.PRODUCT,
      entityId: product.id,
      entityName: product.name_ru,
      oldValues: oldProduct,
      newValues: product,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    res.json(product);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Ошибка обновления товара' });
  }
});

// Удалить товар
router.delete('/products/:id', async (req, res) => {
  try {
    // Get product and check access
    const productResult = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    const product = productResult.rows[0];
    
    // Check restaurant access
    if (req.user.role !== 'superadmin' && product.restaurant_id !== req.user.active_restaurant_id) {
      return res.status(403).json({ error: 'Нет доступа к этому товару' });
    }
    
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    
    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: product.restaurant_id,
      actionType: ACTION_TYPES.DELETE_PRODUCT,
      entityType: ENTITY_TYPES.PRODUCT,
      entityId: product.id,
      entityName: product.name_ru,
      oldValues: product,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    res.json({ message: 'Товар удален' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Ошибка удаления товара' });
  }
});

// =====================================================
// КАТЕГОРИИ
// =====================================================

// Получить категории (фильтруются по активному ресторану)
router.get('/categories', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    
    let query = 'SELECT * FROM categories WHERE 1=1';
    const params = [];
    
    if (restaurantId) {
      query += ' AND restaurant_id = $1';
      params.push(restaurantId);
    }
    
    query += ' ORDER BY sort_order, name_ru';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Admin categories error:', error);
    res.status(500).json({ error: 'Ошибка получения категорий' });
  }
});

// Создать категорию
router.post('/categories', async (req, res) => {
  try {
    const { name_ru, name_uz, image_url, sort_order } = req.body;
    const restaurantId = req.user.active_restaurant_id;
    
    if (!restaurantId) {
      return res.status(400).json({ error: 'Выберите ресторан' });
    }
    
    if (!name_ru) {
      return res.status(400).json({ error: 'Название категории обязательно' });
    }
    
    const result = await pool.query(`
      INSERT INTO categories (restaurant_id, name_ru, name_uz, image_url, sort_order)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [restaurantId, name_ru, name_uz, image_url, sort_order || 0]);
    
    const category = result.rows[0];
    
    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId,
      actionType: ACTION_TYPES.CREATE_CATEGORY,
      entityType: ENTITY_TYPES.CATEGORY,
      entityId: category.id,
      entityName: category.name_ru,
      newValues: category,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    res.status(201).json(category);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Ошибка создания категории' });
  }
});

// Обновить категорию
router.put('/categories/:id', async (req, res) => {
  try {
    const { name_ru, name_uz, image_url, sort_order } = req.body;
    
    // Get old values and check access
    const oldResult = await pool.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    const oldCategory = oldResult.rows[0];
    
    // Check restaurant access
    if (req.user.role !== 'superadmin' && oldCategory.restaurant_id !== req.user.active_restaurant_id) {
      return res.status(403).json({ error: 'Нет доступа к этой категории' });
    }
    
    const result = await pool.query(`
      UPDATE categories SET
        name_ru = $1, name_uz = $2, image_url = $3, sort_order = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [name_ru, name_uz, image_url, sort_order || 0, req.params.id]);
    
    const category = result.rows[0];
    
    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: category.restaurant_id,
      actionType: ACTION_TYPES.UPDATE_CATEGORY,
      entityType: ENTITY_TYPES.CATEGORY,
      entityId: category.id,
      entityName: category.name_ru,
      oldValues: oldCategory,
      newValues: category,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    res.json(category);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Ошибка обновления категории' });
  }
});

// Удалить категорию
router.delete('/categories/:id', async (req, res) => {
  try {
    // Get category and check access
    const categoryResult = await pool.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    const category = categoryResult.rows[0];
    
    // Check restaurant access
    if (req.user.role !== 'superadmin' && category.restaurant_id !== req.user.active_restaurant_id) {
      return res.status(403).json({ error: 'Нет доступа к этой категории' });
    }
    
    // Check for products in category
    const productsCheck = await pool.query(
      'SELECT COUNT(*) as count FROM products WHERE category_id = $1',
      [req.params.id]
    );
    
    if (parseInt(productsCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Нельзя удалить категорию, в которой есть товары. Сначала удалите или переместите товары.' 
      });
    }
    
    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    
    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: category.restaurant_id,
      actionType: ACTION_TYPES.DELETE_CATEGORY,
      entityType: ENTITY_TYPES.CATEGORY,
      entityId: category.id,
      entityName: category.name_ru,
      oldValues: category,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    res.json({ message: 'Категория удалена' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Ошибка удаления категории' });
  }
});

// =====================================================
// СТАТИСТИКА
// =====================================================

router.get('/stats', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    
    let whereClause = '';
    const params = [];
    
    if (restaurantId) {
      whereClause = 'WHERE restaurant_id = $1';
      params.push(restaurantId);
    }
    
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM orders ${whereClause} AND status = 'new') as new_orders,
        (SELECT COUNT(*) FROM orders ${whereClause} AND status = 'preparing') as preparing_orders,
        (SELECT COUNT(*) FROM orders ${whereClause} AND status = 'delivering') as delivering_orders,
        (SELECT COUNT(*) FROM orders ${whereClause} AND DATE(created_at) = CURRENT_DATE) as today_orders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders ${whereClause} AND DATE(created_at) = CURRENT_DATE) as today_revenue,
        (SELECT COUNT(*) FROM products ${whereClause.replace('restaurant_id', 'restaurant_id')}) as products_count,
        (SELECT COUNT(*) FROM categories ${whereClause.replace('restaurant_id', 'restaurant_id')}) as categories_count
    `.replace(/\$1/g, restaurantId ? '$1' : '0'), params.length ? params : []);
    
    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

module.exports = router;
