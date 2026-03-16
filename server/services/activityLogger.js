const pool = require('../database/connection');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');

let userTelemetrySchemaReady = false;
let userTelemetrySchemaPromise = null;

const ensureUserTelemetrySchema = async () => {
  if (userTelemetrySchemaReady) return;
  if (userTelemetrySchemaPromise) {
    await userTelemetrySchemaPromise;
    return;
  }

  userTelemetrySchemaPromise = (async () => {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP').catch(() => {});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ip_address VARCHAR(64)').catch(() => {});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_user_agent TEXT').catch(() => {});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_device_type VARCHAR(32)').catch(() => {});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_browser_name VARCHAR(80)').catch(() => {});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_browser_version VARCHAR(40)').catch(() => {});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_os_name VARCHAR(60)').catch(() => {});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_os_version VARCHAR(40)').catch(() => {});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_country VARCHAR(8)').catch(() => {});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_region VARCHAR(120)').catch(() => {});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_city VARCHAR(120)').catch(() => {});
    userTelemetrySchemaReady = true;
  })();

  try {
    await userTelemetrySchemaPromise;
  } finally {
    userTelemetrySchemaPromise = null;
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

const isPrivateIp = (ip) => {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '0.0.0.0') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) return true;
  return false;
};

const inferDeviceTypeFromUa = (userAgent) => {
  const ua = String(userAgent || '');
  if (!ua) return 'desktop';
  if (/iPad|Tablet|Tab\b|SM-T|Lenovo Tab|Nexus 7|Nexus 10/i.test(ua)) return 'tablet';
  if (/Mobile|Android|iPhone|Windows Phone/i.test(ua)) return 'mobile';
  return 'desktop';
};

const parseUserAgentMeta = (userAgent) => {
  const normalizedUserAgent = sanitizeTextValue(userAgent, 1024);
  if (!normalizedUserAgent) {
    return {
      userAgent: null,
      deviceType: null,
      browserName: null,
      browserVersion: null,
      osName: null,
      osVersion: null
    };
  }

  const parser = new UAParser(normalizedUserAgent);
  const result = parser.getResult();

  return {
    userAgent: normalizedUserAgent,
    deviceType: sanitizeTextValue(result.device?.type, 24) || inferDeviceTypeFromUa(normalizedUserAgent),
    browserName: sanitizeTextValue(result.browser?.name, 80),
    browserVersion: sanitizeTextValue(result.browser?.version, 40),
    osName: sanitizeTextValue(result.os?.name, 60),
    osVersion: sanitizeTextValue(result.os?.version, 40)
  };
};

const parseGeoMeta = (ipAddress) => {
  const normalizedIp = normalizeIpForGeoLookup(ipAddress);
  if (!normalizedIp || isPrivateIp(normalizedIp)) {
    return {
      ipAddress: normalizedIp,
      country: null,
      region: null,
      city: null
    };
  }

  try {
    const geo = geoip.lookup(normalizedIp);
    return {
      ipAddress: normalizedIp,
      country: sanitizeTextValue(geo?.country, 8),
      region: sanitizeTextValue(geo?.region, 120),
      city: sanitizeTextValue(geo?.city, 120)
    };
  } catch (_) {
    return {
      ipAddress: normalizedIp,
      country: null,
      region: null,
      city: null
    };
  }
};

const updateUserTelemetrySnapshot = async ({
  userId,
  occurredAt = null,
  ipAddress = null,
  userAgent = null,
  onlyMissing = false
}) => {
  const normalizedUserId = Number.parseInt(userId, 10);
  if (!Number.isFinite(normalizedUserId) || normalizedUserId <= 0) return false;

  await ensureUserTelemetrySchema().catch(() => {});

  const uaMeta = parseUserAgentMeta(userAgent);
  const geoMeta = parseGeoMeta(ipAddress);
  const activityAt = occurredAt ? new Date(occurredAt) : new Date();

  const updateQuery = `
    UPDATE users
    SET
      last_activity_at = COALESCE($2, last_activity_at),
      last_ip_address = COALESCE($3, last_ip_address),
      last_user_agent = COALESCE($4, last_user_agent),
      last_device_type = COALESCE($5, last_device_type),
      last_browser_name = COALESCE($6, last_browser_name),
      last_browser_version = COALESCE($7, last_browser_version),
      last_os_name = COALESCE($8, last_os_name),
      last_os_version = COALESCE($9, last_os_version),
      last_country = COALESCE($10, last_country),
      last_region = COALESCE($11, last_region),
      last_city = COALESCE($12, last_city),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    ${onlyMissing ? `
      AND (
        last_activity_at IS NULL
        OR last_ip_address IS NULL
        OR last_user_agent IS NULL
        OR last_device_type IS NULL
        OR last_browser_name IS NULL
        OR last_os_name IS NULL
      )
    ` : ''}
  `;

  const result = await pool.query(updateQuery, [
    normalizedUserId,
    Number.isNaN(activityAt.getTime()) ? null : activityAt,
    geoMeta.ipAddress,
    uaMeta.userAgent,
    uaMeta.deviceType,
    uaMeta.browserName,
    uaMeta.browserVersion,
    uaMeta.osName,
    uaMeta.osVersion,
    geoMeta.country,
    geoMeta.region,
    geoMeta.city
  ]);

  return Number(result.rowCount || 0) > 0;
};

