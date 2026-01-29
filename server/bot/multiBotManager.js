const TelegramBot = require('node-telegram-bot-api');
const pool = require('../database/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Store all bots: Map<botToken, { bot, restaurantId, restaurantName }>
const restaurantBots = new Map();

// Store for registration states: Map<`${botToken}_${telegramUserId}`, state>
const registrationStates = new Map();

// Generate login token for auto-login
function generateLoginToken(userId, username) {
  return jwt.sign(
    { userId, username, autoLogin: true },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function buildCatalogUrl(appUrl, token) {
  const trimmed = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
  return `${trimmed}/catalog?token=${token}`;
}

// Check if point is inside polygon
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

// Check restaurant working hours
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

// Check if location is in restaurant's delivery zone
async function isLocationInRestaurantZone(restaurantId, lat, lng) {
  try {
    const result = await pool.query(
      'SELECT delivery_zone FROM restaurants WHERE id = $1',
      [restaurantId]
    );
    
    if (result.rows.length === 0) return true; // No zone = deliver everywhere
    
    let zone = result.rows[0].delivery_zone;
    if (!zone) return true; // No zone = deliver everywhere
    
    if (typeof zone === 'string') {
      zone = JSON.parse(zone);
    }
    
    if (!zone || zone.length < 3) return true;
    
    return isPointInPolygon([lat, lng], zone);
  } catch (error) {
    console.error('Zone check error:', error);
    return true; // On error, allow delivery
  }
}

// Check if user is blocked and send message
async function checkBlockedUser(bot, chatId, userId, restaurantId) {
  try {
    const userResult = await pool.query(
      'SELECT is_active FROM users WHERE telegram_id = $1',
      [userId]
    );
    
    if (userResult.rows.length > 0 && !userResult.rows[0].is_active) {
      // Get support username from restaurant
      const restaurantResult = await pool.query(
        'SELECT support_username FROM restaurants WHERE id = $1',
        [restaurantId]
      );
      
      const supportUsername = restaurantResult.rows[0]?.support_username || process.env.ADMIN_USERNAME || 'admin';
      
      await bot.sendMessage(chatId,
        `🚫 <b>Ваш аккаунт заблокирован</b>\n\n` +
        `Для связи с администратором обратитесь: @${supportUsername}`,
        { parse_mode: 'HTML' }
      );
      return true; // User is blocked
    }
    return false; // User is not blocked
  } catch (error) {
    console.error('Check blocked user error:', error);
    return false;
  }
}

// Setup handlers for a specific bot
function setupBotHandlers(bot, restaurantId, restaurantName, botToken) {
  const appUrl = process.env.TELEGRAM_WEB_APP_URL || process.env.FRONTEND_URL;
  
  console.log(`🤖 Setting up handlers for restaurant: ${restaurantName} (ID: ${restaurantId})`);
  
  // Helper to get state key
  const getStateKey = (userId) => `${botToken}_${userId}`;
  
  // /start command
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    console.log(`📱 /start from user ${userId} for restaurant ${restaurantName}`);
    
    try {
      // Check if user is blocked
      if (await checkBlockedUser(bot, chatId, userId, restaurantId)) return;
      
      // Check if user exists
      const userResult = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [userId]
      );
      
      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        
        // Update user's active restaurant to this bot's restaurant
        await pool.query(
          'UPDATE users SET active_restaurant_id = $1 WHERE id = $2',
          [restaurantId, user.id]
        );
        
        // Generate login URL
        const token = generateLoginToken(user.id, user.username);
        const loginUrl = buildCatalogUrl(appUrl, token);
        
        bot.sendMessage(chatId, 
          `👋 С возвращением, ${user.full_name}!\n\n` +
          `🏪 Ресторан: <b>${restaurantName}</b>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🍽️ Открыть меню', web_app: { url: loginUrl } }],
                [{ text: '📋 Мои заказы', callback_data: 'my_orders' }],
                [{ text: '💬 Жалобы и предложения', callback_data: 'feedback' }]
              ]
            }
          }
        );
      } else {
        // Start registration
        registrationStates.set(getStateKey(userId), { step: 'waiting_contact', restaurantId });
        
        bot.sendMessage(chatId,
          `👋 Добро пожаловать в <b>${restaurantName}</b>!\n\n` +
          '📱 Для регистрации, пожалуйста, поделитесь своим номером телефона:',
          {
            parse_mode: 'HTML',
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
  
  // /menu command
  bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      // Check if user is blocked
      if (await checkBlockedUser(bot, chatId, userId, restaurantId)) return;
      
      const userResult = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
        return;
      }
      
      const user = userResult.rows[0];
      
      // Update active restaurant
      await pool.query(
        'UPDATE users SET active_restaurant_id = $1 WHERE id = $2',
        [restaurantId, user.id]
      );
      
      const token = generateLoginToken(user.id, user.username);
      const loginUrl = buildCatalogUrl(appUrl, token);
      
      bot.sendMessage(chatId,
        `🍽️ <b>${restaurantName}</b>\n\nНажмите кнопку ниже, чтобы открыть меню:`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🍽️ Открыть меню', web_app: { url: loginUrl } }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Menu command error:', error);
      bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
  });
  
  // Handle contact sharing
  bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const contact = msg.contact;
    
    const state = registrationStates.get(getStateKey(userId));
    if (!state || state.step !== 'waiting_contact') return;
    
    state.phone = contact.phone_number;
    state.step = 'waiting_name';
    registrationStates.set(getStateKey(userId), state);
    
    bot.sendMessage(chatId, 
      '✅ Спасибо!\n\n👤 Теперь введите ваше имя:',
      { reply_markup: { remove_keyboard: true } }
    );
  });
  
  // Handle text messages
  bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    if (text.startsWith('/')) return;
    
    const state = registrationStates.get(getStateKey(userId));
    if (!state) return;
    
    if (state.step === 'waiting_name') {
      state.name = text;
      state.step = 'waiting_location';
      registrationStates.set(getStateKey(userId), state);
      
      bot.sendMessage(chatId,
        `👋 Приятно познакомиться, ${text}!\n\n` +
        '📍 Теперь поделитесь вашей геолокацией:',
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
    
    // Handle rejection reason
    if (state.step === 'waiting_rejection_reason') {
      const { orderId, messageId, operatorName } = state;
      
      try {
        // Update order status
        await pool.query(
          `UPDATE orders SET status = 'cancelled', admin_comment = $1, processed_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [text, orderId]
        );
        
        // Get order details for customer notification
        const orderResult = await pool.query(
          `SELECT o.*, u.telegram_id 
           FROM orders o 
           LEFT JOIN users u ON o.user_id = u.id 
           WHERE o.id = $1`,
          [orderId]
        );
        
        if (orderResult.rows.length > 0) {
          const order = orderResult.rows[0];
          
          // Notify customer
          if (order.telegram_id) {
            try {
              bot.sendMessage(order.telegram_id,
                `❌ <b>Заказ #${order.order_number} отменен</b>\n\n` +
                `Причина: ${text}\n\n` +
                `Приносим извинения за неудобства.`,
                { parse_mode: 'HTML' }
              );
            } catch (e) {
              console.error('Error notifying customer:', e);
            }
          }
        }
        
        bot.sendMessage(chatId,
          `❌ <b>Заказ #${orderId} отменен</b>\n\nПричина: ${text}\nОператор: ${operatorName}`,
          { parse_mode: 'HTML' }
        );
        
        registrationStates.delete(getStateKey(userId));
      } catch (error) {
        console.error('Reject order error:', error);
        bot.sendMessage(chatId, '❌ Ошибка при отмене заказа');
      }
    }
    
    // Handle feedback message
    if (state.step === 'waiting_feedback_message') {
      try {
        // Get user info
        const userResult = await pool.query(
          'SELECT id, full_name, phone FROM users WHERE telegram_id = $1',
          [userId]
        );
        
        if (userResult.rows.length === 0) {
          bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
          registrationStates.delete(getStateKey(userId));
          return;
        }
        
        const user = userResult.rows[0];
        
        // Save feedback to database
        await pool.query(`
          INSERT INTO feedback (restaurant_id, user_id, customer_name, customer_phone, type, message)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [state.restaurantId || restaurantId, user.id, user.full_name, user.phone, state.feedbackType, text]);
        
        bot.sendMessage(chatId,
          `✅ <b>Спасибо за ваше обращение!</b>\n\n` +
          `Мы получили ваше сообщение и рассмотрим его в ближайшее время.`,
          { parse_mode: 'HTML' }
        );
        
        registrationStates.delete(getStateKey(userId));
      } catch (error) {
        console.error('Save feedback error:', error);
        bot.sendMessage(chatId, '❌ Ошибка при отправке. Попробуйте позже.');
        registrationStates.delete(getStateKey(userId));
      }
    }
  });
  
  // Handle location sharing
  bot.on('location', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const location = msg.location;
    
    // Check if user is blocked
    if (await checkBlockedUser(bot, chatId, userId, restaurantId)) return;
    
    let state = registrationStates.get(getStateKey(userId));
    
    // If no state but user exists, treat as checking delivery
    if (!state) {
      const userCheck = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [userId]);
      if (userCheck.rows.length > 0) {
        state = { step: 'checking_delivery', isExistingUser: true, user: userCheck.rows[0] };
      } else {
        bot.sendMessage(chatId, '❌ Пожалуйста, сначала нажмите /start');
        return;
      }
    }
    
    try {
      // Get restaurant info
      const restaurantResult = await pool.query(
        'SELECT * FROM restaurants WHERE id = $1',
        [restaurantId]
      );
      
      if (restaurantResult.rows.length === 0) {
        bot.sendMessage(chatId, '❌ Ресторан не найден', { reply_markup: { remove_keyboard: true } });
        return;
      }
      
      const restaurant = restaurantResult.rows[0];
      
      // Check delivery zone
      const inZone = await isLocationInRestaurantZone(restaurantId, location.latitude, location.longitude);
      
      if (!inZone) {
        bot.sendMessage(chatId,
          `😔 К сожалению, ваш адрес находится за пределами зоны доставки ресторана <b>${restaurantName}</b>.`,
          { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
        );
        registrationStates.delete(getStateKey(userId));
        return;
      }
      
      // Check working hours
      const startTime = restaurant.start_time ? restaurant.start_time.substring(0, 5) : null;
      const endTime = restaurant.end_time ? restaurant.end_time.substring(0, 5) : null;
      
      if (!isRestaurantOpen(startTime, endTime)) {
        bot.sendMessage(chatId,
          `😔 Извините, ресторан <b>${restaurantName}</b> работает с ${startTime || '??:??'} до ${endTime || '??:??'}.\n\nПопробуйте позже!`,
          { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
        );
        registrationStates.delete(getStateKey(userId));
        return;
      }
      
      // Existing user - update location and show menu
      if (state.isExistingUser || state.step === 'checking_delivery') {
        const user = state.user || (await pool.query('SELECT * FROM users WHERE telegram_id = $1', [userId])).rows[0];
        
        await pool.query(
          `UPDATE users SET last_latitude = $1, last_longitude = $2, active_restaurant_id = $3 WHERE id = $4`,
          [location.latitude, location.longitude, restaurantId, user.id]
        );
        
        const token = generateLoginToken(user.id, user.username);
        const loginUrl = buildCatalogUrl(appUrl, token);
        
        registrationStates.delete(getStateKey(userId));
        
        bot.sendMessage(chatId,
          `✅ Отлично! Доставка доступна!\n\n🏪 Ресторан: <b>${restaurantName}</b>`,
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
      
      // New user registration - complete it
      const telegramUsername = msg.from.username;
      const username = telegramUsername || `user_${userId}`;
      const password = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const userResult = await pool.query(`
        INSERT INTO users (telegram_id, username, password, full_name, phone, role, is_active, last_latitude, last_longitude, active_restaurant_id)
        VALUES ($1, $2, $3, $4, $5, 'customer', true, $6, $7, $8)
        ON CONFLICT (telegram_id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          phone = EXCLUDED.phone,
          last_latitude = EXCLUDED.last_latitude,
          last_longitude = EXCLUDED.last_longitude,
          active_restaurant_id = EXCLUDED.active_restaurant_id
        RETURNING id
      `, [userId, username, hashedPassword, state.name, state.phone, location.latitude, location.longitude, restaurantId]);
      
      const newUserId = userResult.rows[0].id;
      registrationStates.delete(getStateKey(userId));
      
      const token = generateLoginToken(newUserId, username);
      const loginUrl = buildCatalogUrl(appUrl, token);
      
      bot.sendMessage(chatId,
        `✅ Регистрация успешна!\n\n` +
        `🏪 Ресторан: <b>${restaurantName}</b>\n` +
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
    } catch (error) {
      console.error('Location handler error:', error);
      bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
    }
  });
  
  // Handle callback queries
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;
    
    try {
      bot.answerCallbackQuery(query.id);
      
      // Check if user is blocked
      if (await checkBlockedUser(bot, chatId, userId, restaurantId)) return;
      
      if (data === 'new_order' || data === 'check_delivery') {
        // Ask for location
        bot.sendMessage(chatId,
          '📍 Поделитесь геолокацией для проверки доставки:',
          {
            reply_markup: {
              keyboard: [[{ text: '📍 Поделиться локацией', request_location: true }]],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          }
        );
      }
      
      if (data === 'my_orders') {
        const userResult = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [userId]);
        if (userResult.rows.length === 0) {
          bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
          return;
        }
        
        // Показываем только заказы этого ресторана
        const ordersResult = await pool.query(`
          SELECT order_number, status, total_amount, created_at
          FROM orders WHERE user_id = $1 AND restaurant_id = $2
          ORDER BY created_at DESC LIMIT 5
        `, [userResult.rows[0].id, restaurantId]);
        
        if (ordersResult.rows.length === 0) {
          bot.sendMessage(chatId, '📦 У вас пока нет заказов.', {
            reply_markup: {
              inline_keyboard: [[{ text: '🛒 Новый заказ', callback_data: 'new_order' }]]
            }
          });
          return;
        }
        
        const statusEmoji = { 'new': '🆕', 'preparing': '👨‍🍳', 'delivering': '🚚', 'delivered': '✅', 'cancelled': '❌' };
        let message = '📦 <b>Ваши заказы:</b>\n\n';
        
        ordersResult.rows.forEach((order) => {
          message += `${statusEmoji[order.status] || '📦'} #${order.order_number} — ${parseFloat(order.total_amount).toLocaleString()} сум\n`;
        });
        
        bot.sendMessage(chatId, message, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '🛒 Новый заказ', callback_data: 'new_order' }]]
          }
        });
      }
      
      // Handle feedback
      if (data === 'feedback') {
        registrationStates.set(getStateKey(userId), { 
          step: 'waiting_feedback_type',
          restaurantId 
        });
        
        bot.sendMessage(chatId,
          `📬 <b>Жалобы и предложения</b>\n\n` +
          `Выберите тип обращения:`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '😤 Жалоба', callback_data: 'feedback_type_complaint' }],
                [{ text: '💡 Предложение', callback_data: 'feedback_type_suggestion' }],
                [{ text: '❓ Вопрос', callback_data: 'feedback_type_question' }],
                [{ text: '📝 Другое', callback_data: 'feedback_type_other' }],
                [{ text: '❌ Отмена', callback_data: 'feedback_cancel' }]
              ]
            }
          }
        );
      }
      
      // Handle feedback type selection
      if (data.startsWith('feedback_type_')) {
        const feedbackType = data.replace('feedback_type_', '');
        const state = registrationStates.get(getStateKey(userId)) || {};
        state.step = 'waiting_feedback_message';
        state.feedbackType = feedbackType;
        state.restaurantId = restaurantId;
        registrationStates.set(getStateKey(userId), state);
        
        const typeNames = {
          complaint: 'жалоба',
          suggestion: 'предложение',
          question: 'вопрос',
          other: 'обращение'
        };
        
        bot.sendMessage(chatId,
          `📝 Тип: <b>${typeNames[feedbackType]}</b>\n\n` +
          `Напишите ваше сообщение:`,
          { parse_mode: 'HTML' }
        );
      }
      
      // Cancel feedback
      if (data === 'feedback_cancel') {
        registrationStates.delete(getStateKey(userId));
        bot.sendMessage(chatId, '❌ Отменено');
      }
      
      // Handle order confirmation
      if (data.startsWith('confirm_order_')) {
        const orderId = data.split('_')[2];
        const operatorName = query.from.first_name || 'Оператор';
        
        // Update order status
        await pool.query(
          `UPDATE orders SET status = 'preparing', processed_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [orderId]
        );
        
        // Get order for customer notification
        const orderResult = await pool.query(
          `SELECT o.*, u.telegram_id FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = $1`,
          [orderId]
        );
        
        if (orderResult.rows.length > 0) {
          const order = orderResult.rows[0];
          if (order.telegram_id) {
            try {
              bot.sendMessage(order.telegram_id,
                `✅ <b>Заказ #${order.order_number} принят!</b>\n\n👨‍🍳 Ваш заказ готовится.\nОжидайте доставку!`,
                { parse_mode: 'HTML' }
              );
            } catch (e) {}
          }
        }
        
        bot.editMessageReplyMarkup(
          { inline_keyboard: [[{ text: '✅ Принят: ' + operatorName, callback_data: 'done' }]] },
          { chat_id: chatId, message_id: query.message.message_id }
        );
      }
      
      // Handle order rejection
      if (data.startsWith('reject_order_')) {
        const orderId = data.split('_')[2];
        const operatorName = query.from.first_name || 'Оператор';
        
        registrationStates.set(getStateKey(userId), {
          step: 'waiting_rejection_reason',
          orderId,
          operatorName,
          messageId: query.message.message_id
        });
        
        bot.sendMessage(chatId, `📝 Укажите причину отмены заказа #${orderId}:`);
      }
      
    } catch (error) {
      console.error('Callback query error:', error);
    }
  });
  
  // Error handling
  bot.on('polling_error', (error) => {
    if (error.response?.body?.error_code === 409) {
      console.warn(`⚠️  Bot conflict for ${restaurantName}: Another instance running`);
    } else {
      console.error(`Telegram polling error for ${restaurantName}:`, error.message);
    }
  });
}

