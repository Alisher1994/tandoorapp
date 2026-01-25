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

// Serve static files from React app
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Telegram webhook route (must be registered before bot initialization)
const { getBot } = require('./bot/bot');
app.post('/api/telegram/webhook', express.json(), (req, res) => {
  const bot = getBot();
  if (bot) {
    bot.processUpdate(req.body);
  }
  res.sendStatus(200);
});

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

