const pool = require('./connection');

async function migrate() {
    try {
        console.log('Adding updated_at to scheduled_broadcasts...');
        await pool.query('ALTER TABLE scheduled_broadcasts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP');
        console.log('✅ Column added.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
