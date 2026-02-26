const express = require('express');
const pool = require('../database/connection');
const jwt = require('jsonwebtoken');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');

const router = express.Router();
const isEnabledFlag = (value) => value === true || value === 'true' || value === 1 || value === '1';
const TASHKENT_TZ = 'Asia/Tashkent';
const AD_ALLOWED_COUNTRY_CODE = 'UZ';
const getCurrentSeasonScope = (date = new Date()) => {
  const month = Number(new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone: TASHKENT_TZ }).format(date));
  if ([12, 1, 2].includes(month)) return 'winter';
  if ([3, 4, 5].includes(month)) return 'spring';
  if ([6, 7, 8].includes(month)) return 'summer';
  return 'autumn';
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

let adBannerTargetingSchemaReady = false;
let adBannerTargetingSchemaPromise = null;
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
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS activity_type_id INTEGER`).catch(() => {});
    adBannerTargetingSchemaReady = true;
  })();

  try {
    await adBannerTargetingSchemaPromise;
  } finally {
    adBannerTargetingSchemaPromise = null;
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

const isAdCountryAllowed = (countryCode) => normalizeCountryCode(countryCode) === AD_ALLOWED_COUNTRY_CODE;

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
    
    query += ' ORDER BY p.name_ru';
    
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
    const result = await pool.query(
      `SELECT * FROM restaurants WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    // Return only safe public fields
    const r = result.rows[0];
    const serviceFee = Number.parseFloat(r.service_fee ?? 0);
    res.json({
      id: r.id,
      name: r.name,
      address: r.address,
      phone: r.phone,
      logo_url: r.logo_url,
      logo_display_mode: r.logo_display_mode || 'square',
      service_fee: Number.isFinite(serviceFee) ? serviceFee : 0,
      is_delivery_enabled: isEnabledFlag(r.is_delivery_enabled),
      click_url: r.click_url,
      payme_url: r.payme_url,
      uzum_url: r.uzum_url,
      xazna_url: r.xazna_url
    });
  } catch (error) {
    console.error('Restaurant error:', error);
    res.status(500).json({ error: 'Ошибка получения ресторана' });
  }
});

// Get active ad banners (public - for customer catalog)
router.get('/ads-banners', async (req, res) => {
  try {
    const countryCode = resolveRequestCountryCode(req);
    if (!isAdCountryAllowed(countryCode)) {
      return res.json([]);
    }

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
      SELECT id, title, image_url, button_text, target_url, slot_order, display_seconds, transition_effect,
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
    if (!isAdCountryAllowed(meta.country)) {
      return res.json({ tracked: false, reason: 'geo_blocked' });
    }

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
    if (!isAdCountryAllowed(meta.country)) {
      return res.status(403).send('Реклама доступна только в Узбекистане');
    }

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
    const result = await pool.query(`
      SELECT * FROM restaurants 
      WHERE is_active = true 
      ORDER BY name
    `);
    // Return only safe public fields
    const restaurants = result.rows.map(r => {
      const serviceFee = Number.parseFloat(r.service_fee ?? 0);
      return ({
      id: r.id,
      name: r.name,
      address: r.address,
      phone: r.phone,
      logo_url: r.logo_url,
      logo_display_mode: r.logo_display_mode || 'square',
      service_fee: Number.isFinite(serviceFee) ? serviceFee : 0,
      is_delivery_enabled: isEnabledFlag(r.is_delivery_enabled)
      });
    });
    res.json(restaurants);
  } catch (error) {
    console.error('Restaurants list error:', error);
    res.status(500).json({ error: 'Ошибка получения списка ресторанов' });
  }
});

module.exports = router;
