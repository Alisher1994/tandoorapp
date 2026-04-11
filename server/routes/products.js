const express = require('express');
const pool = require('../database/connection');
const jwt = require('jsonwebtoken');
const TelegramBot = require('node-telegram-bot-api');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');
const { authenticate } = require('../middleware/auth');
const { ensureReservationSchema } = require('../services/reservationSchema');

const router = express.Router();
const isEnabledFlag = (value) => value === true || value === 'true' || value === 1 || value === '1';
const TASHKENT_TZ = 'Asia/Tashkent';
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
const RESTAURANT_CURRENCY_CODES = new Set(['uz', 'kz', 'tm', 'tj', 'kg', 'af', 'ru']);
const normalizeRestaurantCurrencyCode = (value, fallback = 'uz') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (RESTAURANT_CURRENCY_CODES.has(normalized)) return normalized;
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return RESTAURANT_CURRENCY_CODES.has(normalizedFallback) ? normalizedFallback : 'uz';
};
const CATALOG_ANIMATION_SEASON_VALUES = new Set(['off', 'spring', 'summer', 'autumn', 'winter']);
const normalizeCatalogAnimationSeason = (value, fallback = 'off') => {
  const normalized = String(value || '').trim().toLowerCase();
  return CATALOG_ANIMATION_SEASON_VALUES.has(normalized) ? normalized : fallback;
};
const normalizeMenuViewMode = (value, fallback = 'grid_categories') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'single_list' || normalized === 'grid_categories') {
    return normalized;
  }
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return normalizedFallback === 'single_list' ? 'single_list' : 'grid_categories';
};
const normalizeBooleanFlag = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};
const MENU_GLASS_OPACITY_MIN = 20;
const MENU_GLASS_OPACITY_MAX = 60;
const MENU_GLASS_OPACITY_DEFAULT = 34;
const normalizeMenuGlassOpacity = (value, fallback = MENU_GLASS_OPACITY_DEFAULT) => {
  const normalizedFallback = Number.isFinite(Number(fallback))
    ? Math.max(MENU_GLASS_OPACITY_MIN, Math.min(MENU_GLASS_OPACITY_MAX, Math.round(Number(fallback))))
    : MENU_GLASS_OPACITY_DEFAULT;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return normalizedFallback;
  return Math.max(MENU_GLASS_OPACITY_MIN, Math.min(MENU_GLASS_OPACITY_MAX, Math.round(parsed)));
};
const MENU_GLASS_BLUR_MIN = 8;
const MENU_GLASS_BLUR_MAX = 24;
const MENU_GLASS_BLUR_DEFAULT = 16;
const normalizeMenuGlassBlur = (value, fallback = MENU_GLASS_BLUR_DEFAULT) => {
  const normalizedFallback = Number.isFinite(Number(fallback))
    ? Math.max(MENU_GLASS_BLUR_MIN, Math.min(MENU_GLASS_BLUR_MAX, Math.round(Number(fallback))))
    : MENU_GLASS_BLUR_DEFAULT;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return normalizedFallback;
  return Math.max(MENU_GLASS_BLUR_MIN, Math.min(MENU_GLASS_BLUR_MAX, Math.round(parsed)));
};
const getCurrentSeasonScope = (date = new Date()) => {
  const month = Number(new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone: TASHKENT_TZ }).format(date));
  if ([12, 1, 2].includes(month)) return 'winter';
  if ([3, 4, 5].includes(month)) return 'spring';
  if ([6, 7, 8].includes(month)) return 'summer';
  return 'autumn';
};
const TELEGRAM_BOT_USERNAME_CACHE_TTL_MS = 10 * 60 * 1000;
const telegramBotUsernameCache = new Map();
const normalizeTelegramBotUsername = (value) => String(value || '').trim().replace(/^@+/, '');
const resolveTelegramBotUsernameByToken = async (botToken) => {
  const normalizedToken = String(botToken || '').trim();
  if (!normalizedToken) return '';

  const now = Date.now();
  const cached = telegramBotUsernameCache.get(normalizedToken);
  if (cached && cached.expiresAt > now) {
    return cached.username;
  }

  let username = '';
  try {
    const bot = new TelegramBot(normalizedToken, { polling: false });
    const me = await Promise.race([
      bot.getMe(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('telegram_get_me_timeout')), 3000))
    ]);
    username = normalizeTelegramBotUsername(me?.username);
  } catch (_) {
    username = '';
  }

  telegramBotUsernameCache.set(normalizedToken, {
    username,
    expiresAt: now + TELEGRAM_BOT_USERNAME_CACHE_TTL_MS
  });

  return username;
};
const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const toAbsolutePublicUrl = (req, rawUrl) => {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim() || 'https';
  const host = req.get('host');
  const normalizedPath = value.startsWith('/') ? value : `/${value}`;
  return `${proto}://${host}${normalizedPath}`;
};
const formatSharePrice = (value) => {
  const price = Number.parseFloat(value);
  if (!Number.isFinite(price)) return '0 so\'m';
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(price))} so'm`;
};

const getClientIp = (req) => (
  req.headers['x-forwarded-for']?.split(',')[0]?.trim()
  || req.ip
  || req.socket?.remoteAddress
  || null
);

const normalizeRepeatDays = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((v) => Number.parseInt(v, 10))
      .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6);
  }
  if (!value) return [];
  try {
    return normalizeRepeatDays(JSON.parse(value));
  } catch (e) {
    return [];
  }
};

const getTashkentWeekday = (date = new Date()) => {
  const name = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: TASHKENT_TZ }).format(date).toLowerCase();
  const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return map[name];
};

const isBannerVisibleNow = (banner, now = new Date()) => {
  if (!banner || banner.is_deleted || !banner.is_enabled) return false;
  const startAt = banner.start_at ? new Date(banner.start_at) : null;
  const endAt = banner.end_at ? new Date(banner.end_at) : null;
  if (startAt && now < startAt) return false;
  if (endAt && now > endAt) return false;
  const repeatDays = normalizeRepeatDays(banner.repeat_days);
  if (repeatDays.length > 0 && !repeatDays.includes(getTashkentWeekday(now))) return false;
  return true;
};

const normalizeTargetActivityTypeIds = (value) => {
  if (Array.isArray(value)) {
    return [...new Set(
      value
        .map((v) => Number.parseInt(v, 10))
        .filter((v) => Number.isInteger(v) && v > 0)
    )].sort((a, b) => a - b);
  }
  if (!value) return [];
  try {
    return normalizeTargetActivityTypeIds(JSON.parse(value));
  } catch (e) {
    return [];
  }
};

const normalizeAdType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'entry_popup' ? 'entry_popup' : 'banner';
};

