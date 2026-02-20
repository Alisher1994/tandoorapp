const pool = require('./connection');

async function migrate() {
    try {
        console.log('Starting migration...');
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS balance DECIMAL(12, 2) DEFAULT 100000.00;');
        console.log('✅ Column "balance" added to "users" table.');

        // Also update existing users to have the default balance if they have NULL
        await pool.query('UPDATE users SET balance = 100000.00 WHERE balance IS NULL;');
        console.log('✅ Updated existing users balance to 100000.00');

        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
