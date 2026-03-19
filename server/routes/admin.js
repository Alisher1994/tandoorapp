const express = require('express');
const pool = require('../database/connection');
const { authenticate, requireOperator, requireRestaurantAccess } = require('../middleware/auth');
const {
  sendOrderUpdateToUser,
  getRestaurantBot,
  updateOrderGroupNotification,
  sendRestaurantGroupBalanceLeft
} = require('../bot/notifications');
const {
  logActivity,
  getIpFromRequest,
  getUserAgentFromRequest,
  ACTION_TYPES,
  ENTITY_TYPES
} = require('../services/activityLogger');
const { reloadMultiBots } = require('../bot/multiBotManager');
const {
  ensureHelpInstructionsSchema,
  listHelpInstructions,
  incrementHelpInstructionViewCount
} = require('../services/helpInstructions');
const { ensureBotFunnelSchema } = require('../services/botFunnel');
const { ensureReservationSchema } = require('../services/reservationSchema');
const { ensureBroadcastSchema } = require('../services/broadcastSchema');
const superadminRoutes = require('./superadmin');

const router = express.Router();
const generateGlobalProductLocalizedText = superadminRoutes.generateGlobalProductLocalizedText;
const normalizeOrderStatus = (status) => status === 'in_progress' ? 'preparing' : status;
const normalizeCategoryName = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const PRODUCT_SEASON_SCOPES = new Set(['all', 'spring', 'summer', 'autumn', 'winter']);
const MAX_PRODUCT_IMAGES = 5;
const MAX_PRODUCT_VARIANT_IMAGES = 4;
const MAX_PRODUCT_SIZE_OPTIONS = 20;
let globalProductsSchemaReady = false;
let globalProductsSchemaPromise = null;
const normalizeProductSeasonScope = (value, fallback = 'all') => {
  const normalized = String(value || '').trim().toLowerCase();
  return PRODUCT_SEASON_SCOPES.has(normalized) ? normalized : fallback;
};
const normalizeContainerNorm = (value, fallback = 1) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};
const normalizeProductPrice = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
};
const normalizeProductOrderStep = (value, unit, fallback = null) => {
  if (String(unit || '').trim() !== 'кг') return null;
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};
const toOptionalTrimmedText = (value) => (
  value === undefined || value === null ? '' : String(value).trim()
);
const normalizeProductLocalizedNames = (nameRuValue, nameUzValue) => {
  const normalizedNameRu = toOptionalTrimmedText(nameRuValue).slice(0, 255);
  const normalizedNameUz = toOptionalTrimmedText(nameUzValue).slice(0, 255);
  if (!normalizedNameRu && !normalizedNameUz) {
    return {
      valid: false,
      nameRu: '',
      nameUz: ''
    };
  }
  const effectiveNameRu = (normalizedNameRu || normalizedNameUz).slice(0, 255);
  const effectiveNameUz = (normalizedNameUz || normalizedNameRu).slice(0, 255);
  return {
    valid: true,
    nameRu: effectiveNameRu,
    nameUz: effectiveNameUz
  };
};
const normalizeProductVariantOptions = (value, { fallbackPrice = null } = {}) => {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      source = source
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  if (!Array.isArray(source)) return [];

  const unique = new Set();
  const normalized = [];
  for (const item of source) {
    let name = '';
    let descriptionRu = '';
    let descriptionUz = '';
    let priceRaw = fallbackPrice;
    let barcode = '';
    let imageUrl = '';
    let thumbUrl = '';
    let variantImages = [];

    if (item && typeof item === 'object' && !Array.isArray(item)) {
      name = toOptionalTrimmedText(item.name || item.value || item.label);
      descriptionRu = toOptionalTrimmedText(item.description_ru || item.descriptionRu);
      descriptionUz = toOptionalTrimmedText(item.description_uz || item.descriptionUz);
      priceRaw = item.price ?? fallbackPrice;
      barcode = toOptionalTrimmedText(item.barcode).slice(0, 120);

      const normalizedVariantImages = normalizeProductImages(item.product_images).slice(0, MAX_PRODUCT_VARIANT_IMAGES);
      const fallbackVariantImageUrl = toOptionalTrimmedText(item.image_url || item.imageUrl);
      const fallbackVariantThumbUrl = toOptionalTrimmedText(item.thumb_url || item.thumbUrl);
      if (normalizedVariantImages.length === 0 && fallbackVariantImageUrl) {
        normalizedVariantImages.push({
          url: fallbackVariantImageUrl,
          ...(fallbackVariantThumbUrl ? { thumb_url: fallbackVariantThumbUrl } : {})
        });
      }
      const mainVariantImage = normalizedVariantImages[0] || null;
      variantImages = normalizedVariantImages;
      imageUrl = mainVariantImage?.url || fallbackVariantImageUrl || '';
      thumbUrl = mainVariantImage?.thumb_url || fallbackVariantThumbUrl || '';
    } else {
      name = toOptionalTrimmedText(item);
    }

    if (!name) continue;
    const key = name.toLowerCase();
    if (unique.has(key)) continue;
    unique.add(key);
    normalized.push({
      name,
      description_ru: descriptionRu.slice(0, 1500),
      description_uz: descriptionUz.slice(0, 1500),
      price: normalizeProductPrice(priceRaw, fallbackPrice),
      barcode,
      image_url: imageUrl,
      thumb_url: thumbUrl,
      product_images: variantImages
    });
    if (normalized.length >= MAX_PRODUCT_SIZE_OPTIONS) break;
  }
  return normalized;
};
const normalizeProductImages = (value) => {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      source = [];
    }
  }

  if (!Array.isArray(source)) return [];

  const normalized = [];
  for (const item of source) {
    let imageUrl = '';
    let thumbUrl = '';

    if (typeof item === 'string') {
      imageUrl = item.trim();
    } else if (item && typeof item === 'object') {
      imageUrl = toOptionalTrimmedText(item.url || item.image_url);
      thumbUrl = toOptionalTrimmedText(item.thumb_url || item.thumbUrl);
    }

    if (!imageUrl) continue;

    normalized.push({
      url: imageUrl,
      ...(thumbUrl ? { thumb_url: thumbUrl } : {})
    });

    if (normalized.length >= MAX_PRODUCT_IMAGES) break;
  }

  return normalized;
};
const resolveProductMediaPayload = ({ productImages, imageUrl, thumbUrl }) => {
  const normalizedImages = normalizeProductImages(productImages);
  const fallbackImageUrl = toOptionalTrimmedText(imageUrl);
  const fallbackThumbUrl = toOptionalTrimmedText(thumbUrl);

  if (normalizedImages.length === 0 && fallbackImageUrl) {
    normalizedImages.push({
      url: fallbackImageUrl,
      ...(fallbackThumbUrl ? { thumb_url: fallbackThumbUrl } : {})
    });
  }

  const mainImage = normalizedImages[0] || null;
  return {
    productImages: normalizedImages,
    imageUrl: mainImage?.url || fallbackImageUrl || null,
    thumbUrl: mainImage?.thumb_url || fallbackThumbUrl || null
  };
};
const normalizeRestaurantTokenForCompare = (value) => (
  value === undefined || value === null ? '' : String(value).trim()
);
const normalizeLogoDisplayMode = (value, fallback = 'square') => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'horizontal' ? 'horizontal' : fallback;
};
const UI_THEME_VALUES = new Set([
  'classic',
  'modern',
  'talablar_blue',
  'mint_fresh',
  'sunset_pop',
  'berry_blast',
  'violet_wave',
  'rainbow'
]);
const normalizeUiTheme = (value, fallback = 'classic') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (UI_THEME_VALUES.has(normalized)) return normalized;
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return UI_THEME_VALUES.has(normalizedFallback) ? normalizedFallback : 'classic';
};
const normalizeMenuViewMode = (value, fallback = 'grid_categories') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'single_list' || normalized === 'grid_categories') {
    return normalized;
  }
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return normalizedFallback === 'single_list' ? 'single_list' : 'grid_categories';
};
const RESTAURANT_CURRENCY_CODES = new Set(['uz', 'kz', 'tm', 'tj', 'kg', 'af', 'ru']);
const normalizeRestaurantCurrencyCode = (value, fallback = 'uz') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (RESTAURANT_CURRENCY_CODES.has(normalized)) return normalized;
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return RESTAURANT_CURRENCY_CODES.has(normalizedFallback) ? normalizedFallback : 'uz';
};
let restaurantCurrencySchemaReady = false;
let restaurantCurrencySchemaPromise = null;
const ensureRestaurantCurrencySchema = async () => {
  if (restaurantCurrencySchemaReady) return;
  if (restaurantCurrencySchemaPromise) {
    await restaurantCurrencySchemaPromise;
    return;
  }

  restaurantCurrencySchemaPromise = (async () => {
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS currency_code VARCHAR(8) DEFAULT 'uz'`).catch(() => {});
    await pool.query(`
      UPDATE restaurants
      SET currency_code = 'uz'
      WHERE currency_code IS NULL
         OR BTRIM(currency_code) = ''
         OR LOWER(currency_code) NOT IN ('uz', 'kz', 'tm', 'tj', 'kg', 'af', 'ru')
    `).catch(() => {});
    restaurantCurrencySchemaReady = true;
  })();

  try {
    await restaurantCurrencySchemaPromise;
  } finally {
    restaurantCurrencySchemaPromise = null;
  }
};
const ensureGlobalProductsSchema = async () => {
  if (globalProductsSchemaReady) return;
  if (globalProductsSchemaPromise) {
    await globalProductsSchemaPromise;
    return;
  }

  globalProductsSchemaPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS global_products (
        id SERIAL PRIMARY KEY,
        name_ru VARCHAR(255) NOT NULL,
        name_uz VARCHAR(255),
        description_ru TEXT,
        description_uz TEXT,
        image_url TEXT,
        thumb_url TEXT,
        product_images JSONB DEFAULT '[]'::jsonb,
        barcode VARCHAR(120),
        recommended_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        unit VARCHAR(32) DEFAULT 'шт',
        order_step NUMERIC(10,2),
        size_enabled BOOLEAN DEFAULT false,
        size_options JSONB DEFAULT '[]'::jsonb,
        is_active BOOLEAN DEFAULT true,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS name_uz VARCHAR(255)`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS description_ru TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS description_uz TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS image_url TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS thumb_url TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS product_images JSONB DEFAULT '[]'::jsonb`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS barcode VARCHAR(120)`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS recommended_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS unit VARCHAR(32) DEFAULT 'шт'`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS order_step NUMERIC(10,2)`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS size_enabled BOOLEAN DEFAULT false`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS size_options JSONB DEFAULT '[]'::jsonb`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`).catch(() => {});
    await pool.query(`UPDATE global_products SET product_images = '[]'::jsonb WHERE product_images IS NULL`).catch(() => {});
    await pool.query(`UPDATE global_products SET size_options = '[]'::jsonb WHERE size_options IS NULL`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_global_products_active_name ON global_products(is_active, LOWER(name_ru))`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_global_products_barcode ON global_products(barcode)`).catch(() => {});
    globalProductsSchemaReady = true;
  })();

  try {
    await globalProductsSchemaPromise;
  } finally {
    globalProductsSchemaPromise = null;
  }
};
const normalizeCardReceiptTarget = (value, fallback = 'bot') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'admin') return 'admin';
  return fallback;
};
const normalizePaymentPlaceholders = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const systems = ['click', 'uzum', 'xazna'];
  const normalized = {};
  for (const system of systems) {
    const raw = value[system];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    normalized[system] = {
      enabled: raw.enabled === true || raw.enabled === 'true',
      merchant_id: raw.merchant_id === undefined || raw.merchant_id === null ? '' : String(raw.merchant_id),
      api_login: raw.api_login === undefined || raw.api_login === null ? '' : String(raw.api_login),
      api_password: raw.api_password === undefined || raw.api_password === null ? '' : String(raw.api_password),
      callback_timeout_ms: Number.isFinite(Number(raw.callback_timeout_ms)) ? Number(raw.callback_timeout_ms) : 2000,
      test_mode: raw.test_mode === true || raw.test_mode === 'true'
    };
  }
  return normalized;
};
const normalizeOptionalBoolean = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return null;
};
const ANALYTICS_TIMEZONE = process.env.RESTAURANT_TIMEZONE || 'Asia/Tashkent';
const getDateKeyInTimeZone = (date = new Date(), timeZone = ANALYTICS_TIMEZONE) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
};
const parseAnalyticsDateKey = (rawValue) => {
  const value = String(rawValue || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(probe.getTime())) return null;
  return value;
};
const padAnalyticsDatePart = (value) => String(value).padStart(2, '0');
const formatAnalyticsDateKey = (year, month, day) => (
  `${year}-${padAnalyticsDatePart(month)}-${padAnalyticsDatePart(day)}`
);
const parseAnalyticsInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};
const parseFlexibleAmount = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const resolveOrderCostAmount = (value, fallback = 1000) => {
  const parsed = parseFlexibleAmount(value, Number.NaN);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};
const parseAnalyticsPeriod = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'monthly' || normalized === 'month') return 'monthly';
  if (normalized === 'yearly' || normalized === 'year') return 'yearly';
  return 'daily';
};
const resolveFunnelAnalyticsRange = (query = {}) => {
  const todayDateKey = getDateKeyInTimeZone(new Date(), ANALYTICS_TIMEZONE);
  const baseDateKey = parseAnalyticsDateKey(query.date) || todayDateKey;
  const [baseYear, baseMonth, baseDay] = baseDateKey.split('-').map((part) => Number.parseInt(part, 10));
  const period = parseAnalyticsPeriod(query.period);

  if (period === 'monthly') {
    const year = parseAnalyticsInt(query.year) || baseYear;
    const monthRaw = parseAnalyticsInt(query.month) || baseMonth;
    const month = Math.max(1, Math.min(12, monthRaw));
    const startDateKey = formatAnalyticsDateKey(year, month, 1);
    const nextMonthDate = new Date(Date.UTC(year, month, 1));
    const endDateKeyExclusive = formatAnalyticsDateKey(
      nextMonthDate.getUTCFullYear(),
      nextMonthDate.getUTCMonth() + 1,
      nextMonthDate.getUTCDate()
    );
    return {
      period,
      dateKey: startDateKey,
      startDateKey,
      endDateKeyExclusive,
      year,
      month
    };
  }

  if (period === 'yearly') {
    const year = parseAnalyticsInt(query.year) || baseYear;
    const startDateKey = formatAnalyticsDateKey(year, 1, 1);
    const endDateKeyExclusive = formatAnalyticsDateKey(year + 1, 1, 1);
    return {
      period,
      dateKey: startDateKey,
      startDateKey,
      endDateKeyExclusive,
      year,
      month: null
    };
  }

  const startDateKey = formatAnalyticsDateKey(baseYear, baseMonth, baseDay);
  const nextDate = new Date(Date.UTC(baseYear, baseMonth - 1, baseDay + 1));
  const endDateKeyExclusive = formatAnalyticsDateKey(
    nextDate.getUTCFullYear(),
    nextDate.getUTCMonth() + 1,
    nextDate.getUTCDate()
  );
  return {
    period: 'daily',
    dateKey: startDateKey,
    startDateKey,
    endDateKeyExclusive,
    year: baseYear,
    month: baseMonth
  };
};
let productReviewsSchemaReady = false;
let productReviewsSchemaPromise = null;
const ensureProductReviewsSchema = async () => {
  if (productReviewsSchemaReady) return;
  if (productReviewsSchemaPromise) {
    await productReviewsSchemaPromise;
    return;
  }

  productReviewsSchemaPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_reviews (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment TEXT,
        is_deleted BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_product_reviews_product_user
      ON product_reviews(product_id, user_id)
      WHERE user_id IS NOT NULL
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_reviews_product_created
      ON product_reviews(product_id, created_at DESC)
    `).catch(() => {});

    productReviewsSchemaReady = true;
  })();

  try {
    await productReviewsSchemaPromise;
  } finally {
    productReviewsSchemaPromise = null;
  }
};
const ratioPercent = (part, total) => {
  const denominator = Number(total || 0);
  const numerator = Number(part || 0);
  if (!denominator || denominator <= 0 || !Number.isFinite(denominator)) return 0;
  if (!Number.isFinite(numerator) || numerator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
};

const normalizePhoneValue = (value) => {
  const raw = value === undefined || value === null ? '' : String(value).trim().replace(/\s+/g, '');
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  return `+${digits}`;
};

const phoneDigitsOnly = (value) => String(normalizePhoneValue(value) || '').replace(/\D/g, '');

const looksLikePhoneOrTelegramLogin = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (raw.startsWith('@')) return true;
  return /^[+\d\s()\-]+$/.test(raw);
};

const normalizeOperatorAuthFields = ({ username, phone }) => {
  const normalizedPhone = normalizePhoneValue(phone) || null;
  const usernameRaw = String(username || '').trim();
  const normalizedUsername = (normalizedPhone && (!usernameRaw || looksLikePhoneOrTelegramLogin(usernameRaw)))
    ? phoneDigitsOnly(normalizedPhone)
    : usernameRaw;
  return { username: normalizedUsername, phone: normalizedPhone };
};

const normalizeUserIdentityForDisplay = (user) => {
  if (!user) return user;
  const normalizedPhone = normalizePhoneValue(user.phone) || normalizePhoneValue(user.username);
  const digitsFromPhone = phoneDigitsOnly(user.phone) || phoneDigitsOnly(user.username);
  const usernameRaw = String(user.username || '');
  const shouldShowPhoneLogin =
    !!digitsFromPhone &&
    (user.role === 'operator' || user.role === 'superadmin') &&
    (looksLikePhoneOrTelegramLogin(usernameRaw) || !usernameRaw);
  return {
    ...user,
    phone: normalizedPhone || null,
    username: shouldShowPhoneLogin ? digitsFromPhone : user.username
  };
};

