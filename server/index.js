require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const reservationRoutes = require('./routes/reservations');
const adminRoutes = require('./routes/admin');
const adminReservationRoutes = require('./routes/adminReservations');
const superadminRoutes = require('./routes/superadmin');
const uploadRoutes = require('./routes/upload');
const deliveryRoutes = require('./routes/delivery');
const addressRoutes = require('./routes/addresses');
const paymeRoutes = require('./routes/payme');
const { initBot, getBot } = require('./bot/bot');
const { initMultiBots, processWebhook, getAllBots } = require('./bot/multiBotManager');
const { initBroadcastWorker } = require('./services/broadcastWorker');
const { initStoreCloseReportWorker } = require('./services/storeCloseReportWorker');
const { initScheduledDeliveryReminderWorker } = require('./services/scheduledDeliveryReminderWorker');
const { initSuperadminServerMonitoring } = require('./services/superadminServerMonitoring');
const { logSecurityEvent } = require('./services/securityEvents');

const http = require('http');
const printerManager = require('./services/printerManager');

const app = express();
const httpServer = http.createServer(app);

// Initialize PrinterManager with httpServer
printerManager.init(httpServer);

app.set('trust proxy', 1);
// Railway автоматически устанавливает PORT, используем его
const PORT = process.env.PORT || 3000;
const APP_BUILD_VERSION = process.env.RAILWAY_DEPLOYMENT_ID
  || process.env.RAILWAY_GIT_COMMIT_SHA
  || process.env.SOURCE_VERSION
  || `local-${Date.now()}`;
const APP_BUILD_TIMESTAMP = new Date().toISOString();
const applyNoStoreHeaders = (res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
};

// Логируем какой порт используется
console.log(`📌 PORT from environment: ${process.env.PORT || 'not set, using default 3000'}`);

const LOG_REDACTED_VALUE = '[REDACTED]';
const SENSITIVE_QUERY_KEYS = new Set(['token', 'access_token', 'authorization', 'auth']);
const LOCAL_DEV_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5173'
];
const normalizeOriginValue = (rawOrigin) => {
  const raw = String(rawOrigin || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch (_) {
    return '';
  }
};
const buildAllowedOrigins = () => {
  const rawOrigins = [
    process.env.FRONTEND_URL,
    process.env.TELEGRAM_WEB_APP_URL,
    process.env.BACKEND_URL
  ];
  const extraOrigins = String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV !== 'production') {
    rawOrigins.push(...LOCAL_DEV_ALLOWED_ORIGINS);
  }

  const set = new Set();
  for (const candidate of [...rawOrigins, ...extraOrigins]) {
    const normalized = normalizeOriginValue(candidate);
    if (normalized) set.add(normalized);
  }
  return set;
};
const allowedCorsOrigins = buildAllowedOrigins();
const sanitizeUrlForLogs = (rawUrl) => {
  const value = String(rawUrl || '');
  if (!value.includes('?')) return value;
  const [pathname, query = ''] = value.split('?');
  const params = new URLSearchParams(query);
  let hasMaskedParams = false;

  for (const key of SENSITIVE_QUERY_KEYS) {
    if (params.has(key)) {
      params.set(key, LOG_REDACTED_VALUE);
      hasMaskedParams = true;
    }
  }

  if (!hasMaskedParams) return value;
  const normalizedQuery = params.toString();
  return normalizedQuery ? `${pathname}?${normalizedQuery}` : pathname;
};

const getRequestIp = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').trim();
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
};

const detectApiProbeRisk = (pathValue) => {
  const normalized = String(pathValue || '').toLowerCase();
  if (!normalized) return 'low';
  const highSignals = [
    '.env',
    'phpmyadmin',
    'wp-admin',
    'wp-login',
    'adminer',
    'etc/passwd',
    '/boaform',
    '/cgi-bin'
  ];
  if (highSignals.some((signal) => normalized.includes(signal))) return 'high';
  const mediumSignals = ['select%20', 'union%20', 'or%201=1', 'script', '../', '%2e%2e'];
  if (mediumSignals.some((signal) => normalized.includes(signal))) return 'medium';
  return 'low';
};

const trackSecurityEvent = (req, payload = {}) => {
  logSecurityEvent({
    sourceIp: getRequestIp(req),
    userAgent: req.headers['user-agent'] || '',
    requestMethod: req.method,
    requestPath: sanitizeUrlForLogs(req.originalUrl || req.url || ''),
    ...payload
  }).catch(() => {});
};

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов webhook' },
  handler: (req, res, _next, options) => {
    console.warn('⚠️ Webhook rate limit exceeded', {
      ip: req.ip,
      path: req.originalUrl || req.url || '',
      request_id: req.requestId || null
    });
    trackSecurityEvent(req, {
      eventType: 'webhook_rate_limit',
      riskLevel: 'high',
      target: 'telegram_webhook',
      statusCode: options.statusCode,
      details: {
        reason: 'Webhook rate limit exceeded'
      }
    });
    res.status(options.statusCode).json(options.message);
  }
});

