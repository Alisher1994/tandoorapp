const TelegramBot = require('node-telegram-bot-api');
const pool = require('../database/connection');
const jwt = require('jsonwebtoken');
const { ensureOrderRatingsSchema, normalizeOrderRating } = require('../services/orderRatings');
const TELEGRAM_ITEMS_HARD_LIMIT = 20;
const TELEGRAM_COMMENT_LIMIT = 360;
const DEFAULT_BOT_TIME_ZONE = 'Asia/Tashkent';
const LOW_RATING_THRESHOLD = 2;

function resolveBotTimeZone() {
  const candidates = [
    process.env.BOT_TIMEZONE,
    process.env.TELEGRAM_TIMEZONE,
    process.env.APP_TIMEZONE,
    process.env.TZ,
    DEFAULT_BOT_TIME_ZONE
  ];

  for (const rawCandidate of candidates) {
    const candidate = String(rawCandidate || '').trim();
    if (!candidate) continue;
    try {
      new Intl.DateTimeFormat('ru-RU', { timeZone: candidate }).format(new Date());
      return candidate;
    } catch (_) { }
  }

  return DEFAULT_BOT_TIME_ZONE;
}

const BOT_TIME_ZONE = resolveBotTimeZone();

// Cache for restaurant-specific bots
const restaurantBots = new Map();
const customerOrderStatusMessageCache = new Map();
const botProfileCache = new Map();
const RECEIPT_PLACEHOLDER_WHITE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
  'base64'
);

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

function normalizeCardReceiptTarget(value, fallback = 'bot') {
  return String(value || '').trim().toLowerCase() === 'admin' ? 'admin' : fallback;
}

async function resolveBotPublicUsername(bot, cacheKey) {
  if (!bot || !cacheKey) return '';
  const cached = botProfileCache.get(cacheKey);
  if (cached?.username && (Date.now() - cached.updatedAt) < (60 * 60 * 1000)) {
    return cached.username;
  }

  try {
    const me = await bot.getMe();
    const username = String(me?.username || '').trim();
    if (username) {
      botProfileCache.set(cacheKey, { username, updatedAt: Date.now() });
    }
    return username;
  } catch (_) {
    return '';
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

function normalizeNoticeLanguage(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'uz' ? 'uz' : 'ru';
}

function buildGroupBalanceLeftMessage(currentBalance, language = 'ru') {
  const lang = normalizeNoticeLanguage(language);
  const amount = formatPrice(currentBalance || 0);
  if (lang === 'uz') {
    return `💰 Balansingizda <b>${amount} so'm</b> qoldi.`;
  }
  return `💰 На вашем балансе осталось <b>${amount} сум</b>.`;
}

function normalizeActionStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'in_progress') return 'preparing';
  return normalized;
}

function extractActorFromComment(comment) {
  const text = String(comment || '').trim();
  if (!text) return '';
  const patterns = [
    /из telegram-группы:\s*(.+)$/i,
    /принято в telegram-группе:\s*(.+)$/i,
    /подтверждено:\s*(.+)$/i,
    /из админки:\s*(.+)$/i,
    /принято в админке:\s*(.+)$/i,
    /отменено в telegram-группе:\s*(.+)$/i,
    /отказано:\s*.*\((.+)\)\s*$/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function formatActionTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BOT_TIME_ZONE
  });
}