const refreshUserTelemetryFromActivityLogs = async ({ userIds = [] } = {}) => {
  const normalizedUserIds = [...new Set(
    (Array.isArray(userIds) ? userIds : [])
      .map((id) => Number.parseInt(id, 10))
      .filter((id) => Number.isFinite(id) && id > 0)
  )];

  if (!normalizedUserIds.length) {
    return { scanned: 0, updated: 0 };
  }

  await ensureUserTelemetrySchema().catch(() => {});

  const latestLogsResult = await pool.query(
    `SELECT DISTINCT ON (al.user_id)
       al.user_id,
       al.created_at,
       al.ip_address,
       al.user_agent
     FROM activity_logs al
     WHERE al.user_id = ANY($1::int[])
     ORDER BY al.user_id, al.created_at DESC, al.id DESC`,
    [normalizedUserIds]
  );

  let updated = 0;
  for (const row of latestLogsResult.rows) {
    try {
      const wasUpdated = await updateUserTelemetrySnapshot({
        userId: row.user_id,
        occurredAt: row.created_at,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        onlyMissing: true
      });
      if (wasUpdated) updated += 1;
    } catch (_) { }
  }

  return {
    scanned: latestLogsResult.rows.length,
    updated
  };
};

/**
 * Типы действий для логирования
 */
const ACTION_TYPES = {
  // Products
  CREATE_PRODUCT: 'create_product',
  UPDATE_PRODUCT: 'update_product',
  DELETE_PRODUCT: 'delete_product',

  // Categories
  CREATE_CATEGORY: 'create_category',
  UPDATE_CATEGORY: 'update_category',
  DELETE_CATEGORY: 'delete_category',

  // Orders
  PROCESS_ORDER: 'process_order',
  UPDATE_ORDER_STATUS: 'update_order_status',
  CANCEL_ORDER: 'cancel_order',

  // Users
  CREATE_USER: 'create_user',
  UPDATE_USER: 'update_user',
  DELETE_USER: 'delete_user',
  BLOCK_USER: 'block_user',
  UNBLOCK_USER: 'unblock_user',

  // Restaurants
  CREATE_RESTAURANT: 'create_restaurant',
  UPDATE_RESTAURANT: 'update_restaurant',
  DELETE_RESTAURANT: 'delete_restaurant',

  // Auth
  LOGIN: 'login',
  LOGOUT: 'logout',

  // Analytics / generic operator navigation
  OPERATOR_VIEW: 'operator_view'
};

/**
 * Типы сущностей
 */
const ENTITY_TYPES = {
  PRODUCT: 'product',
  CATEGORY: 'category',
  ORDER: 'order',
  USER: 'user',
  RESTAURANT: 'restaurant',
  SYSTEM: 'system'
};

/**
 * Записывает действие в лог
 * @param {Object} params
 * @param {number} params.userId - ID пользователя, выполнившего действие
 * @param {number} params.restaurantId - ID ресторана (опционально)
 * @param {string} params.actionType - Тип действия (из ACTION_TYPES)
 * @param {string} params.entityType - Тип сущности (из ENTITY_TYPES)
 * @param {number} params.entityId - ID сущности
 * @param {string} params.entityName - Название сущности (для отображения)
 * @param {Object} params.oldValues - Старые значения (при обновлении/удалении)
 * @param {Object} params.newValues - Новые значения (при создании/обновлении)
 * @param {string} params.ipAddress - IP адрес пользователя (опционально)
 * @param {string} params.userAgent - User Agent браузера (опционально)
 */