const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';
const isTelegramWebhookSecretValid = (req) => {
  const expectedSecret = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (!expectedSecret) return true;
  const providedSecret = String(req.headers[TELEGRAM_SECRET_HEADER] || '').trim();
  return Boolean(providedSecret) && providedSecret === expectedSecret;
};
const cspModeRaw = String(process.env.CSP_MODE || '').trim().toLowerCase();
const legacyCspReportOnlyFlag = String(process.env.CSP_REPORT_ONLY || '').trim().toLowerCase();
const cspMode = (() => {
  if (['off', 'report-only', 'enforce'].includes(cspModeRaw)) return cspModeRaw;
  if (legacyCspReportOnlyFlag === 'true') return 'report-only';
  if (legacyCspReportOnlyFlag === 'false') return 'enforce';
  return 'enforce';
})();
const cspReportOnlyValue = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org https://*.telegram.org https://api-maps.yandex.ru https://*.yandex.ru https://yastatic.net https://*.yastatic.net https://maps.googleapis.com https://maps.gstatic.com",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: wss:",
  "media-src 'self' blob: data: https:",
  "frame-src 'self' https://web.telegram.org https://*.telegram.org https://yandex.ru https://*.yandex.ru https://www.google.com https://maps.google.com https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://youtube-nocookie.com"
].join('; ');
const permissionsPolicyValue = [
  'accelerometer=()',
  'autoplay=(self)',
  'camera=(self)',
  'fullscreen=(self)',
  'geolocation=(self "https://web.telegram.org" "https://telegram.org")',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=(self)',
  'payment=(self)',
  'picture-in-picture=(self)',
  'usb=()',
  'browsing-topics=()'
].join(', ');

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for React
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  // Keep referrer available for third-party map tiles (OpenStreetMap requires it).
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
morgan.token('request-id', (req) => req.requestId || '-');
morgan.token('safe-url', (req) => sanitizeUrlForLogs(req.originalUrl || req.url || ''));
app.use((req, res, next) => {
  const incomingRequestId = String(req.headers['x-request-id'] || '').trim();
  req.requestId = incomingRequestId || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});
