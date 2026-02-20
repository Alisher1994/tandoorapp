const pool = require('./connection');

async function migrate() {
    try {
        console.log('Starting scheduled_broadcasts migration...');

        await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduled_broadcasts (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        message TEXT NOT NULL,
        image_url TEXT,
        scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
        recurrence VARCHAR(20) DEFAULT 'none', -- none, daily, weekly, custom
        repeat_days INTEGER[], -- 0-6 (Sunday-Saturday)
        is_active BOOLEAN DEFAULT true,
        last_run_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

        console.log('✅ Table "scheduled_broadcasts" created/verified.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
