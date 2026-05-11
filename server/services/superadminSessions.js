const crypto = require('crypto');
const pool = require('../database/connection');

// Express IP can be a hop-list ("ip1, ip2") behind proxies — keep first 45 chars (IPv6 max).
function normalizeIp(value) {
  if (!value) return null;
  const ip = String(value).split(',')[0].trim();
  return ip ? ip.slice(0, 45) : null;
}

function normalizeUserAgent(value) {
  if (!value) return null;
  return String(value).slice(0, 1024);
}

// Pretty-print a short device label so the list reads like "Chrome on Windows", not the raw UA.
function deriveDeviceLabel(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return null;
  let browser = 'Unknown';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  let os = 'Unknown OS';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iOS/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  const label = `${browser} on ${os}`;
  return label.slice(0, 160);
}

function generateJti() {
  return crypto.randomBytes(18).toString('base64url');
}

// Caller passes jti so the same value lives in JWT and DB row.
async function createSession({ userId, jti, ipAddress, userAgent, expiresAt }) {
  const ip = normalizeIp(ipAddress);
  const ua = normalizeUserAgent(userAgent);
  const device = deriveDeviceLabel(ua);
  const expiresAtDate = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  await pool.query(
    `INSERT INTO superadmin_sessions
       (user_id, jti, ip_address, user_agent, device_label, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (jti) DO NOTHING`,
    [userId, jti, ip, ua, device, expiresAtDate]
  );
}

// Returns the session row if it's valid (not revoked, not expired) and the user matches.
// Touches last_seen_at on validation so the UI can sort by recency.
async function findActiveSession(jti, userId) {
  if (!jti || !userId) return null;
  const result = await pool.query(
    `SELECT id, user_id, jti, revoked_at, expires_at
       FROM superadmin_sessions
       WHERE jti = $1
       LIMIT 1`,
    [jti]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (Number(row.user_id) !== Number(userId)) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  // Best-effort touch — never block the request on this.
  pool
    .query('UPDATE superadmin_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1', [row.id])
    .catch(() => {});
  return row;
}

async function listSessionsForUsers(userIds) {
  const ids = (Array.isArray(userIds) ? userIds : [userIds]).map((v) => Number(v)).filter(Boolean);
  if (!ids.length) return [];
  const result = await pool.query(
    `SELECT s.id,
            s.user_id,
            u.username,
            u.full_name,
            s.jti,
            s.ip_address,
            s.user_agent,
            s.device_label,
            s.created_at,
            s.last_seen_at,
            s.expires_at,
            s.revoked_at,
            s.revoked_by_user_id,
            s.revoke_reason
       FROM superadmin_sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.user_id = ANY($1::int[])
         AND s.revoked_at IS NULL
         AND s.expires_at > CURRENT_TIMESTAMP
       ORDER BY s.last_seen_at DESC NULLS LAST, s.created_at DESC`,
    [ids]
  );
  return result.rows;
}

async function revokeSessions({ sessionIds, revokedByUserId, reason = null, allowedUserIds = null }) {
  const ids = (Array.isArray(sessionIds) ? sessionIds : [sessionIds]).map((v) => Number(v)).filter(Number.isFinite);
  if (!ids.length) return 0;
  const params = [ids, revokedByUserId, reason ? String(reason).slice(0, 120) : null];
  let whereClause = `id = ANY($1::int[]) AND revoked_at IS NULL`;
  if (Array.isArray(allowedUserIds)) {
    const allowed = allowedUserIds.map((v) => Number(v)).filter(Number.isFinite);
    if (!allowed.length) return 0;
    params.push(allowed);
    whereClause += ` AND user_id = ANY($${params.length}::int[])`;
  }
  const result = await pool.query(
    `UPDATE superadmin_sessions
        SET revoked_at = CURRENT_TIMESTAMP,
            revoked_by_user_id = $2,
            revoke_reason = $3
        WHERE ${whereClause}`,
    params
  );
  return result.rowCount || 0;
}

module.exports = {
  generateJti,
  createSession,
  findActiveSession,
  listSessionsForUsers,
  revokeSessions,
  deriveDeviceLabel,
  normalizeIp,
  normalizeUserAgent
};