async function logActivity(params) {
  try {
    const {
      userId,
      restaurantId = null,
      actionType,
      entityType,
      entityId = null,
      entityName = null,
      oldValues = null,
      newValues = null,
      ipAddress = null,
      userAgent = null
    } = params;

    await pool.query(`
      INSERT INTO activity_logs 
      (user_id, restaurant_id, action_type, entity_type, entity_id, entity_name, old_values, new_values, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      userId,
      restaurantId,
      actionType,
      entityType,
      entityId,
      entityName,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      ipAddress,
      userAgent
    ]);

    try {
      await updateUserTelemetrySnapshot({
        userId,
        occurredAt: new Date(),
        ipAddress,
        userAgent,
        onlyMissing: false
      });
    } catch (_) { }

    return true;
  } catch (error) {
    console.error('Activity log error:', error);
    // Don't throw - logging shouldn't break main functionality
    return false;
  }
}

/**
 * Получает логи активности с фильтрацией
 * @param {Object} filters
 * @param {number} filters.restaurantId - Фильтр по ресторану
 * @param {number} filters.userId - Фильтр по пользователю
 * @param {string} filters.actionType - Фильтр по типу действия
 * @param {string} filters.entityType - Фильтр по типу сущности
 * @param {Date} filters.startDate - Начало периода
 * @param {Date} filters.endDate - Конец периода
 * @param {number} filters.limit - Лимит записей (по умолчанию 100)
 * @param {number} filters.offset - Смещение (для пагинации)
 */
async function getActivityLogs(filters = {}) {
  try {
    const {
      restaurantId = null,
      userId = null,
      userRole = null,
      actionType = null,
      entityType = null,
      startDate = null,
      endDate = null,
      limit = 100,
      offset = 0
    } = filters;

    // For total count
    let countQuery = `
      SELECT COUNT(*)
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const countParams = [];
    let countParamIndex = 1;

    // For data
    let dataQuery = `
      SELECT 
        al.*,
        u.username,
        u.full_name as user_full_name,
        u.role as user_role,
        r.name as restaurant_name
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN restaurants r ON al.restaurant_id = r.id
      WHERE 1=1
    `;

    const dataParams = [];
    let dataParamIndex = 1;

    const filterBlocks = [];
    if (restaurantId) {
      filterBlocks.push(`al.restaurant_id = $${dataParamIndex}`);
      dataParams.push(restaurantId);
      countParams.push(restaurantId);
      dataParamIndex++;
      countParamIndex++;
    }

    if (userId) {
      filterBlocks.push(`al.user_id = $${dataParamIndex}`);
      dataParams.push(userId);
      countParams.push(userId);
      dataParamIndex++;
      countParamIndex++;
    }

    if (userRole) {
      filterBlocks.push(`u.role = $${dataParamIndex}`);
      dataParams.push(userRole);
      countParams.push(userRole);
      dataParamIndex++;
      countParamIndex++;
    }

    if (actionType) {
      filterBlocks.push(`al.action_type = $${dataParamIndex}`);
      dataParams.push(actionType);
      countParams.push(actionType);
      dataParamIndex++;
      countParamIndex++;
    }

    if (entityType) {
      filterBlocks.push(`al.entity_type = $${dataParamIndex}`);
      dataParams.push(entityType);
      countParams.push(entityType);
      dataParamIndex++;
      countParamIndex++;
    }

    if (startDate) {
      filterBlocks.push(`al.created_at >= $${dataParamIndex}`);
      dataParams.push(startDate);
      countParams.push(startDate);
      dataParamIndex++;
      countParamIndex++;
    }

    if (endDate) {
      filterBlocks.push(`al.created_at <= $${dataParamIndex}`);
      const endDateWithTime = endDate.includes(' ') ? endDate : `${endDate} 23:59:59`;
      dataParams.push(endDateWithTime);
      countParams.push(endDateWithTime);
      dataParamIndex++;
      countParamIndex++;
    }

    if (filterBlocks.length > 0) {
      const whereClause = ` AND ` + filterBlocks.join(' AND ');
      dataQuery += whereClause;
      countQuery += whereClause;
    }

    dataQuery += ` ORDER BY al.created_at DESC LIMIT $${dataParamIndex} OFFSET $${dataParamIndex + 1}`;
    dataParams.push(limit, offset);

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, dataParams),
      pool.query(countQuery, countParams)
    ]);

    return {
      logs: dataResult.rows,
      total: parseInt(countResult.rows[0].count)
    };
  } catch (error) {
    console.error('Get activity logs error:', error);
    throw error;
  }
}

/**
 * Получает статистику по логам
 */
async function getActivityStats(restaurantId = null, days = 7) {
  try {
    let query = `
      SELECT 
        action_type,
        entity_type,
        COUNT(*) as count,
        DATE(created_at) as date
      FROM activity_logs
      WHERE created_at >= NOW() - INTERVAL '${days} days'
    `;

    const params = [];
    if (restaurantId) {
      query += ` AND restaurant_id = $1`;
      params.push(restaurantId);
    }

    query += ` GROUP BY action_type, entity_type, DATE(created_at) ORDER BY date DESC`;

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Get activity stats error:', error);
    throw error;
  }
}

/**
 * Хелпер для получения IP из request
 */
function getIpFromRequest(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] ||
    req.socket?.remoteAddress ||
    null;
}

/**
 * Хелпер для получения User-Agent из request
 */
function getUserAgentFromRequest(req) {
  return req.headers['user-agent'] || null;
}

module.exports = {
  logActivity,
  getActivityLogs,
  getActivityStats,
  refreshUserTelemetryFromActivityLogs,
  getIpFromRequest,
  getUserAgentFromRequest,
  ACTION_TYPES,
  ENTITY_TYPES,
  ensureUserTelemetrySchema
};
