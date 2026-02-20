const { Pool } = require('pg');
require('dotenv').config();

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set!');
  console.error('Please set DATABASE_URL in Railway variables or .env file');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 10000, // Увеличим до 10 секунд
  idleTimeoutMillis: 30000,
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error details:', {
    message: err.message,
    stack: err.stack,
    code: err.code
  });
});

module.exports = pool;
