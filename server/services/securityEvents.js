const pool = require('../database/connection');
const geoip = require('geoip-lite');

let securityEventsSchemaReady = false;
let securityEventsSchemaPromise = null;

const SECURITY_RISK_LEVELS = new Set(['low', 'medium', 'high', 'critical']);
const SECURITY_EVENT_STATUS = new Set(['open', 'resolved']);

const sanitizeText = (value, maxLength = 255) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
};

const normalizeIp = (value) => {
  const raw = sanitizeText(value, 128);
  if (!raw) return null;
  let ip = raw;
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
};

const safeJsonDetails = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return {};
  }
};

const parseGeoByIp = (ipAddress) => {
  const normalizedIp = normalizeIp(ipAddress);
  if (!normalizedIp) {
    return {
      sourceIp: null,
      sourceCountry: null,
      sourceRegion: null,
      sourceCity: null
    };
  }

  try {
    const geo = geoip.lookup(normalizedIp);
    return {
      sourceIp: normalizedIp,
      sourceCountry: sanitizeText(geo?.country, 8),
      sourceRegion: sanitizeText(geo?.region, 120),
      sourceCity: sanitizeText(geo?.city, 120)
    };
  } catch (_) {
    return {
      sourceIp: normalizedIp,
      sourceCountry: null,
      sourceRegion: null,
      sourceCity: null
    };
  }
};