let adBannerTargetingSchemaReady = false;
let adBannerTargetingSchemaPromise = null;
let catalogAnimationSettingsSchemaReady = false;
let catalogAnimationSettingsSchemaPromise = null;
let restaurantCurrencySchemaReady = false;
let restaurantCurrencySchemaPromise = null;
let productReviewsSchemaReady = false;
let productReviewsSchemaPromise = null;
const ensureAdBannerTargetingSchema = async () => {
  if (adBannerTargetingSchemaReady) return;
  if (adBannerTargetingSchemaPromise) {
    await adBannerTargetingSchemaPromise;
    return;
  }

  adBannerTargetingSchemaPromise = (async () => {
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
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS activity_type_id INTEGER`).catch(() => {});
    adBannerTargetingSchemaReady = true;
  })();

  try {
    await adBannerTargetingSchemaPromise;
  } finally {
    adBannerTargetingSchemaPromise = null;
  }
};

const ensureCatalogAnimationSettingsSchema = async () => {
  if (catalogAnimationSettingsSchemaReady) return;
  if (catalogAnimationSettingsSchemaPromise) {
    await catalogAnimationSettingsSchemaPromise;
    return;
  }

  catalogAnimationSettingsSchemaPromise = (async () => {
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
    catalogAnimationSettingsSchemaReady = true;
  })();

  try {
    await catalogAnimationSettingsSchemaPromise;
  } finally {
    catalogAnimationSettingsSchemaPromise = null;
  }
};

const ensureRestaurantMinimumOrderSchema = async () => {
  await pool.query(
    `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS minimum_order_amount DECIMAL(12, 2) DEFAULT 0`
  ).catch(() => {});
  await pool.query(
    `UPDATE restaurants SET minimum_order_amount = 0 WHERE minimum_order_amount IS NULL`
  ).catch(() => {});
};

const ensureRestaurantCurrencySchema = async () => {
  if (restaurantCurrencySchemaReady) return;
  if (restaurantCurrencySchemaPromise) {
    await restaurantCurrencySchemaPromise;
    return;
  }

  restaurantCurrencySchemaPromise = (async () => {
    await ensureRestaurantMinimumOrderSchema();
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS currency_code VARCHAR(8) DEFAULT 'uz'`).catch(() => {});
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS menu_liquid_glass_enabled BOOLEAN DEFAULT false`).catch(() => {});
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS menu_height_lock_enabled BOOLEAN DEFAULT false`).catch(() => {});
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS menu_liquid_glass_opacity INTEGER DEFAULT 34`).catch(() => {});
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS menu_liquid_glass_blur INTEGER DEFAULT 16`).catch(() => {});
    await pool.query(`
      UPDATE restaurants
      SET currency_code = 'uz'
      WHERE currency_code IS NULL
         OR BTRIM(currency_code) = ''
         OR LOWER(currency_code) NOT IN ('uz', 'kz', 'tm', 'tj', 'kg', 'af', 'ru')
    `).catch(() => {});
    await pool.query(`UPDATE restaurants SET menu_liquid_glass_enabled = false WHERE menu_liquid_glass_enabled IS NULL`).catch(() => {});
    await pool.query(`UPDATE restaurants SET menu_height_lock_enabled = false WHERE menu_height_lock_enabled IS NULL`).catch(() => {});
    await pool.query(`
      UPDATE restaurants
      SET menu_liquid_glass_opacity = 34
      WHERE menu_liquid_glass_opacity IS NULL
         OR menu_liquid_glass_opacity < 20
         OR menu_liquid_glass_opacity > 60
    `).catch(() => {});
    await pool.query(`
      UPDATE restaurants
      SET menu_liquid_glass_blur = 16
      WHERE menu_liquid_glass_blur IS NULL
         OR menu_liquid_glass_blur < 8
         OR menu_liquid_glass_blur > 24
    `).catch(() => {});
    restaurantCurrencySchemaReady = true;
  })();

  try {
    await restaurantCurrencySchemaPromise;
  } finally {
    restaurantCurrencySchemaPromise = null;
  }
};

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
        is_verified_purchase BOOLEAN DEFAULT false,
        is_deleted BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query('ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS is_verified_purchase BOOLEAN DEFAULT false').catch(() => {});
    await pool.query('UPDATE product_reviews SET is_verified_purchase = false WHERE is_verified_purchase IS NULL').catch(() => {});
    await pool.query(`
      UPDATE product_reviews pr
      SET is_verified_purchase = true
      WHERE COALESCE(pr.is_verified_purchase, false) = false
        AND pr.user_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM order_items oi
          INNER JOIN orders o ON o.id = oi.order_id
          WHERE oi.product_id = pr.product_id
            AND o.user_id = pr.user_id
            AND o.status = 'delivered'
            AND (pr.restaurant_id IS NULL OR o.restaurant_id = pr.restaurant_id)
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
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_reviews_verified_created
      ON product_reviews(product_id, is_verified_purchase, created_at DESC)
    `).catch(() => {});

    productReviewsSchemaReady = true;
  })();

  try {
    await productReviewsSchemaPromise;
  } finally {
    productReviewsSchemaPromise = null;
  }
};

const getOptionalAuthUserId = (req) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token || !process.env.JWT_SECRET) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded?.userId || null;
  } catch (e) {
    return null;
  }
};

const sanitizeTextValue = (value, maxLength = 120) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
};

const normalizeReviewRating = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 1 || parsed > 5) return null;
  return parsed;
};

const normalizeReviewComment = (value, maxLength = 1500) => {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
};