const notifyCustomersAboutRestaurantBotMigration = async ({
  restaurantId,
  restaurantName,
  oldToken,
  newToken
}) => {
  const previousToken = normalizeRestaurantTokenForCompare(oldToken);
  const currentToken = normalizeRestaurantTokenForCompare(newToken);

  if (!previousToken || !currentToken || previousToken === currentToken) {
    return { ok: true, skipped: true, reason: 'unchanged_or_missing_token' };
  }

  let newBotUsername = null;
  try {
    const newBot = getRestaurantBot(currentToken);
    const me = await newBot.getMe();
    newBotUsername = me?.username || null;
  } catch (error) {
    return { ok: false, error: 'Новый токен бота некорректен или бот недоступен', details: error.message };
  }

  let oldBot;
  try {
    oldBot = getRestaurantBot(previousToken);
    await oldBot.getMe();
  } catch (error) {
    return { ok: false, error: 'Старый бот недоступен. Нельзя уведомить клиентов перед сменой токена', details: error.message };
  }

  const recipientsResult = await pool.query(
    `SELECT DISTINCT u.telegram_id
     FROM users u
     WHERE u.role = 'customer'
       AND u.telegram_id IS NOT NULL
       AND (
         u.active_restaurant_id = $1
         OR EXISTS (
           SELECT 1
           FROM orders o
           WHERE o.user_id = u.id
             AND o.restaurant_id = $1
         )
       )`,
    [restaurantId]
  );

  const recipients = recipientsResult.rows.map((row) => row.telegram_id).filter(Boolean);
  if (!recipients.length) {
    return {
      ok: true,
      skipped: true,
      reason: 'no_customers',
      total: 0,
      delivered: 0,
      failed: 0,
      newBotUsername
    };
  }

  const newBotLink = newBotUsername ? `https://t.me/${newBotUsername}` : null;
  const message =
    `⚠️ Важное обновление от магазина "${restaurantName}"\n\n` +
    `Мы перешли в новый Telegram-бот для заказов.\n` +
    `${newBotUsername ? `Новый бот: @${newBotUsername}\n` : ''}` +
    `${newBotLink ? `Открыть: ${newBotLink}\n` : ''}` +
    `Пожалуйста, нажмите /start в новом боте, чтобы продолжить получать уведомления и оформлять заказы.`;

  const failures = [];
  let delivered = 0;

  for (const telegramId of recipients) {
    try {
      await oldBot.sendMessage(telegramId, message);
      delivered += 1;
    } catch (error) {
      failures.push({ telegram_id: telegramId, error: error.message });
    }
  }

  if (failures.length > 0) {
    return {
      ok: false,
      error: 'Не удалось уведомить всех клиентов через старый бот. Смена токена остановлена.',
      total: recipients.length,
      delivered,
      failed: failures.length,
      failedRecipients: failures.slice(0, 20),
      newBotUsername
    };
  }

  return {
    ok: true,
    total: recipients.length,
    delivered,
    failed: 0,
    newBotUsername
  };
};

const notifyRestaurantTokenChanged = async ({
  restaurantId,
  restaurantName,
  oldToken,
  newToken
}) => {
  const previousToken = normalizeRestaurantTokenForCompare(oldToken);
  const currentToken = normalizeRestaurantTokenForCompare(newToken);
  if (previousToken === currentToken || !currentToken) {
    return { skipped: true, reason: 'unchanged_or_empty_token' };
  }

  let botUsername = null;
  const recipientsResult = await pool.query(
    `SELECT DISTINCT u.telegram_id
     FROM users u
     INNER JOIN operator_restaurants opr ON opr.user_id = u.id
     WHERE opr.restaurant_id = $1
       AND u.telegram_id IS NOT NULL
       AND u.is_active = true
       AND u.role IN ('operator', 'superadmin')`,
    [restaurantId]
  );

  const recipients = recipientsResult.rows.map((row) => row.telegram_id).filter(Boolean);
  if (!recipients.length) {
    return { skipped: true, reason: 'no_operator_recipients' };
  }

  let bot;
  if (currentToken) {
    try {
      bot = getRestaurantBot(currentToken);
      const me = await bot.getMe();
      botUsername = me?.username || null;
    } catch (error) {
      return { skipped: true, reason: 'new_bot_unavailable', details: error.message };
    }
  }

  const message = `✅ Токен бота магазина успешно обновлен.\n🏪 Магазин: ${restaurantName}\n🤖 Новый бот: ${botUsername ? `@${botUsername}` : 'подключен'}\n\nЕсли сообщение не пришло, откройте новый бот и нажмите /start.`;
  const failures = [];
  let delivered = 0;

  for (const telegramId of recipients) {
    try {
      await bot.sendMessage(telegramId, message);
      delivered += 1;
    } catch (error) {
      failures.push({ telegram_id: telegramId, error: error.message });
    }
  }

  return {
    total: recipients.length,
    delivered,
    failed: failures.length,
    failedRecipients: failures.slice(0, 20),
    botUsername
  };
};

const findAdminCategoryNameConflict = async ({
  parentId = null,
  restaurantId,
  nameRu,
  nameUz,
  excludeId = null
}) => {
  const siblings = await pool.query(
    `SELECT id, name_ru, name_uz
     FROM categories
     WHERE restaurant_id = $1
       AND parent_id IS NOT DISTINCT FROM $2
       AND ($3::int IS NULL OR id <> $3)`,
    [restaurantId, parentId, excludeId]
  );

  const targetRu = normalizeCategoryName(nameRu).toLowerCase();
  const targetUz = normalizeCategoryName(nameUz).toLowerCase();

  for (const sibling of siblings.rows) {
    const siblingRu = normalizeCategoryName(sibling.name_ru).toLowerCase();
    const siblingUz = normalizeCategoryName(sibling.name_uz).toLowerCase();

    if (targetRu && siblingRu === targetRu) {
      return { field: 'name_ru', existingId: sibling.id };
    }
    if (targetUz && siblingUz && siblingUz === targetUz) {
      return { field: 'name_uz', existingId: sibling.id };
    }
  }

  return null;
};

const validateProductCategorySelection = async ({ categoryId }) => {
  if (!categoryId) {
    return { ok: true, category: null };
  }

  const categoryCheck = await pool.query(
    `SELECT id, parent_id
     FROM categories
     WHERE id = $1`,
    [categoryId]
  );

  if (categoryCheck.rows.length === 0) {
    return { ok: false, error: 'Категория не найдена' };
  }

  if (categoryCheck.rows[0].parent_id === null) {
    return { ok: false, error: 'Товар нельзя добавлять в категорию 1-го уровня. Выберите подкатегорию.' };
  }

  return { ok: true, category: categoryCheck.rows[0] };
};

// All routes require authentication and operator/superadmin role
router.use(authenticate);
router.use(requireOperator);

const OPERATOR_VIEW_LOG_MIN_INTERVAL_MS = 45 * 1000;
const recentOperatorViewLogMap = new Map();
const OPERATOR_VIEW_LOG_ALLOWED_METHODS = new Set(['GET']);
const OPERATOR_VIEW_LOG_DENYLIST_PREFIXES = [
  '/profile-logs',
  '/help-instructions'
];

const normalizePathForOperatorViewLog = (pathValue) => (
  String(pathValue || '')
    .split('?')[0]
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/\/[0-9a-f]{16,}(?=\/|$)/ig, '/:token')
);

const shouldSkipOperatorViewLog = (req) => {
  if (!req?.user || req.user.role !== 'operator') return true;
  if (!OPERATOR_VIEW_LOG_ALLOWED_METHODS.has(String(req.method || '').toUpperCase())) return true;
  const normalizedPath = normalizePathForOperatorViewLog(req.path);
  if (!normalizedPath.startsWith('/')) return true;
  if (OPERATOR_VIEW_LOG_DENYLIST_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) return true;
  return false;
};

router.use((req, res, next) => {
  if (shouldSkipOperatorViewLog(req)) {
    next();
    return;
  }

  const startedAt = Date.now();
  res.on('finish', () => {
    try {
      if (res.statusCode >= 400) return;
      const normalizedPath = normalizePathForOperatorViewLog(req.path);
      const userId = Number.parseInt(req.user?.id, 10);
      const restaurantId = Number.parseInt(req.user?.active_restaurant_id, 10);
      if (!Number.isFinite(userId) || userId <= 0) return;

      const cacheKey = `${userId}:${normalizedPath}`;
      const now = Date.now();
      const lastLoggedAt = recentOperatorViewLogMap.get(cacheKey) || 0;
      if (now - lastLoggedAt < OPERATOR_VIEW_LOG_MIN_INTERVAL_MS) return;
      recentOperatorViewLogMap.set(cacheKey, now);

      if (recentOperatorViewLogMap.size > 4000) {
        const cutoff = now - OPERATOR_VIEW_LOG_MIN_INTERVAL_MS;
        for (const [key, value] of recentOperatorViewLogMap.entries()) {
          if (value < cutoff) recentOperatorViewLogMap.delete(key);
        }
      }

      logActivity({
        userId,
        restaurantId: Number.isFinite(restaurantId) && restaurantId > 0 ? restaurantId : null,
        actionType: ACTION_TYPES.OPERATOR_VIEW,
        entityType: ENTITY_TYPES.SYSTEM,
        entityId: null,
        entityName: `${String(req.method || '').toUpperCase()} ${normalizedPath}`,
        oldValues: null,
        newValues: {
          status_code: res.statusCode,
          duration_ms: Math.max(0, Date.now() - startedAt)
        },
        ipAddress: getIpFromRequest(req),
        userAgent: getUserAgentFromRequest(req)
      }).catch(() => {});
    } catch (_) {}
  });

  next();
});

router.get('/help-instructions', async (req, res) => {
  try {
    await ensureHelpInstructionsSchema();
    const rows = await listHelpInstructions();
    res.json(rows);
  } catch (error) {
    console.error('Admin get help instructions error:', error);
    res.status(500).json({ error: 'Ошибка загрузки инструкций' });
  }
});

// =====================================================
// ИНФОРМАЦИЯ О ТЕКУЩЕМ ПОЛЬЗОВАТЕЛЕ
// =====================================================

// Получить информацию о текущем операторе и его ресторанах
router.get('/me', (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    full_name: req.user.full_name,
    role: req.user.role,
    active_restaurant_id: req.user.active_restaurant_id,
    active_restaurant_name: req.user.active_restaurant_name,
    active_restaurant_currency_code: req.user.active_restaurant_currency_code || 'uz',
    restaurants: req.user.restaurants || [],
    balance: req.user.balance
  });
});

// Переключить активный ресторан
router.post('/switch-restaurant', async (req, res) => {
  try {
    await ensureRestaurantCurrencySchema();
    const { restaurant_id } = req.body;

    if (!restaurant_id) {
      return res.status(400).json({ error: 'ID ресторана обязателен' });
    }

    // Check if user has access to an active restaurant (superadmin has access to all, but still only active shops here)
    if (req.user.role !== 'superadmin') {
      const accessCheck = await pool.query(`
        SELECT 1
        FROM operator_restaurants opr
        INNER JOIN restaurants r ON r.id = opr.restaurant_id
        WHERE opr.user_id = $1
          AND opr.restaurant_id = $2
          AND r.is_active = true
      `, [req.user.id, restaurant_id]);

      if (accessCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Нет доступа к этому активному магазину' });
      }
    }

    // Update active restaurant
    await pool.query(
      'UPDATE users SET active_restaurant_id = $1 WHERE id = $2',
      [restaurant_id, req.user.id]
    );

    // Get restaurant name and logo
    const restaurantResult = await pool.query(
      'SELECT name, logo_url, logo_display_mode, ui_theme, menu_view_mode, currency_code FROM restaurants WHERE id = $1 AND is_active = true',
      [restaurant_id]
    );

    if (!restaurantResult.rows.length) {
      return res.status(403).json({ error: 'Магазин деактивирован' });
    }

    res.json({
      message: 'Ресторан переключен',
      active_restaurant_id: restaurant_id,
      active_restaurant_name: restaurantResult.rows[0]?.name,
      active_restaurant_logo: restaurantResult.rows[0]?.logo_url,
      active_restaurant_logo_display_mode: restaurantResult.rows[0]?.logo_display_mode || 'square',
      active_restaurant_ui_theme: normalizeUiTheme(restaurantResult.rows[0]?.ui_theme, 'classic'),
      active_restaurant_menu_view_mode: normalizeMenuViewMode(restaurantResult.rows[0]?.menu_view_mode, 'grid_categories'),
      active_restaurant_currency_code: normalizeRestaurantCurrencyCode(restaurantResult.rows[0]?.currency_code, 'uz')
    });
  } catch (error) {
    console.error('Switch restaurant error:', error);
    res.status(500).json({ error: 'Ошибка переключения ресторана' });
  }
});

// =====================================================
// ЗАКАЗЫ
// =====================================================

// Получить заказы (фильтруются по активному ресторану)
router.get('/orders', async (req, res) => {
  try {
    const { status } = req.query;
    const restaurantId = req.user.active_restaurant_id;

    let query = `
      SELECT o.*, u.username, u.full_name as user_name, u.telegram_id,
             r.name as restaurant_name,
             r.balance as restaurant_balance,
             r.order_cost as restaurant_order_cost,
             r.is_free_tier as restaurant_is_free_tier,
             pb.full_name as processed_by_name,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', oi.id,
                   'product_id', oi.product_id,
                    'product_name', oi.product_name,
                    'quantity', oi.quantity,
                    'unit', oi.unit,
                    'price', oi.price,
                    'total', oi.total,
                    'image_url', p.image_url
                  )
                ) FILTER (WHERE oi.id IS NOT NULL),
                '[]'
              ) as items,
             COALESCE(
               (
                 SELECT json_agg(
                   json_build_object(
                     'id', osh.id,
                     'status', osh.status,
                     'comment', osh.comment,
                     'created_at', osh.created_at,
                     'actor_name', COALESCE(hu.full_name, hu.username, '')
                   )
                   ORDER BY osh.created_at ASC, osh.id ASC
                 )
                 FROM order_status_history osh
                 LEFT JOIN users hu ON hu.id = osh.changed_by
                 WHERE osh.order_id = o.id
               ),
               '[]'::json
             ) AS status_actions
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN users pb ON o.processed_by = pb.id
      LEFT JOIN restaurants r ON o.restaurant_id = r.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // Filter by restaurant (operators see only their restaurant, superadmin sees all)
    if (restaurantId && req.user.role !== 'superadmin') {
      query += ` AND o.restaurant_id = $${paramCount}`;
      params.push(restaurantId);
      paramCount++;
    } else if (restaurantId) {
      // Superadmin with active restaurant - filter by it
      query += ` AND o.restaurant_id = $${paramCount}`;
      params.push(restaurantId);
      paramCount++;
    }

    if (status && status !== 'all') {
      const normalizedStatus = normalizeOrderStatus(status);
      if (normalizedStatus === 'preparing') {
        query += ` AND (o.status = $${paramCount} OR o.status = $${paramCount + 1})`;
        params.push('preparing', 'in_progress');
        paramCount += 2;
      } else {
        query += ` AND o.status = $${paramCount}`;
        params.push(normalizedStatus);
        paramCount++;
      }
    }

    query += ' GROUP BY o.id, u.username, u.full_name, u.telegram_id, r.name, r.balance, r.order_cost, r.is_free_tier, pb.full_name ORDER BY o.created_at DESC';

    const result = await pool.query(query, params);

    // Mask sensitive data only for NEW orders when restaurant balance is insufficient.
    // Processed orders must always show full customer data.
    const processedRows = result.rows.map(order => {
      const normalizedStatus = normalizeOrderStatus(order.status);
      const isProcessedOrder = normalizedStatus && normalizedStatus !== 'new';
      const isFreeTier = Boolean(order.restaurant_is_free_tier);
      const restaurantBalance = parseFloat(order.restaurant_balance || 0);
      const orderCost = resolveOrderCostAmount(order.restaurant_order_cost, 1000);
      const canViewNewOrderSensitiveData = isFreeTier || order.is_paid || restaurantBalance >= orderCost;

      if (isProcessedOrder || canViewNewOrderSensitiveData) {
        return {
          ...order,
          status: normalizedStatus
        };
      }

      // Mask sensitive fields
      return {
        ...order,
        status: normalizedStatus,
        customer_phone: order.customer_phone ? order.customer_phone.substring(0, 4) + '***' + order.customer_phone.slice(-2) : '***',
        delivery_address: 'Засекречено (требуется оплата)',
        delivery_coordinates: null,
        // customer_name stays visible as per common practice, or semi-masked if needed
        customer_name: order.customer_name ? order.customer_name.charAt(0) + '***' : '***'
      };
    });

    res.json(processedRows);
  } catch (error) {
    console.error('Admin orders error:', error);
    res.status(500).json({ error: 'Ошибка получения заказов' });
  }
});

// Счетчики заказов по статусам (для вкладок UI, независимо от активного фильтра)
router.get('/orders/status-counts', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;

    let query = `
      SELECT
        COUNT(*)::int AS all_count,
        COUNT(*) FILTER (WHERE o.status = 'new')::int AS new_count,
        COUNT(*) FILTER (WHERE o.status IN ('preparing', 'in_progress'))::int AS preparing_count,
        COUNT(*) FILTER (WHERE o.status = 'delivering')::int AS delivering_count,
        COUNT(*) FILTER (WHERE o.status = 'delivered')::int AS delivered_count,
        COUNT(*) FILTER (WHERE o.status = 'cancelled')::int AS cancelled_count
      FROM orders o
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (restaurantId && req.user.role !== 'superadmin') {
      query += ` AND o.restaurant_id = $${paramCount}`;
      params.push(restaurantId);
      paramCount++;
    } else if (restaurantId) {
      query += ` AND o.restaurant_id = $${paramCount}`;
      params.push(restaurantId);
      paramCount++;
    }

    const result = await pool.query(query, params);
    res.json(result.rows[0] || {
      all_count: 0,
      new_count: 0,
      preparing_count: 0,
      delivering_count: 0,
      delivered_count: 0,
      cancelled_count: 0
    });
  } catch (error) {
    console.error('Admin orders status-counts error:', error);
    res.status(500).json({ error: 'Ошибка получения счетчиков заказов' });
  }
});


