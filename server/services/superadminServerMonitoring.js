const os = require('os');
const fs = require('fs');
const pool = require('../database/connection');

const DEFAULT_STATS_INTERVAL_MS = 30 * 60 * 1000;
const MIN_STATS_INTERVAL_MS = 60 * 1000;
const MAX_STATS_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SERVER_STATS_ALLOWED_INTERVALS_MS = new Set([
  30 * 60 * 1000,
  60 * 60 * 1000,
  2 * 60 * 60 * 1000,
  3 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000
]);
const ALERT_THROTTLE_MS = 5 * 60 * 1000;
const BOT_TIME_ZONE = process.env.BOT_TIMEZONE || process.env.TELEGRAM_TIMEZONE || process.env.TZ || 'Asia/Tashkent';
const DISK_STATS_PATH = String(process.env.SUPERADMIN_SERVER_DISK_PATH || '/').trim() || '/';
const RAILWAY_GRAPHQL_ENDPOINT = String(
  process.env.SUPERADMIN_RAILWAY_GRAPHQL_ENDPOINT
    || process.env.RAILWAY_GRAPHQL_ENDPOINT
    || 'https://backboard.railway.com/graphql/v2'
).trim();
const DEFAULT_RAILWAY_PROJECTS_SPEC = String(process.env.SUPERADMIN_RAILWAY_PROJECTS || '').trim();
const RAILWAY_USAGE_MEASUREMENTS = Object.freeze([
  'CPU_USAGE',
  'MEMORY_USAGE_GB',
  'NETWORK_TX_GB',
  'DISK_USAGE_GB',
  'BACKUP_USAGE_GB'
]);
const SUPERADMIN_EXTRA_TELEGRAM_IDS = new Set(
  String(process.env.SUPERADMIN_EXTRA_TELEGRAM_IDS || '')
    .split(',')
    .map((value) => String(value || '').trim())
    .filter(Boolean)
);

let statsTimer = null;
let activeMonitoringBot = null;
let activeMonitoringLang = 'ru';
let activeMonitoringIntervalMs = DEFAULT_STATS_INTERVAL_MS;
let hooksRegistered = false;
const alertTimestamps = new Map();

const normalizeMonitoringLanguage = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'uz' ? 'uz' : 'ru';
};

