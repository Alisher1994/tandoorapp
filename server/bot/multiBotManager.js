const TelegramBot = require('node-telegram-bot-api');
const pool = require('../database/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {
  sendOrderUpdateToUser,
  notifyRestaurantAdminsLowBalance,
  sendRestaurantGroupBalanceLeft,
  updateOrderGroupNotification,
  replaceCardReceiptPlaceholderInGroup
} = require('./notifications');
const { ensureOrderPaidForProcessing } = require('../services/orderBilling');
const { ensureBotFunnelSchema, trackBotFunnelEvent } = require('../services/botFunnel');
const { ensureOrderRatingsSchema, normalizeOrderRating } = require('../services/orderRatings');

// Store all bots: Map<botToken, { bot, restaurantId, restaurantName }>
const restaurantBots = new Map();

// Store for registration states: Map<`${botToken}_${telegramUserId}`, state>
const registrationStates = new Map();
const passwordResetCooldown = new Map();
const languageSelectionStates = new Map();
const languagePreferences = new Map();
const WEB_APP_CACHE_VERSION = String(
  process.env.RAILWAY_DEPLOYMENT_ID
  || process.env.RAILWAY_GIT_COMMIT_SHA
  || process.env.SOURCE_VERSION
  || process.env.npm_package_version
  || ''
).trim();

function getTelegramWebhookSecretToken() {
  const secret = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  return secret || null;
}