const hasDeliveredPurchaseForProduct = async ({ productId, userId, restaurantId = null, db = pool }) => {
  const normalizedProductId = Number.parseInt(productId, 10);
  const normalizedUserId = Number.parseInt(userId, 10);
  const normalizedRestaurantId = Number.parseInt(restaurantId, 10);

  if (!Number.isInteger(normalizedProductId) || normalizedProductId <= 0) return false;
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) return false;

  const result = await db.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id = $1
        AND o.user_id = $2
        AND o.status = 'delivered'
        AND ($3::int IS NULL OR o.restaurant_id = $3)
    ) AS has_purchase
  `,
    [
      normalizedProductId,
      normalizedUserId,
      Number.isInteger(normalizedRestaurantId) && normalizedRestaurantId > 0 ? normalizedRestaurantId : null
    ]
  );

  return Boolean(result.rows[0]?.has_purchase);
};

const normalizeIpForGeoLookup = (value) => {
  const raw = sanitizeTextValue(value, 128);
  if (!raw) return null;
  let ip = raw;
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
};

const normalizeCountryCode = (value) => {
  const raw = sanitizeTextValue(value, 8);
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
};

const resolveRequestCountryCode = (req, fallbackIpAddress = null) => {
  const headerCountry = normalizeCountryCode(
    req.headers['cf-ipcountry']
    || req.headers['x-vercel-ip-country']
    || req.headers['x-country-code']
    || req.headers['x-geo-country']
  );
  if (headerCountry && headerCountry !== 'XX' && headerCountry !== 'T1') {
    return headerCountry;
  }

  const ipAddress = fallbackIpAddress || getClientIp(req);
  const normalizedIp = normalizeIpForGeoLookup(ipAddress);
  if (!normalizedIp || isPrivateIp(normalizedIp)) return null;

  try {
    const geo = geoip.lookup(normalizedIp);
    return normalizeCountryCode(geo?.country);
  } catch (e) {
    return null;
  }
};


const isPrivateIp = (ip) => {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '0.0.0.0') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) return true;
  return false;
};

const detectAppContainer = (userAgent) => {
  const ua = String(userAgent || '');
  if (!ua) return null;
  if (/Telegram/i.test(ua)) return 'Telegram';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB|Facebook/i.test(ua)) return 'Facebook';
  if (/TikTok/i.test(ua)) return 'TikTok';
  if (/Line\//i.test(ua)) return 'LINE';
  if (/WhatsApp/i.test(ua)) return 'WhatsApp';
  return null;
};

const inferDeviceTypeFromUa = (userAgent) => {
  const ua = String(userAgent || '');
  if (!ua) return 'desktop';
  if (/iPad|Tablet|Tab\b|SM-T|Lenovo Tab|Nexus 7|Nexus 10/i.test(ua)) return 'tablet';
  if (/Mobile|Android|iPhone|Windows Phone/i.test(ua)) return 'mobile';
  return 'desktop';
};

const collectAdEventClientMeta = (req) => {
  const userAgent = sanitizeTextValue(req.headers['user-agent'] || '', 1024);
  const parser = new UAParser(userAgent || undefined);
  const result = parser.getResult();

  const appContainer = detectAppContainer(userAgent);
  const isInAppBrowser = Boolean(
    appContainer ||
    /; wv\)/i.test(userAgent || '') ||
    /\bwv\b/i.test(userAgent || '')
  );

  const deviceType = sanitizeTextValue(result.device?.type, 24) || inferDeviceTypeFromUa(userAgent);
  const deviceBrand = sanitizeTextValue(result.device?.vendor, 80);
  const deviceModel = sanitizeTextValue(result.device?.model, 120)
    || (/(iPhone)/i.test(userAgent || '') ? 'iPhone' : null)
    || (/(iPad)/i.test(userAgent || '') ? 'iPad' : null);

  const browserName = sanitizeTextValue(result.browser?.name, 80);
  const browserVersion = sanitizeTextValue(result.browser?.version, 40);
  const osName = sanitizeTextValue(result.os?.name, 60);
  const osVersion = sanitizeTextValue(result.os?.version, 40);

  const ipAddress = getClientIp(req);
  const normalizedIp = normalizeIpForGeoLookup(ipAddress);
  let country = null;
  let region = null;
  let city = null;

  const countryFromHeaders = resolveRequestCountryCode(req, ipAddress);
  if (countryFromHeaders) {
    country = countryFromHeaders;
  }

  if (!country && normalizedIp && !isPrivateIp(normalizedIp)) {
    try {
      const geo = geoip.lookup(normalizedIp);
      if (geo) {
        country = normalizeCountryCode(geo.country);
        region = sanitizeTextValue(geo.region, 120);
        city = sanitizeTextValue(geo.city, 120);
      }
    } catch (e) {
      // Ignore geo lookup errors; tracking should not fail due to enrichment.
    }
  }

  return {
    ipAddress,
    userAgent,
    deviceType,
    deviceBrand,
    deviceModel,
    browserName,
    browserVersion,
    osName,
    osVersion,
    appContainer,
    isInAppBrowser,
    country,
    region,
    city
  };
};

const insertAdBannerEvent = async ({
  bannerId,
  eventType,
  userId,
  restaurantId,
  viewerKey,
  req,
  meta = null
}) => {
  const resolvedMeta = meta || collectAdEventClientMeta(req);

  await pool.query(
    `INSERT INTO ad_banner_events (
      banner_id, event_type, user_id, restaurant_id, viewer_key, ip_address, user_agent,
      device_type, device_brand, device_model,
      browser_name, browser_version, os_name, os_version,
      app_container, is_in_app_browser,
      country, region, city
    )
     VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10,
      $11, $12, $13, $14,
      $15, $16,
      $17, $18, $19
    )`,
    [
      bannerId,
      eventType,
      userId,
      restaurantId,
      viewerKey,
      resolvedMeta.ipAddress,
      resolvedMeta.userAgent,
      resolvedMeta.deviceType,
      resolvedMeta.deviceBrand,
      resolvedMeta.deviceModel,
      resolvedMeta.browserName,
      resolvedMeta.browserVersion,
      resolvedMeta.osName,
      resolvedMeta.osVersion,
      resolvedMeta.appContainer,
      resolvedMeta.isInAppBrowser,
      resolvedMeta.country,
      resolvedMeta.region,
      resolvedMeta.city
    ]
  );
};

const getShowcaseRestaurantCategories = async (req, res) => {
  try {
    const restaurantId = Number.parseInt(req.params.restaurantId, 10);
    if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
      return res.status(400).json({ error: 'Invalid restaurant ID' });
    }

    if (!(await hasShowcaseRestaurantReadAccess(req.user, restaurantId))) {
      return res.status(403).json({ error: 'Нет доступа к этому ресторану' });
    }

    await ensureShowcaseLayoutsSchema();

    // Verify restaurant exists
    const restaurantResult = await pool.query(
      'SELECT id FROM restaurants WHERE id = $1 LIMIT 1',
      [restaurantId]
    );
    if (restaurantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    // Base set: categories linked to products in this restaurant.
    const result = await pool.query(`
      SELECT DISTINCT c.*
      FROM categories c
      INNER JOIN products p ON c.id = p.category_id
      WHERE p.restaurant_id = $1
      ORDER BY c.id
    `, [restaurantId]);

    const categories = Array.isArray(result.rows) ? [...result.rows] : [];
    const categoryIds = new Set(categories.map((row) => Number.parseInt(row.id, 10)).filter((id) => Number.isInteger(id) && id > 0));

    // Also include categories already placed in showcase layout even if
    // currently there are no products in them.
    const showcaseResult = await pool.query(
      'SELECT layout FROM showcase_layouts WHERE restaurant_id = $1 LIMIT 1',
      [restaurantId]
    );
    const showcaseLayout = normalizeShowcaseLayoutFromDb(showcaseResult.rows[0]?.layout);
    const showcaseCategoryIds = new Set();
    showcaseLayout.forEach((block) => {
      if (!block || typeof block !== 'object') return;
      const blockContent = Array.isArray(block.content) ? block.content : [];
      blockContent.forEach((rawId) => {
        const id = Number.parseInt(rawId, 10);
        if (Number.isInteger(id) && id > 0) showcaseCategoryIds.add(id);
      });
      const sliderId = Number.parseInt(block.category_id, 10);
      if (Number.isInteger(sliderId) && sliderId > 0) showcaseCategoryIds.add(sliderId);
    });

    const missingCategoryIds = [...showcaseCategoryIds].filter((id) => !categoryIds.has(id));
    if (missingCategoryIds.length > 0) {
      const missingResult = await pool.query(
        'SELECT * FROM categories WHERE id = ANY($1::int[])',
        [missingCategoryIds]
      );
      const missingRows = Array.isArray(missingResult.rows) ? missingResult.rows : [];
      missingRows.forEach((row) => {
        const id = Number.parseInt(row.id, 10);
        if (Number.isInteger(id) && id > 0 && !categoryIds.has(id)) {
          categories.push(row);
          categoryIds.add(id);
        }
      });
    }

    const normalizedCategories = categories
      .map((row) => ({
        ...row,
        id: Number.parseInt(row.id, 10),
        name_ru: row.name_ru || row.name || row.name_uz || '',
        name_uz: row.name_uz || row.name || row.name_ru || '',
        name: row.name || row.name_ru || row.name_uz || '',
        icon_url: row.icon_url || row.image_url || row.image || ''
      }))
      .filter((row) => Number.isInteger(row.id) && row.id > 0)
      .sort((a, b) => String(a.name_ru || '').localeCompare(String(b.name_ru || ''), 'ru'));

    res.json(normalizedCategories);
  } catch (error) {
    console.error('Restaurant categories error:', error);
    res.status(500).json({ error: 'Ошибка получения категорий' });
  }
};

// Category endpoints for showcase builder.
router.get('/restaurants/:restaurantId/categories', authenticate, getShowcaseRestaurantCategories);
// Backward-compatible alias used by legacy builder pages.
router.get('/categories/restaurant/:restaurantId', authenticate, getShowcaseRestaurantCategories);

// Get all categories (public - for customers, global/shared)
router.get('/categories', async (req, res) => {
  try {
    // Categories are global/shared across restaurants.
    // We intentionally do not filter by restaurant_id here, because
    // products are already filtered by restaurant on the catalog side.
    const result = await pool.query(
      'SELECT * FROM categories WHERE is_active = true ORDER BY name_ru'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Categories error:', error);
    res.status(500).json({ error: 'Ошибка получения категорий' });
  }
});

// Get all products (public - for customers, filtered by restaurant)
router.get('/', async (req, res) => {
  try {
    const { category_id, in_stock, restaurant_id } = req.query;
    const currentSeasonScope = getCurrentSeasonScope();
    
    let query = `
      SELECT p.*, c.name_ru as category_name,
             cnt.id as container_id, cnt.name as container_name, cnt.price as container_price
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      LEFT JOIN containers cnt ON p.container_id = cnt.id
      WHERE 1=1
        AND COALESCE(p.is_hidden_catalog, false) = false
        AND COALESCE(NULLIF(p.season_scope, ''), 'all') IN ('all', $1)
    `;
    const params = [currentSeasonScope];
    let paramCount = 2;
    
    if (restaurant_id) {
      query += ` AND p.restaurant_id = $${paramCount}`;
      params.push(restaurant_id);
      paramCount++;
    }
    
    if (category_id) {
      query += ` AND p.category_id = $${paramCount}`;
      params.push(category_id);
      paramCount++;
    }
    
    if (in_stock === 'true') {
      query += ` AND p.in_stock = true`;
    }
    
    query += ' ORDER BY p.category_id ASC NULLS LAST, COALESCE(p.sort_order, 0) ASC, p.name_ru ASC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Products error:', error);
    res.status(500).json({ error: 'Ошибка получения товаров' });
  }
});

// Get restaurant by id (public - for receipt/logo)
router.get('/restaurant/:id', async (req, res) => {
  try {
    await ensureRestaurantCurrencySchema();
    await ensureRestaurantMinimumOrderSchema();
    await ensureReservationSchema();
    const result = await pool.query(
      `SELECT
         r.*,
         COALESCE(rs.enabled, false) AS reservation_enabled_setting,
         COALESCE(rs.reservation_fee, 0) AS reservation_fee,
         COALESCE(rs.reservation_service_cost, COALESCE(r.reservation_cost, 0)) AS reservation_service_cost,
         COALESCE(rs.allow_multi_table, true) AS reservation_allow_multi_table
       FROM restaurants r
       LEFT JOIN restaurant_reservation_settings rs ON rs.restaurant_id = r.id
       WHERE r.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    // Return only safe public fields
    const r = result.rows[0];
    let ownerUsername = '';
    let ownerPhone = '';
    try {
      const ownerResult = await pool.query(
        `SELECT u.username, u.phone
         FROM operator_restaurants opr
         INNER JOIN users u ON u.id = opr.user_id
         WHERE opr.restaurant_id = $1
           AND u.role IN ('operator', 'superadmin')
           AND COALESCE(u.is_active, true) = true
         ORDER BY
           CASE WHEN u.role = 'operator' THEN 0 ELSE 1 END,
           opr.created_at ASC,
           u.id ASC
         LIMIT 1`,
        [req.params.id]
      );
      if (ownerResult.rows[0]) {
        ownerUsername = String(ownerResult.rows[0].username || '').trim().replace(/^@+/, '');
        ownerPhone = String(ownerResult.rows[0].phone || '').trim();
      }
    } catch (_) {
      ownerUsername = '';
      ownerPhone = '';
    }

    const serviceFee = Number.parseFloat(r.service_fee ?? 0);
    const minimumOrderAmount = Number.parseFloat(r.minimum_order_amount ?? 0);
    const cardNumber = String(r.card_payment_number || '').replace(/\D/g, '').slice(0, 19);
    const cardTitle = String(r.card_payment_title || '').trim();
    const cardHolder = String(r.card_payment_holder || '').trim();
    const cardPaymentEnabled = Boolean(cardTitle && cardNumber && cardHolder);
    const cardReceiptTarget = String(r.card_receipt_target || '').trim().toLowerCase() === 'admin' ? 'admin' : 'bot';
    const cashEnabled = r.cash_enabled === undefined || r.cash_enabled === null
      ? true
      : isEnabledFlag(r.cash_enabled);
    const telegramBotUsername = normalizeTelegramBotUsername(r.telegram_bot_username)
      || await resolveTelegramBotUsernameByToken(r.telegram_bot_token);
    res.json({
      id: r.id,
      name: r.name,
      address: r.address,
      phone: r.phone,
      logo_url: r.logo_url,
      logo_display_mode: r.logo_display_mode || 'square',
      ui_theme: normalizeUiTheme(r.ui_theme, 'classic'),
      menu_view_mode: normalizeMenuViewMode(r.menu_view_mode, 'grid_categories'),
      menu_liquid_glass_enabled: normalizeBooleanFlag(r.menu_liquid_glass_enabled, false),
      menu_height_lock_enabled: normalizeBooleanFlag(r.menu_height_lock_enabled, false),
      menu_liquid_glass_opacity: normalizeMenuGlassOpacity(r.menu_liquid_glass_opacity, MENU_GLASS_OPACITY_DEFAULT),
      menu_liquid_glass_blur: normalizeMenuGlassBlur(r.menu_liquid_glass_blur, MENU_GLASS_BLUR_DEFAULT),
      currency_code: normalizeRestaurantCurrencyCode(r.currency_code, 'uz'),
      size_variants_enabled: isEnabledFlag(r.size_variants_enabled),
      inventory_tracking_enabled: isEnabledFlag(r.inventory_tracking_enabled),
      service_fee: Number.isFinite(serviceFee) ? serviceFee : 0,
      minimum_order_amount: Number.isFinite(minimumOrderAmount) ? Math.max(0, minimumOrderAmount) : 0,
      is_delivery_enabled: isEnabledFlag(r.is_delivery_enabled),
      cash_enabled: cashEnabled,
      click_url: r.click_url,
      payme_enabled: isEnabledFlag(r.payme_enabled) && Boolean(String(r.payme_merchant_id || '').trim()),
      payme_url: r.payme_url,
      uzum_url: r.uzum_url,
      xazna_url: r.xazna_url,
      reservation_enabled: r.reservation_enabled_setting === true || r.reservation_enabled_setting === 'true',
      reservation_fee: Number.isFinite(Number.parseFloat(r.reservation_fee)) ? Number.parseFloat(r.reservation_fee) : 0,
      reservation_service_cost: Number.isFinite(Number.parseFloat(r.reservation_service_cost)) ? Number.parseFloat(r.reservation_service_cost) : 0,
      reservation_allow_multi_table: r.reservation_allow_multi_table !== false,
      telegram_bot_username: telegramBotUsername ? `@${telegramBotUsername}` : '',
      work_start_time: String(r.start_time || '').slice(0, 5),
      work_end_time: String(r.end_time || '').slice(0, 5),
      card_payment_enabled: cardPaymentEnabled,
      card_payment_title: cardPaymentEnabled ? cardTitle : '',
      card_payment_number: cardPaymentEnabled ? cardNumber : '',
      card_payment_holder: cardPaymentEnabled ? cardHolder : '',
      card_receipt_target: cardReceiptTarget,
      support_username: r.support_username || '',
      owner_username: ownerUsername || String(r.support_username || '').trim().replace(/^@+/, ''),
      owner_phone: ownerPhone || '',
      is_scheduled_date_delivery_enabled: isEnabledFlag(r.is_scheduled_date_delivery_enabled),
      scheduled_delivery_max_days: Math.max(1, Math.trunc(Number(r.scheduled_delivery_max_days) || 7)),
      is_asap_delivery_enabled: r.is_asap_delivery_enabled === false ? false : true,
      is_scheduled_time_delivery_enabled: r.is_scheduled_time_delivery_enabled === false ? false : true
    });
  } catch (error) {
    console.error('Restaurant error:', error);
    res.status(500).json({ error: 'Ошибка получения ресторана' });
  }
});

