const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const bcrypt = require('bcryptjs');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { 
  logActivity, 
  getActivityLogs, 
  getActivityStats,
  getIpFromRequest,
  getUserAgentFromRequest,
  ACTION_TYPES, 
  ENTITY_TYPES 
} = require('../services/activityLogger');

// All routes require superadmin authentication
router.use(authenticate);
router.use(requireSuperAdmin);

// =====================================================
// РЕСТОРАНЫ
// =====================================================

// Получить все рестораны
router.get('/restaurants', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, 
        (SELECT COUNT(*) FROM operator_restaurants WHERE restaurant_id = r.id) as operators_count,
        (SELECT COUNT(*) FROM orders WHERE restaurant_id = r.id) as orders_count,
        (SELECT COUNT(*) FROM products WHERE restaurant_id = r.id) as products_count
      FROM restaurants r
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get restaurants error:', error);
    res.status(500).json({ error: 'Ошибка получения ресторанов' });
  }
});

// Получить один ресторан
router.get('/restaurants/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*,
        (SELECT COUNT(*) FROM operator_restaurants WHERE restaurant_id = r.id) as operators_count
      FROM restaurants r
      WHERE r.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }
    
    // Get operators for this restaurant
    const operatorsResult = await pool.query(`
      SELECT u.id, u.username, u.full_name, u.phone
      FROM users u
      INNER JOIN operator_restaurants opr ON u.id = opr.user_id
      WHERE opr.restaurant_id = $1
    `, [req.params.id]);
    
    const restaurant = result.rows[0];
    restaurant.operators = operatorsResult.rows;
    
    res.json(restaurant);
  } catch (error) {
    console.error('Get restaurant error:', error);
    res.status(500).json({ error: 'Ошибка получения ресторана' });
  }
});