const MONITORING_TEXTS = {
  ru: {
    reason_manual: '📊 <b>Статистика сервера (по запросу)</b>',
    reason_scheduled: '⏱ <b>Периодический отчёт сервера</b>',
    reason_startup: '🚀 <b>Сервер запущен / обновлён</b>',
    ts: 'Время',
    env: 'Окружение',
    node: 'Node.js',
    pid: 'PID',
    uptime: 'Uptime',
    os_uptime: 'Uptime (OS)',
    cpu: 'CPU',
    cpu_model: 'Модель',
    cpu_cores: 'Ядра',
    cpu_load: 'Load avg (1/5/15)',
    memory: 'Память',
    memory_total: 'RAM всего',
    memory_used: 'RAM занято',
    memory_free: 'RAM свободно',
    process_memory: 'Память процесса',
    storage: 'Диск',
    storage_path: 'Путь',
    storage_total: 'Всего',
    storage_used: 'Занято',
    storage_free: 'Свободно',
    db_status_ok: 'БД: доступна',
    db_status_fail: 'БД: ошибка',
    railway: 'Railway',
    railway_deploy: 'Deployment',
    railway_commit: 'Commit',
    railway_project: 'Project',
    railway_service: 'Service',
    railway_env: 'Environment',
    railway_replica: 'Replica',
    railway_projects: 'Railway проекты (API)',
    railway_projects_not_configured: 'Проекты для мониторинга не настроены',
    railway_projects_token_missing: 'Не задан RAILWAY_API_TOKEN / SUPERADMIN_RAILWAY_API_TOKEN',
    railway_projects_fetch_failed: 'Ошибка запроса',
    railway_project_current: 'Current usage',
    railway_project_estimated: 'Estimated usage',
    railway_project_cpu: 'CPU usage',
    railway_project_memory: 'Memory usage',
    railway_project_network: 'Network usage',
    railway_project_volume: 'Volume usage',
    railway_project_backup: 'Backup usage',
    lifecycle_signal: '⚠️ <b>Сервер получил сигнал остановки</b>',
    lifecycle_unhandled: '⚠️ <b>Unhandled rejection в процессе</b>',
    lifecycle_exception: '🛑 <b>Uncaught exception в процессе</b>',
    details: 'Детали'
  },
  uz: {
    reason_manual: '📊 <b>Server statistikasi (so‘rov bo‘yicha)</b>',
    reason_scheduled: '⏱ <b>Server davriy hisoboti</b>',
    reason_startup: '🚀 <b>Server ishga tushdi / yangilandi</b>',
    ts: 'Vaqt',
    env: 'Muhit',
    node: 'Node.js',
    pid: 'PID',
    uptime: 'Uptime',
    os_uptime: 'OS uptime',
    cpu: 'CPU',
    cpu_model: 'Model',
    cpu_cores: 'Yadrolar',
    cpu_load: 'Load avg (1/5/15)',
    memory: 'Xotira',
    memory_total: 'RAM jami',
    memory_used: 'RAM band',
    memory_free: 'RAM bo‘sh',
    process_memory: 'Process xotirasi',
    storage: 'Disk',
    storage_path: 'Yo‘l',
    storage_total: 'Jami',
    storage_used: 'Band',
    storage_free: 'Bo‘sh',
    db_status_ok: 'DB: ishlayapti',
    db_status_fail: 'DB: xatolik',
    railway: 'Railway',
    railway_deploy: 'Deployment',
    railway_commit: 'Commit',
    railway_project: 'Project',
    railway_service: 'Service',
    railway_env: 'Environment',
    railway_replica: 'Replica',
    railway_projects: 'Railway loyihalari (API)',
    railway_projects_not_configured: 'Monitoring uchun loyihalar sozlanmagan',
    railway_projects_token_missing: 'RAILWAY_API_TOKEN / SUPERADMIN_RAILWAY_API_TOKEN kiritilmagan',
    railway_projects_fetch_failed: "So'rov xatosi",
    railway_project_current: 'Current usage',
    railway_project_estimated: 'Estimated usage',
    railway_project_cpu: 'CPU usage',
    railway_project_memory: 'Memory usage',
    railway_project_network: 'Network usage',
    railway_project_volume: 'Volume usage',
    railway_project_backup: 'Backup usage',
    lifecycle_signal: '⚠️ <b>Server to‘xtash signalini oldi</b>',
    lifecycle_unhandled: '⚠️ <b>Jarayonda unhandled rejection</b>',
    lifecycle_exception: '🛑 <b>Jarayonda uncaught exception</b>',
    details: 'Tafsilotlar'
  }
};

const t = (lang, key) => {
  const language = normalizeMonitoringLanguage(lang);
  return MONITORING_TEXTS[language]?.[key] || MONITORING_TEXTS.ru[key] || key;
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatBytes = (value) => {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = bytes;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  const digits = current >= 100 ? 0 : current >= 10 ? 1 : 2;
  return `${current.toFixed(digits)} ${units[index]}`;
};

const formatDuration = (secondsValue) => {
  const totalSeconds = Math.max(0, Math.floor(Number(secondsValue || 0)));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || parts.length > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
};

const formatDateTime = (date, lang = 'ru') => {
  const language = normalizeMonitoringLanguage(lang);
  try {
    return new Intl.DateTimeFormat(language === 'uz' ? 'uz-UZ' : 'ru-RU', {
      timeZone: BOT_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  } catch (_) {
    return date.toISOString();
  }
};

const formatPercent = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '0%';
  return `${numeric.toFixed(1)}%`;
};

const formatLoadArray = (value, cpuCores) => {
  const source = Array.isArray(value) ? value : [0, 0, 0];
  const cores = Number(cpuCores || 0) > 0 ? Number(cpuCores) : 1;
  const avg = source.map((item) => Number(item || 0));
  const absolute = avg.map((item) => item.toFixed(2)).join(' / ');
  const normalized = avg.map((item) => formatPercent((item / cores) * 100)).join(' / ');
  return `${absolute} (${normalized})`;
};

const getRailwayMetadata = () => ({
  deploymentId: String(process.env.RAILWAY_DEPLOYMENT_ID || '').trim() || null,
  commitSha: String(process.env.RAILWAY_GIT_COMMIT_SHA || process.env.SOURCE_VERSION || '').trim() || null,
  projectId: String(process.env.RAILWAY_PROJECT_ID || '').trim() || null,
  serviceId: String(process.env.RAILWAY_SERVICE_ID || '').trim() || null,
  environmentId: String(process.env.RAILWAY_ENVIRONMENT_ID || '').trim() || null,
  replicaId: String(process.env.RAILWAY_REPLICA_ID || '').trim() || null
});

const normalizeRailwayTokenValue = (value) => {
  const token = String(value || '').trim();
  return token || null;
};

const formatUsd = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '$0.00';
  return `$${numeric.toFixed(2)}`;
};

const normalizeRailwayProjectId = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/[a-z0-9-]{16,}/i);
  if (!match) return null;
  return String(match[0] || '').trim().toLowerCase() || null;
};