// Get active ad banners (public - for customer catalog)
router.get('/ads-banners', async (req, res) => {
  try {
    await ensureAdBannerTargetingSchema();
    const requestedRestaurantId = Number.parseInt(req.query.restaurant_id, 10);
    const hasValidRestaurantId = Number.isInteger(requestedRestaurantId) && requestedRestaurantId > 0;
    let restaurantActivityTypeId = null;
    let restaurantExists = false;

    if (hasValidRestaurantId) {
      const restaurantResult = await pool.query(
        'SELECT id, activity_type_id FROM restaurants WHERE id = $1 LIMIT 1',
        [requestedRestaurantId]
      );
      const row = restaurantResult.rows[0];
      if (row) {
        restaurantExists = true;
        const parsedActivityId = Number.parseInt(row.activity_type_id, 10);
        if (Number.isInteger(parsedActivityId) && parsedActivityId > 0) {
          restaurantActivityTypeId = parsedActivityId;
        }
      }
    }

    const result = await pool.query(`
      SELECT id, title, image_url, button_text, target_url, ad_type, slot_order, display_seconds, transition_effect,
             start_at, end_at, repeat_days, target_activity_type_ids, is_enabled, is_deleted, created_at
      FROM ad_banners
      WHERE is_deleted = false AND is_enabled = true
      ORDER BY slot_order ASC, created_at DESC
      LIMIT 50
    `);

    const banners = result.rows
      .filter((banner) => isBannerVisibleNow(banner))
      .filter((banner) => {
        const targetIds = normalizeTargetActivityTypeIds(banner.target_activity_type_ids);
        if (!targetIds.length) return true; // no targeting => all stores
        if (!hasValidRestaurantId || !restaurantExists) return true; // unknown store => avoid conflict, show all
        if (!restaurantActivityTypeId) return true; // store without activity type => show all by default
        return targetIds.includes(restaurantActivityTypeId);
      })
      .slice(0, 10)
      .map((banner) => ({
        id: banner.id,
        title: banner.title,
        image_url: banner.image_url,
        button_text: banner.button_text || 'Открыть',
        ad_type: normalizeAdType(banner.ad_type),
        slot_order: Number(banner.slot_order) || 1,
        display_seconds: Math.max(2, Number(banner.display_seconds) || 5),
        transition_effect: banner.transition_effect || 'fade',
        click_url: banner.target_url ? `/api/products/ads-banners/${banner.id}/click` : null
      }));

    res.json(banners);
  } catch (error) {
    console.error('Get ads banners error:', error);
    res.status(500).json({ error: 'Ошибка получения рекламных баннеров' });
  }
});

