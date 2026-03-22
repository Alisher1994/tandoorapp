const TelegramBot = require('node-telegram-bot-api');
const pool = require('../database/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { ensureOrderPaidForProcessing } = require('../services/orderBilling');
const { reloadMultiBots } = require('./multiBotManager');
const {
  ensureHelpInstructionsSchema,
  listHelpInstructions,
  getHelpInstructionByCode,
  incrementHelpInstructionViewCount
} = require('../services/helpInstructions');

let bot = null;
let activeSuperadminBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
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
    { expiresIn } // Token valid for configured period
  );
}

function generateStoreRegistrationLaunchToken(userId, lang = 'ru') {
  return jwt.sign(
    {
      purpose: 'store_registration_launch',
      telegramId: Number(userId),
      lang: normalizeBotLanguage(lang)
    },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );
}

function buildCatalogUrl(appUrl, token) {
  const trimmed = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
  return appendWebAppCacheVersion(`${trimmed}/catalog?token=${encodeURIComponent(token)}`);
}

// Store for registration states
const registrationStates = new Map();
// Store for centralized onboarding states in superadmin bot
const onboardingStates = new Map();
const languagePreferences = new Map();
const pendingLanguageActions = new Map();
const lastSuperadminStartMenuMessageIds = new Map();
const onboardingUiMessageIds = new Map();
let activityTypesSchemaReady = false;
let activityTypesSchemaPromise = null;

const DEFAULT_ACTIVITY_TYPES = [
  'Одежда',
  'Хозяйственные товары',
  'Канцтовары',
  'Бытовая техника',
  'Детская одежда',
  'Цветочные',
  'Продуктовый магазин'
];

const BOT_LANGUAGES = ['ru', 'uz'];
const BOT_TEXTS = {
  ru: {
    chooseLanguage: '🌐 Выберите язык системы:',
    languageSaved: '✅ Язык сохранен.',
    welcomeBack: '👋 С возвращением, {name}!',
    roleLine: '🧑‍💼 Роль: <b>{role}</b>',
    roleSuperadmin: 'Суперадмин',
    roleOperator: 'Оператор',
    blockedText: '🚫 <b>Ваш аккаунт заблокирован</b>\n\nДля связи с поддержкой обратитесь к администратору.',
    supportButton: '📞 Связаться с поддержкой',
    loginButton: '🔐 Войти в систему',
    myStoreButton: '🏪 Мой магазин',
    myStoreOpenHint: 'Откройте ваш магазин по кнопке ниже.',
    myStoreMissing: '❌ Для вашего аккаунта не найден привязанный магазин.',
    resetButton: '🔐 Восстановить логин и пароль',
    helpMenuButton: '🆘 Помощь',
    languageMenuButton: '🌐 Язык',
    newOrderButton: '🛒 Новый заказ',
    myOrdersButton: '📋 Мои заказы',
    welcomeStart: '👋 Добро пожаловать!\n\nДля регистрации нажмите на кнопку Регистрация магазина',
    registerStoreButton: '🏪 Регистрация магазина',
    registrationWebAppHint: '🧾 Упрощенная регистрация открывается во внутреннем окне Telegram. Нажмите кнопку ниже.',
    genericError: '❌ Произошла ошибка. Попробуйте позже.',
    notRegisteredStart: '❌ Вы не зарегистрированы. Нажмите /start',
    notRegisteredUseStart: '❌ Вы не зарегистрированы. Используйте /start',
    notRegisteredStartRegistration: '❌ Пожалуйста, сначала нажмите /start для регистрации',
    profileNotFoundStart: '❌ Профиль не найден. Нажмите /start для регистрации.',
    customerResetDisabled: 'ℹ️ Для клиентов восстановление через бот отключено. Обратитесь в поддержку магазина.',
    resetNeedsPhone: '❌ Для восстановления нужен номер телефона в профиле.',
    resetAccessRestored: '✅ <b>Доступ восстановлен</b>\n\nЛогин: <code>{login}</code>\nВременный пароль: <code>{password}</code>\n\n{loginLink}Рекомендуется войти и сменить пароль.',
    resetLoginLink: 'Ссылка для входа: {url}\n\n',
    resetAccessError: '❌ Ошибка восстановления доступа.',
    noOrdersYet: '📦 У вас пока нет заказов.',
    ordersTitle: '📦 <b>Ваши заказы:</b>\n\n',
    ordersLatestTitle: '📦 <b>Ваши последние заказы:</b>\n\n',
    orderTitle: 'Заказ',
    orderStatusLabel: 'Статус',
    ordersFetchError: '❌ Ошибка получения заказов',
    menuAddressPrompt: '📍 Укажите адрес доставки:',
    sendGeoForDeliveryPrompt: '📍 Отправьте геолокацию для доставки:',
    sendGeoButton: '📍 Отправить геолокацию',
    sendAnotherLocationButton: '📍 Отправить другую локацию',
    openStoreButton: '🏪 Открыть магазин',
    storeClosedNow: '😔 Извините, данный магазин работает с {start} по {end}.\n\nПопробуйте позже!',
    deliveryAvailable: '✅ Отлично! Доставка доступна!\n\n🏪 Магазин: <b>{store}</b>',
    deliveryLinkIssue: '⚠️ Ошибка выдачи ссылки. Попробуйте команду /menu.',
    registrationSuccess: '✅ Регистрация успешна!\n\n🏪 Магазин: <b>{store}</b>\n📍 Доставка по вашему адресу доступна!{closedNote}',
    storeClosedOrderHint: '\n\nℹ️ Сейчас магазин закрыт и работает с {start} по {end}. Заказ можно оформить в рабочее время.',
    deliveryUnavailable: '😔 Извините!\n\nК сожалению, доставка по вашему адресу пока не осуществляется.\n\n📍 Попробуйте отправить другую локацию или свяжитесь с нами для уточнения.',
    quickHelpText: '📖 <b>Помощь</b>\n\n📍 <b>Отправить локацию</b> — начать заказ\n📋 <b>Мои заказы</b> — история заказов\n\nКоманды:\n/start — начать\n/menu — открыть меню\n/orders — мои заказы',
    orderNotFound: '❌ Заказ не найден',
    orderAlreadyProcessed: '⚠️ Заказ уже обработан',
    insufficientBalanceAlert: '❌ Недостаточно средств на балансе магазина\nБаланс: {balance} сум\nНужно: {required} сум',
    orderAcceptFailed: '❌ Не удалось принять заказ',
    orderConfirmed: '✅ Заказ подтвержден!',
    callbackErrorPrefix: '❌ Ошибка: ',
    rejectOrderPrompt: '❌ <b>Отмена заказа #{orderId}</b>\n\nНапишите причину отказа:',
    rejectSummary: '❌ <b>Заказ #{orderId} отменен</b>\n\nПричина: {reason}\nОператор: {operator}',
    rejectOrderError: '❌ Ошибка при отмене заказа',
    thanksName: '✅ Спасибо!\n\n👤 Теперь введите ваше имя:',
    niceToMeet: '👋 Приятно познакомиться, {name}!\n\n📍 Теперь поделитесь вашей геолокацией, чтобы мы проверили зону доставки:',
    shareContact: '📱 Поделиться контактом',
    shareLocation: '📍 Поделиться локацией'
  },
  uz: {
    chooseLanguage: '🌐 Tizim tilini tanlang:',
    languageSaved: '✅ Til saqlandi.',
    welcomeBack: '👋 Qaytganingiz bilan, {name}!',
    roleLine: '🧑‍💼 Rol: <b>{role}</b>',
    roleSuperadmin: 'Superadmin',
    roleOperator: 'Operator',
    blockedText: '🚫 <b>Hisobingiz bloklangan</b>\n\nYordam uchun administratorga murojaat qiling.',
    supportButton: '📞 Yordam bilan bog‘lanish',
    loginButton: '🔐 Tizimga kirish',
    myStoreButton: "🏪 Mening do'konim",
    myStoreOpenHint: "Do'koningizni quyidagi tugma orqali oching.",
    myStoreMissing: "❌ Hisobingizga bog'langan do'kon topilmadi.",
    resetButton: '🔐 Login va parolni tiklash',
    helpMenuButton: '🆘 Yordam',
    languageMenuButton: '🌐 Til',
    newOrderButton: '🛒 Yangi buyurtma',
    myOrdersButton: '📋 Buyurtmalarim',
    welcomeStart: '👋 Xush kelibsiz!\n\nRo\'yxatdan o\'tish uchun Do\'konni ro\'yxatdan o\'tish tugmasini bosing',
    registerStoreButton: '🏪 Do‘konni ro‘yxatdan o‘tkazish',
    registrationWebAppHint: '🧾 Soddalashtirilgan ro‘yxatdan o‘tish Telegram ichidagi oynada ochiladi. Quyidagi tugmani bosing.',
    genericError: '❌ Xatolik yuz berdi. Keyinroq urinib ko‘ring.',
    notRegisteredStart: "❌ Siz ro'yxatdan o'tmagansiz. /start ni bosing",
    notRegisteredUseStart: "❌ Siz ro'yxatdan o'tmagansiz. /start dan foydalaning",
    notRegisteredStartRegistration: "❌ Avval ro'yxatdan o'tish uchun /start ni bosing",
    profileNotFoundStart: "❌ Profil topilmadi. Ro'yxatdan o'tish uchun /start ni bosing.",
    customerResetDisabled: "ℹ️ Mijozlar uchun bot orqali tiklash o'chirilgan. Do'kon qo'llab-quvvatlashiga murojaat qiling.",
    resetNeedsPhone: "❌ Tiklash uchun profilda telefon raqami bo'lishi kerak.",
    resetAccessRestored: "✅ <b>Kirish tiklandi</b>\n\nLogin: <code>{login}</code>\nVaqtinchalik parol: <code>{password}</code>\n\n{loginLink}Tizimga kirib, parolni almashtirish tavsiya etiladi.",
    resetLoginLink: 'Kirish havolasi: {url}\n\n',
    resetAccessError: '❌ Kirishni tiklashda xatolik yuz berdi.',
    noOrdersYet: "📦 Sizda hali buyurtmalar yo'q.",
    ordersTitle: '📦 <b>Buyurtmalaringiz:</b>\n\n',
    ordersLatestTitle: '📦 <b>So‘nggi buyurtmalaringiz:</b>\n\n',
    orderTitle: 'Buyurtma',
    orderStatusLabel: 'Holat',
    ordersFetchError: "❌ Buyurtmalarni olishda xatolik yuz berdi",
    menuAddressPrompt: '📍 Yetkazib berish manzilini yuboring:',
    sendGeoForDeliveryPrompt: '📍 Yetkazib berish uchun geolokatsiyani yuboring:',
    sendGeoButton: '📍 Geolokatsiyani yuborish',
    sendAnotherLocationButton: '📍 Boshqa lokatsiya yuborish',
    openStoreButton: "🏪 Do'konni ochish",
    storeClosedNow: '😔 Kechirasiz, ushbu do‘kon {start} dan {end} gacha ishlaydi.\n\nIltimos, keyinroq urinib ko‘ring!',
    deliveryAvailable: "✅ A'lo! Yetkazib berish mavjud!\n\n🏪 Do'kon: <b>{store}</b>",
    deliveryLinkIssue: "⚠️ Havola berishda xatolik. /menu buyrug'i bilan urinib ko'ring.",
    registrationSuccess: "✅ Ro'yxatdan o'tish muvaffaqiyatli!\n\n🏪 Do'kon: <b>{store}</b>\n📍 Manzilingiz bo'yicha yetkazib berish mavjud!{closedNote}",
    storeClosedOrderHint: '\n\nℹ️ Hozir do‘kon yopiq, ish vaqti: {start} - {end}. Buyurtmani ish vaqtida rasmiylashtirish mumkin.',
    deliveryUnavailable: "😔 Kechirasiz!\n\nAfsuski, manzilingizga yetkazib berish hozircha mavjud emas.\n\n📍 Boshqa lokatsiya yuboring yoki aniqlik uchun biz bilan bog'laning.",
    quickHelpText: "📖 <b>Yordam</b>\n\n📍 <b>Lokatsiya yuborish</b> — buyurtmani boshlash\n📋 <b>Buyurtmalarim</b> — buyurtmalar tarixi\n\nBuyruqlar:\n/start — boshlash\n/menu — menyuni ochish\n/orders — buyurtmalarim",
    orderNotFound: '❌ Buyurtma topilmadi',
    orderAlreadyProcessed: '⚠️ Buyurtma allaqachon qayta ishlangan',
    insufficientBalanceAlert: "❌ Do'kon balansida mablag' yetarli emas\nBalans: {balance} so'm\nKerak: {required} so'm",
    orderAcceptFailed: '❌ Buyurtmani qabul qilib bo‘lmadi',
    orderConfirmed: '✅ Buyurtma tasdiqlandi!',
    callbackErrorPrefix: '❌ Xatolik: ',
    rejectOrderPrompt: '❌ <b>Buyurtma #{orderId} bekor qilinmoqda</b>\n\nBekor qilish sababini yozing:',
    rejectSummary: '❌ <b>Buyurtma #{orderId} bekor qilindi</b>\n\nSabab: {reason}\nOperator: {operator}',
    rejectOrderError: '❌ Buyurtmani bekor qilishda xatolik yuz berdi',
    thanksName: '✅ Rahmat!\n\n👤 Endi ismingizni kiriting:',
    niceToMeet: '👋 Tanishganimdan xursandman, {name}!\n\n📍 Endi yetkazib berish hududini tekshirish uchun geolokatsiyangizni yuboring:',
    shareContact: '📱 Kontaktni yuborish',
    shareLocation: '📍 Lokatsiyani yuborish'
  }
};