const parseRailwayProjectsSpec = (rawSpec) => {
  const source = String(rawSpec || '');
  const chunks = source
    .replace(/\r/g, '\n')
    .split(/[\n;,]+/)
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  const seen = new Set();
  const parsed = [];

  for (const chunk of chunks) {
    const cleaned = chunk.replace(/^[\-*•\s]+/, '').trim();
    if (!cleaned) continue;

    let name = '';
    let projectId = null;

    const withLabel = cleaned.match(/^(.+?)\s*[|:=]\s*(.+)$/);
    if (withLabel) {
      name = String(withLabel[1] || '').trim();
      projectId = normalizeRailwayProjectId(withLabel[2]);
    } else {
      projectId = normalizeRailwayProjectId(cleaned);
    }

    if (!projectId || seen.has(projectId)) continue;
    seen.add(projectId);
    parsed.push({
      id: projectId,
      name: name || projectId
    });
  }

  return parsed;
};

const fetchConfiguredRailwayProjectsSpec = async () => {
  let dbSpec = '';
  try {
    const result = await pool.query(`
      SELECT BTRIM(COALESCE(server_railway_projects, '')) AS server_railway_projects
      FROM billing_settings
      WHERE id = 1
      LIMIT 1
    `);
    dbSpec = String(result.rows?.[0]?.server_railway_projects || '').trim();
  } catch (error) {
    console.warn('Fetch railway projects spec warning:', error?.message || error);
  }

  const preferredSpec = dbSpec || DEFAULT_RAILWAY_PROJECTS_SPEC;
  const parsed = parseRailwayProjectsSpec(preferredSpec);
  if (parsed.length > 0) return parsed;

  const currentProjectId = normalizeRailwayProjectId(process.env.RAILWAY_PROJECT_ID);
  if (!currentProjectId) return [];
  return [{ id: currentProjectId, name: 'Current project' }];
};

const RAILWAY_PROJECT_USAGE_QUERY = `
query SuperadminProjectUsage($projectId: String!, $measurements: [MetricMeasurement!]!) {
  project(id: $projectId) {
    id
    name
  }
  usage(projectId: $projectId, measurements: $measurements) {
    measurement
    value
  }
  estimatedUsage(projectId: $projectId, measurements: $measurements) {
    measurement
    estimatedValue
  }
}
`;

