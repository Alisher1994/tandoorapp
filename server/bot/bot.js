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
    const result = await pool.query(`
      SELECT id, name, delivery_zone, logo_url, open_time, close_time
      FROM restaurants 
      WHERE is_active = true AND delivery_zone IS NOT NULL
    `);
    
    for (const restaurant of result.rows) {
      let zone = restaurant.delivery_zone;
      
      // Parse if string
      if (typeof zone === 'string') {
        zone = JSON.parse(zone);
      }
      
      if (zone && isPointInPolygon([lat, lng], zone)) {
        return restaurant;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Find restaurant error:', error);
    return null;
  }
}

function isRestaurantOpen(openTime, closeTime) {
  if (!openTime || !closeTime) return true;
  const now = new Date();
  const [openH, openM] = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

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
        
        // User already registered - always ask for location first
        registrationStates.set(userId, { 
          step: 'waiting_location_for_order',
          isExistingUser: true 
        });
        
        bot.sendMessage(chatId, 
          `👋 С возвращением, ${user.full_name}!\n\n` +
          `📍 Укажите адрес доставки:`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              keyboard: [[
                { text: '📍 Отправить локацию', request_location: true }
              ]],
              resize_keyboard: true,
              one_time_keyboard: true
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
  // Handle text messages (for name input)
  // =====================================================
  bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    // Skip commands
    if (text.startsWith('/')) return;
    
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
    
    const state = registrationStates.get(userId);
    if (!state || (state.step !== 'waiting_location' && state.step !== 'waiting_location_for_order')) return;
    
    try {
      // Check if location is in any delivery zone
      const restaurant = await findRestaurantByLocation(location.latitude, location.longitude);
      
      if (restaurant) {
        if (!isRestaurantOpen(restaurant.open_time, restaurant.close_time)) {
          bot.sendMessage(chatId,
            `😔 Извините, данный ресторан работает с ${restaurant.open_time || '??:??'} по ${restaurant.close_time || '??:??'}.`,
            { reply_markup: { remove_keyboard: true } }
          );
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
          
          if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            
            // Save location to database
            await pool.query(`
              UPDATE users 
              SET last_latitude = $1, last_longitude = $2, active_restaurant_id = $3
              WHERE id = $4
            `, [location.latitude, location.longitude, restaurant.id, user.id]);
            
            const token = generateLoginToken(user.id, user.username);
            const loginUrl = buildCatalogUrl(appUrl, token);
            
            // Clear state
            registrationStates.delete(userId);
            
            bot.sendMessage(chatId,
              `✅ Отлично! Доставка доступна!\n\n` +
              `🏪 Ресторан: <b>${restaurant.name}</b>`,
              {
                parse_mode: 'HTML',
                reply_markup: {
                  remove_keyboard: true,
                  inline_keyboard: [
                    [{ text: '🍽️ Открыть меню', web_app: { url: loginUrl } }]
                  ]
                }
              }
            );
          }
          return;
        }
        
        // New user registration - complete registration
        const username = `user_${userId}`;
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
            active_restaurant_id = EXCLUDED.active_restaurant_id
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
                [{ text: '🍽️ Открыть меню', web_app: { url: loginUrl } }]
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
        bot.sendMessage(chatId, '📦 У вас пока нет заказов.\n\nИспользуйте /menu чтобы сделать заказ.');
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
      
      bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Orders command error:', error);
      bot.sendMessage(chatId, '❌ Ошибка получения заказов');
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