// Track ad view (public)
router.post('/ads-banners/:id/view', async (req, res) => {
  try {
    const bannerId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(bannerId)) {
      return res.status(400).json({ error: 'Некорректный ID баннера' });
    }

    const bannerResult = await pool.query(
      'SELECT id, is_enabled, is_deleted, start_at, end_at, repeat_days FROM ad_banners WHERE id = $1',
      [bannerId]
    );
    const banner = bannerResult.rows[0];
    if (!banner) {
      return res.status(404).json({ error: 'Баннер не найден' });
    }
    if (!isBannerVisibleNow(banner)) {
      return res.json({ tracked: false, reason: 'not_visible_now' });
    }

    const viewerKey = String(req.body?.viewer_key || '').trim().slice(0, 128) || null;
    const restaurantIdRaw = req.body?.restaurant_id;
    const restaurantId = Number.isInteger(Number(restaurantIdRaw)) ? Number(restaurantIdRaw) : null;

    const meta = collectAdEventClientMeta(req);

    await insertAdBannerEvent({
      bannerId,
      eventType: 'view',
      userId: getOptionalAuthUserId(req),
      restaurantId,
      viewerKey,
      req,
      meta
    });

    res.json({ tracked: true });
  } catch (error) {
    console.error('Track ad view error:', error);
    res.status(500).json({ error: 'Ошибка учета просмотра рекламы' });
  }
});

// Track click and redirect to target URL
router.get('/ads-banners/:id/click', async (req, res) => {
  try {
    const bannerId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(bannerId)) {
      return res.status(400).send('Некорректный ID баннера');
    }

    const bannerResult = await pool.query(
      `SELECT id, target_url, is_enabled, is_deleted, start_at, end_at, repeat_days
       FROM ad_banners WHERE id = $1`,
      [bannerId]
    );
    const banner = bannerResult.rows[0];
    if (!banner || banner.is_deleted || !banner.target_url) {
      return res.status(404).send('Баннер не найден');
    }

    const viewerKey = String(req.query.viewer_key || '').trim().slice(0, 128) || null;
    const restaurantId = Number.isInteger(Number(req.query.restaurant_id)) ? Number(req.query.restaurant_id) : null;

    const meta = collectAdEventClientMeta(req);

    await insertAdBannerEvent({
      bannerId,
      eventType: 'click',
      userId: getOptionalAuthUserId(req),
      restaurantId,
      viewerKey,
      req,
      meta
    });

    res.redirect(banner.target_url);
  } catch (error) {
    console.error('Track ad click error:', error);
    res.status(500).send('Ошибка перехода по рекламе');
  }
});

// Get active seasonal catalog animation (public - for customer catalog)
router.get('/catalog-animation-season', async (req, res) => {
  try {
    await ensureCatalogAnimationSettingsSchema();
    const result = await pool.query('SELECT catalog_animation_season FROM billing_settings WHERE id = 1 LIMIT 1');
    const season = normalizeCatalogAnimationSeason(result.rows[0]?.catalog_animation_season, 'off');
    res.json({ season });
  } catch (error) {
    console.error('Catalog animation season error:', error);
    res.status(500).json({ season: 'off' });
  }
});

router.get('/reviews/pending', authenticate, async (req, res) => {
  try {
    await ensureProductReviewsSchema();

    const userId = Number.parseInt(req.user?.id, 10);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: 'Пользователь не авторизован' });
    }

    const userRole = String(req.user?.role || '').trim().toLowerCase();
    if (userRole !== 'customer') {
      return res.json({ items: [], total: 0 });
    }

    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(20, Math.max(1, requestedLimit)) : 5;

    const activeRestaurantIdRaw = Number.parseInt(req.user?.active_restaurant_id, 10);
    const activeRestaurantId = Number.isInteger(activeRestaurantIdRaw) && activeRestaurantIdRaw > 0
      ? activeRestaurantIdRaw
      : null;

    const result = await pool.query(
      `
      WITH delivered_items AS (
        SELECT
          oi.product_id,
          MAX(o.created_at) AS last_delivered_at,
          COUNT(DISTINCT o.id)::int AS delivered_orders_count
        FROM order_items oi
        INNER JOIN orders o ON o.id = oi.order_id
        WHERE o.user_id = $1
          AND o.status = 'delivered'
          AND oi.product_id IS NOT NULL
          AND ($2::int IS NULL OR o.restaurant_id = $2)
        GROUP BY oi.product_id
      )
      SELECT
        di.product_id,
        di.last_delivered_at,
        di.delivered_orders_count,
        p.restaurant_id,
        p.name_ru,
        p.name_uz,
        p.image_url,
        p.thumb_url,
        p.product_images,
        r.name AS restaurant_name
      FROM delivered_items di
      INNER JOIN products p ON p.id = di.product_id
      LEFT JOIN restaurants r ON r.id = p.restaurant_id
      LEFT JOIN product_reviews pr
        ON pr.product_id = di.product_id
        AND pr.user_id = $1
        AND pr.is_deleted = false
        AND pr.is_verified_purchase = true
      WHERE pr.id IS NULL
      ORDER BY di.last_delivered_at DESC NULLS LAST, di.product_id DESC
      LIMIT $3
    `,
      [userId, activeRestaurantId, limit]
    );

    const items = result.rows || [];
    res.json({
      items,
      total: items.length
    });
  } catch (error) {
    console.error('Pending product reviews error:', error);
    res.status(500).json({ error: 'Ошибка получения списка товаров для оценки' });
  }
});