function normalizePhone(rawPhone) {
  if (!rawPhone) return '';
  const trimmed = String(rawPhone).trim().replace(/\s+/g, '');
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }
  return trimmed.replace(/\D/g, '');
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

async function ensureActivityTypesSchema() {
  if (activityTypesSchemaReady) return;
  if (activityTypesSchemaPromise) {
    await activityTypesSchemaPromise;
    return;
  }

  activityTypesSchemaPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS business_activity_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        sort_order INTEGER DEFAULT 0,
        is_visible BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('ALTER TABLE business_activity_types ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT true');
    await pool.query('ALTER TABLE business_activity_types ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0');
    await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS activity_type_id INTEGER');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_business_activity_types_sort_order ON business_activity_types(sort_order, id)');
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_business_activity_types_name_lower ON business_activity_types (LOWER(name))');

    for (let i = 0; i < DEFAULT_ACTIVITY_TYPES.length; i += 1) {
      await pool.query(
        `INSERT INTO business_activity_types (name, sort_order, is_visible)
         VALUES ($1, $2, true)
         ON CONFLICT ((LOWER(name))) DO NOTHING`,
        [DEFAULT_ACTIVITY_TYPES[i], i + 1]
      );
    }

    activityTypesSchemaReady = true;
  })();

  try {
    await activityTypesSchemaPromise;
  } finally {
    activityTypesSchemaPromise = null;
  }
}

async function getVisibleActivityTypes() {
  await ensureActivityTypesSchema();
  const result = await pool.query(`
    SELECT id, name, sort_order
    FROM business_activity_types
    WHERE is_visible = true
    ORDER BY sort_order ASC, name ASC, id ASC
  `);
  return result.rows;
}

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

async function resolveUniqueAuthUsername(clientOrPool, preferredUsername, ownerUserId = null) {
  const db = clientOrPool || pool;
  const raw = String(preferredUsername || '').trim();
  const fallbackBase = raw || `user_${ownerUserId || Date.now()}`;
  let candidate = fallbackBase;
  let suffix = 1;

  while (true) {
    const existing = await db.query(
      'SELECT id FROM users WHERE username = $1 LIMIT 1',
      [candidate]
    );
    if (existing.rows.length === 0) return candidate;
    if (ownerUserId && Number(existing.rows[0].id) === Number(ownerUserId)) return candidate;

    const base = fallbackBase.endsWith('_op') ? fallbackBase : `${fallbackBase}_op`;
    candidate = suffix === 1 ? base : `${base}_${suffix}`;
    suffix += 1;
  }
}

function passwordFromPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '0000';
  return digits.slice(-4).padStart(4, '0');
}

function normalizePhoneDigits(rawPhone) {
  return String(normalizePhone(rawPhone) || '').replace(/\D/g, '');
}

function formatPhoneWithPlus(rawPhone) {
  const digits = normalizePhoneDigits(rawPhone);
  if (!digits) return '';
  return `+${digits}`;
}

function parseTelegramGroupId(rawGroupId) {
  if (rawGroupId === undefined || rawGroupId === null) return null;
  const normalized = String(rawGroupId).trim();
  if (!/^-?\d{5,20}$/.test(normalized)) return null;
  return normalized;
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

function buildStoreRegistrationWebAppUrl(userId, lang = 'ru') {
  const base = process.env.TELEGRAM_WEB_APP_URL || process.env.FRONTEND_URL;
  if (!base) return null;
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  const search = new URLSearchParams();
  search.set('source', 'superadmin_bot');
  if (userId) {
    try {
      const launchToken = generateStoreRegistrationLaunchToken(userId, lang);
      if (launchToken) {
        search.set('launch_token', launchToken);
      }
    } catch (error) {
      console.warn('Store registration launch token generation warning:', error.message);
    }
  }
  return appendWebAppCacheVersion(`${trimmed}/webapp/store-registration?${search.toString()}`);
}

async function resolvePreferredAdminTelegramUser(telegramId) {
  const linkedAdmin = await pool.query(`
    SELECT u.*
    FROM telegram_admin_links tal
    JOIN users u ON u.id = tal.user_id
    WHERE tal.telegram_id = $1
    ORDER BY
      CASE
        WHEN u.role = 'superadmin' THEN 0
        WHEN u.role = 'operator' THEN 1
        WHEN u.role = 'customer' THEN 2
        ELSE 3
      END,
      u.id DESC
    LIMIT 1
  `, [telegramId]).catch(() => ({ rows: [] }));

  if (linkedAdmin.rows.length > 0) {
    return linkedAdmin.rows[0];
  }

  const result = await pool.query(`
    SELECT *
    FROM users
    WHERE telegram_id = $1
    ORDER BY
      CASE
        WHEN role = 'superadmin' THEN 0
        WHEN role = 'operator' THEN 1
        WHEN role = 'customer' THEN 2
        ELSE 3
      END,
      id DESC
    LIMIT 1
  `, [telegramId]);

  return result.rows[0] || null;
}

async function upsertTelegramAdminLink(clientOrPool, telegramId, userId) {
  if (!telegramId || !userId) return;
  const db = clientOrPool || pool;
  await db.query(`
    INSERT INTO telegram_admin_links (telegram_id, user_id)
    VALUES ($1, $2)
    ON CONFLICT (telegram_id)
    DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = CURRENT_TIMESTAMP
  `, [telegramId, userId]).catch(() => {});
}

async function resolvePreferredSuperadminAccessUser(telegramId) {
  const user = await resolvePreferredAdminTelegramUser(telegramId);
  if (!user) return null;
  if (user.role === 'customer') return null;
  return user;
}

async function silentlySyncOperatorTelegramId(telegramId, telegramLanguageCode = '') {
  if (!telegramId) return;
  const preferredLang = getTelegramPreferredLanguage(telegramLanguageCode);
  try {
    await pool.query(
      `UPDATE users
       SET bot_language = COALESCE(NULLIF(bot_language, ''), $2),
           updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = $1
         AND role IN ('operator', 'superadmin')`,
      [telegramId, preferredLang]
    ).catch(() => {});

    const existingLink = await pool.query(
      'SELECT user_id FROM telegram_admin_links WHERE telegram_id = $1 LIMIT 1',
      [telegramId]
    ).catch(() => ({ rows: [] }));
    if (existingLink.rows.length > 0) return;

    const candidate = await pool.query(
      `SELECT id
       FROM users
       WHERE telegram_id = $1
         AND role IN ('superadmin', 'operator')
       ORDER BY
         CASE WHEN role = 'superadmin' THEN 0 ELSE 1 END,
         id DESC
       LIMIT 1`,
      [telegramId]
    ).catch(() => ({ rows: [] }));
    if (candidate.rows.length > 0) {
      await upsertTelegramAdminLink(pool, telegramId, candidate.rows[0].id);
    }
  } catch (error) {
    console.warn('Silent telegram link sync warning:', error.message);
  }
}

async function resolvePrimaryRestaurantIdForAdminUser(user) {
  const activeRestaurantId = Number.parseInt(user?.active_restaurant_id, 10);
  if (Number.isInteger(activeRestaurantId) && activeRestaurantId > 0) {
    return activeRestaurantId;
  }
  if (!user?.id) return null;

  const linkedRestaurantResult = await pool.query(
    `SELECT restaurant_id
     FROM operator_restaurants
     WHERE user_id = $1
     ORDER BY restaurant_id ASC
     LIMIT 1`,
    [user.id]
  );
  const linkedRestaurantId = Number.parseInt(linkedRestaurantResult.rows[0]?.restaurant_id, 10);
  return Number.isInteger(linkedRestaurantId) && linkedRestaurantId > 0
    ? linkedRestaurantId
    : null;
}

async function buildOperatorStoreWebAppUrl(user) {
  const appUrl = process.env.TELEGRAM_WEB_APP_URL || process.env.FRONTEND_URL;
  if (!appUrl || !user?.id) return null;

  const restaurantId = await resolvePrimaryRestaurantIdForAdminUser(user);
  if (!restaurantId) return null;

  const username = user.username || `user_${user.id}`;
  const token = generateLoginToken(user.id, username, { restaurantId });
  return buildCatalogUrl(appUrl, token);
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

async function saveUserLanguage(userId, lang) {
  const normalized = normalizeBotLanguage(lang);
  languagePreferences.set(userId, normalized);
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
}

function resolveUploadsDir() {
  return process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(__dirname, '../../uploads');
}

function ensureUploadsDirExists() {
  const uploadsDir = resolveUploadsDir();
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
}

function downloadFile(url, destinationPath) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(destinationPath);

    const cleanupWithError = (error) => {
      fileStream.close(() => {
        fs.unlink(destinationPath, () => reject(error));
      });
    };

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        cleanupWithError(new Error(`Download failed: ${response.statusCode}`));
        return;
      }

      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(() => resolve(destinationPath));
      });
    }).on('error', cleanupWithError);

    fileStream.on('error', cleanupWithError);
  });
}

function getOnboardingStateKey(userId) {
  return `onboard_${userId}`;
}

