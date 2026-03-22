const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../database/connection');
const { reloadMultiBots } = require('../bot/multiBotManager');

const BOT_LANGUAGES = new Set(['ru', 'uz']);
const WEB_APP_CACHE_VERSION = String(
  process.env.RAILWAY_DEPLOYMENT_ID
  || process.env.RAILWAY_GIT_COMMIT_SHA
  || process.env.SOURCE_VERSION
  || process.env.npm_package_version
  || ''
).trim();
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

let activityTypesSchemaReady = false;
let activityTypesSchemaPromise = null;

const normalizeBotLanguage = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  return BOT_LANGUAGES.has(candidate) ? candidate : 'ru';
};

const normalizePhone = (rawPhone) => {
  if (!rawPhone) return '';
  const trimmed = String(rawPhone).trim().replace(/\s+/g, '');
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }
  return trimmed.replace(/\D/g, '');
};

const normalizePhoneDigits = (rawPhone) => String(normalizePhone(rawPhone) || '').replace(/\D/g, '');

const formatPhoneWithPlus = (rawPhone) => {
  const digits = normalizePhoneDigits(rawPhone);
  if (!digits) return '';
  return `+${digits}`;
};

const passwordFromPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '0000';
  return digits.slice(-4).padStart(4, '0');
};

const parseTelegramGroupId = (rawGroupId) => {
  if (rawGroupId === undefined || rawGroupId === null) return null;
  const normalized = String(rawGroupId).trim();
  if (!/^-?\d{5,20}$/.test(normalized)) return null;
  return normalized;
};

const appendWebAppCacheVersion = (rawUrl) => {
  if (!rawUrl || !WEB_APP_CACHE_VERSION) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.set('app_v', WEB_APP_CACHE_VERSION);
    return parsed.toString();
  } catch {
    return rawUrl;
  }
};

const generateLoginToken = (userId, username, options = {}) => {
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
};

const buildCatalogUrl = (appUrl, token) => {
  const trimmed = String(appUrl || '').endsWith('/') ? String(appUrl).slice(0, -1) : String(appUrl || '');
  if (!trimmed || !token) return null;
  return appendWebAppCacheVersion(`${trimmed}/catalog?token=${encodeURIComponent(token)}`);
};