const callRailwayGraphql = async ({ query, variables = {}, token }) => {
  const resolvedToken = normalizeRailwayTokenValue(token);
  if (!resolvedToken) {
    const error = new Error('RAILWAY_TOKEN_REQUIRED');
    error.code = 'RAILWAY_TOKEN_REQUIRED';
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(RAILWAY_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolvedToken}`
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP_${response.status}${text ? `: ${text.slice(0, 180)}` : ''}`);
    }

    const payload = await response.json();
    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      const firstError = payload.errors[0] || {};
      const firstCode = String(firstError?.extensions?.code || '').trim();
      const firstMessage = String(firstError?.message || 'GraphQL error').trim();
      throw new Error(firstCode ? `${firstCode}: ${firstMessage}` : firstMessage);
    }

    return payload?.data || {};
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeUsageValue = (value) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const fetchRailwayProjectUsageSnapshot = async ({ id, name }, token) => {
  const data = await callRailwayGraphql({
    token,
    query: RAILWAY_PROJECT_USAGE_QUERY,
    variables: {
      projectId: id,
      measurements: RAILWAY_USAGE_MEASUREMENTS
    }
  });

  const usageMap = {};
  for (const row of Array.isArray(data?.usage) ? data.usage : []) {
    const key = String(row?.measurement || '').trim();
    if (!key) continue;
    usageMap[key] = normalizeUsageValue(row?.value);
  }

  const estimatedMap = {};
  for (const row of Array.isArray(data?.estimatedUsage) ? data.estimatedUsage : []) {
    const key = String(row?.measurement || '').trim();
    if (!key) continue;
    estimatedMap[key] = normalizeUsageValue(row?.estimatedValue);
  }

  const cpuUsage = usageMap.CPU_USAGE || 0;
  const memoryUsage = usageMap.MEMORY_USAGE_GB || 0;
  const networkUsage = usageMap.NETWORK_TX_GB || 0;
  const volumeUsage = usageMap.DISK_USAGE_GB || 0;
  const backupUsage = usageMap.BACKUP_USAGE_GB || 0;

  const estimatedCpuUsage = estimatedMap.CPU_USAGE || 0;
  const estimatedMemoryUsage = estimatedMap.MEMORY_USAGE_GB || 0;
  const estimatedNetworkUsage = estimatedMap.NETWORK_TX_GB || 0;
  const estimatedVolumeUsage = estimatedMap.DISK_USAGE_GB || 0;
  const estimatedBackupUsage = estimatedMap.BACKUP_USAGE_GB || 0;

  return {
    id,
    name: String(data?.project?.name || name || id).trim() || id,
    currentUsageTotal: cpuUsage + memoryUsage + networkUsage + volumeUsage + backupUsage,
    estimatedUsageTotal: estimatedCpuUsage + estimatedMemoryUsage + estimatedNetworkUsage + estimatedVolumeUsage + estimatedBackupUsage,
    usage: {
      cpu: cpuUsage,
      memory: memoryUsage,
      network: networkUsage,
      volume: volumeUsage,
      backup: backupUsage
    }
  };
};

const fetchRailwayProjectsUsageSummaries = async () => {
  const configuredProjects = await fetchConfiguredRailwayProjectsSpec();
  if (!configuredProjects.length) {
    return { items: [], tokenMissing: false };
  }

  const railwayToken = normalizeRailwayTokenValue(
    process.env.SUPERADMIN_RAILWAY_API_TOKEN
      || process.env.RAILWAY_API_TOKEN
      || process.env.RAILWAY_TOKEN
  );

  if (!railwayToken) {
    return {
      items: configuredProjects.map((project) => ({
        ...project,
        errorCode: 'TOKEN_MISSING',
        errorMessage: 'RAILWAY_TOKEN_REQUIRED'
      })),
      tokenMissing: true
    };
  }

  const items = await Promise.all(configuredProjects.map(async (project) => {
    try {
      return await fetchRailwayProjectUsageSnapshot(project, railwayToken);
    } catch (error) {
      return {
        ...project,
        errorCode: 'REQUEST_FAILED',
        errorMessage: String(error?.message || 'request_failed').slice(0, 220)
      };
    }
  }));

  return { items, tokenMissing: false };
};

const getCpuSnapshot = () => {
  const cpuInfo = os.cpus() || [];
  return {
    cores: cpuInfo.length || 0,
    model: String(cpuInfo[0]?.model || '').trim() || null,
    loadAvg: os.loadavg()
  };
};

const getMemorySnapshot = () => {
  const total = os.totalmem();
  const free = os.freemem();
  const used = Math.max(0, total - free);
  const processMemory = process.memoryUsage();
  return {
    total,
    free,
    used,
    usedPercent: total > 0 ? (used / total) * 100 : 0,
    process: {
      rss: Number(processMemory.rss || 0),
      heapTotal: Number(processMemory.heapTotal || 0),
      heapUsed: Number(processMemory.heapUsed || 0),
      external: Number(processMemory.external || 0)
    }
  };
};

const getDiskSnapshot = () => {
  if (typeof fs.statfsSync !== 'function') {
    return null;
  }

  try {
    const stats = fs.statfsSync(DISK_STATS_PATH);
    const blockSize = Number(stats?.bsize || 0);
    const totalBlocks = Number(stats?.blocks || 0);
    const freeBlocks = Number(stats?.bavail || stats?.bfree || 0);
    const total = blockSize > 0 ? blockSize * totalBlocks : 0;
    const free = blockSize > 0 ? blockSize * freeBlocks : 0;
    const used = Math.max(0, total - free);
    return {
      path: DISK_STATS_PATH,
      total,
      free,
      used,
      usedPercent: total > 0 ? (used / total) * 100 : 0
    };
  } catch (_) {
    return null;
  }
};

