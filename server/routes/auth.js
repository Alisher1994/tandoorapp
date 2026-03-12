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

function normalizePhone(rawPhone) {
  if (!rawPhone) return '';
  const trimmed = String(rawPhone).trim().replace(/\s+/g, '');
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }
  return trimmed.replace(/\D/g, '');
}

function normalizeLoginPortal(value) {
  const portal = String(value || '').trim().toLowerCase();
  if (['customer', 'admin', 'operator', 'superadmin'].includes(portal)) {
    return portal;
  }
  return '';
}

function parseOptionalInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPortalRoleRank(role, portal) {
  if (!portal) return 0;

  const ranksByPortal = {
    customer: { customer: 0, operator: 1, superadmin: 2 },
    admin: { operator: 0, superadmin: 1, customer: 2 },
    operator: { operator: 0, superadmin: 1, customer: 2 },
    superadmin: { superadmin: 0, operator: 1, customer: 2 }
  };

  const rankMap = ranksByPortal[portal] || {};
  return Number.isFinite(rankMap[role]) ? rankMap[role] : 99;
}

function isRoleAllowedForPortal(role, portal) {
  if (!portal) return true;
  if (portal === 'customer') return role === 'customer';
  if (portal === 'admin') return role === 'operator' || role === 'superadmin';
  if (portal === 'operator') return role === 'operator' || role === 'superadmin';
  if (portal === 'superadmin') return role === 'superadmin';
  return true;
}

async function verifyPasswordCandidate(password, user) {
  let isValidPassword = false;
  const storedPassword = user?.password || '';
  const isBcryptHash = typeof storedPassword === 'string' && /^\$2[aby]\$\d{2}\$/.test(storedPassword);

  if (isBcryptHash) {
    isValidPassword = await bcrypt.compare(password, storedPassword);
  } else {
    isValidPassword = password === storedPassword;
    if (isValidPassword) {
      const rehashedPassword = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET password = $1 WHERE id = $2', [rehashedPassword, user.id]);
    }
  }

  return isValidPassword;
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
    const { username, password, portal, restaurant_id, account_user_id } = req.body;
    const identifier = String(username || '').trim();
    const requestedPortal = normalizeLoginPortal(portal);
    const requestedRestaurantId = parseOptionalInt(restaurant_id);
    const requestedAccountUserId = parseOptionalInt(account_user_id);

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
             r.logo_display_mode as active_restaurant_logo_display_mode,
             r.currency_code as active_restaurant_currency_code,
             r.service_fee as active_restaurant_service_fee,
             r.is_delivery_enabled as active_restaurant_is_delivery_enabled,
             r.ui_theme as active_restaurant_ui_theme,
             CASE
               WHEN $3 <> '' AND COALESCE(regexp_replace(u.phone, '[^0-9]', '', 'g'), '') = $3 THEN 0
               WHEN $3 <> '' AND COALESCE(regexp_replace(u.username, '[^0-9]', '', 'g'), '') = $3 THEN 1
               WHEN LOWER(u.username) = $1 THEN 2
               WHEN LOWER(u.username) = $2 THEN 3
               ELSE 4
             END AS login_match_priority,
             CASE
               WHEN $4::int IS NULL THEN false
               ELSE EXISTS (
                 SELECT 1
                 FROM operator_restaurants opr
                 WHERE opr.user_id = u.id
                   AND opr.restaurant_id = $4::int
               )
             END AS matches_portal_restaurant
      FROM users u
      LEFT JOIN restaurants r ON u.active_restaurant_id = r.id
      WHERE LOWER(u.username) = $1
         OR LOWER(u.username) = $2
         OR ($3 <> '' AND COALESCE(regexp_replace(u.phone, '[^0-9]', '', 'g'), '') = $3)
         OR ($3 <> '' AND COALESCE(regexp_replace(u.username, '[^0-9]', '', 'g'), '') = $3)
      ORDER BY login_match_priority ASC, u.id DESC
      LIMIT 20
    `, [usernameLower, usernameWithAt, phoneDigits, requestedRestaurantId]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const sortedCandidates = [...result.rows].sort((a, b) => {
      const aRoleRank = getPortalRoleRank(a.role, requestedPortal);
      const bRoleRank = getPortalRoleRank(b.role, requestedPortal);
      if (aRoleRank !== bRoleRank) return aRoleRank - bRoleRank;

      if (requestedPortal && requestedPortal !== 'customer' && requestedRestaurantId) {
        const aRestaurantRank = a.matches_portal_restaurant ? 0 : 1;
        const bRestaurantRank = b.matches_portal_restaurant ? 0 : 1;
        if (aRestaurantRank !== bRestaurantRank) return aRestaurantRank - bRestaurantRank;
      }

      const aMatchRank = Number(a.login_match_priority ?? 99);
      const bMatchRank = Number(b.login_match_priority ?? 99);
      if (aMatchRank !== bMatchRank) return aMatchRank - bMatchRank;

      return Number(b.id || 0) - Number(a.id || 0);
    });

    const preferredCandidates = requestedPortal
      ? sortedCandidates.filter((candidate) => isRoleAllowedForPortal(candidate.role, requestedPortal))
      : [];
    const candidatesToCheck = requestedPortal && preferredCandidates.length > 0
      ? preferredCandidates
      : sortedCandidates;

    let user = null;
    let inactiveUserMatched = false;
    const validCandidates = [];

    for (const candidate of candidatesToCheck) {
      const isValidPassword = await verifyPasswordCandidate(password, candidate);
      if (!isValidPassword) continue;

      if (!candidate.is_active) {
        inactiveUserMatched = true;
        continue;
      }
      validCandidates.push(candidate);
    }

    if (validCandidates.length === 0) {
      if (inactiveUserMatched) {
        return res.status(403).json({ error: 'Аккаунт деактивирован' });
      }
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    if (!requestedPortal && !requestedAccountUserId && validCandidates.length > 1) {
      const distinctIds = new Set(validCandidates.map((candidate) => candidate.id));
      if (distinctIds.size > 1) {
        return res.status(409).json({
          requires_account_choice: true,
          message: 'Найдено несколько аккаунтов с этими данными. Выберите, в какой аккаунт войти.',
          accounts: validCandidates.map((candidate) => ({
            id: candidate.id,
            role: candidate.role,
            full_name: candidate.full_name,
            phone: candidate.phone,
            username: candidate.username,
            active_restaurant_name: candidate.active_restaurant_name
          }))
        });
      }
    }

    if (requestedAccountUserId) {
      user = validCandidates.find((candidate) => Number(candidate.id) === requestedAccountUserId) || null;
      if (!user) {
        return res.status(401).json({ error: 'Выбранный аккаунт недоступен для этих данных входа' });
      }
    } else {
      user = validCandidates[0];
    }

    const tokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      ...(user.role === 'customer' && user.active_restaurant_id
        ? { restaurantId: Number(user.active_restaurant_id) }
        : {})
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

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
        active_restaurant_logo_display_mode: user.active_restaurant_logo_display_mode,
        active_restaurant_currency_code: user.active_restaurant_currency_code || 'uz',
        active_restaurant_ui_theme: normalizeUiTheme(user.active_restaurant_ui_theme, 'classic'),
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
        active_restaurant_logo_display_mode: req.user.active_restaurant_logo_display_mode,
        active_restaurant_currency_code: req.user.active_restaurant_currency_code || 'uz',
        active_restaurant_ui_theme: normalizeUiTheme(req.user.active_restaurant_ui_theme, 'classic'),
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