// Принять заказ и списать баланс
router.post('/orders/:id/accept-and-pay', async (req, res) => {
  const client = await pool.connect();
  try {
    const orderId = req.params.id;
    const restaurantId = req.user.active_restaurant_id;
    const preferredLang = String(req.body?.lang || '').trim().toLowerCase() === 'uz' ? 'uz' : 'ru';

    await client.query('BEGIN');

    // 1. Get order and restaurant info
    const orderResult = await client.query(`
      SELECT o.id, o.restaurant_id, o.is_paid, r.balance, r.is_free_tier, r.order_cost
      FROM orders o
      JOIN restaurants r ON o.restaurant_id = r.id
      WHERE o.id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    const order = orderResult.rows[0];

    // Check access
    if (req.user.role !== 'superadmin' && order.restaurant_id !== restaurantId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Нет доступа к этому заказу' });
    }

    if (order.is_paid) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Заказ уже оплачен' });
    }

    // 2. Billing logic
    const cost = order.is_free_tier ? 0 : resolveOrderCostAmount(order.order_cost, 1000);
    const lowBalanceThreshold = Number(process.env.LOW_BALANCE_ALERT_THRESHOLD || 3000);
    const balanceBefore = Number(order.balance || 0);

    if (!order.is_free_tier && balanceBefore < cost) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Недостаточно средств на балансе. Пополните счет.' });
    }

    // 3. Deduct balance and update order
    if (cost > 0) {
      await client.query(`
        UPDATE restaurants SET balance = balance - $1 WHERE id = $2
      `, [cost, order.restaurant_id]);

      // Record transaction
      await client.query(`
        INSERT INTO billing_transactions (restaurant_id, user_id, amount, type, description)
        VALUES ($1, $2, $3, $4, $5)
      `, [order.restaurant_id, req.user.id, -cost, 'withdrawal', `Списание за заказ #${orderId}`]);
    }
    const remainingBalance = Math.max(0, balanceBefore - Number(cost || 0));
    const lowBalanceCrossed =
      !order.is_free_tier &&
      Number(cost || 0) > 0 &&
      balanceBefore > lowBalanceThreshold &&
      remainingBalance <= lowBalanceThreshold;

    const updatedOrder = await client.query(`
      UPDATE orders 
      SET is_paid = true, 
          paid_amount = $1, 
          status = 'preparing', 
          processed_by = $2, 
          processed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [cost, req.user.id, orderId]);

    const actorName = req.user.full_name || req.user.username || `user_${req.user.id}`;
    await client.query(
      `INSERT INTO order_status_history (order_id, status, changed_by, comment)
       VALUES ($1, $2, $3, $4), ($1, $5, $3, $6)`,
      [
        orderId,
        'accepted',
        req.user.id,
        `Принято в админке: ${actorName}`,
        'preparing',
        `Из админки: ${actorName}`
      ]
    );

    await client.query('COMMIT');

    // Notify customer and sync group inline buttons/message
    try {
      let fullOrderResult;
      try {
        fullOrderResult = await pool.query(
          `SELECT o.*, r.telegram_bot_token, r.telegram_group_id, r.send_balance_after_confirm,
                  pb.full_name AS processed_by_name
           FROM orders o
           JOIN restaurants r ON o.restaurant_id = r.id
           LEFT JOIN users pb ON pb.id = o.processed_by
           WHERE o.id = $1
           LIMIT 1`,
          [orderId]
        );
      } catch (queryError) {
        if (queryError.code !== '42703') throw queryError;
        fullOrderResult = await pool.query(
          `SELECT o.*, r.telegram_bot_token, r.telegram_group_id, false AS send_balance_after_confirm,
                  pb.full_name AS processed_by_name
           FROM orders o
           JOIN restaurants r ON o.restaurant_id = r.id
           LEFT JOIN users pb ON pb.id = o.processed_by
           WHERE o.id = $1
           LIMIT 1`,
          [orderId]
        );
      }

      if (fullOrderResult.rows.length > 0) {
        const fullOrder = fullOrderResult.rows[0];

        if (fullOrder.user_id) {
          const userTelegram = await pool.query('SELECT telegram_id FROM users WHERE id = $1', [fullOrder.user_id]);
          if (userTelegram.rows[0]?.telegram_id) {
            await sendOrderUpdateToUser(
              userTelegram.rows[0].telegram_id,
              fullOrder,
              'preparing',
              fullOrder.telegram_bot_token
            );
          }
        }

        const itemsResult = await pool.query(
          `SELECT oi.*
           FROM order_items oi
           WHERE oi.order_id = $1
           ORDER BY oi.id`,
          [orderId]
        );

        await updateOrderGroupNotification(fullOrder, itemsResult.rows, {
          status: 'preparing',
          operatorName: fullOrder.processed_by_name || req.user.full_name || req.user.username || ''
        });

        if (fullOrder.send_balance_after_confirm && fullOrder.telegram_group_id) {
          await sendRestaurantGroupBalanceLeft({
            restaurantId: fullOrder.restaurant_id,
            botToken: fullOrder.telegram_bot_token,
            groupId: fullOrder.telegram_group_id,
            currentBalance: remainingBalance,
            language: preferredLang
          });
        }
      }
    } catch (err) {
      console.error('Notify customer on accept error:', err);
    }

    if (lowBalanceCrossed) {
      try {
        const { notifyRestaurantAdminsLowBalance } = require('../bot/notifications');
        await notifyRestaurantAdminsLowBalance(order.restaurant_id, remainingBalance, { threshold: lowBalanceThreshold });
      } catch (err) {
        console.error('Notify low balance on accept-and-pay error:', err);
      }
    }

    res.json(updatedOrder.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Accept and pay error:', error);
    res.status(500).json({ error: 'Ошибка при принятии заказа' });
  } finally {
    client.release();
  }
});

// =====================================================
// НАСТРОЙКИ (ДЛЯ ОПЕРАТОРА)
// =====================================================

// Получить настройки текущего ресторана
router.get('/restaurant', async (req, res) => {
  try {
    await ensureRestaurantCurrencySchema();
    await ensureReservationSchema();
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) return res.status(400).json({ error: 'Ресторан не выбран' });

    const result = await pool.query(
      `SELECT
         r.*,
         COALESCE(rs.enabled, false) AS reservation_enabled_setting
       FROM restaurants r
       LEFT JOIN restaurant_reservation_settings rs ON rs.restaurant_id = r.id
       WHERE r.id = $1
       LIMIT 1`,
      [restaurantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Ресторан не найден' });
    const row = result.rows[0];
    res.json({
      ...row,
      reservation_enabled: row.reservation_enabled_setting === true || row.reservation_enabled_setting === 'true'
    });
  } catch (error) {
    console.error('Get restaurant settings error:', error);
    res.status(500).json({ error: 'Ошибка получения настроек ресторана' });
  }
});

// Обновить настройки текущего ресторана
router.put('/restaurant', async (req, res) => {
  try {
    await ensureRestaurantCurrencySchema();
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) return res.status(400).json({ error: 'Ресторан не выбран' });
    const previousRestaurantResult = await pool.query(
      'SELECT name, telegram_bot_token, logo_display_mode, ui_theme, menu_view_mode, currency_code FROM restaurants WHERE id = $1',
      [restaurantId]
    );
    if (!previousRestaurantResult.rows.length) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }
    const previousRestaurant = previousRestaurantResult.rows[0];

    const {
      name, address, phone, logo_url, telegram_bot_token, telegram_group_id,
      operator_registration_code, start_time, end_time, click_url, payme_url, uzum_url, xazna_url,
      cash_enabled,
      card_payment_title, card_payment_number, card_payment_holder, card_receipt_target, support_username,
      payme_enabled, payme_merchant_id, payme_api_login, payme_api_password, payme_account_key, payme_test_mode, payme_callback_timeout_ms,
      latitude, longitude, delivery_base_radius, delivery_base_price,
      delivery_price_per_km, is_delivery_enabled, delivery_zone,
      msg_new, msg_preparing, msg_delivering, msg_delivered, msg_cancelled,
      logo_display_mode, ui_theme, menu_view_mode, payment_placeholders, currency_code,
      send_balance_after_confirm, send_daily_close_report
    } = req.body;
    const normalizedBotToken = telegram_bot_token === undefined || telegram_bot_token === null
      ? null
      : String(telegram_bot_token).trim();
    const normalizedGroupId = telegram_group_id === undefined || telegram_group_id === null
      ? null
      : String(telegram_group_id).trim();
    const normalizedLogoDisplayMode = normalizeLogoDisplayMode(
      logo_display_mode,
      previousRestaurant.logo_display_mode || 'square'
    );
    const normalizedUiTheme = normalizeUiTheme(
      ui_theme,
      previousRestaurant.ui_theme || 'classic'
    );
    const normalizedMenuViewMode = normalizeMenuViewMode(
      menu_view_mode,
      previousRestaurant.menu_view_mode || 'grid_categories'
    );
    const normalizedCurrencyCode = normalizeRestaurantCurrencyCode(currency_code, previousRestaurant.currency_code || 'uz');
    const normalizedCardReceiptTarget = normalizeCardReceiptTarget(card_receipt_target, 'bot');
    const normalizedCashEnabled = normalizeOptionalBoolean(cash_enabled);
    const normalizedPaymentPlaceholders = normalizePaymentPlaceholders(payment_placeholders);
    const normalizedSendBalanceAfterConfirm = normalizeOptionalBoolean(send_balance_after_confirm);
    const normalizedSendDailyCloseReport = normalizeOptionalBoolean(send_daily_close_report);
    const previousBotToken = normalizeRestaurantTokenForCompare(previousRestaurant.telegram_bot_token);
    const nextBotToken = normalizedBotToken === null
      ? previousBotToken
      : normalizeRestaurantTokenForCompare(normalizedBotToken);
    const isTokenChanging = normalizedBotToken !== null && nextBotToken !== previousBotToken;

    let customerMigrationResult = null;
    if (isTokenChanging && nextBotToken) {
      customerMigrationResult = await notifyCustomersAboutRestaurantBotMigration({
        restaurantId,
        restaurantName: name || previousRestaurant.name || 'Ваш магазин',
        oldToken: previousRestaurant.telegram_bot_token,
        newToken: nextBotToken
      });

      if (!customerMigrationResult.ok) {
        return res.status(409).json({
          error: customerMigrationResult.error,
          details: customerMigrationResult.details || null,
          token_migration: customerMigrationResult
        });
      }
    }

    // Fields that OPERATOR is NOT allowed to change:
    // service_fee, balance, order_cost, is_free_tier

    const result = await pool.query(`
      UPDATE restaurants 
      SET name = COALESCE($1, name),
          address = COALESCE($2, address),
          phone = COALESCE($3, phone),
          logo_url = $4,
          logo_display_mode = $5,
          telegram_bot_token = COALESCE($6, telegram_bot_token),
          telegram_group_id = COALESCE($7, telegram_group_id),
          start_time = $8,
          end_time = $9,
          click_url = $10,
          payme_url = $11,
          uzum_url = $12,
          xazna_url = $13,
          cash_enabled = COALESCE($14, cash_enabled),
          card_payment_title = $15,
          card_payment_number = $16,
          card_payment_holder = $17,
          card_receipt_target = $18,
          support_username = $19,
          operator_registration_code = $20,
          payme_enabled = $21,
          payme_merchant_id = $22,
          payme_api_login = $23,
          payme_api_password = $24,
          payme_account_key = $25,
          payme_test_mode = $26,
          payme_callback_timeout_ms = $27,
          latitude = $28,
          longitude = $29,
          delivery_base_radius = $30,
          delivery_base_price = $31,
          delivery_price_per_km = $32,
          is_delivery_enabled = $33,
          delivery_zone = $34,
          msg_new = $35,
           msg_preparing = $36,
           msg_delivering = $37,
           msg_delivered = $38,
           msg_cancelled = $39,
           ui_theme = $40,
           menu_view_mode = $41,
          payment_placeholders = COALESCE($42::jsonb, payment_placeholders),
          send_balance_after_confirm = COALESCE($43, send_balance_after_confirm),
          send_daily_close_report = COALESCE($44, send_daily_close_report),
          currency_code = $45,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $46
      RETURNING *
    `, [
      name, address, phone, logo_url, normalizedLogoDisplayMode, normalizedBotToken, normalizedGroupId,
      start_time, end_time, click_url, payme_url, uzum_url, xazna_url,
      normalizedCashEnabled,
      card_payment_title || null,
      card_payment_number ? String(card_payment_number).replace(/\D/g, '').slice(0, 19) : null,
      card_payment_holder || null,
      normalizedCardReceiptTarget,
      support_username,
      operator_registration_code || null,
      payme_enabled,
      payme_merchant_id || null,
      payme_api_login || null,
      payme_api_password || null,
      payme_account_key || 'order_id',
      payme_test_mode === true || payme_test_mode === 'true',
      Number.isInteger(Number(payme_callback_timeout_ms)) ? Number(payme_callback_timeout_ms) : 2000,
      latitude, longitude, delivery_base_radius, delivery_base_price,
      delivery_price_per_km, is_delivery_enabled,
      delivery_zone ? JSON.stringify(delivery_zone) : null,
      msg_new, msg_preparing, msg_delivering, msg_delivered, msg_cancelled,
      normalizedUiTheme,
      normalizedMenuViewMode,
      normalizedPaymentPlaceholders ? JSON.stringify(normalizedPaymentPlaceholders) : null,
      normalizedSendBalanceAfterConfirm,
      normalizedSendDailyCloseReport,
      normalizedCurrencyCode,
      restaurantId
    ]);

    try {
      await reloadMultiBots();
    } catch (reloadErr) {
      console.error('Multi-bot reload warning after restaurant update:', reloadErr.message);
    }

    let operatorNotificationResult = null;
    try {
      operatorNotificationResult = await notifyRestaurantTokenChanged({
        restaurantId: result.rows[0].id,
        restaurantName: result.rows[0].name || previousRestaurant.name,
        oldToken: previousRestaurant.telegram_bot_token,
        newToken: result.rows[0].telegram_bot_token
      });
    } catch (notifyErr) {
      console.error('Restaurant token change notification warning:', notifyErr.message);
    }

    res.json({
      ...result.rows[0],
      token_migration: customerMigrationResult,
      operator_notification: operatorNotificationResult
    });
  } catch (error) {
    console.error('Update restaurant settings error:', error);
    res.status(500).json({ error: 'Ошибка обновления настроек ресторана' });
  }
});

// Обновить только валюту текущего ресторана (быстрое переключение из хедера)
router.patch('/restaurant/currency', async (req, res) => {
  try {
    await ensureRestaurantCurrencySchema();
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Только супер-админ может менять валюту магазина' });
    }
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) return res.status(400).json({ error: 'Ресторан не выбран' });

    const normalizedCurrencyCode = normalizeRestaurantCurrencyCode(req.body?.currency_code, 'uz');
    const result = await pool.query(
      `UPDATE restaurants
       SET currency_code = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, currency_code`,
      [normalizedCurrencyCode, restaurantId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Patch restaurant currency error:', error);
    res.status(500).json({ error: 'Ошибка обновления валюты магазина' });
  }
});

// Проверить работу бота (отправка тестовых сообщений)
router.post('/test-bot', async (req, res) => {
  try {
    const { botToken, groupId, profileOnly } = req.body;
    const telegramId = req.user.telegram_id;

    if (!botToken) {
      return res.status(400).json({ error: 'Token обязателен для проверки' });
    }

    const { getRestaurantBot } = require('../bot/notifications');
    const bot = getRestaurantBot(botToken);
    let botProfile = null;

    try {
      botProfile = await bot.getMe();
    } catch (err) {
      return res.status(400).json({ error: `Не удалось проверить Bot Token: ${err.message}` });
    }

    const serializedBotProfile = botProfile ? {
      id: botProfile.id,
      username: botProfile.username || '',
      first_name: botProfile.first_name || ''
    } : null;

    if (profileOnly) {
      return res.json({
        success: true,
        message: 'Данные бота получены',
        bot: serializedBotProfile
      });
    }

    const results = [];
    const errors = [];

    // 1. Отправка в сам бот (пользователю)
    if (telegramId) {
      try {
        await bot.sendMessage(telegramId, '🤖 Бот запущен и работает!');
        results.push('✅ Сообщение "Бот запущен" отправлено вам в личные сообщения.');
      } catch (err) {
        errors.push(`❌ В личку: ${err.message}. Возможно, вы не начали диалог с ботом @${botProfile?.username || 'bot'}`);
      }
    } else {
      results.push('⚠️ Ваш Telegram ID не привязан к этому аккаунту! Чтобы получать уведомления в личку, добавьте свой ID в настройках вашего профиля.');
      results.push('💡 Вы можете узнать свой ID, отправив команду /id боту.');
    }

    // 2. Отправка в группу
    if (groupId) {
      try {
        await bot.sendMessage(groupId, '✅ Бот слушает группу и готов к работе!');
        results.push('✅ Сообщение "Бот слушает группу" отправлено в указанный чат.');
      } catch (err) {
        errors.push(`❌ В группу: ${err.message}. Проверьте Group ID и убедитесь, что бот добавлен в группу и является администратором.`);
      }
    } else {
      results.push('ℹ️ Group ID не указан, сообщение в группу не отправлено.');
    }

    res.json({
      success: errors.length === 0,
      message: errors.length === 0 ? 'Тестирование завершено успешно!' : 'Тестирование завершено с ошибками',
      details: results,
      errors: errors,
      bot: serializedBotProfile
    });
  } catch (error) {
    console.error('Test bot error:', error);
    res.status(500).json({ error: 'Критическая ошибка при тестировании: ' + error.message });
  }
});

// Получить список операторов текущего ресторана
router.get('/operators', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) return res.status(400).json({ error: 'Ресторан не выбран' });

    const result = await pool.query(`
      SELECT u.id, u.username, u.full_name, u.phone, u.role, u.is_active, u.telegram_id
      FROM users u
      JOIN operator_restaurants opr ON u.id = opr.user_id
      WHERE opr.restaurant_id = $1 AND u.role = 'operator'
      ORDER BY u.id
    `, [restaurantId]);

    res.json(result.rows.map(normalizeUserIdentityForDisplay));
  } catch (error) {
    console.error('Get operators error:', error);
    res.status(500).json({ error: 'Ошибка получения списка операторов' });
  }
});

// Добавить оператора к текущему ресторану (создать нового или привязать существующего)
router.post('/operators', async (req, res) => {
  const client = await pool.connect();
  try {
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) return res.status(400).json({ error: 'Ресторан не выбран' });

    const { username, password, full_name, phone, telegram_id } = req.body;
    const normalizedAuth = normalizeOperatorAuthFields({ username, phone });

    if (!normalizedAuth.username) return res.status(400).json({ error: 'Username обязателен' });

    await client.query('BEGIN');

    // Check if user already exists
    let userResult = await client.query('SELECT * FROM users WHERE username = $1', [normalizedAuth.username]);
    let user;

    if (userResult.rows.length > 0) {
      user = userResult.rows[0];
      // Check if already operator of this restaurant
      const checkLink = await client.query(
        'SELECT 1 FROM operator_restaurants WHERE user_id = $1 AND restaurant_id = $2',
        [user.id, restaurantId]
      );
      if (checkLink.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Пользователь уже является оператором этого ресторана' });
      }
    } else {
      // Create new user
      if (!password) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Пароль обязателен для нового пользователя' });
      }
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUserResult = await client.query(`
        INSERT INTO users (username, password, full_name, phone, role, active_restaurant_id, telegram_id)
        VALUES ($1, $2, $3, $4, 'operator', $5, $6)
        RETURNING id, username, full_name, role, telegram_id
      `, [normalizedAuth.username, hashedPassword, full_name, normalizedAuth.phone, restaurantId, telegram_id || null]);
      user = newUserResult.rows[0];
    }

    // Link user to restaurant
    await client.query(`
      INSERT INTO operator_restaurants (user_id, restaurant_id)
      VALUES ($1, $2)
    `, [user.id, restaurantId]);

    await client.query('COMMIT');
    res.status(201).json(normalizeUserIdentityForDisplay(user));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add operator error:', error);
    res.status(500).json({ error: 'Ошибка добавления оператора' });
  } finally {
    client.release();
  }
});

// Удалить оператора из текущего ресторана (отвязать)
router.delete('/operators/:id', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    const operatorId = req.params.id;

    if (parseInt(operatorId) === req.user.id) {
      return res.status(400).json({ error: 'Нельзя удалить самого себя' });
    }

    const result = await pool.query(
      'DELETE FROM operator_restaurants WHERE user_id = $1 AND restaurant_id = $2',
      [operatorId, restaurantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Оператор не найден в этом ресторане' });
    }

    res.json({ message: 'Оператор удален из ресторана' });
  } catch (error) {
    console.error('Remove operator error:', error);
    res.status(500).json({ error: 'Ошибка удаления оператора' });
  }
});

// Обновить оператора текущего ресторана (изменение данных)
router.put('/operators/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const restaurantId = req.user.active_restaurant_id;
    const operatorId = req.params.id;
    const { username, password, full_name, phone, telegram_id } = req.body;
    const normalizedAuth = normalizeOperatorAuthFields({ username, phone });

    await client.query('BEGIN');

    // Проверяем, привязан ли оператор к этому ресторану
    const checkLink = await client.query(
      'SELECT 1 FROM operator_restaurants WHERE user_id = $1 AND restaurant_id = $2',
      [operatorId, restaurantId]
    );

    if (checkLink.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Оператор не найден в этом ресторане' });
    }

    // Обновляем данные пользователя
    let query = 'UPDATE users SET username = $1, full_name = $2, phone = $3, telegram_id = $4';
    let params = [normalizedAuth.username, full_name, normalizedAuth.phone, telegram_id || null];
    let paramCount = 5;

    if (password) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);
      query += `, password = $${paramCount}`;
      params.push(hashedPassword);
      paramCount++;
    }

    query += ` WHERE id = $${paramCount} RETURNING id, username, full_name, phone, role, telegram_id`;
    params.push(operatorId);

    const result = await client.query(query, params);

    await client.query('COMMIT');
    res.json(normalizeUserIdentityForDisplay(result.rows[0]));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update operator error:', error);
    res.status(500).json({ error: 'Ошибка обновления оператора' });
  } finally {
    client.release();
  }
});

// =====================================================
// БИЛЛИНГ (ДЛЯ ОПЕРАТОРА)
// =====================================================

// Получить инфо о балансе и реквизиты
router.get('/billing/info', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) return res.status(400).json({ error: 'Ресторан не выбран' });

    const restResult = await pool.query('SELECT id, balance, is_free_tier, order_cost, currency_code FROM restaurants WHERE id = $1', [restaurantId]);
    const settingsResult = await pool.query('SELECT card_number, card_holder, phone_number, telegram_username, click_link, payme_link FROM billing_settings WHERE id = 1');

    res.json({
      restaurant: restResult.rows[0],
      requisites: settingsResult.rows[0] || {}
    });
  } catch (error) {
    console.error('Get billing info error:', error);
    res.status(500).json({ error: 'Ошибка получения данных биллинга' });
  }
});

// Получить историю транзакций (Поступления и Списания)
router.get('/billing/history', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    const { type } = req.query; // 'deposit' or 'withdrawal'

    let query = 'SELECT * FROM billing_transactions WHERE restaurant_id = $1';
    const params = [restaurantId];

    if (type) {
      query += ' AND type = $2';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get billing history error:', error);
    res.status(500).json({ error: 'Ошибка получения истории транзакций' });
  }
});
// Обновить статус заказа
router.patch('/orders/:id/status', async (req, res) => {
  const client = await pool.connect();

  try {
    const { status, comment, cancel_reason } = req.body;
    const normalizedStatus = normalizeOrderStatus(status);

    if (!normalizedStatus) {
      return res.status(400).json({ error: 'Статус обязателен' });
    }

    await client.query('BEGIN');

    // Get order and check access
    const orderCheck = await client.query(
      'SELECT o.*, r.is_free_tier FROM orders o JOIN restaurants r ON o.restaurant_id = r.id WHERE o.id = $1',
      [req.params.id]
    );

    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    const oldOrder = orderCheck.rows[0];

    // Check restaurant access for operators
    if (req.user.role !== 'superadmin' && oldOrder.restaurant_id !== req.user.active_restaurant_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Нет доступа к этому заказу' });
    }

    // Check if order is paid (except for cancelled orders)
    if (normalizedStatus !== 'cancelled' && !oldOrder.is_paid && !oldOrder.is_free_tier) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Заказ еще не оплачен (примите его)' });
    }

    const oldOrderStatus = normalizeOrderStatus(oldOrder.status);

    // Update order with cancel_reason and cancelled_at_status if cancelling
    let updateQuery;
    let updateParams;

    if (normalizedStatus === 'cancelled' && cancel_reason) {
      updateQuery = `
        UPDATE orders SET 
          status = $1, 
          processed_by = $2,
          processed_at = CASE WHEN processed_at IS NULL THEN CURRENT_TIMESTAMP ELSE processed_at END,
          cancel_reason = $4,
          cancelled_at_status = $5,
          updated_at = CURRENT_TIMESTAMP 
        WHERE id = $3 
        RETURNING *
      `;
      updateParams = [normalizedStatus, req.user.id, req.params.id, cancel_reason, oldOrderStatus];
    } else {
      updateQuery = `
        UPDATE orders SET 
          status = $1, 
          processed_by = $2,
          processed_at = CASE WHEN processed_at IS NULL THEN CURRENT_TIMESTAMP ELSE processed_at END,
          updated_at = CURRENT_TIMESTAMP 
        WHERE id = $3 
        RETURNING *
      `;
      updateParams = [normalizedStatus, req.user.id, req.params.id];
    }


    const orderResult = await client.query(updateQuery, updateParams);
    const order = orderResult.rows[0];

    // Add status history with cancel reason
    const actorName = req.user.full_name || req.user.username || `user_${req.user.id}`;
    if (oldOrderStatus === 'new' && normalizedStatus === 'preparing') {
      const acceptedExistsResult = await client.query(
        'SELECT 1 FROM order_status_history WHERE order_id = $1 AND status = $2 LIMIT 1',
        [order.id, 'accepted']
      );
      if (!acceptedExistsResult.rows.length) {
        await client.query(
          'INSERT INTO order_status_history (order_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
          [order.id, 'accepted', req.user.id, `Принято в админке: ${actorName}`]
        );
      }
    }

    const historyComment = cancel_reason || comment || `Из админки: ${actorName}`;
    await client.query(
      'INSERT INTO order_status_history (order_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
      [order.id, normalizedStatus, req.user.id, historyComment]
    );

    await client.query('COMMIT');

    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: order.restaurant_id,
      actionType: normalizedStatus === 'cancelled' ? ACTION_TYPES.CANCEL_ORDER : ACTION_TYPES.UPDATE_ORDER_STATUS,
      entityType: ENTITY_TYPES.ORDER,
      entityId: order.id,
      entityName: `Заказ #${order.order_number} `,
      oldValues: { status: oldOrderStatus },
      newValues: { status: normalizedStatus },
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    // Get user telegram_id and restaurant bot token and custom messages, then send notification
    const userResult = await pool.query(
      `SELECT
         u.telegram_id,
         r.telegram_bot_token,
         r.msg_new, r.msg_preparing, r.msg_delivering, r.msg_delivered, r.msg_cancelled,
         pb.full_name AS processed_by_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN users pb ON pb.id = o.processed_by
       LEFT JOIN restaurants r ON r.id = o.restaurant_id
       WHERE o.id = $1
       LIMIT 1`,
      [order.id]
    );

    const orderNotifyRow = userResult.rows[0];
    if (orderNotifyRow?.telegram_id) {
      const customMessages = {
        msg_new: orderNotifyRow.msg_new,
        msg_preparing: orderNotifyRow.msg_preparing,
        msg_delivering: orderNotifyRow.msg_delivering,
        msg_delivered: orderNotifyRow.msg_delivered,
        msg_cancelled: orderNotifyRow.msg_cancelled
      };

      await sendOrderUpdateToUser(
        orderNotifyRow.telegram_id,
        order,
        normalizedStatus,
        orderNotifyRow.telegram_bot_token,
        null, // restaurantPaymentUrls
        customMessages
      );
    }

    try {
      const itemsResult = await pool.query(
        `SELECT oi.*
         FROM order_items oi
         WHERE oi.order_id = $1
         ORDER BY oi.id`,
        [order.id]
      );

      await updateOrderGroupNotification(
        {
          ...order,
          telegram_bot_token: orderNotifyRow?.telegram_bot_token || null
        },
        itemsResult.rows,
        {
          status: normalizedStatus,
          operatorName: orderNotifyRow?.processed_by_name || req.user.full_name || req.user.username || ''
        }
      );
    } catch (groupNotifyError) {
      console.error('Group order notification sync error:', groupNotifyError);
    }

    res.json({
      message: 'Статус заказа обновлен',
      order
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Ошибка обновления статуса' });
  } finally {
    client.release();
  }
});

// Update order items (add, remove, change quantity)
router.put('/orders/:id/items', async (req, res) => {
  const client = await pool.connect();

  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Список товаров обязателен' });
    }

    const orderId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID заказа' });
    }

    const toNumber = (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    await client.query('BEGIN');

    const hasContainerColsResult = await client.query(
      `SELECT COUNT(*)::int AS cnt
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'order_items'
         AND column_name IN ('container_price', 'container_norm')`
    );
    const hasOrderItemContainerColumns = Number(hasContainerColsResult.rows[0]?.cnt || 0) === 2;

    // Get order and check access
    const orderCheck = await client.query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    );

    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    const order = orderCheck.rows[0];

    // Check restaurant access
    if (req.user.role !== 'superadmin' && order.restaurant_id !== req.user.active_restaurant_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Нет доступа к этому заказу' });
    }

    const productIds = [...new Set(
      items
        .map((item) => Number.parseInt(item?.product_id, 10))
        .filter((id) => Number.isFinite(id) && id > 0)
    )];
    const productContainerMap = new Map();
    if (productIds.length > 0) {
      const productContainerResult = await client.query(
        `SELECT
           p.id AS product_id,
           COALESCE(cnt.price, 0) AS container_price,
           COALESCE(NULLIF(p.container_norm, 0), 1) AS container_norm
         FROM products p
         LEFT JOIN containers cnt ON cnt.id = p.container_id
         WHERE p.id = ANY($1::int[])`,
        [productIds]
      );

      for (const row of productContainerResult.rows) {
        productContainerMap.set(Number(row.product_id), {
          container_price: toNumber(row.container_price, 0),
          container_norm: Math.max(1, toNumber(row.container_norm, 1))
        });
      }
    }

    // Delete old items
    await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);

    // Insert new items and recalculate totals exactly like Telegram message
    let itemsSubtotal = 0;
    let containersTotal = 0;
    const normalizedItems = [];

    for (const rawItem of items) {
      const quantity = toNumber(rawItem?.quantity, 0);
      const price = toNumber(rawItem?.price, 0);
      const productName = String(rawItem?.product_name || '').trim();
      const productId = Number.parseInt(rawItem?.product_id, 10);
      const resolvedProductId = Number.isFinite(productId) && productId > 0 ? productId : null;

      if (!productName) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Название товара обязательно' });
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Некорректное количество для "${productName}"` });
      }
      if (!Number.isFinite(price) || price < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Некорректная цена для "${productName}"` });
      }

      const itemTotal = quantity * price;
      itemsSubtotal += itemTotal;

      let containerPrice = toNumber(rawItem?.container_price, 0);
      let containerNorm = Math.max(1, toNumber(rawItem?.container_norm, 1));

      if ((!rawItem?.container_price && !rawItem?.container_norm) && resolvedProductId && productContainerMap.has(resolvedProductId)) {
        const fromProduct = productContainerMap.get(resolvedProductId);
        containerPrice = fromProduct.container_price;
        containerNorm = fromProduct.container_norm;
      }

      const containerUnits = Math.ceil(quantity / Math.max(containerNorm, 1));
      const lineContainerTotal = containerPrice > 0 ? (containerUnits * containerPrice) : 0;
      containersTotal += lineContainerTotal;

      if (hasOrderItemContainerColumns) {
        await client.query(
          `INSERT INTO order_items(order_id, product_id, product_name, quantity, unit, price, total, container_price, container_norm)
           VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [orderId, resolvedProductId, productName, quantity, rawItem?.unit || 'шт', price, itemTotal, containerPrice, containerNorm]
        );
      } else {
        await client.query(
          `INSERT INTO order_items(order_id, product_id, product_name, quantity, unit, price, total)
           VALUES($1, $2, $3, $4, $5, $6, $7)`,
          [orderId, resolvedProductId, productName, quantity, rawItem?.unit || 'шт', price, itemTotal]
        );
      }

      normalizedItems.push({
        product_id: resolvedProductId,
        product_name: productName,
        quantity,
        unit: rawItem?.unit || 'шт',
        price,
        total: itemTotal,
        container_price: containerPrice,
        container_norm: containerNorm
      });
    }

    const serviceFee = toNumber(order.service_fee, 0);
    const deliveryCost = toNumber(order.delivery_cost, 0);
    const newTotal = Math.max(0, itemsSubtotal + containersTotal + serviceFee + deliveryCost);

    // Update order total
    await client.query(
      'UPDATE orders SET total_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newTotal, orderId]
    );

    await client.query('COMMIT');

    // Sync customer/group notifications with updated order composition
    try {
      const orderNotifyResult = await pool.query(
        `SELECT
           o.*,
           u.telegram_id,
           pb.full_name AS processed_by_name,
           r.telegram_bot_token,
           r.click_url,
           r.payme_url,
           r.uzum_url,
           r.xazna_url
         FROM orders o
         LEFT JOIN users u ON u.id = o.user_id
         LEFT JOIN users pb ON pb.id = o.processed_by
         LEFT JOIN restaurants r ON r.id = o.restaurant_id
         WHERE o.id = $1
         LIMIT 1`,
        [orderId]
      );

      const orderNotifyRow = orderNotifyResult.rows[0];
      if (orderNotifyRow) {
        let itemsForNotifyResult;
        if (hasOrderItemContainerColumns) {
          itemsForNotifyResult = await pool.query(
            `SELECT oi.*, COALESCE(p.image_url, '') AS image_url
             FROM order_items oi
             LEFT JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = $1
             ORDER BY oi.id`,
            [orderId]
          );
        } else {
          itemsForNotifyResult = await pool.query(
            `SELECT oi.*, 0::numeric AS container_price, 1::numeric AS container_norm, COALESCE(p.image_url, '') AS image_url
             FROM order_items oi
             LEFT JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = $1
             ORDER BY oi.id`,
            [orderId]
          );
        }

        const normalizedStatus = normalizeOrderStatus(orderNotifyRow.status);

        if (orderNotifyRow.telegram_id) {
          await sendOrderUpdateToUser(
            orderNotifyRow.telegram_id,
            orderNotifyRow,
            normalizedStatus,
            orderNotifyRow.telegram_bot_token,
            {
              click_url: orderNotifyRow.click_url,
              payme_url: orderNotifyRow.payme_url,
              uzum_url: orderNotifyRow.uzum_url,
              xazna_url: orderNotifyRow.xazna_url
            }
          );
        }

        await updateOrderGroupNotification(
          {
            ...orderNotifyRow,
            status: normalizedStatus
          },
          itemsForNotifyResult.rows,
          {
            status: normalizedStatus,
            operatorName: orderNotifyRow.processed_by_name || req.user.full_name || req.user.username || ''
          }
        );
      }
    } catch (syncError) {
      console.error('Order items sync notify warning:', syncError);
    }

    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: order.restaurant_id,
      actionType: ACTION_TYPES.UPDATE_ORDER,
      entityType: ENTITY_TYPES.ORDER,
      entityId: order.id,
      entityName: `Заказ #${order.order_number} `,
      newValues: {
        items_count: items.length,
        items_subtotal: itemsSubtotal,
        containers_total: containersTotal,
        service_fee: serviceFee,
        delivery_cost: deliveryCost,
        total: newTotal
      },
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.json({
      message: 'Товары обновлены',
      total_amount: newTotal,
      breakdown: {
        items_subtotal: itemsSubtotal,
        containers_total: containersTotal,
        service_fee: serviceFee,
        delivery_cost: deliveryCost
      },
      order: {
        id: order.id,
        status: order.status,
        total_amount: newTotal,
        service_fee: serviceFee,
        delivery_cost: deliveryCost,
        delivery_distance_km: toNumber(order.delivery_distance_km, 0)
      },
      items: normalizedItems
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update order items error:', error);
    res.status(500).json({ error: 'Ошибка обновления товаров' });
  } finally {
    client.release();
  }
});

// =====================================================
// ГЛОБАЛЬНЫЕ ТОВАРЫ (шаблоны)
// =====================================================

router.get('/global-products', async (req, res) => {
  try {
    await ensureGlobalProductsSchema();
    const search = toOptionalTrimmedText(req.query.search);
    const barcode = String(req.query.barcode || '').replace(/\D/g, '').slice(0, 120);
    const limit = Math.max(1, Math.min(200, Number.parseInt(req.query.limit, 10) || 120));

    const where = ['gp.is_active = true'];
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(gp.name_ru ILIKE $${params.length} OR gp.name_uz ILIKE $${params.length})`);
    }
    if (barcode) {
      params.push(`%${barcode}%`);
      where.push(`REGEXP_REPLACE(COALESCE(gp.barcode, ''), '\\D', '', 'g') LIKE $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(
      `
        SELECT
          gp.*,
          c.name_ru AS recommended_category_name_ru,
          c.name_uz AS recommended_category_name_uz
        FROM global_products gp
        LEFT JOIN categories c ON c.id = gp.recommended_category_id
        ${whereSql}
        ORDER BY gp.name_ru ASC, gp.id DESC
        LIMIT $${params.length + 1}
      `,
      [...params, limit]
    );

    res.json(result.rows || []);
  } catch (error) {
    console.error('Admin global products error:', error);
    res.status(500).json({ error: 'Ошибка получения глобальных товаров' });
  }
});

router.post('/global-products/import', async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureGlobalProductsSchema();
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) {
      return res.status(400).json({ error: 'Выберите ресторан' });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ error: 'Список товаров пуст' });
    }

    const normalizedItems = [];
    for (const item of items) {
      const globalProductId = Number.parseInt(item?.global_product_id, 10);
      const normalizedPrice = normalizeProductPrice(item?.price, null);
      if (!Number.isFinite(globalProductId) || globalProductId <= 0) continue;
      if (normalizedPrice === null) {
        return res.status(400).json({ error: `Укажите корректную цену для товара #${globalProductId}` });
      }
      const categoryIdParsed = Number.parseInt(item?.category_id, 10);
      normalizedItems.push({
        global_product_id: globalProductId,
        price: normalizedPrice,
        category_id: Number.isFinite(categoryIdParsed) && categoryIdParsed > 0 ? categoryIdParsed : null
      });
    }
    if (!normalizedItems.length) {
      return res.status(400).json({ error: 'Нет корректных товаров для импорта' });
    }

    const globalIds = [...new Set(normalizedItems.map((item) => item.global_product_id))];
    const globalResult = await client.query(
      `
        SELECT *
        FROM global_products
        WHERE id = ANY($1::int[])
          AND is_active = true
      `,
      [globalIds]
    );
    const globalMap = new Map((globalResult.rows || []).map((row) => [Number(row.id), row]));

    for (const item of normalizedItems) {
      if (!globalMap.has(item.global_product_id)) {
        return res.status(400).json({ error: `Глобальный товар #${item.global_product_id} не найден или отключен` });
      }
    }

    await client.query('BEGIN');
    const createdProducts = [];
    for (const item of normalizedItems) {
      const globalProduct = globalMap.get(item.global_product_id);

      const preferredCategoryId = item.category_id || Number.parseInt(globalProduct?.recommended_category_id, 10) || null;
      let validatedCategoryId = preferredCategoryId;
      if (preferredCategoryId) {
        const categoryValidation = await validateProductCategorySelection({ categoryId: preferredCategoryId });
        const categoryValidationWithRestaurant = await validateProductCategorySelection({
          categoryId: preferredCategoryId,
          restaurantId
        });
        if (categoryValidation.ok && categoryValidationWithRestaurant.ok) {
          validatedCategoryId = preferredCategoryId;
        } else if (item.category_id) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `${categoryValidationWithRestaurant.error || categoryValidation.error} (товар: ${globalProduct.name_ru || globalProduct.id})`
          });
        } else {
          validatedCategoryId = null;
        }
      }

      const normalizedImages = normalizeProductImages(globalProduct.product_images);
      const fallbackImageUrl = toOptionalTrimmedText(globalProduct.image_url);
      const fallbackThumbUrl = toOptionalTrimmedText(globalProduct.thumb_url);
      if (normalizedImages.length === 0 && fallbackImageUrl) {
        normalizedImages.push({
          url: fallbackImageUrl,
          ...(fallbackThumbUrl ? { thumb_url: fallbackThumbUrl } : {})
        });
      }
      const mainImage = normalizedImages[0] || null;
      const mediaImageUrl = mainImage?.url || fallbackImageUrl || null;
      const mediaThumbUrl = mainImage?.thumb_url || fallbackThumbUrl || null;

      const globalVariants = normalizeProductVariantOptions(globalProduct.size_options, { fallbackPrice: item.price });
      const sizeEnabled = globalProduct.size_enabled === true && globalVariants.length > 0;
      const normalizedVariants = sizeEnabled
        ? globalVariants.map((variant) => ({
          ...variant,
          price: item.price
        }))
        : [];
      const unit = toOptionalTrimmedText(globalProduct.unit) || 'шт';
      const normalizedOrderStep = normalizeProductOrderStep(globalProduct.order_step, unit, null);

      const insertResult = await client.query(
        `
          INSERT INTO products(
            restaurant_id, category_id, name_ru, name_uz, description_ru, description_uz,
            image_url, thumb_url, product_images, price, unit, order_step, barcode, in_stock, sort_order,
            container_id, container_norm, season_scope, is_hidden_catalog, size_enabled, size_options
          ) VALUES(
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9::jsonb, $10, $11, $12, $13, true, 0,
            NULL, 1, 'all', false, $14, $15::jsonb
          )
          RETURNING id, name_ru
        `,
        [
          restaurantId,
          validatedCategoryId,
          toOptionalTrimmedText(globalProduct.name_ru) || `Глобальный товар #${globalProduct.id}`,
          toOptionalTrimmedText(globalProduct.name_uz) || null,
          toOptionalTrimmedText(globalProduct.description_ru) || null,
          toOptionalTrimmedText(globalProduct.description_uz) || null,
          mediaImageUrl,
          mediaThumbUrl,
          JSON.stringify(normalizedImages),
          item.price,
          unit,
          normalizedOrderStep,
          toOptionalTrimmedText(globalProduct.barcode) || null,
          sizeEnabled,
          JSON.stringify(normalizedVariants)
        ]
      );
      createdProducts.push(insertResult.rows[0]);
    }

    await client.query('COMMIT');
    res.status(201).json({
      message: 'Глобальные товары добавлены в магазин',
      created_count: createdProducts.length,
      items: createdProducts
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Import global products error:', error);
    res.status(500).json({ error: 'Ошибка добавления глобальных товаров' });
  } finally {
    client.release();
  }
});

