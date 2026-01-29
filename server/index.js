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
const { initBot, getBot } = require('./bot/bot');
const { initMultiBots, processWebhook, getAllBots } = require('./bot/multiBotManager');

const app = express();
// Railway автоматически устанавливает PORT, используем его
const PORT = process.env.PORT || 3000;

// Логируем какой порт используется
console.log(`📌 PORT from environment: ${process.env.PORT || 'not set, using default 3000'}`);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for React
  crossOriginEmbedderPolicy: false
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
app.use('/uploads', express.static(uploadsPath));

// Root route for Railway health check
app.get('/', (req, res) => {
  res.redirect('/login');
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

// Serve static files from React app (must be after API routes)
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../client/build');
  const fs = require('fs');
  
  if (fs.existsSync(buildPath)) {
    app.use(express.static(buildPath));
    console.log('✅ Static files served from:', buildPath);
    
    // Serve React app (catch-all route must be last)
    app.get('*', (req, res) => {
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
  // Always run migrations on Railway (DATABASE_URL is set)
  if (process.env.DATABASE_URL) {
    try {
      console.log('🔄 Running database migrations on startup...');
      const migrate = require('./database/migrate');
      await migrate();
      console.log('✅ Migrations completed');
    } catch (error) {
      console.error('⚠️  Migration error:', error.message);
      console.error(error);
    }
  } else {
    console.warn('⚠️  DATABASE_URL not set, skipping migrations');
  }

  // Start server first - listen on 0.0.0.0 for Railway
  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Listening on 0.0.0.0:${PORT}`);
    
    // Initialize legacy Telegram bot (fallback for old system)
    initBot();
    
    // Initialize multi-bot system for all restaurants
    await initMultiBots();
  });
}

startServer();

module.exports = app;

