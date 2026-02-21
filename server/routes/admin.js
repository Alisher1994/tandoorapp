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
const { reloadMultiBots } = require('../bot/multiBotManager');

const router = express.Router();
const normalizeOrderStatus = (status) => status === 'in_progress' ? 'preparing' : status;
const normalizeCategoryName = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const findAdminCategoryNameConflict = async ({
  parentId = null,
  restaurantId,
  nameRu,
  nameUz,
  excludeId = null
}) => {
  const siblings = await pool.query(
    `SELECT id, name_ru, name_uz
     FROM categories
     WHERE restaurant_id = $1
       AND parent_id IS NOT DISTINCT FROM $2
       AND ($3::int IS NULL OR id <> $3)`,
    [restaurantId, parentId, excludeId]
  );

  const targetRu = normalizeCategoryName(nameRu).toLowerCase();
  const targetUz = normalizeCategoryName(nameUz).toLowerCase();

  for (const sibling of siblings.rows) {
    const siblingRu = normalizeCategoryName(sibling.name_ru).toLowerCase();
    const siblingUz = normalizeCategoryName(sibling.name_uz).toLowerCase();

    if (targetRu && siblingRu === targetRu) {
      return { field: 'name_ru', existingId: sibling.id };
    }
    if (targetUz && siblingUz && siblingUz === targetUz) {
      return { field: 'name_uz', existingId: sibling.id };
    }
  }

  return null;
};

const validateProductCategorySelection = async ({ categoryId, restaurantId }) => {
  if (!categoryId) {
    return { ok: true, category: null };
  }

  const categoryCheck = await pool.query(
    `SELECT id, parent_id
     FROM categories
     WHERE id = $1
       AND (restaurant_id = $2 OR restaurant_id IS NULL)`,
    [categoryId, restaurantId]
  );

  if (categoryCheck.rows.length === 0) {
    return { ok: false, error: 'Категория не найдена для текущего ресторана' };
  }

  if (categoryCheck.rows[0].parent_id === null) {
    return { ok: false, error: 'Товар нельзя добавлять в категорию 1-го уровня. Выберите подкатегорию.' };
  }

  return { ok: true, category: categoryCheck.rows[0] };
};

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
    restaurants: req.user.restaurants || [],
    balance: req.user.balance
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
             r.balance as restaurant_balance,
             r.order_cost as restaurant_order_cost,
             r.is_free_tier as restaurant_is_free_tier,
             pb.full_name as processed_by_name,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', oi.id,
                    'product_name', oi.product_name,
                    'quantity', oi.quantity,
                    'unit', oi.unit,
                    'price', oi.price,
                    'total', oi.total,
                    'image_url', p.image_url
                  )
                ) FILTER (WHERE oi.id IS NOT NULL),
                '[]'
              ) as items
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN users pb ON o.processed_by = pb.id
      LEFT JOIN restaurants r ON o.restaurant_id = r.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
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
      const normalizedStatus = normalizeOrderStatus(status);
      if (normalizedStatus === 'preparing') {
        query += ` AND (o.status = $${paramCount} OR o.status = $${paramCount + 1})`;
        params.push('preparing', 'in_progress');
        paramCount += 2;
      } else {
        query += ` AND o.status = $${paramCount}`;
        params.push(normalizedStatus);
        paramCount++;
      }
    }

    query += ' GROUP BY o.id, u.username, u.full_name, u.telegram_id, r.name, r.balance, r.order_cost, r.is_free_tier, pb.full_name ORDER BY o.created_at DESC';

    const result = await pool.query(query, params);

    // Mask sensitive data only for NEW orders when restaurant balance is insufficient.
    // Processed orders must always show full customer data.
    const processedRows = result.rows.map(order => {
      const normalizedStatus = normalizeOrderStatus(order.status);
      const isProcessedOrder = normalizedStatus && normalizedStatus !== 'new';
      const isFreeTier = Boolean(order.restaurant_is_free_tier);
      const restaurantBalance = parseFloat(order.restaurant_balance || 0);
      const orderCost = parseFloat(order.restaurant_order_cost || 1000);
      const canViewNewOrderSensitiveData = isFreeTier || order.is_paid || restaurantBalance >= orderCost;

      if (isProcessedOrder || canViewNewOrderSensitiveData) {
        return {
          ...order,
          status: normalizedStatus
        };
      }

      // Mask sensitive fields
      return {
        ...order,
        status: normalizedStatus,
        customer_phone: order.customer_phone ? order.customer_phone.substring(0, 4) + '***' + order.customer_phone.slice(-2) : '***',
        delivery_address: 'Засекречено (требуется оплата)',
        delivery_coordinates: null,
        // customer_name stays visible as per common practice, or semi-masked if needed
        customer_name: order.customer_name ? order.customer_name.charAt(0) + '***' : '***'
      };
    });

    res.json(processedRows);
  } catch (error) {
    console.error('Admin orders error:', error);
    res.status(500).json({ error: 'Ошибка получения заказов' });
  }
});