const ONBOARDING_TEXTS = {
  ru: {
    intro: '🧭 <b>Онбординг магазина</b>\n\nОбязательные поля:\n• Название магазина\n• Вид деятельности\n• ФИО\n• Номер телефона\n• Локация\n\nНеобязательные поля можно пропустить.',
    start: '▶️ Начать',
    cancel: '❌ Отмена',
    cancelled: '❌ Онбординг отменен.',
    skip: '⏭️ Пропустить',
    skipGroupDone: '⏭️ Шаг с группой пропущен.',
    useGroupOrSkipHint: 'ℹ️ Используйте кнопку "👥 Поделиться группой", отправьте ID группы вручную (пример: -1001234567890) или нажмите "⏭️ Пропустить".',
    instructionButton: '📘 Инструкция',
    shareGroup: '👥 Поделиться группой',
    addLogo: '➕ Добавить логотип',
    addToken: '➕ Добавить токен',
    addGroup: '➕ Поделиться группой',
    hasOwnBotPrompt: '🤖 У вас уже есть собственный бот?',
    hasOwnBotYes: '✅ Да',
    hasOwnBotNo: '❌ Нет',
    registerBotButton: '🤖 Регистрация бота',
    iGotToken: '✅ Я получил токен',
    botFatherGuide: '🛠 <b>Как зарегистрировать нового бота</b>\n\n1. Откройте @BotFather\n2. Нажмите /newbot\n3. Введите имя бота\n4. Введите username (должен заканчиваться на <code>bot</code>)\n5. Скопируйте выданный Bot Token\n6. Вернитесь сюда и нажмите <b>«✅ Я получил токен»</b>',
    optionalLogo: '🖼️ Логотип магазина (необязательно):',
    optionalToken: '🤖 Укажите Bot Token магазина:',
    optionalGroup: '👥 Группа для заказов (необязательно на этом шаге):',
    promptStoreName: '🏪 Введите <b>название магазина</b>:',
    promptActivityType: '🧩 Выберите <b>вид деятельности магазина</b> из списка и отправьте <b>номер</b>:\n\n{list}',
    promptFullName: '👤 Введите <b>ФИО оператора</b>:',
    promptPhone: '📱 Отправьте <b>номер телефона</b>:',
    promptLocation: '📍 Отправьте <b>локацию магазина</b>:',
    promptLogo: '🖼️ Отправьте <b>фото логотипа</b> или ссылку (URL):',
    promptToken: '🤖 Отправьте <b>Bot Token</b> вашего магазина:',
    promptGroup: '👥 Нажмите кнопку ниже и <b>поделитесь группой</b> для заказов.\n\nПосле добавления в группу обязательно сделайте бота <b>администратором с полным доступом</b>.\n\nМожно также отправить ID группы вручную (пример: <code>-1001234567890</code>):',
    groupConnected: '✅ Группа подключена.\n\nID группы: <code>{groupId}</code>',
    requiredFieldsComplete: '✅ Обязательные поля заполнены.\n\nДалее можно добавить необязательные данные или пропустить:',
    logoSaved: '✅ Логотип получен и сохранен.',
    photoReadError: '❌ Не удалось прочитать фото. Отправьте изображение еще раз.',
    photoSaveError: '❌ Не удалось сохранить фото. Попробуйте снова или отправьте URL.',
    requiredStoreName: '❌ Название магазина обязательно. Введите название.',
    requiredActivityType: '❌ Справочник видов деятельности пока пуст. Обратитесь к суперадмину.',
    invalidActivityTypeChoice: '❌ Неверный номер. Отправьте номер вида деятельности из списка.',
    requiredFullName: '❌ ФИО обязательно. Введите ФИО.',
    invalidPhone: '❌ Некорректный номер телефона. Введите номер еще раз.',
    finalizeError: '❌ Ошибка создания доступа. Попробуйте позже.',
    loginButton: '🔐 Войти в систему',
    locationNotSpecified: 'не указана',
    loginUrlMissing: '⚠️ URL входа не настроен в переменных окружения.',
    instructionVideoMissing: 'ℹ️ Для этого этапа видео-инструкция пока не добавлена.',
    finalSuccess: '✅ <b>Регистрация завершена</b>\n\n🏪 Магазин: <b>{restaurant}</b>\n👤 ФИО: {fullName}\n📱 Логин: <code>{username}</code>\n🔐 Пароль: <code>{password}</code>\n📍 Локация: {location}\n🚚 Радиус доставки: 3 км (по умолчанию)\n\n{loginLine}'
  },
  uz: {
    intro: '🧭 <b>Do‘kon onbordingi</b>\n\nMajburiy maydonlar:\n• Do‘kon nomi\n• Faoliyat turi\n• F.I.Sh.\n• Telefon raqami\n• Lokatsiya\n\nIxtiyoriy maydonlarni o‘tkazib yuborish mumkin.',
    start: '▶️ Boshlash',
    cancel: '❌ Bekor qilish',
    cancelled: '❌ Onbording bekor qilindi.',
    skip: '⏭️ O‘tkazib yuborish',
    skipGroupDone: '⏭️ Guruh bosqichi o‘tkazib yuborildi.',
    useGroupOrSkipHint: 'ℹ️ "👥 Guruhni ulashish" tugmasidan foydalaning, guruh ID ni qo‘lda yuboring (masalan: -1001234567890) yoki "⏭️ O‘tkazib yuborish"ni bosing.',
    instructionButton: '📘 Yo‘riqnoma',
    shareGroup: '👥 Guruhni ulashish',
    addLogo: '➕ Logotip qo‘shish',
    addToken: '➕ Token qo‘shish',
    addGroup: '➕ Guruhni ulashish',
    hasOwnBotPrompt: '🤖 Sizda shaxsiy bot bormi?',
    hasOwnBotYes: '✅ Ha',
    hasOwnBotNo: '❌ Yo‘q',
    registerBotButton: '🤖 Bot ro‘yxatdan o‘tkazish',
    iGotToken: '✅ Token oldim',
    botFatherGuide: '🛠 <b>Yangi botni qanday ro‘yxatdan o‘tkazish</b>\n\n1. @BotFather ni oching\n2. /newbot buyrug‘ini yuboring\n3. Bot nomini kiriting\n4. Username kiriting (oxiri <code>bot</code> bilan tugashi kerak)\n5. Berilgan Bot Token ni nusxalang\n6. Shu botga qaytib, <b>«✅ Token oldim»</b> tugmasini bosing',
    optionalLogo: '🖼️ Do‘kon logotipi (ixtiyoriy):',
    optionalToken: '🤖 Do‘kon Bot Tokenini kiriting:',
    optionalGroup: '👥 Buyurtmalar uchun guruh (bu bosqichda ixtiyoriy):',
    promptStoreName: '🏪 <b>Do‘kon nomini</b> kiriting:',
    promptActivityType: '🧩 Do‘konning <b>faoliyat turini</b> ro‘yxatdan tanlang va <b>raqamini</b> yuboring:\n\n{list}',
    promptFullName: '👤 <b>Operator F.I.Sh.</b> ni kiriting:',
    promptPhone: '📱 <b>Telefon raqamini</b> yuboring:',
    promptLocation: '📍 <b>Do‘kon lokatsiyasini</b> yuboring:',
    promptLogo: '🖼️ <b>Logotip rasmini</b> yoki havolani (URL) yuboring:',
    promptToken: '🤖 Do‘koningizning <b>Bot Token</b>ini yuboring:',
    promptGroup: '👥 Quyidagi tugmani bosing va buyurtmalar uchun <b>guruhni ulashing</b>.\n\nBotga guruhda <b>to‘liq huquqli admin</b> ruxsatini bering.\n\nYoki guruh ID ni qo‘lda yuboring (masalan: <code>-1001234567890</code>):',
    groupConnected: '✅ Guruh ulandi.\n\nGuruh ID: <code>{groupId}</code>',
    requiredFieldsComplete: '✅ Majburiy maydonlar to‘ldirildi.\n\nEndi ixtiyoriy ma’lumotlarni qo‘shishingiz yoki o‘tkazib yuborishingiz mumkin:',
    logoSaved: '✅ Logotip qabul qilindi va saqlandi.',
    photoReadError: '❌ Rasmni o‘qib bo‘lmadi. Iltimos, qayta yuboring.',
    photoSaveError: '❌ Rasmni saqlab bo‘lmadi. Qayta urinib ko‘ring yoki URL yuboring.',
    requiredStoreName: '❌ Do‘kon nomi majburiy. Nomni kiriting.',
    requiredActivityType: '❌ Faoliyat turlari ro‘yxati hozircha bo‘sh. Superadmiga murojaat qiling.',
    invalidActivityTypeChoice: '❌ Noto‘g‘ri raqam. Ro‘yxatdagi faoliyat turi raqamini yuboring.',
    requiredFullName: '❌ F.I.Sh. majburiy. F.I.Sh.ni kiriting.',
    invalidPhone: '❌ Telefon raqami noto‘g‘ri. Qayta kiriting.',
    finalizeError: '❌ Kirish ma’lumotlarini yaratishda xatolik. Keyinroq urinib ko‘ring.',
    loginButton: '🔐 Tizimga kirish',
    locationNotSpecified: 'ko‘rsatilmagan',
    loginUrlMissing: '⚠️ Kirish URL manzili muhit o‘zgaruvchilarida sozlanmagan.',
    instructionVideoMissing: 'ℹ️ Bu bosqich uchun video yo‘riqnoma hali qo‘shilmagan.',
    finalSuccess: '✅ <b>Ro‘yxatdan o‘tish yakunlandi</b>\n\n🏪 Do‘kon: <b>{restaurant}</b>\n👤 F.I.Sh.: {fullName}\n📱 Login: <code>{username}</code>\n🔐 Parol: <code>{password}</code>\n📍 Lokatsiya: {location}\n🚚 Yetkazib berish radiusi: 3 km (standart)\n\n{loginLine}'
  }
};

function onboardingT(langOrUserId, key, vars = {}) {
  const lang = BOT_LANGUAGES.includes(String(langOrUserId))
    ? normalizeBotLanguage(langOrUserId)
    : normalizeBotLanguage(languagePreferences.get(langOrUserId) || 'ru');
  const dict = ONBOARDING_TEXTS[lang] || ONBOARDING_TEXTS.ru;
  const template = dict[key] || ONBOARDING_TEXTS.ru[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, varName) => String(vars[varName] ?? ''));
}

function getOnboardingLanguage(userId) {
  const state = onboardingStates.get(getOnboardingStateKey(userId));
  return normalizeBotLanguage(state?.lang || languagePreferences.get(userId) || 'ru');
}

const ONBOARDING_INSTRUCTION_CODES = {
  store_registration: 'store_registration',
  logo: 'store_logo',
  token: 'bot_token',
  bot_registration: 'add_own_bot',
  group: 'group_and_assign_bot'
};
const BOTFATHER_URL = 'https://t.me/BotFather';

async function resolveSuperadminBotToken() {
  try {
    const result = await pool.query(
      'SELECT superadmin_bot_token FROM billing_settings WHERE id = 1'
    );
    const tokenFromDb = result.rows[0]?.superadmin_bot_token;
    if (tokenFromDb && String(tokenFromDb).trim()) {
      return String(tokenFromDb).trim();
    }
  } catch (error) {
    console.warn('⚠️  Failed to load superadmin bot token from DB:', error.message);
  }

  return process.env.TELEGRAM_BOT_TOKEN || '';
}

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
    console.log(`🔍 Searching restaurant for location: ${lat}, ${lng}`);
    
    const result = await pool.query(`
      SELECT id, name, delivery_zone, logo_url, start_time, end_time
      FROM restaurants 
      WHERE is_active = true
    `);
    
    console.log(`📍 Found ${result.rows.length} active restaurants`);
    
    for (const restaurant of result.rows) {
      let zone = restaurant.delivery_zone;
      
      console.log(`🏪 Restaurant: ${restaurant.name}, zone type: ${typeof zone}, zone: ${zone ? 'exists' : 'null'}`);
      
      if (!zone) {
        console.log(`   ⚠️ No delivery zone for ${restaurant.name}`);
        continue;
      }
      
      // Parse if string
      if (typeof zone === 'string') {
        try {
          zone = JSON.parse(zone);
        } catch (e) {
          console.log(`   ❌ Failed to parse zone: ${e.message}`);
          continue;
        }
      }
      
      console.log(`   📐 Zone has ${zone?.length || 0} points`);
      if (zone && zone.length > 0) {
        console.log(`   📐 First point: ${JSON.stringify(zone[0])}`);
      }
      
      if (zone && zone.length >= 3) {
        const isInside = isPointInPolygon([lat, lng], zone);
        console.log(`   🎯 Point [${lat}, ${lng}] inside zone: ${isInside}`);
        
        if (isInside) {
          return restaurant;
        }
      }
    }
    
    console.log('❌ No matching restaurant found');
    return null;
  } catch (error) {
    console.error('Find restaurant error:', error);
    return null;
  }
}

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

