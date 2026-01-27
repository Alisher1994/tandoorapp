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
  
  if (restaurantBots.has(botToken)) {
    return restaurantBots.get(botToken);
  }
  
  try {
    const bot = new TelegramBot(botToken);
    restaurantBots.set(botToken, bot);
    return bot;
  } catch (error) {
    console.error('Error creating restaurant bot:', error);
    return getDefaultBot();
  }
}

// Format price with thousands separator
function formatPrice(price) {
  return parseFloat(price).toLocaleString('ru-RU');
}

/**
 * Send order notification to admin group
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
    // Build items list
    const itemsList = items.map((item, index) => {
      const qty = parseFloat(item.quantity);
      const price = parseFloat(item.price);
      const total = qty * price;
      return `${index + 1}. ${item.product_name}\n${qty} x ${formatPrice(price)} = ${formatPrice(total)} сум`;
    }).join('\n\n');
    
    // Build location link - "Адрес доставки" is clickable link to map
    let locationLine = '';
    if (order.delivery_coordinates) {
      const coords = order.delivery_coordinates.split(',').map(c => c.trim());
      if (coords.length === 2) {
        const [lat, lng] = coords;
        const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        locationLine = `<a href="${mapUrl}">Адрес доставки</a>: 🗺 На карте`;
      }
    } else if (order.delivery_address && order.delivery_address !== 'По геолокации') {
      locationLine = `Адрес доставки: 📍 ${order.delivery_address}`;
    }
    
    // Calculate total
    const productsTotal = parseFloat(order.total_amount);
    
    const message = 
      `<b>ID: ${order.order_number}</b> #новый\n\n` +
      (locationLine ? `${locationLine}\n` : '') +
      `Телефон: ${order.customer_phone}\n\n` +
      `<b>Товары</b>\n\n${itemsList}\n\n` +
      (order.comment ? `Комментарий: ${order.comment}\n\n` : 'Комментарий: Не указан\n\n') +
      `<b>Итого: ${formatPrice(productsTotal)} сум</b>\n\n` +
      `Получатель: ${order.customer_name}`;
    
    await bot.sendMessage(targetChatId, message, { 
      parse_mode: 'HTML',
      disable_web_page_preview: true 
    });
    console.log(`✅ Order notification sent to ${targetChatId}`);
  } catch (error) {
    console.error('Send order notification error:', error);
  }
}

/**
 * Send order status update to user
 */
async function sendOrderUpdateToUser(telegramId, order, status, botToken = null) {
  if (!telegramId) return;
  
  const bot = getRestaurantBot(botToken);
  if (!bot) {
    console.warn('⚠️  Bot not initialized, cannot send update');
    return;
  }
  
  try {
    const statusTags = {
      'new': '#новый',
      'preparing': '#готовится',
      'delivering': '#доставляется',
      'delivered': '#доставлен',
      'cancelled': '#отменен'
    };
    
    const statusMessages = {
      'new': '✅ Ваш заказ принят!',
      'preparing': '👨‍🍳 Ваш заказ готовится',
      'delivering': '🚗 Ваш заказ в пути',
      'delivered': '✅ Ваш заказ доставлен!',
      'cancelled': '❌ Заказ отменен'
    };
    
    const tag = statusTags[status] || '#обновлен';
    const statusText = statusMessages[status] || 'Обновление заказа';
    
    const message = 
      `<b>ID: ${order.order_number}</b> ${tag}\n\n` +
      `${statusText}\n\n` +
      `Сумма: ${formatPrice(order.total_amount)} сум`;
    
    // Add "New Order" button for delivered/cancelled orders
    const showNewOrderButton = status === 'delivered' || status === 'cancelled' || status === 'new';
    
    const options = { 
      parse_mode: 'HTML',
      reply_markup: showNewOrderButton ? {
        inline_keyboard: [
          [{ text: '🛒 Начать новый заказ', callback_data: 'new_order' }]
        ]
      } : undefined
    };
    
    await bot.sendMessage(telegramId, message, options);
    console.log(`✅ Order update sent to user ${telegramId}`);
  } catch (error) {
    console.error('Send order update error:', error);
  }
}

module.exports = { sendOrderNotification, sendOrderUpdateToUser };