const fetchDatabaseHealth = async () => {
  try {
    const result = await pool.query('SELECT NOW() as now');
    return {
      ok: true,
      dbTime: result.rows?.[0]?.now || null,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      dbTime: null,
      error: error?.message || 'db_error'
    };
  }
};

const fetchServerStatsGroupChatId = async () => {
  try {
    const result = await pool.query(`
      SELECT BTRIM(COALESCE(server_group_chat_id, '')) AS server_group_chat_id
      FROM billing_settings
      WHERE id = 1
      LIMIT 1
    `);
    const chatId = String(result.rows?.[0]?.server_group_chat_id || '').trim();
    return chatId || null;
  } catch (error) {
    console.warn('Fetch server stats group chat id warning:', error?.message || error);
    return null;
  }
};

const normalizeStatsInterval = (value, fallback = DEFAULT_STATS_INTERVAL_MS) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  const ranged = Math.min(MAX_STATS_INTERVAL_MS, Math.max(MIN_STATS_INTERVAL_MS, parsed));
  if (SERVER_STATS_ALLOWED_INTERVALS_MS.has(ranged)) return ranged;
  return fallback;
};

const fetchConfiguredStatsIntervalMs = async () => {
  try {
    const result = await pool.query(`
      SELECT server_stats_interval_ms
      FROM billing_settings
      WHERE id = 1
      LIMIT 1
    `);
    const configured = normalizeStatsInterval(result.rows?.[0]?.server_stats_interval_ms, null);
    if (configured) return configured;
  } catch (error) {
    console.warn('Fetch server stats interval warning:', error?.message || error);
  }
  const fallbackValue = process.env.SUPERADMIN_SERVER_STATS_INTERVAL_FALLBACK_MS || process.env.SUPERADMIN_SERVER_STATS_INTERVAL_MS;
  return normalizeStatsInterval(fallbackValue, DEFAULT_STATS_INTERVAL_MS);
};

const fetchSuperadminTelegramIds = async () => {
  const envIds = Array.from(SUPERADMIN_EXTRA_TELEGRAM_IDS);
  const groupChatId = await fetchServerStatsGroupChatId();

  if (groupChatId) {
    return [groupChatId];
  }

  try {
    const result = await pool.query(`
      WITH candidates AS (
        SELECT DISTINCT COALESCE(tal.telegram_id, u.telegram_id) AS telegram_id
        FROM users u
        LEFT JOIN telegram_admin_links tal ON tal.user_id = u.id
        WHERE u.role = 'superadmin'
          AND u.is_active = true
          AND COALESCE(tal.telegram_id, u.telegram_id) IS NOT NULL

        UNION

        SELECT BTRIM(COALESCE(bs.superadmin_telegram_id, '')) AS telegram_id
        FROM billing_settings bs
        WHERE bs.id = 1
          AND BTRIM(COALESCE(bs.superadmin_telegram_id, '')) <> ''
      )
      SELECT DISTINCT BTRIM(COALESCE(telegram_id, '')) AS telegram_id
      FROM candidates
      WHERE BTRIM(COALESCE(telegram_id, '')) <> ''
      ORDER BY 1
    `);

    return Array.from(new Set([
      ...envIds,
      ...(result.rows || []).map((row) => String(row.telegram_id || '').trim()).filter(Boolean)
    ]));
  } catch (error) {
    console.warn('Fetch superadmin telegram ids warning:', error?.message || error);
    return envIds;
  }
};

const buildReasonTitle = (lang, reason) => {
  if (reason === 'scheduled') return t(lang, 'reason_scheduled');
  if (reason === 'startup') return t(lang, 'reason_startup');
  return t(lang, 'reason_manual');
};