const ensureSecurityEventsSchema = async () => {
  if (securityEventsSchemaReady) return;
  if (securityEventsSchemaPromise) {
    await securityEventsSchemaPromise;
    return;
  }

  securityEventsSchemaPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS security_events (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(80) NOT NULL,
        risk_level VARCHAR(16) NOT NULL DEFAULT 'medium',
        status VARCHAR(16) NOT NULL DEFAULT 'open',
        source_ip VARCHAR(64),
        source_country VARCHAR(8),
        source_region VARCHAR(120),
        source_city VARCHAR(120),
        user_agent TEXT,
        request_method VARCHAR(16),
        request_path TEXT,
        target VARCHAR(120),
        status_code INTEGER,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE SET NULL,
        details JSONB DEFAULT '{}'::jsonb,
        resolved_at TIMESTAMP,
        resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        resolution_note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_security_events_type_created ON security_events(event_type, created_at DESC)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_security_events_risk_created ON security_events(risk_level, created_at DESC)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_security_events_status_created ON security_events(status, created_at DESC)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_security_events_source_ip_created ON security_events(source_ip, created_at DESC)`).catch(() => {});

    securityEventsSchemaReady = true;
  })();

  try {
    await securityEventsSchemaPromise;
  } finally {
    securityEventsSchemaPromise = null;
  }
};

const logSecurityEvent = async (params = {}) => {
  try {
    await ensureSecurityEventsSchema();

    const eventType = sanitizeText(params.eventType, 80) || 'unknown_event';
    const riskLevelRaw = String(params.riskLevel || '').trim().toLowerCase();
    const riskLevel = SECURITY_RISK_LEVELS.has(riskLevelRaw) ? riskLevelRaw : 'medium';
    const statusRaw = String(params.status || '').trim().toLowerCase();
    const status = SECURITY_EVENT_STATUS.has(statusRaw) ? statusRaw : 'open';
    const geo = parseGeoByIp(params.sourceIp);

    const userId = Number.parseInt(params.userId, 10);
    const restaurantId = Number.parseInt(params.restaurantId, 10);
    const statusCode = Number.parseInt(params.statusCode, 10);

    await pool.query(
      `INSERT INTO security_events (
         event_type,
         risk_level,
         status,
         source_ip,
         source_country,
         source_region,
         source_city,
         user_agent,
         request_method,
         request_path,
         target,
         status_code,
         user_id,
         restaurant_id,
         details
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb
       )`,
      [
        eventType,
        riskLevel,
        status,
        geo.sourceIp,
        geo.sourceCountry,
        geo.sourceRegion,
        geo.sourceCity,
        sanitizeText(params.userAgent, 1024),
        sanitizeText(params.requestMethod, 16),
        sanitizeText(params.requestPath, 500),
        sanitizeText(params.target, 120),
        Number.isFinite(statusCode) ? statusCode : null,
        Number.isFinite(userId) && userId > 0 ? userId : null,
        Number.isFinite(restaurantId) && restaurantId > 0 ? restaurantId : null,
        JSON.stringify(safeJsonDetails(params.details))
      ]
    );

    return true;
  } catch (error) {
    console.error('Security event log error:', error?.message || error);
    return false;
  }
};

const buildSecurityEventsWhere = (filters = {}) => {
  const whereParts = [];
  const params = [];

  const eventType = sanitizeText(filters.eventType, 80);
  const riskLevelRaw = String(filters.riskLevel || '').trim().toLowerCase();
  const statusRaw = String(filters.status || '').trim().toLowerCase();
  const sourceIp = sanitizeText(filters.sourceIp, 64);
  const search = sanitizeText(filters.search, 180);
  const startDate = sanitizeText(filters.startDate, 20);
  const endDate = sanitizeText(filters.endDate, 20);
  const validDatePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (eventType) {
    params.push(eventType);
    whereParts.push(`se.event_type = $${params.length}`);
  }

  if (SECURITY_RISK_LEVELS.has(riskLevelRaw)) {
    params.push(riskLevelRaw);
    whereParts.push(`se.risk_level = $${params.length}`);
  }

  if (statusRaw === 'open') {
    whereParts.push(`se.status = 'open'`);
  } else if (statusRaw === 'resolved') {
    whereParts.push(`se.status = 'resolved'`);
  }

  if (sourceIp) {
    params.push(sourceIp);
    whereParts.push(`se.source_ip = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    whereParts.push(`(
      se.event_type ILIKE $${params.length}
      OR COALESCE(se.source_ip, '') ILIKE $${params.length}
      OR COALESCE(se.request_path, '') ILIKE $${params.length}
      OR COALESCE(se.target, '') ILIKE $${params.length}
      OR COALESCE(se.source_country, '') ILIKE $${params.length}
      OR COALESCE(se.source_city, '') ILIKE $${params.length}
      OR COALESCE(se.source_region, '') ILIKE $${params.length}
      OR COALESCE(se.details::text, '') ILIKE $${params.length}
    )`);
  }

  if (startDate && validDatePattern.test(startDate)) {
    params.push(startDate);
    whereParts.push(`se.created_at::date >= $${params.length}`);
  }

  if (endDate && validDatePattern.test(endDate)) {
    params.push(endDate);
    whereParts.push(`se.created_at::date <= $${params.length}`);
  }

  return {
    whereSql: whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '',
    params
  };
};

