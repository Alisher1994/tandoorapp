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
    
    // Get restaurant name and logo
    const restaurantResult = await pool.query(
      'SELECT name, logo_url FROM restaurants WHERE id = $1',
      [restaurant_id]
    );
    
    res.json({ 
      message: 'Ресторан переключен',
      active_restaurant_id: restaurant_id,
      active_restaurant_name: restaurantResult.rows[0]?.name,
      active_restaurant_logo: restaurantResult.rows[0]?.logo_url
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
    const { status, comment, cancel_reason } = req.body;
    
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
    
    // Update order with cancel_reason and cancelled_at_status if cancelling
    let updateQuery;
    let updateParams;
    
    if (status === 'cancelled' && cancel_reason) {
      updateQuery = `
        UPDATE orders SET 
          status = $1, 
          processed_by = $2,
          processed_at = CASE WHEN processed_at IS NULL THEN CURRENT_TIMESTAMP ELSE processed_at END,
          cancel_reason = $4,
          cancelled_at_status = $5,
          updated_at = CURRENT_TIMESTAMP 
        WHERE id = $3 
        RETURNING *
      `;
      updateParams = [status, req.user.id, req.params.id, cancel_reason, oldOrder.status];
    } else {
      updateQuery = `
        UPDATE orders SET 
          status = $1, 
          processed_by = $2,
          processed_at = CASE WHEN processed_at IS NULL THEN CURRENT_TIMESTAMP ELSE processed_at END,
          updated_at = CURRENT_TIMESTAMP 
        WHERE id = $3 
        RETURNING *
      `;
      updateParams = [status, req.user.id, req.params.id];
    }
    
    const orderResult = await client.query(updateQuery, updateParams);
    const order = orderResult.rows[0];
    
    // Add status history with cancel reason
    const historyComment = cancel_reason || comment || null;
    await client.query(
      'INSERT INTO order_status_history (order_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
      [order.id, status, req.user.id, historyComment]
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
    
    // Get user telegram_id and restaurant bot token and custom messages, then send notification
    const userResult = await pool.query(
      `SELECT u.telegram_id, r.telegram_bot_token,
              r.msg_new, r.msg_preparing, r.msg_delivering, r.msg_delivered, r.msg_cancelled
       FROM users u
       LEFT JOIN restaurants r ON r.id = $2
       WHERE u.id = $1`,
      [order.user_id, order.restaurant_id]
    );
    
    if (userResult.rows[0]?.telegram_id) {
      const row = userResult.rows[0];
      const customMessages = {
        msg_new: row.msg_new,
        msg_preparing: row.msg_preparing,
        msg_delivering: row.msg_delivering,
        msg_delivered: row.msg_delivered,
        msg_cancelled: row.msg_cancelled
      };
      
      await sendOrderUpdateToUser(
        row.telegram_id, 
        order, 
        status,
        row.telegram_bot_token,
        null, // restaurantPaymentUrls
        customMessages
      );
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
    
    query += ' ORDER BY p.name_ru';
    
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

// Upsert товар (создать или обновить по категории и названию)
router.post('/products/upsert', async (req, res) => {
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
    
    // Проверяем, существует ли товар с таким названием в этой категории (или любой категории если category_id не указан)
    let existingProduct;
    if (category_id) {
      existingProduct = await pool.query(`
        SELECT id FROM products 
        WHERE restaurant_id = $1 
          AND category_id = $2 
          AND LOWER(name_ru) = LOWER($3)
      `, [restaurantId, category_id, name_ru]);
    } else {
      // Если категория не указана, ищем по названию в любой категории
      existingProduct = await pool.query(`
        SELECT id FROM products 
        WHERE restaurant_id = $1 
          AND LOWER(name_ru) = LOWER($2)
      `, [restaurantId, name_ru]);
    }
    
    let result;
    let isUpdate = false;
    
    if (existingProduct.rows.length > 0) {
      // Обновляем существующий товар
      isUpdate = true;
      const updateFields = ['price = $1', 'unit = $2'];
      const updateValues = [price, unit || 'шт'];
      let paramIndex = 3;
      
      if (name_uz) {
        updateFields.push(`name_uz = $${paramIndex}`);
        updateValues.push(name_uz);
        paramIndex++;
      }
      if (category_id) {
        updateFields.push(`category_id = $${paramIndex}`);
        updateValues.push(category_id);
        paramIndex++;
      }
      if (description_ru) {
        updateFields.push(`description_ru = $${paramIndex}`);
        updateValues.push(description_ru);
        paramIndex++;
      }
      if (description_uz) {
        updateFields.push(`description_uz = $${paramIndex}`);
        updateValues.push(description_uz);
        paramIndex++;
      }
      if (image_url) {
        updateFields.push(`image_url = $${paramIndex}`);
        updateValues.push(image_url);
        paramIndex++;
      }
      if (barcode) {
        updateFields.push(`barcode = $${paramIndex}`);
        updateValues.push(barcode);
        paramIndex++;
      }
      
      updateFields.push(`in_stock = $${paramIndex}`);
      updateValues.push(in_stock !== false);
      paramIndex++;
      
      updateValues.push(existingProduct.rows[0].id);
      
      result = await pool.query(`
        UPDATE products SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `, updateValues);
    } else {
      // Создаем новый товар
      result = await pool.query(`
        INSERT INTO products (
          restaurant_id, category_id, name_ru, name_uz, description_ru, description_uz,
          image_url, price, unit, barcode, in_stock, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        restaurantId, category_id, name_ru, name_uz, description_ru, description_uz,
        image_url, price, unit || 'шт', barcode, in_stock !== false, sort_order || 0
      ]);
    }
    
    const product = result.rows[0];
    
    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId,
      actionType: isUpdate ? ACTION_TYPES.UPDATE_PRODUCT : ACTION_TYPES.CREATE_PRODUCT,
      entityType: ENTITY_TYPES.PRODUCT,
      entityId: product.id,
      entityName: product.name_ru,
      newValues: product,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    res.status(isUpdate ? 200 : 201).json({ ...product, isUpdate });
  } catch (error) {
    console.error('Upsert product error:', error);
    res.status(500).json({ error: 'Ошибка создания/обновления товара' });
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

// =====================================================
// РАССЫЛКА УВЕДОМЛЕНИЙ
// =====================================================

// Send broadcast message to all customers of the restaurant
router.post('/broadcast', async (req, res) => {
  try {
    const { message, image_url } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Текст сообщения обязателен' });
    }
    
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) {
      return res.status(400).json({ error: 'Не выбран ресторан' });
    }
    
    // Get restaurant info and bot token
    const restaurantResult = await pool.query(
      'SELECT name, telegram_bot_token FROM restaurants WHERE id = $1',
      [restaurantId]
    );
    
    if (restaurantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }
    
    const restaurant = restaurantResult.rows[0];
    const botToken = restaurant.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      return res.status(400).json({ error: 'Telegram бот не настроен для этого ресторана' });
    }
    
    // Get all customers who have ordered from this restaurant
    const customersResult = await pool.query(`
      SELECT DISTINCT u.telegram_id, u.full_name
      FROM users u
      INNER JOIN orders o ON u.id = o.user_id
      WHERE o.restaurant_id = $1 
        AND u.telegram_id IS NOT NULL 
        AND u.is_active = true
    `, [restaurantId]);
    
    const customers = customersResult.rows;
    
    if (customers.length === 0) {
      return res.status(400).json({ error: 'Нет клиентов для рассылки' });
    }
    
    // Create bot instance
    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(botToken);
    
    // Send messages
    let sent = 0;
    let failed = 0;
    
    const broadcastMessage = `📢 <b>${restaurant.name}</b>\n\n${message}`;
    
    for (const customer of customers) {
      try {
        if (image_url) {
          // Send photo with caption
          await bot.sendPhoto(customer.telegram_id, image_url, {
            caption: broadcastMessage,
            parse_mode: 'HTML'
          });
        } else {
          // Send text only
          await bot.sendMessage(customer.telegram_id, broadcastMessage, {
            parse_mode: 'HTML'
          });
        }
        sent++;
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (err) {
        console.error(`Failed to send to ${customer.telegram_id}:`, err.message);
        failed++;
      }
    }
    
    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: restaurantId,
      actionType: 'broadcast',
      entityType: 'notification',
      entityId: null,
      entityName: 'Рассылка',
      newValues: { message, sent, failed, total: customers.length },
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    res.json({
      message: 'Рассылка завершена',
      sent,
      failed,
      total: customers.length
    });
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ error: 'Ошибка рассылки: ' + error.message });
  }
});

// =====================================================
// ГОДОВАЯ АНАЛИТИКА
// =====================================================

// Get yearly analytics with monthly breakdown
router.get('/analytics/yearly', async (req, res) => {
  try {
    const { year } = req.query;
    const selectedYear = parseInt(year) || new Date().getFullYear();
    const restaurantId = req.user.active_restaurant_id;
    
    if (!restaurantId) {
      return res.status(400).json({ error: 'Выберите ресторан' });
    }
    
    // Get monthly revenue and orders count for delivered orders
    const monthlyStats = await pool.query(`
      SELECT 
        EXTRACT(MONTH FROM created_at) as month,
        COUNT(*) as orders_count,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM orders
      WHERE restaurant_id = $1 
        AND EXTRACT(YEAR FROM created_at) = $2
        AND status = 'delivered'
      GROUP BY EXTRACT(MONTH FROM created_at)
      ORDER BY month
    `, [restaurantId, selectedYear]);
    
    // Create array for all 12 months
    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      orders_count: 0,
      revenue: 0
    }));
    
    // Fill with actual data
    monthlyStats.rows.forEach(row => {
      const idx = parseInt(row.month) - 1;
      monthlyData[idx] = {
        month: parseInt(row.month),
        orders_count: parseInt(row.orders_count),
        revenue: parseFloat(row.revenue)
      };
    });
    
    // Calculate totals and average check
    const totalRevenue = monthlyData.reduce((sum, m) => sum + m.revenue, 0);
    const totalOrders = monthlyData.reduce((sum, m) => sum + m.orders_count, 0);
    const averageCheck = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    
    // Get top 5 products for each month
    const topProductsResult = await pool.query(`
      WITH monthly_products AS (
        SELECT 
          EXTRACT(MONTH FROM o.created_at) as month,
          oi.product_name,
          SUM(oi.quantity) as total_quantity,
          SUM(oi.quantity * oi.price) as total_revenue,
          ROW_NUMBER() OVER (
            PARTITION BY EXTRACT(MONTH FROM o.created_at) 
            ORDER BY SUM(oi.quantity) DESC
          ) as rank
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        WHERE o.restaurant_id = $1 
          AND EXTRACT(YEAR FROM o.created_at) = $2
          AND o.status = 'delivered'
        GROUP BY EXTRACT(MONTH FROM o.created_at), oi.product_name
      )
      SELECT month, product_name, total_quantity, total_revenue
      FROM monthly_products
      WHERE rank <= 5
      ORDER BY month, rank
    `, [restaurantId, selectedYear]);
    
    // Organize top products by month
    const topProductsByMonth = Array.from({ length: 12 }, () => []);
    topProductsResult.rows.forEach(row => {
      const idx = parseInt(row.month) - 1;
      topProductsByMonth[idx].push({
        name: row.product_name,
        quantity: parseInt(row.total_quantity),
        revenue: parseFloat(row.total_revenue)
      });
    });
    
    res.json({
      year: selectedYear,
      monthlyData,
      totalRevenue,
      totalOrders,
      averageCheck,
      topProductsByMonth
    });
  } catch (error) {
    console.error('Yearly analytics error:', error);
    res.status(500).json({ error: 'Ошибка получения аналитики' });
  }
});

module.exports = router;
