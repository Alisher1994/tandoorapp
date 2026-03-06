require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const superadminRoutes = require('./routes/superadmin');
const uploadRoutes = require('./routes/upload');
const deliveryRoutes = require('./routes/delivery');
const addressRoutes = require('./routes/addresses');
const { initBot, getBot } = require('./bot/bot');
const { initMultiBots, processWebhook, getAllBots } = require('./bot/multiBotManager');
const { initBroadcastWorker } = require('./services/broadcastWorker');

const app = express();
// Railway автоматически устанавливает PORT, используем его
const PORT = process.env.PORT || 3000;
const APP_BUILD_VERSION = process.env.RAILWAY_DEPLOYMENT_ID
  || process.env.RAILWAY_GIT_COMMIT_SHA
  || process.env.SOURCE_VERSION
  || `local-${Date.now()}`;
const APP_BUILD_TIMESTAMP = new Date().toISOString();

// Логируем какой порт используется
console.log(`📌 PORT from environment: ${process.env.PORT || 'not set, using default 3000'}`);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for React
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
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
  res.redirect('/login');
});

// App version for client-side update checks (no cache)
app.get('/version.json', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.json({
    version: APP_BUILD_VERSION,
    built_at: APP_BUILD_TIMESTAMP
  });
});

// Health check (before other routes)
app.get('/api/health', async (req, res) => {
  try {
    const pool = require('./database/connection');
    const dbResult = await pool.query('SELECT NOW() as time, COUNT(*) as users FROM users');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      db_time: dbResult.rows[0]?.time,
      users_count: dbResult.rows[0]?.users
    });
  } catch (error) {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'error',
      error: error.message
    });
  }
});

// Telegram webhook route (must be before catch-all routes)
app.post('/api/telegram/webhook', express.json(), (req, res) => {
  const bot = getBot();
  if (bot) {
    bot.processUpdate(req.body);
  }
  res.sendStatus(200);
});

// Telegram webhook route for specific restaurant (multi-bot system)
app.post('/api/telegram/webhook/:restaurantId', express.json(), (req, res) => {
  const { restaurantId } = req.params;
  const processed = processWebhook(restaurantId, req.body);
  if (!processed) {
    console.warn(`⚠️ No bot found for restaurant ID: ${restaurantId}`);
  }
  res.sendStatus(200);
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/addresses', addressRoutes);

// Serve static files from React app (must be after API routes)
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../client/build');
  const fs = require('fs');

  if (fs.existsSync(buildPath)) {
    app.use(express.static(buildPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
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
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
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
  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Listening on 0.0.0.0:${PORT}`);

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

    // Initialize multi-bot system for all restaurants
    await initMultiBots();

    // Initialize scheduled broadcast worker
    initBroadcastWorker();
  });
}

startServer();

module.exports = app;

