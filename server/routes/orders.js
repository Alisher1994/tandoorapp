const express = require('express');
const pool = require('../database/connection');
const { authenticate } = require('../middleware/auth');
const { sendOrderNotification, sendOrderUpdateToUser } = require('../bot/notifications');

const router = express.Router();

// Get user orders
router.get('/my-orders', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, 
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
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.user_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Orders error:', error);
    res.status(500).json({ error: 'Ошибка получения заказов' });
  }
});

// Get single order
router.get('/:id', authenticate, async (req, res) => {
  try {
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    
    const itemsResult = await pool.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [req.params.id]
    );
    
    res.json({
      ...orderResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    console.error('Order error:', error);
    res.status(500).json({ error: 'Ошибка получения заказа' });
  }
});

// Create order
router.post('/', authenticate, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      items,
      delivery_address,
      delivery_coordinates,
      customer_name,
      customer_phone,
      payment_method,
      comment,
      delivery_date,
      delivery_time
    } = req.body;
    
    if (!items || items.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Корзина пуста' });
    }
    
    // Calculate total
    const totalAmount = items.reduce((sum, item) => {
      return sum + (parseFloat(item.price) * parseFloat(item.quantity));
    }, 0);
    
    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Create order
    const orderResult = await client.query(
      `INSERT INTO orders (
        user_id, order_number, total_amount, delivery_address, 
        delivery_coordinates, customer_name, customer_phone, 
        payment_method, comment, delivery_date, delivery_time, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        req.user.id, orderNumber, totalAmount, delivery_address,
        delivery_coordinates, customer_name, customer_phone,
        payment_method || 'cash', comment, delivery_date, delivery_time, 'new'
      ]
    );
    
    const order = orderResult.rows[0];
    
    // Create order items
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (
          order_id, product_id, product_name, quantity, unit, price, total
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          order.id,
          item.product_id || null,
          item.product_name,
          item.quantity,
          item.unit,
          item.price,
          parseFloat(item.price) * parseFloat(item.quantity)
        ]
      );
    }
    
    // Add status history
    await client.query(
      'INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, $2, $3)',
      [order.id, 'new', req.user.id]
    );
    
    await client.query('COMMIT');
    
    // Send notifications
    await sendOrderNotification(order, items);
    await sendOrderUpdateToUser(req.user.telegram_id, order, 'new');
    
    res.status(201).json({
      message: 'Заказ создан успешно',
      order: {
        ...order,
        items
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Ошибка создания заказа' });
  } finally {
    client.release();
  }
});

module.exports = router;

