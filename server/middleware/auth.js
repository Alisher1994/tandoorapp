const jwt = require('jsonwebtoken');
const pool = require('../database/connection');

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
        u.last_address
      FROM users u
      WHERE u.id = $1
    `, [decoded.userId]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    const user = userResult.rows[0];

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

    user.active_restaurant_name = null;
    user.active_restaurant_logo = null;
    user.active_restaurant_logo_display_mode = null;
    user.active_restaurant_service_fee = null;
    user.active_restaurant_is_delivery_enabled = null;
    user.restaurant_balance = null;
    user.restaurant_is_free_tier = null;

    if (user.active_restaurant_id) {
      const restaurantResult = await pool.query(`
        SELECT
          name,
          logo_url,
          logo_display_mode,
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
        user.active_restaurant_service_fee = restaurant.service_fee;
        user.active_restaurant_is_delivery_enabled = restaurant.is_delivery_enabled;
        user.restaurant_balance = restaurant.balance;
        user.restaurant_is_free_tier = restaurant.is_free_tier;
      }
    }

    // For operators/superadmins, use restaurant balance as "the" balance
    if (user.role === 'operator' || user.role === 'superadmin') {
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

    // Get list of restaurants user has access to (for operators and superadmins)
    if (user.role === 'superadmin' || user.role === 'operator') {
      const restaurantsResult = await pool.query(`
        SELECT r.id, r.name 
        FROM restaurants r
        INNER JOIN operator_restaurants opr ON r.id = opr.restaurant_id
        WHERE opr.user_id = $1 AND r.is_active = true
        ORDER BY r.name
      `, [user.id]);
      user.restaurants = restaurantsResult.rows;
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
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Доступ только для супер-администратора' });
  }
  next();
};

/**
 * Требует роль operator или superadmin
 */
const requireOperator = (req, res, next) => {
  if (req.user.role !== 'operator' && req.user.role !== 'superadmin') {
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