router.get('/:id/details', async (req, res) => {
  try {
    await ensureProductReviewsSchema();

    const productId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID товара' });
    }

    const productResult = await pool.query(
      `
      SELECT
        p.*,
        c.name_ru AS category_name_ru,
        c.name_uz AS category_name_uz,
        r.name AS restaurant_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN restaurants r ON r.id = p.restaurant_id
      WHERE p.id = $1
      LIMIT 1
    `,
      [productId]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    const product = productResult.rows[0];

    const [summaryResult, latestReviewsResult, weeklyStatsResult] = await Promise.all([
      pool.query(
        `
        SELECT
          COUNT(*)::int AS total_reviews,
          ROUND(COALESCE(AVG(rating)::numeric, 0), 2)::float AS average_rating
        FROM product_reviews pr
        WHERE pr.product_id = $1
          AND pr.is_deleted = false
          AND pr.is_verified_purchase = true
      `,
        [productId]
      ),
      pool.query(
        `
        SELECT
          pr.id,
          pr.user_id,
          pr.rating,
          pr.comment,
          pr.created_at,
          pr.updated_at,
          COALESCE(NULLIF(BTRIM(u.full_name), ''), NULLIF(BTRIM(u.username), ''), 'Клиент') AS author_name
        FROM product_reviews pr
        LEFT JOIN users u ON u.id = pr.user_id
        WHERE pr.product_id = $1
          AND pr.is_deleted = false
          AND pr.is_verified_purchase = true
        ORDER BY pr.created_at DESC, pr.id DESC
        LIMIT 3
      `,
        [productId]
      ),
      pool.query(
        `
        SELECT
          COUNT(DISTINCT o.user_id)::int AS buyers_count,
          COUNT(DISTINCT o.id)::int AS orders_count,
          COALESCE(SUM(oi.quantity), 0)::numeric AS sold_count
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = $1
          AND o.status = 'delivered'
          AND o.created_at IS NOT NULL
          AND timezone($2, o.created_at)::date >= date_trunc('week', timezone($2, CURRENT_TIMESTAMP))::date
          AND timezone($2, o.created_at)::date < (date_trunc('week', timezone($2, CURRENT_TIMESTAMP)) + interval '7 day')::date
      `,
        [productId, TASHKENT_TZ]
      )
    ]);

    const totalReviews = Number.parseInt(summaryResult.rows[0]?.total_reviews, 10) || 0;
    const averageRating = Number(summaryResult.rows[0]?.average_rating || 0);
    const buyersCount = Number.parseInt(weeklyStatsResult.rows[0]?.buyers_count, 10) || 0;
    const ordersCount = Number.parseInt(weeklyStatsResult.rows[0]?.orders_count, 10) || 0;
    const soldCount = Number(weeklyStatsResult.rows[0]?.sold_count || 0) || 0;

    const authUserIdRaw = getOptionalAuthUserId(req);
    const authUserId = Number.parseInt(authUserIdRaw, 10);
    const productRestaurantId = Number.parseInt(product.restaurant_id, 10);
    const normalizedProductRestaurantId = Number.isInteger(productRestaurantId) && productRestaurantId > 0
      ? productRestaurantId
      : null;
    let myReview = null;
    let hasSuccessfulOrder = false;
    if (Number.isInteger(authUserId) && authUserId > 0) {
      hasSuccessfulOrder = await hasDeliveredPurchaseForProduct({
        productId,
        userId: authUserId,
        restaurantId: normalizedProductRestaurantId
      });

      const myReviewResult = await pool.query(
        `
        SELECT id, product_id, restaurant_id, user_id, rating, comment, created_at, updated_at
        FROM product_reviews
        WHERE product_id = $1
          AND user_id = $2
          AND is_deleted = false
          AND is_verified_purchase = true
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `,
        [productId, authUserId]
      );
      myReview = myReviewResult.rows[0] || null;
    }

    res.json({
      product,
      rating: {
        average: averageRating,
        total: totalReviews
      },
      latest_reviews: latestReviewsResult.rows || [],
      has_more_reviews: totalReviews > (latestReviewsResult.rows || []).length,
      weekly_stats: {
        buyers_count: buyersCount,
        orders_count: ordersCount,
        sold_count: soldCount
      },
      review_permissions: {
        is_authenticated: Number.isInteger(authUserId) && authUserId > 0,
        has_successful_order: hasSuccessfulOrder,
        can_review: hasSuccessfulOrder
      },
      my_review: myReview
    });
  } catch (error) {
    console.error('Product details error:', error);
    res.status(500).json({ error: 'Ошибка получения деталей товара' });
  }
});

router.get('/:id/reviews', async (req, res) => {
  try {
    await ensureProductReviewsSchema();

    const productId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID товара' });
    }

    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const requestedOffset = Number.parseInt(req.query.offset, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 20;
    const offset = Number.isFinite(requestedOffset) ? Math.max(0, requestedOffset) : 0;

    const productResult = await pool.query('SELECT id FROM products WHERE id = $1 LIMIT 1', [productId]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    const [summaryResult, reviewsResult] = await Promise.all([
      pool.query(
        `
        SELECT
          COUNT(*)::int AS total_reviews,
          ROUND(COALESCE(AVG(rating)::numeric, 0), 2)::float AS average_rating
        FROM product_reviews pr
        WHERE pr.product_id = $1
          AND pr.is_deleted = false
          AND pr.is_verified_purchase = true
      `,
        [productId]
      ),
      pool.query(
        `
        SELECT
          pr.id,
          pr.user_id,
          pr.rating,
          pr.comment,
          pr.created_at,
          pr.updated_at,
          COALESCE(NULLIF(BTRIM(u.full_name), ''), NULLIF(BTRIM(u.username), ''), 'Клиент') AS author_name
        FROM product_reviews pr
        LEFT JOIN users u ON u.id = pr.user_id
        WHERE pr.product_id = $1
          AND pr.is_deleted = false
          AND pr.is_verified_purchase = true
        ORDER BY pr.created_at DESC, pr.id DESC
        LIMIT $2 OFFSET $3
      `,
        [productId, limit, offset]
      )
    ]);

    const totalReviews = Number.parseInt(summaryResult.rows[0]?.total_reviews, 10) || 0;
    const averageRating = Number(summaryResult.rows[0]?.average_rating || 0);
    const reviews = reviewsResult.rows || [];

    res.json({
      total: totalReviews,
      average_rating: averageRating,
      has_more: (offset + reviews.length) < totalReviews,
      reviews
    });
  } catch (error) {
    console.error('Product reviews error:', error);
    res.status(500).json({ error: 'Ошибка получения отзывов товара' });
  }
});

router.post('/:id/reviews', authenticate, async (req, res) => {
  try {
    await ensureProductReviewsSchema();

    const productId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID товара' });
    }

    const rating = normalizeReviewRating(req.body?.rating);
    if (!rating) {
      return res.status(400).json({ error: 'Оценка должна быть от 1 до 5' });
    }
    const comment = normalizeReviewComment(req.body?.comment);
    const userId = Number.parseInt(req.user?.id, 10);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: 'Пользователь не авторизован' });
    }

    const productResult = await pool.query(
      'SELECT id, restaurant_id, name_ru, name_uz FROM products WHERE id = $1 LIMIT 1',
      [productId]
    );
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    const product = productResult.rows[0];
    const productRestaurantId = Number.parseInt(product.restaurant_id, 10);
    const activeRestaurantId = Number.parseInt(req.user?.active_restaurant_id, 10);
    if (
      Number.isInteger(productRestaurantId)
      && productRestaurantId > 0
      && Number.isInteger(activeRestaurantId)
      && activeRestaurantId > 0
      && productRestaurantId !== activeRestaurantId
    ) {
      return res.status(403).json({ error: 'Отзыв можно оставить только в активном магазине' });
    }

    const hasSuccessfulOrder = await hasDeliveredPurchaseForProduct({
      productId,
      userId,
      restaurantId: Number.isInteger(productRestaurantId) && productRestaurantId > 0 ? productRestaurantId : null
    });
    if (!hasSuccessfulOrder) {
      return res.status(403).json({ error: 'Оценка и комментарий доступны только после успешно доставленного заказа' });
    }

    const dbClient = await pool.connect();
    let savedReview = null;
    try {
      await dbClient.query('BEGIN');

      const existingReviewResult = await dbClient.query(
        `
        SELECT id
        FROM product_reviews
        WHERE product_id = $1
          AND user_id = $2
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
        LIMIT 1
      `,
        [productId, userId]
      );

      if (existingReviewResult.rows.length > 0) {
        const reviewId = Number.parseInt(existingReviewResult.rows[0].id, 10);

        // Keep one latest review row and clean possible duplicates from old data.
        await dbClient.query(
          `
          DELETE FROM product_reviews
          WHERE product_id = $1
            AND user_id = $2
            AND id <> $3
        `,
          [productId, userId, reviewId]
        );

        const updateResult = await dbClient.query(
          `
          UPDATE product_reviews
          SET
            restaurant_id = $1,
            rating = $2,
            comment = $3,
            is_verified_purchase = true,
            is_deleted = false,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
          RETURNING id, product_id, restaurant_id, user_id, rating, comment, is_verified_purchase, created_at, updated_at
        `,
          [productRestaurantId || null, rating, comment, reviewId]
        );
        savedReview = updateResult.rows[0] || null;
      } else {
        const insertResult = await dbClient.query(
          `
          INSERT INTO product_reviews (
            product_id,
            restaurant_id,
            user_id,
            rating,
            comment,
            is_verified_purchase,
            is_deleted
          )
          VALUES ($1, $2, $3, $4, $5, true, false)
          RETURNING id, product_id, restaurant_id, user_id, rating, comment, is_verified_purchase, created_at, updated_at
        `,
          [productId, productRestaurantId || null, userId, rating, comment]
        );
        savedReview = insertResult.rows[0] || null;
      }

      await dbClient.query('COMMIT');
    } catch (dbError) {
      await dbClient.query('ROLLBACK');
      throw dbError;
    } finally {
      dbClient.release();
    }

    res.status(201).json({
      message: 'Отзыв сохранен',
      review: savedReview,
      product: {
        id: product.id,
        name_ru: product.name_ru,
        name_uz: product.name_uz
      }
    });
  } catch (error) {
    console.error('Create product review error:', error);
    res.status(500).json({ error: 'Ошибка сохранения отзыва' });
  }
});

