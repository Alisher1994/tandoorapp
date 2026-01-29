const TelegramBot = require('node-telegram-bot-api');
const pool = require('../database/connection');

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

// Try to get bot from multi-bot manager first
function getMultiBotByRestaurantId(restaurantId) {
  try {
    const { getBotByRestaurantId } = require('./multiBotManager');
    return getBotByRestaurantId(restaurantId);
  } catch (error) {
    return null;
  }
}

// Get or create bot for a specific restaurant
function getRestaurantBot(botToken, restaurantId = null) {
  // First try to get from multi-bot manager if restaurantId provided
  if (restaurantId) {
    const multiBot = getMultiBotByRestaurantId(restaurantId);
    if (multiBot) return multiBot;
  }
  
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

// Escape HTML special characters to prevent formatting issues
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Send order notification to admin group with action buttons
 */
async function sendOrderNotification(order, items, chatId = null, botToken = null) {
  if (!chatId) {
    console.warn('⚠️  No chat ID for notifications, skipping');
    return;
  }
  
  if (!botToken) {
    console.warn('⚠️  No bot token for notifications, skipping');
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
      return `${index + 1}. ${escapeHtml(item.product_name)}\n${qty} x ${formatPrice(price)} = ${formatPrice(total)} сум`;
    }).join('\n\n');
    
    // Build location link
    let locationLine = '';
    if (order.delivery_coordinates) {
      const coords = order.delivery_coordinates.split(',').map(c => c.trim());
      if (coords.length === 2) {
        const [lat, lng] = coords;
        const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        locationLine = `<a href="${mapUrl}">📍 Адрес доставки</a>`;
      }
    } else if (order.delivery_address && order.delivery_address !== 'По геолокации') {
      locationLine = `📍 Адрес: ${escapeHtml(order.delivery_address)}`;
    }
    
    // Delivery time
    const deliveryTime = order.delivery_time && order.delivery_time !== 'asap' 
      ? order.delivery_time 
      : 'Как можно быстрее';
    
    // Calculate total
    const productsTotal = parseFloat(order.total_amount);
    
    const message = 
      `<b>ID: ${order.order_number}</b>\n` +
      `Статус: 🆕 Новый\n\n` +
      (locationLine ? `${locationLine}\n` : '') +
      `👤 Клиент: ${escapeHtml(order.customer_name)}\n` +
      `📞 Телефон: ${escapeHtml(order.customer_phone)}\n` +
      `🕐 К времени: ${deliveryTime}\n\n` +
      `<b>Товары</b>\n\n${itemsList}\n\n` +
      `<b>Итого: ${formatPrice(productsTotal)} сум</b>\n\n` +
      (order.comment ? `💬 Комментарий: ${escapeHtml(order.comment)}` : '💬 Комментарий: —');
    
    // Add action buttons
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Подтвердить', callback_data: `confirm_order_${order.id}` },
          { text: '❌ Отказать', callback_data: `reject_order_${order.id}` }
        ]
      ]
    };
    
    console.log(`📤 Sending order ${order.id} notification to ${chatId} with buttons`);
    
    const result = await bot.sendMessage(chatId, message, { 
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: keyboard
    });
    
    if (order?.id && result?.message_id) {
      try {
        await pool.query(
          `UPDATE orders 
           SET admin_message_id = $1, admin_chat_id = $2 
           WHERE id = $3`,
          [result.message_id, String(chatId), order.id]
        );
      } catch (e) {
        console.error('Failed to store admin message id:', e.message);
      }
    }

    console.log(`✅ Order notification sent, message_id: ${result.message_id}`);
  } catch (error) {
    console.error('Send order notification error:', error);
  }
}

/**
 * Replace placeholders in message template
 * Available placeholders:
 * {order_number} - Order number
 * {customer_name} - Customer name
 * {customer_phone} - Customer phone
 * {total_amount} - Total amount
 * {delivery_address} - Delivery address
 * {payment_method} - Payment method
 */