const buildServerStatsMessage = async ({ reason = 'manual', lang = 'ru' } = {}) => {
  const language = normalizeMonitoringLanguage(lang);
  const now = new Date();
  const cpu = getCpuSnapshot();
  const memory = getMemorySnapshot();
  const disk = getDiskSnapshot();
  const railway = getRailwayMetadata();
  const railwayProjectsSummary = await fetchRailwayProjectsUsageSummaries();
  const db = await fetchDatabaseHealth();
  const uptimeText = formatDuration(process.uptime());
  const osUptimeText = formatDuration(os.uptime());
  const processMemory = memory.process;
  const processHeapPercent = processMemory.heapTotal > 0
    ? (processMemory.heapUsed / processMemory.heapTotal) * 100
    : 0;

  const lines = [
    buildReasonTitle(language, reason),
    '',
    `🕒 ${t(language, 'ts')}: <b>${escapeHtml(formatDateTime(now, language))}</b>`,
    `🌍 ${t(language, 'env')}: <b>${escapeHtml(process.env.NODE_ENV || 'development')}</b>`,
    `🧩 ${t(language, 'node')}: <b>${escapeHtml(process.version)}</b>`,
    `🆔 ${t(language, 'pid')}: <b>${process.pid}</b>`,
    `⏳ ${t(language, 'uptime')}: <b>${escapeHtml(uptimeText)}</b>`,
    `🕰 ${t(language, 'os_uptime')}: <b>${escapeHtml(osUptimeText)}</b>`,
    '',
    `🖥 <b>${t(language, 'cpu')}</b>`,
    `• ${t(language, 'cpu_model')}: ${escapeHtml(cpu.model || '—')}`,
    `• ${t(language, 'cpu_cores')}: <b>${cpu.cores}</b>`,
    `• ${t(language, 'cpu_load')}: <b>${escapeHtml(formatLoadArray(cpu.loadAvg, cpu.cores))}</b>`,
    '',
    `🧠 <b>${t(language, 'memory')}</b>`,
    `• ${t(language, 'memory_total')}: <b>${escapeHtml(formatBytes(memory.total))}</b>`,
    `• ${t(language, 'memory_used')}: <b>${escapeHtml(formatBytes(memory.used))}</b> (${formatPercent(memory.usedPercent)})`,
    `• ${t(language, 'memory_free')}: <b>${escapeHtml(formatBytes(memory.free))}</b>`,
    `• ${t(language, 'process_memory')}: RSS <b>${escapeHtml(formatBytes(processMemory.rss))}</b>, Heap <b>${escapeHtml(formatBytes(processMemory.heapUsed))}</b> / ${escapeHtml(formatBytes(processMemory.heapTotal))} (${formatPercent(processHeapPercent)}), External <b>${escapeHtml(formatBytes(processMemory.external))}</b>`,
    '',
    ...(disk ? [
      `💽 <b>${t(language, 'storage')}</b>`,
      `• ${t(language, 'storage_path')}: <code>${escapeHtml(disk.path || DISK_STATS_PATH)}</code>`,
      `• ${t(language, 'storage_total')}: <b>${escapeHtml(formatBytes(disk.total))}</b>`,
      `• ${t(language, 'storage_used')}: <b>${escapeHtml(formatBytes(disk.used))}</b> (${formatPercent(disk.usedPercent)})`,
      `• ${t(language, 'storage_free')}: <b>${escapeHtml(formatBytes(disk.free))}</b>`,
      ''
    ] : []),
    db.ok
      ? `✅ <b>${t(language, 'db_status_ok')}</b>${db.dbTime ? ` (${escapeHtml(formatDateTime(new Date(db.dbTime), language))})` : ''}`
      : `❌ <b>${t(language, 'db_status_fail')}</b>: ${escapeHtml(db.error || 'unknown')}`,
    '',
    `🚄 <b>${t(language, 'railway')}</b>`,
    `• ${t(language, 'railway_deploy')}: <code>${escapeHtml(railway.deploymentId || '—')}</code>`,
    `• ${t(language, 'railway_commit')}: <code>${escapeHtml(railway.commitSha || '—')}</code>`,
    `• ${t(language, 'railway_project')}: <code>${escapeHtml(railway.projectId || '—')}</code>`,
    `• ${t(language, 'railway_service')}: <code>${escapeHtml(railway.serviceId || '—')}</code>`,
    `• ${t(language, 'railway_env')}: <code>${escapeHtml(railway.environmentId || '—')}</code>`,
    `• ${t(language, 'railway_replica')}: <code>${escapeHtml(railway.replicaId || '—')}</code>`
  ];

  if (railwayProjectsSummary.items.length > 0) {
    lines.push('');
    lines.push(`📦 <b>${t(language, 'railway_projects')}</b>`);
    for (const item of railwayProjectsSummary.items) {
      lines.push(`• <b>${escapeHtml(item.name || item.id || 'Project')}</b> (<code>${escapeHtml(item.id || '—')}</code>)`);

      if (item.errorCode === 'TOKEN_MISSING') {
        lines.push(`  ${t(language, 'railway_projects_token_missing')}`);
        continue;
      }

      if (item.errorMessage) {
        lines.push(`  ${t(language, 'railway_projects_fetch_failed')}: <code>${escapeHtml(item.errorMessage)}</code>`);
        continue;
      }

      lines.push(`  ${t(language, 'railway_project_current')}: <b>${escapeHtml(formatUsd(item.currentUsageTotal))}</b>`);
      lines.push(`  ${t(language, 'railway_project_estimated')}: <b>${escapeHtml(formatUsd(item.estimatedUsageTotal))}</b>`);
      lines.push(`  ${t(language, 'railway_project_cpu')}: <b>${escapeHtml(formatUsd(item.usage?.cpu || 0))}</b>`);
      lines.push(`  ${t(language, 'railway_project_memory')}: <b>${escapeHtml(formatUsd(item.usage?.memory || 0))}</b>`);
      lines.push(`  ${t(language, 'railway_project_network')}: <b>${escapeHtml(formatUsd(item.usage?.network || 0))}</b>`);
      lines.push(`  ${t(language, 'railway_project_volume')}: <b>${escapeHtml(formatUsd(item.usage?.volume || 0))}</b>`);
      lines.push(`  ${t(language, 'railway_project_backup')}: <b>${escapeHtml(formatUsd(item.usage?.backup || 0))}</b>`);
    }
  } else {
    lines.push('');
    lines.push(`📦 <b>${t(language, 'railway_projects')}</b>`);
    lines.push(`• ${t(language, 'railway_projects_not_configured')}`);
  }

  return lines.join('\n');
};