function appendWebAppCacheVersion(rawUrl) {
  if (!rawUrl || !WEB_APP_CACHE_VERSION) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.set('app_v', WEB_APP_CACHE_VERSION);
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

const BOT_LANGUAGES = ['ru', 'uz'];
const LOW_RATING_THRESHOLD = 2;
const BOT_TEXTS = {
  ru: {
    chooseLanguage: '🌐 Выберите язык системы:',
    languageSaved: '✅ Язык сохранен.',
    openMenu: 'Заказать',
    promoButton: '😍 Акция',
    myOrders: '📋 Мои заказы',
    contactButton: '☎️ Связь',
    openMenuShortcut: 'Открыть',
    adminPanelButton: '🧑‍💼 Админ панель',
    myStoreButton: '🏪 Мой магазин',
    welcomeBack: '👋 С возвращением, {name}!',
    roleLine: '🧑‍💼 Роль: <b>{role}</b>',
    roleSuperadmin: 'Суперадмин',
    roleOperator: 'Оператор',
    restaurantLine: '🏪 Магазин: <b>{name}</b>',
    loginHint: 'Используйте кнопку ниже для входа в систему.',
    loginWarn: '⚠️ URL входа не настроен. Обратитесь к администратору.',
    loginButton: '🔐 Войти в систему',
    resetButton: '♻️ Восстановить доступ',
    editProfile: '⚙️ Изменить данные',
    feedback: '💬 Жалобы и предложения',
    welcomeNew: '👋 Добро пожаловать в <b>{name}</b>!\n\n📱 Для регистрации, пожалуйста, поделитесь своим номером телефона:',
    shareContact: '📱 Поделиться контактом',
    thanksName: '✅ Спасибо!\n\n👤 Теперь введите ваше имя:',
    niceToMeet: '👋 Приятно познакомиться, {name}!\n\n📍 Теперь поделитесь вашей геолокацией:',
    shareLocation: '📍 Поделиться локацией',
    genericError: '❌ Произошла ошибка. Попробуйте позже.',
    promoHint: '🔥 Актуальные акции доступны в каталоге. Откройте меню и посмотрите баннеры/товары со скидкой.',
    contactTitle: '☎️ Связь с магазином'
  },
  uz: {
    chooseLanguage: '🌐 Tizim tilini tanlang:',
    languageSaved: '✅ Til saqlandi.',
    openMenu: 'Buyurtma berish',
    promoButton: '😍 Aksiya',
    myOrders: '📋 Buyurtmalarim',
    contactButton: "☎️ Bog'lanish",
    openMenuShortcut: 'Ochish',
    adminPanelButton: '🧑‍💼 Admin panel',
    myStoreButton: "🏪 Mening do'konim",
    welcomeBack: '👋 Qaytganingiz bilan, {name}!',
    roleLine: '🧑‍💼 Rol: <b>{role}</b>',
    roleSuperadmin: 'Superadmin',
    roleOperator: 'Operator',
    restaurantLine: "🏪 Do'kon: <b>{name}</b>",
    loginHint: 'Tizimga kirish uchun quyidagi tugmani bosing.',
    loginWarn: '⚠️ Kirish havolasi sozlanmagan. Administratorga murojaat qiling.',
    loginButton: '🔐 Tizimga kirish',
    resetButton: '♻️ Kirishni tiklash',
    editProfile: '⚙️ Ma’lumotlarni o‘zgartirish',
    feedback: '💬 Shikoyat va takliflar',
    welcomeNew: '👋 <b>{name}</b> ga xush kelibsiz!\n\n📱 Ro‘yxatdan o‘tish uchun telefon raqamingizni yuboring:',
    shareContact: '📱 Kontaktni yuborish',
    thanksName: '✅ Rahmat!\n\n👤 Endi ismingizni kiriting:',
    niceToMeet: '👋 Tanishganimdan xursandman, {name}!\n\n📍 Endi geolokatsiyangizni yuboring:',
    shareLocation: '📍 Lokatsiyani yuborish',
    genericError: '❌ Xatolik yuz berdi. Keyinroq urinib ko‘ring.',
    promoHint: '🔥 Aksiyalar katalog ichida mavjud. Menyuni ochib chegirmadagi mahsulotlarni ko‘ring.',
    contactTitle: "☎️ Do'kon bilan bog'lanish"
  }
};

// Generate login token for auto-login
function generateLoginToken(userId, username, options = {}) {
  const { expiresIn = '30d', role = '', restaurantId = null } = options;
  return jwt.sign(
    {
      userId,
      username,
      autoLogin: true,
      ...(role ? { role } : {}),
      ...(restaurantId ? { restaurantId: Number(restaurantId) } : {})
    },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

function buildCatalogUrl(appUrl, token) {
  if (!appUrl) return null;
  const trimmed = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
  return appendWebAppCacheVersion(`${trimmed}/catalog?token=${encodeURIComponent(token)}`);
}

function generateTemporaryPassword(length = 12) {
  const raw = crypto.randomBytes(24).toString('base64url').replace(/[^a-zA-Z0-9]/g, '');
  return raw.slice(0, length);
}

function normalizePhone(rawPhone) {
  if (!rawPhone) return '';
  const trimmed = String(rawPhone).trim().replace(/\s+/g, '');
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }
  return trimmed.replace(/\D/g, '');
}

function normalizeCardReceiptTarget(value, fallback = 'bot') {
  return String(value || '').trim().toLowerCase() === 'admin' ? 'admin' : fallback;
}

function buildRatingSuccessMessage(lang) {
  if (lang === 'uz') {
    return 'Rahmat! Fikringiz biz uchun juda muhim ❤️!';
  }
  return 'Спасибо за ваш отзыв, мы это ценим ❤️!';
}

function buildServiceRatingPrompt(lang) {
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

function buildDeliveryRatingPrompt(lang) {
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

function buildLowRatingReasonPrompt(lang, fieldName) {
  const isService = fieldName === 'service_rating';
  if (lang === 'uz') {
    return isService
      ? '🛍 Servisga nega past baho berdingiz? Qisqacha sababini yozing.'
      : "🚕 Yetkazib berishga nega past baho berdingiz? Qisqacha sababini yozing.";
  }
  return isService
    ? '🛍 Что именно не понравилось в сервисе? Напишите, пожалуйста, причину.'
    : '🚕 Что именно не понравилось в доставке? Напишите, пожалуйста, причину.';
}

function buildInvalidRatingInputMessage(lang) {
  if (lang === 'uz') {
    return "Iltimos, 1 dan 5 gacha son yuboring.\nMasalan: 4";
  }
  return 'Пожалуйста, отправьте число от 1 до 5.\nНапример: 4';
}

function buildInvalidReasonInputMessage(lang) {
  if (lang === 'uz') {
    return 'Iltimos, sababni matn ko‘rinishida yozing (kamida 3 ta belgi).';
  }
  return 'Пожалуйста, напишите причину текстом (минимум 3 символа).';
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('ru-RU');
}

function getBotTimeZone() {
  const candidates = [
    process.env.BOT_TIMEZONE,
    process.env.TELEGRAM_TIMEZONE,
    process.env.APP_TIMEZONE,
    process.env.TZ,
    'Asia/Tashkent'
  ];

  for (const rawCandidate of candidates) {
    const candidate = String(rawCandidate || '').trim();
    if (!candidate) continue;
    try {
      new Intl.DateTimeFormat('ru-RU', { timeZone: candidate }).format(new Date());
      return candidate;
    } catch (_) { }
  }

  return 'Asia/Tashkent';
}

const BOT_TIME_ZONE = getBotTimeZone();

async function resolveUniqueCustomerUsername(preferredUsername, telegramUserId) {
  const ownerId = String(telegramUserId);
  let candidate = String(preferredUsername || '').trim() || `user_${ownerId}`;

  const existing = await pool.query(
    'SELECT telegram_id FROM users WHERE username = $1 LIMIT 1',
    [candidate]
  );

  if (existing.rows.length === 0 || String(existing.rows[0].telegram_id || '') === ownerId) {
    return candidate;
  }

  const base = `user_${ownerId}`;
  candidate = base;
  let suffix = 1;

  while (true) {
    const conflict = await pool.query('SELECT 1 FROM users WHERE username = $1 LIMIT 1', [candidate]);
    if (conflict.rows.length === 0) return candidate;
    candidate = `${base}_${suffix++}`;
  }
}

function buildWebLoginUrl(params = {}) {
  const base = process.env.FRONTEND_URL || process.env.TELEGRAM_WEB_APP_URL;
  if (!base) return null;
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return appendWebAppCacheVersion(`${trimmed}/login${query ? `?${query}` : ''}`);
}

function normalizeBotLanguage(value) {
  const candidate = String(value || '').trim().toLowerCase();
  return BOT_LANGUAGES.includes(candidate) ? candidate : 'ru';
}

function getTelegramPreferredLanguage(telegramCode) {
  const code = String(telegramCode || '').toLowerCase();
  if (code.startsWith('uz')) return 'uz';
  return 'ru';
}

function t(lang, key, vars = {}) {
  const language = normalizeBotLanguage(lang);
  const dictionary = BOT_TEXTS[language] || BOT_TEXTS.ru;
  const template = dictionary[key] || BOT_TEXTS.ru[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, varName) => String(vars[varName] ?? ''));
}

function resolveLoginValue(user) {
  const phoneLogin = normalizePhone(user?.phone);
  if (phoneLogin) return phoneLogin;
  return user?.username || '';
}

async function generateUniqueOperatorUsername(restaurantId, telegramUserId) {
  for (let i = 0; i < 10; i++) {
    const suffix = crypto.randomBytes(2).toString('hex');
    const username = `op_${restaurantId}_${telegramUserId}_${suffix}`;
    const exists = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (exists.rows.length === 0) {
      return username;
    }
  }
  return `op_${restaurantId}_${Date.now()}`;
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

// Check if user is blocked (globally or for specific restaurant)
async function checkBlockedUser(bot, chatId, userId, restaurantId) {
  try {
    let userResult;
    try {
      userResult = await pool.query(
        `WITH candidates AS (
           SELECT u.*
           FROM users u
           WHERE u.telegram_id = $1
           UNION
           SELECT u.*
           FROM telegram_admin_links tal
           JOIN users u ON u.id = tal.user_id
           WHERE tal.telegram_id = $1
         )
         SELECT
           c.is_active,
           CASE WHEN c.role = 'customer' THEN COALESCE(ur.is_blocked, false) ELSE false END AS is_blocked
         FROM candidates c
         LEFT JOIN user_restaurants ur
           ON ur.user_id = c.id AND ur.restaurant_id = $2
         ORDER BY
           CASE
             WHEN c.role = 'superadmin' THEN 0
             WHEN c.role = 'operator' AND EXISTS (
               SELECT 1 FROM operator_restaurants opr WHERE opr.user_id = c.id AND opr.restaurant_id = $2
             ) THEN 1
             WHEN c.role = 'customer' THEN 2
             WHEN c.role = 'operator' THEN 3
             ELSE 4
           END,
           c.id DESC
         LIMIT 1`,
        [userId, restaurantId]
      );
    } catch (queryError) {
      // Backward compatibility: DB may not yet have user_restaurants.is_blocked column
      if (queryError.code === '42703') {
        userResult = await pool.query(
          'SELECT u.is_active, false as is_blocked FROM users u WHERE u.telegram_id = $1',
          [userId]
        );
      } else {
        throw queryError;
      }
    }

    if (userResult.rows.length > 0) {
      const { is_active, is_blocked } = userResult.rows[0];

      if (!is_active || is_blocked) {
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
  ensureOrderRatingsSchema().catch((error) => {
    console.error(`Order ratings schema ensure warning for ${restaurantName}:`, error.message);
  });

  // Helper to get state key - includes chatId for group handling
  const getStateKey = (userId, chatId) => `${botToken}_${chatId || ''}_${userId}`;
  const getGroupRejectStateKey = (chatId) => `${botToken}_${chatId || ''}__group_reject__`;
  const getLangStateKey = (userId, chatId) => `lang_${getStateKey(userId, chatId)}`;
  const getLangCacheKey = (userId) => `${botToken}_${userId}`;
  const trackFunnelEvent = async ({
    telegramUserId,
    userId = null,
    eventType,
    payload = null
  }) => {
    if (!telegramUserId || !eventType) return;
    await trackBotFunnelEvent({
      restaurantId,
      telegramUserId,
      userId,
      eventType,
      payload
    });
  };

  const saveUserLanguage = async (userId, lang) => {
    const normalized = normalizeBotLanguage(lang);
    languagePreferences.set(getLangCacheKey(userId), normalized);
    try {
      await pool.query(
        'UPDATE users SET bot_language = $1 WHERE telegram_id = $2',
        [normalized, userId]
      );
      await pool.query(
        `UPDATE users u
         SET bot_language = $1
         FROM telegram_admin_links tal
         WHERE tal.telegram_id = $2
           AND tal.user_id = u.id`,
        [normalized, userId]
      ).catch(() => {});
    } catch (error) {
      if (error.code !== '42703') {
        console.error('Save user language warning:', error.message);
      }
    }
    return normalized;
  };

  const resolveUserLanguage = (user, fallback = 'ru') => {
    return normalizeBotLanguage(
      user?.bot_language ||
      languagePreferences.get(getLangCacheKey(user?.telegram_id)) ||
      fallback
    );
  };

  const resolvePreferredTelegramUser = async (telegramId) => {
    const result = await pool.query(`
      WITH candidates AS (
        SELECT u.*
        FROM users u
        WHERE u.telegram_id = $1
        UNION
        SELECT u.*
        FROM telegram_admin_links tal
        JOIN users u ON u.id = tal.user_id
        WHERE tal.telegram_id = $1
      )
      SELECT
        c.*,
        EXISTS (
          SELECT 1
          FROM operator_restaurants opr
          WHERE opr.user_id = c.id
            AND opr.restaurant_id = $2
        ) AS is_operator_for_restaurant
      FROM candidates c
      ORDER BY
        CASE
          WHEN c.role = 'operator' AND EXISTS (
            SELECT 1
            FROM operator_restaurants opr
            WHERE opr.user_id = c.id
              AND opr.restaurant_id = $2
          ) THEN 0
          WHEN c.role = 'superadmin' THEN 1
          WHEN c.role = 'customer' THEN 2
          WHEN c.role = 'operator' THEN 3
          ELSE 4
        END,
        c.id DESC
      LIMIT 1
    `, [telegramId, restaurantId]);

    return result.rows[0] || null;
  };

  const isCustomerLinkedToRestaurant = async (dbUserId) => {
    if (!dbUserId) return false;
    const result = await pool.query(
      `SELECT EXISTS (
         SELECT 1
         FROM user_restaurants ur
         WHERE ur.user_id = $1
           AND ur.restaurant_id = $2
       ) OR EXISTS (
         SELECT 1
         FROM orders o
         WHERE o.user_id = $1
           AND o.restaurant_id = $2
       ) AS is_linked`,
      [dbUserId, restaurantId]
    );
    return !!result.rows[0]?.is_linked;
  };

  const resolveStartMenuUser = async (telegramId) => {
    const user = await resolvePreferredTelegramUser(telegramId);
    if (!user) return null;
    if (user.role !== 'customer') return user;
    const isLinked = await isCustomerLinkedToRestaurant(user.id);
    return isLinked ? user : null;
  };

  const canUseRestaurantAdminKeyboard = (user) => (
    Boolean(
      user
      && user.role === 'operator'
      && user.is_operator_for_restaurant === true
    )
  );

  const resolveMainMenuReplyMarkup = async (telegramUserId, fallbackLang = 'ru') => {
    try {
      const user = await resolvePreferredTelegramUser(telegramUserId);
      if (!user) return null;

      const userLang = resolveUserLanguage(user, fallbackLang);
      if (canUseRestaurantAdminKeyboard(user)) {
        const { adminUrl, storeUrl } = buildOperatorPortalUrls(user);
        return buildAdminReplyKeyboard(adminUrl, userLang, storeUrl);
      }

      const token = generateLoginToken(user.id, user.username || `user_${user.id}`, { restaurantId });
      const loginUrl = buildCatalogUrl(appUrl, token);
      return buildCustomerReplyKeyboard(loginUrl, userLang);
    } catch (_) {
      return null;
    }
  };

  const findPendingOrderRating = async (telegramUserId) => {
    await ensureOrderRatingsSchema().catch(() => {});
    const result = await pool.query(
      `SELECT
         o.id,
         o.order_number,
         o.status,
         o.restaurant_id,
         COALESCE(o.service_rating, 0) AS service_rating,
         COALESCE(o.delivery_rating, 0) AS delivery_rating,
         COALESCE(o.service_rating_reason, '') AS service_rating_reason,
         COALESCE(o.delivery_rating_reason, '') AS delivery_rating_reason,
         COALESCE(o.rating_reason_pending_field, '') AS rating_reason_pending_field
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE u.telegram_id = $1
         AND o.restaurant_id = $2
         AND o.status = 'delivered'
         AND o.rating_requested_at IS NOT NULL
         AND (
           COALESCE(o.service_rating, 0) = 0
           OR COALESCE(o.delivery_rating, 0) = 0
           OR NULLIF(BTRIM(COALESCE(o.rating_reason_pending_field, '')), '') IS NOT NULL
         )
       ORDER BY COALESCE(o.rating_requested_at, o.updated_at, o.created_at) DESC, o.id DESC
       LIMIT 1`,
      [telegramUserId, restaurantId]
    );
    return result.rows[0] || null;
  };

  const loadOrderForNotificationSync = async (orderId) => {
    const normalizedOrderId = Number.parseInt(orderId, 10);
    if (!Number.isFinite(normalizedOrderId) || normalizedOrderId <= 0) return null;

    const orderResult = await pool.query(
      `SELECT
         o.*,
         r.telegram_bot_token,
         r.telegram_group_id,
         pb.full_name AS processed_by_name
       FROM orders o
       LEFT JOIN restaurants r ON r.id = o.restaurant_id
       LEFT JOIN users pb ON pb.id = o.processed_by
       WHERE o.id = $1
       LIMIT 1`,
      [normalizedOrderId]
    );
    if (!orderResult.rows.length) return null;

    const itemsResult = await pool.query(
      `SELECT oi.*
       FROM order_items oi
       WHERE oi.order_id = $1
       ORDER BY oi.id`,
      [normalizedOrderId]
    );

    return {
      order: orderResult.rows[0],
      items: itemsResult.rows || []
    };
  };

  const syncGroupOrderMessageAfterRating = async (orderId) => {
    const payload = await loadOrderForNotificationSync(orderId);
    if (!payload?.order) return false;

    await updateOrderGroupNotification(
      {
        ...payload.order,
        telegram_bot_token: payload.order.telegram_bot_token || botToken
      },
      payload.items,
      {
        status: payload.order.status,
        operatorName: payload.order.processed_by_name || ''
      }
    );
    return true;
  };

  const loadCustomerCardReceiptOrder = async ({ orderId, telegramUserId }) => {
    const normalizedOrderId = Number(orderId);
    if (!Number.isFinite(normalizedOrderId) || normalizedOrderId <= 0) return null;

    const result = await pool.query(
      `SELECT o.id, o.order_number, o.user_id, o.payment_method,
              o.payment_receipt_chat_id, o.payment_receipt_message_id,
              r.id AS restaurant_id,
              r.telegram_group_id,
              r.telegram_bot_token,
              r.card_receipt_target,
              r.support_username
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN restaurants r ON r.id = o.restaurant_id
       WHERE o.id = $1
         AND u.telegram_id = $2
       LIMIT 1`,
      [normalizedOrderId, telegramUserId]
    );

    return result.rows[0] || null;
  };

  const openCardReceiptFlow = async ({ chatId, telegramUserId, orderId, fallbackLang = 'ru' }) => {
    const menuReplyMarkup = await resolveMainMenuReplyMarkup(
      telegramUserId,
      fallbackLang
    );
    const order = await loadCustomerCardReceiptOrder({ orderId, telegramUserId });
    if (!order) {
      await bot.sendMessage(chatId, '❌ Заказ не найден.', menuReplyMarkup ? { reply_markup: menuReplyMarkup } : undefined);
      return false;
    }

    if (String(order.payment_method || '').trim().toLowerCase() !== 'card') {
      await bot.sendMessage(
        chatId,
        'ℹ️ Для этого заказа чек через бот не требуется.',
        menuReplyMarkup ? { reply_markup: menuReplyMarkup } : undefined
      );
      return false;
    }

    const receiptTarget = normalizeCardReceiptTarget(order.card_receipt_target, 'bot');
    if (receiptTarget === 'admin') {
      const username = String(order.support_username || '').trim().replace(/^@/, '');
      if (username) {
        await bot.sendMessage(
          chatId,
          `Для этого заказа чек отправляется администратору: https://t.me/${username}`,
          menuReplyMarkup ? { reply_markup: menuReplyMarkup } : undefined
        );
      } else {
        await bot.sendMessage(
          chatId,
          'Для этого заказа отправка чека через бот отключена.',
          menuReplyMarkup ? { reply_markup: menuReplyMarkup } : undefined
        );
      }
      return false;
    }

    const receiptStateKey = getStateKey(telegramUserId, chatId);
    registrationStates.set(receiptStateKey, ensureFlowStateMeta({
      step: 'waiting_card_receipt_photo',
      restaurantId,
      orderId: order.id
    }));

    await bot.sendMessage(
      chatId,
      `🧾 Заказ #${order.order_number}\n\nОтправьте фото чека одним изображением в этот чат.\n\n` +
      `Меню снизу остается активным, можно пользоваться кнопками.`,
      menuReplyMarkup ? { reply_markup: menuReplyMarkup } : undefined
    );
    return true;
  };

  const cancelOrderFromGroupReason = async ({
    orderId,
    reason,
    operatorTelegramId,
    operatorName,
    groupChatId = null,
    messageId = null
  }) => {
    let processedByUserId = null;
    if (operatorTelegramId) {
      try {
        const operatorUser = await resolvePreferredTelegramUser(operatorTelegramId);
        if (operatorUser && (operatorUser.role === 'operator' || operatorUser.role === 'superadmin')) {
          processedByUserId = operatorUser.id;
        }
      } catch (_) { }
    }

    await pool.query(
      `UPDATE orders
       SET status = 'cancelled',
           admin_comment = $1,
           cancel_reason = $1,
           processed_at = CURRENT_TIMESTAMP,
           processed_by = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [reason, orderId, processedByUserId]
    );

    const orderResult = await pool.query(
      `SELECT o.*, u.telegram_id
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [orderId]
    );

    const order = orderResult.rows[0] || null;
    if (!order) return null;

    if (order.telegram_id) {
      try {
        await bot.sendMessage(
          order.telegram_id,
          `❌ <b>Заказ #${order.order_number} отменен</b>\n\n` +
          `Причина: ${reason}\n\n` +
          `Приносим извинения за неудобства.`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {
        console.error('Error notifying customer:', e);
      }
    }

    const targetChatId = groupChatId || order.admin_chat_id || null;
    const targetMessageId = messageId || order.admin_message_id || null;
    if (targetChatId) {
      try {
        await updateOrderGroupNotification(
          {
            ...order,
            admin_chat_id: targetChatId,
            admin_message_id: targetMessageId || order.admin_message_id || null,
            telegram_bot_token: order.telegram_bot_token || botToken
          },
          [],
          {
            status: 'cancelled',
            operatorName,
            cancelReason: reason,
            chatId: targetChatId,
            messageId: targetMessageId || null,
            botToken: order.telegram_bot_token || botToken
          }
        );
      } catch (e) {
        console.error('Error updating group message:', e);
      }
    }

    return order;
  };

  const buildMainMenuButtons = (loginUrl, lang) => {
    const menuButtons = [];
    menuButtons.push([{ text: t(lang, 'myOrders'), callback_data: 'my_orders' }]);
    return menuButtons;
  };

  const buildCustomerReplyKeyboard = (loginUrl, lang) => {
    const orderButton = loginUrl
      ? { text: t(lang, 'openMenu'), web_app: { url: loginUrl } }
      : { text: t(lang, 'openMenu') };
    return {
      keyboard: [
        [orderButton],
        [
          { text: t(lang, 'myOrders') },
          { text: t(lang, 'contactButton') },
          { text: t(lang, 'editProfile') }
        ]
      ],
      resize_keyboard: true,
      is_persistent: true
    };
  };

  const buildOperatorPortalUrls = (user) => {
    if (!user?.id) {
      return { adminUrl: null, storeUrl: null };
    }
    const username = user.username || `user_${user.id}`;
    const adminAutoLoginToken = generateLoginToken(user.id, username, {
      expiresIn: '1h',
      role: user.role
    });
    const adminUrl = buildWebLoginUrl({
      portal: 'admin',
      restaurantId,
      source: 'restaurant_bot',
      token: adminAutoLoginToken
    });
    const storeToken = generateLoginToken(user.id, username, { restaurantId });
    const storeUrl = buildCatalogUrl(appUrl, storeToken);
    return { adminUrl, storeUrl };
  };

  const buildAdminReplyKeyboard = (adminUrl, lang, storeUrl = null) => ({
    keyboard: [
      [
        adminUrl ? { text: t(lang, 'adminPanelButton'), web_app: { url: adminUrl } } : { text: t(lang, 'adminPanelButton') },
        storeUrl ? { text: t(lang, 'myStoreButton'), web_app: { url: storeUrl } } : { text: t(lang, 'myStoreButton') }
      ],
      [
        { text: t(lang, 'contactButton') },
        { text: t(lang, 'resetButton') }
      ]
    ],
    resize_keyboard: true,
    is_persistent: true
  });

  const setPrivateChatMenuButton = async ({ chatId, webAppUrl, lang = 'ru' }) => {
    if (!chatId || !webAppUrl) return;
    try {
      await bot.setChatMenuButton({
        chat_id: chatId,
        menu_button: {
          type: 'web_app',
          text: t(lang, 'openMenuShortcut'),
          web_app: { url: webAppUrl }
        }
      });
    } catch (error) {
      console.error(`[${restaurantName}] setChatMenuButton error:`, error.message);
    }
  };

  const ensureFlowStateMeta = (state = {}) => {
    if (!Array.isArray(state._flowMessageIds)) {
      state._flowMessageIds = [];
    }
    return state;
  };

  const clearRejectionStates = (stateKey, state = null) => {
    registrationStates.delete(stateKey);
    const relatedChatId = state?.groupChatId || null;
    if (relatedChatId !== null && relatedChatId !== undefined) {
      registrationStates.delete(getGroupRejectStateKey(relatedChatId));
    }
    const userStateKey = state?._userStateKey || null;
    if (userStateKey) {
      registrationStates.delete(userStateKey);
    }
  };

  const trackFlowMessageId = (stateKey, messageId) => {
    if (!stateKey || !messageId) return;
    const state = registrationStates.get(stateKey);
    if (!state) return;
    ensureFlowStateMeta(state);
    if (!state._flowMessageIds.includes(messageId)) {
      state._flowMessageIds.push(messageId);
      registrationStates.set(stateKey, state);
    }
  };

  const trackFlowIncomingMessage = (stateKey, msg) => {
    if (!stateKey || !msg?.message_id) return;
    trackFlowMessageId(stateKey, msg.message_id);
  };

  const sendTrackedFlowMessage = async (stateKey, chatId, text, options = {}) => {
    const sent = await bot.sendMessage(chatId, text, options);
    trackFlowMessageId(stateKey, sent?.message_id);
    return sent;
  };

  const cleanupFlowMessages = async (chatId, stateKey) => {
    if (!chatId || !stateKey) return;
    const state = registrationStates.get(stateKey);
    if (!state) return;
    ensureFlowStateMeta(state);
    const ids = [...new Set(state._flowMessageIds)].filter(Boolean);
    state._flowMessageIds = [];
    registrationStates.set(stateKey, state);
    for (const messageId of ids) {
      try {
        await bot.deleteMessage(chatId, messageId);
      } catch (_) { }
    }
  };

  const requestPasswordResetConfirmation = async ({ chatId, userId, chatType = 'private', sourceMessageId = null }) => {
    if (chatType !== 'private') {
      await bot.sendMessage(chatId, '⚠️ Восстановление пароля доступно только в личном чате с ботом.');
      return;
    }

    if (await checkBlockedUser(bot, chatId, userId, restaurantId)) return;

    const user = await resolveStartMenuUser(userId);
    if (!user) {
      await bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
      return;
    }

    if (user.role === 'customer') {
      await bot.sendMessage(chatId, 'ℹ️ Для клиентов восстановление через бот отключено.');
      return;
    }

    let stateKey = getStateKey(userId, chatId);
    registrationStates.set(stateKey, ensureFlowStateMeta({
      step: 'waiting_password_reset_confirm',
      dbUserId: user.id,
      username: user.username,
      phone: user.phone,
      role: user.role,
      restaurantId
    }));
    if (sourceMessageId) {
      trackFlowMessageId(stateKey, sourceMessageId);
    }

    await sendTrackedFlowMessage(
      stateKey,
      chatId,
      '🔐 <b>Восстановление пароля</b>\n\nПодтвердите действие. Мы сгенерируем новый временный пароль.',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Подтвердить', callback_data: 'reset_password_confirm' }],
            [{ text: '❌ Отмена', callback_data: 'reset_password_cancel' }]
          ]
        }
      }
    );
  };

  const sendRecentOrders = async (chatId, userId) => {
    const userResult = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [userId]);
    if (userResult.rows.length === 0) {
      await bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
      return;
    }

    const ordersResult = await pool.query(`
      SELECT order_number, status, total_amount, created_at
      FROM orders WHERE user_id = $1 AND restaurant_id = $2
      ORDER BY created_at DESC LIMIT 5
    `, [userResult.rows[0].id, restaurantId]);

    if (ordersResult.rows.length === 0) {
      await bot.sendMessage(chatId, '📦 У вас пока нет заказов.');
      return;
    }

    const statusEmoji = { new: '🆕', preparing: '👨‍🍳', delivering: '🚚', delivered: '✅', cancelled: '❌' };
    let message = '📦 <b>Ваши заказы:</b>\n\n';

    ordersResult.rows.forEach((order) => {
      const createdAt = order.created_at ? new Date(order.created_at) : null;
      const dateLabel = createdAt && !Number.isNaN(createdAt.getTime())
        ? createdAt.toLocaleString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: BOT_TIME_ZONE
        }).replace(',', '')
        : '';
      message += `${statusEmoji[order.status] || '📦'} №${order.order_number} — ${parseFloat(order.total_amount).toLocaleString()} сум${dateLabel ? ` (${dateLabel})` : ''}\n`;
    });

    await bot.sendMessage(chatId, message, {
      parse_mode: 'HTML'
    });
  };

  const sendRestaurantContactInfo = async (chatId, lang) => {
    try {
      const restaurantResult = await pool.query(
        'SELECT phone, support_username, start_time, end_time FROM restaurants WHERE id = $1',
        [restaurantId]
      );
      const restaurant = restaurantResult.rows[0];
      if (!restaurant) {
        await bot.sendMessage(chatId, lang === 'uz' ? "Do'kon topilmadi" : 'Магазин не найден');
        return;
      }

      const lines = [t(lang, 'contactTitle')];
      if (restaurant.phone) {
        lines.push(`${lang === 'uz' ? '📞 Telefon' : '📞 Телефон'}: ${restaurant.phone}`);
      }
      if (restaurant.support_username) {
        const username = String(restaurant.support_username).replace(/^@+/, '');
        lines.push(`${lang === 'uz' ? '💬 Telegram' : '💬 Telegram'}: @${username}`);
      }
      if (restaurant.start_time || restaurant.end_time) {
        const start = restaurant.start_time ? String(restaurant.start_time).substring(0, 5) : '??:??';
        const end = restaurant.end_time ? String(restaurant.end_time).substring(0, 5) : '??:??';
        lines.push(`${lang === 'uz' ? '🕒 Ish vaqti' : '🕒 Время работы'}: ${start} - ${end}`);
      }

      await bot.sendMessage(chatId, lines.join('\n'));
    } catch (error) {
      console.error('Contact info error:', error.message);
      await bot.sendMessage(chatId, t(lang, 'genericError'));
    }
  };

  const sendEditProfileMenu = async (chatId, userId) => {
    const userResult = await pool.query('SELECT full_name, phone FROM users WHERE telegram_id = $1', [userId]);
    if (userResult.rows.length === 0) {
      await bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
      return false;
    }

    const user = userResult.rows[0];
    const editStateKey = getStateKey(userId, chatId);
    registrationStates.set(editStateKey, ensureFlowStateMeta({
      step: 'waiting_edit_profile_action',
      restaurantId
    }));

    await sendTrackedFlowMessage(
      editStateKey,
      chatId,
      `⚙️ <b>Ваши данные:</b>\n\n` +
      `👤 Имя: ${user.full_name}\n` +
      `📱 Телефон: ${user.phone}\n\n` +
      `Выберите, что хотите изменить:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✏️ Изменить имя', callback_data: 'edit_name' }],
            [{ text: '📱 Изменить телефон', callback_data: 'edit_phone' }],
            [{ text: '❌ Отмена', callback_data: 'edit_cancel' }]
          ]
        }
      }
    );
    return true;
  };

  const sendOpenMenuFallback = async (msg, action = 'open_menu') => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const user = await resolvePreferredTelegramUser(userId);
    if (!user) {
      await bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
      return;
    }

    const userLang = resolveUserLanguage(user, getTelegramPreferredLanguage(msg.from?.language_code));
    const isAdmin = canUseRestaurantAdminKeyboard(user);
    if (isAdmin) {
      const { adminUrl, storeUrl } = buildOperatorPortalUrls(user);
      if (!adminUrl && !storeUrl) {
        await bot.sendMessage(chatId, t(userLang, 'loginWarn'));
        return;
      }
      await setPrivateChatMenuButton({
        chatId,
        webAppUrl: storeUrl || adminUrl,
        lang: userLang
      });
      const inlineKeyboard = [];
      if (storeUrl) {
        inlineKeyboard.push([{ text: t(userLang, 'myStoreButton'), url: storeUrl }]);
      }
      if (adminUrl) {
        inlineKeyboard.push([{ text: t(userLang, 'adminPanelButton'), url: adminUrl }]);
      }
      const hintText = action === 'promo'
        ? t(userLang, 'promoHint')
        : (action === 'admin_panel'
          ? t(userLang, 'loginHint')
          : (userLang === 'uz'
            ? 'Do\'konni ochish uchun keyboard tugmasidan foydalaning.'
            : 'Для открытия магазина используйте кнопку на keyboard.'));
      await bot.sendMessage(chatId, hintText, {
        reply_markup: { inline_keyboard: inlineKeyboard }
      });
      return;
    }

    const token = generateLoginToken(user.id, user.username || `user_${user.id}`, { restaurantId });
    const loginUrl = buildCatalogUrl(appUrl, token);
    if (!loginUrl) {
      await bot.sendMessage(chatId, t(userLang, 'loginWarn'));
      return;
    }
    await setPrivateChatMenuButton({
      chatId,
      webAppUrl: loginUrl,
      lang: userLang
    });
    await bot.sendMessage(
      chatId,
      action === 'promo' ? t(userLang, 'promoHint') : (userLang === 'uz' ? 'Do\'konni ochish uchun keyboard tugmasidan foydalaning.' : 'Для открытия магазина используйте кнопку на keyboard.'),
      {
        reply_markup: buildCustomerReplyKeyboard(loginUrl, userLang)
      }
    );
  };

  const resolveTextMenuAction = (text) => {
    const value = String(text || '').trim();
    const pairs = [
      [t('ru', 'myOrders'), 'my_orders'],
      [t('uz', 'myOrders'), 'my_orders'],
      [t('ru', 'contactButton'), 'contact'],
      [t('uz', 'contactButton'), 'contact'],
      [t('ru', 'editProfile'), 'edit_profile'],
      [t('uz', 'editProfile'), 'edit_profile'],
      [t('ru', 'openMenu'), 'open_menu'],
      [t('uz', 'openMenu'), 'open_menu'],
      [t('ru', 'myStoreButton'), 'open_menu'],
      [t('uz', 'myStoreButton'), 'open_menu'],
      [t('ru', 'adminPanelButton'), 'admin_panel'],
      [t('uz', 'adminPanelButton'), 'admin_panel'],
      [t('ru', 'resetButton'), 'reset_password'],
      [t('uz', 'resetButton'), 'reset_password']
    ];
    return pairs.find(([label]) => label === value)?.[1] || null;
  };

  const sendDeliveryLocationPrompt = async (chatId, userId, lang = 'ru') => {
    let stateKey = getStateKey(userId, chatId);
    const existing = registrationStates.get(stateKey);
    const state = ensureFlowStateMeta({
      ...(existing || {}),
      step: 'checking_delivery',
      isExistingUser: true,
      lang: normalizeBotLanguage(lang)
    });
    registrationStates.set(stateKey, state);

    await sendTrackedFlowMessage(
      stateKey,
      chatId,
      '📍 Поделитесь геолокацией для проверки доставки:',
      {
        reply_markup: {
          keyboard: [[{ text: '📍 Поделиться локацией', request_location: true }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    );
  };

  const sendLanguagePicker = async (chatId, userId, lang = 'ru') => {
    const normalized = normalizeBotLanguage(lang);
    languageSelectionStates.set(getLangStateKey(userId, chatId), { next: 'start' });
    await bot.sendMessage(chatId, t(normalized, 'chooseLanguage'), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🇷🇺 Русский', callback_data: 'set_lang_ru' },
            { text: '🇺🇿 O`zbekcha', callback_data: 'set_lang_uz' }
          ]
        ]
      }
    });
  };

  const showStartMenu = async (msg, lang) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const language = normalizeBotLanguage(lang);

    // Check if user is blocked
    if (await checkBlockedUser(bot, chatId, userId, restaurantId)) return;

    const user = await resolvePreferredTelegramUser(userId);

    if (user) {
      languagePreferences.set(getLangCacheKey(userId), language);

      const telegramUsername = msg.from.username;
      if (telegramUsername && !user.username.startsWith('@')) {
        await pool.query(
          'UPDATE users SET active_restaurant_id = $1, username = $2 WHERE id = $3',
          [restaurantId, `@${telegramUsername}`, user.id]
        );
      } else {
        await pool.query(
          'UPDATE users SET active_restaurant_id = $1 WHERE id = $2',
          [restaurantId, user.id]
        );
      }

      await pool.query(`
        INSERT INTO user_restaurants (user_id, restaurant_id, last_interaction)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, restaurant_id)
        DO UPDATE SET last_interaction = CURRENT_TIMESTAMP
      `, [user.id, restaurantId]);

      if (canUseRestaurantAdminKeyboard(user)) {
        const { adminUrl, storeUrl } = buildOperatorPortalUrls(user);
        await setPrivateChatMenuButton({
          chatId,
          webAppUrl: storeUrl || adminUrl,
          lang: language
        });

        await bot.sendMessage(
          chatId,
          `${t(language, 'welcomeBack', { name: user.full_name || user.username })}\n\n` +
          `${t(language, 'roleLine', { role: user.role === 'superadmin' ? t(language, 'roleSuperadmin') : t(language, 'roleOperator') })}\n` +
          `${t(language, 'restaurantLine', { name: restaurantName })}\n\n` +
          `${adminUrl ? t(language, 'loginHint') : t(language, 'loginWarn')}`,
          {
            parse_mode: 'HTML',
            reply_markup: buildAdminReplyKeyboard(adminUrl, language, storeUrl)
          }
        );
      } else {
        const token = generateLoginToken(user.id, user.username, { restaurantId });
        const loginUrl = buildCatalogUrl(appUrl, token);
        await setPrivateChatMenuButton({
          chatId,
          webAppUrl: loginUrl,
          lang: language
        });

        await bot.sendMessage(
          chatId,
          `${t(language, 'welcomeBack', { name: user.full_name })}\n\n` +
          `${t(language, 'restaurantLine', { name: restaurantName })}` +
          `${loginUrl ? '' : `\n\n${t(language, 'loginWarn')}`}`,
          {
            parse_mode: 'HTML',
            reply_markup: buildCustomerReplyKeyboard(loginUrl, language)
          }
        );
      }
      return;
    }

    let stateKey = getStateKey(userId, chatId);
    registrationStates.set(stateKey, ensureFlowStateMeta({ step: 'waiting_contact', restaurantId, lang: language }));
    await sendTrackedFlowMessage(
      stateKey,
      chatId,
      t(language, 'welcomeNew', { name: restaurantName }),
      {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [[{ text: t(language, 'shareContact'), request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    );
  };

  // /start command
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const startText = String(msg.text || '').trim();
    const receiptStartMatch = startText.match(/^\/start\s+receipt_(\d+)$/i);

    console.log(`📱 /start from user ${userId} for restaurant ${restaurantName}`);

    try {
      if (receiptStartMatch) {
        const receiptOrderId = Number.parseInt(receiptStartMatch[1], 10);
        await openCardReceiptFlow({
          chatId,
          telegramUserId: userId,
          orderId: receiptOrderId,
          fallbackLang: getTelegramPreferredLanguage(msg.from?.language_code)
        });
        return;
      }

      await trackFunnelEvent({
        telegramUserId: userId,
        eventType: 'start',
        payload: {
          chat_id: chatId,
          chat_type: msg.chat?.type || 'private'
        }
      });
      const fallbackLang = getTelegramPreferredLanguage(msg.from?.language_code);
      await sendLanguagePicker(chatId, userId, fallbackLang);
    } catch (error) {
      console.error('Start command error:', error);
      bot.sendMessage(chatId, t('ru', 'genericError'));
    }
  });

  // /id command
  bot.onText(/\/id/, (msg) => {
    bot.sendMessage(msg.chat.id, `Your Telegram ID: <code>${msg.from.id}</code>`, { parse_mode: 'HTML' });
  });

  // /lang command
  bot.onText(/\/lang/, async (msg) => {
    const fallbackLang = getTelegramPreferredLanguage(msg.from?.language_code);
    await sendLanguagePicker(msg.chat.id, msg.from.id, fallbackLang);
  });

  // /menu command
  bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      // Check if user is blocked
      if (await checkBlockedUser(bot, chatId, userId, restaurantId)) return;

      const user = await resolveStartMenuUser(userId);

      if (!user) {
        bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
        return;
      }
      const userLang = resolveUserLanguage(user, getTelegramPreferredLanguage(msg.from?.language_code));

      // Update active restaurant
      await pool.query(
        'UPDATE users SET active_restaurant_id = $1 WHERE id = $2',
        [restaurantId, user.id]
      );

      if (canUseRestaurantAdminKeyboard(user)) {
        const { adminUrl, storeUrl } = buildOperatorPortalUrls(user);
        await setPrivateChatMenuButton({
          chatId,
          webAppUrl: storeUrl || adminUrl,
          lang: userLang
        });

        bot.sendMessage(
          chatId,
          `${t(userLang, 'welcomeBack', { name: user.full_name || user.username })}\n\n` +
          `${t(userLang, 'roleLine', { role: user.role === 'superadmin' ? t(userLang, 'roleSuperadmin') : t(userLang, 'roleOperator') })}\n` +
          `${t(userLang, 'restaurantLine', { name: restaurantName })}`,
          {
            parse_mode: 'HTML',
            reply_markup: buildAdminReplyKeyboard(adminUrl, userLang, storeUrl)
          }
        );
      } else {
        const token = generateLoginToken(user.id, user.username, { restaurantId });
        const loginUrl = buildCatalogUrl(appUrl, token);
        await setPrivateChatMenuButton({
          chatId,
          webAppUrl: loginUrl,
          lang: userLang
        });

        bot.sendMessage(chatId,
          `🏪 <b>${restaurantName}</b>\n\n` +
          (loginUrl
            ? (userLang === 'uz' ? 'Menyuni ochish uchun quyidagi tugmani bosing:' : 'Нажмите кнопку ниже, чтобы открыть меню:')
            : t(userLang, 'loginWarn')),
          {
            parse_mode: 'HTML',
            reply_markup: buildCustomerReplyKeyboard(loginUrl, userLang)
          }
        );
      }
    } catch (error) {
      console.error('Menu command error:', error);
      bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
  });

  // /reset_password command
  bot.onText(/\/reset_password/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      await requestPasswordResetConfirmation({ chatId, userId, chatType: msg.chat.type });
    } catch (error) {
      console.error('Reset password command error:', error);
      bot.sendMessage(chatId, '❌ Ошибка восстановления пароля. Попробуйте позже.');
    }
  });

  const processOperatorRegistration = async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(
      chatId,
      'ℹ️ Саморегистрация операторов через код отключена.\n' +
      'Добавляйте сотрудников через веб-панель магазина в разделе "Операторы".'
    );
  };

  // /operator command - disabled
  bot.onText(/\/operator(?:\s+(.+))?/, async (msg) => {
    await processOperatorRegistration(msg);
  });

  // Handle contact sharing
  bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const contact = msg.contact;

    const stateKey = getStateKey(userId, chatId);
    let state = registrationStates.get(stateKey);
    if (state) {
      ensureFlowStateMeta(state);
      registrationStates.set(stateKey, state);
      trackFlowIncomingMessage(stateKey, msg);
    }
    // Registration contact flow
    if (state && state.step === 'waiting_contact') {
      const userLang = normalizeBotLanguage(state.lang || languagePreferences.get(getLangCacheKey(userId)) || 'ru');
      state.phone = normalizePhone(contact.phone_number);
      state.step = 'waiting_name';
      state.lang = userLang;
      ensureFlowStateMeta(state);
      registrationStates.set(stateKey, state);
      await trackFunnelEvent({
        telegramUserId: userId,
        eventType: 'contact_shared',
        payload: {
          phone_masked: String(state.phone || '').replace(/^(\+?\d{3})\d+(\d{2})$/, '$1***$2')
        }
      });

      await cleanupFlowMessages(chatId, stateKey);
      await sendTrackedFlowMessage(stateKey, chatId,
        t(userLang, 'thanksName'),
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }

    // Phone update flow
    if (state && state.step === 'waiting_new_phone') {
      try {
        // Get current user data
        const userResult = await pool.query(
          'SELECT id, phone, username, bot_language FROM users WHERE telegram_id = $1',
          [userId]
        );

        if (userResult.rows.length === 0) {
          await cleanupFlowMessages(chatId, stateKey);
          bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start', { reply_markup: { remove_keyboard: true } });
          registrationStates.delete(stateKey);
          return;
        }

        const user = userResult.rows[0];
        const oldPhone = user.phone;
        const newPhone = normalizePhone(contact.phone_number);

        // Update user phone first
        await pool.query(
          `UPDATE users
           SET phone = $1,
               username = CASE WHEN $2 <> '' THEN $2 ELSE username END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [newPhone, newPhone, user.id]
        );

        // Try to log the change (table may not exist yet)
        try {
          await pool.query(`
            INSERT INTO user_profile_logs (user_id, field_name, old_value, new_value, changed_via)
            VALUES ($1, 'phone', $2, $3, 'bot')
          `, [user.id, oldPhone, newPhone]);
        } catch (logError) {
          console.log('Profile log table may not exist:', logError.message);
        }

        const userLang = resolveUserLanguage(user, getTelegramPreferredLanguage(msg.from?.language_code));
        const loginUrl = buildCatalogUrl(
          appUrl,
          generateLoginToken(user.id, newPhone || user.username || `user_${userId}`, { restaurantId })
        );

        await cleanupFlowMessages(chatId, stateKey);
        bot.sendMessage(chatId,
          `✅ <b>Телефон успешно изменен!</b>\n\n` +
          `Было: ${oldPhone}\n` +
          `Стало: ${newPhone}`,
          {
            parse_mode: 'HTML',
            reply_markup: buildCustomerReplyKeyboard(loginUrl, userLang)
          }
        );

        registrationStates.delete(stateKey);
      } catch (error) {
        console.error('Update phone error:', error);
        await cleanupFlowMessages(chatId, stateKey);
        bot.sendMessage(chatId, '❌ Ошибка при обновлении. Попробуйте позже.', { reply_markup: { remove_keyboard: true } });
        registrationStates.delete(stateKey);
      }
    }
  });

  // Handle text messages
  bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (text.startsWith('/')) return;

    // Check state first with chatId (for groups), then without (for private)
    let stateKey = getStateKey(userId, chatId);
    let state = registrationStates.get(stateKey);
    if (state) {
      ensureFlowStateMeta(state);
      registrationStates.set(stateKey, state);
      trackFlowIncomingMessage(stateKey, msg);
    }
    if (!state) {
      // Also try without chatId for backwards compatibility
      state = registrationStates.get(getStateKey(userId, ''));
      stateKey = getStateKey(userId, '');
    }

    if (!state) {
      const normalizedText = String(text || '').trim();
      let pendingOrderRating = null;
      try {
        pendingOrderRating = await findPendingOrderRating(userId);
      } catch (pendingRatingError) {
        console.error('Find pending order rating error:', pendingRatingError.message);
      }

      if (pendingOrderRating) {
        const parsedRatingValue = Number.parseInt(normalizedText, 10);
        const isNumericRating = /^\d+$/.test(normalizedText);
        const fallbackLang = getTelegramPreferredLanguage(msg.from?.language_code);
        let userLang = fallbackLang;
        try {
          const currentUser = await resolvePreferredTelegramUser(userId);
          userLang = currentUser
            ? resolveUserLanguage(currentUser, fallbackLang)
            : fallbackLang;
        } catch (_) { }

        const currentServiceRating = normalizeOrderRating(pendingOrderRating.service_rating, 0);
        const currentDeliveryRating = normalizeOrderRating(pendingOrderRating.delivery_rating, 0);
        const pendingReasonFieldRaw = String(pendingOrderRating.rating_reason_pending_field || '').trim();
        const pendingReasonField = pendingReasonFieldRaw === 'service_rating' || pendingReasonFieldRaw === 'delivery_rating'
          ? pendingReasonFieldRaw
          : null;
        const menuAction = resolveTextMenuAction(normalizedText);

        if (pendingReasonField) {
          const reasonText = normalizedText;
          if (menuAction || reasonText.length < 3) {
            await bot.sendMessage(chatId, buildInvalidReasonInputMessage(userLang));
            return;
          }
          const normalizedReason = reasonText.slice(0, 500);

          const reasonColumn = pendingReasonField === 'service_rating'
            ? 'service_rating_reason'
            : 'delivery_rating_reason';

          await pool.query(
            `UPDATE orders
             SET ${reasonColumn} = $1,
                 rating_reason_pending_field = NULL,
                 rating_requested_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [normalizedReason, pendingOrderRating.id]
          );

          const refreshedAfterReasonResult = await pool.query(
            `SELECT
               order_number,
               COALESCE(service_rating, 0) AS service_rating,
               COALESCE(delivery_rating, 0) AS delivery_rating
             FROM orders
             WHERE id = $1
             LIMIT 1`,
            [pendingOrderRating.id]
          );
          const refreshedAfterReason = refreshedAfterReasonResult.rows[0] || pendingOrderRating;
          const refreshedServiceRating = normalizeOrderRating(refreshedAfterReason.service_rating, 0);
          const refreshedDeliveryRating = normalizeOrderRating(refreshedAfterReason.delivery_rating, 0);

          try {
            await syncGroupOrderMessageAfterRating(pendingOrderRating.id);
          } catch (syncError) {
            console.error('Sync group message after rating reason error:', syncError.message);
          }

          if (refreshedServiceRating <= 0) {
            await bot.sendMessage(chatId, buildServiceRatingPrompt(userLang));
          } else if (refreshedDeliveryRating <= 0) {
            await bot.sendMessage(chatId, buildDeliveryRatingPrompt(userLang));
          } else {
            await bot.sendMessage(
              chatId,
              buildRatingSuccessMessage(
                userLang
              )
            );
          }
          return;
        }

        const fieldToUpdate = currentServiceRating <= 0
          ? 'service_rating'
          : (currentDeliveryRating <= 0 ? 'delivery_rating' : null);
        if (!fieldToUpdate) {
          await bot.sendMessage(
            chatId,
            buildRatingSuccessMessage(
              userLang
            )
          );
          return;
        }

        if (isNumericRating && parsedRatingValue >= 1 && parsedRatingValue <= 5) {
          const reasonColumn = fieldToUpdate === 'service_rating'
            ? 'service_rating_reason'
            : 'delivery_rating_reason';
          const shouldAskReason = parsedRatingValue <= LOW_RATING_THRESHOLD;

          await pool.query(
            `UPDATE orders
             SET ${fieldToUpdate} = $1,
                 ${reasonColumn} = CASE WHEN $1 <= ${LOW_RATING_THRESHOLD} THEN NULL ELSE ${reasonColumn} END,
                 rating_reason_pending_field = $3,
                 rating_requested_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [parsedRatingValue, pendingOrderRating.id, shouldAskReason ? fieldToUpdate : null]
          );

          const refreshedRatingResult = await pool.query(
            `SELECT
               order_number,
               COALESCE(service_rating, 0) AS service_rating,
               COALESCE(delivery_rating, 0) AS delivery_rating
             FROM orders
             WHERE id = $1
             LIMIT 1`,
            [pendingOrderRating.id]
          );
          const refreshedOrder = refreshedRatingResult.rows[0] || pendingOrderRating;
          const refreshedServiceRating = normalizeOrderRating(refreshedOrder.service_rating, 0);
          const refreshedDeliveryRating = normalizeOrderRating(refreshedOrder.delivery_rating, 0);

          try {
            await syncGroupOrderMessageAfterRating(pendingOrderRating.id);
          } catch (syncError) {
            console.error('Sync group message after rating error:', syncError.message);
          }

          if (shouldAskReason) {
            await bot.sendMessage(chatId, buildLowRatingReasonPrompt(userLang, fieldToUpdate));
            return;
          }

          if (refreshedServiceRating <= 0) {
            await bot.sendMessage(chatId, buildServiceRatingPrompt(userLang));
          } else if (refreshedDeliveryRating <= 0) {
            await bot.sendMessage(chatId, buildDeliveryRatingPrompt(userLang));
          } else {
            await bot.sendMessage(
              chatId,
              buildRatingSuccessMessage(
                userLang
              )
            );
          }
          return;
        }

        await bot.sendMessage(chatId, buildInvalidRatingInputMessage(userLang));
        return;
      }

      const replyText = String(msg.reply_to_message?.text || '');
      const replyOrderMatch = replyText.match(/причин[а-я\s]*отмены заказа\s*#(\d+)/i);
      const repliedToBot = Number(msg.reply_to_message?.from?.id || 0) === Number(bot?.id || 0);
      if (repliedToBot && replyOrderMatch?.[1]) {
        const orderId = Number(replyOrderMatch[1]);
        const operatorName = msg.from?.first_name || 'Оператор';
        console.log(`[group-cancel-fallback] ${restaurantName} order=${orderId} chat=${chatId} user=${userId}`);
        try {
          await cancelOrderFromGroupReason({
            orderId,
            reason: text,
            operatorTelegramId: userId,
            operatorName,
            groupChatId: chatId
          });
          await bot.sendMessage(
            chatId,
            `❌ <b>Заказ #${orderId} отменен</b>\n\nПричина: ${text}\nОператор: ${operatorName}`,
            { parse_mode: 'HTML' }
          );
        } catch (error) {
          console.error('Reject order fallback error:', error);
          await bot.sendMessage(chatId, '❌ Ошибка при отмене заказа');
        }
        return;
      }

      const action = resolveTextMenuAction(text);
      if (!action) return;

      try {
        if (await checkBlockedUser(bot, chatId, userId, restaurantId)) return;

        if (action === 'my_orders') {
          await sendRecentOrders(chatId, userId);
          return;
        }

        if (action === 'contact') {
          const user = await resolvePreferredTelegramUser(userId);
          const userLang = user
            ? resolveUserLanguage(user, getTelegramPreferredLanguage(msg.from?.language_code))
            : getTelegramPreferredLanguage(msg.from?.language_code);
          await sendRestaurantContactInfo(chatId, userLang);
          return;
        }

        if (action === 'edit_profile') {
          await sendEditProfileMenu(chatId, userId);
          return;
        }

        if (action === 'reset_password') {
          await requestPasswordResetConfirmation({ chatId, userId, chatType: msg.chat.type });
          return;
        }

        if (action === 'promo' || action === 'open_menu' || action === 'admin_panel') {
          await sendOpenMenuFallback(msg, action);
          return;
        }
      } catch (error) {
        console.error('Reply keyboard text action error:', error);
        await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
      }
      return;
    }

    if (state.step === 'waiting_name') {
      const userLang = normalizeBotLanguage(state.lang || languagePreferences.get(getLangCacheKey(userId)) || 'ru');
      const userName = String(text || '').trim();
      if (!userName) {
        await sendTrackedFlowMessage(stateKey, chatId, userLang === 'uz' ? '❌ Ismni kiriting.' : '❌ Введите имя.');
        return;
      }
      await trackFunnelEvent({
        telegramUserId: userId,
        eventType: 'name_entered'
      });

      state.name = userName;
      state.lang = userLang;
      ensureFlowStateMeta(state);
      registrationStates.set(stateKey, state);

      try {
        const restaurantResult = await pool.query(
          'SELECT id, start_time, end_time FROM restaurants WHERE id = $1',
          [restaurantId]
        );
        const restaurant = restaurantResult.rows[0] || null;
        const startTime = restaurant?.start_time ? restaurant.start_time.substring(0, 5) : null;
        const endTime = restaurant?.end_time ? restaurant.end_time.substring(0, 5) : null;
        const isOpenNow = isRestaurantOpen(startTime, endTime);

        const phoneLogin = normalizePhone(state.phone);
        const username = await resolveUniqueCustomerUsername(phoneLogin || `user_${userId}`, userId);
        const password = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(password, 10);

        const userResult = await pool.query(`
          INSERT INTO users (telegram_id, username, password, full_name, phone, role, is_active, active_restaurant_id, bot_language)
          VALUES ($1, $2, $3, $4, $5, 'customer', true, $6, $7)
          ON CONFLICT (telegram_id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            phone = EXCLUDED.phone,
            active_restaurant_id = EXCLUDED.active_restaurant_id,
            bot_language = EXCLUDED.bot_language,
            username = CASE
              WHEN EXCLUDED.username <> '' THEN EXCLUDED.username
              ELSE users.username
            END
          RETURNING id
        `, [
          userId,
          username,
          hashedPassword,
          userName,
          state.phone,
          restaurantId,
          userLang
        ]);

        const newUserId = userResult.rows[0].id;
        await trackFunnelEvent({
          telegramUserId: userId,
          userId: newUserId,
          eventType: 'registration_completed'
        });

        await pool.query(`
          INSERT INTO user_restaurants (user_id, restaurant_id)
          VALUES ($1, $2)
          ON CONFLICT (user_id, restaurant_id) DO NOTHING
        `, [newUserId, restaurantId]);

        const token = generateLoginToken(newUserId, username, { restaurantId });
        const loginUrl = buildCatalogUrl(appUrl, token);

        await cleanupFlowMessages(chatId, stateKey);
        registrationStates.delete(stateKey);

        await bot.sendMessage(chatId,
          `✅ Регистрация успешна!\n\n` +
          `🏪 Магазин: <b>${restaurantName}</b>\n` +
          `📍 Адрес и точку доставки вы укажете при оформлении заказа в меню.` +
          (!isOpenNow ? `\n\nℹ️ Сейчас магазин закрыт и работает с ${startTime || '??:??'} до ${endTime || '??:??'}. Заказ можно оформить в рабочее время.` : '') +
          `${loginUrl ? '' : '\n\n⚠️ Web App URL не настроен. Обратитесь к администратору.'}`,
          {
            parse_mode: 'HTML',
            reply_markup: buildCustomerReplyKeyboard(loginUrl, userLang)
          }
        );
      } catch (error) {
        console.error('Registration completion error:', error);
        await cleanupFlowMessages(chatId, stateKey);
        registrationStates.delete(stateKey);
        await bot.sendMessage(chatId, userLang === 'uz' ? '❌ Ro‘yxatdan o‘tishda xatolik. Keyinroq urinib ko‘ring.' : '❌ Ошибка регистрации. Попробуйте позже.');
      }
      return;
    }

    if (state.step === 'waiting_operator_invite_code') {
      registrationStates.delete(stateKey);
      await processOperatorRegistration(msg);
      return;
    }

    // Handle rejection reason
    if (state.step === 'waiting_rejection_reason') {
      const { orderId, messageId, operatorName, groupChatId, operatorTelegramId } = state;

      try {
        await cancelOrderFromGroupReason({
          orderId,
          reason: text,
          operatorTelegramId,
          operatorName,
          groupChatId,
          messageId
        });

        bot.sendMessage(chatId,
          `❌ <b>Заказ #${orderId} отменен</b>\n\nПричина: ${text}\nОператор: ${operatorName}`,
          { parse_mode: 'HTML' }
        );

        registrationStates.delete(stateKey);
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
          await cleanupFlowMessages(chatId, stateKey);
          bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
          registrationStates.delete(stateKey);
          return;
        }

        const user = userResult.rows[0];

        // Save feedback to database
        await pool.query(`
          INSERT INTO feedback (restaurant_id, user_id, customer_name, customer_phone, type, message)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [state.restaurantId || restaurantId, user.id, user.full_name, user.phone, state.feedbackType, text]);

        await cleanupFlowMessages(chatId, stateKey);
        bot.sendMessage(chatId,
          `✅ <b>Спасибо за ваше обращение!</b>\n\n` +
          `Мы получили ваше сообщение и рассмотрим его в ближайшее время.`,
          { parse_mode: 'HTML' }
        );

        registrationStates.delete(stateKey);
      } catch (error) {
        console.error('Save feedback error:', error);
        await cleanupFlowMessages(chatId, stateKey);
        bot.sendMessage(chatId, '❌ Ошибка при отправке. Попробуйте позже.');
        registrationStates.delete(stateKey);
      }
    }

    // Handle new name input
    if (state.step === 'waiting_new_name') {
      try {
        // Get current user data
        const userResult = await pool.query(
          'SELECT id, full_name, username, bot_language FROM users WHERE telegram_id = $1',
          [userId]
        );

        if (userResult.rows.length === 0) {
          await cleanupFlowMessages(chatId, stateKey);
          bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
          registrationStates.delete(stateKey);
          return;
        }

        const user = userResult.rows[0];
        const oldName = user.full_name;
        const newName = text.trim();

        // Update user name first
        await pool.query(
          'UPDATE users SET full_name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [newName, user.id]
        );

        // Try to log the change (table may not exist yet)
        try {
          await pool.query(`
            INSERT INTO user_profile_logs (user_id, field_name, old_value, new_value, changed_via)
            VALUES ($1, 'full_name', $2, $3, 'bot')
          `, [user.id, oldName, newName]);
        } catch (logError) {
          console.log('Profile log table may not exist:', logError.message);
        }

        const userLang = resolveUserLanguage(user, getTelegramPreferredLanguage(msg.from?.language_code));
        const loginUrl = buildCatalogUrl(
          appUrl,
          generateLoginToken(user.id, user.username || `user_${userId}`, { restaurantId })
        );

        await cleanupFlowMessages(chatId, stateKey);
        bot.sendMessage(chatId,
          `✅ <b>Имя успешно изменено!</b>\n\n` +
          `Было: ${oldName}\n` +
          `Стало: ${newName}`,
          {
            parse_mode: 'HTML',
            reply_markup: buildCustomerReplyKeyboard(loginUrl, userLang)
          }
        );

        registrationStates.delete(stateKey);
      } catch (error) {
        console.error('Update name error:', error);
        await cleanupFlowMessages(chatId, stateKey);
        bot.sendMessage(chatId, '❌ Ошибка при обновлении. Попробуйте позже.');
        registrationStates.delete(stateKey);
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

    const stateKey = getStateKey(userId, chatId);
    let state = registrationStates.get(stateKey);
    if (state) {
      ensureFlowStateMeta(state);
      registrationStates.set(stateKey, state);
      trackFlowIncomingMessage(stateKey, msg);
    }

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
      await trackFunnelEvent({
        telegramUserId: userId,
        userId: state?.user?.id || null,
        eventType: 'location_shared',
        payload: {
          latitude: Number(location.latitude),
          longitude: Number(location.longitude)
        }
      });

      // Get restaurant info
      const restaurantResult = await pool.query(
        'SELECT * FROM restaurants WHERE id = $1',
        [restaurantId]
      );

      if (restaurantResult.rows.length === 0) {
        bot.sendMessage(chatId, '❌ Магазин не найден', { reply_markup: { remove_keyboard: true } });
        return;
      }

      const restaurant = restaurantResult.rows[0];

      // Check delivery zone
      const inZone = await isLocationInRestaurantZone(restaurantId, location.latitude, location.longitude);

      if (!inZone) {
        await cleanupFlowMessages(chatId, stateKey);
        bot.sendMessage(chatId,
          `😔 К сожалению, ваш адрес находится за пределами зоны доставки магазина <b>${restaurantName}</b>.`,
          { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
        );
        registrationStates.delete(stateKey);
        return;
      }

      // Check working hours
      const startTime = restaurant.start_time ? restaurant.start_time.substring(0, 5) : null;
      const endTime = restaurant.end_time ? restaurant.end_time.substring(0, 5) : null;
      const isOpenNow = isRestaurantOpen(startTime, endTime);

      if (!isOpenNow && (state.isExistingUser || state.step === 'checking_delivery')) {
        await cleanupFlowMessages(chatId, stateKey);
        bot.sendMessage(chatId,
          `😔 Извините, магазин <b>${restaurantName}</b> работает с ${startTime || '??:??'} до ${endTime || '??:??'}.\n\nПопробуйте позже!`,
          { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
        );
        registrationStates.delete(stateKey);
        return;
      }

      // Existing user - update location and show menu
      if (state.isExistingUser || state.step === 'checking_delivery') {
        const user = state.user || (await pool.query('SELECT * FROM users WHERE telegram_id = $1', [userId])).rows[0];

        await pool.query(
          `UPDATE users SET last_latitude = $1, last_longitude = $2, active_restaurant_id = $3 WHERE id = $4`,
          [location.latitude, location.longitude, restaurantId, user.id]
        );

        const token = generateLoginToken(user.id, user.username, { restaurantId });
        const loginUrl = buildCatalogUrl(appUrl, token);

        await cleanupFlowMessages(chatId, stateKey);
        registrationStates.delete(stateKey);

        bot.sendMessage(chatId,
          `✅ Отлично! Доставка доступна!\n\n🏪 Магазин: <b>${restaurantName}</b>` +
          `${loginUrl ? '' : '\n\n⚠️ Web App URL не настроен. Обратитесь к администратору.'}`,
          {
            parse_mode: 'HTML',
            reply_markup: buildCustomerReplyKeyboard(
              loginUrl,
              normalizeBotLanguage(state.lang || languagePreferences.get(getLangCacheKey(userId)) || 'ru')
            )
          }
        );
        return;
      }

      // New user registration - complete it
      const phoneLogin = normalizePhone(state.phone);
      const username = await resolveUniqueCustomerUsername(phoneLogin || `user_${userId}`, userId);
      const password = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(password, 10);

      const userResult = await pool.query(`
        INSERT INTO users (telegram_id, username, password, full_name, phone, role, is_active, last_latitude, last_longitude, active_restaurant_id, bot_language)
        VALUES ($1, $2, $3, $4, $5, 'customer', true, $6, $7, $8, $9)
        ON CONFLICT (telegram_id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          phone = EXCLUDED.phone,
          last_latitude = EXCLUDED.last_latitude,
          last_longitude = EXCLUDED.last_longitude,
          active_restaurant_id = EXCLUDED.active_restaurant_id,
          bot_language = EXCLUDED.bot_language,
          username = CASE
            WHEN EXCLUDED.username <> '' THEN EXCLUDED.username
            ELSE users.username
          END
        RETURNING id
      `, [userId, username, hashedPassword, state.name, state.phone, location.latitude, location.longitude, restaurantId, normalizeBotLanguage(state.lang || languagePreferences.get(getLangCacheKey(userId)) || 'ru')]);

      const newUserId = userResult.rows[0].id;
      await trackFunnelEvent({
        telegramUserId: userId,
        userId: newUserId,
        eventType: 'registration_completed'
      });
      await cleanupFlowMessages(chatId, stateKey);
      registrationStates.delete(stateKey);

      // Track user-restaurant relationship for broadcast
      await pool.query(`
        INSERT INTO user_restaurants (user_id, restaurant_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, restaurant_id) DO NOTHING
      `, [newUserId, restaurantId]);

      const token = generateLoginToken(newUserId, username, { restaurantId });
      const loginUrl = buildCatalogUrl(appUrl, token);

      bot.sendMessage(chatId,
        `✅ Регистрация успешна!\n\n` +
        `🏪 Магазин: <b>${restaurantName}</b>\n` +
        `📍 Доставка по вашему адресу доступна!` +
        (!isOpenNow ? `\n\nℹ️ Сейчас магазин закрыт и работает с ${startTime || '??:??'} до ${endTime || '??:??'}. Заказ можно оформить в рабочее время.` : '') +
        `${loginUrl ? '' : '\n\n⚠️ Web App URL не настроен. Обратитесь к администратору.'}`,
        {
          parse_mode: 'HTML',
          reply_markup: buildCustomerReplyKeyboard(
            loginUrl,
            normalizeBotLanguage(state.lang || languagePreferences.get(getLangCacheKey(userId)) || 'ru')
          )
        }
      );
    } catch (error) {
      console.error('Location handler error:', error);
      bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
    }
  });

  bot.on('photo', async (msg) => {
    const chatId = msg.chat?.id;
    const userId = msg.from?.id;
    if (!chatId || !userId) return;
    const menuReplyMarkup = await resolveMainMenuReplyMarkup(
      userId,
      getTelegramPreferredLanguage(msg.from?.language_code)
    );

    const stateKey = getStateKey(userId, chatId);
    const state = registrationStates.get(stateKey);
    if (!state || state.step !== 'waiting_card_receipt_photo') return;

    if (msg.chat?.type !== 'private') {
      await bot.sendMessage(
        chatId,
        'Отправьте чек в личном чате с ботом.',
        menuReplyMarkup ? { reply_markup: menuReplyMarkup } : undefined
      );
      return;
    }

    const photos = Array.isArray(msg.photo) ? msg.photo : [];
    const bestPhoto = photos[photos.length - 1];
    const fileId = String(bestPhoto?.file_id || '').trim();
    if (!fileId) {
      await bot.sendMessage(
        chatId,
        '❌ Не удалось прочитать фото. Отправьте чек еще раз.',
        menuReplyMarkup ? { reply_markup: menuReplyMarkup } : undefined
      );
      return;
    }

    try {
      const order = await loadCustomerCardReceiptOrder({
        orderId: state.orderId,
        telegramUserId: userId
      });

      if (!order) {
        registrationStates.delete(stateKey);
        await bot.sendMessage(
          chatId,
          '❌ Заказ не найден.',
          menuReplyMarkup ? { reply_markup: menuReplyMarkup } : undefined
        );
        return;
      }

      const receiptTarget = normalizeCardReceiptTarget(order.card_receipt_target, 'bot');
      if (receiptTarget !== 'bot') {
        registrationStates.delete(stateKey);
        await bot.sendMessage(
          chatId,
          'Для этого заказа чек через бот отключен.',
          menuReplyMarkup ? { reply_markup: menuReplyMarkup } : undefined
        );
        return;
      }

      const replaceResult = await replaceCardReceiptPlaceholderInGroup({
        orderId: order.id,
        fileId,
        orderNumber: order.order_number,
        botToken: order.telegram_bot_token || botToken,
        restaurantId: order.restaurant_id || restaurantId,
        chatId: order.payment_receipt_chat_id || order.telegram_group_id || null,
        messageId: order.payment_receipt_message_id || null
      });

      if (!replaceResult.ok) {
        await bot.sendMessage(
          chatId,
          '❌ Не удалось отправить чек в группу. Попробуйте позже.',
          menuReplyMarkup ? { reply_markup: menuReplyMarkup } : undefined
        );
        return;
      }

      registrationStates.delete(stateKey);
      await bot.sendMessage(
        chatId,
        `✅ Чек по заказу #${order.order_number} принят. Оператор проверит оплату.`,
        menuReplyMarkup ? { reply_markup: menuReplyMarkup } : undefined
      );
    } catch (error) {
      console.error('Card receipt photo handler error:', error);
      await bot.sendMessage(
        chatId,
        '❌ Ошибка обработки чека. Попробуйте позже.',
        menuReplyMarkup ? { reply_markup: menuReplyMarkup } : undefined
      );
    }
  });

  // Handle callback queries
  bot.on('callback_query', async (query) => {
    const chatId = query.message?.chat?.id;
    if (!chatId) {
      return;
    }
    const userId = query.from.id;
    const data = query.data;

    try {
      const safeAnswerCallback = async (options) => {
        try {
          await bot.answerCallbackQuery(query.id, options);
        } catch (_) { }
      };
      safeAnswerCallback();

      if (data.startsWith('set_lang_')) {
        const selectedLang = normalizeBotLanguage(data.replace('set_lang_', ''));
        await saveUserLanguage(userId, selectedLang);
        await trackFunnelEvent({
          telegramUserId: userId,
          eventType: 'language_selected',
          payload: {
            language: selectedLang
          }
        });

        const langStateKey = getLangStateKey(userId, chatId);
        const pending = languageSelectionStates.get(langStateKey);
        languageSelectionStates.delete(langStateKey);

        if (pending?.next === 'start') {
          await showStartMenu(
            {
              chat: query.message.chat,
              from: query.from
            },
            selectedLang
          );
        } else {
          const user = await resolvePreferredTelegramUser(userId);
          if (!user) {
            await bot.sendMessage(chatId, t(selectedLang, 'languageSaved'));
            return;
          }

          if (canUseRestaurantAdminKeyboard(user)) {
            const { adminUrl, storeUrl } = buildOperatorPortalUrls(user);
            await bot.sendMessage(chatId, t(selectedLang, 'languageSaved'), {
              reply_markup: buildAdminReplyKeyboard(adminUrl, selectedLang, storeUrl)
            });
          } else {
            const token = generateLoginToken(user.id, user.username || `user_${user.id}`, { restaurantId });
            const loginUrl = buildCatalogUrl(appUrl, token);
            await bot.sendMessage(chatId, t(selectedLang, 'languageSaved'), {
              reply_markup: buildCustomerReplyKeyboard(loginUrl, selectedLang)
            });
          }
        }
        return;
      }

      // Check if user is blocked
      if (await checkBlockedUser(bot, chatId, userId, restaurantId)) return;

      if (data === 'new_order' || data === 'check_delivery') {
        await sendOpenMenuFallback(
          { chat: query.message.chat, from: query.from },
          'open_menu'
        );
        return;
      }

      if (data === 'my_orders') {
        await sendRecentOrders(chatId, userId);
      }

      if (data.startsWith('card_receipt_')) {
        const orderId = Number.parseInt(data.replace('card_receipt_', ''), 10);
        if (!Number.isInteger(orderId) || orderId <= 0) {
          await safeAnswerCallback({ text: 'Некорректный заказ', show_alert: true });
          return;
        }

        const opened = await openCardReceiptFlow({
          chatId,
          telegramUserId: userId,
          orderId,
          fallbackLang: getTelegramPreferredLanguage(query.from?.language_code)
        });

        if (opened) {
          await safeAnswerCallback({ text: 'Отправьте фото чека в чат' });
        } else {
          await safeAnswerCallback({ text: 'Чек отправляется другим способом', show_alert: false });
        }
        return;
      }

      // Handle feedback
      if (data === 'feedback') {
        const feedbackStateKey = getStateKey(userId, chatId);
        registrationStates.set(feedbackStateKey, ensureFlowStateMeta({
          step: 'waiting_feedback_type',
          restaurantId
        }));
        if (query.message?.message_id) {
          trackFlowMessageId(feedbackStateKey, query.message.message_id);
        }

        await sendTrackedFlowMessage(feedbackStateKey, chatId,
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

      // Start reset password flow from inline menu
      if (data === 'reset_password') {
        await requestPasswordResetConfirmation({
          chatId,
          userId,
          chatType: query.message?.chat?.type || 'private',
          sourceMessageId: query.message?.message_id || null
        });
      }

      // Confirm password reset
      if (data === 'reset_password_confirm') {
        const stateKey = getStateKey(userId, chatId);
        const state = registrationStates.get(stateKey);

        if (!state || state.step !== 'waiting_password_reset_confirm') {
          bot.sendMessage(chatId, 'ℹ️ Запрос восстановления устарел. Отправьте /reset_password снова.');
          return;
        }

        const cooldownKey = `${botToken}_${userId}_password_reset`;
        const now = Date.now();
        const lastResetAt = passwordResetCooldown.get(cooldownKey);
        const cooldownMs = 5 * 60 * 1000;

        if (lastResetAt && now - lastResetAt < cooldownMs) {
          const leftSec = Math.ceil((cooldownMs - (now - lastResetAt)) / 1000);
          bot.sendMessage(chatId, `⏳ Подождите ${leftSec} сек. перед повторным восстановлением.`);
          return;
        }

        const temporaryPassword = generateTemporaryPassword();
        const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
        const normalizedLogin = normalizePhone(state.phone);

        const updateResult = await pool.query(
          `UPDATE users
           SET password = $1,
               username = CASE WHEN $3 <> '' THEN $3 ELSE username END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2
           RETURNING username, phone`,
          [hashedPassword, state.dbUserId, normalizedLogin]
        );

        if (updateResult.rows.length === 0) {
          await cleanupFlowMessages(chatId, stateKey);
          registrationStates.delete(stateKey);
          bot.sendMessage(chatId, '❌ Не удалось обновить пароль. Попробуйте позже.');
          return;
        }

        passwordResetCooldown.set(cooldownKey, now);
        await cleanupFlowMessages(chatId, stateKey);
        registrationStates.delete(stateKey);
        const effectiveLogin = normalizedLogin || resolveLoginValue(updateResult.rows[0]);
        const adminAutoLoginToken = generateLoginToken(state.dbUserId, effectiveLogin, {
          expiresIn: '1h',
          role: state.role
        });
        const loginUrl = buildWebLoginUrl({
          portal: state.role === 'customer' ? 'customer' : 'admin',
          restaurantId: state.restaurantId || restaurantId,
          source: 'restaurant_bot',
          token: adminAutoLoginToken
        });

        bot.sendMessage(
          chatId,
          `✅ <b>Доступ восстановлен</b>\n\n` +
          `Логин: <code>${effectiveLogin}</code>\n` +
          `Временный пароль: <code>${temporaryPassword}</code>\n\n` +
          `${loginUrl ? `Ссылка для входа: ${loginUrl}\n\n` : ''}` +
          `Рекомендуется войти в систему и сменить пароль.`,
          {
            parse_mode: 'HTML',
            reply_markup: loginUrl
              ? { inline_keyboard: [[{ text: '🔐 Войти в систему', url: loginUrl }]] }
              : undefined
          }
        );
      }

      // Cancel password reset
      if (data === 'reset_password_cancel') {
        const resetStateKey = getStateKey(userId, chatId);
        await cleanupFlowMessages(chatId, resetStateKey);
        registrationStates.delete(resetStateKey);
        bot.sendMessage(chatId, '❌ Восстановление пароля отменено.');
      }

      // Handle feedback type selection
      if (data.startsWith('feedback_type_')) {
        const feedbackType = data.replace('feedback_type_', '');
        const feedbackStateKey = getStateKey(userId, chatId);
        const state = ensureFlowStateMeta(registrationStates.get(feedbackStateKey) || {});
        state.step = 'waiting_feedback_message';
        state.feedbackType = feedbackType;
        state.restaurantId = restaurantId;
        registrationStates.set(feedbackStateKey, state);
        if (query.message?.message_id) {
          trackFlowMessageId(feedbackStateKey, query.message.message_id);
        }

        const typeNames = {
          complaint: 'жалоба',
          suggestion: 'предложение',
          question: 'вопрос',
          other: 'обращение'
        };

        await sendTrackedFlowMessage(feedbackStateKey, chatId,
          `📝 Тип: <b>${typeNames[feedbackType]}</b>\n\n` +
          `Напишите ваше сообщение:`,
          { parse_mode: 'HTML' }
        );
      }

      // Cancel feedback
      if (data === 'feedback_cancel') {
        const feedbackStateKey = getStateKey(userId, chatId);
        await cleanupFlowMessages(chatId, feedbackStateKey);
        registrationStates.delete(feedbackStateKey);
        bot.sendMessage(chatId, '❌ Отменено');
      }

      // Handle edit profile
      if (data === 'edit_profile') {
        await sendEditProfileMenu(chatId, userId);
      }

      // Handle edit name
      if (data === 'edit_name') {
        const editStateKey = getStateKey(userId, chatId);
        registrationStates.set(editStateKey, ensureFlowStateMeta({
          step: 'waiting_new_name',
          restaurantId
        }));
        if (query.message?.message_id) {
          trackFlowMessageId(editStateKey, query.message.message_id);
        }

        await sendTrackedFlowMessage(editStateKey, chatId,
          `✏️ Введите новое имя:`,
          { parse_mode: 'HTML' }
        );
      }

      // Handle edit phone
      if (data === 'edit_phone') {
        const editStateKey = getStateKey(userId, chatId);
        registrationStates.set(editStateKey, ensureFlowStateMeta({
          step: 'waiting_new_phone',
          restaurantId
        }));
        if (query.message?.message_id) {
          trackFlowMessageId(editStateKey, query.message.message_id);
        }

        await sendTrackedFlowMessage(editStateKey, chatId,
          `📱 Поделитесь новым номером телефона:`,
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

      // Handle cancel edit
      if (data === 'edit_cancel') {
        const editStateKey = getStateKey(userId, chatId);
        await cleanupFlowMessages(chatId, editStateKey);
        registrationStates.delete(editStateKey);
        const user = await resolvePreferredTelegramUser(userId);
        if (!user) {
          bot.sendMessage(chatId, '❌ Отменено', { reply_markup: { remove_keyboard: true } });
          return;
        }
        const userLang = resolveUserLanguage(user, getTelegramPreferredLanguage(query.from?.language_code));
        const loginUrl = buildCatalogUrl(
          appUrl,
          generateLoginToken(user.id, user.username || `user_${userId}`, { restaurantId })
        );
        bot.sendMessage(chatId, '❌ Отменено', {
          reply_markup: buildCustomerReplyKeyboard(loginUrl, userLang)
        });
      }

      const getOperatorContext = async () => {
        const fallbackLang = getTelegramPreferredLanguage(query.from?.language_code);
        try {
          const operatorUser = await resolvePreferredTelegramUser(userId);
          if (!operatorUser) return { id: null, language: fallbackLang };
          const isPrivileged = operatorUser.role === 'operator' || operatorUser.role === 'superadmin';
          return {
            id: isPrivileged ? (operatorUser.id || null) : null,
            language: resolveUserLanguage(operatorUser, fallbackLang)
          };
        } catch {
          return { id: null, language: fallbackLang };
        }
      };

      const getOrderWithItems = async (orderId) => {
        let orderResult;
        try {
          orderResult = await pool.query(`
            SELECT o.*, u.telegram_id, r.telegram_bot_token, r.telegram_group_id, r.send_balance_after_confirm,
                   r.click_url, r.payme_url, r.uzum_url, r.xazna_url
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN restaurants r ON o.restaurant_id = r.id
            WHERE o.id = $1
            LIMIT 1
          `, [orderId]);
        } catch (error) {
          if (error.code !== '42703') throw error;
          orderResult = await pool.query(`
            SELECT o.*, u.telegram_id, r.telegram_bot_token, r.telegram_group_id,
                   false AS send_balance_after_confirm,
                   r.click_url, r.payme_url, r.uzum_url, r.xazna_url
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN restaurants r ON o.restaurant_id = r.id
            WHERE o.id = $1
            LIMIT 1
          `, [orderId]);
        }

        if (orderResult.rows.length === 0) return null;

        const itemsResult = await pool.query(`
          SELECT
            oi.*,
            COALESCE(p.image_url, '') AS image_url
          FROM order_items oi
          LEFT JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id = $1
          ORDER BY oi.id
        `, [orderId]);

        return {
          order: orderResult.rows[0],
          items: itemsResult.rows
        };
      };

      const editGroupOrderMessage = async ({ order, items, statusKey, operatorName }) => {
        await updateOrderGroupNotification(
          {
            ...order,
            admin_chat_id: chatId,
            admin_message_id: query.message.message_id,
            telegram_bot_token: order.telegram_bot_token || botToken
          },
          items,
          {
            status: statusKey,
            operatorName,
            chatId,
            messageId: query.message.message_id,
            botToken: order.telegram_bot_token || botToken
          }
        );
      };

      // Handle order confirmation
      if (data.startsWith('confirm_order_')) {
        const orderId = Number(data.split('_')[2]);
        const operatorName = query.from.first_name || 'Оператор';
        const operatorContext = await getOperatorContext();
        const processedByUserId = operatorContext.id;

        const current = await getOrderWithItems(orderId);
        if (!current) {
          await safeAnswerCallback({ text: '❌ Заказ не найден', show_alert: true });
          return;
        }
        if (current.order.status !== 'new' || current.order.processed_at) {
          await safeAnswerCallback({ text: '⚠️ Заказ уже подтвержден', show_alert: false });
          return;
        }

        const billingResult = await ensureOrderPaidForProcessing({
          orderId,
          actorUserId: processedByUserId,
          markProcessedByUserId: processedByUserId
        });
        if (!billingResult.ok) {
          const text = billingResult.code === 'INSUFFICIENT_BALANCE'
            ? `❌ Недостаточно средств на балансе магазина\nБаланс: ${formatMoney(billingResult.balanceBefore)} сум\nНужно: ${formatMoney(billingResult.requiredAmount)} сум`
            : (billingResult.error || '❌ Не удалось принять заказ');
          await safeAnswerCallback({ text, show_alert: true });
          return;
        }

        if (billingResult.lowBalanceCrossed && billingResult.restaurantId) {
          try {
            await notifyRestaurantAdminsLowBalance(billingResult.restaurantId, billingResult.remainingBalance, {
              threshold: billingResult.lowBalanceThreshold
            });
          } catch (e) {
            console.error('Low balance notify error (multi-bot confirm):', e.message);
          }
        }
        if (current.order.send_balance_after_confirm && current.order.telegram_group_id) {
          await sendRestaurantGroupBalanceLeft({
            restaurantId: current.order.restaurant_id,
            botToken: current.order.telegram_bot_token,
            groupId: current.order.telegram_group_id,
            currentBalance: billingResult.remainingBalance,
            language: operatorContext.language
          });
        }

        try {
          await pool.query(
            'INSERT INTO order_status_history (order_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
            [orderId, 'accepted', processedByUserId, `Принято в Telegram-группе: ${operatorName}`]
          );
        } catch (e) { }

        const refreshed = await getOrderWithItems(orderId);

        if (refreshed?.order?.telegram_id) {
          try {
            await sendOrderUpdateToUser(
              refreshed.order.telegram_id,
              refreshed.order,
              'accepted',
              refreshed.order.telegram_bot_token || botToken,
              {
                click_url: refreshed.order.click_url,
                payme_url: refreshed.order.payme_url,
                uzum_url: refreshed.order.uzum_url,
                xazna_url: refreshed.order.xazna_url
              },
              null,
              refreshed.order.restaurant_id
            );
          } catch (e) { }
        }

        try {
          await editGroupOrderMessage({
            order: refreshed.order,
            items: refreshed.items,
            statusKey: 'accepted',
            operatorName,
            keyboardStage: 'accepted',
            revealSensitive: true
          });
        } catch (e) {
          console.error('Confirm order message update error:', e.message);
        }
        await safeAnswerCallback({ text: '✅ Заказ принят' });
        return;
      }

      if (data.startsWith('order_step_')) {
        const parts = data.split('_');
        const orderId = Number(parts[2]);
        const nextStatus = parts[3];
        const operatorName = query.from.first_name || 'Оператор';
        const operatorContext = await getOperatorContext();
        const processedByUserId = operatorContext.id;
        const allowed = ['preparing', 'delivering', 'delivered'];
        if (!allowed.includes(nextStatus)) {
          await safeAnswerCallback({ text: '⚠️ Неизвестный шаг', show_alert: false });
          return;
        }

        const current = await getOrderWithItems(orderId);
        if (!current) {
          await safeAnswerCallback({ text: '❌ Заказ не найден', show_alert: true });
          return;
        }

        const currentStatus = current.order.status;
        const transitionAllowed =
          (nextStatus === 'preparing' && currentStatus === 'new') ||
          (nextStatus === 'delivering' && currentStatus === 'preparing') ||
          (nextStatus === 'delivered' && currentStatus === 'delivering');

        if (!transitionAllowed) {
          await safeAnswerCallback({ text: '⚠️ Этот шаг уже выполнен или недоступен', show_alert: false });
          return;
        }

        if (nextStatus === 'preparing') {
          const billingResult = await ensureOrderPaidForProcessing({
            orderId,
            actorUserId: processedByUserId,
            markProcessedByUserId: processedByUserId
          });
          if (!billingResult.ok) {
            const text = billingResult.code === 'INSUFFICIENT_BALANCE'
              ? `❌ Недостаточно средств на балансе магазина\nБаланс: ${formatMoney(billingResult.balanceBefore)} сум\nНужно: ${formatMoney(billingResult.requiredAmount)} сум`
              : (billingResult.error || '❌ Не удалось перевести заказ в обработку');
            await safeAnswerCallback({ text, show_alert: true });
            return;
          }

          if (billingResult.lowBalanceCrossed && billingResult.restaurantId) {
            try {
              await notifyRestaurantAdminsLowBalance(billingResult.restaurantId, billingResult.remainingBalance, {
                threshold: billingResult.lowBalanceThreshold
              });
            } catch (e) {
              console.error('Low balance notify error (multi-bot step):', e.message);
            }
          }
          if (current.order.send_balance_after_confirm && current.order.telegram_group_id) {
            await sendRestaurantGroupBalanceLeft({
              restaurantId: current.order.restaurant_id,
              botToken: current.order.telegram_bot_token,
              groupId: current.order.telegram_group_id,
              currentBalance: billingResult.remainingBalance,
              language: operatorContext.language
            });
          }

          if (currentStatus === 'new') {
            try {
              const acceptedExistsResult = await pool.query(
                'SELECT 1 FROM order_status_history WHERE order_id = $1 AND status = $2 LIMIT 1',
                [orderId, 'accepted']
              );
              if (!acceptedExistsResult.rows.length) {
                await pool.query(
                  'INSERT INTO order_status_history (order_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
                  [orderId, 'accepted', processedByUserId, `Принято в Telegram-группе: ${operatorName}`]
                );
              }
            } catch (e) { }
          }
        }

        await pool.query(
          `UPDATE orders
           SET status = $2,
               processed_at = COALESCE(processed_at, CURRENT_TIMESTAMP),
               processed_by = COALESCE(processed_by, $3),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [orderId, nextStatus, processedByUserId]
        );

        try {
          await pool.query(
            'INSERT INTO order_status_history (order_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
            [orderId, nextStatus, processedByUserId, `Из Telegram-группы: ${operatorName}`]
          );
        } catch (e) { }

        const refreshed = await getOrderWithItems(orderId);
        if (!refreshed) {
          await safeAnswerCallback({ text: '❌ Заказ не найден', show_alert: true });
          return;
        }

        if (refreshed.order.telegram_id) {
          try {
            const notifySent = await sendOrderUpdateToUser(
              refreshed.order.telegram_id,
              refreshed.order,
              nextStatus,
              refreshed.order.telegram_bot_token || botToken,
              {
                click_url: refreshed.order.click_url,
                payme_url: refreshed.order.payme_url,
                uzum_url: refreshed.order.uzum_url,
                xazna_url: refreshed.order.xazna_url
              },
              null,
              refreshed.order.restaurant_id
            );

            if (!notifySent) {
              const fallbackStatusMap = {
                preparing: '👨‍🍳 Готовится',
                delivering: '🚚 Доставляется',
                delivered: '✅ Доставлен'
              };
              await bot.sendMessage(
                refreshed.order.telegram_id,
                `🔄 Заказ #${refreshed.order.order_number}\nСтатус: ${fallbackStatusMap[nextStatus] || nextStatus}`
              );
            }
          } catch (e) {
            console.error('Customer status notify error:', e.message);
          }
        }

        const keyboardStage =
          nextStatus === 'preparing' ? 'preparing' :
          nextStatus === 'delivering' ? 'delivering' :
          'done';

        try {
          await editGroupOrderMessage({
            order: refreshed.order,
            items: refreshed.items,
            statusKey: nextStatus,
            operatorName,
            keyboardStage,
            revealSensitive: true
          });
        } catch (e) {
          console.error('Order step message update error:', e.message);
        }

        const callbackTextMap = {
          preparing: '👨‍🍳 Статус: Готовится',
          delivering: '🚚 Статус: Доставляется',
          delivered: '✅ Статус: Доставлен'
        };
        await safeAnswerCallback({ text: callbackTextMap[nextStatus] || '✅ Обновлено' });
        return;
      }

      // Handle order rejection
      if (data.startsWith('reject_order_')) {
        const orderId = data.split('_')[2];
        const operatorName = query.from.first_name || 'Оператор';
        const operatorTelegramId = query.from.id;
        const originalMessage = query.message.text || '';

        // Use chatId (group chat) in state key so we can find it when operator types
        registrationStates.set(getStateKey(userId, chatId), {
          step: 'waiting_rejection_reason',
          orderId,
          operatorName,
          operatorTelegramId,
          messageId: query.message.message_id,
          groupChatId: chatId,
          originalMessage
        });

        bot.sendMessage(chatId, `📝 Ответьте на это сообщение и укажите причину отмены заказа #${orderId}:`, {
          reply_markup: {
            force_reply: true,
            selective: true
          }
        });
        return;
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
    await ensureBotFunnelSchema().catch((error) => {
      console.error('Bot funnel schema ensure warning:', error.message);
    });

    // Get all restaurants with bot tokens from database
    const result = await pool.query(`
      SELECT id, name, telegram_bot_token, telegram_group_id 
      FROM restaurants 
      WHERE is_active = true AND telegram_bot_token IS NOT NULL AND telegram_bot_token != ''
    `);

    console.log(`📋 Found ${result.rows.length} restaurants with bot tokens`);

    const isProduction = process.env.NODE_ENV === 'production';
    const webhookBaseUrl = process.env.TELEGRAM_WEBHOOK_URL || process.env.BACKEND_URL || process.env.FRONTEND_URL || process.env.TELEGRAM_WEB_APP_URL;
    const webhookSecretToken = getTelegramWebhookSecretToken();

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
            const webhookOptions = webhookSecretToken ? { secret_token: webhookSecretToken } : undefined;
            await bot.setWebHook(webhookUrl, webhookOptions);
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

async function stopMultiBots() {
  for (const [, data] of restaurantBots) {
    const currentBot = data?.bot;
    if (!currentBot) continue;

    try {
      currentBot.removeAllListeners();
    } catch (e) {
      console.warn('Multi-bot listener cleanup warning:', e.message);
    }

    try {
      await currentBot.stopPolling();
    } catch (e) {
      // ignore: bot can be in webhook mode
    }

    try {
      await currentBot.deleteWebHook();
    } catch (e) {
      // ignore
    }
  }

  restaurantBots.clear();
}

async function reloadMultiBots() {
  await stopMultiBots();
  await initMultiBots();
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
  reloadMultiBots,
  getBotByToken,
  getBotByRestaurantId,
  getAllBots,
  processWebhook,
  registrationStates
};
