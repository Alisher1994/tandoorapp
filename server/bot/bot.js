const TelegramBot = require('node-telegram-bot-api');
const pool = require('../database/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

let bot = null;

// Generate login token for auto-login
function generateLoginToken(userId, username) {
  return jwt.sign(
    { userId, username, autoLogin: true },
    process.env.JWT_SECRET,
    { expiresIn: '30d' } // Token valid for 30 days
  );
}

function buildCatalogUrl(appUrl, token) {
  const trimmed = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
  return `${trimmed}/catalog?token=${token}`;
}

// Store for registration states
const registrationStates = new Map();

// Check if point is inside polygon (ray casting algorithm)
function isPointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  
  const [lat, lng] = point;
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [lat_i, lng_i] = polygon[i];
    const [lat_j, lng_j] = polygon[j];
    
    if (((lng_i > lng) !== (lng_j > lng)) &&
        (lat < (lat_j - lat_i) * (lng - lng_i) / (lng_j - lng_i) + lat_i)) {
      inside = !inside;
    }
  }
  
  return inside;
}

// Find restaurant by delivery zone
async function findRestaurantByLocation(lat, lng) {
  try {
    console.log(`🔍 Searching restaurant for location: ${lat}, ${lng}`);
    
    const result = await pool.query(`
      SELECT id, name, delivery_zone, logo_url, start_time, end_time
      FROM restaurants 
      WHERE is_active = true
    `);
    
    console.log(`📍 Found ${result.rows.length} active restaurants`);
    
    for (const restaurant of result.rows) {
      let zone = restaurant.delivery_zone;
      
      console.log(`🏪 Restaurant: ${restaurant.name}, zone type: ${typeof zone}, zone: ${zone ? 'exists' : 'null'}`);
      
      if (!zone) {
        console.log(`   ⚠️ No delivery zone for ${restaurant.name}`);
        continue;
      }
      
      // Parse if string
      if (typeof zone === 'string') {
        try {
          zone = JSON.parse(zone);
        } catch (e) {
          console.log(`   ❌ Failed to parse zone: ${e.message}`);
          continue;
        }
      }
      
      console.log(`   📐 Zone has ${zone?.length || 0} points`);
      if (zone && zone.length > 0) {
        console.log(`   📐 First point: ${JSON.stringify(zone[0])}`);
      }
      
      if (zone && zone.length >= 3) {
        const isInside = isPointInPolygon([lat, lng], zone);
        console.log(`   🎯 Point [${lat}, ${lng}] inside zone: ${isInside}`);
        
        if (isInside) {
          return restaurant;
        }
      }
    }
    
    console.log('❌ No matching restaurant found');
    return null;
  } catch (error) {
    console.error('Find restaurant error:', error);
    return null;
  }
}

function getTimeInTimeZone(timeZone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);
  const hh = parts.find(p => p.type === 'hour')?.value || '00';
  const mm = parts.find(p => p.type === 'minute')?.value || '00';
  return { hh: parseInt(hh, 10), mm: parseInt(mm, 10) };
}

function isRestaurantOpen(openTime, closeTime) {
  if (!openTime || !closeTime) return true;
  const timeZone = process.env.RESTAURANT_TIMEZONE || 'Asia/Tashkent';
  const { hh, mm } = getTimeInTimeZone(timeZone);
  const [openH, openM] = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  const nowMinutes = hh * 60 + mm;

  if (openMinutes === closeMinutes) return true;
  if (openMinutes < closeMinutes) {
    return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  }
  return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
}

function initBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN not set, bot will not be initialized');
    return;
  }
  
  const isProduction = process.env.NODE_ENV === 'production';
  const webAppUrl = process.env.TELEGRAM_WEB_APP_URL || process.env.FRONTEND_URL;
  const webhookBaseUrl = process.env.TELEGRAM_WEBHOOK_URL || process.env.BACKEND_URL || process.env.FRONTEND_URL || webAppUrl;
  
  if (isProduction && webhookBaseUrl) {
    const webhookPath = '/api/telegram/webhook';
    const webhookUrl = `${webhookBaseUrl}${webhookPath}`;
    
    bot = new TelegramBot(token);
    
    bot.setWebHook(webhookUrl).then(() => {
      console.log(`🤖 Telegram bot initialized with webhook: ${webhookUrl}`);
    }).catch((error) => {
      console.error('❌ Error setting webhook:', error);
      console.log('⚠️  Falling back to polling mode');
      bot = new TelegramBot(token, { polling: true });
    });
  } else {
    bot = new TelegramBot(token, { polling: true });
    console.log('🤖 Telegram bot initialized with polling');
  }
  
  // =====================================================
  // /start command
  // =====================================================
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      // Check if user exists
      const userResult = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [userId]
      );
      
      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        
        // Check if user is blocked
        if (!user.is_active) {
          bot.sendMessage(chatId, 
            `🚫 <b>Ваш аккаунт заблокирован</b>\n\n` +
            `Для связи с поддержкой обратитесь к администратору.`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📞 Связаться с поддержкой', url: 'https://t.me/budavron' }]
                ]
              }
            }
          );
          return;
        }
        
        // User already registered - show inline button for new order
        bot.sendMessage(chatId, 
          `👋 С возвращением, ${user.full_name}!`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              remove_keyboard: true,
              inline_keyboard: [
                [{ text: '🛒 Новый заказ', callback_data: 'new_order' }],
                [{ text: '📋 Мои заказы', callback_data: 'my_orders' }]
              ]
            }
          }
        );
      } else {
        // Start registration - ask for contact
        registrationStates.set(userId, { step: 'waiting_contact' });
        
        bot.sendMessage(chatId,
          '👋 Добро пожаловать!\n\n' +
          '📱 Для регистрации, пожалуйста, поделитесь своим номером телефона:',
          {
            reply_markup: {
              keyboard: [[
                { text: '📱 Поделиться контактом', request_contact: true }
              ]],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          }
        );
      }
    } catch (error) {
      console.error('Start command error:', error);
      bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
    }
  });
  
  // =====================================================
  // Handle contact sharing
  // =====================================================
  bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const contact = msg.contact;
    
    const state = registrationStates.get(userId);
    if (!state || state.step !== 'waiting_contact') return;
    
    // Save contact and ask for name
    state.phone = contact.phone_number;
    state.step = 'waiting_name';
    registrationStates.set(userId, state);
    
    bot.sendMessage(chatId, 
      '✅ Спасибо!\n\n' +
      '👤 Теперь введите ваше имя:',
      {
        reply_markup: { remove_keyboard: true }
      }
    );
  });
  
  // =====================================================
  // Handle text messages (for name input and menu buttons)
  // =====================================================
  bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    // Skip commands
    if (text.startsWith('/')) return;
    
    // Handle menu buttons
    if (text === '📋 Мои заказы') {
      // Trigger /orders command
      const userResult = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [userId]);
      if (userResult.rows.length === 0) {
        bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
        return;
      }
      
      const ordersResult = await pool.query(`
        SELECT o.order_number, o.status, o.total_amount, o.created_at
        FROM orders o WHERE o.user_id = $1
        ORDER BY o.created_at DESC LIMIT 5
      `, [userResult.rows[0].id]);
      
      if (ordersResult.rows.length === 0) {
        bot.sendMessage(chatId, '📦 У вас пока нет заказов.', {
          reply_markup: {
            inline_keyboard: [[{ text: '🛒 Новый заказ', callback_data: 'new_order' }]]
          }
        });
        return;
      }
      
      let message = '📦 <b>Ваши заказы:</b>\n\n';
      const statusEmoji = { 'new': '🆕', 'preparing': '👨‍🍳', 'delivering': '🚚', 'delivered': '✅', 'cancelled': '❌' };
      
      ordersResult.rows.forEach((order) => {
        message += `${statusEmoji[order.status] || '📦'} #${order.order_number} — ${parseFloat(order.total_amount).toLocaleString()} сум\n`;
      });
      
      bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🛒 Новый заказ', callback_data: 'new_order' }]]
        }
      });
      return;
    }
    
    if (text === '❓ Помощь') {
      bot.sendMessage(chatId,
        '📖 <b>Помощь</b>\n\n' +
        '📍 <b>Отправить локацию</b> — начать заказ\n' +
        '📋 <b>Мои заказы</b> — история заказов\n\n' +
        'Команды:\n' +
        '/start — начать\n' +
        '/menu — открыть меню\n' +
        '/orders — мои заказы',
        { parse_mode: 'HTML' }
      );
      return;
    }
    
    const state = registrationStates.get(userId);
    if (!state) return;
    
    if (state.step === 'waiting_name') {
      // Save name and ask for location
      state.name = text;
      state.step = 'waiting_location';
      registrationStates.set(userId, state);
      
      bot.sendMessage(chatId,
        `👋 Приятно познакомиться, ${text}!\n\n` +
        '📍 Теперь поделитесь вашей геолокацией, чтобы мы проверили зону доставки:',
        {
          reply_markup: {
            keyboard: [[
              { text: '📍 Поделиться локацией', request_location: true }
            ]],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );
    }
  });
  
  // =====================================================
  // Handle location sharing
  // =====================================================
  bot.on('location', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const location = msg.location;
    
    let state = registrationStates.get(userId);
    
    // If no state but user exists, treat as order location
    if (!state) {
      const userCheck = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [userId]);
      if (userCheck.rows.length > 0) {
        // Existing user sending location - treat as new order
        state = { step: 'waiting_location_for_order', isExistingUser: true };
        registrationStates.set(userId, state);
        console.log(`📍 Auto-set state for existing user ${userId}`);
      } else {
        // Unknown user - tell them to /start
        bot.sendMessage(chatId, '❌ Пожалуйста, сначала нажмите /start для регистрации');
        return;
      }
    }
    
    if (state.step !== 'waiting_location' && state.step !== 'waiting_location_for_order') {
      // Wrong state - reset and treat as order
      state = { step: 'waiting_location_for_order', isExistingUser: true };
      registrationStates.set(userId, state);
    }
    
    try {
      // Check if location is in any delivery zone
      const restaurant = await findRestaurantByLocation(location.latitude, location.longitude);
      
      if (restaurant) {
        // Check working hours
        const startTime = restaurant.start_time ? restaurant.start_time.substring(0, 5) : null;
        const endTime = restaurant.end_time ? restaurant.end_time.substring(0, 5) : null;
        
        if (!isRestaurantOpen(startTime, endTime)) {
          bot.sendMessage(chatId,
            `😔 Извините, данный ресторан работает с ${startTime || '??:??'} по ${endTime || '??:??'}.\n\nПопробуйте позже!`,
            { reply_markup: { remove_keyboard: true } }
          );
          registrationStates.delete(userId);
          return;
        }
        const appUrl = process.env.TELEGRAM_WEB_APP_URL || 'https://tandoorapp-production.up.railway.app';
        
        // Check if this is existing user checking location for new order
        if (state.isExistingUser) {
          // Get existing user
          const userResult = await pool.query(
            'SELECT * FROM users WHERE telegram_id = $1',
            [userId]
          );
          
          if (userResult.rows.length === 0) {
            registrationStates.delete(userId);
            bot.sendMessage(chatId, '❌ Профиль не найден. Нажмите /start для регистрации.');
            return;
          }

          const user = userResult.rows[0];
          
          // Save location to database
          await pool.query(`
            UPDATE users 
            SET last_latitude = $1, last_longitude = $2, active_restaurant_id = $3
            WHERE id = $4
          `, [location.latitude, location.longitude, restaurant.id, user.id]);
          
          let loginUrl = null;
          try {
            const token = generateLoginToken(user.id, user.username);
            loginUrl = buildCatalogUrl(appUrl, token);
          } catch (tokenError) {
            console.error('Login token error:', tokenError);
          }
          
          // Clear state
          registrationStates.delete(userId);
          
          if (!loginUrl) {
            bot.sendMessage(chatId,
              `✅ Отлично! Доставка доступна!\n\n` +
              `🏪 Ресторан: <b>${restaurant.name}</b>\n\n` +
              `⚠️ Ошибка выдачи ссылки. Попробуйте команду /menu.`,
              { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
            );
            return;
          }
          
          bot.sendMessage(chatId,
            `✅ Отлично! Доставка доступна!\n\n` +
            `🏪 Ресторан: <b>${restaurant.name}</b>`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                remove_keyboard: true,
                inline_keyboard: [
                  [{ text: '🍽️ Открыть меню', web_app: { url: loginUrl } }],
                  [{ text: '📋 Мои заказы', callback_data: 'my_orders' }]
                ]
              }
            }
          );
          return;
        }
        
        // New user registration - complete registration
        // Use Telegram username, fallback to user_ID, fallback to name
        const telegramUsername = msg.from.username;
        const username = telegramUsername || `user_${userId}`;
        const password = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Save user with location and get ID
        const userResult = await pool.query(`
          INSERT INTO users (telegram_id, username, password, full_name, phone, role, is_active, last_latitude, last_longitude, active_restaurant_id)
          VALUES ($1, $2, $3, $4, $5, 'customer', true, $6, $7, $8)
          ON CONFLICT (telegram_id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            phone = EXCLUDED.phone,
            last_latitude = EXCLUDED.last_latitude,
            last_longitude = EXCLUDED.last_longitude,
            active_restaurant_id = EXCLUDED.active_restaurant_id,
            username = CASE WHEN users.username LIKE 'user_%' AND $2 NOT LIKE 'user_%' THEN $2 ELSE users.username END
          RETURNING id
        `, [userId, username, hashedPassword, state.name, state.phone, location.latitude, location.longitude, restaurant.id]);
        
        const newUserId = userResult.rows[0].id;
        
        // Clear registration state
        registrationStates.delete(userId);
        
        // Generate auto-login token
        const token = generateLoginToken(newUserId, username);
        const loginUrl = buildCatalogUrl(appUrl, token);
        
        bot.sendMessage(chatId,
          `✅ Регистрация успешна!\n\n` +
          `🏪 Ресторан: <b>${restaurant.name}</b>\n` +
          `📍 Доставка по вашему адресу доступна!`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              remove_keyboard: true,
              inline_keyboard: [
                [{ text: '🍽️ Открыть меню', web_app: { url: loginUrl } }],
                [{ text: '📋 Мои заказы', callback_data: 'my_orders' }]
              ]
            }
          }
        );
      } else {
        // Location is NOT in any delivery zone
        bot.sendMessage(chatId,
          '😔 Извините!\n\n' +
          'К сожалению, доставка по вашему адресу пока не осуществляется.\n\n' +
          '📍 Попробуйте отправить другую локацию или свяжитесь с нами для уточнения.',
          {
            reply_markup: {
              keyboard: [[
                { text: '📍 Отправить другую локацию', request_location: true }
              ]],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          }
        );
      }
    } catch (error) {
      console.error('Location handling error:', error);
      bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
    }
  });
  
  // =====================================================
  // /help command
  // =====================================================
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
      '📖 Справка:\n\n' +
      '/start - Начать регистрацию\n' +
      '/menu - Открыть меню\n' +
      '/orders - Мои заказы\n' +
      '/help - Показать справку'
    );
  });
  
  // =====================================================
  // /menu command - same as /start for registered users
  // =====================================================
  bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUserId = msg.from.id;
    
    try {
      const userResult = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [telegramUserId]
      );
      
      if (userResult.rows.length === 0) {
        bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Используйте /start');
        return;
      }
      
      // Always ask for location first
      registrationStates.set(telegramUserId, { 
        step: 'waiting_location_for_order',
        isExistingUser: true 
      });
      
      bot.sendMessage(chatId,
        '📍 Укажите адрес доставки:',
        {
          reply_markup: {
            keyboard: [[
              { text: '📍 Отправить локацию', request_location: true }
            ]],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );
    } catch (error) {
      console.error('Menu command error:', error);
      bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
    }
  });
  
  // =====================================================
  // /orders command
  // =====================================================
  bot.onText(/\/orders/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      const userResult = await pool.query(
        'SELECT id FROM users WHERE telegram_id = $1',
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Используйте /start');
        return;
      }
      
      const ordersResult = await pool.query(
        `SELECT o.*, r.name as restaurant_name,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'product_name', oi.product_name,
                      'quantity', oi.quantity,
                      'price', oi.price
                    )
                  ) FILTER (WHERE oi.id IS NOT NULL),
                  '[]'
                ) as items
         FROM orders o
         LEFT JOIN restaurants r ON o.restaurant_id = r.id
         LEFT JOIN order_items oi ON o.id = oi.order_id
         WHERE o.user_id = $1
         GROUP BY o.id, r.name
         ORDER BY o.created_at DESC
         LIMIT 5`,
        [userResult.rows[0].id]
      );
      
      if (ordersResult.rows.length === 0) {
        bot.sendMessage(chatId, 
          '📦 У вас пока нет заказов.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🛒 Новый заказ', callback_data: 'new_order' }]
              ]
            }
          }
        );
        return;
      }
      
      let message = '📦 <b>Ваши последние заказы:</b>\n\n';
      
      ordersResult.rows.forEach((order) => {
        const statusEmoji = {
          'new': '🆕',
          'preparing': '👨‍🍳',
          'delivering': '🚚',
          'delivered': '✅',
          'cancelled': '❌'
        };
        
        message += `${statusEmoji[order.status] || '📦'} <b>Заказ #${order.order_number}</b>\n`;
        if (order.restaurant_name) message += `🏪 ${order.restaurant_name}\n`;
        message += `💰 ${order.total_amount} сум\n`;
        message += `📅 ${new Date(order.created_at).toLocaleDateString('ru-RU')}\n`;
        message += `Статус: ${getStatusText(order.status)}\n\n`;
      });
      
      bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛒 Новый заказ', callback_data: 'new_order' }]
          ]
        }
      });
    } catch (error) {
      console.error('Orders command error:', error);
      bot.sendMessage(chatId, '❌ Ошибка получения заказов');
    }
  });
  
  // =====================================================
  // Callback query handler (inline buttons)
  // =====================================================
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    const operatorName = callbackQuery.from.first_name || 'Оператор';
    
    // Answer callback to remove loading state
    bot.answerCallbackQuery(callbackQuery.id);
    
    if (data === 'new_order') {
      // Start new order flow - ask for location
      registrationStates.set(userId, { 
        step: 'waiting_location_for_order',
        isExistingUser: true 
      });
      
      // Send message with location request keyboard
      await bot.sendMessage(chatId,
        '📍 Отправьте геолокацию для доставки:',
        {
          parse_mode: 'HTML',
          reply_markup: {
            keyboard: [
              [{ text: '📍 Отправить геолокацию', request_location: true }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );
      return;
    }
    
    // My orders inline button
    if (data === 'my_orders') {
      const userResult = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [userId]);
      
      if (userResult.rows.length === 0) {
        bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
        return;
      }
      
      const ordersResult = await pool.query(`
        SELECT o.order_number, o.status, o.total_amount, o.created_at
        FROM orders o WHERE o.user_id = $1
        ORDER BY o.created_at DESC LIMIT 5
      `, [userResult.rows[0].id]);
      
      if (ordersResult.rows.length === 0) {
        bot.sendMessage(chatId, '📦 У вас пока нет заказов.', {
          reply_markup: {
            inline_keyboard: [[{ text: '🛒 Новый заказ', callback_data: 'new_order' }]]
          }
        });
        return;
      }
      
      let message = '📦 <b>Ваши заказы:</b>\n\n';
      const statusEmoji = { 'new': '🆕', 'preparing': '👨‍🍳', 'delivering': '🚚', 'delivered': '✅', 'cancelled': '❌' };
      
      ordersResult.rows.forEach((order) => {
        message += `${statusEmoji[order.status] || '📦'} #${order.order_number} — ${parseFloat(order.total_amount).toLocaleString()} сум\n`;
      });
      
      bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🛒 Новый заказ', callback_data: 'new_order' }]]
        }
      });
      return;
    }
    
    // Confirm order
    else if (data.startsWith('confirm_order_')) {
      const orderId = data.replace('confirm_order_', '');
      console.log(`📋 Confirm order ${orderId} by ${operatorName}`);
      
      try {
        // Check current status first
        const checkResult = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
        if (checkResult.rows.length === 0) {
          bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Заказ не найден', show_alert: true });
          return;
        }
        
        if (checkResult.rows[0].status !== 'new') {
          bot.answerCallbackQuery(callbackQuery.id, { text: '⚠️ Заказ уже обработан', show_alert: true });
          return;
        }
        
        // Update order status in database
        await pool.query(
          `UPDATE orders SET status = 'preparing', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [orderId]
        );
        
        // Add to status history
        await pool.query(
          'INSERT INTO order_status_history (order_id, status, comment) VALUES ($1, $2, $3)',
          [orderId, 'preparing', `Подтверждено: ${operatorName}`]
        );
        
        // Get order details for notification with restaurant bot token
        const orderResult = await pool.query(
          `SELECT o.*, u.telegram_id, r.telegram_bot_token 
           FROM orders o 
           LEFT JOIN users u ON o.user_id = u.id 
           LEFT JOIN restaurants r ON o.restaurant_id = r.id
           WHERE o.id = $1`,
          [orderId]
        );
        
        if (orderResult.rows.length > 0) {
          const order = orderResult.rows[0];
          
          // Notify customer using restaurant's bot
          if (order.telegram_id) {
            const { sendOrderUpdateToUser } = require('./notifications');
            await sendOrderUpdateToUser(order.telegram_id, order, 'preparing', order.telegram_bot_token);
          }
          
          // Update message in group - remove buttons
          const newText = callbackQuery.message.text.replace(
            'Статус: 🆕 Новый',
            `Статус: 👨‍🍳 Готовится\n✅ Подтвердил: ${operatorName}`
          );
          
          await bot.editMessageText(newText, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: [] } // Remove buttons
          });
        }
        
        bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Заказ подтвержден!' });
      } catch (error) {
        console.error('Confirm order error:', error);
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Ошибка: ' + error.message, show_alert: true });
      }
    }
    
    // Reject order - ask for reason
    else if (data.startsWith('reject_order_')) {
      const orderId = data.replace('reject_order_', '');
      
      // Store state to wait for rejection reason
      registrationStates.set(`reject_${chatId}_${messageId}`, {
        step: 'waiting_reject_reason',
        orderId: orderId,
        operatorName: operatorName,
        originalMessageId: messageId
      });
      
      bot.sendMessage(chatId,
        `❌ <b>Отмена заказа #${orderId}</b>\n\n` +
        `Напишите причину отказа:`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            force_reply: true,
            selective: true
          }
        }
      );
    }
  });
  
  // =====================================================
  // Handle rejection reason (reply)
  // =====================================================
  bot.on('message', async (msg) => {
    if (!msg.reply_to_message) return;
    
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Find rejection state
    for (const [key, state] of registrationStates.entries()) {
      if (key.startsWith(`reject_${chatId}_`) && state.step === 'waiting_reject_reason') {
        const { orderId, operatorName, originalMessageId } = state;
        
        try {
          // Update order status
          await pool.query(
            `UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [orderId]
          );
          
          // Add to status history with reason
          await pool.query(
            'INSERT INTO order_status_history (order_id, status, comment) VALUES ($1, $2, $3)',
            [orderId, 'cancelled', `Отказано: ${text} (${operatorName})`]
          );
          
          // Get order details with restaurant bot token
          const orderResult = await pool.query(
            `SELECT o.*, u.telegram_id, r.telegram_bot_token 
             FROM orders o 
             LEFT JOIN users u ON o.user_id = u.id 
             LEFT JOIN restaurants r ON o.restaurant_id = r.id
             WHERE o.id = $1`,
            [orderId]
          );
          
          if (orderResult.rows.length > 0) {
            const order = orderResult.rows[0];
            
            // Notify customer with reason using restaurant's bot
            if (order.telegram_id) {
              const { getRestaurantBot } = require('./notifications');
              const customerBot = order.telegram_bot_token 
                ? getRestaurantBot(order.telegram_bot_token) 
                : getDefaultBot();
              if (customerBot) {
                customerBot.sendMessage(order.telegram_id,
                  `❌ <b>Заказ #${order.order_number} отменен</b>\n\n` +
                  `Причина: ${text}\n\n` +
                  `Приносим извинения за неудобства.`,
                  {
                    parse_mode: 'HTML',
                    reply_markup: {
                      inline_keyboard: [
                        [{ text: '🛒 Новый заказ', callback_data: 'new_order' }]
                      ]
                    }
                  }
                );
              }
            }
          }
          
          // Update original message
          bot.sendMessage(chatId,
            `❌ <b>Заказ #${orderId} отменен</b>\n\n` +
            `Причина: ${text}\n` +
            `Оператор: ${operatorName}`,
            { parse_mode: 'HTML' }
          );
          
          // Clear state
          registrationStates.delete(key);
        } catch (error) {
          console.error('Reject order error:', error);
          bot.sendMessage(chatId, '❌ Ошибка при отмене заказа');
        }
        
        break;
      }
    }
  });

  // Error handling
  bot.on('polling_error', (error) => {
    if (error.response?.body?.error_code === 409) {
      console.warn('⚠️  Telegram bot conflict: Another instance is running');
    } else {
      console.error('Telegram polling error:', error.message);
    }
  });
  
  bot.on('webhook_error', (error) => {
    console.error('Telegram webhook error:', error);
  });
}

function getStatusText(status) {
  const statusMap = {
    'new': 'Новый',
    'preparing': 'Готовится',
    'delivering': 'Доставляется',
    'delivered': 'Доставлен',
    'cancelled': 'Отменен'
  };
  return statusMap[status] || status;
}

function getBot() {
  return bot;
}

module.exports = { initBot, getBot };
