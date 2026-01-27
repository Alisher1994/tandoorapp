const pool = require('../database/connection');

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
  
  // Restaurants
  CREATE_RESTAURANT: 'create_restaurant',
  UPDATE_RESTAURANT: 'update_restaurant',
  DELETE_RESTAURANT: 'delete_restaurant',
  
  // Auth
  LOGIN: 'login',
  LOGOUT: 'logout'
};

/**
 * Типы сущностей
 */
const ENTITY_TYPES = {
  PRODUCT: 'product',
  CATEGORY: 'category',
  ORDER: 'order',
  USER: 'user',
  RESTAURANT: 'restaurant'
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
      actionType = null,
      entityType = null,
      startDate = null,
      endDate = null,
      limit = 100,
      offset = 0
    } = filters;

    let query = `
      SELECT 
        al.*,
        u.username,
        u.full_name as user_full_name,
        r.name as restaurant_name
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN restaurants r ON al.restaurant_id = r.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;

    if (restaurantId) {
      query += ` AND al.restaurant_id = $${paramIndex}`;
      params.push(restaurantId);
      paramIndex++;
    }

    if (userId) {
      query += ` AND al.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (actionType) {
      query += ` AND al.action_type = $${paramIndex}`;
      params.push(actionType);
      paramIndex++;
    }

    if (entityType) {
      query += ` AND al.entity_type = $${paramIndex}`;
      params.push(entityType);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND al.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND al.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ` ORDER BY al.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
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
  getIpFromRequest,
  getUserAgentFromRequest,
  ACTION_TYPES,
  ENTITY_TYPES
};

