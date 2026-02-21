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
const { reloadBot } = require('../bot/bot');
const { reloadMultiBots } = require('../bot/multiBotManager');

// All routes require superadmin authentication
router.use(authenticate);
router.use(requireSuperAdmin);

const { sendBalanceNotification } = require('../bot/notifications');

const MAX_CATEGORY_LEVEL = 3;
const CATEGORY_CHAIN_GUARD_LIMIT = 50;

const normalizeCategoryId = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const getCategoryLevelById = async (client, categoryId, disallowId = null) => {
  let level = 0;
  let currentId = normalizeCategoryId(categoryId);
  const visited = new Set();
  const forbiddenId = normalizeCategoryId(disallowId);

  while (currentId) {
    if (visited.has(currentId)) {
      throw new Error('CATEGORY_CYCLE');
    }
    if (forbiddenId && currentId === forbiddenId) {
      throw new Error('CATEGORY_CYCLE');
    }
    visited.add(currentId);

    const result = await client.query(
      'SELECT id, parent_id FROM categories WHERE id = $1',
      [currentId]
    );

    if (result.rows.length === 0) {
      throw new Error('CATEGORY_NOT_FOUND');
    }

    level += 1;
    if (level > CATEGORY_CHAIN_GUARD_LIMIT) {
      throw new Error('CATEGORY_CHAIN_TOO_DEEP');
    }

    currentId = normalizeCategoryId(result.rows[0].parent_id);
  }

  return level;
};

const getCategorySubtreeDepth = async (client, categoryId) => {
  const result = await client.query(`
    WITH RECURSIVE category_tree AS (
      SELECT id, parent_id, 1 AS depth
      FROM categories
      WHERE id = $1

      UNION ALL

      SELECT c.id, c.parent_id, ct.depth + 1
      FROM categories c
      INNER JOIN category_tree ct ON c.parent_id = ct.id
      WHERE ct.depth < $2
    )
    SELECT COALESCE(MAX(depth), 1)::int AS max_depth
    FROM category_tree
  `, [categoryId, CATEGORY_CHAIN_GUARD_LIMIT]);

  return result.rows[0]?.max_depth || 1;
};


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

// =====================================================
// БИЛЛИНГ И БАЛАНС (СУПЕРАДМИН)
// =====================================================

// Получить глобальные настройки биллинга (реквизиты)
router.get('/billing-settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM billing_settings WHERE id = 1');
    res.json(result.rows[0] || {});
  } catch (error) {
    console.error('Get billing settings error:', error);
    res.status(500).json({ error: 'Ошибка получения настроек биллинга' });
  }
});

