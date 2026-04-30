const pool = require('./connection');

/**
 * Disable restaurants whose telegram_bot_token does not match the expected
 * Telegram Bot API token format: <numeric_id>:<35+ char alphanumeric string>.
 *
 * This is idempotent — safe to run on every startup.
 */
async function migrateDisableInvalidBots() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      UPDATE restaurants
      SET telegram_bot_token = NULL,
          is_active = false
      WHERE telegram_bot_token IS NOT NULL
        AND telegram_bot_token <> ''
        AND telegram_bot_token !~ '^[0-9]+:[A-Za-z0-9_-]{35,}$'
    `);

    if (result.rowCount > 0) {
      console.log(`✅ migrate_disable_invalid_bots: disabled ${result.rowCount} restaurant(s) with invalid/expired bot token(s)`);
    } else {
      console.log('✅ migrate_disable_invalid_bots: no restaurants with invalid bot tokens found');
    }
  } catch (error) {
    console.error('⚠️  migrate_disable_invalid_bots error:', error.message);
  } finally {
    client.release();
  }
}

module.exports = migrateDisableInvalidBots;
