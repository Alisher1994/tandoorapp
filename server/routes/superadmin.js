const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const bcrypt = require('bcryptjs');
const TelegramBot = require('node-telegram-bot-api');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const {
  logActivity,
  getActivityLogs,
  getActivityStats,
  refreshUserTelemetryFromActivityLogs,
  ensureUserTelemetrySchema,
  getIpFromRequest,
  getUserAgentFromRequest,
  ACTION_TYPES,
  ENTITY_TYPES
} = require('../services/activityLogger');
const { reloadBot, getBot } = require('../bot/bot');
const { reloadMultiBots } = require('../bot/multiBotManager');
const {
  ensureHelpInstructionsSchema,
  isValidYouTubeUrl,
  listHelpInstructions,
  resolveNextSortOrder,
  createHelpInstruction,
  updateHelpInstruction,
  deleteHelpInstruction
} = require('../services/helpInstructions');
const { ensureBotFunnelSchema } = require('../services/botFunnel');
const { ensureReservationSchema } = require('../services/reservationSchema');
const { ensureOrderRatingsSchema, normalizeOrderRating } = require('../services/orderRatings');
const {
  ensureSecurityEventsSchema,
  listSecurityEvents,
  getSecurityEventsStats,
  setSecurityEventStatus
} = require('../services/securityEvents');

// All routes require superadmin authentication
router.use(authenticate);
router.use(requireSuperAdmin);

const { sendBalanceNotification, getRestaurantBot } = require('../bot/notifications');

const MAX_CATEGORY_LEVEL = 3;
const CATEGORY_CHAIN_GUARD_LIMIT = 50;
const RESTAURANT_CURRENCY_CODES = new Set(['uz', 'kz', 'tm', 'tj', 'kg', 'af', 'ru']);
const normalizeRestaurantCurrencyCode = (value, fallback = 'uz') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (RESTAURANT_CURRENCY_CODES.has(normalized)) return normalized;
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return RESTAURANT_CURRENCY_CODES.has(normalizedFallback) ? normalizedFallback : 'uz';
};
let activityTypesSchemaReady = false;
let activityTypesSchemaPromise = null;
let billingSettingsSchemaReady = false;
let billingSettingsSchemaPromise = null;
let restaurantCurrencySchemaReady = false;
let restaurantCurrencySchemaPromise = null;
let restaurantAdminCommentSchemaReady = false;
let restaurantAdminCommentSchemaPromise = null;
let globalProductsSchemaReady = false;
let globalProductsSchemaPromise = null;
const GLOBAL_PRODUCT_MAX_IMAGES = 5;

const DEFAULT_ACTIVITY_TYPES = [
  'Ресторан',
  'Одежда',
  'Хозяйственные товары',
  'Канцтовары',
  'Бытовая техника',
  'Детская одежда',
  'Цветочные',
  'Продуктовый магазин'
];

const normalizeTokenValue = (value) => {
  const normalized = value ? String(value).trim() : '';
  return normalized || null;
};

const normalizeTelegramIdValue = (value) => {
  const normalized = value === undefined || value === null ? '' : String(value).trim();
  return normalized || null;
};
const SEASON_ANIMATION_MODES = new Set(['off', 'spring', 'summer', 'autumn', 'winter']);
const normalizeCatalogAnimationSeason = (value, fallback = 'off') => {
  const normalized = String(value || '').trim().toLowerCase();
  return SEASON_ANIMATION_MODES.has(normalized) ? normalized : fallback;
};

const normalizeActivityTypeId = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const normalizeBooleanFlag = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const ensureActivityTypesSchema = async () => {
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
    await pool.query(`ALTER TABLE ad_banners ADD COLUMN IF NOT EXISTS target_activity_type_ids JSONB DEFAULT '[]'::jsonb`).catch(() => {});
    await pool.query(`ALTER TABLE ad_banners ALTER COLUMN target_activity_type_ids SET DEFAULT '[]'::jsonb`).catch(() => {});
    await pool.query(`UPDATE ad_banners SET target_activity_type_ids = '[]'::jsonb WHERE target_activity_type_ids IS NULL`).catch(() => {});
    await pool.query(`ALTER TABLE ad_banners ADD COLUMN IF NOT EXISTS ad_type VARCHAR(24) DEFAULT 'banner'`).catch(() => {});
    await pool.query(`ALTER TABLE ad_banners ALTER COLUMN ad_type SET DEFAULT 'banner'`).catch(() => {});
    await pool.query(`UPDATE ad_banners SET ad_type = 'banner' WHERE ad_type IS NULL OR BTRIM(ad_type) = ''`).catch(() => {});
    await pool.query(`
      ALTER TABLE ad_banners
      ADD CONSTRAINT IF NOT EXISTS ad_banners_type_check
      CHECK (ad_type IN ('banner', 'entry_popup'))
    `).catch(() => {});
    await pool.query('CREATE INDEX IF NOT EXISTS idx_restaurants_activity_type_id ON restaurants(activity_type_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_business_activity_types_sort_order ON business_activity_types(sort_order, id)');
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_business_activity_types_name_lower ON business_activity_types (LOWER(name))');

    for (let i = 0; i < DEFAULT_ACTIVITY_TYPES.length; i += 1) {
      const name = DEFAULT_ACTIVITY_TYPES[i];
      await pool.query(
        `INSERT INTO business_activity_types (name, sort_order, is_visible)
         VALUES ($1, $2, true)
         ON CONFLICT ((LOWER(name))) DO NOTHING`,
        [name, i + 1]
      );
    }

    activityTypesSchemaReady = true;
  })();

  try {
    await activityTypesSchemaPromise;
  } finally {
    activityTypesSchemaPromise = null;
  }
};
const ensureBillingSettingsSchema = async () => {
  if (billingSettingsSchemaReady) return;
  if (billingSettingsSchemaPromise) {
    await billingSettingsSchemaPromise;
    return;
  }

  billingSettingsSchemaPromise = (async () => {
    await pool.query(`ALTER TABLE billing_settings ADD COLUMN IF NOT EXISTS catalog_animation_season VARCHAR(16) DEFAULT 'off'`).catch(() => {});
    await pool.query(`ALTER TABLE billing_settings ALTER COLUMN catalog_animation_season SET DEFAULT 'off'`).catch(() => {});
    await pool.query(`
      UPDATE billing_settings
      SET catalog_animation_season = 'off'
      WHERE catalog_animation_season IS NULL
        OR BTRIM(catalog_animation_season) = ''
        OR catalog_animation_season NOT IN ('off', 'spring', 'summer', 'autumn', 'winter')
    `).catch(() => {});
    await pool.query(`
      ALTER TABLE billing_settings
      ADD CONSTRAINT IF NOT EXISTS billing_settings_catalog_animation_season_check
      CHECK (catalog_animation_season IN ('off', 'spring', 'summer', 'autumn', 'winter'))
    `).catch(() => {});
    billingSettingsSchemaReady = true;
  })();

  try {
    await billingSettingsSchemaPromise;
  } finally {
    billingSettingsSchemaPromise = null;
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
        ikpu VARCHAR(64),
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
    `);
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS name_uz VARCHAR(255)`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS description_ru TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS description_uz TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS image_url TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS thumb_url TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS product_images JSONB DEFAULT '[]'::jsonb`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS barcode VARCHAR(120)`).catch(() => {});
    await pool.query(`ALTER TABLE global_products ADD COLUMN IF NOT EXISTS ikpu VARCHAR(64)`).catch(() => {});
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
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_global_products_ikpu ON global_products(ikpu)`).catch(() => {});
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_global_products_barcode_normalized
      ON global_products ((NULLIF(REGEXP_REPLACE(COALESCE(barcode, ''), '\\D', '', 'g'), '')))
    `).catch(() => {});
    globalProductsSchemaReady = true;
  })();

  try {
    await globalProductsSchemaPromise;
  } finally {
    globalProductsSchemaPromise = null;
  }
};
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

const normalizePhoneValue = (value) => {
  const raw = value === undefined || value === null ? '' : String(value).trim().replace(/\s+/g, '');
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  return `+${digits}`;
};
const parseFlexibleAmount = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const MAX_RESTAURANT_ADMIN_COMMENT_LENGTH = 2000;
const RESTAURANT_ADMIN_CHECKLIST_CODES = new Set([
  'call_completed',
  'meeting_completed',
  'products_added',
  'has_improvement_suggestions',
  'telegram_token_issue',
  'customers_not_adding'
]);
const normalizeRestaurantAdminComment = (value) => {
  const normalized = value === undefined || value === null ? '' : String(value).trim();
  if (!normalized) return null;
  return normalized.slice(0, MAX_RESTAURANT_ADMIN_COMMENT_LENGTH);
};
const normalizeRestaurantAdminChecklist = (value) => {
  const source = Array.isArray(value) ? value : [];
  const uniqueCodes = [];
  const seen = new Set();

  for (const rawCode of source) {
    const code = String(rawCode || '').trim();
    if (!code || !RESTAURANT_ADMIN_CHECKLIST_CODES.has(code) || seen.has(code)) continue;
    seen.add(code);
    uniqueCodes.push(code);
  }

  return uniqueCodes;
};
const toOptionalTrimmedText = (value) => (
  value === undefined || value === null ? '' : String(value).trim()
);
const normalizeBarcodeValue = (value) => String(value || '').replace(/\D/g, '').slice(0, 120);
const findGlobalProductByBarcode = async (barcode, excludeId = null) => {
  const normalizedBarcode = normalizeBarcodeValue(barcode);
  if (!normalizedBarcode) return null;

  const hasExcludeId = Number.isFinite(excludeId) && excludeId > 0;
  const params = hasExcludeId ? [normalizedBarcode, excludeId] : [normalizedBarcode];
  const exclusionSql = hasExcludeId ? 'AND gp.id <> $2' : '';
  const duplicateResult = await pool.query(
    `
      SELECT gp.id, gp.name_ru
      FROM global_products gp
      WHERE NULLIF(REGEXP_REPLACE(COALESCE(gp.barcode, ''), '\\D', '', 'g'), '') = $1
      ${exclusionSql}
      LIMIT 1
    `,
    params
  );
  return duplicateResult.rows?.[0] || null;
};
const normalizePositivePrice = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
};
const normalizeGlobalProductImages = (value, maxCount = GLOBAL_PRODUCT_MAX_IMAGES) => {
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
  for (const entry of source) {
    let imageUrl = '';
    let thumbUrl = '';
    if (typeof entry === 'string') {
      imageUrl = entry.trim();
    } else if (entry && typeof entry === 'object') {
      imageUrl = toOptionalTrimmedText(entry.url || entry.image_url);
      thumbUrl = toOptionalTrimmedText(entry.thumb_url || entry.thumbUrl);
    }
    if (!imageUrl) continue;
    normalized.push({
      url: imageUrl,
      ...(thumbUrl ? { thumb_url: thumbUrl } : {})
    });
    if (normalized.length >= maxCount) break;
  }
  return normalized;
};
const normalizeGlobalProductVariantOptions = (value) => {
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
    let price = null;
    let barcode = '';
    let imageUrl = '';
    let thumbUrl = '';
    let variantImages = [];

    if (item && typeof item === 'object' && !Array.isArray(item)) {
      name = toOptionalTrimmedText(item.name || item.value || item.label);
      descriptionRu = toOptionalTrimmedText(item.description_ru || item.descriptionRu).slice(0, 1500);
      descriptionUz = toOptionalTrimmedText(item.description_uz || item.descriptionUz).slice(0, 1500);
      price = normalizePositivePrice(item.price, null);
      barcode = toOptionalTrimmedText(item.barcode).slice(0, 120);
      variantImages = normalizeGlobalProductImages(item.product_images, 4);
      const fallbackImageUrl = toOptionalTrimmedText(item.image_url || item.imageUrl);
      const fallbackThumbUrl = toOptionalTrimmedText(item.thumb_url || item.thumbUrl);
      if (variantImages.length === 0 && fallbackImageUrl) {
        variantImages.push({
          url: fallbackImageUrl,
          ...(fallbackThumbUrl ? { thumb_url: fallbackThumbUrl } : {})
        });
      }
      imageUrl = variantImages[0]?.url || fallbackImageUrl;
      thumbUrl = variantImages[0]?.thumb_url || fallbackThumbUrl;
    } else {
      name = toOptionalTrimmedText(item);
    }

    if (!name) continue;
    const key = name.toLowerCase();
    if (unique.has(key)) continue;
    unique.add(key);

    normalized.push({
      name,
      description_ru: descriptionRu,
      description_uz: descriptionUz,
      price,
      barcode,
      image_url: imageUrl || '',
      thumb_url: thumbUrl || '',
      product_images: variantImages
    });
    if (normalized.length >= 20) break;
  }
  return normalized;
};

const normalizeInstructionText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

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
  return {
    username: normalizedUsername,
    phone: normalizedPhone
  };
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

const resolveCentralBotMeta = async (token) => {
  const normalizedToken = normalizeTokenValue(token);
  if (!normalizedToken) {
    return {
      superadmin_bot_name: null,
      superadmin_bot_username: null
    };
  }

  const bot = new TelegramBot(normalizedToken);
  const me = await bot.getMe();

  return {
    superadmin_bot_name: me?.first_name || null,
    superadmin_bot_username: me?.username ? `@${me.username}` : null
  };
};

const resolveTelegramBotMeta = async (token) => {
  const normalizedToken = normalizeTokenValue(token);
  if (!normalizedToken) {
    return {
      telegram_bot_name: null,
      telegram_bot_username: null
    };
  }

  const bot = new TelegramBot(normalizedToken);
  const me = await bot.getMe();

  return {
    telegram_bot_name: me?.first_name || null,
    telegram_bot_username: me?.username ? `@${me.username}` : null
  };
};

const trimTelegramDiagnosticText = (value, maxLength = 240) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, Math.max(1, maxLength - 1))}…`;
};

const detectTelegramDiagnosticErrorCode = (message) => {
  const normalized = String(message || '').toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized.includes('401') || normalized.includes('unauthorized')) return 'unauthorized';
  if (normalized.includes('404') || normalized.includes('not found')) return 'not_found';
  if (normalized.includes('429') || normalized.includes('too many requests')) return 'rate_limit';
  if (normalized.includes('timeout') || normalized.includes('timed out') || normalized.includes('econn') || normalized.includes('network')) return 'network';
  return 'unknown';
};

const makeTelegramDiagnosticIssue = ({
  code,
  title,
  description,
  solution,
  severity = 'error'
}) => ({
  code,
  title,
  description: trimTelegramDiagnosticText(description, 360),
  solution: trimTelegramDiagnosticText(solution, 240),
  severity: severity === 'warning' ? 'warning' : 'error'
});

const buildRestaurantTelegramDiagnostics = async (restaurant) => {
  const restaurantId = Number.parseInt(restaurant?.id, 10);
  const restaurantName = String(restaurant?.name || '').trim() || `#${restaurantId || '?'}`;
  const token = normalizeTokenValue(restaurant?.telegram_bot_token);
  const checks = [];
  const issues = [];
  const pushCheck = (code, label, ok, hint = '') => {
    checks.push({
      code,
      label,
      ok: !!ok,
      hint: hint ? trimTelegramDiagnosticText(hint, 220) : ''
    });
  };

  if (!token) {
    issues.push(makeTelegramDiagnosticIssue({
      code: 'token_missing',
      title: 'Не указан Telegram Bot Token',
      description: 'У магазина не заполнен токен бота, Telegram-интеграция не сможет работать.',
      solution: 'Откройте редактирование магазина, вставьте актуальный токен из BotFather и сохраните.'
    }));
    pushCheck('token_present', 'Токен бота заполнен', false, 'Токен отсутствует');
    pushCheck('token_valid', 'Токен проходит проверку в Telegram', false, 'Проверка невозможна без токена');
    pushCheck('webhook_configured', 'Webhook установлен', false, 'Webhook нельзя проверить без валидного токена');

    return {
      restaurant_id: restaurantId || null,
      restaurant_name: restaurantName,
      issue_count: issues.length,
      issues,
      checks,
      checked_at: new Date().toISOString()
    };
  }

  pushCheck('token_present', 'Токен бота заполнен', true, '');

  let bot = null;
  let botProfile = null;
  try {
    bot = new TelegramBot(token);
    botProfile = await bot.getMe();
    pushCheck('token_valid', 'Токен проходит проверку в Telegram', true, '');
  } catch (error) {
    const errorMessage = trimTelegramDiagnosticText(error?.message || 'Не удалось проверить токен', 280);
    const errorCode = detectTelegramDiagnosticErrorCode(errorMessage);
    let title = 'Токен бота не прошёл проверку';
    let solution = 'Проверьте токен в BotFather и сохраните его заново в настройках магазина.';

    if (errorCode === 'unauthorized') {
      title = 'Недействительный токен (401 Unauthorized)';
      solution = 'Запросите у клиента новый токен в BotFather, обновите токен магазина и сохраните.';
    } else if (errorCode === 'not_found') {
      title = 'Бот не найден (404 Not Found)';
      solution = 'Проверьте, что бот существует, и токен скопирован полностью без лишних пробелов.';
    } else if (errorCode === 'rate_limit') {
      title = 'Временный лимит Telegram API (429)';
      solution = 'Подождите 1-2 минуты и нажмите «Перепроверить».';
    } else if (errorCode === 'network') {
      title = 'Сетевая ошибка при проверке бота';
      solution = 'Проверьте доступность Telegram API и повторите проверку позже.';
    }

    issues.push(makeTelegramDiagnosticIssue({
      code: 'token_invalid',
      title,
      description: `Telegram вернул ошибку: ${errorMessage}`,
      solution
    }));
    pushCheck('token_valid', 'Токен проходит проверку в Telegram', false, errorMessage);
    pushCheck('webhook_configured', 'Webhook установлен', false, 'Webhook не проверяется, пока токен невалиден');

    return {
      restaurant_id: restaurantId || null,
      restaurant_name: restaurantName,
      issue_count: issues.length,
      issues,
      checks,
      bot_username: null,
      checked_at: new Date().toISOString()
    };
  }

  try {
    const webhookInfo = await bot.getWebHookInfo();
    const webhookUrl = String(webhookInfo?.url || '').trim();
    const expectedPath = `/api/telegram/webhook/${restaurantId}`;
    const webhookIsSet = !!webhookUrl;
    const webhookMatchesExpectedPath = webhookUrl.includes(expectedPath);
    const pendingUpdates = Number.parseInt(webhookInfo?.pending_update_count, 10);
    const lastErrorMessage = trimTelegramDiagnosticText(webhookInfo?.last_error_message || '', 300);
    const lastErrorDateRaw = Number.parseInt(webhookInfo?.last_error_date, 10);
    const lastErrorAt = Number.isFinite(lastErrorDateRaw) && lastErrorDateRaw > 0
      ? new Date(lastErrorDateRaw * 1000).toISOString()
      : null;

    pushCheck('webhook_configured', 'Webhook установлен', webhookIsSet, webhookIsSet ? '' : 'Telegram не вернул URL webhook');
    pushCheck(
      'webhook_target',
      'Webhook направлен в правильный маршрут магазина',
      webhookIsSet && webhookMatchesExpectedPath,
      webhookIsSet
        ? (webhookMatchesExpectedPath ? '' : `Текущий URL: ${trimTelegramDiagnosticText(webhookUrl, 140)}`)
        : 'URL webhook отсутствует'
    );

    if (!webhookIsSet) {
      issues.push(makeTelegramDiagnosticIssue({
        code: 'webhook_missing',
        title: 'Webhook не установлен',
        description: 'Telegram не содержит webhook URL для этого магазина.',
        solution: 'Сохраните настройки магазина с токеном и выполните redeploy/restart сервиса.'
      }));
    } else if (!webhookMatchesExpectedPath) {
      issues.push(makeTelegramDiagnosticIssue({
        code: 'webhook_mismatch',
        title: 'Webhook указывает на другой маршрут',
        description: `Сейчас используется URL: ${webhookUrl}`,
        solution: 'Пересохраните токен магазина и выполните redeploy, чтобы webhook выставился автоматически.'
      }));
    }

    if (lastErrorMessage) {
      issues.push(makeTelegramDiagnosticIssue({
        code: 'webhook_last_error',
        title: 'Telegram сообщает последнюю ошибку webhook',
        description: `${lastErrorMessage}${lastErrorAt ? ` (время: ${lastErrorAt})` : ''}`,
        solution: 'Исправьте причину ошибки (чаще всего токен/домен), затем нажмите «Перепроверить».',
        severity: 'warning'
      }));
    }

    if (Number.isFinite(pendingUpdates) && pendingUpdates > 100) {
      issues.push(makeTelegramDiagnosticIssue({
        code: 'webhook_backlog',
        title: 'Накопилась очередь обновлений в webhook',
        description: `В очереди Telegram сейчас ${pendingUpdates} обновлений.`,
        solution: 'Проверьте доступность backend и корректность webhook. После стабилизации очередь уменьшится.',
        severity: 'warning'
      }));
    }

    return {
      restaurant_id: restaurantId || null,
      restaurant_name: restaurantName,
      issue_count: issues.length,
      issues,
      checks,
      bot_username: botProfile?.username ? `@${botProfile.username}` : null,
      webhook_url: webhookUrl || null,
      pending_update_count: Number.isFinite(pendingUpdates) ? pendingUpdates : 0,
      checked_at: new Date().toISOString()
    };
  } catch (error) {
    const webhookErrorMessage = trimTelegramDiagnosticText(error?.message || 'Не удалось получить webhook информацию', 280);
    issues.push(makeTelegramDiagnosticIssue({
      code: 'webhook_check_failed',
      title: 'Не удалось проверить webhook',
      description: webhookErrorMessage,
      solution: 'Повторите проверку через несколько секунд. Если ошибка повторяется, проверьте сеть/доступ к Telegram API.'
    }));
    pushCheck('webhook_configured', 'Webhook установлен', false, webhookErrorMessage);
    pushCheck('webhook_target', 'Webhook направлен в правильный маршрут магазина', false, webhookErrorMessage);

    return {
      restaurant_id: restaurantId || null,
      restaurant_name: restaurantName,
      issue_count: issues.length,
      issues,
      checks,
      bot_username: botProfile?.username ? `@${botProfile.username}` : null,
      checked_at: new Date().toISOString()
    };
  }
};

const enrichRestaurantWithBotMeta = async (restaurant) => {
  if (!restaurant) return restaurant;

  try {
    return {
      ...restaurant,
      ...(await resolveTelegramBotMeta(restaurant.telegram_bot_token))
    };
  } catch (error) {
    return {
      ...restaurant,
      telegram_bot_name: null,
      telegram_bot_username: null,
      telegram_bot_meta_error: error.message
    };
  }
};

const enrichBillingSettingsWithCentralBotMeta = async (settings) => {
  const baseSettings = settings || {};

  try {
    return {
      ...baseSettings,
      ...(await resolveCentralBotMeta(baseSettings.superadmin_bot_token))
    };
  } catch (error) {
    return {
      ...baseSettings,
      superadmin_bot_name: null,
      superadmin_bot_username: null,
      superadmin_bot_meta_error: error.message
    };
  }
};