function replacePlaceholders(template, order) {
  if (!template) return template;
  
  const paymentMethods = {
    'cash': 'Наличные',
    'click': 'Click',
    'payme': 'Payme',
    'card': 'Карта'
  };
  
  return template
    .replace(/{order_number}/g, order.order_number || '')
    .replace(/{customer_name}/g, order.customer_name || '')
    .replace(/{customer_phone}/g, order.customer_phone || '')
    .replace(/{total_amount}/g, formatPrice(order.total_amount))
    .replace(/{delivery_address}/g, order.delivery_address || '')
    .replace(/{payment_method}/g, paymentMethods[order.payment_method] || order.payment_method || '');
}

/**
 * Send order status update to user
 * @param {Object} customMessages - Custom messages from restaurant settings { msg_new, msg_preparing, msg_delivering, msg_delivered, msg_cancelled }
 */
async function sendOrderUpdateToUser(telegramId, order, status, botToken = null, restaurantPaymentUrls = null, customMessages = null) {
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
    
    // Default messages
    const defaultMessages = {
      'new': '📦 Ваш заказ в обработке!',
      'preparing': '👨‍🍳 Ваш заказ готовится',
      'delivering': '🚗 Ваш заказ в пути',
      'delivered': '✅ Ваш заказ доставлен!',
      'cancelled': '❌ Заказ отменен'
    };
    
    // Use custom message if provided, otherwise use default
    let statusText = defaultMessages[status] || 'Обновление заказа';
    if (customMessages) {
      const customMsgKey = `msg_${status}`;
      if (customMessages[customMsgKey]) {
        // Replace placeholders in custom message
        statusText = replacePlaceholders(customMessages[customMsgKey], order);
      }
    }
    
    const tag = statusTags[status] || '#обновлен';
    
    // Build payment link for new orders
    let paymentLine = '';
    if (status === 'new' && order.payment_method && restaurantPaymentUrls) {
      if (order.payment_method === 'click' && restaurantPaymentUrls.click_url) {
        paymentLine = `\nСсылка для оплаты: <a href="${restaurantPaymentUrls.click_url}">Click</a>`;
      } else if (order.payment_method === 'payme' && restaurantPaymentUrls.payme_url) {
        paymentLine = `\nСсылка для оплаты: <a href="${restaurantPaymentUrls.payme_url}">Payme</a>`;
      }
    }
    
    const message = 
      `<b>ID: ${order.order_number}</b> ${tag}\n\n` +
      `${statusText}\n\n` +
      `Сумма заказа: ${formatPrice(order.total_amount)} сум` +
      paymentLine;
    
    // Add "New Order" button for delivered/cancelled orders (not for new - they have payment link)
    const showNewOrderButton = status === 'delivered' || status === 'cancelled';
    
    const options = { 
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: showNewOrderButton ? {
        inline_keyboard: [
          [{ text: '🛒 Новый заказ', callback_data: 'new_order' }]
        ]
      } : undefined
    };
    
    await bot.sendMessage(telegramId, message, options);
    console.log(`✅ Order update sent to user ${telegramId}`);
  } catch (error) {
    console.error('Send order update error:', error);
  }
}

async function updateOrderNotificationForCustomerCancel(order, botToken = null, fallbackChatId = null) {
  const bot = getRestaurantBot(botToken);
  if (!bot) {
    console.warn('⚠️  Bot not initialized, cannot update group message');
    return;
  }

  const targetChatId = order?.admin_chat_id || fallbackChatId;
  const messageId = order?.admin_message_id;
  
  if (!targetChatId) {
    console.warn('⚠️  No chat ID for group update, skipping');
    return;
  }

  const message =
    `❌ <b>Клиент отменил заказ #${order.order_number}</b>\n\n` +
    `Статус: Отменен клиентом`;

  try {
    if (messageId) {
      await bot.editMessageText(message, {
        chat_id: targetChatId,
        message_id: messageId,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [] }
      });
    } else {
      await bot.sendMessage(targetChatId, message, { parse_mode: 'HTML' });
    }
  } catch (error) {
    console.error('Update group message error:', error);
  }
}

module.exports = { sendOrderNotification, sendOrderUpdateToUser, updateOrderNotificationForCustomerCancel, getRestaurantBot };
