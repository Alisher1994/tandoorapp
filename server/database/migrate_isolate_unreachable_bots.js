const pool = require('./connection');

async function migrateIsolateUnreachableBots() {
  const UNREACHABLE_BOTS = [
    'Behzod_Market', 'Longeruz', 'Irodat', 'SAMIM', 'Adoro_socks', 
    'Phone Shop', 'AvtoZapchast', 'Shashlik',
    'Kasmetika', 'DKSS chaqiq tosh', 'ALPHA PLAST', 'Bekajon', 
    'AKSESAVTO3310', 'Decor shop', 'Jzs parfume', 'TAYFUN DROBILKA'
  ];

  const client = await pool.connect();
  try {
    console.log('🚨 EMERGENCY: Isolating 16 unreachable bots...');
    
    const result = await client.query(
      `UPDATE restaurants
       SET telegram_bot_token = NULL, is_active = false
       WHERE name = ANY($1::text[])`,
      [UNREACHABLE_BOTS]
    );

    console.log(`✅ ISOLATED ${result.rowCount} bots - system should recover now`);
  } catch (error) {
    console.error('❌ Failed to isolate bots:', error.message);
  } finally {
    client.release();
  }
}

module.exports = migrateIsolateUnreachableBots;
