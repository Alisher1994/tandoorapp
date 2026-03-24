const os = require('os');
const fs = require('fs');
const pool = require('../database/connection');

const DEFAULT_STATS_INTERVAL_MS = 30 * 60 * 1000;
const MIN_STATS_INTERVAL_MS = 60 * 1000;
const MAX_STATS_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ALERT_THROTTLE_MS = 5 * 60 * 1000;
const BOT_TIME_ZONE = process.env.BOT_TIMEZONE || process.env.TELEGRAM_TIMEZONE || process.env.TZ || 'Asia/Tashkent';
const DISK_STATS_PATH = String(process.env.SUPERADMIN_SERVER_DISK_PATH || '/').trim() || '/';
const SUPERADMIN_EXTRA_TELEGRAM_IDS = new Set(
  String(process.env.SUPERADMIN_EXTRA_TELEGRAM_IDS || '')
    .split(',')
    .map((value) => String(value || '').trim())
    .filter(Boolean)
);

let statsTimer = null;
let activeMonitoringBot = null;
let activeMonitoringLang = 'ru';
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

const fetchSuperadminTelegramIds = async () => {
  const envIds = Array.from(SUPERADMIN_EXTRA_TELEGRAM_IDS);

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

const normalizeStatsInterval = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_STATS_INTERVAL_MS;
  return Math.min(MAX_STATS_INTERVAL_MS, Math.max(MIN_STATS_INTERVAL_MS, parsed));
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
    return;
  }

  const intervalMs = normalizeStatsInterval(process.env.SUPERADMIN_SERVER_STATS_INTERVAL_MS);
  const sendStartupReport = String(process.env.SUPERADMIN_SERVER_STATS_SEND_STARTUP || '1').trim() !== '0';

  if (sendStartupReport) {
    sendServerStatsToSuperadmins(activeMonitoringBot, { reason: 'startup', lang: activeMonitoringLang }).catch((error) => {
      console.error('Startup server stats notify warning:', error?.message || error);
    });
  }

  const runner = () => {
    if (!activeMonitoringBot) return;
    sendServerStatsToSuperadmins(activeMonitoringBot, { reason: 'scheduled', lang: activeMonitoringLang }).catch((error) => {
      console.error('Scheduled server stats notify warning:', error?.message || error);
    });
  };

  statsTimer = setInterval(runner, intervalMs);
  console.log(`⏱ Superadmin server monitoring started (interval: ${intervalMs} ms)`);

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

module.exports = {
  buildServerStatsMessage,
  sendServerStatsToChat,
  sendServerStatsToSuperadmins,
  initSuperadminServerMonitoring
};