app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" req_id=:request-id'));
app.use(cors((req, callback) => {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) {
    return callback(null, { origin: true, credentials: true });
  }
  const normalizedOrigin = normalizeOriginValue(origin);
  const isAllowed = allowedCorsOrigins.has(normalizedOrigin);
  if (!isAllowed) {
    console.warn('⚠️ CORS blocked origin', {
      origin: normalizedOrigin || origin,
      path: req.originalUrl || req.url || '',
      request_id: req.requestId || null
    });
    trackSecurityEvent(req, {
      eventType: 'cors_blocked_origin',
      riskLevel: 'medium',
      target: 'cors',
      statusCode: 403,
      details: {
        blocked_origin: normalizedOrigin || origin
      }
    });
  }
  return callback(null, { origin: isAllowed, credentials: true });
}));
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', permissionsPolicyValue);
  next();
});
if (cspMode !== 'off') {
  app.use((req, res, next) => {
    if (cspMode === 'report-only') {
      res.setHeader('Content-Security-Policy-Report-Only', cspReportOnlyValue);
    } else {
      res.setHeader('Content-Security-Policy', cspReportOnlyValue);
    }
    next();
  });
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
const uploadsPath = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '../uploads');
const fs = require('fs');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
console.log('📦 Serving uploads from:', uploadsPath);
app.use('/uploads', express.static(uploadsPath, {
  maxAge: '365d',
  immutable: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Root route for Railway health check
app.get('/', (req, res) => {
  applyNoStoreHeaders(res);
  res.redirect('/login');
});

// App version for client-side update checks (no cache)
app.get('/version.json', (req, res) => {
  applyNoStoreHeaders(res);
  res.json({
    version: APP_BUILD_VERSION,
    built_at: APP_BUILD_TIMESTAMP
  });
});

// Health check (before other routes)
app.get('/api/health', async (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  try {
    const pool = require('./database/connection');
    const dbResult = isProduction
      ? await pool.query('SELECT NOW() as time')
      : await pool.query('SELECT NOW() as time, COUNT(*) as users FROM users');
    const response = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected'
    };
    if (!isProduction) {
      response.db_time = dbResult.rows[0]?.time;
      response.users_count = dbResult.rows[0]?.users;
    }
    res.json(response);
  } catch (error) {
    const response = {
      status: isProduction ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      database: 'error'
    };
    if (!isProduction) {
      response.error = error.message;
    }
    res.json(response);
  }
});

// Telegram webhook route (must be before catch-all routes)
app.post('/api/telegram/webhook', webhookLimiter, express.json(), (req, res) => {
  if (!isTelegramWebhookSecretValid(req)) {
    console.warn('⚠️ Rejected Telegram webhook request: invalid secret', {
      ip: req.ip,
      request_id: req.requestId || null
    });
    trackSecurityEvent(req, {
      eventType: 'webhook_invalid_secret',
      riskLevel: 'high',
      target: 'telegram_webhook',
      statusCode: 401,
      details: {
        reason: 'invalid secret token'
      }
    });
    return res.sendStatus(401);
  }
  const bot = getBot();
  if (bot) {
    bot.processUpdate(req.body);
  }
  res.sendStatus(200);
});

// Telegram webhook route for specific restaurant (multi-bot system)
app.post('/api/telegram/webhook/:restaurantId', webhookLimiter, express.json(), (req, res) => {
  if (!isTelegramWebhookSecretValid(req)) {
    console.warn('⚠️ Rejected Telegram webhook request: invalid secret', {
      ip: req.ip,
      request_id: req.requestId || null
    });
    trackSecurityEvent(req, {
      eventType: 'webhook_invalid_secret',
      riskLevel: 'high',
      target: 'telegram_webhook_restaurant',
      statusCode: 401,
      restaurantId: req.params.restaurantId,
      details: {
        reason: 'invalid secret token'
      }
    });
    return res.sendStatus(401);
  }
  const { restaurantId } = req.params;
  const processed = processWebhook(restaurantId, req.body);
  if (!processed) {
    console.warn(`⚠️ No bot found for restaurant ID: ${restaurantId}`);
    trackSecurityEvent(req, {
      eventType: 'webhook_unknown_restaurant',
      riskLevel: 'medium',
      target: 'telegram_webhook_restaurant',
      statusCode: 404,
      restaurantId,
      details: {
        reason: 'No bot found for restaurant',
        restaurant_id: restaurantId
      }
    });
  }
  res.sendStatus(200);
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/admin/reservations', adminReservationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/payments/payme', paymeRoutes);

// API 404 trap (useful for scan/attack monitoring)
app.use('/api', (req, res) => {
  const pathValue = req.originalUrl || req.url || '';
  trackSecurityEvent(req, {
    eventType: 'api_probe_404',
    riskLevel: detectApiProbeRisk(pathValue),
    target: 'api',
    statusCode: 404,
    details: {
      reason: 'API endpoint not found'
    }
  });
  res.status(404).json({ error: 'API endpoint not found' });
});

// Serve static files from React app (must be after API routes)
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../client/build');
  const fs = require('fs');

  if (fs.existsSync(buildPath)) {
    app.use(express.static(buildPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          applyNoStoreHeaders(res);
          return;
        }

        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    console.log('✅ Static files served from:', buildPath);

    // Serve React app (catch-all route must be last)
    app.get('*', (req, res) => {
      applyNoStoreHeaders(res);
      res.sendFile(path.join(buildPath, 'index.html'));
    });
  } else {
    console.warn('⚠️  Client build directory not found:', buildPath);
    console.warn('⚠️  Make sure to run: npm run build');
    app.get('*', (req, res) => {
      res.send(`
        <html>
          <body>
            <h1>Application is starting...</h1>
            <p>Client build not found. Please wait for the build to complete.</p>
            <p>If this persists, check the build logs in Railway.</p>
          </body>
        </html>
      `);
    });
  }
}

// Initialize database and start server
async function startServer() {
  // Start server first - listen on 0.0.0.0 for Railway
  httpServer.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Listening on 0.0.0.0:${PORT}`);
    console.log(`🛡️ Security headers: CSP mode = ${cspMode}, Permissions-Policy = enabled`);

    // Always run migrations on Railway (DATABASE_URL is set)
    if (process.env.DATABASE_URL) {
      try {
        console.log('🔄 Running database migrations on startup...');
        const migrate = require('./database/migrate');
        await migrate();
        console.log('✅ Migrations completed');
      } catch (error) {
        console.error('⚠️  Migration error:', error.message);
      }
    } else {
      console.warn('⚠️  DATABASE_URL not set, skipping migrations');
    }

    // Initialize legacy Telegram bot (fallback for old system)
    await initBot();
    initSuperadminServerMonitoring({ bot: getBot() });

    // Initialize multi-bot system for all restaurants
    await initMultiBots();

    // Initialize scheduled broadcast worker
    initBroadcastWorker();

    // Initialize store close report worker
    initStoreCloseReportWorker();

    // Initialize scheduled delivery reminder worker
    initScheduledDeliveryReminderWorker();
  });
}

startServer();

module.exports = app;