const listSecurityEvents = async (filters = {}) => {
  await ensureSecurityEventsSchema();

  const parsedPage = Number.parseInt(filters.page, 10);
  const parsedLimit = Number.parseInt(filters.limit, 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 20;
  const offset = (page - 1) * limit;

  const { whereSql, params } = buildSecurityEventsWhere(filters);

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM security_events se
    ${whereSql}
  `;

  const listParams = [...params, limit, offset];
  const rowsQuery = `
    SELECT
      se.id,
      se.event_type,
      se.risk_level,
      se.status,
      se.source_ip,
      se.source_country,
      se.source_region,
      se.source_city,
      se.user_agent,
      se.request_method,
      se.request_path,
      se.target,
      se.status_code,
      se.user_id,
      se.restaurant_id,
      se.details,
      se.resolved_at,
      se.resolved_by,
      se.resolution_note,
      se.created_at,
      u.username AS user_username,
      u.full_name AS user_full_name,
      r.name AS restaurant_name,
      ru.username AS resolved_by_username,
      ru.full_name AS resolved_by_full_name
    FROM security_events se
    LEFT JOIN users u ON u.id = se.user_id
    LEFT JOIN restaurants r ON r.id = se.restaurant_id
    LEFT JOIN users ru ON ru.id = se.resolved_by
    ${whereSql}
    ORDER BY se.created_at DESC, se.id DESC
    LIMIT $${listParams.length - 1}
    OFFSET $${listParams.length}
  `;

  const [countResult, rowsResult] = await Promise.all([
    pool.query(countQuery, params),
    pool.query(rowsQuery, listParams)
  ]);

  return {
    events: rowsResult.rows || [],
    total: Number(countResult.rows?.[0]?.total || 0),
    page,
    limit
  };
};

const getSecurityEventsStats = async () => {
  await ensureSecurityEventsSchema();

  const [overviewResult, topSourcesResult, byTypeResult, byRiskResult] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'open')::int AS open_total,
        COUNT(*) FILTER (WHERE risk_level IN ('high', 'critical'))::int AS high_total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS total_24h,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND status = 'open')::int AS open_24h,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND risk_level IN ('high', 'critical'))::int AS high_24h,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS total_7d
      FROM security_events
    `),
    pool.query(`
      SELECT
        COALESCE(source_ip, 'unknown') AS source_ip,
        COALESCE(source_country, '') AS source_country,
        COALESCE(source_city, '') AS source_city,
        COUNT(*)::int AS total
      FROM security_events
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY 1, 2, 3
      ORDER BY total DESC, source_ip ASC
      LIMIT 8
    `),
    pool.query(`
      SELECT event_type, COUNT(*)::int AS total
      FROM security_events
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY event_type
      ORDER BY total DESC, event_type ASC
      LIMIT 10
    `),
    pool.query(`
      SELECT risk_level, COUNT(*)::int AS total
      FROM security_events
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY risk_level
      ORDER BY total DESC, risk_level ASC
    `)
  ]);

  return {
    overview: overviewResult.rows?.[0] || {
      total: 0,
      open_total: 0,
      high_total: 0,
      total_24h: 0,
      open_24h: 0,
      high_24h: 0,
      total_7d: 0
    },
    top_sources_24h: topSourcesResult.rows || [],
    by_type_24h: byTypeResult.rows || [],
    by_risk_24h: byRiskResult.rows || []
  };
};

const setSecurityEventStatus = async ({ eventId, status, resolvedBy = null, resolutionNote = null }) => {
  await ensureSecurityEventsSchema();

  const normalizedEventId = Number.parseInt(eventId, 10);
  if (!Number.isFinite(normalizedEventId) || normalizedEventId <= 0) {
    throw new Error('INVALID_EVENT_ID');
  }

  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (!SECURITY_EVENT_STATUS.has(normalizedStatus)) {
    throw new Error('INVALID_STATUS');
  }

  const normalizedResolvedBy = Number.parseInt(resolvedBy, 10);
  const safeNote = sanitizeText(resolutionNote, 1000);

  const result = await pool.query(
    `UPDATE security_events
     SET status = $1,
         resolved_at = CASE WHEN $1 = 'resolved' THEN CURRENT_TIMESTAMP ELSE NULL END,
         resolved_by = CASE WHEN $1 = 'resolved' AND $2 > 0 THEN $2 ELSE NULL END,
         resolution_note = CASE WHEN $1 = 'resolved' THEN $3 ELSE NULL END
     WHERE id = $4
     RETURNING *`,
    [
      normalizedStatus,
      Number.isFinite(normalizedResolvedBy) ? normalizedResolvedBy : 0,
      safeNote,
      normalizedEventId
    ]
  );

  if (!result.rows.length) {
    throw new Error('EVENT_NOT_FOUND');
  }

  return result.rows[0];
};

module.exports = {
  ensureSecurityEventsSchema,
  logSecurityEvent,
  listSecurityEvents,
  getSecurityEventsStats,
  setSecurityEventStatus
};
