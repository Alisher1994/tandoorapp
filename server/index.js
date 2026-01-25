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
const { initBot } = require('./bot/bot');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

  // Start server first
  app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Initialize Telegram bot after server is running (for webhook)
    initBot();
  });
}

startServer();

module.exports = app;

