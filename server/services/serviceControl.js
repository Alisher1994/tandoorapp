const pool = require('../database/connection');

const SERVICE_KEY = process.env.SERVICE_PRIMARY_KEY || 'talablar';
const SERVICE_NAME = process.env.SERVICE_NAME || 'Talablar';
const SUPPORT_PHONE = process.env.SERVICE_SUPPORT_PHONE || '+998994067406';

const monthNamesRu = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
];

const getMonthLabel = () => {
  const now = new Date();
  return `${monthNamesRu[now.getMonth()]} ${now.getFullYear()}`;
};

const defaultMessage = () => (
  `Доступ временно ограничен: серверные услуги Railway за ${getMonthLabel()} не оплачены. ` +
  'Для восстановления работы оплатите задолженность за размещение сервиса.'
);

const ensureServiceControlSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_controls (
      service_key VARCHAR(80) PRIMARY KEY,
      service_name VARCHAR(255) NOT NULL,
      enabled BOOLEAN DEFAULT true,
      title VARCHAR(255) DEFAULT 'Доступ временно ограничен',
      message TEXT,
      support_phone VARCHAR(50),
      updated_by VARCHAR(100),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    INSERT INTO service_controls (service_key, service_name, enabled, message, support_phone)
    VALUES ($1, $2, true, $3, $4)
    ON CONFLICT (service_key) DO NOTHING
  `, [SERVICE_KEY, SERVICE_NAME, defaultMessage(), SUPPORT_PHONE]);
};

const getOwnerAllowedChatIds = () => new Set(
  String(process.env.OWNER_BOT_ALLOWED_CHAT_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const isOwnerChatId = (chatId) => {
  const value = String(chatId || '').trim();
  return Boolean(value) && getOwnerAllowedChatIds().has(value);
};

const isServiceTokenValid = (req) => {
  const expected = String(process.env.SERVICE_CONTROL_API_TOKEN || '').trim();
  if (!expected) return false;
  const provided = String(req.headers['x-service-control-token'] || '').trim();
  return provided === expected;
};

const canManageService = (req, chatId) => isOwnerChatId(chatId) || isServiceTokenValid(req);

const getServiceState = async (serviceKey = SERVICE_KEY) => {
  await ensureServiceControlSchema();
  const key = String(serviceKey || SERVICE_KEY).trim() || SERVICE_KEY;
  const result = await pool.query(
    'SELECT * FROM service_controls WHERE service_key = $1 LIMIT 1',
    [key]
  );

  if (result.rows.length === 0) {
    return { success: false, service: key, message: 'Сервис не найден' };
  }

  const row = result.rows[0];
  const enabled = row.enabled !== false;
  return {
    success: true,
    service: row.service_key,
    service_name: row.service_name,
    enabled,
    lock_active: !enabled,
    month_label: getMonthLabel(),
    title: row.title || 'Доступ временно ограничен',
    message: row.message || defaultMessage(),
    support_phone: row.support_phone || SUPPORT_PHONE,
    updated_at: row.updated_at,
    updated_by: row.updated_by
  };
};

const toggleServiceState = async ({ serviceKey = SERVICE_KEY, updatedBy = null } = {}) => {
  await ensureServiceControlSchema();
  const key = String(serviceKey || SERVICE_KEY).trim() || SERVICE_KEY;
  const current = await getServiceState(key);
  if (!current.success) return current;

  const result = await pool.query(`
    UPDATE service_controls
    SET enabled = $2,
        updated_by = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE service_key = $1
    RETURNING *
  `, [key, !current.enabled, updatedBy]);

  const row = result.rows[0];
  const enabled = row.enabled !== false;
  return {
    success: true,
    service: row.service_key,
    service_name: row.service_name,
    enabled,
    lock_active: !enabled,
    month_label: getMonthLabel(),
    title: row.title || 'Доступ временно ограничен',
    message: row.message || defaultMessage(),
    support_phone: row.support_phone || SUPPORT_PHONE,
    updated_at: row.updated_at,
    updated_by: row.updated_by
  };
};

module.exports = {
  SERVICE_KEY,
  ensureServiceControlSchema,
  getServiceState,
  toggleServiceState,
  canManageService
};
