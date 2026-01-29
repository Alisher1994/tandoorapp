const express = require('express');
const pool = require('../database/connection');
const { authenticate } = require('../middleware/auth');
const { sendOrderNotification, sendOrderUpdateToUser, updateOrderNotificationForCustomerCancel } = require('../bot/notifications');

const router = express.Router();

function getNowInRestaurantTimezone() {
  const timezone = process.env.RESTAURANT_TIMEZONE || 'Asia/Tashkent';
  const nowString = new Date().toLocaleString('en-US', { timeZone: timezone });
  return new Date(nowString);
}

// Get user orders
router.get('/my-orders', authenticate, async (req, res) => {
  try {
    // Filter by active restaurant if user has one
    const activeRestaurantId = req.user.active_restaurant_id;
    
    let query = `SELECT o.*, r.name as restaurant_name,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', oi.id,
                    'product_name', oi.product_name,
                    'quantity', oi.quantity,
                    'unit', oi.unit,
                    'price', oi.price,
                    'total', oi.total,
                    'container_name', oi.container_name,
                    'container_price', oi.container_price
                  )
                ) FILTER (WHERE oi.id IS NOT NULL),
                '[]'
              ) as items
       FROM orders o
       LEFT JOIN restaurants r ON o.restaurant_id = r.id
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.user_id = $1`;
    
    const params = [req.user.id];
    
    // If user has active restaurant, show only orders from that restaurant
    if (activeRestaurantId) {
      query += ` AND o.restaurant_id = $2`;
      params.push(activeRestaurantId);
    }
    
    query += ` GROUP BY o.id, r.name ORDER BY o.created_at DESC`;
    
    const result = await pool.query(query, params);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Orders error:', error);
    res.status(500).json({ error: 'Ошибка получения заказов' });
  }
});