router.post('/help-instructions/:id/view', async (req, res) => {
  try {
    await ensureHelpInstructionsSchema();
    const instructionId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(instructionId) || instructionId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID инструкции' });
    }

    const updated = await incrementHelpInstructionViewCount(instructionId);
    if (!updated) {
      return res.status(404).json({ error: 'Инструкция не найдена' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Admin increment help instruction views error:', error);
    res.status(500).json({ error: 'Ошибка обновления просмотров инструкции' });
  }
});

// =====================================================
// ТОВАРЫ
// =====================================================
router.post('/products/description-preview', async (req, res) => {
  try {
    if (typeof generateGlobalProductLocalizedText !== 'function') {
      return res.status(503).json({ error: 'AI-генератор временно недоступен' });
    }

    const nameRu = toOptionalTrimmedText(req.body?.name_ru).slice(0, 255);
    const nameUz = toOptionalTrimmedText(req.body?.name_uz).slice(0, 255);

    if (!nameRu && !nameUz) {
      return res.status(400).json({
        error: 'Укажите название товара хотя бы на одном языке (RU или UZ)'
      });
    }

    const generated = await generateGlobalProductLocalizedText({ nameRu, nameUz });
    res.json({
      name_ru: toOptionalTrimmedText(generated?.name_ru || nameRu || nameUz).slice(0, 255),
      name_uz: toOptionalTrimmedText(generated?.name_uz || nameUz || nameRu).slice(0, 255),
      description_ru: toOptionalTrimmedText(generated?.description_ru).slice(0, 1500),
      description_uz: toOptionalTrimmedText(generated?.description_uz).slice(0, 1500),
      provider: toOptionalTrimmedText(generated?.provider || 'local-template')
    });
  } catch (error) {
    console.error('Admin product description preview error:', error);
    const message = toOptionalTrimmedText(error?.message || '');
    const isValidationError = message.toLowerCase().includes('укажите');
    res.status(isValidationError ? 400 : 500).json({
      error: isValidationError ? message : 'Не удалось сгенерировать название и описание товара'
    });
  }
});

// Получить товары (фильтруются по активному ресторану)
router.get('/products', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;

    let query = `
      SELECT p.*, c.name_ru as category_name,
  cnt.name as container_name, cnt.price as container_price
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      LEFT JOIN containers cnt ON p.container_id = cnt.id
      WHERE 1 = 1
  `;
    const params = [];

    if (restaurantId) {
      query += ' AND p.restaurant_id = $1';
      params.push(restaurantId);
    }

    query += ' ORDER BY p.category_id ASC NULLS LAST, COALESCE(p.sort_order, 0) ASC, p.name_ru ASC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Admin products error:', error);
    res.status(500).json({ error: 'Ошибка получения товаров' });
  }
});