async function initBot() {
  const token = await resolveSuperadminBotToken();
  activeSuperadminBotToken = token || '';
  
  if (!token) {
    console.warn('⚠️  Superadmin bot token not set, bot will not be initialized');
    return;
  }
  
  const isProduction = process.env.NODE_ENV === 'production';
  const webAppUrl = process.env.TELEGRAM_WEB_APP_URL || process.env.FRONTEND_URL;
  const webhookBaseUrl = process.env.TELEGRAM_WEBHOOK_URL || process.env.BACKEND_URL || process.env.FRONTEND_URL || webAppUrl;
  
  if (isProduction && webhookBaseUrl) {
    const webhookPath = '/api/telegram/webhook';
    const webhookUrl = `${webhookBaseUrl}${webhookPath}`;
    const webhookSecretToken = getTelegramWebhookSecretToken();
    
    bot = new TelegramBot(token);
    
    const webhookOptions = webhookSecretToken ? { secret_token: webhookSecretToken } : undefined;
    bot.setWebHook(webhookUrl, webhookOptions).then(() => {
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

  async function saveTelegramPhotoAsUpload(fileId) {
    const fileData = await bot.getFile(fileId);
    const filePath = fileData?.file_path;
    if (!filePath) {
      throw new Error('Telegram file path not found');
    }

    const ext = path.extname(filePath) || '.jpg';
    const filename = `logo-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const uploadsDir = ensureUploadsDirExists();
    const destinationPath = path.join(uploadsDir, filename);
    const telegramFileUrl = `https://api.telegram.org/file/bot${activeSuperadminBotToken}/${filePath}`;

    await downloadFile(telegramFileUrl, destinationPath);
    return `/uploads/${filename}`;
  }

  async function sendLanguagePicker(chatId, userId, nextAction = 'start', defaultLang = 'ru') {
    pendingLanguageActions.set(userId, nextAction);
    const activeLang = normalizeBotLanguage(defaultLang);
    await bot.sendMessage(chatId, t(activeLang, 'chooseLanguage'), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🇷🇺 Русский', callback_data: 'set_lang_ru' },
            { text: '🇺🇿 O`zbekcha', callback_data: 'set_lang_uz' }
          ]
        ]
      }
    });
  }

  async function tryDeleteBotMessage(chatId, messageId) {
    if (!chatId || !messageId) return;
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (_) { }
  }

  function rememberOnboardingUiMessage(userId, messageId) {
    if (!userId || !messageId) return;
    const current = onboardingUiMessageIds.get(userId) || [];
    const next = current.includes(messageId) ? current : [...current, messageId].slice(-30);
    onboardingUiMessageIds.set(userId, next);
  }

  async function sendOnboardingUiMessage(chatId, userId, text, options = {}) {
    const sent = await bot.sendMessage(chatId, text, options);
    if (sent?.message_id) {
      rememberOnboardingUiMessage(userId, sent.message_id);
    }
    return sent;
  }

  async function clearOnboardingUiMessages(chatId, userId, extraMessageIds = []) {
    const tracked = onboardingUiMessageIds.get(userId) || [];
    onboardingUiMessageIds.delete(userId);
    const ids = [...new Set([...tracked, ...extraMessageIds].filter(Boolean))];
    for (const id of ids) {
      await tryDeleteBotMessage(chatId, id);
    }
  }

  async function getSuperadminActionReplyMarkup(userId, lang) {
    const language = normalizeBotLanguage(lang);
    const user = await resolvePreferredSuperadminAccessUser(userId);
    const isAdminUser = !!user && (user.role === 'operator' || user.role === 'superadmin');

    let keyboard;
    if (isAdminUser) {
      const username = user.username || `user_${user.id}`;
      const adminAutoLoginToken = generateLoginToken(user.id, username, {
        expiresIn: '1h',
        role: user.role
      });
      const adminLoginUrl = buildWebLoginUrl({
        portal: 'admin',
        source: 'superadmin_bot',
        token: adminAutoLoginToken
      });
      const storeUrl = await buildOperatorStoreWebAppUrl(user);

      const loginButton = adminLoginUrl
        ? { text: t(language, 'loginButton'), web_app: { url: adminLoginUrl } }
        : { text: t(language, 'loginButton') };
      const storeButton = storeUrl
        ? { text: t(language, 'myStoreButton'), web_app: { url: storeUrl } }
        : { text: t(language, 'myStoreButton') };

      keyboard = [
        [loginButton, storeButton],
        [{ text: t(language, 'resetButton') }],
        [{ text: t(language, 'languageMenuButton') }, { text: t(language, 'helpMenuButton') }]
      ];
    } else {
      const registrationWebAppUrl = buildStoreRegistrationWebAppUrl(userId, language);
      const registerButton = registrationWebAppUrl
        ? { text: t(language, 'registerStoreButton'), web_app: { url: registrationWebAppUrl } }
        : { text: t(language, 'registerStoreButton') };
      keyboard = [
        [registerButton, { text: t(language, 'languageMenuButton') }],
        [{ text: t(language, 'helpMenuButton') }]
      ];
    }

    return {
      keyboard,
      resize_keyboard: true
    };
  }

  async function sendStartMenu(chatId, userId, lang) {
    const language = normalizeBotLanguage(lang);
    const user = await resolvePreferredSuperadminAccessUser(userId);
    const previousStartMenuMsgId = lastSuperadminStartMenuMessageIds.get(userId);
    if (previousStartMenuMsgId) {
      await tryDeleteBotMessage(chatId, previousStartMenuMsgId);
    }

    if (user) {

      if (!user.is_active) {
        const actionKeyboard = await getSuperadminActionReplyMarkup(userId, language);
        const sent = await bot.sendMessage(
          chatId,
          `${t(language, 'blockedText')}\n\nhttps://t.me/budavron`,
          {
            parse_mode: 'HTML',
            reply_markup: actionKeyboard
          }
        );
        if (sent?.message_id) {
          lastSuperadminStartMenuMessageIds.set(userId, sent.message_id);
        }
        return;
      }

      if (user.role === 'operator' || user.role === 'superadmin') {
        const actionKeyboard = await getSuperadminActionReplyMarkup(userId, language);
        const adminAutoLoginToken = generateLoginToken(user.id, user.username, {
          expiresIn: '1h',
          role: user.role
        });
        const loginUrl = buildWebLoginUrl({
          portal: 'admin',
          source: 'superadmin_bot',
          token: adminAutoLoginToken
        });
        const loginUrlLine = loginUrl
          ? (language === 'uz' ? `\n\n🔗 Kirish: ${loginUrl}` : `\n\n🔗 Вход: ${loginUrl}`)
          : '';
        const sent = await bot.sendMessage(
          chatId,
          `${t(language, 'welcomeBack', { name: user.full_name || user.username })}\n\n` +
          `${t(language, 'roleLine', { role: user.role === 'superadmin' ? t(language, 'roleSuperadmin') : t(language, 'roleOperator') })}` +
          loginUrlLine,
          {
            parse_mode: 'HTML',
            reply_markup: actionKeyboard
          }
        );
        if (sent?.message_id) {
          lastSuperadminStartMenuMessageIds.set(userId, sent.message_id);
        }
      }
      return;
    }

    const actionKeyboard = await getSuperadminActionReplyMarkup(userId, language);
    const sent = await bot.sendMessage(
      chatId,
      t(language, 'welcomeStart'),
      {
        parse_mode: 'HTML',
        reply_markup: actionKeyboard
      }
    );
    if (sent?.message_id) {
      lastSuperadminStartMenuMessageIds.set(userId, sent.message_id);
    }
  }

  async function sendSuperadminHelpInfo(chatId, lang) {
    const language = normalizeBotLanguage(lang);
    try {
      await ensureHelpInstructionsSchema();
      const instructions = await listHelpInstructions();
      const rowsWithVideo = instructions
        .filter((item) => String(item?.youtube_url || '').trim())
        .sort((a, b) => {
          const sortDiff = Number(a?.sort_order || 0) - Number(b?.sort_order || 0);
          if (sortDiff !== 0) return sortDiff;
          return Number(a?.id || 0) - Number(b?.id || 0);
        });

      if (!rowsWithVideo.length) {
        await bot.sendMessage(
          chatId,
          language === 'uz'
            ? 'Hozircha video yo‘riqnomalar qo‘shilmagan.'
            : 'Пока видео-инструкции не добавлены.'
        );
        return;
      }

      const inlineKeyboard = rowsWithVideo.map((item) => ([
        {
          text: language === 'uz'
            ? (item.title_uz || item.title_ru || 'Видео')
            : (item.title_ru || item.title_uz || 'Видео'),
          url: String(item.youtube_url).trim()
        }
      ]));

      const message = language === 'uz'
        ? '🆘 <b>Yordam bo‘limi</b>\nKerakli video yo‘riqnomani tanlang:'
        : '🆘 <b>Раздел помощи</b>\nВыберите нужную видео-инструкцию:';

      await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: inlineKeyboard }
      });
    } catch (error) {
      console.error('Send superadmin help info error:', error);
      await bot.sendMessage(chatId, t(language, 'genericError'));
    }
  }

  async function sendOnboardingInstruction(chatId, userId, instructionCode) {
    const userLang = getOnboardingLanguage(userId);
    try {
      await ensureHelpInstructionsSchema();
      const instruction = await getHelpInstructionByCode(instructionCode);
      const instructionUrl = String(instruction?.youtube_url || '').trim();
      if (!instructionUrl) {
        await bot.sendMessage(chatId, onboardingT(userLang, 'instructionVideoMissing'));
        return;
      }

      const title = userLang === 'uz'
        ? (instruction?.title_uz || instruction?.title_ru || onboardingT(userLang, 'instructionButton'))
        : (instruction?.title_ru || instruction?.title_uz || onboardingT(userLang, 'instructionButton'));

      await bot.sendMessage(chatId, `📘 <b>${title}</b>`, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[{
            text: onboardingT(userLang, 'instructionButton'),
            url: instructionUrl
          }]]
        }
      });

      if (instruction?.id) {
        await incrementHelpInstructionViewCount(instruction.id).catch(() => {});
      }
    } catch (error) {
      console.error('Onboarding instruction send error:', error);
      await bot.sendMessage(chatId, onboardingT(userLang, 'instructionVideoMissing'));
    }
  }

  async function askHasOwnBotChoice(chatId, userId) {
    const stateKey = getOnboardingStateKey(userId);
    const state = onboardingStates.get(stateKey);
    if (!state) return;
    const userLang = getOnboardingLanguage(userId);
    state.step = 'await_has_bot_choice';
    onboardingStates.set(stateKey, state);
    await sendOnboardingUiMessage(chatId, userId, onboardingT(userLang, 'hasOwnBotPrompt'), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: onboardingT(userLang, 'hasOwnBotYes'), callback_data: 'onboard_has_bot_yes' }],
          [{ text: onboardingT(userLang, 'hasOwnBotNo'), callback_data: 'onboard_has_bot_no' }],
          [{ text: onboardingT(userLang, 'cancel'), callback_data: 'onboard_cancel' }]
        ]
      }
    });
  }

  async function askOnboardingField(chatId, userId, field) {
    const userLang = getOnboardingLanguage(userId);
    const prompts = {
      store_name: onboardingT(userLang, 'promptStoreName'),
      activity_type: null,
      full_name: onboardingT(userLang, 'promptFullName'),
      phone: onboardingT(userLang, 'promptPhone'),
      location: onboardingT(userLang, 'promptLocation'),
      logo_url: onboardingT(userLang, 'promptLogo'),
      bot_token: onboardingT(userLang, 'promptToken'),
      group_id: onboardingT(userLang, 'promptGroup')
    };

    if (field === 'activity_type') {
      const activityTypes = await getVisibleActivityTypes();
      if (!activityTypes.length) {
        await sendOnboardingUiMessage(chatId, userId, onboardingT(userLang, 'requiredActivityType'), {
          reply_markup: {
            inline_keyboard: [[{ text: onboardingT(userLang, 'cancel'), callback_data: 'onboard_cancel' }]]
          }
        });
        return;
      }

      const numberedList = activityTypes.map((item, index) => `${index + 1}. ${item.name}`).join('\n');
      await sendOnboardingUiMessage(chatId, userId, onboardingT(userLang, 'promptActivityType', { list: numberedList }), {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: onboardingT(userLang, 'cancel'), callback_data: 'onboard_cancel' }]]
        }
      });
      return;
    }

    if (field === 'phone') {
      await sendOnboardingUiMessage(chatId, userId, prompts[field], {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [[{ text: t(userLang, 'shareContact'), request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
      return;
    }

    if (field === 'location') {
      await sendOnboardingUiMessage(chatId, userId, prompts[field], {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [[{ text: t(userLang, 'shareLocation'), request_location: true }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
      return;
    }

    if (field === 'logo_url') {
      await sendOnboardingUiMessage(chatId, userId, prompts[field], {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: onboardingT(userLang, 'instructionButton'), callback_data: 'onboard_instruction_logo' }],
            [{ text: onboardingT(userLang, 'cancel'), callback_data: 'onboard_cancel' }]
          ]
        }
      });
      return;
    }

    if (field === 'bot_token') {
      await sendOnboardingUiMessage(chatId, userId, prompts[field], {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: onboardingT(userLang, 'instructionButton'), callback_data: 'onboard_instruction_token' }],
            [{ text: onboardingT(userLang, 'cancel'), callback_data: 'onboard_cancel' }]
          ]
        }
      });
      return;
    }

    if (field === 'group_id') {
      const requestId = Number(Date.now() % 1000000000);
      console.log(`[onboarding] requesting group share: user=${userId}, request_id=${requestId}`);
      await sendOnboardingUiMessage(chatId, userId, prompts[field], {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [
            [{
              text: onboardingT(userLang, 'shareGroup'),
              request_chat: {
                request_id: requestId,
                chat_is_channel: false
              }
            }],
            [{ text: onboardingT(userLang, 'instructionButton') }],
            [{ text: onboardingT(userLang, 'skip') }],
            [{ text: onboardingT(userLang, 'cancel') }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      });
      return;
    }

    await sendOnboardingUiMessage(chatId, userId, prompts[field], {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: onboardingT(userLang, 'cancel'), callback_data: 'onboard_cancel' }]]
      }
    });
  }

  async function showOptionalStep(chatId, userId, stepName) {
    const stateKey = getOnboardingStateKey(userId);
    const state = onboardingStates.get(stateKey);
    if (!state) return;
    const userLang = getOnboardingLanguage(userId);

    if (stepName === 'logo_url') {
      state.step = 'await_logo_choice';
      onboardingStates.set(stateKey, state);
      await sendOnboardingUiMessage(chatId, userId,
        onboardingT(userLang, 'optionalLogo'),
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: onboardingT(userLang, 'addLogo'), callback_data: 'onboard_add_logo' }],
              [{ text: onboardingT(userLang, 'skip'), callback_data: 'onboard_skip_logo' }],
              [{ text: onboardingT(userLang, 'instructionButton'), callback_data: 'onboard_instruction_logo' }]
            ]
          }
        }
      );
      return;
    }

    if (stepName === 'bot_token') {
      await askHasOwnBotChoice(chatId, userId);
      return;
    }

    if (stepName === 'group_id') {
      state.step = 'await_group_choice';
      onboardingStates.set(stateKey, state);
      await sendOnboardingUiMessage(chatId, userId,
        onboardingT(userLang, 'optionalGroup'),
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: onboardingT(userLang, 'addGroup'), callback_data: 'onboard_add_group' }],
              [{ text: onboardingT(userLang, 'skip'), callback_data: 'onboard_skip_group' }],
              [{ text: onboardingT(userLang, 'instructionButton'), callback_data: 'onboard_instruction_group' }]
            ]
          }
        }
      );
      return;
    }
  }

  async function captureOnboardingGroupId(chatId, userId, rawGroupId, source = 'unknown') {
    const onboardingKey = getOnboardingStateKey(userId);
    const onboardingState = onboardingStates.get(onboardingKey);
    if (!onboardingState || onboardingState.step !== 'await_group_share') {
      return false;
    }

    const parsedGroupId = parseTelegramGroupId(rawGroupId);
    if (!parsedGroupId) {
      console.warn(`[onboarding] invalid group id from ${source}: user=${userId}, value=${String(rawGroupId)}`);
      return false;
    }

    onboardingState.group_id = parsedGroupId;
    onboardingState.step = 'group_selected';
    onboardingStates.set(onboardingKey, onboardingState);
    console.log(`[onboarding] group connected: user=${userId}, source=${source}, group_id=${parsedGroupId}`);

    await bot.sendMessage(
      chatId,
      onboardingT(getOnboardingLanguage(userId), 'groupConnected', { groupId: onboardingState.group_id }),
      {
        parse_mode: 'HTML',
        reply_markup: { remove_keyboard: true }
      }
    );
    await finalizeOnboarding(chatId, userId);
    return true;
  }

  async function finalizeOnboarding(chatId, userId) {
    const stateKey = getOnboardingStateKey(userId);
    const state = onboardingStates.get(stateKey);
    if (!state) return;

    const client = await pool.connect();
    try {
      await ensureActivityTypesSchema();
      await client.query('BEGIN');

      const normalizedPhone = formatPhoneWithPlus(state.phone);
      const preferredUsername = normalizePhoneDigits(state.phone) || `operator_${userId}`;
      const plainPassword = passwordFromPhone(normalizedPhone);
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      const settingsResult = await client.query('SELECT default_starting_balance, default_order_cost FROM billing_settings WHERE id = 1');
      const settings = settingsResult.rows[0] || { default_starting_balance: 100000, default_order_cost: 1000 };

      const restaurantResult = await client.query(`
        INSERT INTO restaurants (
          name, phone, logo_url, telegram_bot_token, telegram_group_id,
          latitude, longitude, start_time, end_time, delivery_base_radius, is_delivery_enabled,
          balance, order_cost, is_active, activity_type_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, '07:00', '23:59', 3, true, $8, $9, true, $10)
        RETURNING id, name, phone, logo_url, telegram_bot_token, telegram_group_id,
                  latitude, longitude, start_time, end_time, delivery_base_radius,
                  is_delivery_enabled, balance, order_cost, is_active, created_at, activity_type_id
      `, [
        state.store_name,
        normalizedPhone || null,
        state.logo_url || null,
        state.bot_token || null,
        state.group_id || null,
        state.location?.latitude || null,
        state.location?.longitude || null,
        settings.default_starting_balance,
        settings.default_order_cost,
        state.activity_type_id || null
      ]);

      const restaurant = restaurantResult.rows[0];
      const preferredLang = normalizeBotLanguage(languagePreferences.get(userId) || 'ru');

      let userIdDb;
      let username;
      const linkedAdminByTg = await client.query(`
        SELECT u.id, u.role
        FROM telegram_admin_links tal
        JOIN users u ON u.id = tal.user_id
        WHERE tal.telegram_id = $1
        ORDER BY
          CASE WHEN u.role = 'superadmin' THEN 0 WHEN u.role = 'operator' THEN 1 ELSE 2 END,
          u.id DESC
        LIMIT 1
      `, [userId]).catch(() => ({ rows: [] }));

      if (linkedAdminByTg.rows.length > 0) {
        userIdDb = linkedAdminByTg.rows[0].id;
        username = await resolveUniqueAuthUsername(client, preferredUsername, userIdDb);
        await client.query(`
          UPDATE users
          SET username = $1,
              password = $2,
              full_name = $3,
              phone = $4,
              role = 'operator',
              is_active = true,
              active_restaurant_id = $5,
              bot_language = $6,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $7
        `, [username, hashedPassword, state.full_name, normalizedPhone, restaurant.id, preferredLang, userIdDb]);
      } else {
        const userByTg = await client.query('SELECT id, role FROM users WHERE telegram_id = $1', [userId]);
        if (userByTg.rows.length > 0 && userByTg.rows[0].role !== 'customer') {
          userIdDb = userByTg.rows[0].id;
          username = await resolveUniqueAuthUsername(client, preferredUsername, userIdDb);
          await client.query(`
            UPDATE users
            SET username = $1,
                password = $2,
                full_name = $3,
                phone = $4,
                role = 'operator',
                is_active = true,
                active_restaurant_id = $5,
                bot_language = $6,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $7
          `, [username, hashedPassword, state.full_name, normalizedPhone, restaurant.id, preferredLang, userIdDb]);
          await upsertTelegramAdminLink(client, userId, userIdDb);
        } else if (userByTg.rows.length > 0 && userByTg.rows[0].role === 'customer') {
          username = await resolveUniqueAuthUsername(client, preferredUsername);
          const insertedUser = await client.query(`
            INSERT INTO users (telegram_id, username, password, full_name, phone, role, is_active, active_restaurant_id, bot_language)
            VALUES (NULL, $1, $2, $3, $4, 'operator', true, $5, $6)
            RETURNING id
          `, [username, hashedPassword, state.full_name, normalizedPhone, restaurant.id, preferredLang]);
          userIdDb = insertedUser.rows[0].id;
          await upsertTelegramAdminLink(client, userId, userIdDb);
        } else {
          username = await resolveUniqueAuthUsername(client, preferredUsername);
          const insertedUser = await client.query(`
            INSERT INTO users (telegram_id, username, password, full_name, phone, role, is_active, active_restaurant_id, bot_language)
            VALUES ($1, $2, $3, $4, $5, 'operator', true, $6, $7)
            RETURNING id
          `, [userId, username, hashedPassword, state.full_name, normalizedPhone, restaurant.id, preferredLang]);
          userIdDb = insertedUser.rows[0].id;
          await upsertTelegramAdminLink(client, userId, userIdDb);
        }
      }

      await client.query(`
        INSERT INTO operator_restaurants (user_id, restaurant_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, restaurant_id) DO NOTHING
      `, [userIdDb, restaurant.id]);

      await client.query('COMMIT');
      onboardingStates.delete(stateKey);

      try {
        if (restaurant.telegram_bot_token && String(restaurant.telegram_bot_token).trim()) {
          await reloadMultiBots();
        }
      } catch (reloadErr) {
        console.error('Reload multi bots after onboarding error:', reloadErr.message);
      }

      const adminAutoLoginToken = generateLoginToken(userIdDb, username, {
        expiresIn: '1h',
        role: 'operator'
      });
      const loginUrl = buildWebLoginUrl({
        portal: 'admin',
        source: 'superadmin_bot',
        token: adminAutoLoginToken
      });
      const userLang = normalizeBotLanguage(state.lang || languagePreferences.get(userId) || 'ru');
      const locationText = state.location
        ? `${state.location.latitude.toFixed(6)}, ${state.location.longitude.toFixed(6)}`
        : onboardingT(userLang, 'locationNotSpecified');
      const loginLine = loginUrl
        ? `Вход: ${loginUrl}`
        : onboardingT(userLang, 'loginUrlMissing');
      const localizedLoginLine = loginUrl
        ? (userLang === 'uz' ? `Kirish: ${loginUrl}` : loginLine)
        : loginLine;

      const actionKeyboard = await getSuperadminActionReplyMarkup(userId, userLang);
      await bot.sendMessage(
        chatId,
        onboardingT(userLang, 'finalSuccess', {
          restaurant: restaurant.name,
          fullName: state.full_name,
          username,
          password: plainPassword,
          location: locationText,
          loginLine: localizedLoginLine
        }),
        {
          parse_mode: 'HTML',
          reply_markup: actionKeyboard
        }
      );

      try {
        const superadminsResult = await pool.query(
          `SELECT DISTINCT telegram_id
           FROM users
           WHERE role = 'superadmin'
             AND telegram_id IS NOT NULL
             AND is_active = true`
        );
        const recipients = superadminsResult.rows.map((r) => r.telegram_id).filter(Boolean);
        const locationLine = state.location
          ? `${state.location.latitude.toFixed(6)}, ${state.location.longitude.toFixed(6)}`
          : onboardingT(userLang, 'locationNotSpecified');
        const notificationText =
          `🆕 <b>Новый магазин зарегистрирован</b>\n\n` +
          `🏪 ID: <b>${restaurant.id}</b>\n` +
          `🏪 Название: <b>${restaurant.name}</b>\n` +
          `🧩 Вид деятельности: ${state.activity_type_name || '—'}\n` +
          `👤 Оператор: ${state.full_name || '—'}\n` +
          `📱 Телефон: ${normalizedPhone || '—'}\n` +
          `🔐 Логин: <code>${username || '—'}</code>\n` +
          `🆔 Telegram ID: <code>${userId}</code>\n` +
          `📍 Локация: ${locationLine}\n` +
          `🕒 Часы работы: ${restaurant.start_time || '—'} - ${restaurant.end_time || '—'}\n` +
          `🤖 Bot Token: <code>${restaurant.telegram_bot_token || '—'}</code>\n` +
          `👥 Group ID: <code>${restaurant.telegram_group_id || '—'}</code>\n` +
          `🖼️ Логотип: ${restaurant.logo_url || '—'}\n` +
          `💰 Стартовый баланс: ${Number(restaurant.balance || 0).toLocaleString('ru-RU')} сум\n` +
          `💸 Стоимость заказа: ${Number(restaurant.order_cost || 0).toLocaleString('ru-RU')} сум\n` +
          `🚚 Доставка включена: ${restaurant.is_delivery_enabled ? 'Да' : 'Нет'}`;

        for (const superadminTelegramId of recipients) {
          try {
            await bot.sendMessage(superadminTelegramId, notificationText, { parse_mode: 'HTML', disable_web_page_preview: true });
          } catch (e) { }
        }
      } catch (notifyError) {
        console.error('New restaurant registration notify superadmin error:', notifyError.message);
      }
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Finalize onboarding error:', error);
      await bot.sendMessage(chatId, onboardingT(getOnboardingLanguage(userId), 'finalizeError'));
    } finally {
      client.release();
    }
  }

  async function startOnboarding(chatId, userId) {
    const userLang = normalizeBotLanguage(languagePreferences.get(userId) || 'ru');
    await clearOnboardingUiMessages(chatId, userId);
    onboardingStates.set(getOnboardingStateKey(userId), {
      step: 'await_store_name',
      lang: userLang
    });

    try {
      const introInstruction = await getHelpInstructionByCode('store_registration');
      const introUrl = String(introInstruction?.youtube_url || '').trim();
      if (introUrl) {
        await bot.sendMessage(
          chatId,
          userLang === 'uz'
            ? '🎬 Registratsiyani boshlashdan oldin kirish video yo‘riqnomani ko‘ring:'
            : '🎬 Перед началом регистрации посмотрите вводную видео-инструкцию:',
          {
            disable_web_page_preview: true,
            reply_markup: {
              inline_keyboard: [[{
                text: userLang === 'uz'
                  ? (introInstruction?.title_uz || introInstruction?.title_ru || "Video yo'riqnoma")
                  : (introInstruction?.title_ru || introInstruction?.title_uz || 'Видео-инструкция'),
                url: introUrl
              }]]
            }
          }
        );
      }
    } catch (introError) {
      console.error('Onboarding intro instruction send error:', introError.message);
    }

    await sendOnboardingUiMessage(
      chatId,
      userId,
      onboardingT(userLang, 'intro'),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: onboardingT(userLang, 'start'), callback_data: 'onboard_begin_required' }],
            [{ text: onboardingT(userLang, 'instructionButton'), callback_data: 'onboard_instruction_store_registration' }],
            [{ text: onboardingT(userLang, 'cancel'), callback_data: 'onboard_cancel' }]
          ]
        }
      }
    );
  }

  async function resetAccessByTelegram(chatId, telegramUserId) {
    const user = await resolvePreferredAdminTelegramUser(telegramUserId);
    const userLang = normalizeBotLanguage(
      languagePreferences.get(telegramUserId)
      || user?.bot_language
      || 'ru'
    );

    if (!user) {
      await bot.sendMessage(chatId, t(userLang, 'notRegisteredStart'));
      return;
    }
    if (user.role === 'customer') {
      await bot.sendMessage(
        chatId,
        t(userLang, 'customerResetDisabled')
      );
      return;
    }

    const phoneLogin = normalizePhoneDigits(user.phone);
    if (!phoneLogin) {
      await bot.sendMessage(chatId, t(userLang, 'resetNeedsPhone'));
      return;
    }
    const resolvedLogin = await resolveUniqueAuthUsername(pool, phoneLogin, user.id);

    const temporaryPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    await pool.query(
      `UPDATE users
       SET password = $1,
           username = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [hashedPassword, resolvedLogin, user.id]
    );

    const adminAutoLoginToken = generateLoginToken(user.id, resolvedLogin, {
      expiresIn: '1h',
      role: user.role
    });
    const loginUrl = buildWebLoginUrl({
      portal: 'admin',
      source: 'superadmin_bot',
      token: adminAutoLoginToken
    });
    const loginLink = loginUrl ? t(userLang, 'resetLoginLink', { url: loginUrl }) : '';
    const actionKeyboard = await getSuperadminActionReplyMarkup(telegramUserId, userLang);
    await bot.sendMessage(
      chatId,
      t(userLang, 'resetAccessRestored', {
        login: resolvedLogin,
        password: temporaryPassword,
        loginLink
      }),
      {
        parse_mode: 'HTML',
        reply_markup: actionKeyboard
      }
    );
  }

  bot.onText(/\/onboard/, async (msg) => {
    await startOnboarding(msg.chat.id, msg.from.id);
  });

  bot.onText(/\/reset_password/, async (msg) => {
    try {
      await resetAccessByTelegram(msg.chat.id, msg.from.id);
    } catch (error) {
      console.error('Reset access error:', error);
      const userLang = normalizeBotLanguage(languagePreferences.get(msg.from.id) || getTelegramPreferredLanguage(msg.from?.language_code));
      bot.sendMessage(msg.chat.id, t(userLang, 'resetAccessError'));
    }
  });
  
  // =====================================================
  // /start command
  // =====================================================
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      await silentlySyncOperatorTelegramId(userId, msg.from?.language_code);
      const preferred = getTelegramPreferredLanguage(msg.from?.language_code);
      await sendLanguagePicker(chatId, userId, 'start', preferred);
    } catch (error) {
      console.error('Start command error:', error);
      bot.sendMessage(chatId, t('ru', 'genericError'));
    }
  });

  bot.onText(/\/lang/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const preferred = getTelegramPreferredLanguage(msg.from?.language_code);
    await sendLanguagePicker(chatId, userId, 'language_only', preferred);
  });
  
  // =====================================================
  // Handle contact sharing
  // =====================================================
  bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const contact = msg.contact;

    const onboardingKey = getOnboardingStateKey(userId);
    const onboardingState = onboardingStates.get(onboardingKey);
    if (onboardingState && onboardingState.step === 'await_phone') {
      onboardingState.phone = normalizePhone(contact.phone_number);
      onboardingState.step = 'await_location';
      onboardingStates.set(onboardingKey, onboardingState);
      await askOnboardingField(chatId, userId, 'location');
      return;
    }
    
    const state = registrationStates.get(userId);
    if (!state || state.step !== 'waiting_contact') return;
    
    // Save contact and ask for name
    const userLang = normalizeBotLanguage(state.lang || languagePreferences.get(userId) || 'ru');
    state.phone = normalizePhone(contact.phone_number);
    state.step = 'waiting_name';
    state.lang = userLang;
    registrationStates.set(userId, state);
    
    bot.sendMessage(chatId, 
      t(userLang, 'thanksName'),
      {
        reply_markup: { remove_keyboard: true }
      }
    );
  });

  // =====================================================
  // Handle photo messages (onboarding logo upload)
  // =====================================================
  bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const onboardingKey = getOnboardingStateKey(userId);
    const onboardingState = onboardingStates.get(onboardingKey);
    if (!onboardingState || onboardingState.step !== 'await_logo_url') {
      return;
    }

    try {
      const photos = Array.isArray(msg.photo) ? msg.photo : [];
      const bestPhoto = photos[photos.length - 1];
      if (!bestPhoto?.file_id) {
        await bot.sendMessage(chatId, onboardingT(getOnboardingLanguage(userId), 'photoReadError'));
        return;
      }

      const logoPath = await saveTelegramPhotoAsUpload(bestPhoto.file_id);
      onboardingState.logo_url = logoPath;
      onboardingStates.set(onboardingKey, onboardingState);

      await bot.sendMessage(chatId, onboardingT(getOnboardingLanguage(userId), 'logoSaved'));
      await showOptionalStep(chatId, userId, 'bot_token');
    } catch (error) {
      console.error('Onboarding logo photo save error:', error);
      await bot.sendMessage(chatId, onboardingT(getOnboardingLanguage(userId), 'photoSaveError'));
    }
  });

  // =====================================================
  // Handle shared chat (onboarding group link)
  // =====================================================
  bot.on('message', async (msg) => {
    const chatId = msg.chat?.id;
    const userId = msg.from?.id;
    const sharedChatId = msg.chat_shared?.chat_id;
    const forwardedChatId = msg.forward_from_chat?.id;
    const webAppDataRaw = String(msg.web_app_data?.data || '').trim();
    if (!chatId || !userId) {
      return;
    }

    if (webAppDataRaw) {
      try {
        const payload = JSON.parse(webAppDataRaw);
        if (payload?.type === 'store_registration_completed') {
          const payloadLang = normalizeBotLanguage(payload?.lang || languagePreferences.get(userId) || getTelegramPreferredLanguage(msg.from?.language_code));
          await sendStartMenu(chatId, userId, payloadLang);
          return;
        }
      } catch (_) {
        // Ignore unsupported web_app_data payloads.
      }
    }

    const candidateGroupId = sharedChatId ?? forwardedChatId;
    if (!candidateGroupId) {
      return;
    }
    const source = sharedChatId ? 'chat_shared' : 'forward_from_chat';
    await captureOnboardingGroupId(chatId, userId, candidateGroupId, source);
  });
  
  // =====================================================
  // Handle text messages (for name input and menu buttons)
  // =====================================================
  bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    // Skip commands
    if (text.startsWith('/')) return;

    const currentLang = normalizeBotLanguage(languagePreferences.get(userId) || getTelegramPreferredLanguage(msg.from?.language_code));
    const isRegisterMenuText = [t('ru', 'registerStoreButton'), t('uz', 'registerStoreButton')].includes(text);
    const isLanguageMenuText = [t('ru', 'languageMenuButton'), t('uz', 'languageMenuButton')].includes(text);
    const isLoginMenuText = [t('ru', 'loginButton'), t('uz', 'loginButton')].includes(text);
    const isStoreMenuText = [t('ru', 'myStoreButton'), t('uz', 'myStoreButton')].includes(text);
    const isResetMenuText = [t('ru', 'resetButton'), t('uz', 'resetButton')].includes(text);
    const isHelpMenuText = [t('ru', 'helpMenuButton'), t('uz', 'helpMenuButton')].includes(text);

    if (isLanguageMenuText) {
      onboardingStates.delete(getOnboardingStateKey(userId));
      await clearOnboardingUiMessages(chatId, userId);
      await sendLanguagePicker(chatId, userId, 'start', currentLang);
      return;
    }

    if (isRegisterMenuText) {
      const registrationWebAppUrl = buildStoreRegistrationWebAppUrl(userId, currentLang);
      if (registrationWebAppUrl) {
        await bot.sendMessage(chatId, t(currentLang, 'registrationWebAppHint'), {
          reply_markup: {
            inline_keyboard: [[{
              text: t(currentLang, 'registerStoreButton'),
              web_app: { url: registrationWebAppUrl }
            }]]
          }
        });
        return;
      }
      // Legacy onboarding flow intentionally hidden from primary menu.
      // await startOnboarding(chatId, userId);
      return;
    }

    if (isLoginMenuText) {
      await sendStartMenu(chatId, userId, currentLang);
      return;
    }

    if (isStoreMenuText) {
      const user = await resolvePreferredSuperadminAccessUser(userId);
      if (!user) {
        await sendStartMenu(chatId, userId, currentLang);
        return;
      }

      const storeUrl = await buildOperatorStoreWebAppUrl(user);
      if (!storeUrl) {
        await bot.sendMessage(chatId, t(currentLang, 'myStoreMissing'));
        return;
      }

      await bot.sendMessage(chatId, t(currentLang, 'myStoreOpenHint'), {
        reply_markup: {
          inline_keyboard: [[{ text: t(currentLang, 'myStoreButton'), url: storeUrl }]]
        }
      });
      return;
    }

    if (isResetMenuText) {
      try {
        await resetAccessByTelegram(chatId, userId);
      } catch (error) {
        console.error('Reset access error from menu button:', error);
        await bot.sendMessage(chatId, t(currentLang, 'genericError'));
      }
      return;
    }

    if (isHelpMenuText) {
      await sendSuperadminHelpInfo(chatId, currentLang);
      return;
    }

    const onboardingKey = getOnboardingStateKey(userId);
    const onboardingState = onboardingStates.get(onboardingKey);
    if (onboardingState) {
      if (onboardingState.step === 'await_has_bot_choice') {
        const userLang = getOnboardingLanguage(userId);
        const normalizedText = String(text || '').trim().toLowerCase();
        const yesVariants = [onboardingT(userLang, 'hasOwnBotYes').toLowerCase(), 'да', 'ha', 'yes'];
        const noVariants = [onboardingT(userLang, 'hasOwnBotNo').toLowerCase(), 'нет', 'yo‘q', "yo'q", 'no'];
        if (yesVariants.includes(normalizedText)) {
          onboardingState.step = 'await_bot_token';
          onboardingStates.set(onboardingKey, onboardingState);
          await askOnboardingField(chatId, userId, 'bot_token');
          return;
        }
        if (noVariants.includes(normalizedText)) {
          onboardingState.step = 'await_no_bot_guidance';
          onboardingStates.set(onboardingKey, onboardingState);
          await sendOnboardingUiMessage(
            chatId,
            userId,
            onboardingT(userLang, 'botFatherGuide'),
            {
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: {
                inline_keyboard: [
                  [{ text: onboardingT(userLang, 'registerBotButton'), url: BOTFATHER_URL }],
                  [{ text: onboardingT(userLang, 'instructionButton'), callback_data: 'onboard_instruction_bot_registration' }],
                  [{ text: onboardingT(userLang, 'iGotToken'), callback_data: 'onboard_no_bot_ready_token' }],
                  [{ text: onboardingT(userLang, 'cancel'), callback_data: 'onboard_cancel' }]
                ]
              }
            }
          );
          return;
        }
      }

      if (onboardingState.step === 'await_no_bot_guidance') {
        const userLang = getOnboardingLanguage(userId);
        if (String(text || '').trim() === onboardingT(userLang, 'instructionButton')) {
          await sendOnboardingInstruction(chatId, userId, ONBOARDING_INSTRUCTION_CODES.bot_registration);
          return;
        }
        return;
      }

      if (onboardingState.step === 'await_store_name') {
        const userLang = getOnboardingLanguage(userId);
        const storeName = text.trim();
        if (!storeName) {
          await bot.sendMessage(chatId, onboardingT(userLang, 'requiredStoreName'));
          return;
        }
        onboardingState.store_name = storeName;
        onboardingState.step = 'await_activity_type';
        onboardingStates.set(onboardingKey, onboardingState);
        await askOnboardingField(chatId, userId, 'activity_type');
        return;
      }

      if (onboardingState.step === 'await_activity_type') {
        const userLang = getOnboardingLanguage(userId);
        const rawChoice = String(text || '').trim();
        const choiceNumber = parseInt(rawChoice, 10);
        const activityTypes = await getVisibleActivityTypes();

        if (!activityTypes.length) {
          await bot.sendMessage(chatId, onboardingT(userLang, 'requiredActivityType'));
          return;
        }

        if (!Number.isFinite(choiceNumber) || choiceNumber < 1 || choiceNumber > activityTypes.length) {
          await bot.sendMessage(chatId, onboardingT(userLang, 'invalidActivityTypeChoice'));
          return;
        }

        const selectedActivityType = activityTypes[choiceNumber - 1];
        onboardingState.activity_type_id = selectedActivityType.id;
        onboardingState.activity_type_name = selectedActivityType.name;
        onboardingState.step = 'await_full_name';
        onboardingStates.set(onboardingKey, onboardingState);
        await askOnboardingField(chatId, userId, 'full_name');
        return;
      }

      if (onboardingState.step === 'await_full_name') {
        const userLang = getOnboardingLanguage(userId);
        const fullName = text.trim();
        if (!fullName) {
          await bot.sendMessage(chatId, onboardingT(userLang, 'requiredFullName'));
          return;
        }
        onboardingState.full_name = fullName;
        onboardingState.step = 'await_phone';
        onboardingStates.set(onboardingKey, onboardingState);
        await askOnboardingField(chatId, userId, 'phone');
        return;
      }

      if (onboardingState.step === 'await_phone') {
        const userLang = getOnboardingLanguage(userId);
        const normalized = normalizePhone(text);
        if (!normalized || normalized.length < 7) {
          await bot.sendMessage(chatId, onboardingT(userLang, 'invalidPhone'));
          return;
        }
        onboardingState.phone = normalized;
        onboardingState.step = 'await_location';
        onboardingStates.set(onboardingKey, onboardingState);
        await askOnboardingField(chatId, userId, 'location');
        return;
      }

      if (onboardingState.step === 'await_logo_url') {
        onboardingState.logo_url = text.trim();
        onboardingStates.set(onboardingKey, onboardingState);
        await showOptionalStep(chatId, userId, 'bot_token');
        return;
      }

      if (onboardingState.step === 'await_bot_token') {
        onboardingState.bot_token = text.trim();
        onboardingStates.set(onboardingKey, onboardingState);
        await showOptionalStep(chatId, userId, 'group_id');
        return;
      }

      if (onboardingState.step === 'await_group_share') {
        const userLang = getOnboardingLanguage(userId);
        const normalizedText = text.trim();
        if (normalizedText === onboardingT(userLang, 'instructionButton')) {
          await sendOnboardingInstruction(chatId, userId, ONBOARDING_INSTRUCTION_CODES.group);
          return;
        }
        const manualGroupId = parseTelegramGroupId(normalizedText);

        if (manualGroupId) {
          await captureOnboardingGroupId(chatId, userId, manualGroupId, 'manual_text');
          return;
        }

        const skipVariants = [
          onboardingT(userLang, 'skip'),
          onboardingT('ru', 'skip'),
          onboardingT('uz', 'skip')
        ];
        if (skipVariants.includes(normalizedText)) {
          onboardingState.group_id = null;
          onboardingStates.set(onboardingKey, onboardingState);
          await bot.sendMessage(chatId, onboardingT(userLang, 'skipGroupDone'), {
            reply_markup: { remove_keyboard: true }
          });
          await finalizeOnboarding(chatId, userId);
          return;
        }

        const cancelVariants = [
          onboardingT(userLang, 'cancel'),
          onboardingT('ru', 'cancel'),
          onboardingT('uz', 'cancel')
        ];
        if (cancelVariants.includes(normalizedText)) {
          onboardingStates.delete(onboardingKey);
          await clearOnboardingUiMessages(chatId, userId);
          await bot.sendMessage(chatId, onboardingT(userLang, 'cancelled'), {
            reply_markup: { remove_keyboard: true }
          });
          return;
        }

        await bot.sendMessage(
          chatId,
          onboardingT(userLang, 'useGroupOrSkipHint')
        );
        return;
      }
    }
    
    // Handle menu buttons
    if ([t('ru', 'myOrdersButton'), t('uz', 'myOrdersButton')].includes(text)) {
      const userLang = normalizeBotLanguage(languagePreferences.get(userId) || getTelegramPreferredLanguage(msg.from?.language_code));
      // Trigger /orders command
      const userResult = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [userId]);
      if (userResult.rows.length === 0) {
        bot.sendMessage(chatId, t(userLang, 'notRegisteredStart'));
        return;
      }
      
      const ordersResult = await pool.query(`
        SELECT o.order_number, o.status, o.total_amount, o.created_at
        FROM orders o WHERE o.user_id = $1
        ORDER BY o.created_at DESC LIMIT 5
      `, [userResult.rows[0].id]);
      
      if (ordersResult.rows.length === 0) {
        bot.sendMessage(chatId, t(userLang, 'noOrdersYet'));
        return;
      }
      
      let message = t(userLang, 'ordersTitle');
      const statusEmoji = { 'new': '🆕', 'preparing': '👨‍🍳', 'delivering': '🚚', 'delivered': '✅', 'cancelled': '❌' };
      
      ordersResult.rows.forEach((order) => {
        message += `${statusEmoji[order.status] || '📦'} #${order.order_number} — ${parseFloat(order.total_amount).toLocaleString()} сум\n`;
      });
      
      bot.sendMessage(chatId, message, {
        parse_mode: 'HTML'
      });
      return;
    }
    
    if (['❓ Помощь', '❓ Yordam'].includes(text)) {
      const userLang = normalizeBotLanguage(languagePreferences.get(userId) || getTelegramPreferredLanguage(msg.from?.language_code));
      bot.sendMessage(chatId,
        t(userLang, 'quickHelpText'),
        { parse_mode: 'HTML' }
      );
      return;
    }
    
    const state = registrationStates.get(userId);
    if (!state) return;
    
    if (state.step === 'waiting_name') {
      // Save name and ask for location
      const userLang = normalizeBotLanguage(state.lang || languagePreferences.get(userId) || 'ru');
      state.name = text;
      state.step = 'waiting_location';
      state.lang = userLang;
      registrationStates.set(userId, state);
      
      bot.sendMessage(chatId,
        t(userLang, 'niceToMeet', { name: text }),
        {
          reply_markup: {
            keyboard: [[
              { text: t(userLang, 'shareLocation'), request_location: true }
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
    const userLang = normalizeBotLanguage(
      languagePreferences.get(userId)
      || getTelegramPreferredLanguage(msg.from?.language_code)
    );

    const onboardingKey = getOnboardingStateKey(userId);
    const onboardingState = onboardingStates.get(onboardingKey);
    if (onboardingState && onboardingState.step === 'await_location') {
      onboardingState.location = {
        latitude: location.latitude,
        longitude: location.longitude
      };
      onboardingStates.set(onboardingKey, onboardingState);
      await bot.sendMessage(chatId,
        onboardingT(getOnboardingLanguage(userId), 'requiredFieldsComplete'),
        { reply_markup: { remove_keyboard: true } }
      );
      await showOptionalStep(chatId, userId, 'logo_url');
      return;
    }
    
    let state = registrationStates.get(userId);
    
    // If no state but user exists, treat as order location
    if (!state) {
      const userCheck = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [userId]);
      if (userCheck.rows.length > 0) {
        // Existing user sending location - treat as new order
        state = { step: 'waiting_location_for_order', isExistingUser: true };
        registrationStates.set(userId, state);
        console.log(`📍 Auto-set state for existing user ${userId}`);
      } else {
        // Unknown user - tell them to /start
        bot.sendMessage(chatId, t(userLang, 'notRegisteredStartRegistration'));
        return;
      }
    }
    
    if (state.step !== 'waiting_location' && state.step !== 'waiting_location_for_order') {
      // Wrong state - reset and treat as order
      state = { step: 'waiting_location_for_order', isExistingUser: true };
      registrationStates.set(userId, state);
    }
    
    try {
      // Check if location is in any delivery zone
      const restaurant = await findRestaurantByLocation(location.latitude, location.longitude);
      
      if (restaurant) {
        // Check working hours
        const startTime = restaurant.start_time ? restaurant.start_time.substring(0, 5) : null;
        const endTime = restaurant.end_time ? restaurant.end_time.substring(0, 5) : null;
        const isOpenNow = isRestaurantOpen(startTime, endTime);
        
        if (!isOpenNow && state.isExistingUser) {
          bot.sendMessage(chatId,
            t(userLang, 'storeClosedNow', {
              start: startTime || '??:??',
              end: endTime || '??:??'
            }),
            { reply_markup: { remove_keyboard: true } }
          );
          registrationStates.delete(userId);
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
          
          if (userResult.rows.length === 0) {
            registrationStates.delete(userId);
            bot.sendMessage(chatId, t(userLang, 'profileNotFoundStart'));
            return;
          }

          const user = userResult.rows[0];
          
          // Save location to database
          await pool.query(`
            UPDATE users 
            SET last_latitude = $1, last_longitude = $2, active_restaurant_id = $3
            WHERE id = $4
          `, [location.latitude, location.longitude, restaurant.id, user.id]);
          
          let loginUrl = null;
          try {
            const token = generateLoginToken(user.id, user.username, { restaurantId: restaurant.id });
            loginUrl = buildCatalogUrl(appUrl, token);
          } catch (tokenError) {
            console.error('Login token error:', tokenError);
          }
          
          // Clear state
          registrationStates.delete(userId);
          
          if (!loginUrl) {
            bot.sendMessage(chatId,
              `${t(userLang, 'deliveryAvailable', { store: restaurant.name })}\n\n${t(userLang, 'deliveryLinkIssue')}`,
              { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
            );
            return;
          }
          
          bot.sendMessage(chatId,
            t(userLang, 'deliveryAvailable', { store: restaurant.name }),
            {
              parse_mode: 'HTML',
              reply_markup: {
                keyboard: [[
                  { text: t(userLang, 'openStoreButton'), web_app: { url: loginUrl } },
                  { text: t(userLang, 'myOrdersButton') }
                ]],
                resize_keyboard: true,
                is_persistent: true
              }
            }
          );
          return;
        }
        
        // New user registration - complete registration
        // Login should be phone number
        const username = await resolveUniqueCustomerUsername(normalizePhone(state.phone) || `user_${userId}`, userId);
        const password = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Save user with location and get ID
        const preferredLang = normalizeBotLanguage(state.lang || languagePreferences.get(userId) || 'ru');
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
            username = CASE WHEN $2 <> '' THEN $2 ELSE users.username END
          RETURNING id
        `, [userId, username, hashedPassword, state.name, state.phone, location.latitude, location.longitude, restaurant.id, preferredLang]);
        
        const newUserId = userResult.rows[0].id;
        
        // Clear registration state
        registrationStates.delete(userId);
        
        // Generate auto-login token
        const token = generateLoginToken(newUserId, username, { restaurantId: restaurant.id });
        const loginUrl = buildCatalogUrl(appUrl, token);
        const closedNote = !isOpenNow
          ? t(userLang, 'storeClosedOrderHint', {
            start: startTime || '??:??',
            end: endTime || '??:??'
          })
          : '';
        
        bot.sendMessage(chatId,
          t(userLang, 'registrationSuccess', {
            store: restaurant.name,
            closedNote
          }),
          {
            parse_mode: 'HTML',
            reply_markup: {
              keyboard: [[
                { text: t(userLang, 'openStoreButton'), web_app: { url: loginUrl } },
                { text: t(userLang, 'myOrdersButton') }
              ]],
              resize_keyboard: true,
              is_persistent: true
            }
          }
        );
      } else {
        // Location is NOT in any delivery zone
        bot.sendMessage(chatId,
          t(userLang, 'deliveryUnavailable'),
          {
            reply_markup: {
              keyboard: [[
                { text: t(userLang, 'sendAnotherLocationButton'), request_location: true }
              ]],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          }
        );
      }
    } catch (error) {
      console.error('Location handling error:', error);
      bot.sendMessage(chatId, t(userLang, 'genericError'));
    }
  });
  
  // =====================================================
  // /help command
  // =====================================================
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const lang = normalizeBotLanguage(languagePreferences.get(userId) || getTelegramPreferredLanguage(msg.from?.language_code));
    await sendSuperadminHelpInfo(chatId, lang);
  });
  
  // =====================================================
  // /menu command - same as /start for registered users
  // =====================================================
  bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUserId = msg.from.id;
    const userLang = normalizeBotLanguage(languagePreferences.get(telegramUserId) || getTelegramPreferredLanguage(msg.from?.language_code));
    
    try {
      const userResult = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [telegramUserId]
      );
      
      if (userResult.rows.length === 0) {
        bot.sendMessage(chatId, t(userLang, 'notRegisteredUseStart'));
        return;
      }
      
      // Always ask for location first
      registrationStates.set(telegramUserId, { 
        step: 'waiting_location_for_order',
        isExistingUser: true 
      });
      
      bot.sendMessage(chatId,
        t(userLang, 'menuAddressPrompt'),
        {
          reply_markup: {
            keyboard: [[
              { text: t(userLang, 'sendGeoButton'), request_location: true }
            ]],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );
    } catch (error) {
      console.error('Menu command error:', error);
      bot.sendMessage(chatId, t(userLang, 'genericError'));
    }
  });
  
  // =====================================================
  // /orders command
  // =====================================================
  bot.onText(/\/orders/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userLang = normalizeBotLanguage(languagePreferences.get(userId) || getTelegramPreferredLanguage(msg.from?.language_code));
    
    try {
      const userResult = await pool.query(
        'SELECT id FROM users WHERE telegram_id = $1',
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        bot.sendMessage(chatId, t(userLang, 'notRegisteredUseStart'));
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
        bot.sendMessage(chatId, t(userLang, 'noOrdersYet'));
        return;
      }
      
      let message = t(userLang, 'ordersLatestTitle');
      
      ordersResult.rows.forEach((order) => {
        const statusEmoji = {
          'new': '🆕',
          'preparing': '👨‍🍳',
          'delivering': '🚚',
          'delivered': '✅',
          'cancelled': '❌'
        };
        
        message += `${statusEmoji[order.status] || '📦'} <b>${t(userLang, 'orderTitle')} #${order.order_number}</b>\n`;
        if (order.restaurant_name) message += `🏪 ${order.restaurant_name}\n`;
        message += `💰 ${order.total_amount} сум\n`;
        message += `📅 ${new Date(order.created_at).toLocaleDateString('ru-RU', { timeZone: BOT_TIME_ZONE })}\n`;
        message += `${t(userLang, 'orderStatusLabel')}: ${getStatusText(order.status, userLang)}\n\n`;
      });
      
      bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('Orders command error:', error);
      bot.sendMessage(chatId, t(userLang, 'ordersFetchError'));
    }
  });
  
  // =====================================================
  // Callback query handler (inline buttons)
  // =====================================================
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    const callbackLang = normalizeBotLanguage(
      languagePreferences.get(userId)
      || getTelegramPreferredLanguage(callbackQuery?.from?.language_code)
    );
    const operatorName = callbackQuery.from.first_name || 'Оператор';
    
    // Answer callback to remove loading state
    bot.answerCallbackQuery(callbackQuery.id);

    if (data.startsWith('set_lang_')) {
      const selectedLang = normalizeBotLanguage(data.replace('set_lang_', ''));
      await saveUserLanguage(userId, selectedLang);
      const pendingAction = pendingLanguageActions.get(userId);
      pendingLanguageActions.delete(userId);
      await tryDeleteBotMessage(chatId, messageId);

      if (pendingAction === 'start') {
        await sendStartMenu(chatId, userId, selectedLang);
      } else {
        await bot.sendMessage(chatId, t(selectedLang, 'languageSaved'));
      }
      return;
    }

    // =====================================================
    // Central onboarding flow
    // =====================================================
    if (data === 'legacy_customer_start') {
      const userLang = normalizeBotLanguage(languagePreferences.get(userId) || 'ru');
      await bot.sendMessage(
        chatId,
        userLang === 'uz'
          ? 'ℹ️ Ushbu botda mijoz ro‘yxatdan o‘tishi o‘chirilgan. Do‘kon Telegram-botidan foydalaning.'
          : 'ℹ️ Клиентская регистрация в этом боте отключена. Используйте Telegram-бот магазина.'
      );
      return;
    }

    if (data === 'onboard_start') {
      await startOnboarding(chatId, userId);
      return;
    }

    if (data === 'onboard_cancel') {
      const userLang = getOnboardingLanguage(userId);
      onboardingStates.delete(getOnboardingStateKey(userId));
      await clearOnboardingUiMessages(chatId, userId, [messageId]);
      await bot.sendMessage(chatId, onboardingT(userLang, 'cancelled'), { reply_markup: { remove_keyboard: true } });
      return;
    }

    if (data === 'onboard_begin_required') {
      const stateKey = getOnboardingStateKey(userId);
      const state = onboardingStates.get(stateKey) || {};
      state.step = 'await_store_name';
      state.lang = normalizeBotLanguage(state.lang || languagePreferences.get(userId) || 'ru');
      onboardingStates.set(stateKey, state);
      await askOnboardingField(chatId, userId, 'store_name');
      return;
    }

    if (data.startsWith('onboard_instruction_')) {
      const instructionKey = data.replace('onboard_instruction_', '').trim();
      if (!instructionKey) return;
      let instructionCode = null;
      if (instructionKey === 'store_registration') instructionCode = ONBOARDING_INSTRUCTION_CODES.store_registration;
      if (instructionKey === 'logo') instructionCode = ONBOARDING_INSTRUCTION_CODES.logo;
      if (instructionKey === 'token') instructionCode = ONBOARDING_INSTRUCTION_CODES.token;
      if (instructionKey === 'bot_registration') instructionCode = ONBOARDING_INSTRUCTION_CODES.bot_registration;
      if (instructionKey === 'group') instructionCode = ONBOARDING_INSTRUCTION_CODES.group;
      if (!instructionCode) return;
      await sendOnboardingInstruction(chatId, userId, instructionCode);
      return;
    }

    if (data === 'onboard_add_logo') {
      const stateKey = getOnboardingStateKey(userId);
      const state = onboardingStates.get(stateKey);
      if (!state) return;
      state.step = 'await_logo_url';
      onboardingStates.set(stateKey, state);
      await askOnboardingField(chatId, userId, 'logo_url');
      return;
    }

    if (data === 'onboard_skip_logo') {
      await showOptionalStep(chatId, userId, 'bot_token');
      return;
    }

    if (data === 'onboard_has_bot_yes') {
      const stateKey = getOnboardingStateKey(userId);
      const state = onboardingStates.get(stateKey);
      if (!state) return;
      state.step = 'await_bot_token';
      onboardingStates.set(stateKey, state);
      await askOnboardingField(chatId, userId, 'bot_token');
      return;
    }

    if (data === 'onboard_has_bot_no') {
      const stateKey = getOnboardingStateKey(userId);
      const state = onboardingStates.get(stateKey);
      if (!state) return;
      const userLang = getOnboardingLanguage(userId);
      state.step = 'await_no_bot_guidance';
      onboardingStates.set(stateKey, state);
      await sendOnboardingUiMessage(
        chatId,
        userId,
        onboardingT(userLang, 'botFatherGuide'),
        {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: onboardingT(userLang, 'registerBotButton'), url: BOTFATHER_URL }],
              [{ text: onboardingT(userLang, 'instructionButton'), callback_data: 'onboard_instruction_bot_registration' }],
              [{ text: onboardingT(userLang, 'iGotToken'), callback_data: 'onboard_no_bot_ready_token' }],
              [{ text: onboardingT(userLang, 'cancel'), callback_data: 'onboard_cancel' }]
            ]
          }
        }
      );
      return;
    }

    if (data === 'onboard_no_bot_ready_token') {
      const stateKey = getOnboardingStateKey(userId);
      const state = onboardingStates.get(stateKey);
      if (!state) return;
      state.step = 'await_bot_token';
      onboardingStates.set(stateKey, state);
      await askOnboardingField(chatId, userId, 'bot_token');
      return;
    }

    if (data === 'onboard_add_token') {
      const stateKey = getOnboardingStateKey(userId);
      const state = onboardingStates.get(stateKey);
      if (!state) return;
      state.step = 'await_bot_token';
      onboardingStates.set(stateKey, state);
      await askOnboardingField(chatId, userId, 'bot_token');
      return;
    }

    if (data === 'onboard_skip_token') {
      await showOptionalStep(chatId, userId, 'bot_token');
      return;
    }

    if (data === 'onboard_add_group') {
      const stateKey = getOnboardingStateKey(userId);
      const state = onboardingStates.get(stateKey);
      if (!state) return;
      state.step = 'await_group_share';
      onboardingStates.set(stateKey, state);
      await askOnboardingField(chatId, userId, 'group_id');
      return;
    }

    if (data === 'onboard_skip_group') {
      await finalizeOnboarding(chatId, userId);
      return;
    }

    if (data === 'reset_password') {
      await resetAccessByTelegram(chatId, userId);
      return;
    }
    
    if (data === 'new_order') {
      const userLang = normalizeBotLanguage(languagePreferences.get(userId) || 'ru');
      // Start new order flow - ask for location
      registrationStates.set(userId, { 
        step: 'waiting_location_for_order',
        isExistingUser: true 
      });
      
      // Send message with location request keyboard
      await bot.sendMessage(chatId,
        t(userLang, 'sendGeoForDeliveryPrompt'),
        {
          parse_mode: 'HTML',
          reply_markup: {
            keyboard: [
              [{
                text: t(userLang, 'sendGeoButton'),
                request_location: true
              }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );
      return;
    }
    
    // My orders inline button
    if (data === 'my_orders') {
      const userLang = normalizeBotLanguage(languagePreferences.get(userId) || getTelegramPreferredLanguage(callbackQuery?.from?.language_code));
      const userResult = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [userId]);
      
      if (userResult.rows.length === 0) {
        bot.sendMessage(chatId, t(userLang, 'notRegisteredStart'));
        return;
      }
      
      const ordersResult = await pool.query(`
        SELECT o.order_number, o.status, o.total_amount, o.created_at
        FROM orders o WHERE o.user_id = $1
        ORDER BY o.created_at DESC LIMIT 5
      `, [userResult.rows[0].id]);
      
      if (ordersResult.rows.length === 0) {
        bot.sendMessage(chatId, t(userLang, 'noOrdersYet'));
        return;
      }
      
      let message = t(userLang, 'ordersTitle');
      const statusEmoji = { 'new': '🆕', 'preparing': '👨‍🍳', 'delivering': '🚚', 'delivered': '✅', 'cancelled': '❌' };
      
      ordersResult.rows.forEach((order) => {
        message += `${statusEmoji[order.status] || '📦'} #${order.order_number} — ${parseFloat(order.total_amount).toLocaleString()} сум\n`;
      });
      
      bot.sendMessage(chatId, message, {
        parse_mode: 'HTML'
      });
      return;
    }
    
    // Confirm order
    else if (data.startsWith('confirm_order_')) {
      const orderId = data.replace('confirm_order_', '');
      console.log(`📋 Confirm order ${orderId} by ${operatorName}`);
      
      try {
        // Check if this order belongs to a restaurant with its own bot token
        // If so, skip processing here (multi-bot system will handle it)
        let orderCheck;
        try {
          orderCheck = await pool.query(`
            SELECT o.status, r.telegram_bot_token, r.telegram_group_id, r.send_balance_after_confirm
            FROM orders o 
            LEFT JOIN restaurants r ON o.restaurant_id = r.id 
            WHERE o.id = $1
          `, [orderId]);
        } catch (error) {
          if (error.code !== '42703') throw error;
          orderCheck = await pool.query(`
            SELECT o.status, r.telegram_bot_token, r.telegram_group_id, false AS send_balance_after_confirm
            FROM orders o 
            LEFT JOIN restaurants r ON o.restaurant_id = r.id 
            WHERE o.id = $1
          `, [orderId]);
        }
        
        if (orderCheck.rows.length === 0) {
          bot.answerCallbackQuery(callbackQuery.id, { text: t(callbackLang, 'orderNotFound'), show_alert: true });
          return;
        }
        
        const orderData = orderCheck.rows[0];
        
        // If restaurant has its own bot token (different from env), skip - multi-bot handles it
        if (orderData.telegram_bot_token && orderData.telegram_bot_token !== activeSuperadminBotToken) {
          console.log(`⏭️ Skipping confirm for order ${orderId} - handled by multi-bot system`);
          return;
        }
        
        if (orderData.status !== 'new') {
          bot.answerCallbackQuery(callbackQuery.id, { text: t(callbackLang, 'orderAlreadyProcessed'), show_alert: true });
          return;
        }

        const billingResult = await ensureOrderPaidForProcessing({ orderId });
        if (!billingResult.ok) {
          const text = billingResult.code === 'INSUFFICIENT_BALANCE'
            ? t(callbackLang, 'insufficientBalanceAlert', {
              balance: formatMoney(billingResult.balanceBefore),
              required: formatMoney(billingResult.requiredAmount)
            })
            : (billingResult.error || t(callbackLang, 'orderAcceptFailed'));
          bot.answerCallbackQuery(callbackQuery.id, { text, show_alert: true });
          return;
        }

        if (billingResult.lowBalanceCrossed && billingResult.restaurantId) {
          try {
            const { notifyRestaurantAdminsLowBalance } = require('./notifications');
            await notifyRestaurantAdminsLowBalance(billingResult.restaurantId, billingResult.remainingBalance, {
              threshold: billingResult.lowBalanceThreshold
            });
          } catch (e) {
            console.error('Low balance notify error (superadmin bot confirm):', e.message);
          }
        }
        if (orderData.send_balance_after_confirm && orderData.telegram_group_id) {
          try {
            const { sendRestaurantGroupBalanceLeft } = require('./notifications');
            await sendRestaurantGroupBalanceLeft({
              restaurantId: billingResult.restaurantId,
              botToken: orderData.telegram_bot_token,
              groupId: orderData.telegram_group_id,
              currentBalance: billingResult.remainingBalance,
              language: 'ru'
            });
          } catch (e) {
            console.error('Send group balance-left warning (legacy bot confirm):', e.message);
          }
        }
        
        // Update order status in database
        await pool.query(
          `UPDATE orders SET status = 'preparing', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [orderId]
        );
        
        // Add to status history
        let actorUserId = null;
        try {
          const actorResult = await pool.query(
            'SELECT id FROM users WHERE telegram_id = $1 ORDER BY id ASC LIMIT 1',
            [String(callbackQuery?.from?.id || '')]
          );
          actorUserId = actorResult.rows[0]?.id || null;
        } catch (_) { }
        await pool.query(
          'INSERT INTO order_status_history (order_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
          [orderId, 'accepted', actorUserId, `Принято в Telegram-группе: ${operatorName}`]
        );
        
        // Get order details for notification with restaurant bot token
        const orderResult = await pool.query(
          `SELECT o.*, u.telegram_id, r.telegram_bot_token 
           FROM orders o 
           LEFT JOIN users u ON o.user_id = u.id 
           LEFT JOIN restaurants r ON o.restaurant_id = r.id
           WHERE o.id = $1`,
          [orderId]
        );
        
        if (orderResult.rows.length > 0) {
          const order = orderResult.rows[0];
          
          // Notify customer using restaurant's bot
          if (order.telegram_id) {
            const { sendOrderUpdateToUser } = require('./notifications');
            await sendOrderUpdateToUser(order.telegram_id, order, 'preparing', order.telegram_bot_token);
          }
          
          try {
            const { updateOrderGroupNotification } = require('./notifications');
            await updateOrderGroupNotification(
              {
                ...order,
                admin_chat_id: chatId,
                admin_message_id: messageId
              },
              [],
              {
                status: 'preparing',
                operatorName,
                chatId,
                messageId,
                botToken: order.telegram_bot_token
              }
            );
          } catch (editError) {
            console.error('Confirm order message update error:', editError);
          }
        }
        
        bot.answerCallbackQuery(callbackQuery.id, { text: t(callbackLang, 'orderConfirmed') });
      } catch (error) {
        console.error('Confirm order error:', error);
        bot.answerCallbackQuery(callbackQuery.id, { text: t(callbackLang, 'callbackErrorPrefix') + error.message, show_alert: true });
      }
    }
    
    // Reject order - ask for reason
    else if (data.startsWith('reject_order_')) {
      const orderId = data.replace('reject_order_', '');
      
      // Check if this order belongs to a restaurant with its own bot token
      const orderCheck = await pool.query(`
        SELECT r.telegram_bot_token 
        FROM orders o 
        LEFT JOIN restaurants r ON o.restaurant_id = r.id 
        WHERE o.id = $1
      `, [orderId]);
      
      // If restaurant has its own bot token (different from env), skip - multi-bot handles it
      if (orderCheck.rows.length > 0 && 
          orderCheck.rows[0].telegram_bot_token && 
          orderCheck.rows[0].telegram_bot_token !== activeSuperadminBotToken) {
        console.log(`⏭️ Skipping reject for order ${orderId} - handled by multi-bot system`);
        return;
      }
      
      // Store state to wait for rejection reason
      registrationStates.set(`reject_${chatId}_${messageId}`, {
        step: 'waiting_reject_reason',
        orderId: orderId,
        operatorName: operatorName,
        operatorTelegramId: callbackQuery?.from?.id || null,
        originalMessageId: messageId
      });
      
      bot.sendMessage(chatId,
        t(callbackLang, 'rejectOrderPrompt', { orderId }),
        {
          parse_mode: 'HTML',
          reply_markup: {
            force_reply: true,
            selective: true
          }
        }
      );
    }
  });
  
  // =====================================================
  // Handle rejection reason (reply)
  // =====================================================
  bot.on('message', async (msg) => {
    if (!msg.reply_to_message) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const text = msg.text;
    const userLang = normalizeBotLanguage(
      languagePreferences.get(userId)
      || getTelegramPreferredLanguage(msg.from?.language_code)
    );
    
    // Find rejection state
    for (const [key, state] of registrationStates.entries()) {
      if (key.startsWith(`reject_${chatId}_`) && state.step === 'waiting_reject_reason') {
        const { orderId, operatorName, operatorTelegramId, originalMessageId } = state;
        
        try {
          // Update order status
          await pool.query(
            `UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [orderId]
          );
          
          // Add to status history with reason
          let actorUserId = null;
          try {
            const actorResult = await pool.query(
              'SELECT id FROM users WHERE telegram_id = $1 ORDER BY id ASC LIMIT 1',
              [String(operatorTelegramId || '')]
            );
            actorUserId = actorResult.rows[0]?.id || null;
          } catch (_) { }
          await pool.query(
            'INSERT INTO order_status_history (order_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
            [orderId, 'cancelled', actorUserId, `Отказано: ${text} (${operatorName})`]
          );
          
          // Get order details with restaurant bot token
          const orderResult = await pool.query(
            `SELECT o.*, u.telegram_id, r.telegram_bot_token 
             FROM orders o 
             LEFT JOIN users u ON o.user_id = u.id 
             LEFT JOIN restaurants r ON o.restaurant_id = r.id
             WHERE o.id = $1`,
            [orderId]
          );
          
          if (orderResult.rows.length > 0) {
            const order = orderResult.rows[0];
            
            // Notify customer with reason using restaurant's bot
            if (order.telegram_id) {
              const { getRestaurantBot } = require('./notifications');
              const customerBot = order.telegram_bot_token 
                ? getRestaurantBot(order.telegram_bot_token) 
                : getDefaultBot();
              if (customerBot) {
                customerBot.sendMessage(order.telegram_id,
                  `❌ <b>Заказ #${order.order_number} отменен</b>\n\n` +
                  `Причина: ${text}\n\n` +
                  `Приносим извинения за неудобства.`,
                  {
                    parse_mode: 'HTML'
                  }
                );
              }
            }

            try {
              const { updateOrderGroupNotification } = require('./notifications');
              await updateOrderGroupNotification(
                {
                  ...order,
                  admin_chat_id: chatId,
                  admin_message_id: originalMessageId
                },
                [],
                {
                  status: 'cancelled',
                  operatorName,
                  cancelReason: text,
                  chatId,
                  messageId: originalMessageId,
                  botToken: order.telegram_bot_token
                }
              );
            } catch (editError) {
              console.error('Reject order message update error:', editError);
            }
          }
          
          // Update original message
          bot.sendMessage(chatId,
            t(userLang, 'rejectSummary', {
              orderId,
              reason: text,
              operator: operatorName
            }),
            { parse_mode: 'HTML' }
          );
          
          // Clear state
          registrationStates.delete(key);
        } catch (error) {
          console.error('Reject order error:', error);
          bot.sendMessage(chatId, t(userLang, 'rejectOrderError'));
        }
        
        break;
      }
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

function getStatusText(status, lang = 'ru') {
  const language = normalizeBotLanguage(lang);
  const statusMapByLang = {
    ru: {
      'new': 'Новый',
      'preparing': 'Готовится',
      'delivering': 'Доставляется',
      'delivered': 'Доставлен',
      'cancelled': 'Отменен'
    },
    uz: {
      'new': 'Yangi',
      'preparing': 'Tayyorlanmoqda',
      'delivering': 'Yetkazilmoqda',
      'delivered': 'Yetkazildi',
      'cancelled': 'Bekor qilindi'
    }
  };
  const statusMap = statusMapByLang[language] || statusMapByLang.ru;
  return statusMap[status] || status;
}

function getBot() {
  return bot;
}

function getActiveSuperadminBotToken() {
  return activeSuperadminBotToken;
}

async function stopBot() {
  if (!bot) return;

  try {
    bot.removeAllListeners();
  } catch (e) {
    console.warn('Bot listener cleanup warning:', e.message);
  }

  try {
    await bot.stopPolling();
  } catch (e) {
    // no-op: bot may be in webhook mode
  }

  try {
    await bot.deleteWebHook();
  } catch (e) {
    // no-op
  }

  bot = null;
}

async function reloadBot() {
  await stopBot();
  await initBot();
}

module.exports = { initBot, getBot, reloadBot, getActiveSuperadminBotToken };