// Initialize all restaurant bots
async function initMultiBots() {
  console.log('🤖 Initializing multi-bot system...');
  
  try {
    // Get all restaurants with bot tokens from database
    const result = await pool.query(`
      SELECT id, name, telegram_bot_token, telegram_group_id 
      FROM restaurants 
      WHERE is_active = true AND telegram_bot_token IS NOT NULL AND telegram_bot_token != ''
    `);
    
    console.log(`📋 Found ${result.rows.length} restaurants with bot tokens`);
    
    const isProduction = process.env.NODE_ENV === 'production';
    const webhookBaseUrl = process.env.TELEGRAM_WEBHOOK_URL || process.env.BACKEND_URL || process.env.FRONTEND_URL || process.env.TELEGRAM_WEB_APP_URL;
    
    for (const restaurant of result.rows) {
      try {
        console.log(`🔄 Initializing bot for: ${restaurant.name}`);
        
        let bot;
        
        if (isProduction && webhookBaseUrl) {
          // Use webhook in production - unique path per restaurant
          const webhookPath = `/api/telegram/webhook/${restaurant.id}`;
          const webhookUrl = `${webhookBaseUrl}${webhookPath}`;
          
          bot = new TelegramBot(restaurant.telegram_bot_token);
          
          try {
            await bot.setWebHook(webhookUrl);
            console.log(`✅ ${restaurant.name}: Webhook set to ${webhookUrl}`);
          } catch (webhookError) {
            console.error(`❌ Webhook error for ${restaurant.name}:`, webhookError.message);
            // Fallback to polling
            bot = new TelegramBot(restaurant.telegram_bot_token, { polling: true });
            console.log(`⚠️  ${restaurant.name}: Falling back to polling`);
          }
        } else {
          // Use polling in development
          bot = new TelegramBot(restaurant.telegram_bot_token, { polling: true });
          console.log(`✅ ${restaurant.name}: Using polling mode`);
        }
        
        // Store bot reference
        restaurantBots.set(restaurant.telegram_bot_token, {
          bot,
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          groupId: restaurant.telegram_group_id
        });
        
        // Setup handlers
        setupBotHandlers(bot, restaurant.id, restaurant.name, restaurant.telegram_bot_token);
        
      } catch (error) {
        console.error(`❌ Failed to initialize bot for ${restaurant.name}:`, error.message);
      }
    }
    
    console.log(`✅ Multi-bot system initialized: ${restaurantBots.size} bots active`);
    
  } catch (error) {
    console.error('❌ Multi-bot initialization error:', error);
  }
}

// Get bot by token
function getBotByToken(token) {
  const botData = restaurantBots.get(token);
  return botData ? botData.bot : null;
}

// Get bot by restaurant ID
function getBotByRestaurantId(restaurantId) {
  for (const [token, data] of restaurantBots) {
    if (data.restaurantId === restaurantId) {
      return data.bot;
    }
  }
  return null;
}

// Get all bots
function getAllBots() {
  return restaurantBots;
}

// Process webhook for specific restaurant
function processWebhook(restaurantId, update) {
  for (const [token, data] of restaurantBots) {
    if (data.restaurantId === parseInt(restaurantId)) {
      data.bot.processUpdate(update);
      return true;
    }
  }
  return false;
}

module.exports = {
  initMultiBots,
  getBotByToken,
  getBotByRestaurantId,
  getAllBots,
  processWebhook,
  registrationStates
};
