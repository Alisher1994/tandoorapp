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
    
    // Get user from database with active restaurant info and location
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
        u.last_latitude,
        u.last_longitude,
        u.last_address,
        r.name as active_restaurant_name,
        r.logo_url as active_restaurant_logo
      FROM users u
      LEFT JOIN restaurants r ON u.active_restaurant_id = r.id
      WHERE u.id = $1
    `, [decoded.userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }
    
    const user = userResult.rows[0];
    
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