router.get('/share/:id', async (req, res) => {
  try {
    const productId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).send('Invalid product id');
    }

    const productResult = await pool.query(
      `
      SELECT
        p.id,
        p.restaurant_id,
        p.name_ru,
        p.name_uz,
        p.price,
        p.image_url,
        p.thumb_url,
        p.product_images,
        r.telegram_bot_token
      FROM products p
      LEFT JOIN restaurants r ON r.id = p.restaurant_id
      WHERE p.id = $1
      LIMIT 1
      `,
      [productId]
    );
    const row = productResult.rows[0];
    if (!row) {
      return res.status(404).send('Product not found');
    }

    const requestedRestaurantId = Number.parseInt(req.query.restaurant_id, 10);
    const restaurantId = Number.isInteger(requestedRestaurantId) && requestedRestaurantId > 0
      ? requestedRestaurantId
      : Number.parseInt(row.restaurant_id, 10);
    const botUsername = await resolveTelegramBotUsernameByToken(row.telegram_bot_token);
    const startPayload = Number.isInteger(restaurantId) && restaurantId > 0
      ? `product_${restaurantId}_${productId}`
      : `product_${productId}`;
    const openUrl = botUsername
      ? `https://t.me/${encodeURIComponent(botUsername)}?start=${encodeURIComponent(startPayload)}`
      : '';

    const language = String(req.query.lang || 'uz').toLowerCase() === 'ru' ? 'ru' : 'uz';
    const productName = String(language === 'ru' ? (row.name_ru || row.name_uz || 'Товар') : (row.name_uz || row.name_ru || 'Mahsulot'));
    const rawImage = row.thumb_url || row.image_url
      || (Array.isArray(row.product_images) && row.product_images.length > 0 ? row.product_images[0] : '');
    const imageUrl = toAbsolutePublicUrl(req, rawImage);
    const priceText = formatSharePrice(row.price);
    const description = language === 'ru'
      ? `Цена: ${priceText}. Нажмите «Открыть».`
      : `Narxi: ${priceText}. «Ochish» ni bosing.`;
    const canonicalUrl = `${toAbsolutePublicUrl(req, req.originalUrl)}`;

    const html = `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(productName)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${escapeHtml(productName)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(productName)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  ${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />` : ''}
</head>
<body style="font-family:Arial,sans-serif;padding:24px;line-height:1.5">
  <h2 style="margin:0 0 10px">${escapeHtml(productName)}</h2>
  <p style="margin:0 0 16px">${escapeHtml(priceText)}</p>
  ${openUrl
    ? `<a href="${escapeHtml(openUrl)}" style="display:inline-block;padding:10px 14px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px">${language === 'ru' ? 'Открыть в Telegram' : 'Telegramda ochish'}</a>
       <p style="margin-top:12px;color:#64748b;font-size:14px;">${language === 'ru' ? 'Если кнопка не сработала, откройте ссылку через Telegram вручную.' : 'Agar tugma ishlamasa, havolani Telegram orqali qo\'lda oching.'}</p>`
    : `<p>${language === 'ru' ? 'Ссылка временно недоступна' : 'Havola vaqtincha mavjud emas'}</p>`}
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Product share page error:', error);
    res.status(500).send('Share page error');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, c.name_ru as category_name, r.name as restaurant_name
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN restaurants r ON p.restaurant_id = r.id
      WHERE p.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Product error:', error);
    res.status(500).json({ error: 'Ошибка получения товара' });
  }
});