// Создать товар
router.post('/products', async (req, res) => {
  try {
    const {
      category_id, name_ru, name_uz, description_ru, description_uz,
      image_url, thumb_url, product_images, price, unit, order_step, barcode, in_stock, sort_order, container_id, container_norm,
      season_scope, is_hidden_catalog, size_enabled, size_options
    } = req.body;

    const restaurantId = req.user.active_restaurant_id;
    const normalizedCategoryId = category_id || null;

    if (!restaurantId) {
      return res.status(400).json({ error: 'Выберите ресторан' });
    }

    const categoryValidation = await validateProductCategorySelection({
      categoryId: normalizedCategoryId,
      restaurantId
    });
    if (!categoryValidation.ok) {
      return res.status(400).json({ error: categoryValidation.error });
    }

    const normalizedSeasonScope = normalizeProductSeasonScope(season_scope, 'all');
    const normalizedContainerNorm = normalizeContainerNorm(container_norm, 1);
    const normalizedOrderStep = normalizeProductOrderStep(order_step, unit || 'шт', null);
    const normalizedSizeEnabled = normalizeOptionalBoolean(size_enabled) === true;
    const normalizedBasePrice = normalizeProductPrice(price, null);
    const normalizedSizeOptions = normalizeProductVariantOptions(size_options, {
      fallbackPrice: normalizedBasePrice
    });
    if (normalizedSizeEnabled) {
      if (normalizedSizeOptions.length === 0) {
        return res.status(400).json({ error: 'Добавьте минимум один вариант товара' });
      }
      const invalidVariant = normalizedSizeOptions.find((variant) => normalizeProductPrice(variant?.price, null) === null);
      if (invalidVariant) {
        return res.status(400).json({ error: `Укажите цену для варианта "${invalidVariant.name || 'без названия'}"` });
      }
    }
    const normalizedPrice = normalizedBasePrice !== null
      ? normalizedBasePrice
      : normalizeProductPrice(normalizedSizeOptions[0]?.price, null);
    const normalizedNames = normalizeProductLocalizedNames(name_ru, name_uz);
    if (!normalizedNames.valid || normalizedPrice === null) {
      return res.status(400).json({ error: 'Название (RU или UZ) и цена обязательны' });
    }
    const normalizedDescriptionRu = toOptionalTrimmedText(description_ru).slice(0, 1500);
    const normalizedDescriptionUz = toOptionalTrimmedText(description_uz).slice(0, 1500);
    const mediaPayload = resolveProductMediaPayload({
      productImages: product_images,
      imageUrl: image_url,
      thumbUrl: thumb_url
    });

    const result = await pool.query(`
      INSERT INTO products(
    restaurant_id, category_id, name_ru, name_uz, description_ru, description_uz,
    image_url, thumb_url, product_images, price, unit, order_step, barcode, in_stock, sort_order, container_id, container_norm, season_scope, is_hidden_catalog,
    size_enabled, size_options
  ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb)
RETURNING *
  `, [
      restaurantId, normalizedCategoryId, normalizedNames.nameRu, normalizedNames.nameUz, normalizedDescriptionRu, normalizedDescriptionUz,
      mediaPayload.imageUrl, mediaPayload.thumbUrl, JSON.stringify(mediaPayload.productImages),
      normalizedPrice, unit || 'шт', normalizedOrderStep, barcode, in_stock !== false, sort_order || 0, container_id || null, normalizedContainerNorm,
      normalizedSeasonScope, !!is_hidden_catalog, normalizedSizeEnabled, JSON.stringify(normalizedSizeOptions)
    ]);

    const product = result.rows[0];

    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId,
      actionType: ACTION_TYPES.CREATE_PRODUCT,
      entityType: ENTITY_TYPES.PRODUCT,
      entityId: product.id,
      entityName: product.name_ru,
      newValues: product,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.status(201).json(product);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Ошибка создания товара' });
  }
});

// Upsert товар (создать или обновить по категории и названию)
router.post('/products/upsert', async (req, res) => {
  try {
    const {
      category_id, name_ru, name_uz, description_ru, description_uz,
      image_url, thumb_url, product_images, price, unit, order_step, barcode, in_stock, sort_order, container_id, container_norm,
      season_scope, is_hidden_catalog, size_enabled, size_options
    } = req.body;

    const restaurantId = req.user.active_restaurant_id;
    const normalizedCategoryId = category_id || null;

    if (!restaurantId) {
      return res.status(400).json({ error: 'Выберите ресторан' });
    }

    const categoryValidation = await validateProductCategorySelection({
      categoryId: normalizedCategoryId,
      restaurantId
    });
    if (!categoryValidation.ok) {
      return res.status(400).json({ error: categoryValidation.error });
    }

    const normalizedSeasonScope = normalizeProductSeasonScope(season_scope, 'all');
    const normalizedContainerNorm = normalizeContainerNorm(container_norm, 1);
    const normalizedOrderStep = normalizeProductOrderStep(order_step, unit || 'шт', null);
    const hasSizeEnabledField = Object.prototype.hasOwnProperty.call(req.body || {}, 'size_enabled');
    const hasSizeOptionsField = Object.prototype.hasOwnProperty.call(req.body || {}, 'size_options');
    const normalizedSizeEnabled = normalizeOptionalBoolean(size_enabled) === true;
    const normalizedBasePrice = normalizeProductPrice(price, null);
    const normalizedSizeOptions = normalizeProductVariantOptions(size_options, {
      fallbackPrice: normalizedBasePrice
    });
    if (normalizedSizeEnabled) {
      if (normalizedSizeOptions.length === 0) {
        return res.status(400).json({ error: 'Добавьте минимум один вариант товара' });
      }
      const invalidVariant = normalizedSizeOptions.find((variant) => normalizeProductPrice(variant?.price, null) === null);
      if (invalidVariant) {
        return res.status(400).json({ error: `Укажите цену для варианта "${invalidVariant.name || 'без названия'}"` });
      }
    }
    const normalizedPrice = normalizedBasePrice !== null
      ? normalizedBasePrice
      : normalizeProductPrice(normalizedSizeOptions[0]?.price, null);
    const normalizedNames = normalizeProductLocalizedNames(name_ru, name_uz);
    if (!normalizedNames.valid || normalizedPrice === null) {
      return res.status(400).json({ error: 'Название (RU или UZ) и цена обязательны' });
    }
    const normalizedDescriptionRu = toOptionalTrimmedText(description_ru).slice(0, 1500);
    const normalizedDescriptionUz = toOptionalTrimmedText(description_uz).slice(0, 1500);
    const hasContainerNorm = container_norm !== undefined && container_norm !== null && String(container_norm).trim() !== '';
    const hasIncomingMediaFields = product_images !== undefined || image_url !== undefined || thumb_url !== undefined;
    const mediaPayload = resolveProductMediaPayload({
      productImages: product_images,
      imageUrl: image_url,
      thumbUrl: thumb_url
    });

    // Проверяем, существует ли товар с таким названием в этой категории (или любой категории если category_id не указан)
    let existingProduct;
    if (normalizedCategoryId) {
      existingProduct = await pool.query(`
        SELECT id FROM products 
        WHERE restaurant_id = $1 
          AND category_id = $2 
          AND LOWER(name_ru) = LOWER($3)
  `, [restaurantId, normalizedCategoryId, normalizedNames.nameRu]);
    } else {
      // Если категория не указана, ищем по названию в любой категории
      existingProduct = await pool.query(`
        SELECT id FROM products 
        WHERE restaurant_id = $1 
          AND LOWER(name_ru) = LOWER($2)
  `, [restaurantId, normalizedNames.nameRu]);
    }

    let result;
    let isUpdate = false;

    if (existingProduct.rows.length > 0) {
      // Обновляем существующий товар
      isUpdate = true;
      const updateFields = ['price = $1', 'unit = $2', 'order_step = $3', 'name_ru = $4', 'name_uz = $5'];
      const updateValues = [normalizedPrice, unit || 'шт', normalizedOrderStep, normalizedNames.nameRu, normalizedNames.nameUz];
      let paramIndex = 6;

      if (normalizedCategoryId) {
        updateFields.push(`category_id = $${paramIndex} `);
        updateValues.push(normalizedCategoryId);
        paramIndex++;
      }
      if (description_ru !== undefined) {
        updateFields.push(`description_ru = $${paramIndex} `);
        updateValues.push(normalizedDescriptionRu);
        paramIndex++;
      }
      if (description_uz !== undefined) {
        updateFields.push(`description_uz = $${paramIndex} `);
        updateValues.push(normalizedDescriptionUz);
        paramIndex++;
      }
      if (hasIncomingMediaFields) {
        updateFields.push(`image_url = $${paramIndex} `);
        updateValues.push(mediaPayload.imageUrl);
        paramIndex++;
        updateFields.push(`thumb_url = $${paramIndex} `);
        updateValues.push(mediaPayload.thumbUrl);
        paramIndex++;
        updateFields.push(`product_images = $${paramIndex}::jsonb`);
        updateValues.push(JSON.stringify(mediaPayload.productImages));
        paramIndex++;
      }
      if (barcode) {
        updateFields.push(`barcode = $${paramIndex} `);
        updateValues.push(barcode);
        paramIndex++;
      }
      if (hasContainerNorm) {
        updateFields.push(`container_norm = $${paramIndex} `);
        updateValues.push(normalizedContainerNorm);
        paramIndex++;
      }
      if (container_id !== undefined) {
        updateFields.push(`container_id = $${paramIndex} `);
        updateValues.push(container_id || null);
        paramIndex++;
      }

      updateFields.push(`in_stock = $${paramIndex} `);
      updateValues.push(in_stock !== false);
      paramIndex++;

      if (season_scope !== undefined) {
        updateFields.push(`season_scope = $${paramIndex} `);
        updateValues.push(normalizedSeasonScope);
        paramIndex++;
      }

      if (is_hidden_catalog !== undefined) {
        updateFields.push(`is_hidden_catalog = $${paramIndex} `);
        updateValues.push(!!is_hidden_catalog);
        paramIndex++;
      }
      if (hasSizeEnabledField) {
        updateFields.push(`size_enabled = $${paramIndex} `);
        updateValues.push(normalizedSizeEnabled);
        paramIndex++;
      }
      if (hasSizeOptionsField) {
        updateFields.push(`size_options = $${paramIndex}::jsonb`);
        updateValues.push(JSON.stringify(normalizedSizeOptions));
        paramIndex++;
      }

      updateValues.push(existingProduct.rows[0].id);

      result = await pool.query(`
        UPDATE products SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
RETURNING *
  `, updateValues);
    } else {
      // Создаем новый товар
      result = await pool.query(`
        INSERT INTO products(
    restaurant_id, category_id, name_ru, name_uz, description_ru, description_uz,
    image_url, thumb_url, product_images, price, unit, order_step, barcode, in_stock, sort_order, container_id, container_norm, season_scope, is_hidden_catalog,
    size_enabled, size_options
  ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb)
RETURNING *
  `, [
        restaurantId, normalizedCategoryId, normalizedNames.nameRu, normalizedNames.nameUz, normalizedDescriptionRu, normalizedDescriptionUz,
        mediaPayload.imageUrl, mediaPayload.thumbUrl, JSON.stringify(mediaPayload.productImages),
        normalizedPrice, unit || 'шт', normalizedOrderStep, barcode, in_stock !== false, sort_order || 0,
        container_id || null, normalizedContainerNorm, normalizedSeasonScope, !!is_hidden_catalog,
        normalizedSizeEnabled, JSON.stringify(normalizedSizeOptions)
      ]);
    }

    const product = result.rows[0];

    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId,
      actionType: isUpdate ? ACTION_TYPES.UPDATE_PRODUCT : ACTION_TYPES.CREATE_PRODUCT,
      entityType: ENTITY_TYPES.PRODUCT,
      entityId: product.id,
      entityName: product.name_ru,
      newValues: product,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.status(isUpdate ? 200 : 201).json({ ...product, isUpdate });
  } catch (error) {
    console.error('Upsert product error:', error);
    res.status(500).json({ error: 'Ошибка создания/обновления товара' });
  }
});

