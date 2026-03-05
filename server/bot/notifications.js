const TelegramBot = require('node-telegram-bot-api');
const pool = require('../database/connection');
const jwt = require('jsonwebtoken');
const TELEGRAM_ITEMS_HARD_LIMIT = 20;
const TELEGRAM_COMMENT_LIMIT = 360;

// Cache for restaurant-specific bots
const restaurantBots = new Map();
const customerOrderStatusMessageCache = new Map();

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
  const numeric = parseNumericValue(price);
  const rounded = Math.round((numeric + Number.EPSILON) * 100) / 100;
  const hasFraction = Math.abs(rounded % 1) > 0.0000001;
  return rounded
    .toLocaleString('ru-RU', {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2
    })
    .replace(/\u00A0/g, ' ');
}

// Escape HTML special characters to prevent formatting issues
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseNumericValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const trimmed = value.replace(/\u00A0/g, ' ').trim();
  if (!trimmed) return 0;

  // Handle malformed legacy formatted values like "120 999 98".
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (!trimmed.includes(',') && parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1]) && parts[parts.length - 1].length === 2) {
    const legacyNormalized = `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}`;
    const parsedLegacy = Number.parseFloat(legacyNormalized);
    if (Number.isFinite(parsedLegacy)) return parsedLegacy;
  }

  const normalized = trimmed.replace(/\s+/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeContainerNorm(value, fallback = 1) {
  const parsed = parseNumericValue(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function resolveContainerUnits(quantityValue, normValue) {
  const quantity = parseNumericValue(quantityValue);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  const normalizedNorm = normalizeContainerNorm(normValue, 1);
  return Math.ceil(quantity / normalizedNorm);
}

function truncateText(value, maxLength) {
  const text = String(value ?? '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function buildItemsList(items = []) {
  if (!Array.isArray(items) || items.length === 0) return '—';

  if (items.length > TELEGRAM_ITEMS_HARD_LIMIT) {
    return `📦 Список товаров скрыт.\nПозиции в заказе: ${items.length}\nНажмите «🔎 Детали», чтобы посмотреть состав заказа.`;
  }

  return items.map((item, index) => {
    const qty = parseNumericValue(item.quantity);
    const price = parseNumericValue(item.price);
    const total = qty * price;
    const itemName = escapeHtml(item.product_name || 'Товар');
    return `№${index + 1}. ${itemName}\n${formatPrice(qty)} x ${formatPrice(price)} = ${formatPrice(total)} сум`;
  }).join('\n\n');
}

function parseDeliveryCoordinates(rawCoordinates) {
  if (!rawCoordinates) return null;
  const coords = String(rawCoordinates).split(',').map((part) => part.trim());
  if (coords.length !== 2) return null;

  const lat = Number(coords[0]);
  const lng = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}

function buildTaxiUrlFromTemplate(template, lat, lng) {
  return String(template)
    .replace(/\{lat\}/gi, encodeURIComponent(String(lat)))
    .replace(/\{lng\}/gi, encodeURIComponent(String(lng)))
    .replace(/\{lon\}/gi, encodeURIComponent(String(lng)));
}

function buildMyTaxiUrl(lat, lng) {
  const template = String(process.env.MY_TAXI_URL_TEMPLATE || '').trim();
  if (!template) {
    return buildTaxiUrlFromTemplate('mytaxiapp://start?q={lat},{lng}', lat, lng);
  }

  return buildTaxiUrlFromTemplate(template, lat, lng);
}

function buildMilleniumTaxiUrl(lat, lng) {
  const template = String(process.env.MILLENIUM_TAXI_URL_TEMPLATE || '').trim();
  if (!template) {
    return 'app_name://order';
  }

  return buildTaxiUrlFromTemplate(template, lat, lng);
}

function buildDeliveryLinksLine(rawCoordinates) {
  const parsed = parseDeliveryCoordinates(rawCoordinates);
  if (!parsed) return '';

  const { lat, lng } = parsed;
  const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const yandexMapUrl = `https://yandex.ru/maps/?pt=${lng},${lat}&z=17&l=map`;
  const yandexGoUrl = `https://3.redirect.appmetrica.yandex.com/route?end-lat=${lat}&end-lon=${lng}&appmetrica_tracking_id=1178268795219780156`;
  const myTaxiUrl = buildMyTaxiUrl(lat, lng);
  const milleniumTaxiUrl = buildMilleniumTaxiUrl(lat, lng);

  return `📍 Адрес доставки: <a href="${googleMapsUrl}">Google</a> | <a href="${yandexMapUrl}">Яндекс Карты</a> | <a href="${yandexGoUrl}">Яндекс Go</a> | <a href="${myTaxiUrl}">My Taxi</a> | <a href="${milleniumTaxiUrl}">Millenium Taxi</a>`;
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

function getFrontendBaseUrl() {
  const base = process.env.FRONTEND_URL || process.env.TELEGRAM_WEB_APP_URL;
  if (!base) return null;
  return String(base).replace(/\/$/, '');
}

function buildCustomerCatalogUrl(order) {
  const baseUrl = getFrontendBaseUrl();
  if (!baseUrl || !process.env.JWT_SECRET || !order?.user_id) return null;

  const token = jwt.sign(
    {
      userId: Number(order.user_id),
      username: order.customer_phone || order.customer_name || `user_${order.user_id}`,
      autoLogin: true,
      ...(order?.restaurant_id ? { restaurantId: Number(order.restaurant_id) } : {})
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  return `${baseUrl}/catalog?token=${encodeURIComponent(token)}`;
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

  const itemsList = buildItemsList(items);

  let locationLine = '';
  if (revealSensitive) {
    if (order.delivery_coordinates) {
      locationLine = buildDeliveryLinksLine(order.delivery_coordinates);
    } else if (order.delivery_address && order.delivery_address !== 'По геолокации') {
      locationLine = `📍 Адрес: ${escapeHtml(order.delivery_address)}`;
    }
  }

  const deliveryTime = order.delivery_time && order.delivery_time !== 'asap'
    ? order.delivery_time
    : 'Как можно быстрее';

  const itemsBaseTotal = (items || []).reduce((sum, item) => {
    const qty = parseNumericValue(item.quantity) || 0;
    const price = parseNumericValue(item.price) || 0;
    return sum + (qty * price);
  }, 0);
  const containerTotal = (items || []).reduce((sum, item) => {
    const containerUnits = resolveContainerUnits(item.quantity, item.container_norm);
    const containerPrice = parseNumericValue(item.container_price) || 0;
    return sum + (containerUnits * containerPrice);
  }, 0);
  const serviceFee = parseNumericValue(order.service_fee) || 0;
  const deliveryCost = parseNumericValue(order.delivery_cost) || 0;
  const deliveryDistanceKm = parseNumericValue(order.delivery_distance_km) || 0;
  const calculatedTotal = itemsBaseTotal + containerTotal + serviceFee + deliveryCost;
  const totalAmountRaw = parseNumericValue(order.total_amount);
  const orderTotal = Number.isFinite(totalAmountRaw) ? totalAmountRaw : calculatedTotal;

  const containerLine = containerTotal > 0
    ? `🍽 Пакет / Посуда: ${formatPrice(containerTotal)} сум\n`
    : '';
  const serviceLine = serviceFee > 0
    ? `🛎 Сервис: ${formatPrice(serviceFee)} сум\n`
    : '';
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

  const safeComment = truncateText(order.comment || '', TELEGRAM_COMMENT_LIMIT);

  const message =
    `<b>ID: ${order.order_number}</b>\n` +
    `${getGroupOrderStatusLine(statusKey, operatorName)}\n\n` +
    hiddenHint +
    customerBlock +
    `🕐 К времени: ${deliveryTime}\n\n` +
    `<b>Товары</b>\n\n${itemsList}\n\n` +
    containerLine +
    serviceLine +
    deliveryLine +
    `<b>Итого: ${formatPrice(orderTotal)} сум</b>` +
    `\n\n` +
    (safeComment ? `💬 Комментарий: ${escapeHtml(safeComment)}` : '💬 Комментарий: —');

  return message;
}

function buildGroupOrderActionKeyboard(orderId, stage, operatorName = '', options = {}) {
  const previewUrl = options?.previewUrl || null;
  const showPreview = stage && stage !== 'new';
  const previewButton = showPreview && previewUrl
    ? { text: '🔎 Детали', url: previewUrl }
    : null;

  const withPreview = (row) => {
    if (!previewButton) return row;
    return [...row, previewButton];
  };

  if (stage === 'new') {
    return {
      inline_keyboard: [withPreview([
        { text: '✅ Принять', callback_data: `confirm_order_${orderId}` },
        { text: '❌ Отказать', callback_data: `reject_order_${orderId}` }
      ])]
    };
  }

  if (stage === 'accepted') {
    return { inline_keyboard: [withPreview([{ text: '👨‍🍳 Готовится', callback_data: `order_step_${orderId}_preparing` }])] };
  }

  if (stage === 'preparing') {
    return { inline_keyboard: [withPreview([{ text: '🚚 Доставляется', callback_data: `order_step_${orderId}_delivering` }])] };
  }

  if (stage === 'delivering') {
    return { inline_keyboard: [withPreview([{ text: '✅ Доставлен', callback_data: `order_step_${orderId}_delivered` }])] };
  }

  if (stage === 'done') {
    return { inline_keyboard: [withPreview([{ text: `✅ Завершено${operatorName ? ': ' + operatorName : ''}`, callback_data: 'done' }])] };
  }

  return { inline_keyboard: previewButton ? [[previewButton]] : [] };
}

function resolveGroupOrderStatusMeta(rawStatus) {
  const normalizedStatus = String(rawStatus || '').trim().toLowerCase();

  switch (normalizedStatus) {
    case 'accepted':
      return { statusKey: 'accepted', keyboardStage: 'accepted', revealSensitive: true, clearKeyboard: false };
    case 'in_progress':
    case 'preparing':
      return { statusKey: 'preparing', keyboardStage: 'preparing', revealSensitive: true, clearKeyboard: false };
    case 'delivering':
      return { statusKey: 'delivering', keyboardStage: 'delivering', revealSensitive: true, clearKeyboard: false };
    case 'delivered':
      return { statusKey: 'delivered', keyboardStage: 'done', revealSensitive: true, clearKeyboard: false };
    case 'cancelled':
      return { statusKey: 'cancelled', keyboardStage: null, revealSensitive: true, clearKeyboard: true };
    case 'new':
    default:
      return { statusKey: 'new', keyboardStage: 'new', revealSensitive: false, clearKeyboard: false };
  }
}

async function updateOrderGroupNotification(order, items = [], options = {}) {
  if (!order?.id) return;

  const targetChatId = options.chatId || order.admin_chat_id;
  if (!targetChatId) return;

  const botToken = options.botToken || order.telegram_bot_token || null;
  const bot = getRestaurantBot(botToken, order.restaurant_id);
  if (!bot) {
    console.warn('⚠️  Bot not initialized, cannot update group order message');
    return;
  }

  const operatorName = options.operatorName || '';
  const statusMeta = resolveGroupOrderStatusMeta(options.status || order.status);
  const previewUrl = buildOrderPreviewUrl(order.id);
  const replyMarkup = statusMeta.clearKeyboard
    ? { inline_keyboard: [] }
    : buildGroupOrderActionKeyboard(order.id, statusMeta.keyboardStage, operatorName, { previewUrl });
  const message = buildGroupOrderNotificationPayload(order, items, {
    revealSensitive: statusMeta.revealSensitive,
    statusKey: statusMeta.statusKey,
    operatorName,
    includePreviewLink: false,
    previewUrl
  });

  const messageId = options.messageId || order.admin_message_id;
  const chatIdText = String(targetChatId);

  try {
    if (messageId) {
      try {
        await bot.editMessageText(message, {
          chat_id: chatIdText,
          message_id: Number(messageId),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: replyMarkup
        });
        return;
      } catch (editError) {
        const editErrorMessage = String(editError?.message || '').toLowerCase();
        if (editErrorMessage.includes('message is not modified')) {
          return;
        }
      }
    }

    const sent = await bot.sendMessage(chatIdText, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: replyMarkup
    });

    if (sent?.message_id) {
      await pool.query(
        `UPDATE orders 
         SET admin_message_id = $1, admin_chat_id = $2 
         WHERE id = $3`,
        [sent.message_id, chatIdText, order.id]
      );
    }
  } catch (error) {
    console.error('Update order group notification error:', error);
  }
}

/**
 * Send order notification to admin group with action buttons
 */
async function sendOrderNotification(order, items, chatId = null, botToken = null) {
  const normalizedChatId = chatId === null || chatId === undefined ? '' : String(chatId).trim();
  const normalizedBotToken = botToken === null || botToken === undefined ? '' : String(botToken).trim();

  if (!normalizedChatId) {
    console.warn('⚠️  No chat ID for notifications, skipping');
    return;
  }

  if (!normalizedBotToken) {
    console.warn('⚠️  No bot token for notifications, skipping');
    return;
  }

  const bot = getRestaurantBot(normalizedBotToken, order?.restaurant_id || null);
  if (!bot) {
    console.warn('⚠️  Bot not available for notification');
    return;
  }

  try {
    const message = buildGroupOrderNotificationPayload(order, items, {
      revealSensitive: false,
      statusKey: 'new'
    });
    const keyboard = buildGroupOrderActionKeyboard(order.id, 'new', '', {
      previewUrl: buildOrderPreviewUrl(order.id)
    });

    console.log(`📤 Sending order ${order.id} notification to ${normalizedChatId} with buttons`);

    const result = await bot.sendMessage(normalizedChatId, message, {
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
          [result.message_id, normalizedChatId, order.id]
        );
      } catch (e) {
        console.error('Failed to store admin message id:', e.message);
      }
    }

    console.log(`✅ Order notification sent, message_id: ${result.message_id}`);
  } catch (error) {
    const errorMessage = String(error?.message || '');
    console.error('Send order notification error:', errorMessage);

    const shouldFallback = /message is too long|can't parse entities|bad request/i.test(errorMessage);
    if (!shouldFallback) return;

    try {
      const fallbackItems = (items || [])
        .slice(0, 10)
        .map((item, index) => {
          const qty = parseNumericValue(item.quantity);
          const price = parseNumericValue(item.price);
          return `${index + 1}. ${item.product_name || 'Товар'} — ${formatPrice(qty)} x ${formatPrice(price)}`;
        })
        .join('\n');
      const omittedCount = Math.max(0, (items || []).length - 10);
      const fallbackMessage =
        `Заказ #${order?.order_number || order?.id || '—'}\n` +
        `Сумма: ${formatPrice(order?.total_amount)} сум\n` +
        `${fallbackItems || 'Товары: —'}${omittedCount > 0 ? `\n… и ещё ${omittedCount} позиций` : ''}`;

      const fallbackResult = await bot.sendMessage(normalizedChatId, fallbackMessage, {
        disable_web_page_preview: true
      });
      if (order?.id && fallbackResult?.message_id) {
        await pool.query(
          `UPDATE orders 
           SET admin_message_id = $1, admin_chat_id = $2 
           WHERE id = $3`,
          [fallbackResult.message_id, normalizedChatId, order.id]
        );
      }
      console.log(`✅ Fallback notification sent for order ${order?.id}`);
    } catch (fallbackError) {
      console.error('Fallback order notification error:', fallbackError.message);
    }
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
    'uzum': 'Uzum',
    'xazna': 'Xazna',
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
      } else if (order.payment_method === 'uzum' && restaurantPaymentUrls.uzum_url) {
        paymentLine = `\nСсылка для оплаты: <a href="${restaurantPaymentUrls.uzum_url}">Uzum</a>`;
      } else if (order.payment_method === 'xazna' && restaurantPaymentUrls.xazna_url) {
        paymentLine = `\nСсылка для оплаты: <a href="${restaurantPaymentUrls.xazna_url}">Xazna</a>`;
      }
    }

    const message =
      `<b>ID: ${order.order_number}</b> ${tag}\n\n` +
      `${statusText}\n\n` +
      `Сумма заказа: ${formatPrice(order.total_amount)} сум` +
      paymentLine;

    const inlineKeyboard = [];
    inlineKeyboard.push([{ text: '📋 Мои заказы', callback_data: 'my_orders' }]);

    const options = {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined
    };

    const cacheKey = `${botToken || 'default'}:${telegramId}:${order?.id || order?.order_number || 'order'}`;
    const cached = customerOrderStatusMessageCache.get(cacheKey);

    if (cached?.messageId) {
      try {
        await bot.editMessageText(message, {
          chat_id: telegramId,
          message_id: cached.messageId,
          parse_mode: options.parse_mode,
          disable_web_page_preview: options.disable_web_page_preview,
          reply_markup: options.reply_markup
        });
        customerOrderStatusMessageCache.set(cacheKey, {
          messageId: cached.messageId,
          status,
          updatedAt: Date.now()
        });
        console.log(`✅ Order update edited for user ${telegramId}`);
        return;
      } catch (editError) {
        const editMessage = String(editError?.message || '').toLowerCase();
        if (!editMessage.includes('message is not modified')) {
          try {
            await bot.deleteMessage(telegramId, cached.messageId);
          } catch (_) { }
        } else {
          return;
        }
      }
    }

    const sent = await bot.sendMessage(telegramId, message, options);
    if (sent?.message_id) {
      customerOrderStatusMessageCache.set(cacheKey, {
        messageId: sent.message_id,
        status,
        updatedAt: Date.now()
      });
    }
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

async function notifyRestaurantAdminsLowBalance(restaurantId, currentBalance, options = {}) {
  const normalizedRestaurantId = Number(restaurantId);
  if (!Number.isFinite(normalizedRestaurantId) || normalizedRestaurantId <= 0) return;

  const threshold = Number(options.threshold || process.env.LOW_BALANCE_ALERT_THRESHOLD || 3000);
  const botToken = options.botToken || null;
  const bot = getRestaurantBot(botToken);
  if (!bot) return;

  try {
    const result = await pool.query(
      `SELECT DISTINCT COALESCE(u.telegram_id, tal.telegram_id) AS telegram_id
       FROM users u
       JOIN operator_restaurants opr ON opr.user_id = u.id
       LEFT JOIN telegram_admin_links tal ON tal.user_id = u.id
       WHERE opr.restaurant_id = $1
         AND COALESCE(u.telegram_id, tal.telegram_id) IS NOT NULL
         AND u.is_active = true
         AND u.role IN ('operator', 'superadmin')`,
      [normalizedRestaurantId]
    );

    const recipients = result.rows.map((row) => row.telegram_id).filter(Boolean);
    if (!recipients.length) return;

    const balanceFormatted = formatPrice(currentBalance || 0);
    const thresholdFormatted = formatPrice(threshold || 0);
    const message =
      `⚠️ <b>Низкий баланс магазина</b>\n\n` +
      `На вашем балансе осталось меньше ${thresholdFormatted} сум.\n` +
      `Текущий баланс: <b>${balanceFormatted} сум</b>\n\n` +
      `Пополните баланс, чтобы не остановить прием заказов.`;

    for (const telegramId of recipients) {
      try {
        await bot.sendMessage(telegramId, message, { parse_mode: 'HTML' });
      } catch (_) { }
    }
  } catch (error) {
    console.error('Notify low balance error:', error);
  }
}

module.exports = {
  sendOrderNotification,
  sendOrderUpdateToUser,
  updateOrderNotificationForCustomerCancel,
  sendBalanceNotification,
  notifyRestaurantAdminsLowBalance,
  getRestaurantBot,
  buildGroupOrderNotificationPayload,
  buildGroupOrderActionKeyboard,
  buildOrderPreviewUrl,
  updateOrderGroupNotification
};