const notifySuperadminTokenChanged = async (telegramId) => {
  if (!telegramId) return;
  const bot = getBot();
  if (!bot) return;

  await bot.sendMessage(
    telegramId,
    '✅ Вы успешно сменили токен супер админа.\n🤖 Это ваш новый бот.'
  );
};

const normalizeRestaurantTokenForCompare = (value) => (
  value === undefined || value === null ? '' : String(value).trim()
);

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
  try {
    bot = getRestaurantBot(currentToken);
    const me = await bot.getMe();
    botUsername = me?.username || null;
  } catch (error) {
    return { skipped: true, reason: 'new_bot_unavailable', details: error.message };
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

const normalizeCategoryId = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeCategoryName = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const AD_BANNER_MAX_SLOTS = 10;
const AD_TRANSITIONS = new Set(['none', 'fade', 'slide']);
const AD_BANNER_TYPES = new Set(['banner', 'entry_popup']);
const TASHKENT_TZ = 'Asia/Tashkent';
const ANALYTICS_TIMEZONE = process.env.RESTAURANT_TIMEZONE || TASHKENT_TZ;
const OPERATOR_PAYMENT_METHODS = ['click', 'payme', 'cash', 'card', 'xazna', 'uzum'];
const OPERATOR_PAYMENT_LABELS = {
  click: 'Click',
  payme: 'Payme',
  cash: 'Наличные',
  card: 'Карта',
  xazna: 'Xazna',
  uzum: 'Uzum'
};
const RESERVATION_TEMPLATE_SHAPES = new Set(['round', 'square', 'rect', 'sofa', 'custom']);
const RESERVATION_FURNITURE_CATEGORIES = new Set(['tables_chairs', 'bed', 'garage_box', 'work_desk', 'bunk']);
const normalizeReservationTemplateShape = (value, fallback = 'custom') => {
  const normalized = String(value || '').trim().toLowerCase();
  return RESERVATION_TEMPLATE_SHAPES.has(normalized) ? normalized : fallback;
};
const normalizeReservationFurnitureCategory = (value, fallback = 'tables_chairs') => {
  const normalized = String(value || '').trim().toLowerCase();
  return RESERVATION_FURNITURE_CATEGORIES.has(normalized) ? normalized : fallback;
};
const normalizeReservationTemplateCode = (value) => (
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72)
);
const generateReservationTemplateCode = (name) => {
  const base = normalizeReservationTemplateCode(name) || 'template';
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 36 * 36).toString(36).padStart(2, '0')}`;
  return `${base}_${suffix}`.slice(0, 80);
};
const normalizeReservationTemplateImageUrl = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith('/uploads/') || normalized.startsWith('/reservation-furniture/')) return normalized;
  return '';
};
const parseReservationTemplateInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};
const parseReservationTemplateFloat = (value, fallback = 0) => {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};
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
const ensureRestaurantAdminCommentSchema = async () => {
  if (restaurantAdminCommentSchemaReady) return;
  if (restaurantAdminCommentSchemaPromise) {
    await restaurantAdminCommentSchemaPromise;
    return;
  }

  restaurantAdminCommentSchemaPromise = (async () => {
    await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS admin_comment TEXT').catch(() => {});
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS admin_comment_checklist JSONB DEFAULT '[]'::jsonb`).catch(() => {});
    await pool.query(`
      UPDATE restaurants
      SET admin_comment_checklist = '[]'::jsonb
      WHERE admin_comment_checklist IS NULL
    `).catch(() => {});
    restaurantAdminCommentSchemaReady = true;
  })();

  try {
    await restaurantAdminCommentSchemaPromise;
  } finally {
    restaurantAdminCommentSchemaPromise = null;
  }
};

const ensureRestaurantReservationSettingsRow = async (client, restaurantId) => {
  await ensureReservationSchema({ client });
  await client.query(
    `INSERT INTO restaurant_reservation_settings (
       restaurant_id,
       enabled,
       reservation_fee,
       reservation_service_cost,
       max_duration_minutes,
       allow_multi_table
     )
     VALUES ($1, false, 0, 0, 180, true)
     ON CONFLICT (restaurant_id) DO NOTHING`,
    [restaurantId]
  );
};

const padAnalyticsDatePart = (value) => String(value).padStart(2, '0');
const formatAnalyticsDateKey = (year, month, day) => (
  `${year}-${padAnalyticsDatePart(month)}-${padAnalyticsDatePart(day)}`
);
const parseAnalyticsDateKey = (rawValue) => {
  const value = String(rawValue || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(probe.getTime())) return null;
  return value;
};
const parseAnalyticsInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};
const parseAnalyticsPeriod = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'monthly' || normalized === 'month') return 'monthly';
  if (normalized === 'yearly' || normalized === 'year') return 'yearly';
  return 'daily';
};
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
const resolveAnalyticsRange = (query = {}) => {
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

const normalizeAdRepeatDays = (value) => {
  let days = [];
  if (Array.isArray(value)) {
    days = value;
  } else if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) days = parsed;
    } catch (e) {
      days = value.split(',').map((v) => v.trim());
    }
  }

  const normalized = [...new Set(
    days
      .map((day) => Number.parseInt(day, 10))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  )].sort((a, b) => a - b);

  return normalized;
};

const normalizeAdTargetActivityTypeIds = (value) => {
  let raw = [];
  if (Array.isArray(value)) {
    raw = value;
  } else if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      raw = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      raw = value.split(',').map((v) => v.trim());
    }
  }

  return [...new Set(
    raw
      .map((id) => Number.parseInt(id, 10))
      .filter((id) => Number.isInteger(id) && id > 0)
  )].sort((a, b) => a - b);
};

const parseOptionalDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getTashkentWeekday = (date = new Date()) => {
  const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: TASHKENT_TZ })
    .format(date)
    .toLowerCase();
  const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return map[dayName];
};

const isAdBannerVisibleNow = (banner, now = new Date()) => {
  if (!banner || banner.is_deleted || !banner.is_enabled) return false;
  const startAt = banner.start_at ? new Date(banner.start_at) : null;
  const endAt = banner.end_at ? new Date(banner.end_at) : null;
  if (startAt && now < startAt) return false;
  if (endAt && now > endAt) return false;
  const repeatDays = Array.isArray(banner.repeat_days) ? banner.repeat_days : normalizeAdRepeatDays(banner.repeat_days);
  if (repeatDays.length > 0) {
    const day = getTashkentWeekday(now);
    if (!repeatDays.includes(day)) return false;
  }
  return true;
};

const getAdBannerStatus = (banner, now = new Date()) => {
  if (banner.is_deleted) return 'deleted';
  if (!banner.is_enabled) return 'disabled';
  const startAt = banner.start_at ? new Date(banner.start_at) : null;
  const endAt = banner.end_at ? new Date(banner.end_at) : null;
  if (startAt && now < startAt) return 'scheduled';
  if (endAt && now > endAt) return 'finished';
  if (!isAdBannerVisibleNow(banner, now)) return 'paused_by_days';
  return 'active';
};

const normalizeAdBannerPayload = (body) => {
  const title = String(body.title || '').trim();
  const imageUrl = String(body.image_url || '').trim();
  const buttonText = String(body.button_text || 'Открыть').trim() || 'Открыть';
  const targetUrl = String(body.target_url || '').trim();
  const adType = String(body.ad_type || 'banner').trim().toLowerCase() || 'banner';
  const slotOrder = Number.parseInt(body.slot_order, 10);
  const displaySeconds = Number.parseInt(body.display_seconds, 10);
  const transitionEffect = String(body.transition_effect || 'fade').trim().toLowerCase();
  const startAt = parseOptionalDate(body.start_at);
  const endAt = parseOptionalDate(body.end_at);
  const repeatDays = normalizeAdRepeatDays(body.repeat_days);
  const targetActivityTypeIds = normalizeAdTargetActivityTypeIds(body.target_activity_type_ids);
  const isEnabled = body.is_enabled === undefined ? true : !!body.is_enabled;

  if (!title) return { error: 'Укажите название рекламы' };
  if (!imageUrl) return { error: 'Загрузите изображение рекламы' };
  if (!imageUrl.startsWith('/uploads/')) {
    try {
      const parsedImageUrl = new URL(imageUrl);
      if (!['http:', 'https:'].includes(parsedImageUrl.protocol)) {
        return { error: 'Ссылка на изображение должна начинаться с /uploads/, http:// или https://' };
      }
    } catch (e) {
      return { error: 'Некорректная ссылка изображения рекламы' };
    }
  }
  if (targetUrl) {
    try {
      const parsedUrl = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return { error: 'Ссылка должна начинаться с http:// или https://' };
      }
    } catch (e) {
      return { error: 'Некорректная ссылка перехода' };
    }
  }
  if (!Number.isInteger(slotOrder) || slotOrder < 1 || slotOrder > AD_BANNER_MAX_SLOTS) {
    return { error: `Позиция слота должна быть от 1 до ${AD_BANNER_MAX_SLOTS}` };
  }
  if (!Number.isInteger(displaySeconds) || displaySeconds < 2 || displaySeconds > 60) {
    return { error: 'Длительность показа должна быть от 2 до 60 секунд' };
  }
  if (!AD_TRANSITIONS.has(transitionEffect)) {
    return { error: 'Некорректный тип анимации перехода' };
  }
  if (!AD_BANNER_TYPES.has(adType)) {
    return { error: 'Некорректный тип показа рекламы' };
  }
  if ((body.start_at && !startAt) || (body.end_at && !endAt)) {
    return { error: 'Некорректная дата начала или окончания' };
  }
  if (startAt && endAt && endAt <= startAt) {
    return { error: 'Дата окончания должна быть позже даты начала' };
  }

  return {
    title,
    image_url: imageUrl,
    button_text: buttonText,
    target_url: targetUrl || null,
    ad_type: adType,
    slot_order: slotOrder,
    display_seconds: displaySeconds,
    transition_effect: transitionEffect,
    start_at: startAt ? startAt.toISOString() : null,
    end_at: endAt ? endAt.toISOString() : null,
    repeat_days: repeatDays,
    target_activity_type_ids: targetActivityTypeIds,
    is_enabled: isEnabled
  };
};

const findSiblingCategoryNameConflict = async ({
  client,
  parentId,
  restaurantId,
  nameRu,
  nameUz,
  excludeId = null
}) => {
  const siblings = await client.query(
    `SELECT id, name_ru, name_uz
     FROM categories
     WHERE parent_id IS NOT DISTINCT FROM $1
       AND restaurant_id IS NOT DISTINCT FROM $2
       AND ($3::int IS NULL OR id <> $3)`,
    [parentId, restaurantId, excludeId]
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

const getCategoryLevelById = async (client, categoryId, disallowId = null) => {
  let level = 0;
  let currentId = normalizeCategoryId(categoryId);
  const visited = new Set();
  const forbiddenId = normalizeCategoryId(disallowId);

  while (currentId) {
    if (visited.has(currentId)) {
      throw new Error('CATEGORY_CYCLE');
    }
    if (forbiddenId && currentId === forbiddenId) {
      throw new Error('CATEGORY_CYCLE');
    }
    visited.add(currentId);

    const result = await client.query(
      'SELECT id, parent_id FROM categories WHERE id = $1',
      [currentId]
    );

    if (result.rows.length === 0) {
      throw new Error('CATEGORY_NOT_FOUND');
    }

    level += 1;
    if (level > CATEGORY_CHAIN_GUARD_LIMIT) {
      throw new Error('CATEGORY_CHAIN_TOO_DEEP');
    }

    currentId = normalizeCategoryId(result.rows[0].parent_id);
  }

  return level;
};

const getCategorySubtreeDepth = async (client, categoryId) => {
  const result = await client.query(`
    WITH RECURSIVE category_tree AS (
      SELECT id, parent_id, 1 AS depth
      FROM categories
      WHERE id = $1

      UNION ALL

      SELECT c.id, c.parent_id, ct.depth + 1
      FROM categories c
      INNER JOIN category_tree ct ON c.parent_id = ct.id
      WHERE ct.depth < $2
    )
    SELECT COALESCE(MAX(depth), 1)::int AS max_depth
    FROM category_tree
  `, [categoryId, CATEGORY_CHAIN_GUARD_LIMIT]);

  return result.rows[0]?.max_depth || 1;
};


// =====================================================
// РЕСТОРАНЫ
// =====================================================

// Получить все рестораны
router.get('/restaurants', async (req, res) => {
  try {
    await ensureActivityTypesSchema();
    await ensureRestaurantCurrencySchema();
    await ensureRestaurantAdminCommentSchema();
    await ensureReservationSchema();
    const result = await pool.query(`
      SELECT r.*, 
        bat.name AS activity_type_name,
        bat.is_visible AS activity_type_is_visible,
        COALESCE(rs.enabled, false) AS reservation_enabled_setting,
        COALESCE(rs.reservation_service_cost, COALESCE(r.reservation_cost, 0)) AS reservation_service_cost,
        (SELECT COUNT(*) FROM operator_restaurants WHERE restaurant_id = r.id) as operators_count,
        (SELECT COUNT(*) FROM orders WHERE restaurant_id = r.id) as orders_count,
        (SELECT COUNT(*) FROM products WHERE restaurant_id = r.id) as products_count
      FROM restaurants r
      LEFT JOIN business_activity_types bat ON bat.id = r.activity_type_id
      LEFT JOIN restaurant_reservation_settings rs ON rs.restaurant_id = r.id
      ORDER BY r.created_at DESC
    `);
    const restaurants = await Promise.all(result.rows.map((row) => enrichRestaurantWithBotMeta({
      ...row,
      reservation_enabled: row.reservation_enabled_setting === true || row.reservation_enabled_setting === 'true'
    })));
    res.json(restaurants);
  } catch (error) {
    console.error('Get restaurants error:', error);
    res.status(500).json({ error: 'Ошибка получения ресторанов' });
  }
});

// Диагностика Telegram-интеграции магазина (ошибки/чеклист)
router.get('/restaurants/:id/telegram-diagnostics', async (req, res) => {
  try {
    const restaurantId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(restaurantId) || restaurantId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID магазина' });
    }

    const result = await pool.query(
      `SELECT id, name, telegram_bot_token
       FROM restaurants
       WHERE id = $1
       LIMIT 1`,
      [restaurantId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Магазин не найден' });
    }

    const diagnostics = await buildRestaurantTelegramDiagnostics(result.rows[0]);
    res.json(diagnostics);
  } catch (error) {
    console.error('Restaurant telegram diagnostics error:', error);
    res.status(500).json({ error: 'Ошибка диагностики Telegram-интеграции' });
  }
});

// =====================================================
// СПРАВОЧНИК ВИДОВ ДЕЯТЕЛЬНОСТИ
// =====================================================

router.get('/activity-types', async (req, res) => {
  try {
    await ensureActivityTypesSchema();
    const includeHidden = String(req.query.include_hidden || '').trim() === 'true';

    const result = await pool.query(`
      SELECT
        bat.*,
        (SELECT COUNT(*) FROM restaurants r WHERE r.activity_type_id = bat.id) AS restaurants_count
      FROM business_activity_types bat
      ${includeHidden ? '' : 'WHERE bat.is_visible = true'}
      ORDER BY bat.sort_order ASC, bat.name ASC, bat.id ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Get activity types error:', error);
    res.status(500).json({ error: 'Ошибка получения видов деятельности' });
  }
});

router.post('/activity-types', async (req, res) => {
  try {
    await ensureActivityTypesSchema();
    const name = String(req.body?.name || '').trim();
    const sortOrder = Number.isFinite(Number(req.body?.sort_order)) ? parseInt(req.body.sort_order, 10) : 0;
    const isVisible = req.body?.is_visible !== undefined ? !!req.body.is_visible : true;

    if (!name) {
      return res.status(400).json({ error: 'Название вида деятельности обязательно' });
    }

    const result = await pool.query(
      `INSERT INTO business_activity_types (name, sort_order, is_visible)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, sortOrder, isVisible]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'Такой вид деятельности уже существует' });
    }
    console.error('Create activity type error:', error);
    res.status(500).json({ error: 'Ошибка создания вида деятельности' });
  }
});

router.put('/activity-types/:id', async (req, res) => {
  try {
    await ensureActivityTypesSchema();
    const activityTypeId = parseInt(req.params.id, 10);
    if (!Number.isFinite(activityTypeId) || activityTypeId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID вида деятельности' });
    }

    const updates = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
      const name = String(req.body.name || '').trim();
      if (!name) {
        return res.status(400).json({ error: 'Название вида деятельности обязательно' });
      }
      params.push(name);
      updates.push(`name = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'sort_order')) {
      params.push(Number.isFinite(Number(req.body.sort_order)) ? parseInt(req.body.sort_order, 10) : 0);
      updates.push(`sort_order = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'is_visible')) {
      params.push(!!req.body.is_visible);
      updates.push(`is_visible = $${params.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Нет данных для обновления' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(activityTypeId);

    const result = await pool.query(
      `UPDATE business_activity_types
       SET ${updates.join(', ')}
       WHERE id = $${params.length}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Вид деятельности не найден' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'Такой вид деятельности уже существует' });
    }
    console.error('Update activity type error:', error);
    res.status(500).json({ error: 'Ошибка обновления вида деятельности' });
  }
});

router.patch('/activity-types/:id/visibility', async (req, res) => {
  try {
    await ensureActivityTypesSchema();
    const activityTypeId = parseInt(req.params.id, 10);
    if (!Number.isFinite(activityTypeId) || activityTypeId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID вида деятельности' });
    }

    const result = await pool.query(
      `UPDATE business_activity_types
       SET is_visible = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [!!req.body?.is_visible, activityTypeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Вид деятельности не найден' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Toggle activity type visibility error:', error);
    res.status(500).json({ error: 'Ошибка изменения отображения вида деятельности' });
  }
});

// =====================================================
// БИЛЛИНГ И БАЛАНС (СУПЕРАДМИН)
// =====================================================

// =====================================================
// ШАБЛОНЫ МЕБЕЛИ БРОНИРОВАНИЯ (СУПЕРАДМИН)
// =====================================================

router.get('/reservation-table-templates', async (req, res) => {
  try {
    await ensureActivityTypesSchema();
    await ensureReservationSchema();
    const result = await pool.query(`
      SELECT
        tpl.*,
        bat.name AS activity_type_name,
        (
          SELECT COUNT(*)
          FROM reservation_tables t
          WHERE t.template_id = tpl.id
        ) AS tables_count
      FROM reservation_table_templates tpl
      LEFT JOIN business_activity_types bat ON bat.id = tpl.activity_type_id
      ORDER BY tpl.is_system DESC, tpl.name ASC, tpl.id ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get reservation templates (superadmin) error:', error);
    res.status(500).json({ error: 'Ошибка получения шаблонов мебели' });
  }
});

router.post('/reservation-table-templates', async (req, res) => {
  try {
    await ensureActivityTypesSchema();
    await ensureReservationSchema();
    const name = String(req.body?.name || '').trim();
    const imageUrl = normalizeReservationTemplateImageUrl(req.body?.image_url);
    const shape = normalizeReservationTemplateShape(req.body?.shape, 'custom');
    const furnitureCategory = normalizeReservationFurnitureCategory(req.body?.furniture_category, 'tables_chairs');
    const activityTypeId = normalizeActivityTypeId(req.body?.activity_type_id);
    const seatsCount = Math.max(1, parseReservationTemplateInt(req.body?.seats_count, 2));
    const width = Math.max(0.2, parseReservationTemplateFloat(req.body?.width, 1));
    const height = Math.max(0.2, parseReservationTemplateFloat(req.body?.height, 1));

    if (!name) {
      return res.status(400).json({ error: 'Название мебели обязательно' });
    }
    if (!imageUrl) {
      return res.status(400).json({ error: 'Изображение мебели обязательно' });
    }
    if (activityTypeId) {
      const activityTypeResult = await pool.query(
        'SELECT id FROM business_activity_types WHERE id = $1 LIMIT 1',
        [activityTypeId]
      );
      if (!activityTypeResult.rows.length) {
        return res.status(400).json({ error: 'Выбранный вид деятельности не найден' });
      }
    }

    let code = normalizeReservationTemplateCode(req.body?.code || name);
    if (!code) {
      code = generateReservationTemplateCode(name);
    }

    const tryInsert = async (codeValue) => pool.query(
      `INSERT INTO reservation_table_templates (
         code, name, shape, image_url, furniture_category, activity_type_id, seats_count, width, height, is_system
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
       RETURNING *`,
      [codeValue, name, shape, imageUrl, furnitureCategory, activityTypeId, seatsCount, width, height]
    );

    try {
      const result = await tryInsert(code);
      return res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error?.code !== '23505') throw error;
      const result = await tryInsert(generateReservationTemplateCode(name));
      return res.status(201).json(result.rows[0]);
    }
  } catch (error) {
    console.error('Create reservation template (superadmin) error:', error);
    res.status(500).json({ error: 'Ошибка создания шаблона мебели' });
  }
});