function buildStatusActionsLines(actions = []) {
  if (!Array.isArray(actions) || actions.length === 0) return '';

  const labelByStatus = {
    accepted: '✅ Принят',
    preparing: '👨‍🍳 Готовится',
    delivering: '🚚 Доставляется',
    delivered: '✅ Доставлен',
    cancelled: '❌ Отменен'
  };
  const preparedActions = actions
    .map((rawAction, index) => {
      const status = normalizeActionStatus(rawAction?.status);
      if (!labelByStatus[status]) return null;
      const actor =
        String(rawAction?.actor_name || '').trim() ||
        extractActorFromComment(rawAction?.comment) ||
        'Неизвестно';
      return {
        index,
        status,
        actor,
        created_at: rawAction?.created_at || null
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.index - b.index;
    });

  const lines = preparedActions.map((action) => {
    const actionTime = formatActionTimestamp(action.created_at);
    return `${labelByStatus[action.status]}: ${escapeHtml(action.actor)}${actionTime ? ` (${actionTime})` : ''}`;
  });

  if (!lines.length) return '';
  return `<b>История действий</b>\n${lines.join('\n')}`;
}

async function fetchOrderStatusActions(orderId) {
  const normalizedOrderId = Number(orderId);
  if (!Number.isFinite(normalizedOrderId) || normalizedOrderId <= 0) return [];

  try {
    const result = await pool.query(
      `SELECT
         osh.status,
         osh.created_at,
         osh.comment,
         COALESCE(u.full_name, u.username, '') AS actor_name
       FROM order_status_history osh
       LEFT JOIN users u ON u.id = osh.changed_by
       WHERE osh.order_id = $1
       ORDER BY osh.created_at ASC, osh.id ASC`,
      [normalizedOrderId]
    );
    return result.rows || [];
  } catch (error) {
    console.error('Fetch order status actions warning:', error.message);
    return [];
  }
}

function buildCustomerDeliverySummaryMessage(order, actions = []) {
  const statusOrder = ['accepted', 'preparing', 'delivering', 'delivered'];
  const statusLabels = {
    accepted: '✅ Принят',
    preparing: '👨‍🍳 Готовится',
    delivering: '🚚 Доставляется',
    delivered: '✅ Доставлен'
  };

  const preparedActions = (Array.isArray(actions) ? actions : [])
    .map((rawAction, index) => ({
      index,
      status: normalizeActionStatus(rawAction?.status),
      created_at: rawAction?.created_at || null
    }))
    .filter((action) => statusOrder.includes(action.status))
    .sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.index - b.index;
    });

  const firstByStatus = new Map();
  for (const action of preparedActions) {
    if (!firstByStatus.has(action.status)) {
      firstByStatus.set(action.status, action);
    }
  }

  const timelineLines = statusOrder.map((status) => {
    const action = firstByStatus.get(status);
    const timeText = formatActionTimestamp(action?.created_at);
    return `${statusLabels[status]}${timeText ? ` (${timeText})` : ''}`;
  });

  const ratingsBlock = buildOrderRatingsBlock(order);

  return (
    `<b>ID: ${escapeHtml(order?.order_number || '')}</b> #доставлен\n\n` +
    `✅ Заказ доставлен.\n\n` +
    `<b>Этапы заказа</b>\n` +
    `${timelineLines.join('\n')}\n\n` +
    `Сумма заказа: ${formatPrice(order?.total_amount)} сум` +
    (ratingsBlock ? `\n\n${ratingsBlock}` : '')
  );
}

function buildRatingStars(ratingValue, max = 5) {
  const normalizedRating = normalizeOrderRating(ratingValue, 0);
  if (normalizedRating <= 0) return '☆'.repeat(max);
  return `${'⭐️'.repeat(normalizedRating)}${'☆'.repeat(Math.max(0, max - normalizedRating))}`;
}

function buildOrderRatingsBlock(order) {
  const serviceRating = normalizeOrderRating(order?.service_rating, 0);
  const deliveryRating = normalizeOrderRating(order?.delivery_rating, 0);
  if (serviceRating <= 0 && deliveryRating <= 0) return '';

  const lines = [
    `Сервис: ${buildRatingStars(serviceRating)}`,
    `Доставка: ${buildRatingStars(deliveryRating)}`
  ];

  const serviceReason = String(order?.service_rating_reason || '').trim();
  if (serviceRating > 0 && serviceRating <= LOW_RATING_THRESHOLD && serviceReason) {
    lines.push(`Причина низкой оценки сервиса: ${escapeHtml(serviceReason)}`);
  }

  const deliveryReason = String(order?.delivery_rating_reason || '').trim();
  if (deliveryRating > 0 && deliveryRating <= LOW_RATING_THRESHOLD && deliveryReason) {
    lines.push(`Причина низкой оценки доставки: ${escapeHtml(deliveryReason)}`);
  }

  return lines.join('\n');
}

function getPendingOrderRatingField(order) {
  const serviceRating = normalizeOrderRating(order?.service_rating, 0);
  const deliveryRating = normalizeOrderRating(order?.delivery_rating, 0);
  if (serviceRating <= 0) return 'service_rating';
  if (deliveryRating <= 0) return 'delivery_rating';
  return null;
}