const sendServerStatsToChat = async (bot, chatId, { reason = 'manual', lang = 'ru' } = {}) => {
  if (!bot || !chatId) return { ok: false, error: 'bot_or_chat_missing' };
  const message = await buildServerStatsMessage({ reason, lang });
  await bot.sendMessage(String(chatId), message, {
    parse_mode: 'HTML',
    disable_web_page_preview: true
  });
  return { ok: true };
};

const sendServerStatsToSuperadmins = async (bot, { reason = 'scheduled', lang = 'ru' } = {}) => {
  if (!bot) return { ok: false, total: 0, sent: 0, failed: 0, error: 'bot_missing' };
  const recipients = await fetchSuperadminTelegramIds();
  if (!recipients.length) return { ok: true, total: 0, sent: 0, failed: 0 };

  const message = await buildServerStatsMessage({ reason, lang });
  let sent = 0;
  let failed = 0;
  for (const telegramId of recipients) {
    try {
      await bot.sendMessage(telegramId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
      sent += 1;
    } catch (_) {
      failed += 1;
    }
  }
  return {
    ok: failed === 0,
    total: recipients.length,
    sent,
    failed
  };
};

const buildLifecycleMessage = ({ type, details = '', lang = 'ru' } = {}) => {
  const language = normalizeMonitoringLanguage(lang);
  const title = type === 'signal'
    ? t(language, 'lifecycle_signal')
    : type === 'exception'
      ? t(language, 'lifecycle_exception')
      : t(language, 'lifecycle_unhandled');

  const lines = [
    title,
    `🕒 ${t(language, 'ts')}: <b>${escapeHtml(formatDateTime(new Date(), language))}</b>`,
    `🆔 ${t(language, 'pid')}: <b>${process.pid}</b>`
  ];
  const trimmedDetails = String(details || '').trim();
  if (trimmedDetails) {
    lines.push(`${t(language, 'details')}: <code>${escapeHtml(trimmedDetails.slice(0, 1200))}</code>`);
  }
  return lines.join('\n');
};

const sendLifecycleAlertToSuperadmins = async (bot, { type = 'signal', details = '', lang = 'ru', throttleKey = '' } = {}) => {
  if (!bot) return;
  const key = String(throttleKey || type || 'alert');
  const now = Date.now();
  const lastAt = Number(alertTimestamps.get(key) || 0);
  if (now - lastAt < ALERT_THROTTLE_MS) {
    return;
  }
  alertTimestamps.set(key, now);

  const recipients = await fetchSuperadminTelegramIds();
  if (!recipients.length) return;

  const message = buildLifecycleMessage({ type, details, lang });
  for (const telegramId of recipients) {
    try {
      await bot.sendMessage(telegramId, message, { parse_mode: 'HTML' });
    } catch (_) { }
  }
};

const clearMonitoringTimer = () => {
  if (statsTimer) {
    clearInterval(statsTimer);
    statsTimer = null;
  }
};

const restartMonitoringTimer = async ({ sendStartupReport = false } = {}) => {
  if (!activeMonitoringBot) return false;
  const intervalMs = await fetchConfiguredStatsIntervalMs();
  activeMonitoringIntervalMs = normalizeStatsInterval(intervalMs, DEFAULT_STATS_INTERVAL_MS);

  clearMonitoringTimer();

  const runner = () => {
    if (!activeMonitoringBot) return;
    sendServerStatsToSuperadmins(activeMonitoringBot, { reason: 'scheduled', lang: activeMonitoringLang }).catch((error) => {
      console.error('Scheduled server stats notify warning:', error?.message || error);
    });
  };

  statsTimer = setInterval(runner, activeMonitoringIntervalMs);
  console.log(`⏱ Superadmin server monitoring started (interval: ${activeMonitoringIntervalMs} ms)`);

  if (sendStartupReport) {
    sendServerStatsToSuperadmins(activeMonitoringBot, { reason: 'startup', lang: activeMonitoringLang }).catch((error) => {
      console.error('Startup server stats notify warning:', error?.message || error);
    });
  }

  return true;
};

const initSuperadminServerMonitoring = ({ bot, lang = 'ru' } = {}) => {
  if (!bot) {
    console.warn('⚠️ Superadmin server monitoring skipped: Telegram bot is not initialized');
    return;
  }

  activeMonitoringBot = bot;
  activeMonitoringLang = normalizeMonitoringLanguage(lang);

  if (statsTimer) {
    console.log('ℹ️ Superadmin server monitoring bot instance updated');
  } else {
    const sendStartupReport = String(process.env.SUPERADMIN_SERVER_STATS_SEND_STARTUP || '1').trim() !== '0';
    restartMonitoringTimer({ sendStartupReport }).catch((error) => {
      console.error('Server monitoring start warning:', error?.message || error);
    });
  }

  if (!hooksRegistered) {
    hooksRegistered = true;
    process.on('SIGTERM', () => {
      sendLifecycleAlertToSuperadmins(activeMonitoringBot, {
        type: 'signal',
        details: 'SIGTERM',
        lang: activeMonitoringLang,
        throttleKey: 'signal_sigterm'
      }).catch(() => { });
    });
    process.on('SIGINT', () => {
      sendLifecycleAlertToSuperadmins(activeMonitoringBot, {
        type: 'signal',
        details: 'SIGINT',
        lang: activeMonitoringLang,
        throttleKey: 'signal_sigint'
      }).catch(() => { });
    });
    process.on('unhandledRejection', (reason) => {
      const details = reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : String(reason || 'unknown');
      sendLifecycleAlertToSuperadmins(activeMonitoringBot, {
        type: 'unhandled',
        details,
        lang: activeMonitoringLang,
        throttleKey: 'unhandled_rejection'
      }).catch(() => { });
    });
    process.on('uncaughtExceptionMonitor', (error, origin) => {
      const details = `${origin || 'unknown'}: ${error?.name || 'Error'}: ${error?.message || 'unknown'}`;
      sendLifecycleAlertToSuperadmins(activeMonitoringBot, {
        type: 'exception',
        details,
        lang: activeMonitoringLang,
        throttleKey: 'uncaught_exception'
      }).catch(() => { });
    });
  }
};

const refreshSuperadminServerMonitoringSchedule = async () => {
  if (!activeMonitoringBot) return false;
  return restartMonitoringTimer({ sendStartupReport: false });
};

module.exports = {
  buildServerStatsMessage,
  sendServerStatsToChat,
  sendServerStatsToSuperadmins,
  fetchServerStatsGroupChatId,
  fetchConfiguredStatsIntervalMs,
  normalizeStatsInterval,
  refreshSuperadminServerMonitoringSchedule,
  initSuperadminServerMonitoring
};