const buildWebLoginUrl = (params = {}) => {
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
    await pool.query('ALTER TABLE business_activity_types ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT true').catch(() => {});
    await pool.query('ALTER TABLE business_activity_types ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0').catch(() => {});
    await pool.query('ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS activity_type_id INTEGER').catch(() => {});
    await pool.query('CREATE INDEX IF NOT EXISTS idx_restaurants_activity_type_id ON restaurants(activity_type_id)').catch(() => {});
    await pool.query('CREATE INDEX IF NOT EXISTS idx_business_activity_types_sort_order ON business_activity_types(sort_order, id)').catch(() => {});
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_business_activity_types_name_lower ON business_activity_types (LOWER(name))').catch(() => {});

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

const getVisibleActivityTypes = async (clientOrPool = pool) => {
  await ensureActivityTypesSchema();
  const db = clientOrPool || pool;
  const result = await db.query(`
    SELECT id, name, sort_order
    FROM business_activity_types
    WHERE is_visible = true
    ORDER BY sort_order ASC, id ASC
  `);
  return result.rows.map((item) => ({
    id: Number(item.id),
    name: String(item.name || '').trim(),
    sort_order: Number(item.sort_order || 0)
  }));
};

const resolveUniqueAuthUsername = async (clientOrPool, preferredUsername, ownerUserId = null) => {
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
};

const upsertTelegramAdminLink = async (clientOrPool, telegramId, userId) => {
  if (!telegramId || !userId) return;
  const db = clientOrPool || pool;
  await db.query(`
    INSERT INTO telegram_admin_links (telegram_id, user_id)
    VALUES ($1, $2)
    ON CONFLICT (telegram_id)
    DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = CURRENT_TIMESTAMP
  `, [telegramId, userId]).catch(() => {});
};

const resolvePrimaryRestaurantIdForAdminUser = async (user, clientOrPool = pool) => {
  const db = clientOrPool || pool;
  const activeRestaurantId = Number.parseInt(user?.active_restaurant_id, 10);
  if (Number.isInteger(activeRestaurantId) && activeRestaurantId > 0) {
    return activeRestaurantId;
  }
  if (!user?.id) return null;

  const linkedRestaurantResult = await db.query(
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
};

const buildOperatorStoreWebAppUrl = async (user, clientOrPool = pool) => {
  const appUrl = process.env.TELEGRAM_WEB_APP_URL || process.env.FRONTEND_URL;
  if (!appUrl || !user?.id) return null;
  const restaurantId = await resolvePrimaryRestaurantIdForAdminUser(user, clientOrPool);
  if (!restaurantId) return null;

  const username = user.username || `user_${user.id}`;
  const token = generateLoginToken(user.id, username, { restaurantId });
  return buildCatalogUrl(appUrl, token);
};

const sanitizeText = (value, maxLength = 255) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized.slice(0, maxLength);
};

const parseRequiredNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const registerStoreViaWebApp = async ({
  telegramId,
  telegramUser = {},
  payload = {}
}) => {
  const normalizedTelegramId = Number.parseInt(telegramId, 10);
  if (!Number.isFinite(normalizedTelegramId) || normalizedTelegramId <= 0) {
    throw new Error('INVALID_TELEGRAM_ID');
  }

  await ensureActivityTypesSchema();

  const storeName = sanitizeText(payload.store_name || payload.storeName, 255);
  const activityTypeId = Number.parseInt(payload.activity_type_id || payload.activityTypeId, 10);
  const fullNameInput = sanitizeText(payload.full_name || payload.fullName, 255);
  const normalizedPhone = formatPhoneWithPlus(payload.phone);
  const latitude = parseRequiredNumber(payload.latitude);
  const longitude = parseRequiredNumber(payload.longitude);
  const logoUrlRaw = sanitizeText(payload.logo_url || payload.logoUrl, 1200);
  const botTokenRaw = sanitizeText(payload.bot_token || payload.botToken, 300);
  const groupId = parseTelegramGroupId(payload.group_id || payload.groupId);
  const preferredLang = normalizeBotLanguage(payload.lang || telegramUser?.language_code);

  if (!storeName) throw new Error('STORE_NAME_REQUIRED');
  if (!Number.isFinite(activityTypeId) || activityTypeId <= 0) throw new Error('ACTIVITY_TYPE_REQUIRED');
  if (!fullNameInput) throw new Error('FULL_NAME_REQUIRED');
  if (!normalizedPhone || normalizePhoneDigits(normalizedPhone).length < 7) throw new Error('PHONE_INVALID');
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('LOCATION_REQUIRED');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const activityCheck = await client.query(
      'SELECT id, name FROM business_activity_types WHERE id = $1 AND is_visible = true LIMIT 1',
      [activityTypeId]
    );
    if (!activityCheck.rows.length) {
      throw new Error('ACTIVITY_TYPE_INVALID');
    }

    const settingsResult = await client.query(
      'SELECT default_starting_balance, default_order_cost FROM billing_settings WHERE id = 1'
    );
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
      storeName,
      normalizedPhone,
      logoUrlRaw || null,
      botTokenRaw || null,
      groupId || null,
      latitude,
      longitude,
      settings.default_starting_balance,
      settings.default_order_cost,
      activityTypeId
    ]);
    const restaurant = restaurantResult.rows[0];

    const preferredUsername = normalizePhoneDigits(normalizedPhone) || `operator_${normalizedTelegramId}`;
    const plainPassword = passwordFromPhone(normalizedPhone);
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    let userIdDb = null;
    let username = null;

    const linkedAdminByTg = await client.query(`
      SELECT u.id, u.role
      FROM telegram_admin_links tal
      JOIN users u ON u.id = tal.user_id
      WHERE tal.telegram_id = $1
      ORDER BY
        CASE WHEN u.role = 'superadmin' THEN 0 WHEN u.role = 'operator' THEN 1 ELSE 2 END,
        u.id DESC
      LIMIT 1
    `, [normalizedTelegramId]).catch(() => ({ rows: [] }));

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
      `, [username, hashedPassword, fullNameInput, normalizedPhone, restaurant.id, preferredLang, userIdDb]);
    } else {
      const userByTg = await client.query('SELECT id, role FROM users WHERE telegram_id = $1', [normalizedTelegramId]);
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
        `, [username, hashedPassword, fullNameInput, normalizedPhone, restaurant.id, preferredLang, userIdDb]);
        await upsertTelegramAdminLink(client, normalizedTelegramId, userIdDb);
      } else if (userByTg.rows.length > 0 && userByTg.rows[0].role === 'customer') {
        username = await resolveUniqueAuthUsername(client, preferredUsername);
        const insertedUser = await client.query(`
          INSERT INTO users (telegram_id, username, password, full_name, phone, role, is_active, active_restaurant_id, bot_language)
          VALUES (NULL, $1, $2, $3, $4, 'operator', true, $5, $6)
          RETURNING id
        `, [username, hashedPassword, fullNameInput, normalizedPhone, restaurant.id, preferredLang]);
        userIdDb = insertedUser.rows[0].id;
        await upsertTelegramAdminLink(client, normalizedTelegramId, userIdDb);
      } else {
        username = await resolveUniqueAuthUsername(client, preferredUsername);
        const insertedUser = await client.query(`
          INSERT INTO users (telegram_id, username, password, full_name, phone, role, is_active, active_restaurant_id, bot_language)
          VALUES ($1, $2, $3, $4, $5, 'operator', true, $6, $7)
          RETURNING id
        `, [normalizedTelegramId, username, hashedPassword, fullNameInput, normalizedPhone, restaurant.id, preferredLang]);
        userIdDb = insertedUser.rows[0].id;
        await upsertTelegramAdminLink(client, normalizedTelegramId, userIdDb);
      }
    }

    await client.query(`
      INSERT INTO operator_restaurants (user_id, restaurant_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, restaurant_id) DO NOTHING
    `, [userIdDb, restaurant.id]);

    const userResult = await client.query(
      'SELECT id, username, full_name, phone, role, is_active, active_restaurant_id, bot_language FROM users WHERE id = $1',
      [userIdDb]
    );
    const operatorUser = userResult.rows[0];

    await client.query('COMMIT');

    if (restaurant.telegram_bot_token && String(restaurant.telegram_bot_token).trim()) {
      try {
        await reloadMultiBots();
      } catch (reloadError) {
        console.error('Reload multi bots after WebApp registration error:', reloadError.message);
      }
    }

    const adminAutoLoginToken = generateLoginToken(userIdDb, username, {
      expiresIn: '1h',
      role: 'operator'
    });
    const loginUrl = buildWebLoginUrl({
      portal: 'admin',
      source: 'superadmin_bot_webapp',
      token: adminAutoLoginToken
    });
    const storeUrl = await buildOperatorStoreWebAppUrl(operatorUser, pool);

    return {
      restaurant,
      operatorUser,
      credentials: {
        username,
        password: plainPassword
      },
      urls: {
        login_url: loginUrl,
        store_url: storeUrl
      },
      meta: {
        activity_type_name: activityCheck.rows[0]?.name || null,
        location_text: `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`,
        language: preferredLang
      }
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  ensureActivityTypesSchema,
  getVisibleActivityTypes,
  registerStoreViaWebApp,
  normalizeBotLanguage,
  normalizePhone,
  normalizePhoneDigits,
  formatPhoneWithPlus,
  buildWebLoginUrl,
  buildCatalogUrl,
  generateLoginToken,
  parseTelegramGroupId
};