function buildOrderRatingPrompt(order, fieldName, language = 'ru') {
  const lang = normalizeNoticeLanguage(language);
  if (fieldName === 'delivery_rating') {
    if (lang === 'uz') {
      return (
        `🚕 Yetkazib berishni 1 dan 5 gacha baholang.\n` +
        `Faqat son yuboring: 1, 2, 3, 4 yoki 5.`
      );
    }
    return (
      `🚕 Оцените доставку от 1 до 5.\n` +
      `Отправьте только число: 1, 2, 3, 4 или 5.`
    );
  }
  if (lang === 'uz') {
    return (
      `🛍 Servisni 1 dan 5 gacha baholang.\n` +
      `Faqat son yuboring: 1, 2, 3, 4 yoki 5.`
    );
  }
  return (
    `🛍 Оцените сервис от 1 до 5.\n` +
    `Отправьте только число: 1, 2, 3, 4 или 5.`
  );
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

function isPickupOrder(order) {
  const fulfillmentType = String(order?.fulfillment_type || '').trim().toLowerCase();
  if (fulfillmentType === 'pickup') return true;
  const address = String(order?.delivery_address || '').trim().toLowerCase();
  return address === 'самовывоз';
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

const PAYME_PENDING_STATUSES = new Set(['pending', 'created', 'processing', 'waiting', 'awaiting', 'new']);
const PAYME_UNPAID_STATUSES = new Set(['unpaid', 'cancelled', 'canceled', 'failed', 'refunded', 'rejected', 'expired']);

function buildGroupPaymePaymentStatusLine(order, statusKey = 'new') {
  const paymentMethod = String(order?.payment_method || '').trim().toLowerCase();
  if (paymentMethod !== 'payme') return '';

  const paymentStatus = String(order?.payment_status || '').trim().toLowerCase();
  const isPaid = order?.is_paid === true || paymentStatus === 'paid' || paymentStatus === 'success' || paymentStatus === 'completed';
  if (isPaid) return '💳 Payme: ✅ Оплачено';

  if (PAYME_PENDING_STATUSES.has(paymentStatus) || (!paymentStatus && statusKey === 'new')) {
    return '💳 Payme: ⏳ В ожидании оплаты';
  }

  if (PAYME_UNPAID_STATUSES.has(paymentStatus) || !paymentStatus) {
    return '💳 Payme: ❌ Не оплачено';
  }

  return '💳 Payme: ❌ Не оплачено';
}

function buildGroupOrderNotificationPayload(order, items, options = {}) {
  const {
    revealSensitive = false,
    statusKey = 'new',
    operatorName = '',
    includePreviewLink = false,
    previewUrl = null,
    cancelReason = '',
    statusActions = []
  } = options;
  const statusActionsBlock = buildStatusActionsLines(statusActions);
  const paymePaymentStatusLine = buildGroupPaymePaymentStatusLine(order, statusKey);

  if (statusKey === 'cancelled') {
    const safeCancelReason = truncateText(cancelReason || order.cancel_reason || order.admin_comment || '', TELEGRAM_COMMENT_LIMIT);
    return (
      `<b>ID: ${order.order_number}</b>\n` +
      `${getGroupOrderStatusLine(statusKey, operatorName)}\n\n` +
      (paymePaymentStatusLine ? `${paymePaymentStatusLine}\n\n` : '') +
      `🚫 Данные заказа скрыты, так как заказ отменен.` +
      (safeCancelReason ? `\n\nПричина: ${escapeHtml(safeCancelReason)}` : '') +
      (statusActionsBlock ? `\n\n${statusActionsBlock}` : '')
    );
  }

  const itemsList = buildItemsList(items);
  const pickupOrder = isPickupOrder(order);

  let locationLine = '';
  if (revealSensitive) {
    if (pickupOrder) {
      locationLine = '🛍 Самовывоз';
    } else if (order.delivery_coordinates) {
      locationLine = buildDeliveryLinksLine(order.delivery_coordinates);
    } else if (order.delivery_address && order.delivery_address !== 'По геолокации') {
      locationLine = `📍 Адрес: ${escapeHtml(order.delivery_address)}`;
    }
  }

  const deliveryTime = (() => {
    const hasScheduledTime = order.delivery_time && order.delivery_time !== 'asap';
    if (hasScheduledTime) return order.delivery_time;
    const dateRaw = String(order.delivery_date || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(dateRaw)) {
      const todayStr = new Date().toISOString().slice(0, 10);
      if (dateRaw.slice(0, 10) > todayStr) {
        const [y, m, d] = dateRaw.slice(0, 10).split('-');
        return `К дате ${d}.${m}.${y}`;
      }
    }
    return 'Как можно быстрее';
  })();

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
  const hasDeliveryAddress = Boolean(order?.delivery_address) && order.delivery_address !== 'Самовывоз';
  const hasDeliveryCoordinates = Boolean(order?.delivery_coordinates);
  const shouldShowDeliveryLine = !pickupOrder && (deliveryCost > 0 || deliveryDistanceKm > 0 || hasDeliveryAddress || hasDeliveryCoordinates);

  const containerLine = containerTotal > 0
    ? `🍽 Пакет / Посуда: ${formatPrice(containerTotal)} сум\n`
    : '';
  const serviceLine = serviceFee > 0
    ? `🛎 Сервис: ${formatPrice(serviceFee)} сум\n`
    : '';
  let deliveryLine = '';
  if (pickupOrder) {
    deliveryLine = '🛍 Самовывоз\n';
  } else if (shouldShowDeliveryLine) {
    deliveryLine = `🚗 Доставка: ${formatPrice(deliveryCost)} сум`;
    if (deliveryDistanceKm > 0) {
      deliveryLine += ` (${deliveryDistanceKm} км)`;
    }
    deliveryLine += '\n';
  }

  const hiddenHint = statusKey === 'new' && !revealSensitive
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
  const ratingsBlock = buildOrderRatingsBlock(order);

  const message =
    `<b>ID: ${order.order_number}</b>\n` +
    `${getGroupOrderStatusLine(statusKey, operatorName)}\n\n` +
    hiddenHint +
    customerBlock +
    (paymePaymentStatusLine ? `${paymePaymentStatusLine}\n` : '') +
    `🕐 К времени: ${deliveryTime}\n\n` +
    `<b>Товары</b>\n\n${itemsList}\n\n` +
    containerLine +
    serviceLine +
    deliveryLine +
    `<b>Итого: ${formatPrice(orderTotal)} сум</b>` +
    `\n\n` +
    (safeComment ? `💬 Комментарий: ${escapeHtml(safeComment)}` : '💬 Комментарий: —') +
    (statusActionsBlock ? `\n\n${statusActionsBlock}` : '') +
    (ratingsBlock ? `\n\n${ratingsBlock}` : '');

  return message;
}

function buildGroupOrderActionKeyboard(orderId, stage, operatorName = '', options = {}) {
  const previewUrl = options?.previewUrl || null;
  const showPreview = stage && stage !== 'new';
  const previewButton = showPreview && previewUrl
    ? { text: '🔎 Детали', url: previewUrl }
    : null;
  const printButton = { text: '🖨 Печать чека', callback_data: `print_order_${orderId}` };

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
    return {
      inline_keyboard: [withPreview([
        { text: '👨‍🍳 Готовится', callback_data: `order_step_${orderId}_preparing` },
        printButton
      ])]
    };
  }

  if (stage === 'preparing') {
    return {
      inline_keyboard: [withPreview([
        { text: '🚚 Доставляется', callback_data: `order_step_${orderId}_delivering` },
        printButton
      ])]
    };
  }

  if (stage === 'delivering') {
    return {
      inline_keyboard: [withPreview([
        { text: '✅ Доставлен', callback_data: `order_step_${orderId}_delivered` },
        printButton
      ])]
    };
  }

  if (stage === 'done') {
    return {
      inline_keyboard: [withPreview([
        { text: `✅ Завершено${operatorName ? ': ' + operatorName : ''}`, callback_data: 'done' },
        printButton
      ])]
    };
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
      return { statusKey: 'cancelled', keyboardStage: null, revealSensitive: false, clearKeyboard: true };
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
  const statusActions = Array.isArray(options.statusActions)
    ? options.statusActions
    : await fetchOrderStatusActions(order.id);
  const message = buildGroupOrderNotificationPayload(order, items, {
    revealSensitive: statusMeta.revealSensitive,
    statusKey: statusMeta.statusKey,
    operatorName,
    includePreviewLink: false,
    previewUrl,
    cancelReason: options.cancelReason,
    statusActions
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
      const fallbackServiceFee = parseNumericValue(order?.service_fee) || 0;
      const fallbackDeliveryCost = parseNumericValue(order?.delivery_cost) || 0;
      const fallbackDistanceKm = parseNumericValue(order?.delivery_distance_km) || 0;
      const fallbackPickupOrder = isPickupOrder(order);
      const fallbackHasDeliveryAddress = Boolean(order?.delivery_address) && order.delivery_address !== 'Самовывоз';
      const fallbackHasDeliveryCoordinates = Boolean(order?.delivery_coordinates);
      const fallbackShouldShowDelivery = !fallbackPickupOrder && (fallbackDeliveryCost > 0 || fallbackDistanceKm > 0 || fallbackHasDeliveryAddress || fallbackHasDeliveryCoordinates);
      const fallbackPaymePaymentStatusLine = buildGroupPaymePaymentStatusLine(order, 'new');
      const fallbackMessage =
        `Заказ #${order?.order_number || order?.id || '—'}\n` +
        `Сумма: ${formatPrice(order?.total_amount)} сум\n` +
        (fallbackPaymePaymentStatusLine ? `${fallbackPaymePaymentStatusLine}\n` : '') +
        (fallbackServiceFee > 0 ? `Сервис: ${formatPrice(fallbackServiceFee)} сум\n` : '') +
        (fallbackPickupOrder
          ? 'Самовывоз\n'
          : fallbackShouldShowDelivery
          ? `Доставка: ${formatPrice(fallbackDeliveryCost)} сум${fallbackDistanceKm > 0 ? ` (${fallbackDistanceKm} км)` : ''}\n`
          : '') +
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

async function sendCardReceiptPlaceholderToGroup(order, options = {}) {
  if (!order?.id) return null;
  const targetChatId = String(options.chatId || order.payment_receipt_chat_id || order.admin_chat_id || '').trim();
  if (!targetChatId) return null;

  const normalizedBotToken = String(options.botToken || order.telegram_bot_token || '').trim();
  if (!normalizedBotToken) return null;

  const bot = getRestaurantBot(normalizedBotToken, options.restaurantId || order.restaurant_id || null);
  if (!bot) return null;

  const caption =
    `🧾 Чек оплаты\n` +
    `Заказ #${order.order_number}\n` +
    `Ожидаем чек от клиента...`;

  try {
    const sent = await bot.sendPhoto(targetChatId, RECEIPT_PLACEHOLDER_WHITE_PNG, {
      caption
    });

    if (sent?.message_id) {
      await pool.query(
        `UPDATE orders
         SET payment_receipt_chat_id = $1,
             payment_receipt_message_id = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [targetChatId, sent.message_id, order.id]
      );
    }

    return sent || null;
  } catch (error) {
    console.error('Send card receipt placeholder error:', error.message);
    return null;
  }
}

async function replaceCardReceiptPlaceholderInGroup({
  orderId,
  fileId,
  orderNumber = null,
  botToken = null,
  restaurantId = null,
  chatId = null,
  messageId = null
}) {
  const normalizedOrderId = Number(orderId);
  if (!Number.isFinite(normalizedOrderId) || normalizedOrderId <= 0) {
    return { ok: false, error: 'invalid_order_id' };
  }

  const normalizedFileId = String(fileId || '').trim();
  if (!normalizedFileId) {
    return { ok: false, error: 'missing_file_id' };
  }

  const targetChatId = String(chatId || '').trim();
  const targetMessageId = Number(messageId);
  const normalizedBotToken = String(botToken || '').trim();
  if (!normalizedBotToken) {
    return { ok: false, error: 'missing_bot_token' };
  }

  const bot = getRestaurantBot(normalizedBotToken, restaurantId || null);
  if (!bot) {
    return { ok: false, error: 'bot_not_available' };
  }

  const caption =
    `✅ Чек оплаты получен\n` +
    `Заказ #${orderNumber || normalizedOrderId}`;

  try {
    if (targetChatId && Number.isFinite(targetMessageId) && targetMessageId > 0) {
      await bot.editMessageMedia(
        {
          type: 'photo',
          media: normalizedFileId,
          caption
        },
        {
          chat_id: targetChatId,
          message_id: targetMessageId
        }
      );
    } else if (targetChatId) {
      const sent = await bot.sendPhoto(targetChatId, normalizedFileId, { caption });
      if (sent?.message_id) {
        await pool.query(
          `UPDATE orders
           SET payment_receipt_chat_id = $1,
               payment_receipt_message_id = $2
           WHERE id = $3`,
          [targetChatId, sent.message_id, normalizedOrderId]
        );
      }
    } else {
      return { ok: false, error: 'missing_chat_id' };
    }

    await pool.query(
      `UPDATE orders
       SET payment_receipt_file_id = $1,
           payment_receipt_submitted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [normalizedFileId, normalizedOrderId]
    );

    return { ok: true };
  } catch (error) {
    console.error('Replace card receipt placeholder error:', error.message);
    return { ok: false, error: error.message };
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

async function resolveOrderPromptLanguage({ telegramId = null, userId = null, fallback = 'ru' } = {}) {
  const normalizedFallback = normalizeNoticeLanguage(fallback);

  const normalizedUserId = Number.parseInt(userId, 10);
  if (Number.isFinite(normalizedUserId) && normalizedUserId > 0) {
    try {
      const byUserId = await pool.query(
        `SELECT bot_language
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [normalizedUserId]
      );
      if (byUserId.rows.length > 0) {
        return normalizeNoticeLanguage(byUserId.rows[0].bot_language || normalizedFallback);
      }
    } catch (_) { }
  }

  const normalizedTelegramId = String(telegramId || '').trim();
  const parsedTelegramId = Number.parseInt(normalizedTelegramId, 10);
  if (Number.isFinite(parsedTelegramId) && parsedTelegramId > 0) {
    try {
      const byTelegramId = await pool.query(
        `SELECT bot_language
         FROM users
         WHERE telegram_id = $1
         ORDER BY id DESC
         LIMIT 1`,
        [parsedTelegramId]
      );
      if (byTelegramId.rows.length > 0) {
        return normalizeNoticeLanguage(byTelegramId.rows[0].bot_language || normalizedFallback);
      }
    } catch (_) { }
  }

  return normalizedFallback;
}

function formatDateKeyForCustomerNotice(dateKey, language = 'ru') {
  const raw = String(dateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || '—';

  const [year, month, day] = raw.split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return raw;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString(language === 'uz' ? 'uz-UZ' : 'ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

async function sendOrderDeliveryLaterNoticeToUser(
  telegramId,
  order,
  deliveryDate,
  botToken = null,
  restaurantId = null
) {
  if (!telegramId || !deliveryDate) return false;

  const resolvedRestaurantIdRaw = Number(order?.restaurant_id || restaurantId || 0);
  const resolvedRestaurantId = Number.isFinite(resolvedRestaurantIdRaw) && resolvedRestaurantIdRaw > 0
    ? resolvedRestaurantIdRaw
    : null;
  const bot = getRestaurantBot(botToken, resolvedRestaurantId);
  if (!bot) return false;

  try {
    const lang = await resolveOrderPromptLanguage({
      telegramId,
      userId: order?.user_id || null,
      fallback: 'ru'
    });
    const dateLabel = formatDateKeyForCustomerNotice(deliveryDate, lang);
    const orderNumber = escapeHtml(order?.order_number || order?.id || '');

    const message = lang === 'uz'
      ? `📅 <b>Buyurtma #${orderNumber}</b>\n\nYetkazib berish sanasi: <b>${escapeHtml(dateLabel)}</b>.`
      : `📅 <b>Заказ #${orderNumber}</b>\n\nДоставка запланирована на <b>${escapeHtml(dateLabel)}</b>.`;

    await bot.sendMessage(telegramId, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{
          text: lang === 'uz' ? '📋 Buyurtmalarim' : '📋 Мои заказы',
          callback_data: 'my_orders'
        }]]
      }
    });
    return true;
  } catch (error) {
    console.error('Send delivery-later notice error:', error.message);
    return false;
  }
}

/**
 * Send order status update to user
 * @param {Object} customMessages - Custom messages from restaurant settings { msg_new, msg_preparing, msg_delivering, msg_delivered, msg_cancelled }
 * @param {number|null} restaurantId - Restaurant ID for resolving active multi-bot instance
 */
async function sendOrderUpdateToUser(
  telegramId,
  order,
  status,
  botToken = null,
  restaurantPaymentUrls = null,
  customMessages = null,
  restaurantId = null
) {
  if (!telegramId) return false;

  const resolvedRestaurantIdRaw = Number(order?.restaurant_id || restaurantId || 0);
  const resolvedRestaurantId = Number.isFinite(resolvedRestaurantIdRaw) && resolvedRestaurantIdRaw > 0
    ? resolvedRestaurantIdRaw
    : null;

  const bot = getRestaurantBot(botToken, resolvedRestaurantId);
  if (!bot) {
    console.warn('⚠️  Bot not initialized, cannot send update');
    return false;
  }

  let orderWithRatings = order;
  try {
    if (status === 'delivered' && order?.id) {
      await ensureOrderRatingsSchema().catch(() => {});
      try {
        const ratingResult = await pool.query(
          `SELECT
             COALESCE(service_rating, 0) AS service_rating,
             COALESCE(delivery_rating, 0) AS delivery_rating,
             rating_requested_at
           FROM orders
           WHERE id = $1
           LIMIT 1`,
          [order.id]
        );
        if (ratingResult.rows.length > 0) {
          orderWithRatings = {
            ...order,
            ...ratingResult.rows[0]
          };
        }
      } catch (ratingFetchError) {
        console.error('Fetch delivered ratings warning:', ratingFetchError.message);
      }
    }

    const statusTags = {
      'new': '#новый',
      'accepted': '#принят',
      'preparing': '#готовится',
      'delivering': '#доставляется',
      'delivered': '#доставлен',
      'cancelled': '#отменен'
    };

    // Default messages
    const defaultMessages = {
      'new': '📦 Ваш заказ в обработке!',
      'accepted': '✅ Заказ принят. Оператор подтвердил заказ.',
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

    // Build payment link/details for new orders
    let paymentLine = '';
    let sendReceiptButton = null;
    if (status === 'new' && order.payment_method && restaurantPaymentUrls) {
      if (order.payment_method === 'click' && restaurantPaymentUrls.click_url) {
        paymentLine = `\nСсылка для оплаты: <a href="${restaurantPaymentUrls.click_url}">Click</a>`;
      } else if (order.payment_method === 'payme' && restaurantPaymentUrls.payme_url) {
        paymentLine = `\nСсылка для оплаты: <a href="${restaurantPaymentUrls.payme_url}">Payme</a>`;
      } else if (order.payment_method === 'uzum' && restaurantPaymentUrls.uzum_url) {
        paymentLine = `\nСсылка для оплаты: <a href="${restaurantPaymentUrls.uzum_url}">Uzum</a>`;
      } else if (order.payment_method === 'xazna' && restaurantPaymentUrls.xazna_url) {
        paymentLine = `\nСсылка для оплаты: <a href="${restaurantPaymentUrls.xazna_url}">Xazna</a>`;
      } else if (order.payment_method === 'card') {
        const cardTitle = String(restaurantPaymentUrls.card_payment_title || '').trim() || 'Банковская карта';
        const cardNumber = String(restaurantPaymentUrls.card_payment_number || '').replace(/\D/g, '').slice(0, 19);
        const cardHolder = String(restaurantPaymentUrls.card_payment_holder || '').trim();
        const receiptTarget = normalizeCardReceiptTarget(restaurantPaymentUrls.card_receipt_target, 'bot');
        const supportUsernameRaw = String(restaurantPaymentUrls.support_username || '').trim();
        const supportUsername = supportUsernameRaw.replace(/^@/, '');

        const cardDetails = [
          cardTitle ? `\nКарта: <b>${escapeHtml(cardTitle)}</b>` : '',
          cardNumber ? `\nНомер: <code>${escapeHtml(cardNumber)}</code>` : '',
          cardHolder ? `\nВладелец: <b>${escapeHtml(cardHolder)}</b>` : ''
        ].join('');

        paymentLine = `${cardDetails}\n\nПосле оплаты отправьте чек.`;

        if (receiptTarget === 'admin' && supportUsername) {
          sendReceiptButton = {
            text: '🧾 Отправить чек',
            url: `https://t.me/${supportUsername}`
          };
        } else if (order?.id) {
          sendReceiptButton = {
            text: '🧾 Отправить чек',
            callback_data: `card_receipt_${order.id}`
          };
        }
      }
    }

    const message =
      `<b>ID: ${order.order_number}</b> ${tag}\n\n` +
      `${statusText}\n\n` +
      `Сумма заказа: ${formatPrice(order.total_amount)} сум` +
      paymentLine;

    const inlineKeyboard = [];
    inlineKeyboard.push([{ text: '📋 Мои заказы', callback_data: 'my_orders' }]);
    if (sendReceiptButton) {
      inlineKeyboard.push([sendReceiptButton]);
    }

    const options = {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined
    };

    const cacheScope = resolvedRestaurantId ? `restaurant:${resolvedRestaurantId}` : (botToken || 'default');
    const cacheKey = `${cacheScope}:${telegramId}:${order?.id || order?.order_number || 'order'}`;
    const cached = customerOrderStatusMessageCache.get(cacheKey);
    const previousMessageIds = Array.isArray(cached?.messageIds)
      ? cached.messageIds
      : (cached?.messageId ? [cached.messageId] : []);

    let outgoingMessage = message;
    if (status === 'delivered' && order?.id) {
      const actions = await fetchOrderStatusActions(order.id);
      outgoingMessage = buildCustomerDeliverySummaryMessage(orderWithRatings, actions);
    }

    const sent = await bot.sendMessage(telegramId, outgoingMessage, options);
    const sentMessageId = Number(sent?.message_id || 0);
    if (sentMessageId > 0) {
      const uniqueMessageIds = Array.from(
        new Set(
          status === 'delivered'
            ? [sentMessageId]
            : [...previousMessageIds, sentMessageId]
        )
      ).filter((id) => Number.isFinite(id) && id > 0);

      customerOrderStatusMessageCache.set(cacheKey, {
        messageIds: uniqueMessageIds.slice(-15),
        status,
        updatedAt: Date.now()
      });

      if (status === 'delivered') {
        for (const previousId of previousMessageIds) {
          const normalizedId = Number(previousId || 0);
          if (!Number.isFinite(normalizedId) || normalizedId <= 0 || normalizedId === sentMessageId) continue;
          try {
            await bot.deleteMessage(telegramId, normalizedId);
          } catch (_) { }
        }
      }
    }

    if (status === 'delivered' && order?.id) {
      const pendingField = getPendingOrderRatingField(orderWithRatings);
      if (pendingField) {
        const userPromptLanguage = await resolveOrderPromptLanguage({
          telegramId,
          userId: order?.user_id || null,
          fallback: 'ru'
        });

        await pool.query(
          `UPDATE orders
           SET rating_requested_at = COALESCE(rating_requested_at, CURRENT_TIMESTAMP),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [order.id]
        ).catch(() => {});

        await bot.sendMessage(
          telegramId,
          buildOrderRatingPrompt(orderWithRatings, pendingField, userPromptLanguage),
          { disable_web_page_preview: true }
        );
      }
    }

    console.log(`✅ Order update sent to user ${telegramId}`);
    return true;
  } catch (error) {
    console.error('Send order update error:', error);
    return false;
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

async function sendRestaurantGroupBalanceLeft({
  restaurantId = null,
  botToken = null,
  groupId = null,
  currentBalance = 0,
  language = 'ru'
}) {
  const normalizedGroupId = groupId === undefined || groupId === null ? '' : String(groupId).trim();
  if (!normalizedGroupId) return false;

  const bot = getRestaurantBot(botToken, restaurantId);
  if (!bot) return false;

  try {
    const message = buildGroupBalanceLeftMessage(currentBalance, language);
    await bot.sendMessage(normalizedGroupId, message, { parse_mode: 'HTML' });
    return true;
  } catch (error) {
    console.error('Send group balance-left notification error:', error.message);
    return false;
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
  sendOrderDeliveryLaterNoticeToUser,
  updateOrderNotificationForCustomerCancel,
  sendCardReceiptPlaceholderToGroup,
  replaceCardReceiptPlaceholderInGroup,
  sendBalanceNotification,
  sendRestaurantGroupBalanceLeft,
  notifyRestaurantAdminsLowBalance,
  getRestaurantBot,
  buildGroupOrderNotificationPayload,
  buildGroupOrderActionKeyboard,
  buildOrderPreviewUrl,
  updateOrderGroupNotification
};
