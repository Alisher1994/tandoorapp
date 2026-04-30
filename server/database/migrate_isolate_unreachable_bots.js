/**
 * migrate_isolate_unreachable_bots.js
 *
 * EMERGENCY TEMPORARY FIX — isolates 16 known-unreachable Telegram bots that
 * are causing a 500+ logs/sec error storm in production.
 *
 * What it does:
 *   1. Looks up each restaurant by name from the known-bad list.
 *   2. Clears telegram_bot_token (sets to NULL) so the multi-bot manager
 *      never starts a polling loop for them.
 *   3. Sets is_active = false so they are skipped entirely on startup.
 *   4. Records a summary of what was changed.
 *
 * This is intentionally idempotent — running it multiple times is safe.
 * Bots that are already NULL / already inactive are left untouched.
 *
 * NEXT STEPS (after system is stable):
 *   - Contact bot owners to supply fresh tokens (401 group).
 *   - Remove permanently deleted bots from the system (404 group).
 *   - Re-enable restaurants once valid tokens are configured.
 *   - Implement the full batching/back-off solution from PR #4.
 */

const pool = require('./connection');

// 401 Unauthorized — invalid / revoked tokens
const BOTS_401 = [
  'Behzod_Market',
  'Longeruz',
  'Irodat',
  'SAMIM',
  'Adoro_socks',
  'Phone Shop',
  'AvtoZapchast',
  'Shashlik',
];

// 404 Not Found — bots deleted from Telegram
const BOTS_404 = [
  'Kasmetika',
  'DKSS chaqiq tosh',
  'ALPHA PLAST',
  'Bekajon',
  'AKSESAVTO3310',
  'Decor shop',
  'Jzs parfume',
  'TAYFUN DROBILKA',
];

const ALL_UNREACHABLE = [...BOTS_401, ...BOTS_404];

async function migrateIsolateUnreachableBots() {
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️  [isolate-bots] DATABASE_URL not set — skipping bot isolation');
    return;
  }

  console.log('🚨 [isolate-bots] Starting emergency bot isolation...');
  console.log(`   Targeting ${ALL_UNREACHABLE.length} known-unreachable bots`);

  const client = await pool.connect();
  try {
    let isolated = 0;
    let alreadyClean = 0;
    const isolatedNames = [];
    const notFound = [];

    for (const name of ALL_UNREACHABLE) {
      // Use ILIKE for case-insensitive match; trim whitespace to be safe
      const result = await client.query(
        `SELECT id, name, telegram_bot_token, is_active
           FROM restaurants
          WHERE TRIM(name) ILIKE $1
          LIMIT 1`,
        [name.trim()]
      );

      if (result.rows.length === 0) {
        notFound.push(name);
        continue;
      }

      const row = result.rows[0];

      // Already clean — token already removed and already inactive
      if (!row.telegram_bot_token && row.is_active === false) {
        alreadyClean++;
        continue;
      }

      // Isolate: clear token + deactivate
      await client.query(
        `UPDATE restaurants
            SET telegram_bot_token = NULL,
                is_active          = false,
                updated_at         = NOW()
          WHERE id = $1`,
        [row.id]
      );

      isolated++;
      isolatedNames.push(`${row.name} (id=${row.id})`);
    }

    // Summary
    console.log(`✅ [isolate-bots] Isolation complete:`);
    console.log(`   • Isolated now  : ${isolated}`);
    console.log(`   • Already clean : ${alreadyClean}`);
    if (notFound.length > 0) {
      console.warn(`   • Not found in DB: ${notFound.join(', ')}`);
    }
    if (isolatedNames.length > 0) {
      console.log(`   • Bots isolated  :`);
      isolatedNames.forEach((n) => console.log(`       – ${n}`));
    }
  } catch (error) {
    console.error('❌ [isolate-bots] Failed to isolate bots:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Allow direct execution: node server/database/migrate_isolate_unreachable_bots.js
if (require.main === module) {
  migrateIsolateUnreachableBots()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = migrateIsolateUnreachableBots;