// Обновить глобальные настройки биллинга
router.put('/billing-settings', async (req, res) => {
  try {
    const {
      card_number, card_holder, phone_number, telegram_username,
      click_link, payme_link,
      default_starting_balance, default_order_cost,
      superadmin_bot_token
    } = req.body;

    const result = await pool.query(`
      UPDATE billing_settings 
      SET card_number = $1, card_holder = $2, phone_number = $3, 
          telegram_username = $4, click_link = $5, payme_link = $6,
          default_starting_balance = $7, default_order_cost = $8,
          superadmin_bot_token = $9,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
      RETURNING *
    `, [
      card_number, card_holder, phone_number, telegram_username,
      click_link, payme_link,
      parseFloat(default_starting_balance) || 100000,
      parseFloat(default_order_cost) || 1000,
      superadmin_bot_token ? String(superadmin_bot_token).trim() : null
    ]);

    try {
      await reloadBot();
    } catch (reloadErr) {
      console.error('Bot reload warning after settings update:', reloadErr.message);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update billing settings error:', error);
    res.status(500).json({ error: 'Ошибка обновления настроек биллинга' });
  }
});

// Пополнить баланс ресторана вручную
router.post('/restaurants/:id/topup', async (req, res) => {
  const client = await pool.connect();
  try {
    const { amount, description } = req.body;
    const restaurantId = req.params.id;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Некорректная сумма пополнения' });
    }

    await client.query('BEGIN');

    // Update restaurant balance
    const updatedRest = await client.query(`
      UPDATE restaurants 
      SET balance = balance + $1 
      WHERE id = $2 
      RETURNING id, name, balance
    `, [amount, restaurantId]);

    if (updatedRest.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    // Record transaction
    await client.query(`
      INSERT INTO billing_transactions (restaurant_id, user_id, amount, type, description)
      VALUES ($1, $2, $3, $4, $5)
    `, [restaurantId, req.user.id, amount, 'deposit', description || 'Ручное пополнение суперадмином']);

    await client.query('COMMIT');

    // Notify all operators of this restaurant in Telegram
    try {
      const operators = await pool.query(`
        SELECT u.telegram_id, u.full_name 
        FROM users u
        INNER JOIN operator_restaurants opr ON u.id = opr.user_id
        WHERE opr.restaurant_id = $1 AND u.telegram_id IS NOT NULL
      `, [restaurantId]);

      for (const op of operators.rows) {
        await sendBalanceNotification(op.telegram_id, amount, updatedRest.rows[0].balance);
      }
    } catch (notifErr) {
      console.error('Notification error on topup:', notifErr.message);
    }

    res.json(updatedRest.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Restaurant topup error:', error);
    res.status(500).json({ error: 'Ошибка пополнения баланса' });
  } finally {
    client.release();
  }
});

// Изменить статус бесплатного тарифа
router.patch('/restaurants/:id/free-tier', async (req, res) => {
  try {
    const { is_free_tier } = req.body;
    const result = await pool.query(
      'UPDATE restaurants SET is_free_tier = $1 WHERE id = $2 RETURNING id, is_free_tier',
      [is_free_tier, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Free tier toggle error:', error);
    res.status(500).json({ error: 'Ошибка изменения тарифа' });
  }
});

// Переключить статус "Бесплатный тариф"
router.post('/restaurants/:id/toggle-free', async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE restaurants 
      SET is_free_tier = NOT is_free_tier 
      WHERE id = $1 
      RETURNING id, is_free_tier
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Toggle free tier error:', error);
    res.status(500).json({ error: 'Ошибка изменения тарифа' });
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
    const { name, address, phone, logo_url, delivery_zone, telegram_bot_token, telegram_group_id, operator_registration_code, start_time, end_time, click_url, payme_url, is_delivery_enabled } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Название ресторана обязательно' });
    }

    console.log('📍 Creating restaurant with delivery_zone:', delivery_zone);

    // Get default billing settings
    const settingsResult = await pool.query('SELECT default_starting_balance, default_order_cost FROM billing_settings WHERE id = 1');
    const settings = settingsResult.rows[0] || { default_starting_balance: 100000, default_order_cost: 1000 };

    const result = await pool.query(`
      INSERT INTO restaurants (
        name, address, phone, logo_url, delivery_zone, 
        telegram_bot_token, telegram_group_id, operator_registration_code, start_time, end_time, 
        click_url, payme_url, is_delivery_enabled, service_fee,
        balance, order_cost
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
      name,
      address,
      phone,
      logo_url,
      delivery_zone ? JSON.stringify(delivery_zone) : null,
      telegram_bot_token,
      telegram_group_id,
      operator_registration_code || null,
      start_time,
      end_time,
      click_url || null,
      payme_url || null,
      is_delivery_enabled !== undefined ? is_delivery_enabled : true,
      parseFloat(req.body.service_fee) || 0,
      settings.default_starting_balance,
      req.body.service_fee !== undefined ? parseFloat(req.body.service_fee) : settings.default_order_cost
    ]);


    const restaurant = result.rows[0];

    try {
      await reloadMultiBots();
    } catch (reloadErr) {
      console.error('Multi-bot reload warning after restaurant create:', reloadErr.message);
    }

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
    const { name, address, phone, logo_url, delivery_zone, telegram_bot_token, telegram_group_id, operator_registration_code, is_active, start_time, end_time, click_url, payme_url, support_username, service_fee, latitude, longitude, delivery_base_radius, delivery_base_price, delivery_price_per_km, is_delivery_enabled } = req.body;

    // Get old values for logging
    const oldResult = await pool.query('SELECT * FROM restaurants WHERE id = $1', [req.params.id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }
    const oldValues = oldResult.rows[0];

    console.log('📍 Updating restaurant with delivery_zone:', delivery_zone);

    // Check if service_fee column exists, if not - create it
    const hasServiceFee = oldValues.hasOwnProperty('service_fee');
    if (!hasServiceFee) {
      try {
        await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS service_fee DECIMAL(10, 2) DEFAULT 0');
        console.log('✅ Added service_fee column to restaurants');
      } catch (e) {
        console.log('ℹ️ service_fee column:', e.message);
      }
    }

    // Check if latitude/longitude columns exist
    const hasCoords = oldValues.hasOwnProperty('latitude');
    if (!hasCoords) {
      try {
        await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8)');
        await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8)');
        console.log('✅ Added latitude/longitude columns to restaurants');
      } catch (e) {
        console.log('ℹ️ latitude/longitude columns:', e.message);
      }
    }

    // Check if delivery settings columns exist
    const hasDeliverySettings = oldValues.hasOwnProperty('delivery_base_radius');
    if (!hasDeliverySettings) {
      try {
        await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS delivery_base_radius DECIMAL(5, 2) DEFAULT 2');
        await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS delivery_base_price DECIMAL(10, 2) DEFAULT 5000');
        await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS delivery_price_per_km DECIMAL(10, 2) DEFAULT 2000');
        console.log('✅ Added delivery settings columns to restaurants');
      } catch (e) {
        console.log('ℹ️ delivery settings columns:', e.message);
      }
    }

    // Check if delivery flag exists
    const hasDeliveryFlag = oldValues.hasOwnProperty('is_delivery_enabled');
    if (!hasDeliveryFlag) {
      try {
        await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS is_delivery_enabled BOOLEAN DEFAULT true');
        console.log('✅ Added is_delivery_enabled column to restaurants');
      } catch (e) {
        console.log('ℹ️ is_delivery_enabled column:', e.message);
      }
    }

    // Now update with all fields including coordinates and delivery settings
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
          click_url = $11,
          payme_url = $12,
          support_username = $13,
          operator_registration_code = $14,
          service_fee = $15,
          latitude = $16,
          longitude = $17,
          delivery_base_radius = $18,
          delivery_base_price = $19,
          delivery_price_per_km = $20,
          is_delivery_enabled = $21,
          order_cost = $22,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $23
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
      click_url || null,
      payme_url || null,
      support_username || null,
      operator_registration_code || null,
      parseFloat(service_fee) || 0,
      latitude ? parseFloat(latitude) : null,
      longitude ? parseFloat(longitude) : null,
      parseFloat(delivery_base_radius) || 0,
      parseFloat(delivery_base_price) || 0,
      parseFloat(delivery_price_per_km) || 0,
      is_delivery_enabled !== undefined ? is_delivery_enabled : true,
      parseFloat(service_fee) || 0,
      req.params.id
    ]);

    const restaurant = result.rows[0];

    try {
      await reloadMultiBots();
    } catch (reloadErr) {
      console.error('Multi-bot reload warning after restaurant update:', reloadErr.message);
    }

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

// Получить шаблоны сообщений ресторана
router.get('/restaurants/:id/messages', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, msg_new, msg_preparing, msg_delivering, msg_delivered, msg_cancelled 
       FROM restaurants WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get restaurant messages error:', error);
    res.status(500).json({ error: 'Ошибка получения шаблонов' });
  }
});

// Обновить шаблоны сообщений ресторана
router.put('/restaurants/:id/messages', async (req, res) => {
  try {
    const { msg_new, msg_preparing, msg_delivering, msg_delivered, msg_cancelled } = req.body;

    const result = await pool.query(`
      UPDATE restaurants 
      SET msg_new = $1,
          msg_preparing = $2,
          msg_delivering = $3,
          msg_delivered = $4,
          msg_cancelled = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING id, name, msg_new, msg_preparing, msg_delivering, msg_delivered, msg_cancelled
    `, [
      msg_new || null,
      msg_preparing || null,
      msg_delivering || null,
      msg_delivered || null,
      msg_cancelled || null,
      req.params.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: parseInt(req.params.id),
      actionType: ACTION_TYPES.UPDATE_RESTAURANT,
      entityType: ENTITY_TYPES.RESTAURANT,
      entityId: parseInt(req.params.id),
      entityName: result.rows[0].name,
      newValues: { msg_new, msg_preparing, msg_delivering, msg_delivered, msg_cancelled },
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update restaurant messages error:', error);
    res.status(500).json({ error: 'Ошибка обновления шаблонов' });
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

      try {
        await reloadMultiBots();
      } catch (reloadErr) {
        console.error('Multi-bot reload warning after restaurant deactivate:', reloadErr.message);
      }

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

    try {
      await reloadMultiBots();
    } catch (reloadErr) {
      console.error('Multi-bot reload warning after restaurant delete:', reloadErr.message);
    }

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
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 50, 1);
    const offset = (page - 1) * limit;
    const { role = '', status = '', search = '', restaurant_id = '' } = req.query;

    const whereClauses = [`u.role IN ('operator', 'superadmin')`];
    const params = [];

    if (role === 'operator' || role === 'superadmin') {
      params.push(role);
      whereClauses.push(`u.role = $${params.length}`);
    }

    if (status === 'active') {
      whereClauses.push('u.is_active = true');
    } else if (status === 'inactive') {
      whereClauses.push('u.is_active = false');
    }

    if (restaurant_id) {
      params.push(restaurant_id);
      whereClauses.push(`EXISTS (
        SELECT 1 FROM operator_restaurants opr_filter
        WHERE opr_filter.user_id = u.id AND opr_filter.restaurant_id = $${params.length}
      )`);
    }

    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(`(
        u.full_name ILIKE $${params.length}
        OR u.phone ILIKE $${params.length}
        OR u.username ILIKE $${params.length}
      )`);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT 
        u.id, u.username, u.full_name, u.phone, u.role, u.is_active, u.created_at,
        u.active_restaurant_id, u.telegram_id,
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
      ${whereSql}
      GROUP BY u.id, ar.name
      ORDER BY u.created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM users u
      ${whereSql}
    `, params);

    res.json({
      operators: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
      page,
      limit
    });
  } catch (error) {
    console.error('Get operators error:', error);
    res.status(500).json({ error: 'Ошибка получения операторов' });
  }
});

// =====================================================
// КАТЕГОРИИ
// =====================================================

// Получить все категории
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.*,
        (SELECT COUNT(*)::int FROM products p WHERE p.category_id = c.id) AS products_count,
        (SELECT COUNT(*)::int FROM categories sc WHERE sc.parent_id = c.id) AS subcategories_count
      FROM categories c
      ORDER BY c.sort_order, c.name_ru
    `);
    res.json(result.rows || []);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Ошибка получения категорий' });
  }
});

// Создать категорию
router.post('/categories', async (req, res) => {
  try {
    const { name_ru, name_uz, image_url, sort_order, parent_id, restaurant_id } = req.body;
    const normalizedParentId = normalizeCategoryId(parent_id);
    const normalizedRestaurantId = normalizeCategoryId(restaurant_id);

    if (normalizedParentId) {
      let parentLevel = 0;
      try {
        parentLevel = await getCategoryLevelById(pool, normalizedParentId);
      } catch (e) {
        if (e.message === 'CATEGORY_NOT_FOUND') {
          return res.status(400).json({ error: 'Родительская категория не найдена' });
        }
        if (e.message === 'CATEGORY_CYCLE') {
          return res.status(400).json({ error: 'Обнаружена циклическая связь категорий' });
        }
        if (e.message === 'CATEGORY_CHAIN_TOO_DEEP') {
          return res.status(400).json({ error: 'Обнаружена некорректная цепочка категорий' });
        }
        throw e;
      }

      if (parentLevel + 1 > MAX_CATEGORY_LEVEL) {
        return res.status(400).json({ error: `Максимальная вложенность категорий: ${MAX_CATEGORY_LEVEL} уровня` });
      }
    }

    const result = await pool.query(`
      INSERT INTO categories (name_ru, name_uz, image_url, sort_order, parent_id, restaurant_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name_ru, name_uz, image_url, sort_order || 0, normalizedParentId, normalizedRestaurantId]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Ошибка создания категории' });
  }
});

