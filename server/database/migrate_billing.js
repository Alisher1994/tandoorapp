const pool = require('./connection');

async function migrate() {
    try {
        console.log('Starting billing system migration...');

        // 1. Add billing columns to restaurants
        await pool.query(`
      ALTER TABLE restaurants 
      ADD COLUMN IF NOT EXISTS balance DECIMAL(12, 2) DEFAULT 100000.00,
      ADD COLUMN IF NOT EXISTS is_free_tier BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS order_cost DECIMAL(12, 2) DEFAULT 1000.00;
    `);
        console.log('✅ Billing columns added to restaurants.');

        // 2. Add billing columns to orders
        await pool.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(12, 2) DEFAULT 0;
    `);
        console.log('✅ Billing columns added to orders.');

        // 3. Create billing settings table
        await pool.query(`
      CREATE TABLE IF NOT EXISTS billing_settings (
        id SERIAL PRIMARY KEY,
        default_starting_balance DECIMAL(12, 2) DEFAULT 100000.00,
        default_order_cost DECIMAL(12, 2) DEFAULT 1000.00,
        card_number VARCHAR(50),
        card_holder VARCHAR(255),
        phone_number VARCHAR(50),
        telegram_username VARCHAR(100),
        click_link TEXT,
        payme_link TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        // Insert default settings if not exists
        await pool.query(`
      INSERT INTO billing_settings (id) 
      SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM billing_settings WHERE id = 1);
    `);
        console.log('✅ Billing settings table created.');

        // 4. Create transactions table
        await pool.query(`
      CREATE TABLE IF NOT EXISTS billing_transactions (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        amount DECIMAL(12, 2) NOT NULL,
        type VARCHAR(20) NOT NULL, -- 'deposit', 'withdrawal'
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('✅ Billing transactions table created.');

        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
