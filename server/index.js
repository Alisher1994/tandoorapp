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
const { initBot } = require('./bot/bot');

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
const uploadsPath = path.join(__dirname, '../uploads');
const fs = require('fs');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// Root route for Railway health check
app.get('/', (req, res) => {
  res.redirect('/login');
});

// Health check (before other routes)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Telegram webhook route (must be before catch-all routes)
const { getBot } = require('./bot/bot');
app.post('/api/telegram/webhook', express.json(), (req, res) => {
  const bot = getBot();
  if (bot) {
    bot.processUpdate(req.body);
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
  try {
    // Run migrations on startup (only in production or if RUN_MIGRATIONS is set)
    if (process.env.NODE_ENV === 'production' || process.env.RUN_MIGRATIONS === 'true') {
      console.log('🔄 Running database migrations on startup...');
      const migrate = require('./database/migrate');
      await migrate();
    }
  } catch (error) {
    console.error('⚠️  Migration error (server will continue):', error.message);
  }

  // Start server first - listen on 0.0.0.0 for Railway
  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Listening on 0.0.0.0:${PORT}`);
    
    // Initialize Telegram bot after server is running (for webhook)
    initBot();
  });
}

startServer();

module.exports = app;

