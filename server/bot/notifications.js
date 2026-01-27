const TelegramBot = require('node-telegram-bot-api');

const DEFAULT_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

// Cache for restaurant-specific bots
const restaurantBots = new Map();

// Lazy import to avoid circular dependency
function getDefaultBot() {
  try {
    const { getBot: getBotInstance } = require('./bot');
    return getBotInstance();
  } catch (error) {
    return null;
  }
}

// Get or create bot for a specific restaurant
function getRestaurantBot(botToken) {
  if (!botToken) {
    return getDefaultBot();
  }
  
  // Check if we already have a bot instance for this token
  if (restaurantBots.has(botToken)) {
    return restaurantBots.get(botToken);
  }
  
  // Create new bot instance for this restaurant
  try {
    const bot = new TelegramBot(botToken);
    restaurantBots.set(botToken, bot);
    return bot;
  } catch (error) {
    console.error('Error creating restaurant bot:', error);
    return getDefaultBot();
  }
}

/**
 * Send order notification to admin group
 * @param {Object} order - Order object
 * @param {Array} items - Order items
 * @param {string} chatId - Optional restaurant-specific chat ID
 * @param {string} botToken - Optional restaurant-specific bot token
 */
async function sendOrderNotification(order, items, chatId = null, botToken = null) {
  const targetChatId = chatId || DEFAULT_ADMIN_CHAT_ID;
  
  if (!targetChatId) {
    console.warn('⚠️  No chat ID for notifications, skipping');
    return;
  }
  
  const bot = getRestaurantBot(botToken);
  if (!bot) {
    console.warn('⚠️  Bot not available for notification');
    return;
  }
  
  try {
    const itemsList = items.map((item, index) => 
      `${index + 1}. ${item.product_name} - ${item.quantity} ${item.unit || 'шт'} × ${item.price} = ${(item.quantity * item.price).toFixed(2)} сум`
    ).join('\n');
    
    const paymentEmoji = order.payment_method === 'card' ? '💳' : '💵';
    const paymentText = order.payment_method === 'card' ? 'Карта' : 'Наличные';
    
    let locationLink = order.delivery_address || 'Не указан';
    if (order.delivery_coordinates) {
      const [lat, lng] = order.delivery_coordinates.split(',').map(c => c.trim());
      const yandexMapsUrl = `https://yandex.ru/maps/?pt=${lng},${lat}&z=17&l=map`;
      locationLink = `<a href="${yandexMapsUrl}">${order.delivery_address || 'Открыть карту'}</a>`;
    }
    
    const message = 
      `🛒 <b>Новый заказ #${order.order_number}</b>\n\n` +
      `👤 <b>Клиент:</b> ${order.customer_name}\n` +
      `📞 <b>Телефон:</b> <a href="tel:${order.customer_phone}">${order.customer_phone}</a>\n` +
      `📍 <b>Адрес:</b> ${locationLink}\n` +
      `${paymentEmoji} <b>Оплата:</b> ${paymentText}\n` +
      `💰 <b>Сумма:</b> ${order.total_amount} сум\n\n` +
      `🛍️ <b>Состав заказа:</b>\n${itemsList}\n\n` +
      (order.comment ? `💬 <b>Комментарий:</b> ${order.comment}\n\n` : '') +
      `📅 <b>Дата доставки:</b> ${order.delivery_date || 'Не указана'} ${order.delivery_time || ''}`;
    
    await bot.sendMessage(targetChatId, message, { parse_mode: 'HTML' });
    console.log(`✅ Order notification sent to ${targetChatId}`);
  } catch (error) {
    console.error('Send order notification error:', error);
  }
}

/**
 * Send order status update to user
 * @param {number} telegramId - User's Telegram ID
 * @param {Object} order - Order object
 * @param {string} status - New status
 * @param {string} botToken - Optional restaurant-specific bot token
 */
async function sendOrderUpdateToUser(telegramId, order, status, botToken = null) {
  if (!telegramId) return;
  
  const bot = getRestaurantBot(botToken);
  if (!bot) {
    console.warn('⚠️  Bot not initialized, cannot send update');
    return;
  }
  
  try {
    const statusMessages = {
      'new': '🆕 Ваш заказ принят и обрабатывается',
      'preparing': '👨‍🍳 Ваш заказ готовится',
      'delivering': '🚚 Ваш заказ доставляется',
      'delivered': '✅ Ваш заказ доставлен',
      'cancelled': '❌ Ваш заказ отменен'
    };
    
    const message = 
      `${statusMessages[status] || '📦 Обновление заказа'}\n\n` +
      `Заказ #${order.order_number}\n` +
      `Сумма: ${order.total_amount} сум\n` +
      `Статус: ${getStatusText(status)}`;
    
    await bot.sendMessage(telegramId, message);
    console.log(`✅ Order update sent to user ${telegramId}`);
  } catch (error) {
    console.error('Send order update error:', error);
  }
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

module.exports = { sendOrderNotification, sendOrderUpdateToUser };
