const pool = require('./connection');

async function migrate() {
    try {
        console.log('Starting broadcast history and message tracking migration...');

        // Table to group sent messages (a "broadcast event")
        await pool.query(`
      CREATE TABLE IF NOT EXISTS broadcast_history (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        scheduled_broadcast_id INTEGER REFERENCES scheduled_broadcasts(id) ON DELETE SET NULL,
        message TEXT,
        image_url TEXT,
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'completed'
      );
    `);

        // Table to store individual sent telegram message IDs for deletion
        await pool.query(`
      CREATE TABLE IF NOT EXISTS broadcast_sent_messages (
        id SERIAL PRIMARY KEY,
        broadcast_history_id INTEGER REFERENCES broadcast_history(id) ON DELETE CASCADE,
        chat_id BIGINT NOT NULL,
        message_id INTEGER NOT NULL
      );
    `);

        console.log('✅ Migration completed.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