// Создать ресторан
router.post('/restaurants', async (req, res) => {
  try {
    const { name, address, phone, logo_url, delivery_zone, telegram_bot_token, telegram_group_id, start_time, end_time } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Название ресторана обязательно' });
    }
    
    console.log('📍 Creating restaurant with delivery_zone:', delivery_zone);
    
    const result = await pool.query(`
      INSERT INTO restaurants (name, address, phone, logo_url, delivery_zone, telegram_bot_token, telegram_group_id, start_time, end_time)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      name,
      address,
      phone,
      logo_url,
      delivery_zone ? JSON.stringify(delivery_zone) : null,
      telegram_bot_token,
      telegram_group_id,
      start_time,
      end_time
    ]);
    
    const restaurant = result.rows[0];
    
    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: restaurant.id,
      actionType: ACTION_TYPES.CREATE_RESTAURANT,
      entityType: ENTITY_TYPES.RESTAURANT,
      entityId: restaurant.id,
      entityName: restaurant.name,
      newValues: restaurant,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    res.status(201).json(restaurant);
  } catch (error) {
    console.error('Create restaurant error:', error);
    res.status(500).json({ error: 'Ошибка создания ресторана' });
  }
});

// Обновить ресторан
router.put('/restaurants/:id', async (req, res) => {
  try {
    const { name, address, phone, logo_url, delivery_zone, telegram_bot_token, telegram_group_id, is_active, start_time, end_time } = req.body;
    
    // Get old values for logging
    const oldResult = await pool.query('SELECT * FROM restaurants WHERE id = $1', [req.params.id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }
    const oldValues = oldResult.rows[0];
    
    console.log('📍 Updating restaurant with delivery_zone:', delivery_zone);
    
    const result = await pool.query(`
      UPDATE restaurants 
      SET name = COALESCE($1, name),
          address = COALESCE($2, address),
          phone = COALESCE($3, phone),
          logo_url = $4,
          delivery_zone = $5,
          telegram_bot_token = COALESCE($6, telegram_bot_token),
          telegram_group_id = COALESCE($7, telegram_group_id),
          is_active = COALESCE($8, is_active),
          start_time = $9,
          end_time = $10,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
      RETURNING *
    `, [
      name,
      address,
      phone,
      logo_url,
      delivery_zone ? JSON.stringify(delivery_zone) : null,
      telegram_bot_token,
      telegram_group_id,
      is_active,
      start_time || null,
      end_time || null,
      req.params.id
    ]);
    
    const restaurant = result.rows[0];
    
    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: restaurant.id,
      actionType: ACTION_TYPES.UPDATE_RESTAURANT,
      entityType: ENTITY_TYPES.RESTAURANT,
      entityId: restaurant.id,
      entityName: restaurant.name,
      oldValues,
      newValues: restaurant,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    res.json(restaurant);
  } catch (error) {
    console.error('Update restaurant error:', error);
    res.status(500).json({ error: 'Ошибка обновления ресторана' });
  }
});

// Удалить ресторан
router.delete('/restaurants/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get restaurant for logging
    const restaurantResult = await client.query('SELECT * FROM restaurants WHERE id = $1', [req.params.id]);
    if (restaurantResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ресторан не найден' });
    }
    const restaurant = restaurantResult.rows[0];
    
    // Check if there are orders
    const ordersCheck = await client.query('SELECT COUNT(*) FROM orders WHERE restaurant_id = $1', [req.params.id]);
    if (parseInt(ordersCheck.rows[0].count) > 0) {
      // Soft delete - just deactivate
      await client.query('UPDATE restaurants SET is_active = false WHERE id = $1', [req.params.id]);
      await client.query('COMMIT');
      
      await logActivity({
        userId: req.user.id,
        restaurantId: restaurant.id,
        actionType: ACTION_TYPES.DELETE_RESTAURANT,
        entityType: ENTITY_TYPES.RESTAURANT,
        entityId: restaurant.id,
        entityName: restaurant.name,
        oldValues: restaurant,
        newValues: { is_active: false },
        ipAddress: getIpFromRequest(req),
        userAgent: getUserAgentFromRequest(req)
      });
      
      return res.json({ message: 'Ресторан деактивирован (есть связанные заказы)' });
    }
    
    // Hard delete if no orders
    await client.query('DELETE FROM restaurants WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    
    await logActivity({
      userId: req.user.id,
      actionType: ACTION_TYPES.DELETE_RESTAURANT,
      entityType: ENTITY_TYPES.RESTAURANT,
      entityId: restaurant.id,
      entityName: restaurant.name,
      oldValues: restaurant,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    res.json({ message: 'Ресторан удален' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete restaurant error:', error);
    res.status(500).json({ error: 'Ошибка удаления ресторана' });
  } finally {
    client.release();
  }
});

// =====================================================
// ОПЕРАТОРЫ
// =====================================================

// Получить всех операторов
router.get('/operators', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.username, u.full_name, u.phone, u.role, u.is_active, u.created_at,
        u.active_restaurant_id,
        ar.name as active_restaurant_name,
        COALESCE(
          json_agg(
            json_build_object('id', r.id, 'name', r.name)
          ) FILTER (WHERE r.id IS NOT NULL),
          '[]'
        ) as restaurants
      FROM users u
      LEFT JOIN restaurants ar ON u.active_restaurant_id = ar.id
      LEFT JOIN operator_restaurants opr ON u.id = opr.user_id
      LEFT JOIN restaurants r ON opr.restaurant_id = r.id
      WHERE u.role IN ('operator', 'superadmin')
      GROUP BY u.id, ar.name
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get operators error:', error);
    res.status(500).json({ error: 'Ошибка получения операторов' });
  }
});

// Создать оператора
router.post('/operators', async (req, res) => {
  const client = await pool.connect();
  try {
    const { username, password, full_name, phone, restaurant_ids } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }
    
    await client.query('BEGIN');
    
    // Check username uniqueness
    const existingUser = await client.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const userResult = await client.query(`
      INSERT INTO users (username, password, full_name, phone, role, is_active)
      VALUES ($1, $2, $3, $4, 'operator', true)
      RETURNING id, username, full_name, phone, role, is_active, created_at
    `, [username, hashedPassword, full_name, phone]);
    
    const user = userResult.rows[0];
    
    // Link to restaurants
    if (restaurant_ids && restaurant_ids.length > 0) {
      for (const restaurantId of restaurant_ids) {
        await client.query(`
          INSERT INTO operator_restaurants (user_id, restaurant_id)
          VALUES ($1, $2)
        `, [user.id, restaurantId]);
      }
      
      // Set first restaurant as active
      await client.query(`
        UPDATE users SET active_restaurant_id = $1 WHERE id = $2
      `, [restaurant_ids[0], user.id]);
    }
    
    await client.query('COMMIT');
    
    // Log activity
    await logActivity({
      userId: req.user.id,
      actionType: ACTION_TYPES.CREATE_USER,
      entityType: ENTITY_TYPES.USER,
      entityId: user.id,
      entityName: user.full_name || user.username,
      newValues: { ...user, restaurant_ids },
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    res.status(201).json(user);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create operator error:', error);
    res.status(500).json({ error: 'Ошибка создания оператора' });
  } finally {
    client.release();
  }
});

// Обновить оператора
router.put('/operators/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { full_name, phone, password, is_active, restaurant_ids } = req.body;
    
    await client.query('BEGIN');
    
    // Get old values
    const oldResult = await client.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (oldResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Оператор не найден' });
    }
    const oldValues = oldResult.rows[0];
    
    // Update user
    let updateQuery = `
      UPDATE users SET 
        full_name = COALESCE($1, full_name),
        phone = COALESCE($2, phone),
        is_active = COALESCE($3, is_active),
        updated_at = CURRENT_TIMESTAMP
    `;
    let params = [full_name, phone, is_active];
    
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery += `, password = $${params.length + 1}`;
      params.push(hashedPassword);
    }
    
    updateQuery += ` WHERE id = $${params.length + 1} RETURNING *`;
    params.push(req.params.id);
    
    const userResult = await client.query(updateQuery, params);
    const user = userResult.rows[0];
    
    // Update restaurant links if provided
    if (restaurant_ids !== undefined) {
      // Remove old links
      await client.query('DELETE FROM operator_restaurants WHERE user_id = $1', [req.params.id]);
      
      // Add new links
      for (const restaurantId of restaurant_ids) {
        await client.query(`
          INSERT INTO operator_restaurants (user_id, restaurant_id)
          VALUES ($1, $2)
        `, [req.params.id, restaurantId]);
      }
      
      // Update active restaurant if current one is not in new list
      if (restaurant_ids.length > 0 && !restaurant_ids.includes(user.active_restaurant_id)) {
        await client.query(`
          UPDATE users SET active_restaurant_id = $1 WHERE id = $2
        `, [restaurant_ids[0], req.params.id]);
      } else if (restaurant_ids.length === 0) {
        await client.query(`
          UPDATE users SET active_restaurant_id = NULL WHERE id = $1
        `, [req.params.id]);
      }
    }
    
    await client.query('COMMIT');
    
    // Log activity
    await logActivity({
      userId: req.user.id,
      actionType: ACTION_TYPES.UPDATE_USER,
      entityType: ENTITY_TYPES.USER,
      entityId: user.id,
      entityName: user.full_name || user.username,
      oldValues,
      newValues: { ...user, restaurant_ids },
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    res.json(user);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update operator error:', error);
    res.status(500).json({ error: 'Ошибка обновления оператора' });
  } finally {
    client.release();
  }
});

// Удалить оператора
router.delete('/operators/:id', async (req, res) => {
  try {
    // Prevent self-deletion
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Нельзя удалить самого себя' });
    }
    
    // Get user for logging
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Оператор не найден' });
    }
    const user = userResult.rows[0];
    
    // Soft delete
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [req.params.id]);
    
    // Log activity
    await logActivity({
      userId: req.user.id,
      actionType: ACTION_TYPES.DELETE_USER,
      entityType: ENTITY_TYPES.USER,
      entityId: user.id,
      entityName: user.full_name || user.username,
      oldValues: user,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    res.json({ message: 'Оператор деактивирован' });
  } catch (error) {
    console.error('Delete operator error:', error);
    res.status(500).json({ error: 'Ошибка удаления оператора' });
  }
});

// =====================================================
// КЛИЕНТЫ
// =====================================================

// Получить всех клиентов
router.get('/customers', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', status = '' } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        u.id, u.username, u.full_name, u.phone, u.telegram_id, u.is_active, u.created_at,
        COUNT(o.id) as orders_count,
        COALESCE(SUM(o.total_amount), 0) as total_spent,
        MAX(o.created_at) as last_order_date
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE u.role = 'customer'
    `;
    
    const params = [];
    if (search) {
      query += ` AND (u.full_name ILIKE $${params.length + 1} OR u.phone ILIKE $${params.length + 1} OR u.username ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }
    
    if (status === 'active') {
      query += ` AND u.is_active = true`;
    } else if (status === 'blocked') {
      query += ` AND u.is_active = false`;
    }
    
    query += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM users WHERE role = $1';
    const countParams = ['customer'];
    if (search) {
      countQuery += ` AND (full_name ILIKE $2 OR phone ILIKE $2 OR username ILIKE $2)`;
      countParams.push(`%${search}%`);
    }
    if (status === 'active') {
      countQuery += ` AND is_active = true`;
    } else if (status === 'blocked') {
      countQuery += ` AND is_active = false`;
    }
    const countResult = await pool.query(countQuery, countParams);
    
    res.json({
      customers: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Ошибка получения клиентов' });
  }
});

// Получить детали клиента
router.get('/customers/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.username, u.full_name, u.phone, u.telegram_id, u.is_active, u.created_at,
        COUNT(o.id) as orders_count,
        COALESCE(SUM(o.total_amount), 0) as total_spent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE u.id = $1 AND u.role = 'customer'
      GROUP BY u.id
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Ошибка получения клиента' });
  }
});

// Заблокировать/разблокировать клиента
router.put('/customers/:id/toggle-block', async (req, res) => {
  try {
    // Get current status
    const currentResult = await pool.query('SELECT * FROM users WHERE id = $1 AND role = $2', [req.params.id, 'customer']);
    
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    
    const customer = currentResult.rows[0];
    const newStatus = !customer.is_active;
    
    await pool.query('UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newStatus, req.params.id]);
    
    // Log activity
    await logActivity({
      userId: req.user.id,
      actionType: newStatus ? ACTION_TYPES.UNBLOCK_USER : ACTION_TYPES.BLOCK_USER,
      entityType: ENTITY_TYPES.USER,
      entityId: customer.id,
      entityName: customer.full_name || customer.username,
      oldValues: { is_active: customer.is_active },
      newValues: { is_active: newStatus },
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    res.json({ 
      message: newStatus ? 'Клиент разблокирован' : 'Клиент заблокирован',
      is_active: newStatus
    });
  } catch (error) {
    console.error('Toggle customer block error:', error);
    res.status(500).json({ error: 'Ошибка изменения статуса клиента' });
  }
});

// Удалить клиента
router.delete('/customers/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get customer data
    const customerResult = await client.query('SELECT * FROM users WHERE id = $1 AND role = $2', [req.params.id, 'customer']);
    
    if (customerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    
    const customer = customerResult.rows[0];
    
    // Check if customer has orders
    const ordersResult = await client.query('SELECT COUNT(*) FROM orders WHERE user_id = $1', [req.params.id]);
    const ordersCount = parseInt(ordersResult.rows[0].count);
    
    if (ordersCount > 0) {
      // Soft delete - just block the customer
      await client.query('UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
      await client.query('COMMIT');
      
      await logActivity({
        userId: req.user.id,
        actionType: ACTION_TYPES.DELETE_USER,
        entityType: ENTITY_TYPES.USER,
        entityId: customer.id,
        entityName: customer.full_name || customer.username,
        oldValues: customer,
        newValues: { is_active: false, soft_deleted: true },
        details: `Soft delete (${ordersCount} заказов)`,
        ipAddress: getIpFromRequest(req),
        userAgent: getUserAgentFromRequest(req)
      });
      
      return res.json({ 
        message: `Клиент деактивирован (имеет ${ordersCount} заказов)`,
        soft_deleted: true
      });
    }
    
    // Hard delete if no orders
    await client.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    
    await logActivity({
      userId: req.user.id,
      actionType: ACTION_TYPES.DELETE_USER,
      entityType: ENTITY_TYPES.USER,
      entityId: customer.id,
      entityName: customer.full_name || customer.username,
      oldValues: customer,
      details: 'Hard delete (no orders)',
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });
    
    res.json({ message: 'Клиент удален', deleted: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Ошибка удаления клиента' });
  } finally {
    client.release();
  }
});

// Получить историю заказов клиента
router.get('/customers/:id/orders', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    // Verify customer exists
    const customerResult = await pool.query('SELECT id, full_name FROM users WHERE id = $1 AND role = $2', [req.params.id, 'customer']);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    
    // Get orders with items
    const ordersResult = await pool.query(`
      SELECT 
        o.id, o.order_number, o.status, o.total_amount, o.payment_method,
        o.customer_name, o.customer_phone, o.delivery_address, o.delivery_coordinates,
        o.delivery_date, o.delivery_time, o.comment, o.created_at, o.updated_at,
        r.name as restaurant_name, r.id as restaurant_id,
        u_operator.full_name as processed_by_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.id,
              'product_id', oi.product_id,
              'product_name', oi.product_name,
              'quantity', oi.quantity,
              'unit', oi.unit,
              'price', oi.price,
              'total', oi.quantity * oi.price
            )
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'
        ) as items
      FROM orders o
      LEFT JOIN restaurants r ON o.restaurant_id = r.id
      LEFT JOIN users u_operator ON o.processed_by = u_operator.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = $1
      GROUP BY o.id, r.name, r.id, u_operator.full_name
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.params.id, limit, offset]);
    
    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) FROM orders WHERE user_id = $1', [req.params.id]);
    
    res.json({
      customer: customerResult.rows[0],
      orders: ordersResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get customer orders error:', error);
    res.status(500).json({ error: 'Ошибка получения заказов клиента' });
  }
});