// Обновить товар
router.put('/products/:id', async (req, res) => {
  try {
    const {
      category_id, name_ru, name_uz, description_ru, description_uz,
      image_url, thumb_url, product_images, price, unit, order_step, barcode, in_stock, sort_order, container_id, container_norm,
      season_scope, is_hidden_catalog, size_enabled, size_options
    } = req.body;

    // Get old values and check access
    const oldResult = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    const oldProduct = oldResult.rows[0];

    // Check restaurant access
    if (req.user.role !== 'superadmin' && oldProduct.restaurant_id !== req.user.active_restaurant_id) {
      return res.status(403).json({ error: 'Нет доступа к этому товару' });
    }

    const categoryValidation = await validateProductCategorySelection({
      categoryId: category_id,
      restaurantId: oldProduct.restaurant_id
    });
    if (!categoryValidation.ok) {
      return res.status(400).json({ error: categoryValidation.error });
    }

    const normalizedSeasonScope = normalizeProductSeasonScope(season_scope, oldProduct.season_scope || 'all');
    const normalizedContainerNorm = normalizeContainerNorm(container_norm, normalizeContainerNorm(oldProduct.container_norm, 1));
    const hasSizeEnabledField = Object.prototype.hasOwnProperty.call(req.body || {}, 'size_enabled');
    const hasSizeOptionsField = Object.prototype.hasOwnProperty.call(req.body || {}, 'size_options');
    const normalizedSizeEnabled = hasSizeEnabledField
      ? normalizeOptionalBoolean(size_enabled) === true
      : (oldProduct.size_enabled === true);
    const basePriceFallback = price === undefined
      ? normalizeProductPrice(oldProduct.price, null)
      : normalizeProductPrice(price, null);
    const normalizedSizeOptions = hasSizeOptionsField
      ? normalizeProductVariantOptions(size_options, { fallbackPrice: basePriceFallback })
      : normalizeProductVariantOptions(oldProduct.size_options, { fallbackPrice: basePriceFallback });
    if (normalizedSizeEnabled) {
      if (normalizedSizeOptions.length === 0) {
        return res.status(400).json({ error: 'Добавьте минимум один вариант товара' });
      }
      const invalidVariant = normalizedSizeOptions.find((variant) => normalizeProductPrice(variant?.price, null) === null);
      if (invalidVariant) {
        return res.status(400).json({ error: `Укажите цену для варианта "${invalidVariant.name || 'без названия'}"` });
      }
    }
    const normalizedPrice = basePriceFallback !== null
      ? basePriceFallback
      : normalizeProductPrice(normalizedSizeOptions[0]?.price, null);
    if (normalizedPrice === null) {
      return res.status(400).json({ error: 'Цена должна быть больше 0' });
    }
    const resolvedNameRuSource = name_ru === undefined ? oldProduct.name_ru : name_ru;
    const resolvedNameUzSource = name_uz === undefined ? oldProduct.name_uz : name_uz;
    const normalizedNames = normalizeProductLocalizedNames(resolvedNameRuSource, resolvedNameUzSource);
    if (!normalizedNames.valid) {
      return res.status(400).json({ error: 'Укажите название товара хотя бы на одном языке (RU или UZ)' });
    }
    const normalizedDescriptionRu = toOptionalTrimmedText(description_ru).slice(0, 1500);
    const normalizedDescriptionUz = toOptionalTrimmedText(description_uz).slice(0, 1500);
    const nextUnit = unit === undefined ? (oldProduct.unit || 'шт') : unit;
    const fallbackOrderStep = normalizeProductOrderStep(oldProduct.order_step, nextUnit, null);
    const normalizedOrderStep = order_step === undefined
      ? fallbackOrderStep
      : normalizeProductOrderStep(order_step, nextUnit, null);
    const hasIncomingMediaFields = product_images !== undefined || image_url !== undefined || thumb_url !== undefined;
    const mediaPayload = hasIncomingMediaFields
      ? resolveProductMediaPayload({
        productImages: product_images,
        imageUrl: image_url,
        thumbUrl: thumb_url
      })
      : resolveProductMediaPayload({
        productImages: oldProduct.product_images,
        imageUrl: oldProduct.image_url,
        thumbUrl: oldProduct.thumb_url
      });

    const result = await pool.query(`
      UPDATE products SET
category_id = $1, name_ru = $2, name_uz = $3, description_ru = $4, description_uz = $5,
  image_url = $6, thumb_url = $7, product_images = $8::jsonb, price = $9, unit = $10, order_step = $11, barcode = $12, in_stock = $13, sort_order = $14,
  container_id = $15, container_norm = $16, season_scope = $17, is_hidden_catalog = $18, size_enabled = $19, size_options = $20::jsonb, updated_at = CURRENT_TIMESTAMP
      WHERE id = $21
RETURNING *
  `, [
      category_id, normalizedNames.nameRu, normalizedNames.nameUz, normalizedDescriptionRu, normalizedDescriptionUz,
      mediaPayload.imageUrl, mediaPayload.thumbUrl, JSON.stringify(mediaPayload.productImages),
      normalizedPrice, nextUnit, normalizedOrderStep, barcode, in_stock !== false, sort_order || 0, container_id || null, normalizedContainerNorm,
      normalizedSeasonScope, !!is_hidden_catalog, normalizedSizeEnabled, JSON.stringify(normalizedSizeOptions), req.params.id
    ]);

    const product = result.rows[0];

    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: product.restaurant_id,
      actionType: ACTION_TYPES.UPDATE_PRODUCT,
      entityType: ENTITY_TYPES.PRODUCT,
      entityId: product.id,
      entityName: product.name_ru,
      oldValues: oldProduct,
      newValues: product,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.json(product);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Ошибка обновления товара' });
  }
});

