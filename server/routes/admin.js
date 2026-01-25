const express = require('express');
const pool = require('../database/connection');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sendOrderUpdateToUser } = require('../bot/notifications');

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// Get all orders
router.get('/orders', async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT o.*, u.username, u.full_name as user_name,
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
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;
    
    if (status) {
      query += ` AND o.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    query += ' GROUP BY o.id, u.username, u.full_name ORDER BY o.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Admin orders error:', error);
    res.status(500).json({ error: 'Ошибка получения заказов' });
  }
});

// Update order status
router.patch('/orders/:id/status', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { status, comment } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Статус обязателен' });
    }
    
    await client.query('BEGIN');
    
    // Update order
    const orderResult = await client.query(
      'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    
    const order = orderResult.rows[0];
    
    // Add status history
    await client.query(
      'INSERT INTO order_status_history (order_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
      [order.id, status, req.user.id, comment || null]
    );
    
    await client.query('COMMIT');
    
    // Get user telegram_id
    const userResult = await client.query(
      'SELECT telegram_id FROM users WHERE id = $1',
      [order.user_id]
    );
    
    // Send notification to user
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

// Products management
router.get('/products', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT p.*, c.name_ru as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.sort_order, p.name_ru'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Admin products error:', error);
    res.status(500).json({ error: 'Ошибка получения товаров' });
  }
});

router.post('/products', async (req, res) => {
  try {
    const {
      category_id, name_ru, name_uz, description_ru, description_uz,
      image_url, price, unit, barcode, in_stock, sort_order
    } = req.body;
    
    const result = await pool.query(
      `INSERT INTO products (
        category_id, name_ru, name_uz, description_ru, description_uz,
        image_url, price, unit, barcode, in_stock, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        category_id, name_ru, name_uz, description_ru, description_uz,
        image_url, price, unit, barcode, in_stock !== false, sort_order || 0
      ]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Ошибка создания товара' });
  }
});

router.put('/products/:id', async (req, res) => {
  try {
    const {
      category_id, name_ru, name_uz, description_ru, description_uz,
      image_url, price, unit, barcode, in_stock, sort_order
    } = req.body;
    
    const result = await pool.query(
      `UPDATE products SET
        category_id = $1, name_ru = $2, name_uz = $3, description_ru = $4, description_uz = $5,
        image_url = $6, price = $7, unit = $8, barcode = $9, in_stock = $10, sort_order = $11,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
      RETURNING *`,
      [
        category_id, name_ru, name_uz, description_ru, description_uz,
        image_url, price, unit, barcode, in_stock !== false, sort_order || 0, req.params.id
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Ошибка обновления товара' });
  }
});

router.delete('/products/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    
    res.json({ message: 'Товар удален' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Ошибка удаления товара' });
  }
});

// Categories management
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY sort_order, name_ru');
    res.json(result.rows);
  } catch (error) {
    console.error('Admin categories error:', error);
    res.status(500).json({ error: 'Ошибка получения категорий' });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { name_ru, name_uz, image_url, sort_order } = req.body;
    
    const result = await pool.query(
      `INSERT INTO categories (name_ru, name_uz, image_url, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name_ru, name_uz, image_url, sort_order || 0]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Ошибка создания категории' });
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const { name_ru, name_uz, image_url, sort_order } = req.body;
    
    const result = await pool.query(
      `UPDATE categories SET
        name_ru = $1, name_uz = $2, image_url = $3, sort_order = $4
      WHERE id = $5
      RETURNING *`,
      [name_ru, name_uz, image_url, sort_order || 0, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Ошибка обновления категории' });
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    // Проверяем, есть ли товары в этой категории
    const productsCheck = await pool.query(
      'SELECT COUNT(*) as count FROM products WHERE category_id = $1',
      [req.params.id]
    );
    
    if (parseInt(productsCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Нельзя удалить категорию, в которой есть товары. Сначала удалите или переместите товары.' 
      });
    }
    
    const result = await pool.query(
      'DELETE FROM categories WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    
    res.json({ message: 'Категория удалена' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Ошибка удаления категории' });
  }
});

module.exports = router;

