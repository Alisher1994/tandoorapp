const TelegramBot = require('node-telegram-bot-api');
const pool = require('../database/connection');
const jwt = require('jsonwebtoken');

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

function getPublicBaseUrl() {
  const candidates = [
    process.env.BACKEND_URL,
    process.env.TELEGRAM_WEBHOOK_URL,
    process.env.FRONTEND_URL,
    process.env.TELEGRAM_WEB_APP_URL
  ].filter(Boolean);

  const raw = candidates[0];
  if (!raw) return null;

  try {
    const url = new URL(raw);
    // If TELEGRAM_WEBHOOK_URL is used, normalize to site root.
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(raw).replace(/\/api\/telegram\/webhook.*$/, '').replace(/\/$/, '');
  }
}

function buildOrderPreviewUrl(orderId) {
  const baseUrl = getPublicBaseUrl();
  if (!baseUrl || !process.env.JWT_SECRET || !orderId) return null;

  const token = jwt.sign(
    { type: 'order_preview', orderId: Number(orderId) },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  return `${baseUrl}/api/orders/operator-preview?token=${encodeURIComponent(token)}`;
}

function getGroupOrderStatusLine(statusKey, operatorName = '') {
  const operatorSafe = escapeHtml(operatorName);
  switch (statusKey) {
    case 'accepted':
      return `Статус: ✅ Принят${operatorSafe ? ` (${operatorSafe})` : ''}`;
    case 'preparing':
      return `Статус: 👨‍🍳 Готовится${operatorSafe ? ` (${operatorSafe})` : ''}`;
    case 'delivering':
      return `Статус: 🚚 Доставляется${operatorSafe ? ` (${operatorSafe})` : ''}`;
    case 'delivered':
      return `Статус: ✅ Доставлен${operatorSafe ? ` (${operatorSafe})` : ''}`;
    case 'cancelled':
      return `Статус: ❌ Отменен${operatorSafe ? ` (${operatorSafe})` : ''}`;
    default:
      return 'Статус: 🆕 Новый';
  }
}

function buildGroupOrderNotificationPayload(order, items, options = {}) {
  const {
    revealSensitive = false,
    statusKey = 'new',
    operatorName = '',
    includePreviewLink = false,
    previewUrl = null
  } = options;

  const itemsList = (items || []).map((item, index) => {
    const qty = parseFloat(item.quantity);
    const price = parseFloat(item.price);
    const total = qty * price;
    return `${index + 1}. ${escapeHtml(item.product_name)}\n${qty} x ${formatPrice(price)} = ${formatPrice(total)} сум`;
  }).join('\n\n');

  let locationLine = '';
  if (revealSensitive) {
    if (order.delivery_coordinates) {
      const coords = String(order.delivery_coordinates).split(',').map(c => c.trim());
      if (coords.length === 2) {
        const [lat, lng] = coords;
        const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        locationLine = `<a href="${mapUrl}">📍 Адрес доставки</a>`;
      }
    } else if (order.delivery_address && order.delivery_address !== 'По геолокации') {
      locationLine = `📍 Адрес: ${escapeHtml(order.delivery_address)}`;
    }
  }

  const deliveryTime = order.delivery_time && order.delivery_time !== 'asap'
    ? order.delivery_time
    : 'Как можно быстрее';

  const productsTotal = parseFloat(order.total_amount);
  const deliveryCost = parseFloat(order.delivery_cost) || 0;
  const deliveryDistanceKm = parseFloat(order.delivery_distance_km) || 0;

  let deliveryLine = '';
  if (deliveryCost > 0) {
    deliveryLine = `🚗 Доставка: ${formatPrice(deliveryCost)} сум`;
    if (deliveryDistanceKm > 0) {
      deliveryLine += ` (${deliveryDistanceKm} км)`;
    }
    deliveryLine += '\n';
  }

  const hiddenHint = !revealSensitive
    ? '🔒 Данные клиента будут показаны после нажатия «Принять».\n\n'
    : '';

  const customerBlock = revealSensitive
    ? (
      (locationLine ? `${locationLine}\n` : '') +
      `👤 Клиент: ${escapeHtml(order.customer_name)}\n` +
      `📞 Телефон: ${escapeHtml(order.customer_phone)}\n`
    )
    : '';

  const previewLine = includePreviewLink && previewUrl
    ? `\n🔎 Веб-детали: <a href="${previewUrl}">открыть заказ</a>`
    : '';

  const message =
    `<b>ID: ${order.order_number}</b>\n` +
    `${getGroupOrderStatusLine(statusKey, operatorName)}\n\n` +
    hiddenHint +
    customerBlock +
    `🕐 К времени: ${deliveryTime}\n\n` +
    `<b>Товары</b>\n\n${itemsList}\n\n` +
    deliveryLine +
    `<b>Итого: ${formatPrice(productsTotal)} сум</b>` +
    previewLine +
    `\n\n` +
    (order.comment ? `💬 Комментарий: ${escapeHtml(order.comment)}` : '💬 Комментарий: —');

  return message;
}

function buildGroupOrderActionKeyboard(orderId, stage, operatorName = '') {
  if (stage === 'new') {
    return {
      inline_keyboard: [[
        { text: '✅ Принять', callback_data: `confirm_order_${orderId}` },
        { text: '❌ Отказать', callback_data: `reject_order_${orderId}` }
      ]]
    };
  }

  if (stage === 'accepted') {
    return { inline_keyboard: [[{ text: '👨‍🍳 Готовится', callback_data: `order_step_${orderId}_preparing` }]] };
  }

  if (stage === 'preparing') {
    return { inline_keyboard: [[{ text: '🚚 Доставляется', callback_data: `order_step_${orderId}_delivering` }]] };
  }

  if (stage === 'delivering') {
    return { inline_keyboard: [[{ text: '✅ Доставлен', callback_data: `order_step_${orderId}_delivered` }]] };
  }

  if (stage === 'done') {
    return { inline_keyboard: [[{ text: `✅ Завершено${operatorName ? ': ' + operatorName : ''}`, callback_data: 'done' }]] };
  }

  return { inline_keyboard: [] };
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
    const message = buildGroupOrderNotificationPayload(order, items, {
      revealSensitive: false,
      statusKey: 'new'
    });
    const keyboard = buildGroupOrderActionKeyboard(order.id, 'new');

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

async function sendBalanceNotification(telegramId, amount, currentBalance, botToken = null) {
  if (!telegramId) return;

  const bot = getRestaurantBot(botToken);
  if (!bot) return;

  const message =
    `💰 <b>Пополнение баланса!</b>\n\n` +
    `Сумма: +${formatPrice(amount)} сум\n` +
    `Текущий баланс: <b>${formatPrice(currentBalance)} сум</b>\n\n` +
    `Вы можете продолжать принимать заказы.`;

  try {
    await bot.sendMessage(telegramId, message, { parse_mode: 'HTML' });
    console.log(`✅ Balance notification sent to user ${telegramId}`);
  } catch (error) {
    console.error('Send balance notification error:', error);
  }
}

module.exports = {
  sendOrderNotification,
  sendOrderUpdateToUser,
  updateOrderNotificationForCustomerCancel,
  sendBalanceNotification,
  getRestaurantBot,
  buildGroupOrderNotificationPayload,
  buildGroupOrderActionKeyboard,
  buildOrderPreviewUrl
};