// Удалить товар
router.delete('/products/:id', async (req, res) => {
  try {
    // Get product and check access
    const productResult = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    const product = productResult.rows[0];

    // Check restaurant access
    if (req.user.role !== 'superadmin' && product.restaurant_id !== req.user.active_restaurant_id) {
      return res.status(403).json({ error: 'Нет доступа к этому товару' });
    }

    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);

    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: product.restaurant_id,
      actionType: ACTION_TYPES.DELETE_PRODUCT,
      entityType: ENTITY_TYPES.PRODUCT,
      entityId: product.id,
      entityName: product.name_ru,
      oldValues: product,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.json({ message: 'Товар удален' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Ошибка удаления товара' });
  }
});

// =====================================================
// ПОСУДА / ТАРА (Containers)
// =====================================================

// Получить список посуды
router.get('/containers', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;

    if (!restaurantId) {
      return res.status(400).json({ error: 'Выберите ресторан' });
    }

    const result = await pool.query(
      `SELECT * FROM containers WHERE restaurant_id = $1 ORDER BY sort_order, name`,
      [restaurantId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get containers error:', error);
    res.status(500).json({ error: 'Ошибка получения посуды' });
  }
});

// Создать посуду
router.post('/containers', async (req, res) => {
  try {
    const { name, price, sort_order } = req.body;
    const restaurantId = req.user.active_restaurant_id;

    if (!restaurantId) {
      return res.status(400).json({ error: 'Выберите ресторан' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Название обязательно' });
    }

    const result = await pool.query(`
      INSERT INTO containers(restaurant_id, name, price, sort_order)
VALUES($1, $2, $3, $4)
RETURNING *
  `, [restaurantId, name, price || 0, sort_order || 0]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create container error:', error);
    res.status(500).json({ error: 'Ошибка создания посуды' });
  }
});

// Обновить посуду
router.put('/containers/:id', async (req, res) => {
  try {
    const { name, price, is_active, sort_order } = req.body;
    const restaurantId = req.user.active_restaurant_id;

    // Check access
    const checkResult = await pool.query(
      'SELECT * FROM containers WHERE id = $1',
      [req.params.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Посуда не найдена' });
    }

    if (checkResult.rows[0].restaurant_id !== restaurantId && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const result = await pool.query(`
      UPDATE containers SET
name = COALESCE($1, name),
  price = COALESCE($2, price),
  is_active = COALESCE($3, is_active),
  sort_order = COALESCE($4, sort_order)
      WHERE id = $5
RETURNING *
  `, [name, price, is_active, sort_order, req.params.id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update container error:', error);
    res.status(500).json({ error: 'Ошибка обновления посуды' });
  }
});

// Удалить посуду
router.delete('/containers/:id', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;

    // Check access
    const checkResult = await pool.query(
      'SELECT * FROM containers WHERE id = $1',
      [req.params.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Посуда не найдена' });
    }

    if (checkResult.rows[0].restaurant_id !== restaurantId && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    // Remove container from products first
    await pool.query('UPDATE products SET container_id = NULL WHERE container_id = $1', [req.params.id]);

    await pool.query('DELETE FROM containers WHERE id = $1', [req.params.id]);

    res.json({ message: 'Посуда удалена' });
  } catch (error) {
    console.error('Delete container error:', error);
    res.status(500).json({ error: 'Ошибка удаления посуды' });
  }
});

// =====================================================
// КАТЕГОРИИ
// =====================================================

// Получить категории (фильтруются по активному ресторану)
router.get('/categories', async (req, res) => {
  try {
    const includeInactive = ['1', 'true', 'yes'].includes(
      String(req.query.include_inactive || '').toLowerCase()
    );
    const result = includeInactive
      ? await pool.query('SELECT * FROM categories ORDER BY sort_order, name_ru')
      : await pool.query('SELECT * FROM categories WHERE is_active = true ORDER BY sort_order, name_ru');
    res.json(result.rows);
  } catch (error) {
    console.error('Admin categories error:', error);
    res.status(500).json({ error: 'Ошибка получения категорий' });
  }
});

// Создать категорию
router.post('/categories', async (req, res) => {
  try {
    const { name_ru, name_uz, image_url, sort_order } = req.body;
    const restaurantId = req.user.active_restaurant_id;
    const normalizedNameRu = normalizeCategoryName(name_ru);
    const normalizedNameUz = normalizeCategoryName(name_uz);

    if (!restaurantId) {
      return res.status(400).json({ error: 'Выберите ресторан' });
    }

    if (!normalizedNameRu) {
      return res.status(400).json({ error: 'Название категории обязательно' });
    }

    const conflict = await findAdminCategoryNameConflict({
      parentId: null,
      restaurantId,
      nameRu: normalizedNameRu,
      nameUz: normalizedNameUz
    });
    if (conflict) {
      if (conflict.field === 'name_ru') {
        return res.status(400).json({ error: 'Категория с таким названием RU уже существует на этом уровне' });
      }
      return res.status(400).json({ error: 'Категория с таким названием UZ уже существует на этом уровне' });
    }

    const result = await pool.query(`
      INSERT INTO categories(restaurant_id, name_ru, name_uz, image_url, sort_order)
VALUES($1, $2, $3, $4, $5)
RETURNING *
  `, [restaurantId, normalizedNameRu, normalizedNameUz || null, image_url, sort_order || 0]);

    const category = result.rows[0];

    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId,
      actionType: ACTION_TYPES.CREATE_CATEGORY,
      entityType: ENTITY_TYPES.CATEGORY,
      entityId: category.id,
      entityName: category.name_ru,
      newValues: category,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.status(201).json(category);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Ошибка создания категории' });
  }
});

// Обновить категорию
router.put('/categories/:id', async (req, res) => {
  try {
    const { name_ru, name_uz, image_url, sort_order } = req.body;
    const normalizedNameRu = normalizeCategoryName(name_ru);
    const normalizedNameUz = normalizeCategoryName(name_uz);

    if (!normalizedNameRu) {
      return res.status(400).json({ error: 'Название категории обязательно' });
    }

    // Get old values and check access
    const oldResult = await pool.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    const oldCategory = oldResult.rows[0];

    // Check restaurant access
    if (req.user.role !== 'superadmin' && oldCategory.restaurant_id !== req.user.active_restaurant_id) {
      return res.status(403).json({ error: 'Нет доступа к этой категории' });
    }

    const conflict = await findAdminCategoryNameConflict({
      parentId: oldCategory.parent_id ?? null,
      restaurantId: oldCategory.restaurant_id,
      nameRu: normalizedNameRu,
      nameUz: normalizedNameUz,
      excludeId: Number.parseInt(req.params.id, 10)
    });
    if (conflict) {
      if (conflict.field === 'name_ru') {
        return res.status(400).json({ error: 'Категория с таким названием RU уже существует на этом уровне' });
      }
      return res.status(400).json({ error: 'Категория с таким названием UZ уже существует на этом уровне' });
    }

    const result = await pool.query(`
      UPDATE categories SET
name_ru = $1, name_uz = $2, image_url = $3, sort_order = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
RETURNING *
  `, [normalizedNameRu, normalizedNameUz || null, image_url, sort_order || 0, req.params.id]);

    const category = result.rows[0];

    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: category.restaurant_id,
      actionType: ACTION_TYPES.UPDATE_CATEGORY,
      entityType: ENTITY_TYPES.CATEGORY,
      entityId: category.id,
      entityName: category.name_ru,
      oldValues: oldCategory,
      newValues: category,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.json(category);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Ошибка обновления категории' });
  }
});

// Удалить категорию
router.delete('/categories/:id', async (req, res) => {
  try {
    // Get category and check access
    const categoryResult = await pool.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    const category = categoryResult.rows[0];

    // Check restaurant access
    if (req.user.role !== 'superadmin' && category.restaurant_id !== req.user.active_restaurant_id) {
      return res.status(403).json({ error: 'Нет доступа к этой категории' });
    }

    // Check for products in category
    const productsCheck = await pool.query(
      'SELECT COUNT(*) as count FROM products WHERE category_id = $1',
      [req.params.id]
    );

    if (parseInt(productsCheck.rows[0].count) > 0) {
      return res.status(400).json({
        error: 'Нельзя удалить категорию, в которой есть товары. Сначала удалите или переместите товары.'
      });
    }

    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);

    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: category.restaurant_id,
      actionType: ACTION_TYPES.DELETE_CATEGORY,
      entityType: ENTITY_TYPES.CATEGORY,
      entityId: category.id,
      entityName: category.name_ru,
      oldValues: category,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.json({ message: 'Категория удалена' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Ошибка удаления категории' });
  }
});

// =====================================================
// СТАТИСТИКА
// =====================================================

router.get('/stats', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;

    let whereClause = '';
    const params = [];

    if (restaurantId) {
      whereClause = 'WHERE restaurant_id = $1';
      params.push(restaurantId);
    }

    const stats = await pool.query(`
SELECT
  (SELECT COUNT(*) FROM orders ${whereClause} AND status = 'new') as new_orders,
  (SELECT COUNT(*) FROM orders ${whereClause} AND (status = 'preparing' OR status = 'in_progress')) as preparing_orders,
    (SELECT COUNT(*) FROM orders ${whereClause} AND status = 'delivering') as delivering_orders,
      (SELECT COUNT(*) FROM orders ${whereClause} AND DATE(created_at) = CURRENT_DATE) as today_orders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders ${whereClause} AND DATE(created_at) = CURRENT_DATE) as today_revenue,
          (SELECT COUNT(*) FROM products ${whereClause.replace('restaurant_id', 'restaurant_id')}) as products_count,
            (SELECT COUNT(*) FROM categories ${whereClause.replace('restaurant_id', 'restaurant_id')}) as categories_count
              `.replace(/\$1/g, restaurantId ? '$1' : '0'), params.length ? params : []);

    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// =====================================================
// РАССЫЛКА УВЕДОМЛЕНИЙ
// =====================================================

// Send broadcast message to all customers of the restaurant
// Schedule a broadcast or send immediately
router.post('/broadcast', async (req, res) => {
  try {
    await ensureBroadcastSchema();
    const { message, image_url, video_url, scheduled_at, recurrence, repeat_days } = req.body;
    const normalizedMessage = toOptionalTrimmedText(message);
    const normalizedImageUrl = toOptionalTrimmedText(image_url) || null;
    const normalizedVideoUrl = toOptionalTrimmedText(video_url) || null;

    if (!normalizedMessage) {
      return res.status(400).json({ error: 'Текст сообщения обязателен' });
    }
    if (normalizedImageUrl && normalizedVideoUrl) {
      return res.status(400).json({ error: 'Можно выбрать только один тип медиа: фото или видео' });
    }

    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) {
      return res.status(400).json({ error: 'Не выбран ресторан' });
    }

    // IF SCHEDULED
    if (scheduled_at) {
      const result = await pool.query(`
        INSERT INTO scheduled_broadcasts(restaurant_id, user_id, message, image_url, video_url, scheduled_at, recurrence, repeat_days)
VALUES($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *
  `, [restaurantId, req.user.id, normalizedMessage, normalizedImageUrl, normalizedVideoUrl, scheduled_at, recurrence || 'none', repeat_days || null]);

      return res.json({
        message: 'Рассылка запланирована',
        broadcast: result.rows[0]
      });
    }

    // IMMEDIATE BROADCAST (Original logic)
    // Get restaurant info and bot token
    const restaurantResult = await pool.query(
      'SELECT name, telegram_bot_token FROM restaurants WHERE id = $1',
      [restaurantId]
    );

    if (restaurantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    const restaurant = restaurantResult.rows[0];
    const botToken = restaurant.telegram_bot_token;

    if (!botToken) {
      return res.status(400).json({ error: 'Telegram бот не настроен для этого ресторана. Добавьте токен бота в настройках.' });
    }

    // Get all customers who have interacted with this restaurant
    const customersResult = await pool.query(`
      SELECT DISTINCT u.telegram_id, u.full_name
      FROM users u
      WHERE u.telegram_id IS NOT NULL 
        AND u.is_active = true
        AND u.role = 'customer'
AND(
  u.active_restaurant_id = $1
          OR u.id IN(SELECT DISTINCT user_id FROM orders WHERE restaurant_id = $1)
          OR u.id IN(SELECT DISTINCT user_id FROM user_restaurants WHERE restaurant_id = $1)
)
  `, [restaurantId]);

    const customers = customersResult.rows;

    if (customers.length === 0) {
      return res.status(400).json({ error: 'Нет клиентов для рассылки' });
    }

    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(botToken);

    // Create history record
    const historyResult = await pool.query(`
      INSERT INTO broadcast_history(restaurant_id, user_id, message, image_url, video_url)
VALUES($1, $2, $3, $4, $5)
      RETURNING id
    `, [restaurantId, req.user.id, normalizedMessage, normalizedImageUrl, normalizedVideoUrl]);
    const broadcastHistoryId = historyResult.rows[0].id;

    // Send messages
    let sent = 0;
    let failed = 0;

    const broadcastMessage = `📢 <b>${restaurant.name}</b>\n\n${normalizedMessage} `;
    const errors = [];

    for (const customer of customers) {
      try {
        let sentMsg;
        if (normalizedVideoUrl) {
          sentMsg = await bot.sendVideo(customer.telegram_id, normalizedVideoUrl, {
            caption: broadcastMessage,
            parse_mode: 'HTML'
          });
        } else if (normalizedImageUrl) {
          sentMsg = await bot.sendPhoto(customer.telegram_id, normalizedImageUrl, {
            caption: broadcastMessage,
            parse_mode: 'HTML'
          });
        } else {
          sentMsg = await bot.sendMessage(customer.telegram_id, broadcastMessage, {
            parse_mode: 'HTML'
          });
        }

        if (sentMsg && sentMsg.message_id) {
          await pool.query(`
            INSERT INTO broadcast_sent_messages(broadcast_history_id, chat_id, message_id)
VALUES($1, $2, $3)
          `, [broadcastHistoryId, customer.telegram_id, sentMsg.message_id]);
        }

        sent++;
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (err) {
        console.error(`Failed to send to ${customer.telegram_id} (${customer.full_name}): `, err.message);
        errors.push({ user: customer.full_name, error: err.message });
        failed++;
      }
    }

    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: restaurantId,
      actionType: 'broadcast',
      entityType: 'notification',
      entityId: null,
      entityName: 'Рассылка',
      newValues: {
        message: normalizedMessage,
        image_url: normalizedImageUrl,
        video_url: normalizedVideoUrl,
        sent,
        failed,
        total: customers.length,
        errors
      },
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.json({
      message: 'Рассылка завершена',
      sent,
      failed,
      total: customers.length,
      errors: errors.slice(0, 5)
    });
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ error: 'Ошибка рассылки: ' + error.message });
  }
});

// GET scheduled broadcasts
router.get('/scheduled-broadcasts', async (req, res) => {
  try {
    await ensureBroadcastSchema();
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) {
      return res.status(400).json({ error: 'Не выбран ресторан' });
    }

    const result = await pool.query(`
      SELECT sb.*, u.full_name as creator_name
      FROM scheduled_broadcasts sb
      LEFT JOIN users u ON sb.user_id = u.id
      WHERE sb.restaurant_id = $1
      ORDER BY sb.scheduled_at ASC
  `, [restaurantId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get scheduled broadcasts error:', error);
    res.status(500).json({ error: 'Ошибка получения запланированных рассылок' });
  }
});

// DELETE scheduled broadcast
router.delete('/scheduled-broadcasts/:id', async (req, res) => {
  try {
    await ensureBroadcastSchema();
    const restaurantId = req.user.active_restaurant_id;
    const result = await pool.query(
      'DELETE FROM scheduled_broadcasts WHERE id = $1 AND (restaurant_id = $2 OR $3 = true)',
      [req.params.id, restaurantId, req.user.role === 'superadmin']
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Расписание не найдено' });
    }

    res.json({ message: 'Запланированная рассылка удалена' });
  } catch (error) {
    console.error('Delete scheduled broadcast error:', error);
    res.status(500).json({ error: 'Ошибка удаления расписания' });
  }
});

// TOGGLE scheduled broadcast
router.patch('/scheduled-broadcasts/:id/toggle', async (req, res) => {
  try {
    await ensureBroadcastSchema();
    const restaurantId = req.user.active_restaurant_id;
    const result = await pool.query(`
      UPDATE scheduled_broadcasts 
      SET is_active = NOT is_active 
      WHERE id = $1 AND(restaurant_id = $2 OR $3 = true)
RETURNING *
  `, [req.params.id, restaurantId, req.user.role === 'superadmin']);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Расписание не найдено' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Toggle scheduled broadcast error:', error);
    res.status(500).json({ error: 'Ошибка изменения статуса расписания' });
  }
});

// UPDATE scheduled broadcast
router.put('/scheduled-broadcasts/:id', async (req, res) => {
  try {
    await ensureBroadcastSchema();
    const { message, image_url, video_url, scheduled_at, recurrence, repeat_days } = req.body;
    const normalizedMessage = toOptionalTrimmedText(message);
    const normalizedImageUrl = toOptionalTrimmedText(image_url) || null;
    const normalizedVideoUrl = toOptionalTrimmedText(video_url) || null;
    if (!normalizedMessage) {
      return res.status(400).json({ error: 'Текст сообщения обязателен' });
    }
    if (normalizedImageUrl && normalizedVideoUrl) {
      return res.status(400).json({ error: 'Можно выбрать только один тип медиа: фото или видео' });
    }
    const restaurantId = req.user.active_restaurant_id;

    const result = await pool.query(`
      UPDATE scheduled_broadcasts 
      SET message = $1, image_url = $2, video_url = $3, scheduled_at = $4, recurrence = $5, repeat_days = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7 AND(restaurant_id = $8 OR $9 = true)
RETURNING *
  `, [normalizedMessage, normalizedImageUrl, normalizedVideoUrl, scheduled_at, recurrence, repeat_days, req.params.id, restaurantId, req.user.role === 'superadmin']);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Расписание не найдено' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update scheduled broadcast error:', error);
    res.status(500).json({ error: 'Ошибка обновления расписания' });
  }
});

// GET broadcast history
router.get('/broadcast-history', async (req, res) => {
  try {
    await ensureBroadcastSchema();
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) return res.status(400).json({ error: 'Не выбран ресторан' });

    const result = await pool.query(`
      SELECT bh.*, u.full_name as creator_name,
  (SELECT COUNT(*) FROM broadcast_sent_messages WHERE broadcast_history_id = bh.id) as messages_count
      FROM broadcast_history bh
      LEFT JOIN users u ON bh.user_id = u.id
      WHERE bh.restaurant_id = $1
      ORDER BY bh.sent_at DESC
      LIMIT 50
  `, [restaurantId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get broadcast history error:', error);
    res.status(500).json({ error: 'Ошибка получения истории' });
  }
});

// DELETE broadcast history item and REMOVE messages from Telegram
router.post('/broadcast-history/:id/delete-remote', async (req, res) => {
  try {
    await ensureBroadcastSchema();
    const restaurantId = req.user.active_restaurant_id;

    // Check access and get history info
    const historyResult = await pool.query(`
      SELECT bh.*, r.telegram_bot_token
      FROM broadcast_history bh
      JOIN restaurants r ON bh.restaurant_id = r.id
      WHERE bh.id = $1 AND(bh.restaurant_id = $2 OR $3 = true)
    `, [req.params.id, restaurantId, req.user.role === 'superadmin']);

    if (historyResult.rows.length === 0) {
      return res.status(404).json({ error: 'История не найдена' });
    }

    const { telegram_bot_token } = historyResult.rows[0];
    if (!telegram_bot_token) {
      return res.status(400).json({ error: 'Бот не настроен, невозможно удалить сообщения' });
    }

    // Get all sent messages IDs
    const messagesResult = await pool.query(
      'SELECT chat_id, message_id FROM broadcast_sent_messages WHERE broadcast_history_id = $1',
      [req.params.id]
    );

    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(telegram_bot_token);

    let deletedCount = 0;
    for (const msg of messagesResult.rows) {
      try {
        await bot.deleteMessage(msg.chat_id, msg.message_id);
        deletedCount++;
      } catch (e) {
        console.warn(`Failed to delete message ${msg.message_id} in chat ${msg.chat_id}: `, e.message);
      }
    }

    // Delete record from DB
    await pool.query('DELETE FROM broadcast_history WHERE id = $1', [req.params.id]);

    res.json({ message: 'Сообщения удалены', deleted: deletedCount });
  } catch (error) {
    console.error('Delete remote broadcast error:', error);
    res.status(500).json({ error: 'Ошибка удаления сообщений: ' + error.message });
  }
});

// Get funnel analytics (day/month/year) (bot onboarding + ads)
router.get('/analytics/funnel', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) {
      return res.status(400).json({ error: 'Выберите ресторан' });
    }

    const funnelRange = resolveFunnelAnalyticsRange(req.query);
    const dateKey = funnelRange.dateKey;
    const startDateKey = funnelRange.startDateKey;
    const endDateKeyExclusive = funnelRange.endDateKeyExclusive;

    await ensureBotFunnelSchema().catch(() => {});

    let botFunnelRow = null;
    try {
      const botFunnelResult = await pool.query(
        `
        WITH events AS (
          SELECT
            user_telegram_id::text AS tg,
            event_type
          FROM bot_funnel_events
          WHERE restaurant_id = $1
            AND user_telegram_id IS NOT NULL
            AND created_at >= $2::date
            AND created_at < $3::date
        ),
        started AS (
          SELECT DISTINCT tg FROM events WHERE event_type = 'start'
        ),
        language_selected AS (
          SELECT DISTINCT tg FROM events WHERE event_type = 'language_selected'
        ),
        contact_shared AS (
          SELECT DISTINCT tg FROM events WHERE event_type = 'contact_shared'
        ),
        name_entered AS (
          SELECT DISTINCT tg FROM events WHERE event_type = 'name_entered'
        ),
        location_shared AS (
          SELECT DISTINCT tg FROM events WHERE event_type = 'location_shared'
        ),
        registration_events AS (
          SELECT DISTINCT tg FROM events WHERE event_type = 'registration_completed'
        ),
        period_order_users AS (
          SELECT DISTINCT u.telegram_id::text AS tg
          FROM orders o
          JOIN users u ON u.id = o.user_id
          WHERE o.restaurant_id = $1
            AND o.created_at >= $2::date
            AND o.created_at < $3::date
            AND u.telegram_id IS NOT NULL
        ),
        registered_users_from_db AS (
          SELECT DISTINCT u.telegram_id::text AS tg
          FROM users u
          WHERE u.role = 'customer'
            AND u.telegram_id IS NOT NULL
            AND u.created_at >= $2::date
            AND u.created_at < $3::date
            AND (
              EXISTS (
                SELECT 1
                FROM user_restaurants ur
                WHERE ur.user_id = u.id
                  AND ur.restaurant_id = $1
              )
              OR EXISTS (
                SELECT 1
                FROM orders o_hist
                WHERE o_hist.user_id = u.id
                  AND o_hist.restaurant_id = $1
              )
            )
        ),
        registration_completed AS (
          SELECT tg FROM registration_events
          UNION
          SELECT tg FROM registered_users_from_db
        )
        SELECT
          (SELECT COUNT(*)::int FROM started) AS started_users,
          (SELECT COUNT(*)::int FROM language_selected) AS language_selected_users,
          (SELECT COUNT(*)::int FROM contact_shared) AS contact_shared_users,
          (SELECT COUNT(*)::int FROM name_entered) AS name_entered_users,
          (SELECT COUNT(*)::int FROM location_shared) AS location_shared_users,
          (SELECT COUNT(*)::int FROM registration_completed) AS registration_completed_users,
          (SELECT COUNT(*)::int FROM registered_users_from_db) AS registered_users_from_db,
          (SELECT COUNT(*)::int FROM period_order_users) AS order_users_total,
          (SELECT COUNT(*)::int FROM started s JOIN period_order_users d ON d.tg = s.tg) AS started_with_order_users,
          (SELECT COUNT(*)::int FROM registration_completed r JOIN period_order_users d ON d.tg = r.tg) AS registered_with_order_users,
          (
            SELECT COUNT(*)::int
            FROM orders o
            WHERE o.restaurant_id = $1
              AND o.created_at >= $2::date
              AND o.created_at < $3::date
          ) AS orders_total
        `,
        [restaurantId, startDateKey, endDateKeyExclusive]
      );
      botFunnelRow = botFunnelResult.rows[0] || null;
    } catch (error) {
      if (error.code !== '42P01') throw error;
    }

    let adFunnelRow = null;
    try {
      const adFunnelResult = await pool.query(
        `
        WITH events AS (
          SELECT
            event_type,
            user_id,
            COALESCE(user_id::text, NULLIF(viewer_key, ''), NULLIF(ip_address, '')) AS viewer_id
          FROM ad_banner_events
          WHERE restaurant_id = $1
            AND created_at >= $2::date
            AND created_at < $3::date
        ),
        click_users AS (
          SELECT DISTINCT user_id
          FROM events
          WHERE event_type = 'click'
            AND user_id IS NOT NULL
        ),
        order_users AS (
          SELECT DISTINCT user_id
          FROM orders
          WHERE restaurant_id = $1
            AND created_at >= $2::date
            AND created_at < $3::date
        )
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'view')::int AS views,
          COUNT(DISTINCT viewer_id) FILTER (WHERE event_type = 'view' AND viewer_id IS NOT NULL)::int AS unique_views,
          COUNT(*) FILTER (WHERE event_type = 'click')::int AS clicks,
          COUNT(DISTINCT viewer_id) FILTER (WHERE event_type = 'click' AND viewer_id IS NOT NULL)::int AS unique_clicks,
          (
            SELECT COUNT(*)::int
            FROM click_users c
            JOIN order_users o ON o.user_id = c.user_id
          ) AS click_to_order_users
        FROM events
        `,
        [restaurantId, startDateKey, endDateKeyExclusive]
      );
      adFunnelRow = adFunnelResult.rows[0] || null;
    } catch (error) {
      if (error.code !== '42P01') throw error;
    }

    const toInt = (value) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const startedUsers = toInt(botFunnelRow?.started_users);
    const languageSelectedUsers = toInt(botFunnelRow?.language_selected_users);
    const contactSharedUsers = toInt(botFunnelRow?.contact_shared_users);
    const nameEnteredUsers = toInt(botFunnelRow?.name_entered_users);
    const locationSharedUsers = toInt(botFunnelRow?.location_shared_users);
    const registrationCompletedUsers = toInt(botFunnelRow?.registration_completed_users);
    const registeredUsersFromDb = toInt(botFunnelRow?.registered_users_from_db);
    const startedWithOrderUsers = toInt(botFunnelRow?.started_with_order_users);
    const registeredWithOrderUsers = toInt(botFunnelRow?.registered_with_order_users);
    const orderUsersTotal = toInt(botFunnelRow?.order_users_total);
    const ordersTotal = toInt(botFunnelRow?.orders_total);

    const noLanguageAfterStart = Math.max(0, startedUsers - languageSelectedUsers);
    const noPhoneAfterLanguage = Math.max(0, languageSelectedUsers - contactSharedUsers);
    const noRegistrationAfterPhone = Math.max(0, contactSharedUsers - registrationCompletedUsers);
    const noOrderAfterRegistration = Math.max(0, registrationCompletedUsers - registeredWithOrderUsers);

    const adViews = toInt(adFunnelRow?.views);
    const adUniqueViews = toInt(adFunnelRow?.unique_views);
    const adClicks = toInt(adFunnelRow?.clicks);
    const adUniqueClicks = toInt(adFunnelRow?.unique_clicks);
    const adClickToOrderUsers = toInt(adFunnelRow?.click_to_order_users);

    res.json({
      period: funnelRange.period,
      date: dateKey,
      startDate: startDateKey,
      endDateExclusive: endDateKeyExclusive,
      year: funnelRange.year,
      month: funnelRange.month,
      timezone: ANALYTICS_TIMEZONE,
      bot: {
        startedUsers,
        languageSelectedUsers,
        contactSharedUsers,
        nameEnteredUsers,
        locationSharedUsers,
        registrationCompletedUsers,
        legacyRegisteredUsers: registeredUsersFromDb,
        registeredUsersFromDb,
        startedWithOrderUsers,
        registeredWithOrderUsers,
        orderUsersTotal,
        ordersTotal,
        noLanguageAfterStart,
        noPhoneAfterLanguage,
        noRegistrationAfterPhone,
        noOrderAfterRegistration,
        conversionStartToRegistration: ratioPercent(registrationCompletedUsers, startedUsers),
        conversionStartToOrder: ratioPercent(startedWithOrderUsers, startedUsers),
        conversionRegistrationToOrder: ratioPercent(registeredWithOrderUsers, registrationCompletedUsers)
      },
      ads: {
        views: adViews,
        uniqueViews: adUniqueViews,
        clicks: adClicks,
        uniqueClicks: adUniqueClicks,
        clickToOrderUsers: adClickToOrderUsers,
        ctrByViews: ratioPercent(adClicks, adViews),
        ctrByUniqueViews: ratioPercent(adUniqueClicks, adUniqueViews),
        clickToOrderRate: ratioPercent(adClickToOrderUsers, adUniqueClicks)
      }
    });
  } catch (error) {
    console.error('Funnel analytics error:', error);
    res.status(500).json({ error: 'Ошибка получения воронки аналитики' });
  }
});

router.get('/analytics/product-reviews', async (req, res) => {
  try {
    const restaurantId = Number.parseInt(req.user?.active_restaurant_id, 10);
    if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
      return res.status(400).json({ error: 'Выберите ресторан' });
    }

    const analyticsRange = resolveFunnelAnalyticsRange(req.query || {});
    const requestedCommentsLimit = Number.parseInt(req.query.limit, 10);
    const commentsLimit = Number.isFinite(requestedCommentsLimit)
      ? Math.min(Math.max(requestedCommentsLimit, 1), 100)
      : 30;
    const requestedTopLimit = Number.parseInt(req.query.top_limit, 10);
    const topLimit = Number.isFinite(requestedTopLimit)
      ? Math.min(Math.max(requestedTopLimit, 1), 30)
      : 10;

    await ensureProductReviewsSchema().catch(() => {});

    let summaryRow = {
      total_reviews: 0,
      comments_count: 0,
      low_rating_count: 0,
      average_rating: 0,
      rating_1_count: 0,
      rating_2_count: 0,
      rating_3_count: 0,
      rating_4_count: 0,
      rating_5_count: 0
    };
    let latestComments = [];
    let topProducts = [];

    try {
      const [summaryResult, latestCommentsResult, topProductsResult] = await Promise.all([
        pool.query(
          `
          SELECT
            COUNT(*)::int AS total_reviews,
            COUNT(*) FILTER (WHERE NULLIF(BTRIM(COALESCE(pr.comment, '')), '') IS NOT NULL)::int AS comments_count,
            COUNT(*) FILTER (WHERE pr.rating <= 2)::int AS low_rating_count,
            ROUND(COALESCE(AVG(pr.rating)::numeric, 0), 2)::float AS average_rating,
            COUNT(*) FILTER (WHERE pr.rating = 1)::int AS rating_1_count,
            COUNT(*) FILTER (WHERE pr.rating = 2)::int AS rating_2_count,
            COUNT(*) FILTER (WHERE pr.rating = 3)::int AS rating_3_count,
            COUNT(*) FILTER (WHERE pr.rating = 4)::int AS rating_4_count,
            COUNT(*) FILTER (WHERE pr.rating = 5)::int AS rating_5_count
          FROM product_reviews pr
          JOIN products p ON p.id = pr.product_id
          WHERE p.restaurant_id = $1
            AND pr.is_deleted = false
            AND pr.created_at >= $2::date
            AND pr.created_at < $3::date
          `,
          [restaurantId, analyticsRange.startDateKey, analyticsRange.endDateKeyExclusive]
        ),
        pool.query(
          `
          SELECT
            pr.id,
            pr.product_id,
            COALESCE(NULLIF(BTRIM(p.name_ru), ''), NULLIF(BTRIM(p.name_uz), ''), CONCAT('#', p.id::text)) AS product_name,
            pr.rating,
            pr.comment,
            pr.created_at,
            pr.user_id,
            COALESCE(NULLIF(BTRIM(u.full_name), ''), NULLIF(BTRIM(u.username), ''), 'Клиент') AS author_name
          FROM product_reviews pr
          JOIN products p ON p.id = pr.product_id
          LEFT JOIN users u ON u.id = pr.user_id
          WHERE p.restaurant_id = $1
            AND pr.is_deleted = false
            AND pr.created_at >= $2::date
            AND pr.created_at < $3::date
            AND NULLIF(BTRIM(COALESCE(pr.comment, '')), '') IS NOT NULL
          ORDER BY pr.created_at DESC, pr.id DESC
          LIMIT $4
          `,
          [restaurantId, analyticsRange.startDateKey, analyticsRange.endDateKeyExclusive, commentsLimit]
        ),
        pool.query(
          `
          SELECT
            pr.product_id,
            COALESCE(NULLIF(BTRIM(p.name_ru), ''), NULLIF(BTRIM(p.name_uz), ''), CONCAT('#', p.id::text)) AS product_name,
            COUNT(*)::int AS total_reviews,
            COUNT(*) FILTER (WHERE NULLIF(BTRIM(COALESCE(pr.comment, '')), '') IS NOT NULL)::int AS comments_count,
            ROUND(COALESCE(AVG(pr.rating)::numeric, 0), 2)::float AS average_rating
          FROM product_reviews pr
          JOIN products p ON p.id = pr.product_id
          WHERE p.restaurant_id = $1
            AND pr.is_deleted = false
            AND pr.created_at >= $2::date
            AND pr.created_at < $3::date
          GROUP BY pr.product_id, p.id, p.name_ru, p.name_uz
          ORDER BY comments_count DESC, total_reviews DESC, average_rating DESC
          LIMIT $4
          `,
          [restaurantId, analyticsRange.startDateKey, analyticsRange.endDateKeyExclusive, topLimit]
        )
      ]);

      summaryRow = summaryResult.rows?.[0] || summaryRow;
      latestComments = latestCommentsResult.rows || [];
      topProducts = topProductsResult.rows || [];
    } catch (error) {
      if (error.code !== '42P01') throw error;
    }

    res.json({
      period: analyticsRange.period,
      date: analyticsRange.dateKey,
      startDate: analyticsRange.startDateKey,
      endDateExclusive: analyticsRange.endDateKeyExclusive,
      year: analyticsRange.year,
      month: analyticsRange.month,
      timezone: ANALYTICS_TIMEZONE,
      summary: {
        totalReviews: Number.parseInt(summaryRow.total_reviews, 10) || 0,
        commentsCount: Number.parseInt(summaryRow.comments_count, 10) || 0,
        lowRatingCount: Number.parseInt(summaryRow.low_rating_count, 10) || 0,
        averageRating: Number(summaryRow.average_rating || 0),
        ratingBreakdown: {
          1: Number.parseInt(summaryRow.rating_1_count, 10) || 0,
          2: Number.parseInt(summaryRow.rating_2_count, 10) || 0,
          3: Number.parseInt(summaryRow.rating_3_count, 10) || 0,
          4: Number.parseInt(summaryRow.rating_4_count, 10) || 0,
          5: Number.parseInt(summaryRow.rating_5_count, 10) || 0
        }
      },
      latestComments: latestComments.map((row) => ({
        id: Number.parseInt(row.id, 10) || 0,
        productId: Number.parseInt(row.product_id, 10) || 0,
        productName: row.product_name || 'Товар',
        rating: Number.parseInt(row.rating, 10) || 0,
        comment: row.comment || '',
        createdAt: row.created_at || null,
        userId: Number.parseInt(row.user_id, 10) || null,
        authorName: row.author_name || 'Клиент'
      })),
      topProducts: topProducts.map((row) => ({
        productId: Number.parseInt(row.product_id, 10) || 0,
        productName: row.product_name || 'Товар',
        totalReviews: Number.parseInt(row.total_reviews, 10) || 0,
        commentsCount: Number.parseInt(row.comments_count, 10) || 0,
        averageRating: Number(row.average_rating || 0)
      }))
    });
  } catch (error) {
    console.error('Product review analytics error:', error);
    res.status(500).json({ error: 'Ошибка получения аналитики отзывов' });
  }
});

// Get yearly analytics with monthly breakdown
router.get('/analytics/yearly', async (req, res) => {
  try {
    const { year } = req.query;
    const selectedYear = parseInt(year) || new Date().getFullYear();
    const restaurantId = req.user.active_restaurant_id;

    if (!restaurantId) {
      return res.status(400).json({ error: 'Выберите ресторан' });
    }

    // Get monthly revenue and orders count for delivered orders
    const monthlyStats = await pool.query(`
SELECT
EXTRACT(MONTH FROM created_at) as month,
  COUNT(*) as orders_count,
  COALESCE(SUM(total_amount), 0) as revenue
      FROM orders
      WHERE restaurant_id = $1 
        AND EXTRACT(YEAR FROM created_at) = $2
        AND status = 'delivered'
      GROUP BY EXTRACT(MONTH FROM created_at)
      ORDER BY month
  `, [restaurantId, selectedYear]);

    // Create array for all 12 months
    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      orders_count: 0,
      revenue: 0
    }));

    // Fill with actual data
    monthlyStats.rows.forEach(row => {
      const idx = parseInt(row.month) - 1;
      monthlyData[idx] = {
        month: parseInt(row.month),
        orders_count: parseInt(row.orders_count),
        revenue: parseFloat(row.revenue)
      };
    });

    // Calculate totals and average check
    const totalRevenue = monthlyData.reduce((sum, m) => sum + m.revenue, 0);
    const totalOrders = monthlyData.reduce((sum, m) => sum + m.orders_count, 0);
    const averageCheck = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    // Get top 5 products for each month
    const topProductsResult = await pool.query(`
      WITH monthly_products AS(
    SELECT 
          EXTRACT(MONTH FROM o.created_at) as month,
    oi.product_name,
    SUM(oi.quantity) as total_quantity,
    SUM(oi.quantity * oi.price) as total_revenue,
    ROW_NUMBER() OVER(
      PARTITION BY EXTRACT(MONTH FROM o.created_at) 
            ORDER BY SUM(oi.quantity) DESC
    ) as rank
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        WHERE o.restaurant_id = $1 
          AND EXTRACT(YEAR FROM o.created_at) = $2
          AND o.status = 'delivered'
        GROUP BY EXTRACT(MONTH FROM o.created_at), oi.product_name
  )
      SELECT month, product_name, total_quantity, total_revenue
      FROM monthly_products
      WHERE rank <= 5
      ORDER BY month, rank
  `, [restaurantId, selectedYear]);

    // Organize top products by month
    const topProductsByMonth = Array.from({ length: 12 }, () => []);
    topProductsResult.rows.forEach(row => {
      const idx = parseInt(row.month) - 1;
      topProductsByMonth[idx].push({
        name: row.product_name,
        quantity: parseInt(row.total_quantity),
        revenue: parseFloat(row.total_revenue)
      });
    });

    res.json({
      year: selectedYear,
      monthlyData,
      totalRevenue,
      totalOrders,
      averageCheck,
      topProductsByMonth
    });
  } catch (error) {
    console.error('Yearly analytics error:', error);
    res.status(500).json({ error: 'Ошибка получения аналитики' });
  }
});

// =====================================================
// FEEDBACK (Complaints & Suggestions) - Admin
// =====================================================

// Get all feedback for restaurant
router.get('/feedback', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId && req.user.role !== 'superadmin') {
      return res.status(400).json({ error: 'Ресторан не выбран' });
    }

    const { status, type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT f.*,
  u.username as user_username,
  resp.full_name as responder_name
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      LEFT JOIN users resp ON f.responded_by = resp.id
      WHERE 1 = 1
  `;
    const params = [];
    let paramIndex = 1;

    if (restaurantId) {
      query += ` AND f.restaurant_id = $${paramIndex} `;
      params.push(restaurantId);
      paramIndex++;
    }

    if (status) {
      query += ` AND f.status = $${paramIndex} `;
      params.push(status);
      paramIndex++;
    }

    if (type) {
      query += ` AND f.type = $${paramIndex} `;
      params.push(type);
      paramIndex++;
    }

    // Get total count
    const countQuery = query.replace(/SELECT[\s\S]*?FROM feedback f/, 'SELECT COUNT(*) FROM feedback f');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    query += ` ORDER BY f.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1} `;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      feedback: result.rows,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ error: 'Ошибка получения обращений' });
  }
});

// Update feedback status / respond
router.patch('/feedback/:id', async (req, res) => {
  try {
    const { status, admin_response } = req.body;
    const feedbackId = req.params.id;

    // Check access
    const checkResult = await pool.query(
      'SELECT * FROM feedback WHERE id = $1',
      [feedbackId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Обращение не найдено' });
    }

    const feedback = checkResult.rows[0];

    // Check restaurant access
    if (req.user.role !== 'superadmin' && feedback.restaurant_id !== req.user.active_restaurant_id) {
      return res.status(403).json({ error: 'Нет доступа к этому обращению' });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex} `);
      values.push(status);
      paramIndex++;
    }

    if (admin_response !== undefined) {
      updates.push(`admin_response = $${paramIndex} `);
      values.push(admin_response);
      paramIndex++;

      updates.push(`responded_by = $${paramIndex} `);
      values.push(req.user.id);
      paramIndex++;

      updates.push(`responded_at = CURRENT_TIMESTAMP`);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(feedbackId);

    const result = await pool.query(`
      UPDATE feedback 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
RETURNING *
  `, values);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update feedback error:', error);
    res.status(500).json({ error: 'Ошибка обновления обращения' });
  }
});

