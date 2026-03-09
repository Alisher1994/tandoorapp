const pool = require('../database/connection');

const FUNNEL_EVENT_TYPES = new Set([
  'start',
  'language_selected',
  'contact_shared',
  'name_entered',
  'location_shared',
  'registration_completed'
]);

let schemaReady = false;
let schemaPromise = null;

async function ensureBotFunnelSchema() {
  if (schemaReady) return;
  if (schemaPromise) {
    await schemaPromise;
    return;
  }

  schemaPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_funnel_events (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
        user_telegram_id BIGINT,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        event_type VARCHAR(40) NOT NULL,
        payload JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_bot_funnel_events_restaurant_created ON bot_funnel_events(restaurant_id, created_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_bot_funnel_events_type_created ON bot_funnel_events(event_type, created_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_bot_funnel_events_telegram ON bot_funnel_events(user_telegram_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_bot_funnel_events_user ON bot_funnel_events(user_id)');

    schemaReady = true;
  })();

  try {
    await schemaPromise;
  } finally {
    schemaPromise = null;
  }
}

async function trackBotFunnelEvent({
  restaurantId,
  telegramUserId = null,
  userId = null,
  eventType,
  payload = null
}) {
  if (!eventType || !FUNNEL_EVENT_TYPES.has(String(eventType))) return false;
  if (!restaurantId) return false;

  try {
    await ensureBotFunnelSchema();
    await pool.query(
      `INSERT INTO bot_funnel_events (restaurant_id, user_telegram_id, user_id, event_type, payload)
       VALUES ($1, $2, $3, $4, COALESCE($5::jsonb, '{}'::jsonb))`,
      [
        Number(restaurantId),
        telegramUserId ? Number(telegramUserId) : null,
        userId ? Number(userId) : null,
        String(eventType),
        payload ? JSON.stringify(payload) : null
      ]
    );
    return true;
  } catch (error) {
    console.error('[bot-funnel] track event warning:', error.message);
    return false;
  }
}

module.exports = {
  ensureBotFunnelSchema,
  trackBotFunnelEvent,
  FUNNEL_EVENT_TYPES
};

