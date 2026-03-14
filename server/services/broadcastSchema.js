const pool = require('../database/connection');

let broadcastSchemaReady = false;
let broadcastSchemaPromise = null;

const ensureBroadcastSchema = async () => {
  if (broadcastSchemaReady) return;
  if (broadcastSchemaPromise) {
    await broadcastSchemaPromise;
    return;
  }

  broadcastSchemaPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduled_broadcasts (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        message TEXT,
        image_url TEXT,
        video_url TEXT,
        scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
        recurrence VARCHAR(20) DEFAULT 'none',
        repeat_days INTEGER[],
        is_active BOOLEAN DEFAULT true,
        last_run_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS broadcast_history (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        scheduled_broadcast_id INTEGER REFERENCES scheduled_broadcasts(id) ON DELETE SET NULL,
        message TEXT,
        image_url TEXT,
        video_url TEXT,
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'completed'
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS broadcast_sent_messages (
        id SERIAL PRIMARY KEY,
        broadcast_history_id INTEGER REFERENCES broadcast_history(id) ON DELETE CASCADE,
        chat_id BIGINT NOT NULL,
        message_id INTEGER NOT NULL
      )
    `).catch(() => {});

    await pool.query('ALTER TABLE scheduled_broadcasts ADD COLUMN IF NOT EXISTS image_url TEXT').catch(() => {});
    await pool.query('ALTER TABLE scheduled_broadcasts ADD COLUMN IF NOT EXISTS video_url TEXT').catch(() => {});
    await pool.query('ALTER TABLE scheduled_broadcasts ADD COLUMN IF NOT EXISTS recurrence VARCHAR(20) DEFAULT \'none\'').catch(() => {});
    await pool.query('ALTER TABLE scheduled_broadcasts ADD COLUMN IF NOT EXISTS repeat_days INTEGER[]').catch(() => {});
    await pool.query('ALTER TABLE scheduled_broadcasts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true').catch(() => {});
    await pool.query('ALTER TABLE scheduled_broadcasts ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMP WITH TIME ZONE').catch(() => {});
    await pool.query('ALTER TABLE scheduled_broadcasts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP').catch(() => {});
    await pool.query('ALTER TABLE scheduled_broadcasts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP').catch(() => {});

    await pool.query('ALTER TABLE broadcast_history ADD COLUMN IF NOT EXISTS image_url TEXT').catch(() => {});
    await pool.query('ALTER TABLE broadcast_history ADD COLUMN IF NOT EXISTS video_url TEXT').catch(() => {});
    await pool.query('ALTER TABLE broadcast_history ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP').catch(() => {});
    await pool.query('ALTER TABLE broadcast_history ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT \'completed\'').catch(() => {});
  })();

  try {
    await broadcastSchemaPromise;
    broadcastSchemaReady = true;
  } finally {
    broadcastSchemaPromise = null;
  }
};

module.exports = {
  ensureBroadcastSchema
};