// Get feedback stats
router.get('/feedback/stats', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;

    let whereClause = '';
    const params = [];

    if (restaurantId) {
      whereClause = 'WHERE restaurant_id = $1';
      params.push(restaurantId);
    }

    const result = await pool.query(`
SELECT
COUNT(*) FILTER(WHERE status = 'new') as new_count,
  COUNT(*) FILTER(WHERE status = 'in_progress') as in_progress_count,
    COUNT(*) FILTER(WHERE status = 'resolved') as resolved_count,
      COUNT(*) FILTER(WHERE status = 'closed') as closed_count,
        COUNT(*) as total
      FROM feedback
      ${whereClause}
`, params);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get feedback stats error:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// =====================================================
// КЛИЕНТЫ (ТОЛЬКО ТЕКУЩИЙ МАГАЗИН)
// =====================================================

router.get('/customers', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) {
      return res.json({ customers: [], total: 0, page: 1, limit: 20 });
    }

    const page = Math.max(parseInt(req.query.page || 1, 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || 20, 10), 1), 100);
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();
    const offset = (page - 1) * limit;

    const params = [restaurantId];
    let paramIndex = 2;
    let where = `
      WHERE u.role = 'customer'
        AND EXISTS (
          SELECT 1
          FROM orders o_exists
          WHERE o_exists.user_id = u.id
            AND o_exists.restaurant_id = $1
        )
    `;

    if (search) {
      where += ` AND (
        u.full_name ILIKE $${paramIndex}
        OR u.phone ILIKE $${paramIndex}
        OR u.username ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (status === 'active') {
      where += ` AND u.is_active = true AND COALESCE(ur.is_blocked, false) = false`;
    } else if (status === 'blocked') {
      where += ` AND (u.is_active = false OR COALESCE(ur.is_blocked, false) = true)`;
    }

    const listQuery = `
      SELECT
        u.id AS user_id,
        u.username,
        u.full_name,
        u.phone,
        u.telegram_id,
        u.is_active AS user_is_active,
        COALESCE(ur.is_blocked, false) AS is_blocked,
        u.created_at,
        COUNT(o.id)::int AS orders_count,
        COALESCE(SUM(o.total_amount), 0) AS total_spent,
        MAX(o.created_at) AS last_order_date
      FROM users u
      LEFT JOIN user_restaurants ur
        ON ur.user_id = u.id AND ur.restaurant_id = $1
      LEFT JOIN orders o
        ON o.user_id = u.id AND o.restaurant_id = $1
      ${where}
      GROUP BY u.id, ur.is_blocked
      ORDER BY MAX(o.created_at) DESC NULLS LAST, u.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const listResult = await pool.query(listQuery, [...params, limit, offset]);

    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM users u
      LEFT JOIN user_restaurants ur
        ON ur.user_id = u.id AND ur.restaurant_id = $1
      ${where}
    `;
    const countResult = await pool.query(countQuery, params);

    res.json({
      customers: listResult.rows,
      total: countResult.rows[0]?.count || 0,
      page,
      limit
    });
  } catch (error) {
    console.error('Admin customers error:', error);
    res.status(500).json({ error: 'Ошибка получения клиентов магазина' });
  }
});

router.get('/customers/:id/orders', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;
    if (!restaurantId) {
      return res.status(400).json({ error: 'Сначала выберите магазин' });
    }

    const page = Math.max(parseInt(req.query.page || 1, 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || 10, 10), 1), 100);
    const offset = (page - 1) * limit;
    const customerId = parseInt(req.params.id, 10);

    const customerResult = await pool.query(
      `
      SELECT u.id, u.full_name, u.username, u.phone, u.telegram_id
      FROM users u
      WHERE u.id = $1
        AND u.role = 'customer'
        AND EXISTS (
          SELECT 1
          FROM orders o
          WHERE o.user_id = u.id
            AND o.restaurant_id = $2
        )
      `,
      [customerId, restaurantId]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден в этом магазине' });
    }

    const ordersResult = await pool.query(
      `
      SELECT
        o.id, o.order_number, o.status, o.total_amount, o.payment_method,
        o.customer_name, o.customer_phone, o.delivery_address, o.delivery_coordinates,
        o.delivery_date, o.delivery_time, o.comment, o.created_at, o.updated_at,
        o.is_paid, o.cancel_reason, o.cancelled_at_status,
        r.name AS restaurant_name, r.id AS restaurant_id,
        u_operator.full_name AS processed_by_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.id,
              'product_id', oi.product_id,
              'product_name', oi.product_name,
              'quantity', oi.quantity,
              'unit', oi.unit,
              'price', oi.price,
              'total', oi.quantity * oi.price
            )
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'
        ) AS items
      FROM orders o
      LEFT JOIN restaurants r ON o.restaurant_id = r.id
      LEFT JOIN users u_operator ON o.processed_by = u_operator.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = $1
        AND o.restaurant_id = $2
      GROUP BY o.id, r.name, r.id, u_operator.full_name
      ORDER BY o.created_at DESC
      LIMIT $3 OFFSET $4
      `,
      [customerId, restaurantId, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM orders WHERE user_id = $1 AND restaurant_id = $2',
      [customerId, restaurantId]
    );

    res.json({
      customer: customerResult.rows[0],
      orders: ordersResult.rows,
      total: countResult.rows[0]?.count || 0,
      page,
      limit
    });
  } catch (error) {
    console.error('Admin customer orders error:', error);
    res.status(500).json({ error: 'Ошибка получения заказов клиента' });
  }
});

// =====================================================
// USER PROFILE LOGS (история изменений профиля)
// =====================================================

// Get profile change logs for a specific user
router.get('/user/:userId/profile-logs', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(`
SELECT
id,
  field_name,
  old_value,
  new_value,
  changed_via,
  created_at
      FROM user_profile_logs 
      WHERE user_id = $1
      ORDER BY created_at DESC
  `, [userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get user profile logs error:', error);
    res.status(500).json({ error: 'Ошибка получения логов' });
  }
});

// Get all profile change logs (for current restaurant's customers)
router.get('/profile-logs', async (req, res) => {
  try {
    const restaurantId = req.user.active_restaurant_id;

    const result = await pool.query(`
SELECT
pl.id,
  pl.user_id,
  u.full_name as user_name,
  u.phone as user_phone,
  pl.field_name,
  pl.old_value,
  pl.new_value,
  pl.changed_via,
  pl.created_at
      FROM user_profile_logs pl
      JOIN users u ON pl.user_id = u.id
      WHERE EXISTS(
    SELECT 1 FROM user_restaurants ur 
        WHERE ur.user_id = u.id AND ur.restaurant_id = $1
  )
      ORDER BY pl.created_at DESC
      LIMIT 100
  `, [restaurantId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get profile logs error:', error);
    res.status(500).json({ error: 'Ошибка получения логов' });
  }
});

module.exports = router;
