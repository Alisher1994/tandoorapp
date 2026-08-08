const pool = require('./connection');

// Restaurants whose Telegram bot tokens are invalid (401 Unauthorized or 404 Not Found).
// These bots are continuously failing to poll the Telegram API, causing a logging storm
// that exceeds Railway's 500 logs/sec limit. Setting their token to NULL stops polling.
const INVALID_BOT_RESTAURANT_NAMES = [
  // 401 Unauthorized — token revoked or bot deleted
  'Behzod_Market',
  'Longeruz',
  'Irodat',
  'SAMIM',
  'Adoro_socks',
  'Phone Shop',
  'AvtoZapchast',
  'Shashlik',
  // 404 Not Found — bot no longer exists on Telegram
  'Kasmetika',
  'DKSS chaqiq tosh',
  'ALPHA PLAST',
  'Bekajon',
  'AKSESAVTO3310',
  'Decor shop',
  'Jzs parfume',
  'TAYFUN DROBILKA',
];

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('='.repeat(60));
    console.log('Migration: disable invalid Telegram bot tokens');
    console.log('='.repeat(60));
    console.log(`Target restaurants (${INVALID_BOT_RESTAURANT_NAMES.length}):`);
    INVALID_BOT_RESTAURANT_NAMES.forEach((name) => console.log(`  • ${name}`));
    console.log('');

    await client.query('BEGIN');

    // Fetch current state of each targeted restaurant so we can report clearly.
    const { rows: before } = await client.query(
      `SELECT id, name, telegram_bot_token
       FROM restaurants
       WHERE name = ANY($1::text[])
       ORDER BY name`,
      [INVALID_BOT_RESTAURANT_NAMES]
    );

    if (before.length === 0) {
      console.log('⚠️  No matching restaurants found in the database. Nothing to update.');
      await client.query('ROLLBACK');
      return;
    }

    console.log(`Found ${before.length} matching restaurant(s) in the database:`);
    const alreadyNull = [];
    const toDisable = [];

    for (const row of before) {
      const hasToken = row.telegram_bot_token !== null && row.telegram_bot_token.trim() !== '';
      if (hasToken) {
        toDisable.push(row);
        console.log(`  [WILL DISABLE] id=${row.id}  name="${row.name}"`);
      } else {
        alreadyNull.push(row);
        console.log(`  [ALREADY NULL] id=${row.id}  name="${row.name}"`);
      }
    }

    console.log('');

    if (toDisable.length === 0) {
      console.log('✅ All matched restaurants already have NULL tokens. Nothing to update.');
      await client.query('ROLLBACK');
      return;
    }

    // Set telegram_bot_token = NULL for all targeted restaurants that still have a token.
    // Using name = ANY(...) makes this idempotent — rows already NULL are unaffected.
    const disableIds = toDisable.map((r) => r.id);
    const { rowCount } = await client.query(
      `UPDATE restaurants
       SET telegram_bot_token = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1::int[])
         AND telegram_bot_token IS NOT NULL`,
      [disableIds]
    );

    await client.query('COMMIT');

    console.log(`✅ Disabled Telegram bot tokens for ${rowCount} restaurant(s):`);
    for (const row of toDisable) {
      console.log(`  • id=${row.id}  name="${row.name}"`);
    }

    if (alreadyNull.length > 0) {
      console.log(`\nℹ️  ${alreadyNull.length} restaurant(s) were already disabled (token was NULL):`);
      for (const row of alreadyNull) {
        console.log(`  • id=${row.id}  name="${row.name}"`);
      }
    }

    // Report any names from the input list that were not found in the DB at all.
    const foundNames = new Set(before.map((r) => r.name));
    const notFound = INVALID_BOT_RESTAURANT_NAMES.filter((n) => !foundNames.has(n));
    if (notFound.length > 0) {
      console.log(`\n⚠️  ${notFound.length} name(s) from the list were NOT found in the database:`);
      notFound.forEach((n) => console.log(`  • "${n}"`));
      console.log('  (Check for typos or case differences in the restaurant name.)');
    }

    console.log('\n✅ Migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    // Allow the pool to drain before exiting so the process terminates cleanly.
    await pool.end();
  }
}

migrate();