// Get restaurants list (public - for customer app to select restaurant)
router.get('/restaurants/list', async (req, res) => {
  try {
    await ensureRestaurantCurrencySchema();
    await ensureReservationSchema();
    const result = await pool.query(`
      SELECT
        r.*,
        COALESCE(rs.enabled, false) AS reservation_enabled_setting,
        COALESCE(rs.reservation_fee, 0) AS reservation_fee,
        COALESCE(rs.reservation_service_cost, COALESCE(r.reservation_cost, 0)) AS reservation_service_cost,
        COALESCE(rs.allow_multi_table, true) AS reservation_allow_multi_table
      FROM restaurants r
      LEFT JOIN restaurant_reservation_settings rs ON rs.restaurant_id = r.id
      WHERE is_active = true 
      ORDER BY r.name
    `);
    // Return only safe public fields
    const restaurants = await Promise.all(result.rows.map(async (r) => {
      const serviceFee = Number.parseFloat(r.service_fee ?? 0);
      const telegramBotUsername = normalizeTelegramBotUsername(r.telegram_bot_username)
        || await resolveTelegramBotUsernameByToken(r.telegram_bot_token);
      return ({
      id: r.id,
      name: r.name,
      address: r.address,
      phone: r.phone,
      logo_url: r.logo_url,
      logo_display_mode: r.logo_display_mode || 'square',
      ui_theme: normalizeUiTheme(r.ui_theme, 'classic'),
      menu_view_mode: normalizeMenuViewMode(r.menu_view_mode, 'grid_categories'),
      menu_liquid_glass_enabled: normalizeBooleanFlag(r.menu_liquid_glass_enabled, false),
      menu_height_lock_enabled: normalizeBooleanFlag(r.menu_height_lock_enabled, false),
      menu_liquid_glass_opacity: normalizeMenuGlassOpacity(r.menu_liquid_glass_opacity, MENU_GLASS_OPACITY_DEFAULT),
      menu_liquid_glass_blur: normalizeMenuGlassBlur(r.menu_liquid_glass_blur, MENU_GLASS_BLUR_DEFAULT),
      currency_code: normalizeRestaurantCurrencyCode(r.currency_code, 'uz'),
      size_variants_enabled: isEnabledFlag(r.size_variants_enabled),
      inventory_tracking_enabled: isEnabledFlag(r.inventory_tracking_enabled),
      service_fee: Number.isFinite(serviceFee) ? serviceFee : 0,
      is_delivery_enabled: isEnabledFlag(r.is_delivery_enabled),
      reservation_enabled: r.reservation_enabled_setting === true || r.reservation_enabled_setting === 'true',
      reservation_fee: Number.isFinite(Number.parseFloat(r.reservation_fee)) ? Number.parseFloat(r.reservation_fee) : 0,
      reservation_service_cost: Number.isFinite(Number.parseFloat(r.reservation_service_cost)) ? Number.parseFloat(r.reservation_service_cost) : 0,
      reservation_allow_multi_table: r.reservation_allow_multi_table !== false,
      telegram_bot_username: telegramBotUsername ? `@${telegramBotUsername}` : ''
      });
    }));
    res.json(restaurants);
  } catch (error) {
    console.error('Restaurants list error:', error);
    res.status(500).json({ error: 'Ошибка получения списка ресторанов' });
  }
});

// ===== Showcase Constructor Routes =====

function normalizeShowcaseLayoutFromDb(rawLayout) {
  if (Array.isArray(rawLayout)) return rawLayout;
  if (!rawLayout) return [];
  if (typeof rawLayout === 'string') {
    try {
      const parsed = JSON.parse(rawLayout);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  if (typeof rawLayout === 'object' && rawLayout !== null && Array.isArray(rawLayout.blocks)) {
    return rawLayout.blocks;
  }
  return [];
}

function normalizeShowcaseVisibilityFromDb(rawLayout) {
  if (!rawLayout) return true;
  if (typeof rawLayout === 'object' && rawLayout !== null && !Array.isArray(rawLayout)) {
    const candidate = rawLayout.isVisible ?? rawLayout.is_visible;
    if (typeof candidate === 'boolean') return candidate;
    if (typeof candidate === 'number') return candidate !== 0;
    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
      if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    }
  }
  return true;
}

let showcaseLayoutsSchemaReady = false;
let showcaseLayoutsSchemaPromise = null;

async function ensureShowcaseLayoutsSchema() {
  if (showcaseLayoutsSchemaReady) return;
  if (showcaseLayoutsSchemaPromise) {
    await showcaseLayoutsSchemaPromise;
    return;
  }

  showcaseLayoutsSchemaPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS showcase_layouts (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,
        layout JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    showcaseLayoutsSchemaReady = true;
  })();

  try {
    await showcaseLayoutsSchemaPromise;
  } finally {
    showcaseLayoutsSchemaPromise = null;
  }
}

async function hasShowcaseRestaurantReadAccess(user, restaurantId) {
  const role = String(user?.role || '').trim().toLowerCase();
  if (role === 'superadmin') return true;
  if (role === 'customer') {
    return Number.parseInt(user?.active_restaurant_id, 10) === restaurantId;
  }
  if (role !== 'operator' && role !== 'admin') return false;

  const userId = Number.parseInt(user?.id, 10);
  if (!Number.isInteger(userId) || userId <= 0) return false;

  const accessResult = await pool.query(
    'SELECT 1 FROM operator_restaurants WHERE user_id = $1 AND restaurant_id = $2 LIMIT 1',
    [userId, restaurantId]
  );
  return accessResult.rows.length > 0;
}

async function hasShowcaseRestaurantWriteAccess(user, restaurantId) {
  const role = String(user?.role || '').trim().toLowerCase();
  if (role === 'superadmin') return true;
  if (role !== 'operator' && role !== 'admin') return false;
  return hasShowcaseRestaurantReadAccess(user, restaurantId);
}

// GET showcase layout
router.get('/restaurant/:restaurantId/showcase', authenticate, async (req, res) => {
  try {
    const restaurantId = Number.parseInt(req.params.restaurantId, 10);
    if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
      return res.status(400).json({ error: 'Invalid restaurant ID' });
    }

    if (!(await hasShowcaseRestaurantReadAccess(req.user, restaurantId))) {
      return res.status(403).json({ error: 'Нет доступа к этому ресторану' });
    }

    await ensureShowcaseLayoutsSchema();

    const restaurantResult = await pool.query(
      'SELECT id FROM restaurants WHERE id = $1 LIMIT 1',
      [restaurantId]
    );
    if (restaurantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    const showcaseResult = await pool.query(
      'SELECT layout FROM showcase_layouts WHERE restaurant_id = $1 LIMIT 1',
      [restaurantId]
    );

    const rawLayout = showcaseResult.rows[0]?.layout;
    const layout = normalizeShowcaseLayoutFromDb(rawLayout);
    const isVisible = normalizeShowcaseVisibilityFromDb(rawLayout);
    res.json({ blocks: layout, isVisible });
  } catch (error) {
    console.error('Showcase GET error:', error);
    res.status(500).json({ error: 'Ошибка загрузки витрины' });
  }
});

// POST/PUT showcase layout
router.post('/restaurant/:restaurantId/showcase', authenticate, async (req, res) => {
  try {
    const restaurantId = Number.parseInt(req.params.restaurantId, 10);
    if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
      return res.status(400).json({ error: 'Invalid restaurant ID' });
    }

    const { blocks = [], isVisible = true } = req.body;
    if (!Array.isArray(blocks)) {
      return res.status(400).json({ error: 'Blocks must be an array' });
    }

    if (!(await hasShowcaseRestaurantWriteAccess(req.user, restaurantId))) {
      return res.status(403).json({ error: 'Нет доступа к этому ресторану' });
    }

    await ensureShowcaseLayoutsSchema();

    const restaurantResult = await pool.query(
      'SELECT id FROM restaurants WHERE id = $1 LIMIT 1',
      [restaurantId]
    );
    if (restaurantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    const normalizedBlocks = blocks;
    let normalizedVisibility = true;
    if (typeof isVisible === 'boolean') {
      normalizedVisibility = isVisible;
    } else if (typeof isVisible === 'number') {
      normalizedVisibility = isVisible !== 0;
    } else if (typeof isVisible === 'string') {
      const normalized = isVisible.trim().toLowerCase();
      if (['false', '0', 'no', 'off'].includes(normalized)) normalizedVisibility = false;
      if (['true', '1', 'yes', 'on'].includes(normalized)) normalizedVisibility = true;
    }
    const layoutPayload = {
      blocks: normalizedBlocks,
      isVisible: normalizedVisibility
    };

    await pool.query(
      `
      INSERT INTO showcase_layouts (restaurant_id, layout, created_at, updated_at)
      VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (restaurant_id)
      DO UPDATE SET
        layout = EXCLUDED.layout,
        updated_at = CURRENT_TIMESTAMP
    `,
      [restaurantId, JSON.stringify(layoutPayload)]
    );

    res.json({ success: true, blocks: normalizedBlocks, isVisible: normalizedVisibility });
  } catch (error) {
    console.error('Showcase POST error:', error);
    res.status(500).json({ error: 'Ошибка сохранения витрины' });
  }
});

module.exports = router;