// Get single order
router.get('/:id', authenticate, async (req, res) => {
  try {
    const orderResult = await pool.query(`
      SELECT o.*, r.name as restaurant_name
      FROM orders o
      LEFT JOIN restaurants r ON o.restaurant_id = r.id
      WHERE o.id = $1 AND o.user_id = $2
    `, [req.params.id, req.user.id]);
    
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
  console.log('📦 ========== CREATE ORDER REQUEST ==========');
  console.log('📦 User:', req.user?.id, req.user?.username);
  console.log('📦 Body:', JSON.stringify(req.body, null, 2));
  
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
      delivery_time,
      restaurant_id,
      service_fee,
      delivery_cost,
      delivery_distance_km
    } = req.body;
    
    console.log('📦 Parsed data:', {
      items_count: items?.length,
      delivery_address,
      customer_phone,
      restaurant_id,
      delivery_time
    });
    
    if (!items || items.length === 0) {
      console.log('❌ Error: Empty cart');
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Корзина пуста' });
    }
    
    // If restaurant_id not provided, try to get it from first product
    let finalRestaurantId = restaurant_id;
    if (!finalRestaurantId && items[0]?.product_id) {
      console.log('📦 No restaurant_id, getting from product:', items[0].product_id);
      const productResult = await client.query(
        'SELECT restaurant_id FROM products WHERE id = $1',
        [items[0].product_id]
      );
      if (productResult.rows.length > 0) {
        finalRestaurantId = productResult.rows[0].restaurant_id;
      }
    }
    
    console.log('📦 Final restaurant_id:', finalRestaurantId);
    
    // Check restaurant working hours (block orders outside schedule)
    if (finalRestaurantId) {
      const hoursResult = await client.query(
        'SELECT start_time, end_time FROM restaurants WHERE id = $1',
        [finalRestaurantId]
      );
      const hours = hoursResult.rows[0];
      console.log('📦 Restaurant hours:', hours);
      
      if (hours?.start_time && hours?.end_time) {
        const now = getNowInRestaurantTimezone();
        const startTime = hours.start_time.substring(0, 5);
        const endTime = hours.end_time.substring(0, 5);
        const [openH, openM] = startTime.split(':').map(Number);
        const [closeH, closeM] = endTime.split(':').map(Number);
        const openMinutes = openH * 60 + openM;
        const closeMinutes = closeH * 60 + closeM;
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const isOpen = openMinutes < closeMinutes
          ? nowMinutes >= openMinutes && nowMinutes < closeMinutes
          : nowMinutes >= openMinutes || nowMinutes < closeMinutes;

        console.log('📦 Time check:', { startTime, endTime, nowMinutes, openMinutes, closeMinutes, isOpen });

        if (!isOpen) {
          console.log('❌ Restaurant closed');
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Ресторан работает с ${startTime} по ${endTime}`
          });
        }
      }
    }

    // Calculate total (items + containers + service fee + delivery)
    const itemsTotal = items.reduce((sum, item) => {
      const itemPrice = parseFloat(item.price) * parseFloat(item.quantity);
      const containerPrice = (parseFloat(item.container_price) || 0) * parseFloat(item.quantity);
      return sum + itemPrice + containerPrice;
    }, 0);
    
    const serviceFee = parseFloat(service_fee) || 0;
    const deliveryCost = parseFloat(delivery_cost) || 0;
    const deliveryDistanceKm = parseFloat(delivery_distance_km) || 0;
    const totalAmount = itemsTotal + serviceFee + deliveryCost;
    
    // Generate short order number (5 digits)
    const orderNumber = String(Math.floor(10000 + Math.random() * 90000));
    
    // Handle delivery_time - convert "asap" to null for database
    const dbDeliveryTime = (delivery_time && delivery_time !== 'asap') ? delivery_time : null;
    
    console.log('📦 Creating order with:', {
      finalRestaurantId,
      userId: req.user.id,
      totalAmount,
      serviceFee,
      delivery_address,
      customer_name: customer_name || req.user.full_name || 'Клиент',
      customer_phone,
      dbDeliveryTime
    });
    
    // Ensure required columns exist
    try {
      await client.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_fee DECIMAL(10, 2) DEFAULT 0');
      await client.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_cost DECIMAL(10, 2) DEFAULT 0');
      await client.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_distance_km DECIMAL(10, 2) DEFAULT 0');
      await client.query('ALTER TABLE order_items ADD COLUMN IF NOT EXISTS container_name VARCHAR(255)');
      await client.query('ALTER TABLE order_items ADD COLUMN IF NOT EXISTS container_price DECIMAL(10, 2) DEFAULT 0');
    } catch (e) {
      console.log('ℹ️ Orders columns check:', e.message);
    }
    
    // Create order
    const orderResult = await client.query(
      `INSERT INTO orders (
        restaurant_id, user_id, order_number, total_amount, delivery_address, 
        delivery_coordinates, customer_name, customer_phone, 
        payment_method, comment, delivery_date, delivery_time, status, service_fee,
        delivery_cost, delivery_distance_km
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        finalRestaurantId, req.user.id, orderNumber, totalAmount, delivery_address,
        delivery_coordinates, customer_name || req.user.full_name || 'Клиент', customer_phone,
        payment_method || 'cash', comment, delivery_date, dbDeliveryTime, 'new', serviceFee,
        deliveryCost, deliveryDistanceKm
      ]
    );
    
    const order = orderResult.rows[0];
    
    // Create order items
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (
          order_id, product_id, product_name, quantity, unit, price, total, container_name, container_price
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          order.id,
          item.product_id || null,
          item.product_name,
          item.quantity,
          item.unit,
          item.price,
          parseFloat(item.price) * parseFloat(item.quantity),
          item.container_name || null,
          item.container_price || 0
        ]
      );
    }
    
    // Add status history
    await client.query(
      'INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, $2, $3)',
      [order.id, 'new', req.user.id]
    );
    
    await client.query('COMMIT');
    
    // Send notifications using restaurant's bot if configured
    if (finalRestaurantId) {
      const restaurantResult = await pool.query(
        'SELECT telegram_bot_token, telegram_group_id, click_url, payme_url FROM restaurants WHERE id = $1',
        [finalRestaurantId]
      );
      const restaurant = restaurantResult.rows[0];
      if (restaurant?.telegram_group_id) {
        // Use restaurant-specific bot/group for notification
        await sendOrderNotification(order, items, restaurant.telegram_group_id, restaurant.telegram_bot_token);
      } else {
        // Fall back to default notification
        await sendOrderNotification(order, items);
      }
      
      // Send notification to user with payment link
      if (req.user.telegram_id) {
        const paymentUrls = {
          click_url: restaurant?.click_url,
          payme_url: restaurant?.payme_url
        };
        await sendOrderUpdateToUser(req.user.telegram_id, order, 'new', restaurant?.telegram_bot_token, paymentUrls);
      }
    } else {
      await sendOrderNotification(order, items);
      
      // Send notification to user
      if (req.user.telegram_id) {
        await sendOrderUpdateToUser(req.user.telegram_id, order, 'new');
      }
    }
    
    res.status(201).json({
      message: 'Заказ создан успешно',
      order: {
        ...order,
        items
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ ========== CREATE ORDER ERROR ==========');
    console.error('❌ Error message:', error.message);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error detail:', error.detail);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ error: 'Ошибка создания заказа: ' + error.message });
  } finally {
    client.release();
  }
});

// Cancel order (only if status is 'new')
router.post('/:id/cancel', authenticate, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if order exists and belongs to user
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    
    const order = orderResult.rows[0];
    
    // Can only cancel if status is 'new'
    if (order.status !== 'new') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Заказ уже обрабатывается, отмена невозможна' });
    }
    
    // Update status to cancelled
    await client.query(
      'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['cancelled', req.params.id]
    );
    
    // Add to status history
    await client.query(
      'INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, $2, $3)',
      [req.params.id, 'cancelled', req.user.id]
    );
    
    await client.query('COMMIT');
    
    // Get restaurant bot token for notifications
    let restaurantBotToken = null;
    let restaurantGroupId = null;
    if (order.restaurant_id) {
      const restaurantResult = await pool.query(
        'SELECT telegram_bot_token, telegram_group_id FROM restaurants WHERE id = $1',
        [order.restaurant_id]
      );
      if (restaurantResult.rows[0]) {
        restaurantBotToken = restaurantResult.rows[0].telegram_bot_token;
        restaurantGroupId = restaurantResult.rows[0].telegram_group_id;
      }
    }
    
    // Notify user using restaurant's bot
    if (req.user.telegram_id) {
      const { sendOrderUpdateToUser } = require('../bot/notifications');
      await sendOrderUpdateToUser(
        req.user.telegram_id, 
        { ...order, status: 'cancelled' }, 
        'cancelled',
        restaurantBotToken
      );
    }

    // Update group notification (remove buttons)
    try {
      await updateOrderNotificationForCustomerCancel(
        { ...order, status: 'cancelled' },
        restaurantBotToken,
        restaurantGroupId
      );
    } catch (error) {
      console.error('Update group cancel message error:', error);
    }
    
    res.json({ message: 'Заказ отменен', order: { ...order, status: 'cancelled' } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Cancel order error:', error);
    res.status(500).json({ error: 'Ошибка отмены заказа' });
  } finally {
    client.release();
  }
});

// =====================================================
// FEEDBACK (Complaints & Suggestions)
// =====================================================

// Create feedback (for customers)
router.post('/feedback', authenticate, async (req, res) => {
  try {
    const { type, message } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Сообщение обязательно' });
    }
    
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не выбран' });
    }
    
    // Get user info
    const userResult = await pool.query(
      'SELECT full_name, phone FROM users WHERE id = $1',
      [req.user.id]
    );
    const userData = userResult.rows[0] || {};
    
    const result = await pool.query(`
      INSERT INTO feedback (restaurant_id, user_id, customer_name, customer_phone, type, message)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      restaurantId,
      req.user.id,
      userData.full_name || 'Клиент',
      userData.phone || '',
      type || 'complaint',
      message.trim()
    ]);
    
    res.status(201).json({ 
      message: 'Ваше обращение отправлено. Спасибо за обратную связь!',
      feedback: result.rows[0] 
    });
  } catch (error) {
    console.error('Create feedback error:', error);
    res.status(500).json({ error: 'Ошибка отправки обращения' });
  }
});

// Get my feedback (for customers)
router.get('/my-feedback', authenticate, async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    
    let query = `
      SELECT f.*, r.name as restaurant_name
      FROM feedback f
      LEFT JOIN restaurants r ON f.restaurant_id = r.id
      WHERE f.user_id = $1
    `;
    const params = [req.user.id];
    
    if (restaurantId) {
      query += ` AND f.restaurant_id = $2`;
      params.push(restaurantId);
    }
    
    query += ` ORDER BY f.created_at DESC`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get my feedback error:', error);
    res.status(500).json({ error: 'Ошибка получения обращений' });
  }
});

module.exports = router;