// Обновить категорию
router.put('/categories/:id', async (req, res) => {
  try {
    const { name_ru, name_uz, image_url, sort_order, parent_id, restaurant_id } = req.body;
    const normalizedParentId = normalizeCategoryId(parent_id);
    const normalizedRestaurantId = normalizeCategoryId(restaurant_id);
    const categoryId = Number.parseInt(req.params.id, 10);

    // Get old values
    const oldResult = await pool.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    const oldCategory = oldResult.rows[0];

    if (normalizedParentId && normalizedParentId === categoryId) {
      return res.status(400).json({ error: 'Категория не может быть родителем самой себя' });
    }

    let parentLevel = 0;
    if (normalizedParentId) {
      try {
        parentLevel = await getCategoryLevelById(pool, normalizedParentId, categoryId);
      } catch (e) {
        if (e.message === 'CATEGORY_NOT_FOUND') {
          return res.status(400).json({ error: 'Родительская категория не найдена' });
        }
        if (e.message === 'CATEGORY_CYCLE') {
          return res.status(400).json({ error: 'Нельзя переместить категорию в свою подкатегорию' });
        }
        if (e.message === 'CATEGORY_CHAIN_TOO_DEEP') {
          return res.status(400).json({ error: 'Обнаружена некорректная цепочка категорий' });
        }
        throw e;
      }
    }

    const subtreeDepth = await getCategorySubtreeDepth(pool, categoryId);
    const resultingMaxLevel = parentLevel + subtreeDepth;
    if (resultingMaxLevel > MAX_CATEGORY_LEVEL) {
      return res.status(400).json({ error: `Максимальная вложенность категорий: ${MAX_CATEGORY_LEVEL} уровня` });
    }

    const result = await pool.query(`
      UPDATE categories SET
        name_ru = $1, name_uz = $2, image_url = $3, sort_order = $4, 
        parent_id = $5, restaurant_id = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `, [name_ru, name_uz, image_url, sort_order || 0, normalizedParentId, normalizedRestaurantId, req.params.id]);

    const category = result.rows[0];

    // Log activity
    await logActivity({
      userId: req.user.id,
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
    // Get category
    const categoryResult = await pool.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    const category = categoryResult.rows[0];

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

    // Check for subcategories
    const subcatsCheck = await pool.query(
      'SELECT COUNT(*) as count FROM categories WHERE parent_id = $1',
      [req.params.id]
    );

    if (parseInt(subcatsCheck.rows[0].count) > 0) {
      return res.status(400).json({
        error: 'Нельзя удалить категорию, у которой есть подкатегории. Сначала удалите подкатегории.'
      });
    }

    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);

    // Log activity
    await logActivity({
      userId: req.user.id,
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


// Создать оператора
router.post('/operators', async (req, res) => {
  const client = await pool.connect();
  try {
    const { username, password, full_name, phone, telegram_id, restaurant_ids } = req.body;

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
      INSERT INTO users (username, password, full_name, phone, role, is_active, telegram_id)
      VALUES ($1, $2, $3, $4, 'operator', true, $5)
      RETURNING id, username, full_name, phone, role, is_active, created_at, telegram_id
    `, [username, hashedPassword, full_name, phone, telegram_id || null]);

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
    const { full_name, phone, password, is_active, telegram_id, restaurant_ids } = req.body;

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
        telegram_id = $4,
        updated_at = CURRENT_TIMESTAMP
    `;
    let params = [full_name, phone, is_active, telegram_id || null];

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
    const { page = 1, limit = 50, search = '', status = '', restaurant_id = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        u.id as user_id, u.id as association_id, u.username, u.full_name, u.phone, u.telegram_id,
        u.active_restaurant_id as restaurant_id,
        u.is_active as user_is_active, COALESCE(ur.is_blocked, false) as is_blocked, u.created_at,
        r.name as restaurant_name,
        COUNT(o.id) as orders_count,
        COALESCE(SUM(o.total_amount), 0) as total_spent,
        MAX(o.created_at) as last_order_date
      FROM users u
      LEFT JOIN restaurants r ON u.active_restaurant_id = r.id
      LEFT JOIN user_restaurants ur ON ur.user_id = u.id AND ur.restaurant_id = u.active_restaurant_id
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE u.role = 'customer'
    `;

    const params = [];
    if (search) {
      query += ` AND (u.full_name ILIKE $${params.length + 1} OR u.phone ILIKE $${params.length + 1} OR u.username ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    if (restaurant_id) {
      query += ` AND u.active_restaurant_id = $${params.length + 1}`;
      params.push(restaurant_id);
    }

    if (status === 'active') {
      query += ` AND u.is_active = true`;
    } else if (status === 'blocked') {
      query += ` AND (u.is_active = false OR COALESCE(ur.is_blocked, false) = true)`;
    }

    query += ` GROUP BY u.id, u.active_restaurant_id, r.name, ur.is_blocked ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM users WHERE role = $1';
    const countParams = ['customer'];
    if (search) {
      countQuery += ` AND (full_name ILIKE $2 OR phone ILIKE $2 OR username ILIKE $2)`;
      countParams.push(`%${search}%`);
    }
    if (restaurant_id) {
      countQuery += ` AND active_restaurant_id = $${countParams.length + 1}`;
      countParams.push(restaurant_id);
    }
    if (status === 'active') {
      countQuery += ` AND is_active = true`;
    } else if (status === 'blocked') {
      countQuery += ` AND (
        is_active = false OR EXISTS (
          SELECT 1 FROM user_restaurants ur
          WHERE ur.user_id = users.id AND ur.is_blocked = true
        )
      )`;
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

    const result = await getActivityLogs({
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
      logs: result.logs,
      total: result.total,
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

// =====================================================
// БИЛЛИНГ (НАСТРОЙКИ)
// =====================================================

// Получить глобальные настройки биллинга
router.get('/billing/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM billing_settings WHERE id = 1');
    res.json(result.rows[0] || {});
  } catch (error) {
    console.error('Get billing settings error:', error);
    res.status(500).json({ error: 'Ошибка получения настроек' });
  }
});

// Обновить глобальные настройки биллинга
router.put('/billing/settings', async (req, res) => {
  try {
    const {
      card_number, card_holder, phone_number, telegram_username,
      click_link, payme_link, default_starting_balance, default_order_cost,
      superadmin_bot_token
    } = req.body;

    const result = await pool.query(`
      UPDATE billing_settings
      SET card_number = $1, card_holder = $2, phone_number = $3, 
          telegram_username = $4, click_link = $5, payme_link = $6, 
          default_starting_balance = $7, default_order_cost = $8,
          superadmin_bot_token = $9,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
      RETURNING *
    `, [
      card_number, card_holder, phone_number, telegram_username,
      click_link, payme_link, default_starting_balance, default_order_cost,
      superadmin_bot_token ? String(superadmin_bot_token).trim() : null
    ]);

    try {
      await reloadBot();
    } catch (reloadErr) {
      console.error('Bot reload warning after settings update:', reloadErr.message);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update billing settings error:', error);
    res.status(500).json({ error: 'Ошибка сохранения настроек' });
  }
});

module.exports = router;

