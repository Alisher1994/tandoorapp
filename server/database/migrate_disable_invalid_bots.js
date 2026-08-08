const pool = require('./connection');

async function migrateDisableInvalidBots() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running migrate_disable_invalid_bots...');

    // Disable restaurants whose Telegram bot token is clearly invalid:
    // valid tokens follow the pattern <numeric_id>:<alphanumeric_string>
    const result = await client.query(`
      UPDATE restaurants
      SET telegram_bot_token = NULL,
          is_active = false
      WHERE telegram_bot_token IS NOT NULL
        AND telegram_bot_token <> ''
        AND telegram_bot_token !~ '^[0-9]+:[A-Za-z0-9_-]{35,}$'
    `);

    if (result.rowCount > 0) {
      console.log(`✅ migrate_disable_invalid_bots: disabled ${result.rowCount} restaurant(s) with invalid bot token(s)`);
    } else {
      console.log('✅ migrate_disable_invalid_bots: no invalid bot tokens found, nothing to do');
    }
  } catch (error) {
    console.error('⚠️  migrate_disable_invalid_bots error:', error.message);
  } finally {
    client.release();
  }
}

module.exports = migrateDisableInvalidBots;