// =====================================================
// ЛОГИ АКТИВНОСТИ
// =====================================================

// Получить логи
router.get('/logs', async (req, res) => {
  try {
    const { 
      restaurant_id, 
      user_id, 
      action_type, 
      entity_type,
      start_date,
      end_date,
      page = 1, 
      limit = 50 
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    const logs = await getActivityLogs({
      restaurantId: restaurant_id,
      userId: user_id,
      actionType: action_type,
      entityType: entity_type,
      startDate: start_date,
      endDate: end_date,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json({
      logs,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ error: 'Ошибка получения логов' });
  }
});

// Получить статистику логов
router.get('/logs/stats', async (req, res) => {
  try {
    const { restaurant_id, days = 7 } = req.query;
    const stats = await getActivityStats(restaurant_id, parseInt(days));
    res.json(stats);
  } catch (error) {
    console.error('Get logs stats error:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// =====================================================
// СТАТИСТИКА
// =====================================================

// Общая статистика для супер-админа
router.get('/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM restaurants WHERE is_active = true) as restaurants_count,
        (SELECT COUNT(*) FROM users WHERE role = 'operator' AND is_active = true) as operators_count,
        (SELECT COUNT(*) FROM users WHERE role = 'customer') as customers_count,
        (SELECT COUNT(*) FROM orders WHERE status = 'new') as new_orders_count,
        (SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURRENT_DATE) as today_orders_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE DATE(created_at) = CURRENT_DATE) as today_revenue
    `);
    
    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

module.exports = router;

