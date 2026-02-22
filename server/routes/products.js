const express = require('express');
const pool = require('../database/connection');
const jwt = require('jsonwebtoken');

const router = express.Router();
const isEnabledFlag = (value) => value === true || value === 'true' || value === 1 || value === '1';
const TASHKENT_TZ = 'Asia/Tashkent';

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
    
    let query = `
      SELECT p.*, c.name_ru as category_name,
             cnt.id as container_id, cnt.name as container_name, cnt.price as container_price
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      LEFT JOIN containers cnt ON p.container_id = cnt.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;
    
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
      service_fee: Number.isFinite(serviceFee) ? serviceFee : 0,
      is_delivery_enabled: isEnabledFlag(r.is_delivery_enabled),
      click_url: r.click_url,
      payme_url: r.payme_url
    });
  } catch (error) {
    console.error('Restaurant error:', error);
    res.status(500).json({ error: 'Ошибка получения ресторана' });
  }
});

// Get active ad banners (public - for customer catalog)
router.get('/ads-banners', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, title, image_url, button_text, target_url, slot_order, display_seconds, transition_effect,
             start_at, end_at, repeat_days, is_enabled, is_deleted, created_at
      FROM ad_banners
      WHERE is_deleted = false AND is_enabled = true
      ORDER BY slot_order ASC, created_at DESC
      LIMIT 50
    `);

    const banners = result.rows
      .filter((banner) => isBannerVisibleNow(banner))
      .slice(0, 10)
      .map((banner) => ({
        id: banner.id,
        title: banner.title,
        image_url: banner.image_url,
        button_text: banner.button_text || 'Открыть',
        slot_order: Number(banner.slot_order) || 1,
        display_seconds: Math.max(2, Number(banner.display_seconds) || 5),
        transition_effect: banner.transition_effect || 'fade',
        click_url: `/api/products/ads-banners/${banner.id}/click`
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

    await pool.query(
      `INSERT INTO ad_banner_events (banner_id, event_type, user_id, restaurant_id, viewer_key, ip_address, user_agent)
       VALUES ($1, 'view', $2, $3, $4, $5, $6)`,
      [
        bannerId,
        getOptionalAuthUserId(req),
        restaurantId,
        viewerKey,
        getClientIp(req),
        req.headers['user-agent'] || null
      ]
    );

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

    await pool.query(
      `INSERT INTO ad_banner_events (banner_id, event_type, user_id, restaurant_id, viewer_key, ip_address, user_agent)
       VALUES ($1, 'click', $2, $3, $4, $5, $6)`,
      [
        bannerId,
        getOptionalAuthUserId(req),
        restaurantId,
        viewerKey,
        getClientIp(req),
        req.headers['user-agent'] || null
      ]
    );

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