router.put('/reservation-table-templates/:id', async (req, res) => {
  try {
    await ensureActivityTypesSchema();
    await ensureReservationSchema();
    const templateId = parseReservationTemplateInt(req.params.id, 0);
    if (!templateId) {
      return res.status(400).json({ error: 'Некорректный ID шаблона' });
    }

    const existingResult = await pool.query(
      'SELECT id, is_system FROM reservation_table_templates WHERE id = $1 LIMIT 1',
      [templateId]
    );
    if (!existingResult.rows.length) {
      return res.status(404).json({ error: 'Шаблон мебели не найден' });
    }

    const updates = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
      const name = String(req.body?.name || '').trim();
      if (!name) {
        return res.status(400).json({ error: 'Название мебели обязательно' });
      }
      params.push(name);
      updates.push(`name = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'shape')) {
      params.push(normalizeReservationTemplateShape(req.body?.shape, 'custom'));
      updates.push(`shape = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'furniture_category')) {
      params.push(normalizeReservationFurnitureCategory(req.body?.furniture_category, 'tables_chairs'));
      updates.push(`furniture_category = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'activity_type_id')) {
      const activityTypeId = normalizeActivityTypeId(req.body?.activity_type_id);
      if (activityTypeId) {
        const activityTypeResult = await pool.query(
          'SELECT id FROM business_activity_types WHERE id = $1 LIMIT 1',
          [activityTypeId]
        );
        if (!activityTypeResult.rows.length) {
          return res.status(400).json({ error: 'Выбранный вид деятельности не найден' });
        }
      }
      params.push(activityTypeId);
      updates.push(`activity_type_id = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'seats_count')) {
      params.push(Math.max(1, parseReservationTemplateInt(req.body?.seats_count, 2)));
      updates.push(`seats_count = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'width')) {
      params.push(Math.max(0.2, parseReservationTemplateFloat(req.body?.width, 1)));
      updates.push(`width = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'height')) {
      params.push(Math.max(0.2, parseReservationTemplateFloat(req.body?.height, 1)));
      updates.push(`height = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'image_url')) {
      const imageUrl = normalizeReservationTemplateImageUrl(req.body?.image_url);
      if (!imageUrl) {
        return res.status(400).json({ error: 'Изображение мебели обязательно' });
      }
      params.push(imageUrl);
      updates.push(`image_url = $${params.length}`);
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'Нет данных для обновления' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(templateId);
    const result = await pool.query(
      `UPDATE reservation_table_templates
       SET ${updates.join(', ')}
       WHERE id = $${params.length}
       RETURNING *`,
      params
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update reservation template (superadmin) error:', error);
    res.status(500).json({ error: 'Ошибка обновления шаблона мебели' });
  }
});

router.delete('/reservation-table-templates/:id', async (req, res) => {
  try {
    await ensureReservationSchema();
    const templateId = parseReservationTemplateInt(req.params.id, 0);
    if (!templateId) {
      return res.status(400).json({ error: 'Некорректный ID шаблона' });
    }

    const existingResult = await pool.query(
      'SELECT id, is_system, name FROM reservation_table_templates WHERE id = $1 LIMIT 1',
      [templateId]
    );
    if (!existingResult.rows.length) {
      return res.status(404).json({ error: 'Шаблон мебели не найден' });
    }
    if (existingResult.rows[0].is_system) {
      return res.status(403).json({ error: 'Системный шаблон удалить нельзя' });
    }

    const usageResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM reservation_tables WHERE template_id = $1',
      [templateId]
    );
    const usageCount = Number(usageResult.rows[0]?.total || 0);
    if (usageCount > 0) {
      return res.status(409).json({ error: 'Шаблон используется в столах. Сначала отвяжите его от столов.' });
    }

    await pool.query('DELETE FROM reservation_table_templates WHERE id = $1', [templateId]);
    res.json({ message: 'Шаблон мебели удален' });
  } catch (error) {
    console.error('Delete reservation template (superadmin) error:', error);
    res.status(500).json({ error: 'Ошибка удаления шаблона мебели' });
  }
});

// Получить глобальные настройки биллинга (реквизиты)
router.get('/billing-settings', async (req, res) => {
  try {
    await ensureBillingSettingsSchema();
    const result = await pool.query('SELECT * FROM billing_settings WHERE id = 1');
    const payload = await enrichBillingSettingsWithCentralBotMeta(result.rows[0] || {});
    res.json(payload);
  } catch (error) {
    console.error('Get billing settings error:', error);
    res.status(500).json({ error: 'Ошибка получения настроек биллинга' });
  }
});

// Обновить глобальные настройки биллинга
router.put('/billing-settings', async (req, res) => {
  try {
    await ensureBillingSettingsSchema();
    const {
      card_number, card_holder, phone_number, telegram_username,
      click_link, payme_link,
      default_starting_balance, default_order_cost,
      superadmin_bot_token,
      superadmin_telegram_id,
      catalog_animation_season
    } = req.body;

    const normalizedToken = normalizeTokenValue(superadmin_bot_token);
    const normalizedSuperadminTelegramId = normalizeTelegramIdValue(superadmin_telegram_id);
    const normalizedCatalogAnimationSeason = normalizeCatalogAnimationSeason(catalog_animation_season, 'off');
    const previousSettings = await pool.query(
      'SELECT superadmin_bot_token FROM billing_settings WHERE id = 1'
    );
    const previousToken = normalizeTokenValue(previousSettings.rows[0]?.superadmin_bot_token);

    const result = await pool.query(`
      UPDATE billing_settings 
      SET card_number = $1, card_holder = $2, phone_number = $3, 
          telegram_username = $4, click_link = $5, payme_link = $6,
          default_starting_balance = $7, default_order_cost = $8,
          superadmin_bot_token = $9,
          superadmin_telegram_id = $10,
          catalog_animation_season = $11,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
      RETURNING *
    `, [
      card_number, card_holder, phone_number, telegram_username,
      click_link, payme_link,
      parseFloat(default_starting_balance) || 100000,
      parseFlexibleAmount(default_order_cost, 1000),
      normalizedToken,
      normalizedSuperadminTelegramId,
      normalizedCatalogAnimationSeason
    ]);

    try {
      await reloadBot();
    } catch (reloadErr) {
      console.error('Bot reload warning after settings update:', reloadErr.message);
    }

    if (normalizedToken && normalizedToken !== previousToken) {
      try {
        const notificationTargetId = normalizeTelegramIdValue(result.rows[0]?.superadmin_telegram_id) || req.user.telegram_id;
        await notifySuperadminTokenChanged(notificationTargetId);
      } catch (notifyErr) {
        console.error('Bot token change notification warning:', notifyErr.message);
      }
    }

    const payload = await enrichBillingSettingsWithCentralBotMeta(result.rows[0]);
    res.json(payload);
  } catch (error) {
    console.error('Update billing settings error:', error);
    res.status(500).json({ error: 'Ошибка обновления настроек биллинга' });
  }
});

// Пополнить баланс ресторана вручную
router.post('/restaurants/:id/topup', async (req, res) => {
  const client = await pool.connect();
  try {
    const { amount, description } = req.body;
    const restaurantId = req.params.id;
    const amountValue = Number(amount);

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return res.status(400).json({ error: 'Некорректная сумма пополнения' });
    }

    await client.query('BEGIN');

    // Update restaurant balance
    const updatedRest = await client.query(`
      UPDATE restaurants 
      SET balance = balance + $1 
      WHERE id = $2 
      RETURNING id, name, balance, currency_code
    `, [amountValue, restaurantId]);

    if (updatedRest.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    // Record transaction
    const transactionResult = await client.query(`
      INSERT INTO billing_transactions (restaurant_id, user_id, amount, type, description)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, restaurant_id, user_id, amount, type, description, created_at
    `, [restaurantId, req.user.id, amountValue, 'deposit', description || 'Ручное пополнение суперадмином']);

    await client.query('COMMIT');

    // Notify all operators of this restaurant in Telegram
    try {
      const operators = await pool.query(`
        SELECT COALESCE(u.telegram_id, tal.telegram_id) AS telegram_id, u.full_name 
        FROM users u
        INNER JOIN operator_restaurants opr ON u.id = opr.user_id
        LEFT JOIN telegram_admin_links tal ON tal.user_id = u.id
        WHERE opr.restaurant_id = $1 AND COALESCE(u.telegram_id, tal.telegram_id) IS NOT NULL
      `, [restaurantId]);

      for (const op of operators.rows) {
        await sendBalanceNotification(op.telegram_id, amountValue, updatedRest.rows[0].balance);
      }
    } catch (notifErr) {
      console.error('Notification error on topup:', notifErr.message);
    }

    res.json({
      ...updatedRest.rows[0],
      transaction: transactionResult.rows[0] || null
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Restaurant topup error:', error);
    res.status(500).json({ error: 'Ошибка пополнения баланса' });
  } finally {
    client.release();
  }
});

// История операций по балансу ресторана
router.get('/restaurants/:id/billing-transactions', async (req, res) => {
  try {
    const restaurantId = req.params.id;
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 30;

    const restaurantResult = await pool.query(
      'SELECT id, name, balance, currency_code FROM restaurants WHERE id = $1',
      [restaurantId]
    );
    if (!restaurantResult.rows.length) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    const transactionsResult = await pool.query(`
      SELECT
        bt.id,
        bt.restaurant_id,
        bt.user_id,
        bt.amount,
        bt.type,
        bt.description,
        bt.created_at,
        u.username AS actor_username,
        COALESCE(NULLIF(BTRIM(u.full_name), ''), NULLIF(BTRIM(u.username), ''), 'Система') AS actor_name
      FROM billing_transactions bt
      LEFT JOIN users u ON u.id = bt.user_id
      WHERE bt.restaurant_id = $1
        AND bt.type IN ('deposit', 'refund')
      ORDER BY bt.created_at DESC, bt.id DESC
      LIMIT $2
    `, [restaurantId, limit]);

    res.json({
      restaurant: restaurantResult.rows[0],
      transactions: transactionsResult.rows
    });
  } catch (error) {
    console.error('Billing transactions fetch error:', error);
    res.status(500).json({ error: 'Ошибка получения истории операций' });
  }
});

// Общий журнал пополнений/возвратов по всем магазинам
router.get('/billing/transactions', async (req, res) => {
  try {
    const parsedPage = Number.parseInt(req.query.page, 10);
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 20;
    const offset = (page - 1) * limit;

    const parsedRestaurantId = Number.parseInt(req.query.restaurant_id, 10);
    const restaurantId = Number.isFinite(parsedRestaurantId) && parsedRestaurantId > 0
      ? parsedRestaurantId
      : null;
    const typeFilterRaw = String(req.query.type || '').trim().toLowerCase();
    const typeFilter = ['deposit', 'refund'].includes(typeFilterRaw) ? typeFilterRaw : null;
    const search = String(req.query.search || '').trim();
    const startDate = String(req.query.start_date || '').trim();
    const endDate = String(req.query.end_date || '').trim();
    const validDatePattern = /^\d{4}-\d{2}-\d{2}$/;

    const whereParts = [`bt.type IN ('deposit', 'refund')`];
    const params = [];

    if (restaurantId) {
      params.push(restaurantId);
      whereParts.push(`bt.restaurant_id = $${params.length}`);
    }

    if (typeFilter) {
      params.push(typeFilter);
      whereParts.push(`bt.type = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      whereParts.push(`(
        bt.description ILIKE $${params.length}
        OR r.name ILIKE $${params.length}
        OR u.username ILIKE $${params.length}
        OR COALESCE(u.full_name, '') ILIKE $${params.length}
      )`);
    }

    if (validDatePattern.test(startDate)) {
      params.push(startDate);
      whereParts.push(`bt.created_at::date >= $${params.length}`);
    }

    if (validDatePattern.test(endDate)) {
      params.push(endDate);
      whereParts.push(`bt.created_at::date <= $${params.length}`);
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM billing_transactions bt
      INNER JOIN restaurants r ON r.id = bt.restaurant_id
      LEFT JOIN users u ON u.id = bt.user_id
      ${whereSql}
    `;
    const totalResult = await pool.query(countQuery, params);
    const total = Number(totalResult.rows?.[0]?.total || 0);

    const listParams = [...params, limit, offset];
    const rowsQuery = `
      SELECT
        bt.id,
        bt.restaurant_id,
        bt.user_id,
        bt.amount,
        bt.type,
        bt.description,
        bt.created_at,
        r.name AS restaurant_name,
        r.currency_code AS restaurant_currency_code,
        u.username AS actor_username,
        COALESCE(NULLIF(BTRIM(u.full_name), ''), NULLIF(BTRIM(u.username), ''), 'Система') AS actor_name
      FROM billing_transactions bt
      INNER JOIN restaurants r ON r.id = bt.restaurant_id
      LEFT JOIN users u ON u.id = bt.user_id
      ${whereSql}
      ORDER BY bt.created_at DESC, bt.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `;
    const rowsResult = await pool.query(rowsQuery, listParams);

    res.json({
      transactions: rowsResult.rows || [],
      total,
      page,
      limit
    });
  } catch (error) {
    console.error('Billing transactions list error:', error);
    res.status(500).json({ error: 'Ошибка получения журнала операций' });
  }
});

// Возврат средств с баланса ресторана
router.post('/restaurants/:id/refund', async (req, res) => {
  const client = await pool.connect();
  try {
    const { amount, description } = req.body;
    const restaurantId = req.params.id;
    const amountValue = Number(amount);

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return res.status(400).json({ error: 'Некорректная сумма возврата' });
    }

    await client.query('BEGIN');

    const restaurantResult = await client.query(
      'SELECT id, name, balance, currency_code FROM restaurants WHERE id = $1 FOR UPDATE',
      [restaurantId]
    );
    if (!restaurantResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    const currentBalance = Number(restaurantResult.rows[0].balance || 0);
    if (currentBalance < amountValue) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Недостаточно средств на балансе для возврата' });
    }

    const updatedRest = await client.query(`
      UPDATE restaurants
      SET balance = balance - $1
      WHERE id = $2
      RETURNING id, name, balance, currency_code
    `, [amountValue, restaurantId]);

    const transactionResult = await client.query(`
      INSERT INTO billing_transactions (restaurant_id, user_id, amount, type, description)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, restaurant_id, user_id, amount, type, description, created_at
    `, [restaurantId, req.user.id, amountValue, 'refund', description || 'Ручной возврат суперадмином']);

    await client.query('COMMIT');

    res.json({
      ...updatedRest.rows[0],
      transaction: transactionResult.rows[0] || null
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Restaurant refund error:', error);
    res.status(500).json({ error: 'Ошибка возврата средств' });
  } finally {
    client.release();
  }
});

// Изменить статус бесплатного тарифа
router.patch('/restaurants/:id/free-tier', async (req, res) => {
  try {
    const { is_free_tier } = req.body;
    const result = await pool.query(
      'UPDATE restaurants SET is_free_tier = $1 WHERE id = $2 RETURNING id, is_free_tier',
      [is_free_tier, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Free tier toggle error:', error);
    res.status(500).json({ error: 'Ошибка изменения тарифа' });
  }
});

// Переключить статус "Бесплатный тариф"
router.post('/restaurants/:id/toggle-free', async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE restaurants 
      SET is_free_tier = NOT is_free_tier 
      WHERE id = $1 
      RETURNING id, is_free_tier
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Toggle free tier error:', error);
    res.status(500).json({ error: 'Ошибка изменения тарифа' });
  }
});


// Получить один ресторан
router.get('/restaurants/:id', async (req, res) => {
  try {
    await ensureActivityTypesSchema();
    await ensureRestaurantCurrencySchema();
    await ensureReservationSchema();
    const result = await pool.query(`
      SELECT r.*,
        bat.name AS activity_type_name,
        bat.is_visible AS activity_type_is_visible,
        COALESCE(rs.enabled, false) AS reservation_enabled_setting,
        COALESCE(rs.reservation_service_cost, COALESCE(r.reservation_cost, 0)) AS reservation_service_cost,
        (SELECT COUNT(*) FROM operator_restaurants WHERE restaurant_id = r.id) as operators_count
      FROM restaurants r
      LEFT JOIN business_activity_types bat ON bat.id = r.activity_type_id
      LEFT JOIN restaurant_reservation_settings rs ON rs.restaurant_id = r.id
      WHERE r.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    // Get operators for this restaurant
    const operatorsResult = await pool.query(`
      SELECT u.id, u.username, u.full_name, u.phone
      FROM users u
      INNER JOIN operator_restaurants opr ON u.id = opr.user_id
      WHERE opr.restaurant_id = $1
    `, [req.params.id]);

    const restaurant = {
      ...result.rows[0],
      reservation_enabled: result.rows[0].reservation_enabled_setting === true || result.rows[0].reservation_enabled_setting === 'true'
    };
    restaurant.operators = operatorsResult.rows;

    res.json(restaurant);
  } catch (error) {
    console.error('Get restaurant error:', error);
    res.status(500).json({ error: 'Ошибка получения ресторана' });
  }
});

// Создать ресторан
router.post('/restaurants', async (req, res) => {
  try {
    await ensureActivityTypesSchema();
    await ensureRestaurantCurrencySchema();
    const {
      name, address, phone, logo_url, logo_display_mode, ui_theme, delivery_zone, telegram_bot_token, telegram_group_id,
      operator_registration_code, start_time, end_time, click_url, payme_url, is_delivery_enabled,
      payme_enabled, payme_merchant_id, payme_api_login, payme_api_password, payme_account_key, payme_test_mode, payme_callback_timeout_ms,
      reservation_enabled
    } = req.body;
    const normalizedBotToken = telegram_bot_token === undefined || telegram_bot_token === null
      ? null
      : String(telegram_bot_token).trim();
    const normalizedGroupId = telegram_group_id === undefined || telegram_group_id === null
      ? null
      : String(telegram_group_id).trim();
    const normalizedLogoDisplayMode = normalizeLogoDisplayMode(logo_display_mode, 'square');
    const normalizedUiTheme = normalizeUiTheme(ui_theme, 'talablar_blue');
    const activityTypeId = normalizeActivityTypeId(req.body?.activity_type_id);
    const normalizedCurrencyCode = normalizeRestaurantCurrencyCode(req.body?.currency_code, 'uz');
    const normalizedSizeVariantsEnabled = normalizeBooleanFlag(req.body?.size_variants_enabled, false);

    if (!name) {
      return res.status(400).json({ error: 'Название ресторана обязательно' });
    }

    if (activityTypeId) {
      const activityTypeResult = await pool.query(
        'SELECT id FROM business_activity_types WHERE id = $1 LIMIT 1',
        [activityTypeId]
      );
      if (activityTypeResult.rows.length === 0) {
        return res.status(400).json({ error: 'Выбранный вид деятельности не найден' });
      }
    }

    console.log('📍 Creating restaurant with delivery_zone:', delivery_zone);

    // Get default billing settings
    const settingsResult = await pool.query('SELECT default_starting_balance, default_order_cost FROM billing_settings WHERE id = 1');
    const settings = settingsResult.rows[0] || { default_starting_balance: 100000, default_order_cost: 1000 };
    const parsedServiceFee = parseFlexibleAmount(req.body.service_fee, 0);
    const parsedReservationCost = parseFlexibleAmount(req.body.reservation_cost, 0);
    const parsedOrderCost = req.body.service_fee !== undefined
      ? parsedServiceFee
      : parseFlexibleAmount(settings.default_order_cost, 1000);
    await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_cost DECIMAL(12, 2) DEFAULT 0');

    const result = await pool.query(`
      INSERT INTO restaurants (
        name, address, phone, logo_url, delivery_zone, 
        logo_display_mode, ui_theme,
        telegram_bot_token, telegram_group_id, operator_registration_code, start_time, end_time, 
        click_url, payme_url, is_delivery_enabled, service_fee,
        balance, order_cost, activity_type_id, currency_code,
        payme_enabled, payme_merchant_id, payme_api_login, payme_api_password, payme_account_key, payme_test_mode, payme_callback_timeout_ms,
        size_variants_enabled
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
      RETURNING *
    `, [
      name,
      address,
      phone,
      logo_url,
      delivery_zone ? JSON.stringify(delivery_zone) : null,
      normalizedLogoDisplayMode,
      normalizedUiTheme,
      normalizedBotToken,
      normalizedGroupId,
      operator_registration_code || null,
      start_time,
      end_time,
      click_url || null,
      payme_url || null,
      is_delivery_enabled !== undefined ? is_delivery_enabled : true,
      parsedServiceFee,
      settings.default_starting_balance,
      parsedOrderCost,
      activityTypeId,
      normalizedCurrencyCode,
      payme_enabled === true || payme_enabled === 'true',
      payme_merchant_id || null,
      payme_api_login || null,
      payme_api_password || null,
      payme_account_key || 'order_id',
      payme_test_mode === true || payme_test_mode === 'true',
      Number.isInteger(Number(payme_callback_timeout_ms)) ? Number(payme_callback_timeout_ms) : 2000,
      normalizedSizeVariantsEnabled
    ]);


    await pool.query(
      'UPDATE restaurants SET reservation_cost = $1 WHERE id = $2',
      [parsedReservationCost, result.rows[0].id]
    );

    const reservationEnabled = reservation_enabled === true || reservation_enabled === 'true';
    await ensureRestaurantReservationSettingsRow(pool, result.rows[0].id);
    await pool.query(
      `UPDATE restaurant_reservation_settings
       SET enabled = $1,
           reservation_service_cost = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE restaurant_id = $3`,
      [reservationEnabled, parsedReservationCost, result.rows[0].id]
    );

    const restaurant = {
      ...result.rows[0],
      reservation_cost: parsedReservationCost,
      reservation_enabled: reservationEnabled,
      reservation_service_cost: parsedReservationCost
    };

    try {
      await reloadMultiBots();
    } catch (reloadErr) {
      console.error('Multi-bot reload warning after restaurant create:', reloadErr.message);
    }

    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: restaurant.id,
      actionType: ACTION_TYPES.CREATE_RESTAURANT,
      entityType: ENTITY_TYPES.RESTAURANT,
      entityId: restaurant.id,
      entityName: restaurant.name,
      newValues: restaurant,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.status(201).json(restaurant);
  } catch (error) {
    console.error('Create restaurant error:', error);
    res.status(500).json({ error: 'Ошибка создания ресторана' });
  }
});

// Обновить ресторан
router.put('/restaurants/:id', async (req, res) => {
  try {
    await ensureActivityTypesSchema();
    await ensureRestaurantCurrencySchema();
    const {
      name, address, phone, logo_url, logo_display_mode, ui_theme, delivery_zone, telegram_bot_token, telegram_group_id,
      operator_registration_code, is_active, start_time, end_time, click_url, payme_url, support_username, service_fee, reservation_cost,
      latitude, longitude, delivery_base_radius, delivery_base_price, delivery_price_per_km, is_delivery_enabled,
      payme_enabled, payme_merchant_id, payme_api_login, payme_api_password, payme_account_key, payme_test_mode, payme_callback_timeout_ms,
      currency_code, reservation_enabled
    } = req.body;
    const normalizedBotToken = telegram_bot_token === undefined || telegram_bot_token === null
      ? null
      : String(telegram_bot_token).trim();
    const normalizedGroupId = telegram_group_id === undefined || telegram_group_id === null
      ? null
      : String(telegram_group_id).trim();
    const hasActivityTypeField = Object.prototype.hasOwnProperty.call(req.body || {}, 'activity_type_id');
    const activityTypeId = normalizeActivityTypeId(req.body?.activity_type_id);

    // Get old values for logging
    const oldResult = await pool.query('SELECT * FROM restaurants WHERE id = $1', [req.params.id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }
    const oldValues = oldResult.rows[0];
    const normalizedLogoDisplayMode = normalizeLogoDisplayMode(logo_display_mode, oldValues.logo_display_mode || 'square');
    const normalizedUiTheme = normalizeUiTheme(ui_theme, oldValues.ui_theme || 'classic');
    const normalizedCurrencyCode = normalizeRestaurantCurrencyCode(currency_code, oldValues.currency_code || 'uz');
    const normalizedSizeVariantsEnabled = normalizeBooleanFlag(
      req.body?.size_variants_enabled,
      oldValues.size_variants_enabled === true
    );
    const previousBotToken = normalizeRestaurantTokenForCompare(oldValues.telegram_bot_token);
    const nextBotToken = normalizedBotToken === null
      ? previousBotToken
      : normalizeRestaurantTokenForCompare(normalizedBotToken);
    const isTokenChanging = normalizedBotToken !== null && nextBotToken !== previousBotToken;

    let customerMigrationResult = null;
    if (isTokenChanging && nextBotToken) {
      customerMigrationResult = await notifyCustomersAboutRestaurantBotMigration({
        restaurantId: parseInt(req.params.id, 10),
        restaurantName: name || oldValues.name || 'Ваш магазин',
        oldToken: oldValues.telegram_bot_token,
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

    console.log('📍 Updating restaurant with delivery_zone:', delivery_zone);
    const parsedServiceFee = parseFlexibleAmount(service_fee, 0);
    const parsedReservationCost = parseFlexibleAmount(
      reservation_cost,
      oldValues.hasOwnProperty('reservation_cost') ? oldValues.reservation_cost : 0
    );

    // Check if service_fee column exists, if not - create it
    const hasServiceFee = oldValues.hasOwnProperty('service_fee');
    if (!hasServiceFee) {
      try {
        await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS service_fee DECIMAL(10, 2) DEFAULT 0');
        console.log('✅ Added service_fee column to restaurants');
      } catch (e) {
        console.log('ℹ️ service_fee column:', e.message);
      }
    }

    const hasReservationCost = oldValues.hasOwnProperty('reservation_cost');
    if (!hasReservationCost) {
      try {
        await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_cost DECIMAL(12, 2) DEFAULT 0');
        console.log('✅ Added reservation_cost column to restaurants');
      } catch (e) {
        console.log('ℹ️ reservation_cost column:', e.message);
      }
    }

    // Check if latitude/longitude columns exist
    const hasCoords = oldValues.hasOwnProperty('latitude');
    if (!hasCoords) {
      try {
        await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8)');
        await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8)');
        console.log('✅ Added latitude/longitude columns to restaurants');
      } catch (e) {
        console.log('ℹ️ latitude/longitude columns:', e.message);
      }
    }

    // Check if delivery settings columns exist
    const hasDeliverySettings = oldValues.hasOwnProperty('delivery_base_radius');
    if (!hasDeliverySettings) {
      try {
        await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS delivery_base_radius DECIMAL(5, 2) DEFAULT 2');
        await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS delivery_base_price DECIMAL(10, 2) DEFAULT 5000');
        await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS delivery_price_per_km DECIMAL(10, 2) DEFAULT 2000');
        console.log('✅ Added delivery settings columns to restaurants');
      } catch (e) {
        console.log('ℹ️ delivery settings columns:', e.message);
      }
    }

    // Check if delivery flag exists
    const hasDeliveryFlag = oldValues.hasOwnProperty('is_delivery_enabled');
    if (!hasDeliveryFlag) {
      try {
        await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS is_delivery_enabled BOOLEAN DEFAULT true');
        console.log('✅ Added is_delivery_enabled column to restaurants');
      } catch (e) {
        console.log('ℹ️ is_delivery_enabled column:', e.message);
      }
    }

    if (hasActivityTypeField && activityTypeId) {
      const activityTypeResult = await pool.query(
        'SELECT id FROM business_activity_types WHERE id = $1 LIMIT 1',
        [activityTypeId]
      );
      if (activityTypeResult.rows.length === 0) {
        return res.status(400).json({ error: 'Выбранный вид деятельности не найден' });
      }
    }

    // Now update with all fields including coordinates and delivery settings
    const result = await pool.query(`
      UPDATE restaurants 
      SET name = COALESCE($1, name),
          address = COALESCE($2, address),
          phone = COALESCE($3, phone),
          logo_url = $4,
          logo_display_mode = $5,
          delivery_zone = $6,
          telegram_bot_token = COALESCE($7, telegram_bot_token),
          telegram_group_id = COALESCE($8, telegram_group_id),
          is_active = COALESCE($9, is_active),
          start_time = $10,
          end_time = $11,
          click_url = $12,
          payme_url = $13,
          support_username = $14,
          operator_registration_code = $15,
          service_fee = $16,
          latitude = $17,
          longitude = $18,
          delivery_base_radius = $19,
          delivery_base_price = $20,
          delivery_price_per_km = $21,
          is_delivery_enabled = $22,
          order_cost = $23,
          activity_type_id = $24,
          payme_enabled = $25,
          payme_merchant_id = $26,
          payme_api_login = $27,
          payme_api_password = $28,
           payme_account_key = $29,
           payme_test_mode = $30,
           payme_callback_timeout_ms = $31,
           currency_code = $32,
           ui_theme = $33,
           size_variants_enabled = $34,
           updated_at = CURRENT_TIMESTAMP
      WHERE id = $35
      RETURNING *
    `, [
      name,
      address,
      phone,
      logo_url,
      normalizedLogoDisplayMode,
      delivery_zone ? JSON.stringify(delivery_zone) : null,
      normalizedBotToken,
      normalizedGroupId,
      is_active,
      start_time || null,
      end_time || null,
      click_url || null,
      payme_url || null,
      support_username || null,
      operator_registration_code || null,
      parsedServiceFee,
      latitude ? parseFloat(latitude) : null,
      longitude ? parseFloat(longitude) : null,
      parseFloat(delivery_base_radius) || 0,
      parseFloat(delivery_base_price) || 0,
      parseFloat(delivery_price_per_km) || 0,
      is_delivery_enabled !== undefined ? is_delivery_enabled : true,
      parsedServiceFee,
      hasActivityTypeField ? activityTypeId : oldValues.activity_type_id || null,
      payme_enabled === true || payme_enabled === 'true',
      payme_merchant_id || null,
      payme_api_login || null,
      payme_api_password || null,
      payme_account_key || 'order_id',
      payme_test_mode === true || payme_test_mode === 'true',
      Number.isInteger(Number(payme_callback_timeout_ms)) ? Number(payme_callback_timeout_ms) : 2000,
      normalizedCurrencyCode,
      normalizedUiTheme,
      normalizedSizeVariantsEnabled,
      req.params.id
    ]);

    await pool.query(
      'UPDATE restaurants SET reservation_cost = $1 WHERE id = $2',
      [parsedReservationCost, req.params.id]
    );

    const reservationEnabled = reservation_enabled === true || reservation_enabled === 'true';
    await ensureRestaurantReservationSettingsRow(pool, req.params.id);
    await pool.query(
      `UPDATE restaurant_reservation_settings
       SET enabled = $1,
           reservation_service_cost = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE restaurant_id = $3`,
      [reservationEnabled, parsedReservationCost, req.params.id]
    );

    const restaurant = {
      ...result.rows[0],
      reservation_cost: parsedReservationCost,
      reservation_enabled: reservationEnabled,
      reservation_service_cost: parsedReservationCost
    };

    try {
      await reloadMultiBots();
    } catch (reloadErr) {
      console.error('Multi-bot reload warning after restaurant update:', reloadErr.message);
    }

    let operatorNotificationResult = null;
    try {
      operatorNotificationResult = await notifyRestaurantTokenChanged({
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        oldToken: oldValues.telegram_bot_token,
        newToken: restaurant.telegram_bot_token
      });
    } catch (notifyErr) {
      console.error('Restaurant token change notification warning:', notifyErr.message);
    }

    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: restaurant.id,
      actionType: ACTION_TYPES.UPDATE_RESTAURANT,
      entityType: ENTITY_TYPES.RESTAURANT,
      entityId: restaurant.id,
      entityName: restaurant.name,
      oldValues,
      newValues: restaurant,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.json({
      ...restaurant,
      token_migration: customerMigrationResult,
      operator_notification: operatorNotificationResult
    });
  } catch (error) {
    console.error('Update restaurant error:', error);
    res.status(500).json({ error: 'Ошибка обновления ресторана' });
  }
});

// Обновить внутренний комментарий магазина (для супер-админа)
router.put('/restaurants/:id/admin-comment', async (req, res) => {
  try {
    await ensureRestaurantAdminCommentSchema();
    const restaurantId = parseInt(req.params.id, 10);
    if (!Number.isFinite(restaurantId) || restaurantId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID ресторана' });
    }

    const oldResult = await pool.query(
      'SELECT id, name, admin_comment, admin_comment_checklist FROM restaurants WHERE id = $1 LIMIT 1',
      [restaurantId]
    );
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    const adminComment = normalizeRestaurantAdminComment(req.body?.admin_comment);
    const adminChecklist = normalizeRestaurantAdminChecklist(req.body?.admin_comment_checklist);
    const updateResult = await pool.query(
      `UPDATE restaurants
       SET admin_comment = $1,
           admin_comment_checklist = $2::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, name, admin_comment, admin_comment_checklist`,
      [adminComment, JSON.stringify(adminChecklist), restaurantId]
    );

    const updatedRow = updateResult.rows[0];
    await logActivity({
      userId: req.user.id,
      restaurantId,
      actionType: ACTION_TYPES.UPDATE_RESTAURANT,
      entityType: ENTITY_TYPES.RESTAURANT,
      entityId: restaurantId,
      entityName: updatedRow.name,
      oldValues: {
        admin_comment: oldResult.rows[0].admin_comment || null,
        admin_comment_checklist: Array.isArray(oldResult.rows[0].admin_comment_checklist) ? oldResult.rows[0].admin_comment_checklist : []
      },
      newValues: {
        admin_comment: updatedRow.admin_comment || null,
        admin_comment_checklist: Array.isArray(updatedRow.admin_comment_checklist) ? updatedRow.admin_comment_checklist : []
      },
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.json(updatedRow);
  } catch (error) {
    console.error('Update restaurant admin comment error:', error);
    res.status(500).json({ error: 'Ошибка сохранения комментария' });
  }
});

// Получить шаблоны сообщений ресторана
router.get('/restaurants/:id/messages', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, msg_new, msg_preparing, msg_delivering, msg_delivered, msg_cancelled 
       FROM restaurants WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get restaurant messages error:', error);
    res.status(500).json({ error: 'Ошибка получения шаблонов' });
  }
});

// Обновить шаблоны сообщений ресторана
router.put('/restaurants/:id/messages', async (req, res) => {
  try {
    const { msg_new, msg_preparing, msg_delivering, msg_delivered, msg_cancelled } = req.body;

    const result = await pool.query(`
      UPDATE restaurants 
      SET msg_new = $1,
          msg_preparing = $2,
          msg_delivering = $3,
          msg_delivered = $4,
          msg_cancelled = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING id, name, msg_new, msg_preparing, msg_delivering, msg_delivered, msg_cancelled
    `, [
      msg_new || null,
      msg_preparing || null,
      msg_delivering || null,
      msg_delivered || null,
      msg_cancelled || null,
      req.params.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    // Log activity
    await logActivity({
      userId: req.user.id,
      restaurantId: parseInt(req.params.id),
      actionType: ACTION_TYPES.UPDATE_RESTAURANT,
      entityType: ENTITY_TYPES.RESTAURANT,
      entityId: parseInt(req.params.id),
      entityName: result.rows[0].name,
      newValues: { msg_new, msg_preparing, msg_delivering, msg_delivered, msg_cancelled },
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update restaurant messages error:', error);
    res.status(500).json({ error: 'Ошибка обновления шаблонов' });
  }
});

// Удалить ресторан
router.delete('/restaurants/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get restaurant for logging
    const restaurantResult = await client.query('SELECT * FROM restaurants WHERE id = $1', [req.params.id]);
    if (restaurantResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ресторан не найден' });
    }
    const restaurant = restaurantResult.rows[0];

    // Check if there are orders
    const ordersCheck = await client.query('SELECT COUNT(*) FROM orders WHERE restaurant_id = $1', [req.params.id]);
    if (parseInt(ordersCheck.rows[0].count) > 0) {
      // Soft delete - just deactivate
      await client.query('UPDATE restaurants SET is_active = false WHERE id = $1', [req.params.id]);
      await client.query('COMMIT');

      await logActivity({
        userId: req.user.id,
        restaurantId: restaurant.id,
        actionType: ACTION_TYPES.DELETE_RESTAURANT,
        entityType: ENTITY_TYPES.RESTAURANT,
        entityId: restaurant.id,
        entityName: restaurant.name,
        oldValues: restaurant,
        newValues: { is_active: false },
        ipAddress: getIpFromRequest(req),
        userAgent: getUserAgentFromRequest(req)
      });

      try {
        await reloadMultiBots();
      } catch (reloadErr) {
        console.error('Multi-bot reload warning after restaurant deactivate:', reloadErr.message);
      }

      return res.json({ message: 'Ресторан деактивирован (есть связанные заказы)' });
    }

    // Hard delete if no orders
    await client.query('DELETE FROM restaurants WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');

    await logActivity({
      userId: req.user.id,
      actionType: ACTION_TYPES.DELETE_RESTAURANT,
      entityType: ENTITY_TYPES.RESTAURANT,
      entityId: restaurant.id,
      entityName: restaurant.name,
      oldValues: restaurant,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    try {
      await reloadMultiBots();
    } catch (reloadErr) {
      console.error('Multi-bot reload warning after restaurant delete:', reloadErr.message);
    }

    res.json({ message: 'Ресторан удален' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete restaurant error:', error);
    res.status(500).json({ error: 'Ошибка удаления ресторана' });
  } finally {
    client.release();
  }
});

// =====================================================
// ОПЕРАТОРЫ
// =====================================================

// Получить всех операторов
router.get('/operators', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 50, 1);
    const offset = (page - 1) * limit;
    const { role = '', status = '', search = '', restaurant_id = '' } = req.query;

    const whereClauses = [`u.role IN ('operator', 'superadmin')`];
    const params = [];

    if (role === 'operator' || role === 'superadmin') {
      params.push(role);
      whereClauses.push(`u.role = $${params.length}`);
    }

    if (status === 'active') {
      whereClauses.push('u.is_active = true');
    } else if (status === 'inactive') {
      whereClauses.push('u.is_active = false');
    }

    if (restaurant_id) {
      params.push(restaurant_id);
      whereClauses.push(`EXISTS (
        SELECT 1 FROM operator_restaurants opr_filter
        WHERE opr_filter.user_id = u.id AND opr_filter.restaurant_id = $${params.length}
      )`);
    }

    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(`(
        u.full_name ILIKE $${params.length}
        OR u.phone ILIKE $${params.length}
        OR u.username ILIKE $${params.length}
      )`);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT 
        u.id, u.username, u.full_name, u.phone, u.role, u.is_active, u.created_at,
        u.active_restaurant_id, u.telegram_id,
        u.last_activity_at,
        u.last_ip_address,
        u.last_user_agent,
        u.last_device_type,
        u.last_browser_name,
        u.last_browser_version,
        u.last_os_name,
        u.last_os_version,
        u.last_country,
        u.last_region,
        u.last_city,
        ar.name as active_restaurant_name,
        COALESCE(
          json_agg(
            json_build_object('id', r.id, 'name', r.name)
          ) FILTER (WHERE r.id IS NOT NULL),
          '[]'
        ) as restaurants
      FROM users u
      LEFT JOIN restaurants ar ON u.active_restaurant_id = ar.id
      LEFT JOIN operator_restaurants opr ON u.id = opr.user_id
      LEFT JOIN restaurants r ON opr.restaurant_id = r.id
      ${whereSql}
      GROUP BY u.id, ar.name
      ORDER BY u.created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    const rows = Array.isArray(result.rows) ? result.rows : [];
    const missingTelemetryUserIds = rows
      .filter((row) => (
        !row?.last_activity_at
        || !row?.last_ip_address
        || !row?.last_user_agent
        || !row?.last_device_type
        || !row?.last_browser_name
        || !row?.last_os_name
      ))
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    let mergedRows = rows;
    if (missingTelemetryUserIds.length > 0) {
      await refreshUserTelemetryFromActivityLogs({ userIds: missingTelemetryUserIds }).catch(() => {});
      const refreshedTelemetryResult = await pool.query(
        `SELECT
           id,
           last_activity_at,
           last_ip_address,
           last_user_agent,
           last_device_type,
           last_browser_name,
           last_browser_version,
           last_os_name,
           last_os_version,
           last_country,
           last_region,
           last_city
         FROM users
         WHERE id = ANY($1::int[])`,
        [missingTelemetryUserIds]
      );
      const telemetryMap = new Map(
        (refreshedTelemetryResult.rows || []).map((item) => [Number(item.id), item])
      );

      mergedRows = rows.map((row) => {
        const telemetry = telemetryMap.get(Number(row.id));
        if (!telemetry) return row;
        return { ...row, ...telemetry };
      });
    }

    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM users u
      ${whereSql}
    `, params);

    res.json({
      operators: mergedRows.map(normalizeUserIdentityForDisplay),
      total: parseInt(countResult.rows[0].total, 10),
      page,
      limit
    });
  } catch (error) {
    console.error('Get operators error:', error);
    res.status(500).json({ error: 'Ошибка получения операторов' });
  }
});

// =====================================================
// ГЛОБАЛЬНЫЕ ТОВАРЫ (шаблоны для магазинов)
// =====================================================

router.get('/global-products', async (req, res) => {
  try {
    await ensureGlobalProductsSchema();
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const barcode = String(req.query.barcode || '').replace(/\D/g, '').slice(0, 120);
    const includeInactive = ['1', 'true', 'yes'].includes(String(req.query.include_inactive || '').toLowerCase());
    const categoryLevel1Id = Number.parseInt(req.query.category_level1_id, 10);
    const categoryLevel2Id = Number.parseInt(req.query.category_level2_id, 10);
    const categoryLevel3Id = Number.parseInt(req.query.category_level3_id, 10);
    const effectiveCategoryId = Number.isInteger(categoryLevel3Id) && categoryLevel3Id > 0
      ? categoryLevel3Id
      : (Number.isInteger(categoryLevel2Id) && categoryLevel2Id > 0
        ? categoryLevel2Id
        : (Number.isInteger(categoryLevel1Id) && categoryLevel1Id > 0 ? categoryLevel1Id : null));

    const where = [];
    const params = [];

    if (!includeInactive) {
      where.push('gp.is_active = true');
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(gp.name_ru ILIKE $${params.length} OR gp.name_uz ILIKE $${params.length})`);
    }
    if (barcode) {
      params.push(`%${barcode}%`);
      where.push(`REGEXP_REPLACE(COALESCE(gp.barcode, ''), '\\D', '', 'g') LIKE $${params.length}`);
    }
    if (effectiveCategoryId) {
      params.push(effectiveCategoryId);
      where.push(`
        gp.recommended_category_id IN (
          WITH RECURSIVE category_descendants AS (
            SELECT id
            FROM categories
            WHERE id = $${params.length}
            UNION ALL
            SELECT c.id
            FROM categories c
            INNER JOIN category_descendants cd ON cd.id = c.parent_id
          )
          SELECT id FROM category_descendants
        )
      `);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rowsResult = await pool.query(
      `
        SELECT
          gp.*,
          c.name_ru AS recommended_category_name_ru,
          c.name_uz AS recommended_category_name_uz
        FROM global_products gp
        LEFT JOIN categories c ON c.id = gp.recommended_category_id
        ${whereSql}
        ORDER BY gp.updated_at DESC, gp.id DESC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    );
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM global_products gp ${whereSql}`,
      params
    );

    res.json({
      items: rowsResult.rows || [],
      total: Number(countResult.rows?.[0]?.total || 0),
      page,
      limit
    });
  } catch (error) {
    console.error('Get global products error:', error);
    res.status(500).json({ error: 'Ошибка получения глобальных товаров' });
  }
});

router.post('/global-products', async (req, res) => {
  try {
    await ensureGlobalProductsSchema();
    const nameRu = toOptionalTrimmedText(req.body?.name_ru).slice(0, 255);
    if (!nameRu) {
      return res.status(400).json({ error: 'Название (RU) обязательно' });
    }

    const nameUz = toOptionalTrimmedText(req.body?.name_uz).slice(0, 255);
    const descriptionRu = toOptionalTrimmedText(req.body?.description_ru).slice(0, 3000);
    const descriptionUz = toOptionalTrimmedText(req.body?.description_uz).slice(0, 3000);
    const barcode = toOptionalTrimmedText(req.body?.barcode).slice(0, 120);
    const ikpu = toOptionalTrimmedText(req.body?.ikpu).slice(0, 64);
    const recommendedCategoryIdRaw = Number.parseInt(req.body?.recommended_category_id, 10);
    const recommendedCategoryId = Number.isFinite(recommendedCategoryIdRaw) && recommendedCategoryIdRaw > 0
      ? recommendedCategoryIdRaw
      : null;
    const unit = toOptionalTrimmedText(req.body?.unit).slice(0, 32) || 'шт';
    const normalizedOrderStep = Number.parseFloat(String(req.body?.order_step ?? '').replace(',', '.'));
    const orderStep = Number.isFinite(normalizedOrderStep) && normalizedOrderStep > 0
      ? Math.round((normalizedOrderStep + Number.EPSILON) * 100) / 100
      : null;
    const sizeEnabled = req.body?.size_enabled === true || req.body?.size_enabled === 'true';
    const sizeOptions = normalizeGlobalProductVariantOptions(req.body?.size_options);
    const normalizedImages = normalizeGlobalProductImages(req.body?.product_images, GLOBAL_PRODUCT_MAX_IMAGES);
    const fallbackImageUrl = toOptionalTrimmedText(req.body?.image_url);
    const fallbackThumbUrl = toOptionalTrimmedText(req.body?.thumb_url);
    if (normalizedImages.length === 0 && fallbackImageUrl) {
      normalizedImages.push({
        url: fallbackImageUrl,
        ...(fallbackThumbUrl ? { thumb_url: fallbackThumbUrl } : {})
      });
    }
    const mainImage = normalizedImages[0] || null;
    const imageUrl = mainImage?.url || fallbackImageUrl || null;
    const thumbUrl = mainImage?.thumb_url || fallbackThumbUrl || null;

    if (recommendedCategoryId) {
      const categoryExistsResult = await pool.query('SELECT id FROM categories WHERE id = $1 LIMIT 1', [recommendedCategoryId]);
      if (!categoryExistsResult.rows.length) {
        return res.status(400).json({ error: 'Рекомендуемая категория не найдена' });
      }
    }
    const duplicateBarcodeProduct = await findGlobalProductByBarcode(barcode);
    if (duplicateBarcodeProduct) {
      return res.status(409).json({
        error: `Штрихкод уже используется (товар #${duplicateBarcodeProduct.id}: ${duplicateBarcodeProduct.name_ru || 'без названия'})`
      });
    }

    const result = await pool.query(
      `
        INSERT INTO global_products (
          name_ru, name_uz, description_ru, description_uz,
          image_url, thumb_url, product_images, barcode, ikpu,
          recommended_category_id, unit, order_step,
          size_enabled, size_options, is_active,
          created_by, updated_by
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7::jsonb, $8, $9,
          $10, $11, $12,
          $13, $14::jsonb, true,
          $15, $15
        )
        RETURNING *
      `,
      [
        nameRu, nameUz || null, descriptionRu || null, descriptionUz || null,
        imageUrl, thumbUrl, JSON.stringify(normalizedImages), barcode || null, ikpu || null,
        recommendedCategoryId, unit, orderStep,
        sizeEnabled, JSON.stringify(sizeOptions), req.user.id
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error?.code === '23505' && String(error?.constraint || '').includes('uq_global_products_barcode_normalized')) {
      return res.status(409).json({ error: 'Штрихкод уже используется другим глобальным товаром' });
    }
    console.error('Create global product error:', error);
    res.status(500).json({ error: 'Ошибка создания глобального товара' });
  }
});

router.put('/global-products/:id', async (req, res) => {
  try {
    await ensureGlobalProductsSchema();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'Некорректный ID товара' });
    }

    const oldResult = await pool.query('SELECT * FROM global_products WHERE id = $1 LIMIT 1', [id]);
    if (!oldResult.rows.length) {
      return res.status(404).json({ error: 'Глобальный товар не найден' });
    }
    const oldProduct = oldResult.rows[0];

    const nameRu = toOptionalTrimmedText(req.body?.name_ru).slice(0, 255);
    if (!nameRu) {
      return res.status(400).json({ error: 'Название (RU) обязательно' });
    }

    const nameUz = toOptionalTrimmedText(req.body?.name_uz).slice(0, 255);
    const descriptionRu = toOptionalTrimmedText(req.body?.description_ru).slice(0, 3000);
    const descriptionUz = toOptionalTrimmedText(req.body?.description_uz).slice(0, 3000);
    const barcode = toOptionalTrimmedText(req.body?.barcode).slice(0, 120);
    const ikpu = toOptionalTrimmedText(req.body?.ikpu).slice(0, 64);
    const recommendedCategoryIdRaw = Number.parseInt(req.body?.recommended_category_id, 10);
    const recommendedCategoryId = Number.isFinite(recommendedCategoryIdRaw) && recommendedCategoryIdRaw > 0
      ? recommendedCategoryIdRaw
      : null;
    const unit = toOptionalTrimmedText(req.body?.unit).slice(0, 32) || 'шт';
    const normalizedOrderStep = Number.parseFloat(String(req.body?.order_step ?? '').replace(',', '.'));
    const orderStep = Number.isFinite(normalizedOrderStep) && normalizedOrderStep > 0
      ? Math.round((normalizedOrderStep + Number.EPSILON) * 100) / 100
      : null;
    const sizeEnabled = req.body?.size_enabled === true || req.body?.size_enabled === 'true';
    const sizeOptions = normalizeGlobalProductVariantOptions(req.body?.size_options);
    const normalizedImages = normalizeGlobalProductImages(req.body?.product_images, GLOBAL_PRODUCT_MAX_IMAGES);
    const fallbackImageUrl = toOptionalTrimmedText(req.body?.image_url);
    const fallbackThumbUrl = toOptionalTrimmedText(req.body?.thumb_url);
    if (normalizedImages.length === 0 && fallbackImageUrl) {
      normalizedImages.push({
        url: fallbackImageUrl,
        ...(fallbackThumbUrl ? { thumb_url: fallbackThumbUrl } : {})
      });
    }
    const mainImage = normalizedImages[0] || null;
    const imageUrl = mainImage?.url || fallbackImageUrl || null;
    const thumbUrl = mainImage?.thumb_url || fallbackThumbUrl || null;
    const isActive = req.body?.is_active === undefined
      ? oldProduct.is_active !== false
      : (req.body?.is_active === true || req.body?.is_active === 'true');

    if (recommendedCategoryId) {
      const categoryExistsResult = await pool.query('SELECT id FROM categories WHERE id = $1 LIMIT 1', [recommendedCategoryId]);
      if (!categoryExistsResult.rows.length) {
        return res.status(400).json({ error: 'Рекомендуемая категория не найдена' });
      }
    }
    const duplicateBarcodeProduct = await findGlobalProductByBarcode(barcode, id);
    if (duplicateBarcodeProduct) {
      return res.status(409).json({
        error: `Штрихкод уже используется (товар #${duplicateBarcodeProduct.id}: ${duplicateBarcodeProduct.name_ru || 'без названия'})`
      });
    }

    const result = await pool.query(
      `
        UPDATE global_products SET
          name_ru = $1,
          name_uz = $2,
          description_ru = $3,
          description_uz = $4,
          image_url = $5,
          thumb_url = $6,
          product_images = $7::jsonb,
          barcode = $8,
          ikpu = $9,
          recommended_category_id = $10,
          unit = $11,
          order_step = $12,
          size_enabled = $13,
          size_options = $14::jsonb,
          is_active = $15,
          updated_by = $16,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $17
        RETURNING *
      `,
      [
        nameRu, nameUz || null, descriptionRu || null, descriptionUz || null,
        imageUrl, thumbUrl, JSON.stringify(normalizedImages), barcode || null, ikpu || null,
        recommendedCategoryId, unit, orderStep, sizeEnabled, JSON.stringify(sizeOptions),
        isActive, req.user.id, id
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    if (error?.code === '23505' && String(error?.constraint || '').includes('uq_global_products_barcode_normalized')) {
      return res.status(409).json({ error: 'Штрихкод уже используется другим глобальным товаром' });
    }
    console.error('Update global product error:', error);
    res.status(500).json({ error: 'Ошибка обновления глобального товара' });
  }
});

router.delete('/global-products/:id', async (req, res) => {
  try {
    await ensureGlobalProductsSchema();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'Некорректный ID товара' });
    }

    const result = await pool.query(
      `
        UPDATE global_products
        SET is_active = false, updated_at = CURRENT_TIMESTAMP, updated_by = $2
        WHERE id = $1
        RETURNING id
      `,
      [id, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Глобальный товар не найден' });
    }

    res.json({ message: 'Глобальный товар отключен' });
  } catch (error) {
    console.error('Delete global product error:', error);
    res.status(500).json({ error: 'Ошибка удаления глобального товара' });
  }
});

// =====================================================
// КАТЕГОРИИ
// =====================================================

// Получить все категории
router.get('/categories', async (req, res) => {
  try {
    const includeInactive = ['1', 'true', 'yes'].includes(
      String(req.query.include_inactive || '').toLowerCase()
    );
    const categoriesFilter = includeInactive ? '' : 'WHERE c.is_active = true';
    const subcategoriesFilter = includeInactive ? '' : 'AND sc.is_active = true';
    const result = await pool.query(`
      SELECT
        c.*,
        (SELECT COUNT(*)::int FROM products p WHERE p.category_id = c.id) AS products_count,
        (SELECT COUNT(*)::int FROM categories sc WHERE sc.parent_id = c.id ${subcategoriesFilter}) AS subcategories_count
      FROM categories c
      ${categoriesFilter}
      ORDER BY c.sort_order, c.name_ru
    `);
    res.json(result.rows || []);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Ошибка получения категорий' });
  }
});

// Создать категорию
router.post('/categories', async (req, res) => {
  try {
    const { name_ru, name_uz, image_url, sort_order, parent_id, restaurant_id } = req.body;
    const normalizedParentId = normalizeCategoryId(parent_id);
    const normalizedRestaurantId = normalizeCategoryId(restaurant_id);
    const normalizedNameRu = normalizeCategoryName(name_ru);
    const normalizedNameUz = normalizeCategoryName(name_uz);

    if (!normalizedNameRu) {
      return res.status(400).json({ error: 'Название категории (RU) обязательно' });
    }

    if (normalizedParentId) {
      let parentLevel = 0;
      try {
        parentLevel = await getCategoryLevelById(pool, normalizedParentId);
      } catch (e) {
        if (e.message === 'CATEGORY_NOT_FOUND') {
          return res.status(400).json({ error: 'Родительская категория не найдена' });
        }
        if (e.message === 'CATEGORY_CYCLE') {
          return res.status(400).json({ error: 'Обнаружена циклическая связь категорий' });
        }
        if (e.message === 'CATEGORY_CHAIN_TOO_DEEP') {
          return res.status(400).json({ error: 'Обнаружена некорректная цепочка категорий' });
        }
        throw e;
      }

      if (parentLevel + 1 > MAX_CATEGORY_LEVEL) {
        return res.status(400).json({ error: `Максимальная вложенность категорий: ${MAX_CATEGORY_LEVEL} уровня` });
      }
    }

    const conflict = await findSiblingCategoryNameConflict({
      client: pool,
      parentId: normalizedParentId,
      restaurantId: normalizedRestaurantId,
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
      INSERT INTO categories (name_ru, name_uz, image_url, sort_order, parent_id, restaurant_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [normalizedNameRu, normalizedNameUz || null, image_url, sort_order || 0, normalizedParentId, normalizedRestaurantId]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Ошибка создания категории' });
  }
});

// Обновить категорию
router.put('/categories/:id', async (req, res) => {
  try {
    const { name_ru, name_uz, image_url, sort_order, parent_id, restaurant_id } = req.body;
    const normalizedParentId = normalizeCategoryId(parent_id);
    const normalizedRestaurantId = normalizeCategoryId(restaurant_id);
    const categoryId = Number.parseInt(req.params.id, 10);
    const normalizedNameRu = normalizeCategoryName(name_ru);
    const normalizedNameUz = normalizeCategoryName(name_uz);

    if (!normalizedNameRu) {
      return res.status(400).json({ error: 'Название категории (RU) обязательно' });
    }

    // Get old values
    const oldResult = await pool.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    const oldCategory = oldResult.rows[0];

    if (normalizedParentId && normalizedParentId === categoryId) {
      return res.status(400).json({ error: 'Категория не может быть родителем самой себя' });
    }

    let parentLevel = 0;
    if (normalizedParentId) {
      try {
        parentLevel = await getCategoryLevelById(pool, normalizedParentId, categoryId);
      } catch (e) {
        if (e.message === 'CATEGORY_NOT_FOUND') {
          return res.status(400).json({ error: 'Родительская категория не найдена' });
        }
        if (e.message === 'CATEGORY_CYCLE') {
          return res.status(400).json({ error: 'Нельзя переместить категорию в свою подкатегорию' });
        }
        if (e.message === 'CATEGORY_CHAIN_TOO_DEEP') {
          return res.status(400).json({ error: 'Обнаружена некорректная цепочка категорий' });
        }
        throw e;
      }
    }

    const subtreeDepth = await getCategorySubtreeDepth(pool, categoryId);
    const resultingMaxLevel = parentLevel + subtreeDepth;
    if (resultingMaxLevel > MAX_CATEGORY_LEVEL) {
      return res.status(400).json({ error: `Максимальная вложенность категорий: ${MAX_CATEGORY_LEVEL} уровня` });
    }

    const conflict = await findSiblingCategoryNameConflict({
      client: pool,
      parentId: normalizedParentId,
      restaurantId: normalizedRestaurantId,
      nameRu: normalizedNameRu,
      nameUz: normalizedNameUz,
      excludeId: categoryId
    });
    if (conflict) {
      if (conflict.field === 'name_ru') {
        return res.status(400).json({ error: 'Категория с таким названием RU уже существует на этом уровне' });
      }
      return res.status(400).json({ error: 'Категория с таким названием UZ уже существует на этом уровне' });
    }

    const result = await pool.query(`
      UPDATE categories SET
        name_ru = $1, name_uz = $2, image_url = $3, sort_order = $4, 
        parent_id = $5, restaurant_id = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `, [normalizedNameRu, normalizedNameUz || null, image_url, sort_order || 0, normalizedParentId, normalizedRestaurantId, req.params.id]);

    const category = result.rows[0];

    // Log activity
    await logActivity({
      userId: req.user.id,
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
    // Get category
    const categoryResult = await pool.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    const category = categoryResult.rows[0];

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

    // Check for subcategories
    const subcatsCheck = await pool.query(
      'SELECT COUNT(*) as count FROM categories WHERE parent_id = $1',
      [req.params.id]
    );

    if (parseInt(subcatsCheck.rows[0].count) > 0) {
      return res.status(400).json({
        error: 'Нельзя удалить категорию, у которой есть подкатегории. Сначала удалите подкатегории.'
      });
    }

    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);

    // Log activity
    await logActivity({
      userId: req.user.id,
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


// Создать оператора
router.post('/operators', async (req, res) => {
  const client = await pool.connect();
  try {
    const { username, password, full_name, phone, telegram_id, restaurant_ids } = req.body;
    const normalizedAuth = normalizeOperatorAuthFields({ username, phone });

    if (!normalizedAuth.username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    await client.query('BEGIN');

    // Check username uniqueness
    const existingUser = await client.query('SELECT id FROM users WHERE username = $1', [normalizedAuth.username]);
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const userResult = await client.query(`
      INSERT INTO users (username, password, full_name, phone, role, is_active, telegram_id)
      VALUES ($1, $2, $3, $4, 'operator', true, $5)
      RETURNING id, username, full_name, phone, role, is_active, created_at, telegram_id
    `, [normalizedAuth.username, hashedPassword, full_name, normalizedAuth.phone, telegram_id || null]);

    const user = userResult.rows[0];

    // Link to restaurants
    if (restaurant_ids && restaurant_ids.length > 0) {
      for (const restaurantId of restaurant_ids) {
        await client.query(`
          INSERT INTO operator_restaurants (user_id, restaurant_id)
          VALUES ($1, $2)
        `, [user.id, restaurantId]);
      }

      // Set first restaurant as active
      await client.query(`
        UPDATE users SET active_restaurant_id = $1 WHERE id = $2
      `, [restaurant_ids[0], user.id]);
    }

    await client.query('COMMIT');

    // Log activity
    await logActivity({
      userId: req.user.id,
      actionType: ACTION_TYPES.CREATE_USER,
      entityType: ENTITY_TYPES.USER,
      entityId: user.id,
      entityName: user.full_name || user.username,
      newValues: { ...user, restaurant_ids },
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.status(201).json(normalizeUserIdentityForDisplay(user));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create operator error:', error);
    res.status(500).json({ error: 'Ошибка создания оператора' });
  } finally {
    client.release();
  }
});

// Обновить оператора
router.put('/operators/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { full_name, phone, password, is_active, telegram_id, restaurant_ids } = req.body;

    await client.query('BEGIN');

    // Get old values
    const oldResult = await client.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (oldResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Оператор не найден' });
    }
    const oldValues = oldResult.rows[0];

    const normalizedPhone = phone === undefined ? undefined : normalizePhoneValue(phone);
    const syncUsernameToPhone = normalizedPhone && looksLikePhoneOrTelegramLogin(oldValues.username);
    const normalizedUsernameFromPhone = syncUsernameToPhone ? phoneDigitsOnly(normalizedPhone) : null;

    // Update user
    let updateQuery = `
      UPDATE users SET 
        full_name = COALESCE($1, full_name),
        phone = COALESCE($2, phone),
        is_active = COALESCE($3, is_active),
        telegram_id = $4,
        updated_at = CURRENT_TIMESTAMP
    `;
    let params = [full_name, normalizedPhone, is_active, telegram_id || null];

    if (normalizedUsernameFromPhone) {
      updateQuery += `, username = $${params.length + 1}`;
      params.push(normalizedUsernameFromPhone);
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery += `, password = $${params.length + 1}`;
      params.push(hashedPassword);
    }

    updateQuery += ` WHERE id = $${params.length + 1} RETURNING *`;
    params.push(req.params.id);

    const userResult = await client.query(updateQuery, params);
    const user = userResult.rows[0];

    // Update restaurant links if provided
    if (restaurant_ids !== undefined) {
      // Remove old links
      await client.query('DELETE FROM operator_restaurants WHERE user_id = $1', [req.params.id]);

      // Add new links
      for (const restaurantId of restaurant_ids) {
        await client.query(`
          INSERT INTO operator_restaurants (user_id, restaurant_id)
          VALUES ($1, $2)
        `, [req.params.id, restaurantId]);
      }

      // Update active restaurant if current one is not in new list
      if (restaurant_ids.length > 0 && !restaurant_ids.includes(user.active_restaurant_id)) {
        await client.query(`
          UPDATE users SET active_restaurant_id = $1 WHERE id = $2
        `, [restaurant_ids[0], req.params.id]);
      } else if (restaurant_ids.length === 0) {
        await client.query(`
          UPDATE users SET active_restaurant_id = NULL WHERE id = $1
        `, [req.params.id]);
      }
    }

    await client.query('COMMIT');

    // Log activity
    await logActivity({
      userId: req.user.id,
      actionType: ACTION_TYPES.UPDATE_USER,
      entityType: ENTITY_TYPES.USER,
      entityId: user.id,
      entityName: user.full_name || user.username,
      oldValues,
      newValues: { ...user, restaurant_ids },
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.json(normalizeUserIdentityForDisplay(user));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update operator error:', error);
    res.status(500).json({ error: 'Ошибка обновления оператора' });
  } finally {
    client.release();
  }
});

// Удалить оператора
router.delete('/operators/:id', async (req, res) => {
  try {
    // Prevent self-deletion
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Нельзя удалить самого себя' });
    }

    // Get user for logging
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Оператор не найден' });
    }
    const user = userResult.rows[0];

    // Soft delete
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [req.params.id]);

    // Log activity
    await logActivity({
      userId: req.user.id,
      actionType: ACTION_TYPES.DELETE_USER,
      entityType: ENTITY_TYPES.USER,
      entityId: user.id,
      entityName: user.full_name || user.username,
      oldValues: user,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.json({ message: 'Оператор деактивирован' });
  } catch (error) {
    console.error('Delete operator error:', error);
    res.status(500).json({ error: 'Ошибка удаления оператора' });
  }
});

// =====================================================
// КЛИЕНТЫ
// =====================================================

// Получить всех клиентов
router.get('/customers', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', status = '', restaurant_id = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        u.id as user_id, u.id as association_id, u.username, u.full_name, u.phone, u.telegram_id,
        u.active_restaurant_id as restaurant_id,
        u.is_active as user_is_active, COALESCE(ur.is_blocked, false) as is_blocked, u.created_at,
        u.last_activity_at,
        u.last_ip_address,
        u.last_user_agent,
        u.last_device_type,
        u.last_browser_name,
        u.last_browser_version,
        u.last_os_name,
        u.last_os_version,
        u.last_country,
        u.last_region,
        u.last_city,
        r.name as restaurant_name,
        COUNT(o.id) as orders_count,
        COALESCE(SUM(o.total_amount), 0) as total_spent,
        MAX(o.created_at) as last_order_date
      FROM users u
      LEFT JOIN restaurants r ON u.active_restaurant_id = r.id
      LEFT JOIN user_restaurants ur ON ur.user_id = u.id AND ur.restaurant_id = u.active_restaurant_id
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE u.role = 'customer'
    `;

    const params = [];
    if (search) {
      query += ` AND (u.full_name ILIKE $${params.length + 1} OR u.phone ILIKE $${params.length + 1} OR u.username ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    if (restaurant_id) {
      query += ` AND u.active_restaurant_id = $${params.length + 1}`;
      params.push(restaurant_id);
    }

    if (status === 'active') {
      query += ` AND u.is_active = true`;
    } else if (status === 'blocked') {
      query += ` AND (u.is_active = false OR COALESCE(ur.is_blocked, false) = true)`;
    }

    query += ` GROUP BY u.id, u.active_restaurant_id, r.name, ur.is_blocked ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    const rows = Array.isArray(result.rows) ? result.rows : [];

    const missingTelemetryUserIds = rows
      .filter((row) => (
        !row?.last_activity_at
        || !row?.last_ip_address
        || !row?.last_user_agent
        || !row?.last_device_type
        || !row?.last_browser_name
        || !row?.last_os_name
      ))
      .map((row) => Number(row.user_id))
      .filter((id) => Number.isFinite(id) && id > 0);

    let mergedRows = rows;
    if (missingTelemetryUserIds.length > 0) {
      await refreshUserTelemetryFromActivityLogs({ userIds: missingTelemetryUserIds }).catch(() => {});

      const refreshedTelemetryResult = await pool.query(
        `SELECT
           id,
           last_activity_at,
           last_ip_address,
           last_user_agent,
           last_device_type,
           last_browser_name,
           last_browser_version,
           last_os_name,
           last_os_version,
           last_country,
           last_region,
           last_city
         FROM users
         WHERE id = ANY($1::int[])`,
        [missingTelemetryUserIds]
      );

      const telemetryMap = new Map(
        (refreshedTelemetryResult.rows || []).map((item) => [Number(item.id), item])
      );
      mergedRows = rows.map((row) => {
        const telemetry = telemetryMap.get(Number(row.user_id));
        if (!telemetry) return row;
        return { ...row, ...telemetry };
      });
    }

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM users WHERE role = $1';
    const countParams = ['customer'];
    if (search) {
      countQuery += ` AND (full_name ILIKE $2 OR phone ILIKE $2 OR username ILIKE $2)`;
      countParams.push(`%${search}%`);
    }
    if (restaurant_id) {
      countQuery += ` AND active_restaurant_id = $${countParams.length + 1}`;
      countParams.push(restaurant_id);
    }
    if (status === 'active') {
      countQuery += ` AND is_active = true`;
    } else if (status === 'blocked') {
      countQuery += ` AND (
        is_active = false OR EXISTS (
          SELECT 1 FROM user_restaurants ur
          WHERE ur.user_id = users.id AND ur.is_blocked = true
        )
      )`;
    }
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      customers: mergedRows.map(normalizeUserIdentityForDisplay),
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Ошибка получения клиентов' });
  }
});

// Получить детали клиента
router.get('/customers/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.username, u.full_name, u.phone, u.telegram_id, u.is_active, u.created_at,
        COUNT(o.id) as orders_count,
        COALESCE(SUM(o.total_amount), 0) as total_spent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE u.id = $1 AND u.role = 'customer'
      GROUP BY u.id
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    res.json(normalizeUserIdentityForDisplay(result.rows[0]));
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Ошибка получения клиента' });
  }
});

// Заблокировать/разблокировать клиента
router.put('/customers/:id/toggle-block', async (req, res) => {
  try {
    // Get current status
    const currentResult = await pool.query('SELECT * FROM users WHERE id = $1 AND role = $2', [req.params.id, 'customer']);

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    const customer = currentResult.rows[0];
    const newStatus = !customer.is_active;

    await pool.query('UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newStatus, req.params.id]);

    // Log activity
    await logActivity({
      userId: req.user.id,
      actionType: newStatus ? ACTION_TYPES.UNBLOCK_USER : ACTION_TYPES.BLOCK_USER,
      entityType: ENTITY_TYPES.USER,
      entityId: customer.id,
      entityName: customer.full_name || customer.username,
      oldValues: { is_active: customer.is_active },
      newValues: { is_active: newStatus },
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.json({
      message: newStatus ? 'Клиент разблокирован' : 'Клиент заблокирован',
      is_active: newStatus
    });
  } catch (error) {
    console.error('Toggle customer block error:', error);
    res.status(500).json({ error: 'Ошибка изменения статуса клиента' });
  }
});

// Удалить клиента
router.delete('/customers/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get customer data
    const customerResult = await client.query('SELECT * FROM users WHERE id = $1 AND role = $2', [req.params.id, 'customer']);

    if (customerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    const customer = customerResult.rows[0];

    // Check if customer has orders
    const ordersResult = await client.query('SELECT COUNT(*) FROM orders WHERE user_id = $1', [req.params.id]);
    const ordersCount = parseInt(ordersResult.rows[0].count);

    if (ordersCount > 0) {
      // Soft delete - just block the customer
      await client.query('UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
      await client.query('COMMIT');

      await logActivity({
        userId: req.user.id,
        actionType: ACTION_TYPES.DELETE_USER,
        entityType: ENTITY_TYPES.USER,
        entityId: customer.id,
        entityName: customer.full_name || customer.username,
        oldValues: customer,
        newValues: { is_active: false, soft_deleted: true },
        details: `Soft delete (${ordersCount} заказов)`,
        ipAddress: getIpFromRequest(req),
        userAgent: getUserAgentFromRequest(req)
      });

      return res.json({
        message: `Клиент деактивирован (имеет ${ordersCount} заказов)`,
        soft_deleted: true
      });
    }

    // Hard delete if no orders
    await client.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');

    await logActivity({
      userId: req.user.id,
      actionType: ACTION_TYPES.DELETE_USER,
      entityType: ENTITY_TYPES.USER,
      entityId: customer.id,
      entityName: customer.full_name || customer.username,
      oldValues: customer,
      details: 'Hard delete (no orders)',
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.json({ message: 'Клиент удален', deleted: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Ошибка удаления клиента' });
  } finally {
    client.release();
  }
});

// Получить историю заказов клиента
router.get('/customers/:id/orders', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Verify customer exists
    const customerResult = await pool.query('SELECT id, full_name FROM users WHERE id = $1 AND role = $2', [req.params.id, 'customer']);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    // Get orders with items
    const ordersResult = await pool.query(`
      SELECT 
        o.id, o.order_number, o.status, o.total_amount, o.payment_method,
        o.customer_name, o.customer_phone, o.delivery_address, o.delivery_coordinates,
        o.delivery_date, o.delivery_time, o.comment, o.created_at, o.updated_at,
        r.name as restaurant_name, r.id as restaurant_id,
        u_operator.full_name as processed_by_name,
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
        ) as items
      FROM orders o
      LEFT JOIN restaurants r ON o.restaurant_id = r.id
      LEFT JOIN users u_operator ON o.processed_by = u_operator.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = $1
      GROUP BY o.id, r.name, r.id, u_operator.full_name
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.params.id, limit, offset]);

    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) FROM orders WHERE user_id = $1', [req.params.id]);

    res.json({
      customer: customerResult.rows[0],
      orders: ordersResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get customer orders error:', error);
    res.status(500).json({ error: 'Ошибка получения заказов клиента' });
  }
});

// =====================================================
// ЛОГИ АКТИВНОСТИ
// =====================================================

// Получить логи
router.get('/logs', async (req, res) => {
  try {
    const {
      restaurant_id,
      user_id,
      user_role,
      action_type,
      entity_type,
      start_date,
      end_date,
      page = 1,
      limit = 50
    } = req.query;

    const offset = (page - 1) * limit;
    const normalizedUserRole = ['operator', 'customer', 'superadmin'].includes(String(user_role || '').toLowerCase())
      ? String(user_role || '').toLowerCase()
      : null;

    const result = await getActivityLogs({
      restaurantId: restaurant_id,
      userId: user_id,
      userRole: normalizedUserRole,
      actionType: action_type,
      entityType: entity_type,
      startDate: start_date,
      endDate: end_date,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      logs: result.logs,
      total: result.total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ error: 'Ошибка получения логов' });
  }
});

// Получить статистику логов
router.get('/logs/stats', async (req, res) => {
  try {
    const { restaurant_id, days = 7 } = req.query;
    const stats = await getActivityStats(restaurant_id, parseInt(days));
    res.json(stats);
  } catch (error) {
    console.error('Get logs stats error:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// Мониторинг атак / инцидентов безопасности
router.get('/security/events', async (req, res) => {
  try {
    await ensureSecurityEventsSchema();
    const result = await listSecurityEvents({
      eventType: req.query?.event_type,
      riskLevel: req.query?.risk_level,
      status: req.query?.status,
      sourceIp: req.query?.source_ip,
      search: req.query?.search,
      startDate: req.query?.start_date,
      endDate: req.query?.end_date,
      page: req.query?.page,
      limit: req.query?.limit
    });

    res.json(result);
  } catch (error) {
    console.error('Get security events error:', error);
    res.status(500).json({ error: 'Ошибка получения событий безопасности' });
  }
});

router.get('/security/events/stats', async (_req, res) => {
  try {
    await ensureSecurityEventsSchema();
    const stats = await getSecurityEventsStats();
    res.json(stats);
  } catch (error) {
    console.error('Get security events stats error:', error);
    res.status(500).json({ error: 'Ошибка получения статистики безопасности' });
  }
});

router.patch('/security/events/:id/status', async (req, res) => {
  try {
    await ensureSecurityEventsSchema();
    const updated = await setSecurityEventStatus({
      eventId: req.params.id,
      status: req.body?.status,
      resolvedBy: req.user?.id,
      resolutionNote: req.body?.resolution_note
    });

    res.json(updated);
  } catch (error) {
    const message = String(error?.message || '');
    if (message === 'INVALID_EVENT_ID') {
      return res.status(400).json({ error: 'Некорректный ID события' });
    }
    if (message === 'INVALID_STATUS') {
      return res.status(400).json({ error: 'Некорректный статус события' });
    }
    if (message === 'EVENT_NOT_FOUND') {
      return res.status(404).json({ error: 'Событие не найдено' });
    }
    console.error('Update security event status error:', error);
    res.status(500).json({ error: 'Ошибка обновления статуса события безопасности' });
  }
});

router.get('/telemetry/analytics', async (req, res) => {
  try {
    await ensureUserTelemetrySchema().catch(() => {});

    const requestedHours = Number.parseInt(req.query?.hours, 10);
    const hours = Number.isFinite(requestedHours)
      ? Math.min(168, Math.max(1, requestedHours))
      : 24;

    const getRoleTelemetryBuckets = async ({ role, field, fallbackLabel = 'unknown', limit = 12 }) => {
      const result = await pool.query(
        `
        SELECT
          COALESCE(NULLIF(BTRIM(${field}), ''), $2) AS label,
          COUNT(*)::int AS count
        FROM users
        WHERE role = $1
        GROUP BY 1
        ORDER BY count DESC, label ASC
        LIMIT $3
      `,
        [role, fallbackLabel, limit]
      );
      return result.rows.map((row) => ({
        label: String(row.label || fallbackLabel),
        count: Number.parseInt(row.count, 10) || 0
      }));
    };

    const [
      roleTotalsResult,
      activeWindowResult,
      hourlyActivityResult,
      operatorDevices,
      operatorOs,
      operatorBrowsers,
      customerDevices,
      customerOs,
      customerBrowsers
    ] = await Promise.all([
      pool.query(
        `
        SELECT role, COUNT(*)::int AS total
        FROM users
        WHERE role IN ('operator', 'customer')
        GROUP BY role
      `
      ),
      pool.query(
        `
        SELECT u.role, COUNT(DISTINCT al.user_id)::int AS active_users
        FROM activity_logs al
        INNER JOIN users u ON u.id = al.user_id
        WHERE u.role IN ('operator', 'customer')
          AND al.created_at >= NOW() - make_interval(hours => $1::int)
        GROUP BY u.role
      `,
        [hours]
      ),
      pool.query(
        `
        WITH hour_series AS (
          SELECT generate_series(
            date_trunc('hour', NOW() - make_interval(hours => GREATEST($1::int - 1, 0))),
            date_trunc('hour', NOW()),
            INTERVAL '1 hour'
          ) AS hour_bucket
        ),
        hourly_activity AS (
          SELECT
            date_trunc('hour', al.created_at) AS hour_bucket,
            u.role,
            COUNT(DISTINCT al.user_id)::int AS active_users
          FROM activity_logs al
          INNER JOIN users u ON u.id = al.user_id
          WHERE u.role IN ('operator', 'customer')
            AND al.created_at >= NOW() - make_interval(hours => $1::int)
          GROUP BY date_trunc('hour', al.created_at), u.role
        )
        SELECT
          hs.hour_bucket,
          COALESCE(MAX(CASE WHEN ha.role = 'operator' THEN ha.active_users END), 0)::int AS operators,
          COALESCE(MAX(CASE WHEN ha.role = 'customer' THEN ha.active_users END), 0)::int AS customers
        FROM hour_series hs
        LEFT JOIN hourly_activity ha ON ha.hour_bucket = hs.hour_bucket
        GROUP BY hs.hour_bucket
        ORDER BY hs.hour_bucket ASC
      `,
        [hours]
      ),
      getRoleTelemetryBuckets({ role: 'operator', field: 'last_device_type' }),
      getRoleTelemetryBuckets({ role: 'operator', field: 'last_os_name' }),
      getRoleTelemetryBuckets({ role: 'operator', field: 'last_browser_name' }),
      getRoleTelemetryBuckets({ role: 'customer', field: 'last_device_type' }),
      getRoleTelemetryBuckets({ role: 'customer', field: 'last_os_name' }),
      getRoleTelemetryBuckets({ role: 'customer', field: 'last_browser_name' })
    ]);

    const totalsMap = new Map(
      roleTotalsResult.rows.map((row) => [String(row.role), Number.parseInt(row.total, 10) || 0])
    );
    const activeMap = new Map(
      activeWindowResult.rows.map((row) => [String(row.role), Number.parseInt(row.active_users, 10) || 0])
    );

    res.json({
      generated_at: new Date().toISOString(),
      window_hours: hours,
      operators: {
        total: totalsMap.get('operator') || 0,
        active_in_window: activeMap.get('operator') || 0,
        devices: operatorDevices,
        os: operatorOs,
        browsers: operatorBrowsers
      },
      customers: {
        total: totalsMap.get('customer') || 0,
        active_in_window: activeMap.get('customer') || 0,
        devices: customerDevices,
        os: customerOs,
        browsers: customerBrowsers
      },
      hourly_activity: (hourlyActivityResult.rows || []).map((row) => ({
        hour: row.hour_bucket,
        operators: Number.parseInt(row.operators, 10) || 0,
        customers: Number.parseInt(row.customers, 10) || 0
      }))
    });
  } catch (error) {
    console.error('Get telemetry analytics error:', error);
    res.status(500).json({ error: 'Ошибка получения скрытой аналитики' });
  }
});

// =====================================================
// СТАТИСТИКА
// =====================================================

// Общая статистика для супер-админа
router.get('/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM restaurants WHERE is_active = true) as restaurants_count,
        (SELECT COUNT(*) FROM users WHERE role = 'operator' AND is_active = true) as operators_count,
        (SELECT COUNT(*) FROM users WHERE role = 'customer') as customers_count,
        (SELECT COUNT(*) FROM orders WHERE status = 'new') as new_orders_count,
        (SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURRENT_DATE) as today_orders_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE DATE(created_at) = CURRENT_DATE) as today_revenue
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// Сводная аналитика (день/месяц/год) для суперадмина
router.get('/analytics/overview', async (req, res) => {
  try {
    await ensureOrderRatingsSchema();
    const analyticsRange = resolveAnalyticsRange(req.query || {});
    const startDateKey = analyticsRange.startDateKey;
    const endDateKeyExclusive = analyticsRange.endDateKeyExclusive;
    const parsedTopLimit = Number.parseInt(req.query.top_limit, 10);
    const topLimit = [10, 50, 100].includes(parsedTopLimit) ? parsedTopLimit : 10;

    let restaurantId = null;
    if (req.query.restaurant_id !== undefined && req.query.restaurant_id !== null && String(req.query.restaurant_id).trim() !== '') {
      const parsedRestaurantId = Number.parseInt(req.query.restaurant_id, 10);
      if (!Number.isFinite(parsedRestaurantId) || parsedRestaurantId <= 0) {
        return res.status(400).json({ error: 'Некорректный restaurant_id' });
      }
      restaurantId = parsedRestaurantId;
    }

    let restaurantMeta = null;
    if (restaurantId) {
      const restaurantResult = await pool.query(
        'SELECT id, name FROM restaurants WHERE id = $1 LIMIT 1',
        [restaurantId]
      );
      if (!restaurantResult.rows.length) {
        return res.status(404).json({ error: 'Магазин не найден' });
      }
      restaurantMeta = restaurantResult.rows[0];
    }

    const ordersResult = await pool.query(
      `
      SELECT
        o.id,
        o.order_number,
        o.status,
        o.total_amount,
        o.payment_method,
        o.processed_by,
        o.service_fee,
        o.delivery_cost,
        o.service_rating,
        o.delivery_rating,
        o.service_rating_reason,
        o.delivery_rating_reason,
        COALESCE(
          NULLIF(BTRIM(to_jsonb(o)->>'fulfillment_type'), ''),
          CASE
            WHEN LOWER(COALESCE(o.delivery_address, '')) = 'самовывоз' THEN 'pickup'
            ELSE 'delivery'
          END
        ) AS fulfillment_type,
        o.delivery_address,
        o.delivery_coordinates,
        o.created_at,
        o.customer_name,
        o.customer_phone,
        o.is_paid,
        o.payment_status,
        COALESCE(NULLIF(BTRIM(r.name), ''), CONCAT('ID ', o.restaurant_id::text)) AS restaurant_name,
        COALESCE(
          NULLIF(BTRIM(u_operator.full_name), ''),
          NULLIF(BTRIM(u_operator.username), ''),
          CASE WHEN o.processed_by IS NOT NULL THEN CONCAT('ID ', o.processed_by::text) ELSE '' END
        ) AS processed_by_name,
        COALESCE(NULLIF(BTRIM(u.phone), ''), NULLIF(BTRIM(o.customer_phone), ''), '') AS customer_phone_normalized,
        EXISTS(
          SELECT 1
          FROM order_status_history osh
          WHERE osh.order_id = o.id
            AND osh.status = 'accepted'
        ) AS has_accepted_action
      FROM orders o
      LEFT JOIN restaurants r ON r.id = o.restaurant_id
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN users u_operator ON u_operator.id = o.processed_by
      WHERE o.created_at >= $1::date
        AND o.created_at < $2::date
        AND ($3::int IS NULL OR o.restaurant_id = $3)
      ORDER BY o.created_at ASC, o.id ASC
      `,
      [startDateKey, endDateKeyExclusive, restaurantId]
    );

    const itemsResult = await pool.query(
      `
      SELECT
        o.id AS order_id,
        o.status,
        oi.product_name,
        oi.quantity,
        oi.price,
        oi.container_price,
        oi.container_norm,
        c.id AS category_id,
        c.name_ru AS category_name
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE o.created_at >= $1::date
        AND o.created_at < $2::date
        AND ($3::int IS NULL OR o.restaurant_id = $3)
      `,
      [startDateKey, endDateKeyExclusive, restaurantId]
    );

    const lowBalanceRestaurantsResult = await pool.query(
      `
      SELECT id, name, COALESCE(balance, 0) AS balance, currency_code
      FROM restaurants
      WHERE is_active = true
        AND COALESCE(balance, 0) < 20000
        AND ($1::int IS NULL OR id = $1)
      ORDER BY balance ASC, name ASC
      LIMIT 300
      `,
      [restaurantId]
    );

    const topStoresByOrdersResult = await pool.query(
      `
      SELECT
        r.id,
        r.name,
        COUNT(o.id)::int AS orders_count,
        COALESCE(
          SUM(
            CASE
              WHEN o.status = 'delivered' THEN COALESCE(o.total_amount, 0)
              ELSE 0
            END
          ),
          0
        ) AS delivered_revenue
      FROM restaurants r
      LEFT JOIN orders o
        ON o.restaurant_id = r.id
       AND o.created_at >= $1::date
       AND o.created_at < $2::date
      WHERE r.is_active = true
        AND ($3::int IS NULL OR r.id = $3)
      GROUP BY r.id, r.name
      HAVING COUNT(o.id) > 0
      ORDER BY orders_count DESC, delivered_revenue DESC, r.name ASC
      LIMIT $4
      `,
      [startDateKey, endDateKeyExclusive, restaurantId, topLimit]
    );

    const topStoresByRevenueResult = await pool.query(
      `
      SELECT
        r.id,
        r.name,
        COUNT(o.id)::int AS orders_count,
        COALESCE(
          SUM(
            CASE
              WHEN o.status = 'delivered' THEN COALESCE(o.total_amount, 0)
              ELSE 0
            END
          ),
          0
        ) AS delivered_revenue
      FROM restaurants r
      LEFT JOIN orders o
        ON o.restaurant_id = r.id
       AND o.created_at >= $1::date
       AND o.created_at < $2::date
      WHERE r.is_active = true
        AND ($3::int IS NULL OR r.id = $3)
      GROUP BY r.id, r.name
      HAVING COUNT(o.id) > 0
      ORDER BY delivered_revenue DESC, orders_count DESC, r.name ASC
      LIMIT $4
      `,
      [startDateKey, endDateKeyExclusive, restaurantId, topLimit]
    );

    let activityTypeRows = [];
    try {
      await ensureActivityTypesSchema().catch(() => {});
      const activityTypeAnalyticsResult = await pool.query(
        `
        SELECT
          bat.id AS activity_type_id,
          COALESCE(NULLIF(BTRIM(bat.name), ''), 'Без вида деятельности') AS activity_type_name,
          COUNT(o.id)::int AS orders_count,
          COALESCE(
            SUM(
              CASE
                WHEN o.status = 'delivered' THEN COALESCE(o.total_amount, 0)
                ELSE 0
              END
            ),
            0
          ) AS delivered_revenue
        FROM restaurants r
        LEFT JOIN business_activity_types bat ON bat.id = r.activity_type_id
        LEFT JOIN orders o
          ON o.restaurant_id = r.id
         AND o.created_at >= $1::date
         AND o.created_at < $2::date
        WHERE r.is_active = true
          AND ($3::int IS NULL OR r.id = $3)
        GROUP BY bat.id, bat.name
        HAVING COUNT(o.id) > 0
            OR COALESCE(
              SUM(
                CASE
                  WHEN o.status = 'delivered' THEN COALESCE(o.total_amount, 0)
                  ELSE 0
                END
              ),
              0
            ) > 0
        `,
        [startDateKey, endDateKeyExclusive, restaurantId]
      );

      activityTypeRows = activityTypeAnalyticsResult.rows.map((row) => ({
        activityTypeId: row.activity_type_id ? Number.parseInt(row.activity_type_id, 10) : null,
        name: row.activity_type_name || 'Без вида деятельности',
        ordersCount: Number.parseInt(row.orders_count, 10) || 0,
        revenue: Number(row.delivered_revenue) || 0
      }));
    } catch (error) {
      if (error.code !== '42P01') throw error;
    }

    const buildTimelinePoints = () => {
      if (analyticsRange.period === 'yearly') {
        return Array.from({ length: 12 }, (_, index) => ({ label: String(index + 1), value: 0 }));
      }
      if (analyticsRange.period === 'monthly') {
        const daysInMonth = new Date(analyticsRange.year, analyticsRange.month, 0).getDate();
        return Array.from({ length: daysInMonth }, (_, index) => ({ label: String(index + 1), value: 0 }));
      }
      return Array.from({ length: 24 }, (_, hour) => ({ label: `${String(hour).padStart(2, '0')}:00`, value: 0 }));
    };

    const revenueTimeline = buildTimelinePoints();
    const ordersTimeline = buildTimelinePoints();
    const statusSummary = {
      new: 0,
      accepted: 0,
      preparing: 0,
      delivering: 0,
      delivered: 0,
      cancelled: 0
    };

    const resolveTimelineIndex = (dateValue) => {
      if (analyticsRange.period === 'yearly') return dateValue.getMonth();
      if (analyticsRange.period === 'monthly') return dateValue.getDate() - 1;
      return dateValue.getHours();
    };

    const toNumeric = (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const normalizeStatus = (value) => (value === 'in_progress' ? 'preparing' : String(value || '').trim().toLowerCase());
    const isPickupOrder = (order) => {
      const fulfillmentType = String(order?.fulfillment_type || '').trim().toLowerCase();
      if (fulfillmentType === 'pickup') return true;
      return String(order?.delivery_address || '').trim().toLowerCase() === 'самовывоз';
    };
    const parseDeliveryCoordinates = (value) => {
      const raw = String(value || '').trim();
      if (!raw) return null;
      const [latRaw, lngRaw] = raw.split(',').map((part) => String(part || '').trim());
      if (!latRaw || !lngRaw) return null;
      const lat = Number.parseFloat(latRaw.replace(',', '.'));
      const lng = Number.parseFloat(lngRaw.replace(',', '.'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
      return { lat, lng };
    };

    let revenue = 0;
    let deliveredOrdersCount = 0;
    let pickupOrdersCount = 0;
    let deliveryOrdersCount = 0;
    let deliveryRevenue = 0;
    let serviceRevenue = 0;
    let containersRevenue = 0;
    let serviceRatingSum = 0;
    let serviceRatingCount = 0;
    let deliveryRatingSum = 0;
    let deliveryRatingCount = 0;
    const buildEmptyOperatorPaymentBuckets = () => OPERATOR_PAYMENT_METHODS.reduce((acc, methodKey) => {
      acc[methodKey] = { count: 0, amount: 0, percent: 0 };
      return acc;
    }, {});
    const operatorPaymentsByOperatorMap = new Map();
    const operatorPaymentsTotalsByMethod = buildEmptyOperatorPaymentBuckets();
    let operatorPaymentsTotalCount = 0;
    let operatorPaymentsTotalAmount = 0;

    const topCustomersMap = new Map();
    const orderLocations = [];

    for (const order of ordersResult.rows) {
      const createdAt = new Date(order.created_at);
      if (Number.isNaN(createdAt.getTime())) continue;

      const timelineIndex = resolveTimelineIndex(createdAt);
      if (timelineIndex >= 0 && timelineIndex < ordersTimeline.length) {
        ordersTimeline[timelineIndex].value += 1;
      }

      const normalizedStatus = normalizeStatus(order.status);
      const isAcceptedInNewState = normalizedStatus === 'new' && (
        Boolean(order?.has_accepted_action) ||
        Boolean(order?.is_paid) ||
        String(order?.payment_status || '').trim().toLowerCase() === 'paid'
      );

      if (normalizedStatus === 'new') {
        if (isAcceptedInNewState) statusSummary.accepted += 1;
        else statusSummary.new += 1;
      } else if (Object.prototype.hasOwnProperty.call(statusSummary, normalizedStatus)) {
        statusSummary[normalizedStatus] += 1;
      }

      serviceRevenue += Math.max(0, toNumeric(order.service_fee, 0));

      if (normalizedStatus !== 'delivered') continue;

      const totalAmount = Math.max(0, toNumeric(order.total_amount, 0));
      revenue += totalAmount;
      deliveredOrdersCount += 1;
      deliveryRevenue += Math.max(0, toNumeric(order.delivery_cost, 0));
      const serviceRating = normalizeOrderRating(order.service_rating, 0);
      const deliveryRating = normalizeOrderRating(order.delivery_rating, 0);
      if (serviceRating > 0) {
        serviceRatingSum += serviceRating;
        serviceRatingCount += 1;
      }
      if (deliveryRating > 0) {
        deliveryRatingSum += deliveryRating;
        deliveryRatingCount += 1;
      }

      if (timelineIndex >= 0 && timelineIndex < revenueTimeline.length) {
        revenueTimeline[timelineIndex].value += totalAmount;
      }

      if (isPickupOrder(order)) pickupOrdersCount += 1;
      else deliveryOrdersCount += 1;

      const customerName = String(order.customer_name || '').trim() || 'Клиент';
      const customerPhone = String(order.customer_phone_normalized || '').trim();
      const customerKey = `${customerName.toLowerCase()}::${customerPhone.toLowerCase()}`;
      if (!topCustomersMap.has(customerKey)) {
        topCustomersMap.set(customerKey, {
          name: customerName,
          phone: customerPhone || '—',
          ordersCount: 0,
          totalAmount: 0
        });
      }
      const customerEntry = topCustomersMap.get(customerKey);
      customerEntry.ordersCount += 1;
      customerEntry.totalAmount += totalAmount;

      const orderLocation = parseDeliveryCoordinates(order.delivery_coordinates);
      if (orderLocation) {
        orderLocations.push({
          orderId: Number.parseInt(order.id, 10) || null,
          orderNumber: order.order_number || null,
          lat: orderLocation.lat,
          lng: orderLocation.lng,
          totalAmount,
          createdAt: order.created_at,
          deliveryAddress: order.delivery_address || '',
          customerName: String(order.customer_name || '').trim() || 'Клиент',
          restaurantName: String(order.restaurant_name || '').trim() || 'Магазин'
        });
      }

      const normalizedPaymentMethod = String(order.payment_method || '').trim().toLowerCase();
      if (OPERATOR_PAYMENT_METHODS.includes(normalizedPaymentMethod)) {
        const rawOperatorId = Number.parseInt(order.processed_by, 10);
        const operatorId = Number.isFinite(rawOperatorId) && rawOperatorId > 0 ? rawOperatorId : null;
        const operatorKey = operatorId ? `id:${operatorId}` : 'unassigned';
        const operatorName = String(order.processed_by_name || '').trim() || 'Без оператора';

        if (!operatorPaymentsByOperatorMap.has(operatorKey)) {
          operatorPaymentsByOperatorMap.set(operatorKey, {
            operatorId,
            operatorName,
            totalCount: 0,
            totalAmount: 0,
            methods: buildEmptyOperatorPaymentBuckets()
          });
        }

        const operatorEntry = operatorPaymentsByOperatorMap.get(operatorKey);
        const methodBucket = operatorEntry.methods[normalizedPaymentMethod];
        operatorEntry.totalCount += 1;
        operatorEntry.totalAmount += totalAmount;
        methodBucket.count += 1;
        methodBucket.amount += totalAmount;

        operatorPaymentsTotalsByMethod[normalizedPaymentMethod].count += 1;
        operatorPaymentsTotalsByMethod[normalizedPaymentMethod].amount += totalAmount;
        operatorPaymentsTotalCount += 1;
        operatorPaymentsTotalAmount += totalAmount;
      }
    }

    let itemsRevenue = 0;
    const topProductsMap = new Map();
    const categoriesMap = new Map();

    for (const item of itemsResult.rows) {
      const quantity = Math.max(0, toNumeric(item.quantity, 0));
      const price = Math.max(0, toNumeric(item.price, 0));
      const containerPrice = Math.max(0, toNumeric(item.container_price, 0));
      const containerNorm = Math.max(1, toNumeric(item.container_norm, 1));
      if (quantity > 0 && containerPrice > 0) {
        containersRevenue += Math.ceil(quantity / containerNorm) * containerPrice;
      }

      const normalizedStatus = normalizeStatus(item.status);
      if (normalizedStatus !== 'delivered') continue;

      const lineRevenue = quantity * price;
      itemsRevenue += lineRevenue;

      const productName = String(item.product_name || '').trim() || 'Товар';
      if (!topProductsMap.has(productName)) {
        topProductsMap.set(productName, { name: productName, quantity: 0, revenue: 0 });
      }
      const productEntry = topProductsMap.get(productName);
      productEntry.quantity += quantity;
      productEntry.revenue += lineRevenue;

      const categoryId = Number.parseInt(item.category_id, 10);
      const categoryKey = Number.isFinite(categoryId) ? `id:${categoryId}` : 'uncategorized';
      const categoryName = String(item.category_name || '').trim() || 'Без категории';
      if (!categoriesMap.has(categoryKey)) {
        categoriesMap.set(categoryKey, {
          categoryId: Number.isFinite(categoryId) ? categoryId : null,
          name: categoryName,
          quantity: 0,
          revenue: 0
        });
      }
      const categoryEntry = categoriesMap.get(categoryKey);
      categoryEntry.quantity += quantity;
      categoryEntry.revenue += lineRevenue;
    }

    const topProducts = Array.from(topProductsMap.values())
      .sort((a, b) => {
        if (b.quantity !== a.quantity) return b.quantity - a.quantity;
        return b.revenue - a.revenue;
      })
      .slice(0, 10);

    const topCustomers = Array.from(topCustomersMap.values())
      .sort((a, b) => {
        if (b.ordersCount !== a.ordersCount) return b.ordersCount - a.ordersCount;
        return b.totalAmount - a.totalAmount;
      })
      .slice(0, 10);

    const categoryRows = Array.from(categoriesMap.values());
    const categoriesByQuantity = [...categoryRows]
      .sort((a, b) => {
        if (b.quantity !== a.quantity) return b.quantity - a.quantity;
        return b.revenue - a.revenue;
      })
      .slice(0, 10);
    const categoriesByRevenue = [...categoryRows]
      .sort((a, b) => {
        if (b.revenue !== a.revenue) return b.revenue - a.revenue;
        return b.quantity - a.quantity;
      })
      .slice(0, 10);
    const activityTypesByQuantity = [...activityTypeRows]
      .sort((a, b) => {
        if (b.ordersCount !== a.ordersCount) return b.ordersCount - a.ordersCount;
        return b.revenue - a.revenue;
      })
      .slice(0, topLimit);
    const activityTypesByRevenue = [...activityTypeRows]
      .sort((a, b) => {
        if (b.revenue !== a.revenue) return b.revenue - a.revenue;
        return b.ordersCount - a.ordersCount;
      })
      .slice(0, topLimit);
    const operatorPaymentRows = Array.from(operatorPaymentsByOperatorMap.values())
      .map((row) => ({
        operatorId: row.operatorId,
        operatorName: row.operatorName,
        totalCount: Number.parseInt(row.totalCount, 10) || 0,
        totalAmount: Number(row.totalAmount) || 0,
        methods: OPERATOR_PAYMENT_METHODS.reduce((acc, methodKey) => {
          const bucket = row.methods?.[methodKey] || { count: 0, amount: 0 };
          const count = Number.parseInt(bucket.count, 10) || 0;
          acc[methodKey] = {
            count,
            amount: Number(bucket.amount) || 0,
            percent: ratioPercent(count, row.totalCount)
          };
          return acc;
        }, {})
      }))
      .sort((a, b) => {
        if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
        if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
        return String(a.operatorName || '').localeCompare(String(b.operatorName || ''), 'ru');
      });
    const operatorPaymentTotals = OPERATOR_PAYMENT_METHODS.reduce((acc, methodKey) => {
      const bucket = operatorPaymentsTotalsByMethod[methodKey] || { count: 0, amount: 0 };
      const count = Number.parseInt(bucket.count, 10) || 0;
      acc[methodKey] = {
        count,
        amount: Number(bucket.amount) || 0,
        percent: ratioPercent(count, operatorPaymentsTotalCount)
      };
      return acc;
    }, {});

    const averageCheck = deliveredOrdersCount > 0 ? Math.round(revenue / deliveredOrdersCount) : 0;
    const serviceRatingAvg = serviceRatingCount > 0
      ? Math.round((serviceRatingSum / serviceRatingCount) * 100) / 100
      : 0;
    const deliveryRatingAvg = deliveryRatingCount > 0
      ? Math.round((deliveryRatingSum / deliveryRatingCount) * 100) / 100
      : 0;

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
          WHERE user_telegram_id IS NOT NULL
            AND created_at >= $1::date
            AND created_at < $2::date
            AND ($3::int IS NULL OR restaurant_id = $3)
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
        registration_events AS (
          SELECT DISTINCT tg FROM events WHERE event_type = 'registration_completed'
        ),
        period_order_users AS (
          SELECT DISTINCT u.telegram_id::text AS tg
          FROM orders o
          JOIN users u ON u.id = o.user_id
          WHERE o.created_at >= $1::date
            AND o.created_at < $2::date
            AND u.telegram_id IS NOT NULL
            AND ($3::int IS NULL OR o.restaurant_id = $3)
        ),
        registered_users_from_db AS (
          SELECT DISTINCT u.telegram_id::text AS tg
          FROM users u
          WHERE u.role = 'customer'
            AND u.telegram_id IS NOT NULL
            AND u.created_at >= $1::date
            AND u.created_at < $2::date
            AND (
              $3::int IS NULL
              OR EXISTS (
                SELECT 1
                FROM user_restaurants ur
                WHERE ur.user_id = u.id
                  AND ur.restaurant_id = $3
              )
              OR EXISTS (
                SELECT 1
                FROM orders o_hist
                WHERE o_hist.user_id = u.id
                  AND o_hist.restaurant_id = $3
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
          (SELECT COUNT(*)::int FROM started s JOIN language_selected l ON l.tg = s.tg) AS language_selected_users,
          (SELECT COUNT(*)::int FROM started s JOIN contact_shared c ON c.tg = s.tg) AS contact_shared_users,
          (SELECT COUNT(*)::int FROM started s JOIN registration_completed r ON r.tg = s.tg) AS registration_completed_users,
          (SELECT COUNT(*)::int FROM registered_users_from_db) AS registered_users_from_db,
          (SELECT COUNT(*)::int FROM period_order_users) AS order_users_total,
          (SELECT COUNT(*)::int FROM started s JOIN period_order_users d ON d.tg = s.tg) AS started_with_order_users,
          (SELECT COUNT(*)::int FROM started s JOIN registration_completed r ON r.tg = s.tg JOIN period_order_users d ON d.tg = s.tg) AS registered_with_order_users
        `,
        [startDateKey, endDateKeyExclusive, restaurantId]
      );
      botFunnelRow = botFunnelResult.rows[0] || null;
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
    const registrationCompletedUsers = toInt(botFunnelRow?.registration_completed_users);
    const registeredUsersFromDb = toInt(botFunnelRow?.registered_users_from_db);
    const startedWithOrderUsers = toInt(botFunnelRow?.started_with_order_users);
    const registeredWithOrderUsers = toInt(botFunnelRow?.registered_with_order_users);
    const orderUsersTotal = toInt(botFunnelRow?.order_users_total);

    res.json({
      period: analyticsRange.period,
      date: analyticsRange.dateKey,
      startDate: startDateKey,
      endDateExclusive: endDateKeyExclusive,
      year: analyticsRange.year,
      month: analyticsRange.month,
      timezone: ANALYTICS_TIMEZONE,
      restaurant: restaurantMeta,
      kpis: {
        revenue,
        ordersCount: deliveredOrdersCount,
        averageCheck,
        pickupOrdersCount,
        deliveryOrdersCount,
        itemsRevenue,
        deliveryRevenue,
        serviceRevenue,
        containersRevenue,
        serviceRatingAvg,
        deliveryRatingAvg,
        serviceRatingCount,
        deliveryRatingCount
      },
      statusSummary,
      timelines: {
        revenue: revenueTimeline,
        orders: ordersTimeline
      },
      orderLocations,
      topProducts,
      topCustomers,
      categories: {
        byQuantity: categoriesByQuantity,
        byRevenue: categoriesByRevenue
      },
      activityTypes: {
        byQuantity: activityTypesByQuantity,
        byRevenue: activityTypesByRevenue
      },
      operatorPayments: {
        paymentMethods: OPERATOR_PAYMENT_METHODS.map((methodKey) => ({
          key: methodKey,
          label: OPERATOR_PAYMENT_LABELS[methodKey] || methodKey
        })),
        totalCount: operatorPaymentsTotalCount,
        totalAmount: operatorPaymentsTotalAmount,
        operators: operatorPaymentRows,
        totalsByMethod: operatorPaymentTotals
      },
      shops: {
        topLimit,
        lowBalance: lowBalanceRestaurantsResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          balance: Number(row.balance) || 0
        })),
        topByOrders: topStoresByOrdersResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          ordersCount: Number.parseInt(row.orders_count, 10) || 0,
          revenue: Number(row.delivered_revenue) || 0
        })),
        topByRevenue: topStoresByRevenueResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          ordersCount: Number.parseInt(row.orders_count, 10) || 0,
          revenue: Number(row.delivered_revenue) || 0
        }))
      },
      funnel: {
        startedUsers,
        languageSelectedUsers,
        contactSharedUsers,
        registrationCompletedUsers,
        registeredUsersFromDb,
        startedWithOrderUsers,
        registeredWithOrderUsers,
        orderUsersTotal,
        noLanguageAfterStart: Math.max(0, startedUsers - languageSelectedUsers),
        noPhoneAfterLanguage: Math.max(0, languageSelectedUsers - contactSharedUsers),
        noOrderAfterRegistration: Math.max(0, registrationCompletedUsers - registeredWithOrderUsers),
        conversionStartToRegistration: ratioPercent(registrationCompletedUsers, startedUsers),
        conversionStartToOrder: ratioPercent(startedWithOrderUsers, startedUsers),
        conversionRegistrationToOrder: ratioPercent(registeredWithOrderUsers, registrationCompletedUsers)
      }
    });
  } catch (error) {
    console.error('Superadmin analytics overview error:', error);
    res.status(500).json({ error: 'Ошибка получения аналитики' });
  }
});

router.get('/analytics/product-reviews', async (req, res) => {
  try {
    const analyticsRange = resolveAnalyticsRange(req.query || {});
    const requestedCommentsLimit = Number.parseInt(req.query.limit, 10);
    const commentsLimit = Number.isFinite(requestedCommentsLimit)
      ? Math.min(Math.max(requestedCommentsLimit, 1), 100)
      : 30;
    const requestedTopLimit = Number.parseInt(req.query.top_limit, 10);
    const topLimit = Number.isFinite(requestedTopLimit)
      ? Math.min(Math.max(requestedTopLimit, 1), 30)
      : 10;

    let restaurantId = null;
    if (req.query.restaurant_id !== undefined && req.query.restaurant_id !== null && String(req.query.restaurant_id).trim() !== '') {
      const parsedRestaurantId = Number.parseInt(req.query.restaurant_id, 10);
      if (!Number.isFinite(parsedRestaurantId) || parsedRestaurantId <= 0) {
        return res.status(400).json({ error: 'Некорректный restaurant_id' });
      }
      restaurantId = parsedRestaurantId;
      const restaurantResult = await pool.query('SELECT id FROM restaurants WHERE id = $1 LIMIT 1', [restaurantId]);
      if (!restaurantResult.rows.length) {
        return res.status(404).json({ error: 'Магазин не найден' });
      }
    }

    await ensureProductReviewsSchema().catch(() => {});

    const baseParams = [restaurantId, analyticsRange.startDateKey, analyticsRange.endDateKeyExclusive];
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
          WHERE ($1::int IS NULL OR p.restaurant_id = $1)
            AND pr.is_deleted = false
            AND pr.created_at >= $2::date
            AND pr.created_at < $3::date
          `,
          baseParams
        ),
        pool.query(
          `
          SELECT
            pr.id,
            pr.product_id,
            COALESCE(NULLIF(BTRIM(p.name_ru), ''), NULLIF(BTRIM(p.name_uz), ''), CONCAT('#', p.id::text)) AS product_name,
            p.restaurant_id,
            COALESCE(NULLIF(BTRIM(r.name), ''), CONCAT('ID ', p.restaurant_id::text)) AS restaurant_name,
            pr.rating,
            pr.comment,
            pr.created_at,
            pr.user_id,
            COALESCE(NULLIF(BTRIM(u.full_name), ''), NULLIF(BTRIM(u.username), ''), 'Клиент') AS author_name
          FROM product_reviews pr
          JOIN products p ON p.id = pr.product_id
          LEFT JOIN restaurants r ON r.id = p.restaurant_id
          LEFT JOIN users u ON u.id = pr.user_id
          WHERE ($1::int IS NULL OR p.restaurant_id = $1)
            AND pr.is_deleted = false
            AND pr.created_at >= $2::date
            AND pr.created_at < $3::date
            AND NULLIF(BTRIM(COALESCE(pr.comment, '')), '') IS NOT NULL
          ORDER BY pr.created_at DESC, pr.id DESC
          LIMIT $4
          `,
          [...baseParams, commentsLimit]
        ),
        pool.query(
          `
          SELECT
            pr.product_id,
            COALESCE(NULLIF(BTRIM(p.name_ru), ''), NULLIF(BTRIM(p.name_uz), ''), CONCAT('#', p.id::text)) AS product_name,
            p.restaurant_id,
            COALESCE(NULLIF(BTRIM(r.name), ''), CONCAT('ID ', p.restaurant_id::text)) AS restaurant_name,
            COUNT(*)::int AS total_reviews,
            COUNT(*) FILTER (WHERE NULLIF(BTRIM(COALESCE(pr.comment, '')), '') IS NOT NULL)::int AS comments_count,
            ROUND(COALESCE(AVG(pr.rating)::numeric, 0), 2)::float AS average_rating
          FROM product_reviews pr
          JOIN products p ON p.id = pr.product_id
          LEFT JOIN restaurants r ON r.id = p.restaurant_id
          WHERE ($1::int IS NULL OR p.restaurant_id = $1)
            AND pr.is_deleted = false
            AND pr.created_at >= $2::date
            AND pr.created_at < $3::date
          GROUP BY pr.product_id, p.id, p.name_ru, p.name_uz, p.restaurant_id, r.name
          ORDER BY comments_count DESC, total_reviews DESC, average_rating DESC
          LIMIT $4
          `,
          [...baseParams, topLimit]
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
      restaurantId,
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
        restaurantId: Number.parseInt(row.restaurant_id, 10) || null,
        restaurantName: row.restaurant_name || '—',
        rating: Number.parseInt(row.rating, 10) || 0,
        comment: row.comment || '',
        createdAt: row.created_at || null,
        userId: Number.parseInt(row.user_id, 10) || null,
        authorName: row.author_name || 'Клиент'
      })),
      topProducts: topProducts.map((row) => ({
        productId: Number.parseInt(row.product_id, 10) || 0,
        productName: row.product_name || 'Товар',
        restaurantId: Number.parseInt(row.restaurant_id, 10) || null,
        restaurantName: row.restaurant_name || '—',
        totalReviews: Number.parseInt(row.total_reviews, 10) || 0,
        commentsCount: Number.parseInt(row.comments_count, 10) || 0,
        averageRating: Number(row.average_rating || 0)
      }))
    });
  } catch (error) {
    console.error('Superadmin product review analytics error:', error);
    res.status(500).json({ error: 'Ошибка получения аналитики отзывов' });
  }
});

// =====================================================
// GLOBAL ADS (SUPERADMIN ONLY)
// =====================================================

const mapAdBannerRow = (row) => {
  const repeatDays = Array.isArray(row.repeat_days) ? row.repeat_days : normalizeAdRepeatDays(row.repeat_days);
  const targetActivityTypeIds = Array.isArray(row.target_activity_type_ids)
    ? normalizeAdTargetActivityTypeIds(row.target_activity_type_ids)
    : normalizeAdTargetActivityTypeIds(row.target_activity_type_ids);
  const adType = AD_BANNER_TYPES.has(String(row.ad_type || '').trim().toLowerCase())
    ? String(row.ad_type).trim().toLowerCase()
    : 'banner';
  const banner = { ...row, ad_type: adType, repeat_days: repeatDays, target_activity_type_ids: targetActivityTypeIds };
  return {
    ...banner,
    is_visible_now: isAdBannerVisibleNow(banner),
    runtime_status: getAdBannerStatus(banner)
  };
};

const parseAdAnalyticsDays = (value) => {
  if (value === 'all') return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return 30;
  return Math.min(Math.max(parsed, 1), 365);
};

const buildAdAnalyticsWhere = ({ bannerId, days }) => {
  const params = [bannerId];
  let sql = `
    e.banner_id = $1
  `;
  if (days) {
    params.push(days);
    sql += ` AND e.created_at >= (NOW() - ($2::int * INTERVAL '1 day'))`;
  }
  return { sql, params };
};

const mapPgInt = (value) => Number.parseInt(value, 10) || 0;

router.get('/ads/banners', async (req, res) => {
  try {
    await ensureActivityTypesSchema();
    const { status = 'all', include_deleted = 'false' } = req.query;
    const includeDeleted = include_deleted === 'true';

    const result = await pool.query(`
      SELECT
        b.*,
        cu.username AS created_by_username,
        uu.username AS updated_by_username,
        COALESCE(stats.total_views, 0)::int AS total_views,
        COALESCE(stats.unique_views, 0)::int AS unique_views,
        COALESCE(stats.total_clicks, 0)::int AS total_clicks,
        stats.last_view_at,
        stats.last_click_at
      FROM ad_banners b
      LEFT JOIN users cu ON cu.id = b.created_by
      LEFT JOIN users uu ON uu.id = b.updated_by
      LEFT JOIN (
        SELECT
          e.banner_id,
          COUNT(*) FILTER (WHERE e.event_type = 'view') AS total_views,
          COUNT(*) FILTER (WHERE e.event_type = 'click') AS total_clicks,
          COUNT(DISTINCT CASE
            WHEN e.event_type = 'view' THEN COALESCE(e.user_id::text, NULLIF(e.viewer_key, ''), NULLIF(e.ip_address, ''))
            ELSE NULL
          END) AS unique_views,
          MAX(e.created_at) FILTER (WHERE e.event_type = 'view') AS last_view_at,
          MAX(e.created_at) FILTER (WHERE e.event_type = 'click') AS last_click_at
        FROM ad_banner_events e
        GROUP BY e.banner_id
      ) stats ON stats.banner_id = b.id
      WHERE ($1::boolean = true OR b.is_deleted = false)
      ORDER BY b.slot_order ASC, b.created_at DESC
    `, [includeDeleted]);

    const allRows = result.rows.map(mapAdBannerRow);
    let rows = allRows;
    if (status !== 'all') {
      rows = rows.filter((row) => row.runtime_status === status);
    }

    const activeNowCount = allRows.filter((row) => row.is_visible_now).length;
    res.json({
      items: rows,
      max_slots: AD_BANNER_MAX_SLOTS,
      active_now_count: activeNowCount
    });
  } catch (error) {
    console.error('Get ad banners error:', error);
    res.status(500).json({ error: 'Ошибка получения рекламных баннеров' });
  }
});

router.get('/ads/banners/:id/analytics', async (req, res) => {
  try {
    const bannerId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(bannerId)) {
      return res.status(400).json({ error: 'Некорректный ID баннера' });
    }

    const days = parseAdAnalyticsDays(req.query.days);

    const bannerResult = await pool.query(
      `SELECT b.*, cu.username AS created_by_username, uu.username AS updated_by_username
       FROM ad_banners b
       LEFT JOIN users cu ON cu.id = b.created_by
       LEFT JOIN users uu ON uu.id = b.updated_by
       WHERE b.id = $1`,
      [bannerId]
    );

    if (!bannerResult.rows.length) {
      return res.status(404).json({ error: 'Баннер не найден' });
    }

    const banner = mapAdBannerRow(bannerResult.rows[0]);
    const where = buildAdAnalyticsWhere({ bannerId, days });
    const uniqueViewerExpr = `COALESCE(e.user_id::text, NULLIF(e.viewer_key, ''), NULLIF(e.ip_address, ''))`;

    const overviewResult = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE e.event_type = 'view')::int AS total_views,
        COUNT(*) FILTER (WHERE e.event_type = 'click')::int AS total_clicks,
        COUNT(DISTINCT CASE WHEN e.event_type = 'view' THEN ${uniqueViewerExpr} ELSE NULL END)::int AS unique_views,
        COUNT(DISTINCT CASE WHEN e.event_type = 'click' THEN ${uniqueViewerExpr} ELSE NULL END)::int AS unique_clicks,
        MAX(e.created_at) FILTER (WHERE e.event_type = 'view') AS last_view_at,
        MAX(e.created_at) FILTER (WHERE e.event_type = 'click') AS last_click_at
      FROM ad_banner_events e
      WHERE ${where.sql}
      `,
      where.params
    );

    const dailyResult = await pool.query(
      `
      SELECT
        DATE_TRUNC('day', e.created_at) AS day,
        COUNT(*) FILTER (WHERE e.event_type = 'view')::int AS views,
        COUNT(*) FILTER (WHERE e.event_type = 'click')::int AS clicks,
        COUNT(DISTINCT CASE WHEN e.event_type = 'view' THEN ${uniqueViewerExpr} ELSE NULL END)::int AS unique_views
      FROM ad_banner_events e
      WHERE ${where.sql}
      GROUP BY DATE_TRUNC('day', e.created_at)
      ORDER BY day DESC
      LIMIT 90
      `,
      where.params
    );

    const browserStatsResult = await pool.query(
      `
      SELECT
        COALESCE(NULLIF(e.browser_name, ''), 'Unknown') AS browser_name,
        NULLIF(e.browser_version, '') AS browser_version,
        NULLIF(e.app_container, '') AS app_container,
        COALESCE(e.is_in_app_browser, false) AS is_in_app_browser,
        COUNT(*) FILTER (WHERE e.event_type = 'view')::int AS views,
        COUNT(*) FILTER (WHERE e.event_type = 'click')::int AS clicks,
        COUNT(DISTINCT CASE WHEN e.event_type = 'view' THEN ${uniqueViewerExpr} ELSE NULL END)::int AS unique_views
      FROM ad_banner_events e
      WHERE ${where.sql}
      GROUP BY 1,2,3,4
      HAVING COUNT(*) FILTER (WHERE e.event_type IN ('view','click')) > 0
      ORDER BY views DESC, clicks DESC, browser_name ASC
      LIMIT 20
      `,
      where.params
    );

    const deviceStatsResult = await pool.query(
      `
      SELECT
        COALESCE(NULLIF(e.device_type, ''), 'desktop') AS device_type,
        NULLIF(e.device_brand, '') AS device_brand,
        NULLIF(e.device_model, '') AS device_model,
        COALESCE(NULLIF(e.os_name, ''), 'Unknown') AS os_name,
        NULLIF(e.os_version, '') AS os_version,
        COUNT(*) FILTER (WHERE e.event_type = 'view')::int AS views,
        COUNT(*) FILTER (WHERE e.event_type = 'click')::int AS clicks,
        COUNT(DISTINCT CASE WHEN e.event_type = 'view' THEN ${uniqueViewerExpr} ELSE NULL END)::int AS unique_views
      FROM ad_banner_events e
      WHERE ${where.sql}
      GROUP BY 1,2,3,4,5
      HAVING COUNT(*) FILTER (WHERE e.event_type IN ('view','click')) > 0
      ORDER BY views DESC, clicks DESC
      LIMIT 20
      `,
      where.params
    );

    const countryStatsResult = await pool.query(
      `
      SELECT
        COALESCE(NULLIF(e.country, ''), 'Unknown') AS country,
        COUNT(*) FILTER (WHERE e.event_type = 'view')::int AS views,
        COUNT(*) FILTER (WHERE e.event_type = 'click')::int AS clicks,
        COUNT(DISTINCT CASE WHEN e.event_type = 'view' THEN ${uniqueViewerExpr} ELSE NULL END)::int AS unique_views
      FROM ad_banner_events e
      WHERE ${where.sql}
      GROUP BY 1
      HAVING COUNT(*) FILTER (WHERE e.event_type IN ('view','click')) > 0
      ORDER BY views DESC, clicks DESC
      LIMIT 15
      `,
      where.params
    );

    const cityStatsResult = await pool.query(
      `
      SELECT
        COALESCE(NULLIF(e.country, ''), 'Unknown') AS country,
        COALESCE(NULLIF(e.region, ''), 'Unknown') AS region,
        COALESCE(NULLIF(e.city, ''), 'Unknown') AS city,
        COUNT(*) FILTER (WHERE e.event_type = 'view')::int AS views,
        COUNT(*) FILTER (WHERE e.event_type = 'click')::int AS clicks,
        COUNT(DISTINCT CASE WHEN e.event_type = 'view' THEN ${uniqueViewerExpr} ELSE NULL END)::int AS unique_views
      FROM ad_banner_events e
      WHERE ${where.sql}
      GROUP BY 1,2,3
      HAVING COUNT(*) FILTER (WHERE e.event_type IN ('view','click')) > 0
      ORDER BY views DESC, clicks DESC
      LIMIT 20
      `,
      where.params
    );

    const overviewRow = overviewResult.rows[0] || {};
    const totalViews = mapPgInt(overviewRow.total_views);
    const totalClicks = mapPgInt(overviewRow.total_clicks);
    const uniqueViews = mapPgInt(overviewRow.unique_views);
    const ctr = totalViews > 0 ? Number(((totalClicks / totalViews) * 100).toFixed(2)) : 0;

    res.json({
      banner,
      range: {
        days: days || 'all'
      },
      overview: {
        total_views: totalViews,
        total_clicks: totalClicks,
        unique_views: uniqueViews,
        unique_clicks: mapPgInt(overviewRow.unique_clicks),
        ctr,
        last_view_at: overviewRow.last_view_at || null,
        last_click_at: overviewRow.last_click_at || null
      },
      daily: dailyResult.rows.map((row) => ({
        day: row.day,
        views: mapPgInt(row.views),
        clicks: mapPgInt(row.clicks),
        unique_views: mapPgInt(row.unique_views)
      })),
      browsers: browserStatsResult.rows.map((row) => ({
        browser_name: row.browser_name,
        browser_version: row.browser_version || null,
        app_container: row.app_container || null,
        is_in_app_browser: !!row.is_in_app_browser,
        views: mapPgInt(row.views),
        clicks: mapPgInt(row.clicks),
        unique_views: mapPgInt(row.unique_views)
      })),
      devices: deviceStatsResult.rows.map((row) => ({
        device_type: row.device_type || 'desktop',
        device_brand: row.device_brand || null,
        device_model: row.device_model || null,
        os_name: row.os_name || null,
        os_version: row.os_version || null,
        views: mapPgInt(row.views),
        clicks: mapPgInt(row.clicks),
        unique_views: mapPgInt(row.unique_views)
      })),
      countries: countryStatsResult.rows.map((row) => ({
        country: row.country || 'UZ',
        views: mapPgInt(row.views),
        clicks: mapPgInt(row.clicks),
        unique_views: mapPgInt(row.unique_views)
      })),
      cities: cityStatsResult.rows.map((row) => ({
        country: row.country || 'UZ',
        region: row.region || '',
        city: row.city || '',
        views: mapPgInt(row.views),
        clicks: mapPgInt(row.clicks),
        unique_views: mapPgInt(row.unique_views)
      }))
    });
  } catch (error) {
    console.error('Get ad banner analytics error:', error);
    res.status(500).json({ error: 'Ошибка получения аналитики рекламы' });
  }
});

router.post('/ads/banners', async (req, res) => {
  try {
    await ensureActivityTypesSchema();
    const payload = normalizeAdBannerPayload(req.body);
    if (payload.error) {
      return res.status(400).json({ error: payload.error });
    }

    if (payload.target_activity_type_ids.length > 0) {
      const validIdsResult = await pool.query(
        'SELECT id FROM business_activity_types WHERE id = ANY($1::int[])',
        [payload.target_activity_type_ids]
      );
      const validIds = new Set(validIdsResult.rows.map((row) => Number(row.id)));
      const missingIds = payload.target_activity_type_ids.filter((id) => !validIds.has(Number(id)));
      if (missingIds.length > 0) {
        return res.status(400).json({ error: `Не найдены виды деятельности: ${missingIds.join(', ')}` });
      }
    }

    const activeCountResult = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM ad_banners
       WHERE is_deleted = false`
    );
    if ((activeCountResult.rows[0]?.count || 0) >= 1000) {
      return res.status(400).json({ error: 'Слишком много записей рекламы. Очистите историю.' });
    }

    const result = await pool.query(`
      INSERT INTO ad_banners (
        title, image_url, button_text, target_url, ad_type,
        slot_order, display_seconds, transition_effect,
        start_at, end_at, repeat_days, target_activity_type_ids, is_enabled,
        created_by, updated_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15)
      RETURNING *
    `, [
      payload.title,
      payload.image_url,
      payload.button_text,
      payload.target_url,
      payload.ad_type,
      payload.slot_order,
      payload.display_seconds,
      payload.transition_effect,
      payload.start_at,
      payload.end_at,
      JSON.stringify(payload.repeat_days),
      JSON.stringify(payload.target_activity_type_ids),
      payload.is_enabled,
      req.user.id,
      req.user.id
    ]);

    res.status(201).json(mapAdBannerRow(result.rows[0]));
  } catch (error) {
    console.error('Create ad banner error:', error);
    if (error?.code === '23502' && error?.column === 'target_url') {
      return res.status(400).json({
        error: 'Ссылка баннера сейчас необязательна, но в базе ещё старая схема',
        details: 'Нужен деплой/перезапуск с актуальной миграцией (колонка target_url должна быть nullable)'
      });
    }
    if (error?.code === '23514') {
      return res.status(400).json({
        error: 'Проверьте параметры рекламы',
        details: error.constraint || 'Нарушено ограничение данных баннера'
      });
    }
    res.status(500).json({ error: 'Ошибка создания рекламного баннера' });
  }
});

router.put('/ads/banners/:id', async (req, res) => {
  try {
    await ensureActivityTypesSchema();
    const bannerId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(bannerId)) {
      return res.status(400).json({ error: 'Некорректный ID баннера' });
    }

    const exists = await pool.query('SELECT id FROM ad_banners WHERE id = $1 AND is_deleted = false', [bannerId]);
    if (!exists.rows.length) {
      return res.status(404).json({ error: 'Баннер не найден' });
    }

    const payload = normalizeAdBannerPayload(req.body);
    if (payload.error) {
      return res.status(400).json({ error: payload.error });
    }

    if (payload.target_activity_type_ids.length > 0) {
      const validIdsResult = await pool.query(
        'SELECT id FROM business_activity_types WHERE id = ANY($1::int[])',
        [payload.target_activity_type_ids]
      );
      const validIds = new Set(validIdsResult.rows.map((row) => Number(row.id)));
      const missingIds = payload.target_activity_type_ids.filter((id) => !validIds.has(Number(id)));
      if (missingIds.length > 0) {
        return res.status(400).json({ error: `Не найдены виды деятельности: ${missingIds.join(', ')}` });
      }
    }

    const result = await pool.query(`
      UPDATE ad_banners
      SET title = $1,
          image_url = $2,
          button_text = $3,
          target_url = $4,
          ad_type = $5,
          slot_order = $6,
          display_seconds = $7,
          transition_effect = $8,
          start_at = $9,
          end_at = $10,
          repeat_days = $11::jsonb,
          target_activity_type_ids = $12::jsonb,
          is_enabled = $13,
          updated_by = $14,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $15
      RETURNING *
    `, [
      payload.title,
      payload.image_url,
      payload.button_text,
      payload.target_url,
      payload.ad_type,
      payload.slot_order,
      payload.display_seconds,
      payload.transition_effect,
      payload.start_at,
      payload.end_at,
      JSON.stringify(payload.repeat_days),
      JSON.stringify(payload.target_activity_type_ids),
      payload.is_enabled,
      req.user.id,
      bannerId
    ]);

    res.json(mapAdBannerRow(result.rows[0]));
  } catch (error) {
    console.error('Update ad banner error:', error);
    if (error?.code === '23502' && error?.column === 'target_url') {
      return res.status(400).json({
        error: 'Ссылка баннера сейчас необязательна, но в базе ещё старая схема',
        details: 'Нужен деплой/перезапуск с актуальной миграцией (колонка target_url должна быть nullable)'
      });
    }
    if (error?.code === '23514') {
      return res.status(400).json({
        error: 'Проверьте параметры рекламы',
        details: error.constraint || 'Нарушено ограничение данных баннера'
      });
    }
    res.status(500).json({ error: 'Ошибка обновления рекламного баннера' });
  }
});

router.patch('/ads/banners/:id/toggle', async (req, res) => {
  try {
    const bannerId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(bannerId)) {
      return res.status(400).json({ error: 'Некорректный ID баннера' });
    }

    const result = await pool.query(`
      UPDATE ad_banners
      SET is_enabled = NOT is_enabled,
          updated_by = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND is_deleted = false
      RETURNING *
    `, [bannerId, req.user.id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Баннер не найден' });
    }

    res.json(mapAdBannerRow(result.rows[0]));
  } catch (error) {
    console.error('Toggle ad banner error:', error);
    res.status(500).json({ error: 'Ошибка переключения рекламы' });
  }
});

router.delete('/ads/banners/:id', async (req, res) => {
  try {
    const bannerId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(bannerId)) {
      return res.status(400).json({ error: 'Некорректный ID баннера' });
    }

    const result = await pool.query(`
      UPDATE ad_banners
      SET is_deleted = true,
          is_enabled = false,
          updated_by = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND is_deleted = false
      RETURNING id
    `, [bannerId, req.user.id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Баннер не найден' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete ad banner error:', error);
    res.status(500).json({ error: 'Ошибка удаления рекламы' });
  }
});

// =====================================================
// БИЛЛИНГ (НАСТРОЙКИ)
// =====================================================

// Получить глобальные настройки биллинга
router.get('/billing/settings', async (req, res) => {
  try {
    await ensureBillingSettingsSchema();
    const result = await pool.query('SELECT * FROM billing_settings WHERE id = 1');
    const payload = await enrichBillingSettingsWithCentralBotMeta(result.rows[0] || {});
    res.json(payload);
  } catch (error) {
    console.error('Get billing settings error:', error);
    res.status(500).json({ error: 'Ошибка получения настроек' });
  }
});

// Обновить глобальные настройки биллинга
router.put('/billing/settings', async (req, res) => {
  try {
    await ensureBillingSettingsSchema();
    const {
      card_number, card_holder, phone_number, telegram_username,
      click_link, payme_link, default_starting_balance, default_order_cost,
      superadmin_bot_token,
      superadmin_telegram_id,
      catalog_animation_season
    } = req.body;

    const normalizedToken = normalizeTokenValue(superadmin_bot_token);
    const normalizedSuperadminTelegramId = normalizeTelegramIdValue(superadmin_telegram_id);
    const normalizedCatalogAnimationSeason = normalizeCatalogAnimationSeason(catalog_animation_season, 'off');
    const previousSettings = await pool.query(
      'SELECT superadmin_bot_token FROM billing_settings WHERE id = 1'
    );
    const previousToken = normalizeTokenValue(previousSettings.rows[0]?.superadmin_bot_token);

    const result = await pool.query(`
      UPDATE billing_settings
      SET card_number = $1, card_holder = $2, phone_number = $3, 
          telegram_username = $4, click_link = $5, payme_link = $6, 
          default_starting_balance = $7, default_order_cost = $8,
          superadmin_bot_token = $9,
          superadmin_telegram_id = $10,
          catalog_animation_season = $11,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
      RETURNING *
    `, [
      card_number, card_holder, phone_number, telegram_username,
      click_link, payme_link, parseFloat(default_starting_balance) || 100000, parseFlexibleAmount(default_order_cost, 1000),
      normalizedToken, normalizedSuperadminTelegramId, normalizedCatalogAnimationSeason
    ]);

    try {
      await reloadBot();
    } catch (reloadErr) {
      console.error('Bot reload warning after settings update:', reloadErr.message);
    }

    if (normalizedToken && normalizedToken !== previousToken) {
      try {
        const notificationTargetId = normalizeTelegramIdValue(result.rows[0]?.superadmin_telegram_id) || req.user.telegram_id;
        await notifySuperadminTokenChanged(notificationTargetId);
      } catch (notifyErr) {
        console.error('Bot token change notification warning:', notifyErr.message);
      }
    }

    const payload = await enrichBillingSettingsWithCentralBotMeta(result.rows[0]);
    res.json(payload);
  } catch (error) {
    console.error('Update billing settings error:', error);
    res.status(500).json({ error: 'Ошибка сохранения настроек' });
  }
});

// Проверить центрального бота и отправить тестовое сообщение
router.post('/billing/settings/test-bot', async (req, res) => {
  try {
    const {
      superadmin_bot_token,
      superadmin_telegram_id
    } = req.body || {};

    const token = normalizeTokenValue(superadmin_bot_token);
    const telegramId = normalizeTelegramIdValue(superadmin_telegram_id);

    if (!token) {
      return res.status(400).json({ error: 'Введите токен центрального Telegram-бота' });
    }

    if (!telegramId) {
      return res.status(400).json({ error: 'Введите Telegram ID владельца суперадминки' });
    }

    const bot = new TelegramBot(token);
    const me = await bot.getMe();

    await bot.sendMessage(
      telegramId,
      '✅ Тестовое сообщение\nБот работает'
    );

    res.json({
      success: true,
      message: 'Тестовое сообщение отправлено. Проверьте Telegram.',
      superadmin_bot_name: me?.first_name || null,
      superadmin_bot_username: me?.username ? `@${me.username}` : null
    });
  } catch (error) {
    console.error('Test central bot error:', error);
    res.status(400).json({
      error: 'Не удалось проверить бота или отправить тестовое сообщение',
      details: error.message
    });
  }
});

// =====================================================
// HELP INSTRUCTIONS (SUPERADMIN)
// =====================================================

router.get('/help-instructions', async (req, res) => {
  try {
    await ensureHelpInstructionsSchema();
    const rows = await listHelpInstructions();
    res.json(rows);
  } catch (error) {
    console.error('Get help instructions error:', error);
    res.status(500).json({ error: 'Ошибка загрузки инструкций' });
  }
});

router.post('/help-instructions', async (req, res) => {
  try {
    await ensureHelpInstructionsSchema();
    const titleRu = normalizeInstructionText(req.body?.title_ru);
    const titleUz = normalizeInstructionText(req.body?.title_uz);
    const youtubeUrl = String(req.body?.youtube_url || '').trim();
    const sortOrderRaw = req.body?.sort_order;
    const parsedSortOrder = Number.parseInt(sortOrderRaw, 10);

    if (!titleRu) {
      return res.status(400).json({ error: 'Название кнопки RU обязательно' });
    }
    if (!titleUz) {
      return res.status(400).json({ error: 'Название кнопки UZ обязательно' });
    }
    if (!youtubeUrl) {
      return res.status(400).json({ error: 'Ссылка на YouTube обязательна' });
    }
    if (!isValidYouTubeUrl(youtubeUrl)) {
      return res.status(400).json({ error: 'Укажите корректную ссылку YouTube' });
    }
    if (sortOrderRaw !== undefined && sortOrderRaw !== null && String(sortOrderRaw).trim() !== '' &&
      (!Number.isFinite(parsedSortOrder) || parsedSortOrder <= 0)) {
      return res.status(400).json({ error: 'Некорректный порядковый номер' });
    }

    const created = await createHelpInstruction({
      title_ru: titleRu,
      title_uz: titleUz,
      youtube_url: youtubeUrl,
      sort_order: (sortOrderRaw === undefined || sortOrderRaw === null || String(sortOrderRaw).trim() === '')
        ? await resolveNextSortOrder()
        : parsedSortOrder
    });
    res.status(201).json(created);
  } catch (error) {
    console.error('Create help instruction error:', error);
    if (error?.code === 'DUPLICATE_SORT_ORDER') {
      return res.status(409).json({ error: 'Этот порядковый номер уже используется. Выберите свободный номер.' });
    }
    res.status(500).json({ error: 'Ошибка добавления инструкции' });
  }
});

router.put('/help-instructions/:id', async (req, res) => {
  try {
    await ensureHelpInstructionsSchema();
    const instructionId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(instructionId) || instructionId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID инструкции' });
    }

    const titleRu = normalizeInstructionText(req.body?.title_ru);
    const titleUz = normalizeInstructionText(req.body?.title_uz);
    const youtubeUrl = String(req.body?.youtube_url || '').trim();
    const sortOrder = Number.parseInt(req.body?.sort_order, 10);

    if (!titleRu) {
      return res.status(400).json({ error: 'Название кнопки RU обязательно' });
    }
    if (!titleUz) {
      return res.status(400).json({ error: 'Название кнопки UZ обязательно' });
    }
    if (!youtubeUrl) {
      return res.status(400).json({ error: 'Ссылка на YouTube обязательна' });
    }
    if (!isValidYouTubeUrl(youtubeUrl)) {
      return res.status(400).json({ error: 'Укажите корректную ссылку YouTube' });
    }
    if (!Number.isFinite(sortOrder) || sortOrder <= 0) {
      return res.status(400).json({ error: 'Некорректный порядковый номер' });
    }

    const updated = await updateHelpInstruction(instructionId, {
      title_ru: titleRu,
      title_uz: titleUz,
      youtube_url: youtubeUrl,
      sort_order: sortOrder
    });

    if (!updated) {
      return res.status(404).json({ error: 'Инструкция не найдена' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Update help instruction error:', error);
    if (error?.code === 'DUPLICATE_SORT_ORDER') {
      return res.status(409).json({ error: 'Этот порядковый номер уже используется. Выберите свободный номер.' });
    }
    res.status(500).json({ error: 'Ошибка обновления инструкции' });
  }
});

router.delete('/help-instructions/:id', async (req, res) => {
  try {
    await ensureHelpInstructionsSchema();
    const instructionId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(instructionId) || instructionId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID инструкции' });
    }

    const deleted = await deleteHelpInstruction(instructionId);
    if (!deleted) {
      return res.status(404).json({ error: 'Инструкция не найдена' });
    }

    res.json({ success: true, deleted });
  } catch (error) {
    console.error('Delete help instruction error:', error);
    if (error?.code === 'DEFAULT_DELETE_FORBIDDEN') {
      return res.status(400).json({ error: 'Системные инструкции удалять нельзя' });
    }
    res.status(500).json({ error: 'Ошибка удаления инструкции' });
  }
});

module.exports = router;

