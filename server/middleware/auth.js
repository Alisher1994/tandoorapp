const jwt = require('jsonwebtoken');
const pool = require('../database/connection');
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
const UI_FONT_FAMILY_VALUES = new Set([
  'sans',
  'inter',
  'roboto',
  'open_sans',
  'lato',
  'montserrat',
  'poppins',
  'nunito',
  'serif_times',
  'serif_georgia',
  'serif_merriweather',
  'serif_playfair',
  'serif_garamond',
  'serif_baskerville'
]);
const normalizeUiFontFamily = (value, fallback = 'sans') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (UI_FONT_FAMILY_VALUES.has(normalized)) return normalized;
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return UI_FONT_FAMILY_VALUES.has(normalizedFallback) ? normalizedFallback : 'sans';
};
const normalizeModeratorPermissions = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value);
  const normalized = {};
  for (const [rawTab, rawPerm] of entries) {
    const tab = String(rawTab || '').trim().toLowerCase();
    if (!tab) continue;
    const perm = rawPerm && typeof rawPerm === 'object' ? rawPerm : {};
    normalized[tab] = {
      view: perm.view === true,
      edit: perm.edit === true
    };
  }
  return normalized;
};

/**
 * Аутентификация пользователя по JWT токену
 * Добавляет в req.user полную информацию о пользователе
 */
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Токен не предоставлен' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const decodedRestaurantId = Number.parseInt(decoded?.restaurantId, 10);
    const tokenRestaurantId = Number.isInteger(decodedRestaurantId) && decodedRestaurantId > 0
      ? decodedRestaurantId
      : null;

    // Get user from database with location info
    const userResult = await pool.query(`
      SELECT 
        u.id, 
        u.username, 
        u.full_name, 
        u.phone, 
        u.role,
        u.telegram_id,
        u.active_restaurant_id,
        u.is_active,
        u.balance,
        u.last_latitude,
        u.last_longitude,
        u.last_address,
        u.moderator_permissions
      FROM users u
      WHERE u.id = $1
    `, [decoded.userId]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    const user = userResult.rows[0];

    // Operator/superadmin tokens can carry explicit restaurant context (e.g. "My store" button in bot).
    // Respect it when user has access to that restaurant to prevent opening the wrong store.
    if ((user.role === 'operator' || user.role === 'moderator' || user.role === 'superadmin') && tokenRestaurantId) {
      const adminRestaurantAccessResult = await pool.query(`
        SELECT 1
        FROM operator_restaurants opr
        INNER JOIN restaurants r ON r.id = opr.restaurant_id
        WHERE opr.user_id = $1
          AND opr.restaurant_id = $2
          AND r.is_active = true
        LIMIT 1
      `, [user.id, tokenRestaurantId]);

      if (adminRestaurantAccessResult.rows.length === 0) {
        return res.status(403).json({ error: 'Нет доступа к этому магазину' });
      }

      if (Number(user.active_restaurant_id) !== Number(tokenRestaurantId)) {
        await pool.query(
          'UPDATE users SET active_restaurant_id = $1 WHERE id = $2',
          [tokenRestaurantId, user.id]
        );
      }
      user.active_restaurant_id = tokenRestaurantId;
    }

    // Customer tokens can carry restaurant context; apply it per session to avoid cross-store leakage.
    if (user.role === 'customer' && tokenRestaurantId) {
      const customerRestaurantAccessResult = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM user_restaurants ur
          WHERE ur.user_id = $1 AND ur.restaurant_id = $2
        ) OR EXISTS (
          SELECT 1 FROM orders o
          WHERE o.user_id = $1 AND o.restaurant_id = $2
        ) OR $2 = COALESCE($3, -1) AS has_access
      `, [user.id, tokenRestaurantId, user.active_restaurant_id]);

      if (!customerRestaurantAccessResult.rows[0]?.has_access) {
        return res.status(403).json({ error: 'Нет доступа к этому магазину' });
      }

      user.active_restaurant_id = tokenRestaurantId;
    }

    let operatorEffectiveRestaurant = null;
    if (user.role === 'operator' || user.role === 'moderator') {
      const operatorRestaurantsResult = await pool.query(`
        SELECT
          r.id,
          r.name,
          r.logo_url,
          r.logo_display_mode,
          r.ui_theme,
          r.ui_font_family,
          r.currency_code,
          r.service_fee,
          r.is_delivery_enabled,
          r.balance,
          r.is_free_tier
        FROM restaurants r
        INNER JOIN operator_restaurants opr ON r.id = opr.restaurant_id
        WHERE opr.user_id = $1
          AND r.is_active = true
        ORDER BY r.name
      `, [user.id]);

      if (operatorRestaurantsResult.rows.length === 0) {
        return res.status(403).json({
          error: 'Магазин деактивирован. Обратитесь к супер-администратору.',
          blocked: true
        });
      }

      user.restaurants = operatorRestaurantsResult.rows.map((row) => ({
        id: row.id,
        name: row.name
      }));

      operatorEffectiveRestaurant = operatorRestaurantsResult.rows.find(
        (row) => Number(row.id) === Number(user.active_restaurant_id)
      ) || operatorRestaurantsResult.rows[0];

      if (Number(operatorEffectiveRestaurant.id) !== Number(user.active_restaurant_id)) {
        await pool.query(
          'UPDATE users SET active_restaurant_id = $1 WHERE id = $2',
          [operatorEffectiveRestaurant.id, user.id]
        );
        user.active_restaurant_id = operatorEffectiveRestaurant.id;
      }
    }

    user.active_restaurant_name = null;
    user.active_restaurant_logo = null;
    user.active_restaurant_logo_display_mode = null;
    user.active_restaurant_ui_theme = 'classic';
    user.active_restaurant_ui_font_family = 'sans';
    user.active_restaurant_currency_code = 'uz';
    user.active_restaurant_service_fee = null;
    user.active_restaurant_is_delivery_enabled = null;
    user.restaurant_balance = null;
    user.restaurant_is_free_tier = null;

    if (operatorEffectiveRestaurant) {
      const restaurant = operatorEffectiveRestaurant;
      user.active_restaurant_name = restaurant.name;
      user.active_restaurant_logo = restaurant.logo_url;
      user.active_restaurant_logo_display_mode = restaurant.logo_display_mode;
      user.active_restaurant_ui_theme = normalizeUiTheme(restaurant.ui_theme, 'classic');
      user.active_restaurant_ui_font_family = normalizeUiFontFamily(restaurant.ui_font_family, 'sans');
      user.active_restaurant_currency_code = restaurant.currency_code || 'uz';
      user.active_restaurant_service_fee = restaurant.service_fee;
      user.active_restaurant_is_delivery_enabled = restaurant.is_delivery_enabled;
      user.restaurant_balance = restaurant.balance;
      user.restaurant_is_free_tier = restaurant.is_free_tier;
    } else if (user.active_restaurant_id) {
      const restaurantResult = await pool.query(`
        SELECT
          name,
          logo_url,
          logo_display_mode,
          ui_theme,
          ui_font_family,
          currency_code,
          service_fee,
          is_delivery_enabled,
          balance,
          is_free_tier
        FROM restaurants
        WHERE id = $1
      `, [user.active_restaurant_id]);

      if (restaurantResult.rows.length > 0) {
        const restaurant = restaurantResult.rows[0];
        user.active_restaurant_name = restaurant.name;
        user.active_restaurant_logo = restaurant.logo_url;
        user.active_restaurant_logo_display_mode = restaurant.logo_display_mode;
        user.active_restaurant_ui_theme = normalizeUiTheme(restaurant.ui_theme, 'classic');
        user.active_restaurant_ui_font_family = normalizeUiFontFamily(restaurant.ui_font_family, 'sans');
        user.active_restaurant_currency_code = restaurant.currency_code || 'uz';
        user.active_restaurant_service_fee = restaurant.service_fee;
        user.active_restaurant_is_delivery_enabled = restaurant.is_delivery_enabled;
        user.restaurant_balance = restaurant.balance;
        user.restaurant_is_free_tier = restaurant.is_free_tier;
      }
    }

    // For operators/superadmins, use restaurant balance as "the" balance
    if (user.role === 'operator' || user.role === 'moderator' || user.role === 'superadmin') {
      user.balance = user.restaurant_balance;
    }


    if (!user.is_active) {
      // Get support username from active restaurant
      let supportUsername = 'admin';
      if (user.active_restaurant_id) {
        const restaurantResult = await pool.query(
          'SELECT support_username FROM restaurants WHERE id = $1',
          [user.active_restaurant_id]
        );
        if (restaurantResult.rows[0]?.support_username) {
          supportUsername = restaurantResult.rows[0].support_username;
        }
      }
      return res.status(403).json({
        error: 'Аккаунт деактивирован',
        blocked: true,
        support_username: supportUsername
      });
    }

    // Get list of restaurants user has access to (for superadmins).
    // For operators this list is already resolved above with active-only filtering.
    if (user.role === 'superadmin') {
      const restaurantsResult = await pool.query(`
        SELECT r.id, r.name 
        FROM restaurants r
        INNER JOIN operator_restaurants opr ON r.id = opr.restaurant_id
        WHERE opr.user_id = $1 AND r.is_active = true
        ORDER BY r.name
      `, [user.id]);
      user.restaurants = restaurantsResult.rows;
    }
    if (user.role === 'moderator') {
      user.moderator_permissions = normalizeModeratorPermissions(user.moderator_permissions);
    } else {
      user.moderator_permissions = {};
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ error: 'Недействительный токен' });
  }
};

/**
 * Требует роль superadmin
 */
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'superadmin' && req.user.role !== 'moderator') {
    return res.status(403).json({ error: 'Доступ только для супер-администратора или модератора' });
  }
  next();
};

/**
 * Требует роль operator или superadmin
 */
const requireOperator = (req, res, next) => {
  if (req.user.role !== 'operator' && req.user.role !== 'moderator' && req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Доступ только для операторов' });
  }
  next();
};

/**
 * Проверяет доступ к конкретному ресторану
 * restaurantId берется из req.params.restaurantId или req.body.restaurant_id или req.query.restaurant_id
 */
const requireRestaurantAccess = async (req, res, next) => {
  try {
    // Superadmin has access to all restaurants
    if (req.user.role === 'superadmin') {
      return next();
    }

    const restaurantId = req.params.restaurantId || req.body.restaurant_id || req.query.restaurant_id;

    if (!restaurantId) {
      // Use active restaurant if no specific one requested
      if (req.user.active_restaurant_id) {
        req.restaurantId = req.user.active_restaurant_id;
        return next();
      }
      return res.status(400).json({ error: 'Ресторан не указан' });
    }

    // Check if operator has access to this restaurant
    const accessResult = await pool.query(`
      SELECT 1 FROM operator_restaurants 
      WHERE user_id = $1 AND restaurant_id = $2
    `, [req.user.id, restaurantId]);

    if (accessResult.rows.length === 0) {
      return res.status(403).json({ error: 'Нет доступа к этому ресторану' });
    }

    req.restaurantId = parseInt(restaurantId);
    next();
  } catch (error) {
    console.error('Restaurant access check error:', error);
    return res.status(500).json({ error: 'Ошибка проверки доступа' });
  }
};

/**
 * Устаревший alias для обратной совместимости
 * @deprecated Use requireOperator instead
 */
const requireAdmin = requireOperator;

module.exports = {
  authenticate,
  requireSuperAdmin,
  requireOperator,
  requireRestaurantAccess,
  requireAdmin // deprecated alias
};