// Принять заказ и списать баланс
router.post('/orders/:id/accept-and-pay', async (req, res) => {
  const client = await pool.connect();
  try {
    const orderId = req.params.id;
    const restaurantId = req.user.active_restaurant_id;

    await client.query('BEGIN');

    // 1. Get order and restaurant info
    const orderResult = await client.query(`
      SELECT o.id, o.restaurant_id, o.is_paid, r.balance, r.is_free_tier, r.order_cost
      FROM orders o
      JOIN restaurants r ON o.restaurant_id = r.id
      WHERE o.id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    const order = orderResult.rows[0];

    // Check access
    if (req.user.role !== 'superadmin' && order.restaurant_id !== restaurantId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Нет доступа к этому заказу' });
    }

    if (order.is_paid) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Заказ уже оплачен' });
    }

    // 2. Billing logic
    const cost = order.is_free_tier ? 0 : (order.order_cost || 1000);

    if (!order.is_free_tier && order.balance < cost) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Недостаточно средств на балансе. Пополните счет.' });
    }

    // 3. Deduct balance and update order
    if (cost > 0) {
      await client.query(`
        UPDATE restaurants SET balance = balance - $1 WHERE id = $2
      `, [cost, order.restaurant_id]);

      // Record transaction
      await client.query(`
        INSERT INTO billing_transactions (restaurant_id, user_id, amount, type, description)
        VALUES ($1, $2, $3, $4, $5)
      `, [order.restaurant_id, req.user.id, -cost, 'withdrawal', `Списание за заказ #${orderId}`]);
    }

    const updatedOrder = await client.query(`
      UPDATE orders 
      SET is_paid = true, 
          paid_amount = $1, 
          status = 'preparing', 
          processed_by = $2, 
          processed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [cost, req.user.id, orderId]);

    await client.query('COMMIT');

    // Notify customer
    try {
      if (updatedOrder.rows[0].user_id) {
        // Need to fetch full order for notification
        const fullOrder = await pool.query('SELECT o.*, r.telegram_bot_token FROM orders o JOIN restaurants r ON o.restaurant_id = r.id WHERE o.id = $1', [orderId]);
        const { sendOrderUpdateToUser } = require('../bot/notifications');
        const userTelegram = await pool.query('SELECT telegram_id FROM users WHERE id = $1', [fullOrder.rows[0].user_id]);
        if (userTelegram.rows[0]?.telegram_id) {
          await sendOrderUpdateToUser(userTelegram.rows[0].telegram_id, fullOrder.rows[0], 'preparing', fullOrder.rows[0].telegram_bot_token);
        }
      }
    } catch (err) {
      console.error('Notify customer on accept error:', err);
    }

    res.json(updatedOrder.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Accept and pay error:', error);
    res.status(500).json({ error: 'Ошибка при принятии заказа' });
  } finally {
    client.release();
  }
});

// =====================================================
// НАСТРОЙКИ (ДЛЯ ОПЕРАТОРА)
// =====================================================

// Получить настройки текущего ресторана
router.get('/restaurant', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) return res.status(400).json({ error: 'Ресторан не выбран' });

    const result = await pool.query('SELECT * FROM restaurants WHERE id = $1', [restaurantId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Ресторан не найден' });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get restaurant settings error:', error);
    res.status(500).json({ error: 'Ошибка получения настроек ресторана' });
  }
});

// Обновить настройки текущего ресторана
router.put('/restaurant', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) return res.status(400).json({ error: 'Ресторан не выбран' });

    const {
      name, address, phone, logo_url, telegram_bot_token, telegram_group_id,
      operator_registration_code, start_time, end_time, click_url, payme_url, support_username,
      latitude, longitude, delivery_base_radius, delivery_base_price,
      delivery_price_per_km, is_delivery_enabled, delivery_zone,
      msg_new, msg_preparing, msg_delivering, msg_delivered, msg_cancelled
    } = req.body;

    // Fields that OPERATOR is NOT allowed to change:
    // service_fee, balance, order_cost, is_free_tier

    const result = await pool.query(`
      UPDATE restaurants 
      SET name = COALESCE($1, name),
          address = COALESCE($2, address),
          phone = COALESCE($3, phone),
          logo_url = $4,
          telegram_bot_token = COALESCE($5, telegram_bot_token),
          telegram_group_id = COALESCE($6, telegram_group_id),
          start_time = $7,
          end_time = $8,
          click_url = $9,
          payme_url = $10,
          support_username = $11,
          operator_registration_code = $12,
          latitude = $13,
          longitude = $14,
          delivery_base_radius = $15,
          delivery_base_price = $16,
          delivery_price_per_km = $17,
          is_delivery_enabled = $18,
          delivery_zone = $19,
          msg_new = $20,
          msg_preparing = $21,
          msg_delivering = $22,
          msg_delivered = $23,
          msg_cancelled = $24,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $25
      RETURNING *
    `, [
      name, address, phone, logo_url, telegram_bot_token, telegram_group_id,
      start_time, end_time, click_url, payme_url, support_username,
      operator_registration_code || null,
      latitude, longitude, delivery_base_radius, delivery_base_price,
      delivery_price_per_km, is_delivery_enabled,
      delivery_zone ? JSON.stringify(delivery_zone) : null,
      msg_new, msg_preparing, msg_delivering, msg_delivered, msg_cancelled,
      restaurantId
    ]);

    try {
      await reloadMultiBots();
    } catch (reloadErr) {
      console.error('Multi-bot reload warning after restaurant update:', reloadErr.message);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update restaurant settings error:', error);
    res.status(500).json({ error: 'Ошибка обновления настроек ресторана' });
  }
});

// Проверить работу бота (отправка тестовых сообщений)
router.post('/test-bot', async (req, res) => {
  try {
    const { botToken, groupId } = req.body;
    const telegramId = req.user.telegram_id;

    if (!botToken) {
      return res.status(400).json({ error: 'Token обязателен для проверки' });
    }

    const { getRestaurantBot } = require('../bot/notifications');
    const bot = getRestaurantBot(botToken);

    const results = [];
    const errors = [];

    // 1. Отправка в сам бот (пользователю)
    if (telegramId) {
      try {
        await bot.sendMessage(telegramId, '🤖 Бот запущен и работает!');
        results.push('✅ Сообщение "Бот запущен" отправлено вам в личные сообщения.');
      } catch (err) {
        errors.push(`❌ В личку: ${err.message}. Возможно, вы не начали диалог с ботом @${(await bot.getMe()).username}`);
      }
    } else {
      results.push('⚠️ Ваш Telegram ID не привязан к этому аккаунту! Чтобы получать уведомления в личку, добавьте свой ID в настройках вашего профиля.');
      results.push('💡 Вы можете узнать свой ID, отправив команду /id боту.');
    }

    // 2. Отправка в группу
    if (groupId) {
      try {
        await bot.sendMessage(groupId, '✅ Бот слушает группу и готов к работе!');
        results.push('✅ Сообщение "Бот слушает группу" отправлено в указанный чат.');
      } catch (err) {
        errors.push(`❌ В группу: ${err.message}. Проверьте Group ID и убедитесь, что бот добавлен в группу и является администратором.`);
      }
    } else {
      results.push('ℹ️ Group ID не указан, сообщение в группу не отправлено.');
    }

    res.json({
      success: errors.length === 0,
      message: errors.length === 0 ? 'Тестирование завершено успешно!' : 'Тестирование завершено с ошибками',
      details: results,
      errors: errors
    });
  } catch (error) {
    console.error('Test bot error:', error);
    res.status(500).json({ error: 'Критическая ошибка при тестировании: ' + error.message });
  }
});

// Получить список операторов текущего ресторана
router.get('/operators', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) return res.status(400).json({ error: 'Ресторан не выбран' });

    const result = await pool.query(`
      SELECT u.id, u.username, u.full_name, u.phone, u.role, u.is_active, u.telegram_id
      FROM users u
      JOIN operator_restaurants opr ON u.id = opr.user_id
      WHERE opr.restaurant_id = $1 AND u.role = 'operator'
      ORDER BY u.id
    `, [restaurantId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get operators error:', error);
    res.status(500).json({ error: 'Ошибка получения списка операторов' });
  }
});

// Добавить оператора к текущему ресторану (создать нового или привязать существующего)
router.post('/operators', async (req, res) => {
  const client = await pool.connect();
  try {
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) return res.status(400).json({ error: 'Ресторан не выбран' });

    const { username, password, full_name, phone, telegram_id } = req.body;

    if (!username) return res.status(400).json({ error: 'Username обязателен' });

    await client.query('BEGIN');

    // Check if user already exists
    let userResult = await client.query('SELECT * FROM users WHERE username = $1', [username]);
    let user;

    if (userResult.rows.length > 0) {
      user = userResult.rows[0];
      // Check if already operator of this restaurant
      const checkLink = await client.query(
        'SELECT 1 FROM operator_restaurants WHERE user_id = $1 AND restaurant_id = $2',
        [user.id, restaurantId]
      );
      if (checkLink.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Пользователь уже является оператором этого ресторана' });
      }
    } else {
      // Create new user
      if (!password) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Пароль обязателен для нового пользователя' });
      }
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUserResult = await client.query(`
        INSERT INTO users (username, password, full_name, phone, role, active_restaurant_id, telegram_id)
        VALUES ($1, $2, $3, $4, 'operator', $5, $6)
        RETURNING id, username, full_name, role, telegram_id
      `, [username, hashedPassword, full_name, phone, restaurantId, telegram_id || null]);
      user = newUserResult.rows[0];
    }

    // Link user to restaurant
    await client.query(`
      INSERT INTO operator_restaurants (user_id, restaurant_id)
      VALUES ($1, $2)
    `, [user.id, restaurantId]);

    await client.query('COMMIT');
    res.status(201).json(user);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add operator error:', error);
    res.status(500).json({ error: 'Ошибка добавления оператора' });
  } finally {
    client.release();
  }
});

// Удалить оператора из текущего ресторана (отвязать)
router.delete('/operators/:id', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    const operatorId = req.params.id;

    if (parseInt(operatorId) === req.user.id) {
      return res.status(400).json({ error: 'Нельзя удалить самого себя' });
    }

    const result = await pool.query(
      'DELETE FROM operator_restaurants WHERE user_id = $1 AND restaurant_id = $2',
      [operatorId, restaurantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Оператор не найден в этом ресторане' });
    }

    res.json({ message: 'Оператор удален из ресторана' });
  } catch (error) {
    console.error('Remove operator error:', error);
    res.status(500).json({ error: 'Ошибка удаления оператора' });
  }
});

// Обновить оператора текущего ресторана (изменение данных)
router.put('/operators/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const restaurantId = req.user.active_restaurant_id;
    const operatorId = req.params.id;
    const { username, password, full_name, phone, telegram_id } = req.body;

    await client.query('BEGIN');

    // Проверяем, привязан ли оператор к этому ресторану
    const checkLink = await client.query(
      'SELECT 1 FROM operator_restaurants WHERE user_id = $1 AND restaurant_id = $2',
      [operatorId, restaurantId]
    );

    if (checkLink.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Оператор не найден в этом ресторане' });
    }

    // Обновляем данные пользователя
    let query = 'UPDATE users SET username = $1, full_name = $2, phone = $3, telegram_id = $4';
    let params = [username, full_name, phone, telegram_id || null];
    let paramCount = 5;

    if (password) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);
      query += `, password = $${paramCount}`;
      params.push(hashedPassword);
      paramCount++;
    }

    query += ` WHERE id = $${paramCount} RETURNING id, username, full_name, phone, role, telegram_id`;
    params.push(operatorId);

    const result = await client.query(query, params);

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update operator error:', error);
    res.status(500).json({ error: 'Ошибка обновления оператора' });
  } finally {
    client.release();
  }
});

// =====================================================
// БИЛЛИНГ (ДЛЯ ОПЕРАТОРА)
// =====================================================

// Получить инфо о балансе и реквизиты
router.get('/billing/info', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) return res.status(400).json({ error: 'Ресторан не выбран' });

    const restResult = await pool.query('SELECT id, balance, is_free_tier, order_cost FROM restaurants WHERE id = $1', [restaurantId]);
    const settingsResult = await pool.query('SELECT card_number, card_holder, phone_number, telegram_username, click_link, payme_link FROM billing_settings WHERE id = 1');

    res.json({
      restaurant: restResult.rows[0],
      requisites: settingsResult.rows[0] || {}
    });
  } catch (error) {
    console.error('Get billing info error:', error);
    res.status(500).json({ error: 'Ошибка получения данных биллинга' });
  }
});

// Получить историю транзакций (Поступления и Списания)
router.get('/billing/history', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    const { type } = req.query; // 'deposit' or 'withdrawal'

    let query = 'SELECT * FROM billing_transactions WHERE restaurant_id = $1';
    const params = [restaurantId];

    if (type) {
      query += ' AND type = $2';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get billing history error:', error);
    res.status(500).json({ error: 'Ошибка получения истории транзакций' });
  }
});
// Обновить статус заказа
router.patch('/orders/:id/status', async (req, res) => {
  const client = await pool.connect();

  try {
    const { status, comment, cancel_reason } = req.body;
    const normalizedStatus = normalizeOrderStatus(status);

    if (!normalizedStatus) {
      return res.status(400).json({ error: 'Статус обязателен' });
    }

    await client.query('BEGIN');

    // Get order and check access
    const orderCheck = await client.query(
      'SELECT o.*, r.is_free_tier FROM orders o JOIN restaurants r ON o.restaurant_id = r.id WHERE o.id = $1',
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

    // Check if order is paid (except for cancelled orders)
    if (normalizedStatus !== 'cancelled' && !oldOrder.is_paid && !oldOrder.is_free_tier) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Заказ еще не оплачен (примите его)' });
    }

    const oldOrderStatus = normalizeOrderStatus(oldOrder.status);

    // Update order with cancel_reason and cancelled_at_status if cancelling
    let updateQuery;
    let updateParams;

    if (normalizedStatus === 'cancelled' && cancel_reason) {
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
      updateParams = [normalizedStatus, req.user.id, req.params.id, cancel_reason, oldOrderStatus];
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
      updateParams = [normalizedStatus, req.user.id, req.params.id];
    }


    const orderResult = await client.query(updateQuery, updateParams);
    const order = orderResult.rows[0];

    // Add status history with cancel reason
    const historyComment = cancel_reason || comment || null;
    await client.query(
      'INSERT INTO order_status_history (order_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
      [order.id, normalizedStatus, req.user.id, historyComment]
    );

    await client.query('COMMIT');

    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: order.restaurant_id,
      actionType: normalizedStatus === 'cancelled' ? ACTION_TYPES.CANCEL_ORDER : ACTION_TYPES.UPDATE_ORDER_STATUS,
      entityType: ENTITY_TYPES.ORDER,
      entityId: order.id,
      entityName: `Заказ #${order.order_number} `,
      oldValues: { status: oldOrderStatus },
      newValues: { status: normalizedStatus },
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
        normalizedStatus,
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
        `INSERT INTO order_items(order_id, product_id, product_name, quantity, unit, price, total)
VALUES($1, $2, $3, $4, $5, $6, $7)`,
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
      entityName: `Заказ #${order.order_number} `,
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
      SELECT p.*, c.name_ru as category_name,
  cnt.name as container_name, cnt.price as container_price
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      LEFT JOIN containers cnt ON p.container_id = cnt.id
      WHERE 1 = 1
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
      image_url, price, unit, barcode, in_stock, sort_order, container_id
    } = req.body;

    const restaurantId = req.user.active_restaurant_id;

    if (!restaurantId) {
      return res.status(400).json({ error: 'Выберите ресторан' });
    }

    if (!name_ru || !price) {
      return res.status(400).json({ error: 'Название и цена обязательны' });
    }

    const categoryValidation = await validateProductCategorySelection({
      categoryId: category_id,
      restaurantId
    });
    if (!categoryValidation.ok) {
      return res.status(400).json({ error: categoryValidation.error });
    }

    const result = await pool.query(`
      INSERT INTO products(
    restaurant_id, category_id, name_ru, name_uz, description_ru, description_uz,
    image_url, price, unit, barcode, in_stock, sort_order, container_id
  ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING *
  `, [
      restaurantId, category_id, name_ru, name_uz, description_ru, description_uz,
      image_url, price, unit || 'шт', barcode, in_stock !== false, sort_order || 0, container_id || null
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

    const categoryValidation = await validateProductCategorySelection({
      categoryId: category_id,
      restaurantId
    });
    if (!categoryValidation.ok) {
      return res.status(400).json({ error: categoryValidation.error });
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
        updateFields.push(`name_uz = $${paramIndex} `);
        updateValues.push(name_uz);
        paramIndex++;
      }
      if (category_id) {
        updateFields.push(`category_id = $${paramIndex} `);
        updateValues.push(category_id);
        paramIndex++;
      }
      if (description_ru) {
        updateFields.push(`description_ru = $${paramIndex} `);
        updateValues.push(description_ru);
        paramIndex++;
      }
      if (description_uz) {
        updateFields.push(`description_uz = $${paramIndex} `);
        updateValues.push(description_uz);
        paramIndex++;
      }
      if (image_url) {
        updateFields.push(`image_url = $${paramIndex} `);
        updateValues.push(image_url);
        paramIndex++;
      }
      if (barcode) {
        updateFields.push(`barcode = $${paramIndex} `);
        updateValues.push(barcode);
        paramIndex++;
      }

      updateFields.push(`in_stock = $${paramIndex} `);
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
        INSERT INTO products(
    restaurant_id, category_id, name_ru, name_uz, description_ru, description_uz,
    image_url, price, unit, barcode, in_stock, sort_order
  ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
      image_url, price, unit, barcode, in_stock, sort_order, container_id
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

    const categoryValidation = await validateProductCategorySelection({
      categoryId: category_id,
      restaurantId: oldProduct.restaurant_id
    });
    if (!categoryValidation.ok) {
      return res.status(400).json({ error: categoryValidation.error });
    }

    const result = await pool.query(`
      UPDATE products SET
category_id = $1, name_ru = $2, name_uz = $3, description_ru = $4, description_uz = $5,
  image_url = $6, price = $7, unit = $8, barcode = $9, in_stock = $10, sort_order = $11,
  container_id = $12, updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
RETURNING *
  `, [
      category_id, name_ru, name_uz, description_ru, description_uz,
      image_url, price, unit, barcode, in_stock !== false, sort_order || 0, container_id || null, req.params.id
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
// ПОСУДА / ТАРА (Containers)
// =====================================================

// Получить список посуды
router.get('/containers', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;

    if (!restaurantId) {
      return res.status(400).json({ error: 'Выберите ресторан' });
    }

    const result = await pool.query(
      `SELECT * FROM containers WHERE restaurant_id = $1 ORDER BY sort_order, name`,
      [restaurantId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get containers error:', error);
    res.status(500).json({ error: 'Ошибка получения посуды' });
  }
});

// Создать посуду
router.post('/containers', async (req, res) => {
  try {
    const { name, price, sort_order } = req.body;
    const restaurantId = req.user.active_restaurant_id;

    if (!restaurantId) {
      return res.status(400).json({ error: 'Выберите ресторан' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Название обязательно' });
    }

    const result = await pool.query(`
      INSERT INTO containers(restaurant_id, name, price, sort_order)
VALUES($1, $2, $3, $4)
RETURNING *
  `, [restaurantId, name, price || 0, sort_order || 0]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create container error:', error);
    res.status(500).json({ error: 'Ошибка создания посуды' });
  }
});

// Обновить посуду
router.put('/containers/:id', async (req, res) => {
  try {
    const { name, price, is_active, sort_order } = req.body;
    const restaurantId = req.user.active_restaurant_id;

    // Check access
    const checkResult = await pool.query(
      'SELECT * FROM containers WHERE id = $1',
      [req.params.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Посуда не найдена' });
    }

    if (checkResult.rows[0].restaurant_id !== restaurantId && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const result = await pool.query(`
      UPDATE containers SET
name = COALESCE($1, name),
  price = COALESCE($2, price),
  is_active = COALESCE($3, is_active),
  sort_order = COALESCE($4, sort_order)
      WHERE id = $5
RETURNING *
  `, [name, price, is_active, sort_order, req.params.id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update container error:', error);
    res.status(500).json({ error: 'Ошибка обновления посуды' });
  }
});

// Удалить посуду
router.delete('/containers/:id', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;

    // Check access
    const checkResult = await pool.query(
      'SELECT * FROM containers WHERE id = $1',
      [req.params.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Посуда не найдена' });
    }

    if (checkResult.rows[0].restaurant_id !== restaurantId && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    // Remove container from products first
    await pool.query('UPDATE products SET container_id = NULL WHERE container_id = $1', [req.params.id]);

    await pool.query('DELETE FROM containers WHERE id = $1', [req.params.id]);

    res.json({ message: 'Посуда удалена' });
  } catch (error) {
    console.error('Delete container error:', error);
    res.status(500).json({ error: 'Ошибка удаления посуды' });
  }
});

// =====================================================
// КАТЕГОРИИ
// =====================================================

// Получить категории (фильтруются по активному ресторану)
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY sort_order, name_ru');
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
    const normalizedNameRu = normalizeCategoryName(name_ru);
    const normalizedNameUz = normalizeCategoryName(name_uz);

    if (!restaurantId) {
      return res.status(400).json({ error: 'Выберите ресторан' });
    }

    if (!normalizedNameRu) {
      return res.status(400).json({ error: 'Название категории обязательно' });
    }

    const conflict = await findAdminCategoryNameConflict({
      parentId: null,
      restaurantId,
      nameRu: normalizedNameRu,
      nameUz: normalizedNameUz
    });
    if (conflict) {
      if (conflict.field === 'name_ru') {
        return res.status(400).json({ error: 'Категория с таким названием RU уже существует на этом уровне' });
      }
      return res.status(400).json({ error: 'Категория с таким названием UZ уже существует на этом уровне' });
    }

    const result = await pool.query(`
      INSERT INTO categories(restaurant_id, name_ru, name_uz, image_url, sort_order)
VALUES($1, $2, $3, $4, $5)
RETURNING *
  `, [restaurantId, normalizedNameRu, normalizedNameUz || null, image_url, sort_order || 0]);

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
    const normalizedNameRu = normalizeCategoryName(name_ru);
    const normalizedNameUz = normalizeCategoryName(name_uz);

    if (!normalizedNameRu) {
      return res.status(400).json({ error: 'Название категории обязательно' });
    }

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

    const conflict = await findAdminCategoryNameConflict({
      parentId: oldCategory.parent_id ?? null,
      restaurantId: oldCategory.restaurant_id,
      nameRu: normalizedNameRu,
      nameUz: normalizedNameUz,
      excludeId: Number.parseInt(req.params.id, 10)
    });
    if (conflict) {
      if (conflict.field === 'name_ru') {
        return res.status(400).json({ error: 'Категория с таким названием RU уже существует на этом уровне' });
      }
      return res.status(400).json({ error: 'Категория с таким названием UZ уже существует на этом уровне' });
    }

    const result = await pool.query(`
      UPDATE categories SET
name_ru = $1, name_uz = $2, image_url = $3, sort_order = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
RETURNING *
  `, [normalizedNameRu, normalizedNameUz || null, image_url, sort_order || 0, req.params.id]);

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
  (SELECT COUNT(*) FROM orders ${whereClause} AND (status = 'preparing' OR status = 'in_progress')) as preparing_orders,
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
// Schedule a broadcast or send immediately
router.post('/broadcast', async (req, res) => {
  try {
    const { message, image_url, scheduled_at, recurrence, repeat_days } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Текст сообщения обязателен' });
    }

    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) {
      return res.status(400).json({ error: 'Не выбран ресторан' });
    }

    // IF SCHEDULED
    if (scheduled_at) {
      const result = await pool.query(`
        INSERT INTO scheduled_broadcasts(restaurant_id, user_id, message, image_url, scheduled_at, recurrence, repeat_days)
VALUES($1, $2, $3, $4, $5, $6, $7)
RETURNING *
  `, [restaurantId, req.user.id, message, image_url, scheduled_at, recurrence || 'none', repeat_days || null]);

      return res.json({
        message: 'Рассылка запланирована',
        broadcast: result.rows[0]
      });
    }

    // IMMEDIATE BROADCAST (Original logic)
    // Get restaurant info and bot token
    const restaurantResult = await pool.query(
      'SELECT name, telegram_bot_token FROM restaurants WHERE id = $1',
      [restaurantId]
    );

    if (restaurantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    const restaurant = restaurantResult.rows[0];
    const botToken = restaurant.telegram_bot_token;

    if (!botToken) {
      return res.status(400).json({ error: 'Telegram бот не настроен для этого ресторана. Добавьте токен бота в настройках.' });
    }

    // Get all customers who have interacted with this restaurant
    const customersResult = await pool.query(`
      SELECT DISTINCT u.telegram_id, u.full_name
      FROM users u
      WHERE u.telegram_id IS NOT NULL 
        AND u.is_active = true
        AND u.role = 'customer'
AND(
  u.active_restaurant_id = $1
          OR u.id IN(SELECT DISTINCT user_id FROM orders WHERE restaurant_id = $1)
          OR u.id IN(SELECT DISTINCT user_id FROM user_restaurants WHERE restaurant_id = $1)
)
  `, [restaurantId]);

    const customers = customersResult.rows;

    if (customers.length === 0) {
      return res.status(400).json({ error: 'Нет клиентов для рассылки' });
    }

    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(botToken);

    // Create history record
    const historyResult = await pool.query(`
      INSERT INTO broadcast_history(restaurant_id, user_id, message, image_url)
VALUES($1, $2, $3, $4)
      RETURNING id
    `, [restaurantId, req.user.id, message, image_url]);
    const broadcastHistoryId = historyResult.rows[0].id;

    // Send messages
    let sent = 0;
    let failed = 0;

    const broadcastMessage = `📢 <b>${restaurant.name}</b>\n\n${message} `;
    const errors = [];

    for (const customer of customers) {
      try {
        let sentMsg;
        if (image_url) {
          sentMsg = await bot.sendPhoto(customer.telegram_id, image_url, {
            caption: broadcastMessage,
            parse_mode: 'HTML'
          });
        } else {
          sentMsg = await bot.sendMessage(customer.telegram_id, broadcastMessage, {
            parse_mode: 'HTML'
          });
        }

        if (sentMsg && sentMsg.message_id) {
          await pool.query(`
            INSERT INTO broadcast_sent_messages(broadcast_history_id, chat_id, message_id)
VALUES($1, $2, $3)
          `, [broadcastHistoryId, customer.telegram_id, sentMsg.message_id]);
        }

        sent++;
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (err) {
        console.error(`Failed to send to ${customer.telegram_id} (${customer.full_name}): `, err.message);
        errors.push({ user: customer.full_name, error: err.message });
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
      newValues: { message, sent, failed, total: customers.length, errors },
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.json({
      message: 'Рассылка завершена',
      sent,
      failed,
      total: customers.length,
      errors: errors.slice(0, 5)
    });
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ error: 'Ошибка рассылки: ' + error.message });
  }
});

// GET scheduled broadcasts
router.get('/scheduled-broadcasts', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) {
      return res.status(400).json({ error: 'Не выбран ресторан' });
    }

    const result = await pool.query(`
      SELECT sb.*, u.full_name as creator_name
      FROM scheduled_broadcasts sb
      LEFT JOIN users u ON sb.user_id = u.id
      WHERE sb.restaurant_id = $1
      ORDER BY sb.scheduled_at ASC
  `, [restaurantId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get scheduled broadcasts error:', error);
    res.status(500).json({ error: 'Ошибка получения запланированных рассылок' });
  }
});

// DELETE scheduled broadcast
router.delete('/scheduled-broadcasts/:id', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    const result = await pool.query(
      'DELETE FROM scheduled_broadcasts WHERE id = $1 AND (restaurant_id = $2 OR $3 = true)',
      [req.params.id, restaurantId, req.user.role === 'superadmin']
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Расписание не найдено' });
    }

    res.json({ message: 'Запланированная рассылка удалена' });
  } catch (error) {
    console.error('Delete scheduled broadcast error:', error);
    res.status(500).json({ error: 'Ошибка удаления расписания' });
  }
});

// TOGGLE scheduled broadcast
router.patch('/scheduled-broadcasts/:id/toggle', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    const result = await pool.query(`
      UPDATE scheduled_broadcasts 
      SET is_active = NOT is_active 
      WHERE id = $1 AND(restaurant_id = $2 OR $3 = true)
RETURNING *
  `, [req.params.id, restaurantId, req.user.role === 'superadmin']);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Расписание не найдено' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Toggle scheduled broadcast error:', error);
    res.status(500).json({ error: 'Ошибка изменения статуса расписания' });
  }
});

// UPDATE scheduled broadcast
router.put('/scheduled-broadcasts/:id', async (req, res) => {
  try {
    const { message, image_url, scheduled_at, recurrence, repeat_days } = req.body;
    const restaurantId = req.user.active_restaurant_id;

    const result = await pool.query(`
      UPDATE scheduled_broadcasts 
      SET message = $1, image_url = $2, scheduled_at = $3, recurrence = $4, repeat_days = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6 AND(restaurant_id = $7 OR $8 = true)
RETURNING *
  `, [message, image_url, scheduled_at, recurrence, repeat_days, req.params.id, restaurantId, req.user.role === 'superadmin']);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Расписание не найдено' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update scheduled broadcast error:', error);
    res.status(500).json({ error: 'Ошибка обновления расписания' });
  }
});

// GET broadcast history
router.get('/broadcast-history', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) return res.status(400).json({ error: 'Не выбран ресторан' });

    const result = await pool.query(`
      SELECT bh.*, u.full_name as creator_name,
  (SELECT COUNT(*) FROM broadcast_sent_messages WHERE broadcast_history_id = bh.id) as messages_count
      FROM broadcast_history bh
      LEFT JOIN users u ON bh.user_id = u.id
      WHERE bh.restaurant_id = $1
      ORDER BY bh.sent_at DESC
      LIMIT 50
  `, [restaurantId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get broadcast history error:', error);
    res.status(500).json({ error: 'Ошибка получения истории' });
  }
});

// DELETE broadcast history item and REMOVE messages from Telegram
router.post('/broadcast-history/:id/delete-remote', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;

    // Check access and get history info
    const historyResult = await pool.query(`
      SELECT bh.*, r.telegram_bot_token
      FROM broadcast_history bh
      JOIN restaurants r ON bh.restaurant_id = r.id
      WHERE bh.id = $1 AND(bh.restaurant_id = $2 OR $3 = true)
    `, [req.params.id, restaurantId, req.user.role === 'superadmin']);

    if (historyResult.rows.length === 0) {
      return res.status(404).json({ error: 'История не найдена' });
    }

    const { telegram_bot_token } = historyResult.rows[0];
    if (!telegram_bot_token) {
      return res.status(400).json({ error: 'Бот не настроен, невозможно удалить сообщения' });
    }

    // Get all sent messages IDs
    const messagesResult = await pool.query(
      'SELECT chat_id, message_id FROM broadcast_sent_messages WHERE broadcast_history_id = $1',
      [req.params.id]
    );

    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(telegram_bot_token);

    let deletedCount = 0;
    for (const msg of messagesResult.rows) {
      try {
        await bot.deleteMessage(msg.chat_id, msg.message_id);
        deletedCount++;
      } catch (e) {
        console.warn(`Failed to delete message ${msg.message_id} in chat ${msg.chat_id}: `, e.message);
      }
    }

    // Delete record from DB
    await pool.query('DELETE FROM broadcast_history WHERE id = $1', [req.params.id]);

    res.json({ message: 'Сообщения удалены', deleted: deletedCount });
  } catch (error) {
    console.error('Delete remote broadcast error:', error);
    res.status(500).json({ error: 'Ошибка удаления сообщений: ' + error.message });
  }
});

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
      WITH monthly_products AS(
    SELECT 
          EXTRACT(MONTH FROM o.created_at) as month,
    oi.product_name,
    SUM(oi.quantity) as total_quantity,
    SUM(oi.quantity * oi.price) as total_revenue,
    ROW_NUMBER() OVER(
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

// =====================================================
// FEEDBACK (Complaints & Suggestions) - Admin
// =====================================================

// Get all feedback for restaurant
router.get('/feedback', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId && req.user.role !== 'superadmin') {
      return res.status(400).json({ error: 'Ресторан не выбран' });
    }

    const { status, type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT f.*,
  u.username as user_username,
  resp.full_name as responder_name
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      LEFT JOIN users resp ON f.responded_by = resp.id
      WHERE 1 = 1
  `;
    const params = [];
    let paramIndex = 1;

    if (restaurantId) {
      query += ` AND f.restaurant_id = $${paramIndex} `;
      params.push(restaurantId);
      paramIndex++;
    }

    if (status) {
      query += ` AND f.status = $${paramIndex} `;
      params.push(status);
      paramIndex++;
    }

    if (type) {
      query += ` AND f.type = $${paramIndex} `;
      params.push(type);
      paramIndex++;
    }

    // Get total count
    const countQuery = query.replace(/SELECT[\s\S]*?FROM feedback f/, 'SELECT COUNT(*) FROM feedback f');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    query += ` ORDER BY f.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1} `;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      feedback: result.rows,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ error: 'Ошибка получения обращений' });
  }
});

// Update feedback status / respond
router.patch('/feedback/:id', async (req, res) => {
  try {
    const { status, admin_response } = req.body;
    const feedbackId = req.params.id;

    // Check access
    const checkResult = await pool.query(
      'SELECT * FROM feedback WHERE id = $1',
      [feedbackId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Обращение не найдено' });
    }

    const feedback = checkResult.rows[0];

    // Check restaurant access
    if (req.user.role !== 'superadmin' && feedback.restaurant_id !== req.user.active_restaurant_id) {
      return res.status(403).json({ error: 'Нет доступа к этому обращению' });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex} `);
      values.push(status);
      paramIndex++;
    }

    if (admin_response !== undefined) {
      updates.push(`admin_response = $${paramIndex} `);
      values.push(admin_response);
      paramIndex++;

      updates.push(`responded_by = $${paramIndex} `);
      values.push(req.user.id);
      paramIndex++;

      updates.push(`responded_at = CURRENT_TIMESTAMP`);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(feedbackId);

    const result = await pool.query(`
      UPDATE feedback 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
RETURNING *
  `, values);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update feedback error:', error);
    res.status(500).json({ error: 'Ошибка обновления обращения' });
  }
});

// Get feedback stats
router.get('/feedback/stats', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;

    let whereClause = '';
    const params = [];

    if (restaurantId) {
      whereClause = 'WHERE restaurant_id = $1';
      params.push(restaurantId);
    }

    const result = await pool.query(`
SELECT
COUNT(*) FILTER(WHERE status = 'new') as new_count,
  COUNT(*) FILTER(WHERE status = 'in_progress') as in_progress_count,
    COUNT(*) FILTER(WHERE status = 'resolved') as resolved_count,
      COUNT(*) FILTER(WHERE status = 'closed') as closed_count,
        COUNT(*) as total
      FROM feedback
      ${whereClause}
`, params);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get feedback stats error:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// =====================================================
// USER PROFILE LOGS (история изменений профиля)
// =====================================================

// Get profile change logs for a specific user
router.get('/user/:userId/profile-logs', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(`
SELECT
id,
  field_name,
  old_value,
  new_value,
  changed_via,
  created_at
      FROM user_profile_logs 
      WHERE user_id = $1
      ORDER BY created_at DESC
  `, [userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get user profile logs error:', error);
    res.status(500).json({ error: 'Ошибка получения логов' });
  }
});

// Get all profile change logs (for current restaurant's customers)
router.get('/profile-logs', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;

    const result = await pool.query(`
SELECT
pl.id,
  pl.user_id,
  u.full_name as user_name,
  u.phone as user_phone,
  pl.field_name,
  pl.old_value,
  pl.new_value,
  pl.changed_via,
  pl.created_at
      FROM user_profile_logs pl
      JOIN users u ON pl.user_id = u.id
      WHERE EXISTS(
    SELECT 1 FROM user_restaurants ur 
        WHERE ur.user_id = u.id AND ur.restaurant_id = $1
  )
      ORDER BY pl.created_at DESC
      LIMIT 100
  `, [restaurantId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get profile logs error:', error);
    res.status(500).json({ error: 'Ошибка получения логов' });
  }
});

module.exports = router;
