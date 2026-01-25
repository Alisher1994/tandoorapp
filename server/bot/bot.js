const TelegramBot = require('node-telegram-bot-api');
const pool = require('../database/connection');
const bcrypt = require('bcryptjs');
const { sendOrderNotification, sendOrderUpdateToUser } = require('./notifications');

let bot = null;

function initBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN not set, bot will not be initialized');
    return;
  }
  
  // Use webhook in production, polling in development
  const isProduction = process.env.NODE_ENV === 'production';
  const webAppUrl = process.env.TELEGRAM_WEB_APP_URL || process.env.FRONTEND_URL;
  
  if (isProduction && webAppUrl) {
    // Use webhook for production
    const webhookPath = '/api/telegram/webhook';
    const webhookUrl = `${webAppUrl}${webhookPath}`;
    
    bot = new TelegramBot(token);
    
    // Set webhook
    bot.setWebHook(webhookUrl).then(() => {
      console.log(`🤖 Telegram bot initialized with webhook: ${webhookUrl}`);
    }).catch((error) => {
      console.error('❌ Error setting webhook:', error);
      // Fallback to polling if webhook fails
      console.log('⚠️  Falling back to polling mode');
      bot = new TelegramBot(token, { polling: true });
      console.log('🤖 Telegram bot initialized with polling (fallback)');
    });
  } else {
    // Use polling for development
    bot = new TelegramBot(token, { polling: true });
    console.log('🤖 Telegram bot initialized with polling');
  }
  
  // Start command
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
        bot.sendMessage(chatId, 
          `👋 Добро пожаловать, ${user.full_name || user.username}!\n\n` +
          `Ваш логин: ${user.username}\n` +
          `Для входа в систему используйте ваш пароль.\n\n` +
          `🌐 Откройте веб-приложение: ${process.env.TELEGRAM_WEB_APP_URL || 'https://your-app.railway.app'}`
        );
      } else {
        // Start registration
        bot.sendMessage(chatId,
          '👋 Добро пожаловать!\n\n' +
          'Для использования системы необходимо зарегистрироваться.\n\n' +
          'Введите ваше имя:'
        );
        
        // Store registration state
        bot.once('message', async (msg) => {
          if (msg.text && !msg.text.startsWith('/')) {
            const fullName = msg.text;
            
            bot.sendMessage(chatId, 'Введите номер телефона (например: +998901234567):');
            
            bot.once('message', async (phoneMsg) => {
              if (phoneMsg.text && !phoneMsg.text.startsWith('/')) {
                const phone = phoneMsg.text;
                
                // Generate username and password
                const username = `user_${userId}`;
                const password = Math.random().toString(36).slice(-8);
                const hashedPassword = await bcrypt.hash(password, 10);
                
                try {
                  await pool.query(
                    `INSERT INTO users (telegram_id, username, password, full_name, phone, role)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [userId, username, hashedPassword, fullName, phone, 'customer']
                  );
                  
                  bot.sendMessage(chatId,
                    `✅ Регистрация успешна!\n\n` +
                    `📝 Ваши данные для входа:\n` +
                    `Логин: ${username}\n` +
                    `Пароль: ${password}\n\n` +
                    `⚠️ Сохраните эти данные!\n\n` +
                    `🌐 Откройте веб-приложение: ${process.env.TELEGRAM_WEB_APP_URL || 'https://your-app.railway.app'}`
                  );
                } catch (error) {
                  console.error('Registration error:', error);
                  bot.sendMessage(chatId, '❌ Ошибка регистрации. Попробуйте позже.');
                }
              }
            });
          }
        });
      }
    } catch (error) {
      console.error('Start command error:', error);
      bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
    }
  });
  
  // Help command
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
      '📖 Справка:\n\n' +
      '/start - Начать/Войти\n' +
      '/help - Показать справку\n' +
      '/orders - Мои заказы\n\n' +
      `🌐 Веб-приложение: ${process.env.TELEGRAM_WEB_APP_URL || 'https://your-app.railway.app'}`
    );
  });
  
  // My orders command
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
        `SELECT o.*, 
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
         LEFT JOIN order_items oi ON o.id = oi.order_id
         WHERE o.user_id = $1
         GROUP BY o.id
         ORDER BY o.created_at DESC
         LIMIT 10`,
        [userResult.rows[0].id]
      );
      
      if (ordersResult.rows.length === 0) {
        bot.sendMessage(chatId, '📦 У вас пока нет заказов');
        return;
      }
      
      let message = '📦 Ваши последние заказы:\n\n';
      
      ordersResult.rows.forEach((order, index) => {
        const statusEmoji = {
          'new': '🆕',
          'preparing': '👨‍🍳',
          'delivering': '🚚',
          'delivered': '✅',
          'cancelled': '❌'
        };
        
        message += `${statusEmoji[order.status] || '📦'} Заказ #${order.order_number}\n`;
        message += `Статус: ${getStatusText(order.status)}\n`;
        message += `Сумма: ${order.total_amount} сум\n`;
        message += `Дата: ${new Date(order.created_at).toLocaleDateString('ru-RU')}\n\n`;
      });
      
      bot.sendMessage(chatId, message);
    } catch (error) {
      console.error('Orders command error:', error);
      bot.sendMessage(chatId, '❌ Ошибка получения заказов');
    }
  });
  
  // Error handling
  bot.on('polling_error', (error) => {
    if (error.response && error.response.body && error.response.body.error_code === 409) {
      console.warn('⚠️  Telegram bot conflict: Another instance is running. This is normal if using webhook.');
      // Don't exit, just log the warning
    } else {
      console.error('Telegram polling error:', error);
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

