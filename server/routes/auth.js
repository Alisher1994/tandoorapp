const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../database/connection');
const { authenticate } = require('../middleware/auth');
const {
  logActivity,
  getIpFromRequest,
  getUserAgentFromRequest,
  ACTION_TYPES,
  ENTITY_TYPES
} = require('../services/activityLogger');

const router = express.Router();

function normalizePhone(rawPhone) {
  if (!rawPhone) return '';
  const trimmed = String(rawPhone).trim().replace(/\s+/g, '');
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }
  return trimmed.replace(/\D/g, '');
}

// Register (only for customers via Telegram bot)
router.post('/register', async (req, res) => {
  try {
    const { username, password, full_name, phone, telegram_id } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    // Prevent registration with admin/operator username patterns
    const forbiddenPatterns = ['admin', 'superadmin', 'operator'];
    if (forbiddenPatterns.some(p => username.toLowerCase().includes(p))) {
      return res.status(400).json({ error: 'Этот логин зарезервирован' });
    }

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR (telegram_id = $2 AND telegram_id IS NOT NULL)',
      [username, telegram_id]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Only allow customer role registration via API
    const result = await pool.query(
      `INSERT INTO users (username, password, full_name, phone, telegram_id, role, is_active) 
       VALUES ($1, $2, $3, $4, $5, 'customer', true) 
       RETURNING id, username, full_name, phone, role`,
      [username, hashedPassword, full_name, phone, telegram_id || null]
    );

    res.status(201).json({
      message: 'Регистрация успешна',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const identifier = String(username || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    const usernameLower = identifier.toLowerCase();
    const usernameWithAt = identifier.startsWith('@')
      ? identifier.toLowerCase()
      : `@${identifier.toLowerCase()}`;
    const normalizedPhone = normalizePhone(identifier);
    const phoneDigits = normalizedPhone.replace(/\D/g, '');

    const result = await pool.query(`
      SELECT u.*, r.name as active_restaurant_name, r.logo_url as active_restaurant_logo,
             r.service_fee as active_restaurant_service_fee,
             r.is_delivery_enabled as active_restaurant_is_delivery_enabled
      FROM users u
      LEFT JOIN restaurants r ON u.active_restaurant_id = r.id
      WHERE LOWER(u.username) = $1
         OR LOWER(u.username) = $2
         OR ($3 <> '' AND COALESCE(regexp_replace(u.phone, '[^0-9]', '', 'g'), '') = $3)
         OR ($3 <> '' AND COALESCE(regexp_replace(u.username, '[^0-9]', '', 'g'), '') = $3)
      ORDER BY
        CASE
          WHEN $3 <> '' AND COALESCE(regexp_replace(u.phone, '[^0-9]', '', 'g'), '') = $3 THEN 0
          WHEN $3 <> '' AND COALESCE(regexp_replace(u.username, '[^0-9]', '', 'g'), '') = $3 THEN 1
          WHEN LOWER(u.username) = $1 THEN 2
          WHEN LOWER(u.username) = $2 THEN 3
          ELSE 4
        END
      LIMIT 1
    `, [usernameLower, usernameWithAt, phoneDigits]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const user = result.rows[0];

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({ error: 'Аккаунт деактивирован' });
    }

    let isValidPassword = false;
    const storedPassword = user.password || '';
    const isBcryptHash = typeof storedPassword === 'string' && /^\$2[aby]\$\d{2}\$/.test(storedPassword);

    if (isBcryptHash) {
      isValidPassword = await bcrypt.compare(password, storedPassword);
    } else {
      // Backward compatibility for legacy plain-text passwords
      isValidPassword = password === storedPassword;
      if (isValidPassword) {
        const rehashedPassword = await bcrypt.hash(password, 10);
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [rehashedPassword, user.id]);
      }
    }

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Get restaurants for operators and superadmins
    let restaurants = [];
    if (user.role === 'superadmin' || user.role === 'operator') {
      const restaurantsResult = await pool.query(`
        SELECT r.id, r.name 
        FROM restaurants r
        INNER JOIN operator_restaurants opr ON r.id = opr.restaurant_id
        WHERE opr.user_id = $1 AND r.is_active = true
        ORDER BY r.name
      `, [user.id]);
      restaurants = restaurantsResult.rows;
    }

    // Log login activity
    await logActivity({
      userId: user.id,
      restaurantId: user.active_restaurant_id,
      actionType: ACTION_TYPES.LOGIN,
      entityType: ENTITY_TYPES.USER,
      entityId: user.id,
      entityName: user.full_name || user.username,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        phone: user.phone,
        role: user.role,
        active_restaurant_id: user.active_restaurant_id,
        active_restaurant_name: user.active_restaurant_name,
        active_restaurant_logo: user.active_restaurant_logo,
        active_restaurant_service_fee: user.active_restaurant_service_fee,
        active_restaurant_is_delivery_enabled: user.active_restaurant_is_delivery_enabled,
        restaurants
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

// Verify token (for auto-login via URL)
router.get('/verify-token', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.json({ valid: false, error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user exists and is active
    const userResult = await pool.query(
      'SELECT id, username, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.json({ valid: false, error: 'User not found' });
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.json({ valid: false, error: 'User deactivated' });
    }

    res.json({ valid: true, userId: user.id, username: user.username });
  } catch (error) {
    console.error('Token verification error:', error);
    res.json({ valid: false, error: 'Invalid or expired token' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        full_name: req.user.full_name,
        phone: req.user.phone,
        role: req.user.role,
        active_restaurant_id: req.user.active_restaurant_id,
        active_restaurant_name: req.user.active_restaurant_name,
        active_restaurant_logo: req.user.active_restaurant_logo,
        active_restaurant_service_fee: req.user.active_restaurant_service_fee,
        active_restaurant_is_delivery_enabled: req.user.active_restaurant_is_delivery_enabled,
        restaurants: req.user.restaurants || [],
        balance: req.user.balance,
        last_latitude: req.user.last_latitude,
        last_longitude: req.user.last_longitude,
        last_address: req.user.last_address
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения данных пользователя' });
  }
});

// Logout (just log the action, token invalidation is client-side)
router.post('/logout', authenticate, async (req, res) => {
  try {
    // Log logout activity
    await logActivity({
      userId: req.user.id,
      restaurantId: req.user.active_restaurant_id,
      actionType: ACTION_TYPES.LOGOUT,
      entityType: ENTITY_TYPES.USER,
      entityId: req.user.id,
      entityName: req.user.full_name || req.user.username,
      ipAddress: getIpFromRequest(req),
      userAgent: getUserAgentFromRequest(req)
    });

    res.json({ message: 'Выход выполнен' });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка выхода' });
  }
});

module.exports = router;
