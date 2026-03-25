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
        superadmin_bot_token VARCHAR(255),
        superadmin_telegram_id VARCHAR(64),
        server_group_chat_id VARCHAR(64),
        server_stats_interval_ms INTEGER DEFAULT 1800000,
        catalog_animation_season VARCHAR(16) DEFAULT 'off',
        card_number VARCHAR(50),
        card_holder VARCHAR(255),
        phone_number VARCHAR(50),
        telegram_username VARCHAR(100),
        click_link TEXT,
        payme_link TEXT,
        print_form_background_url TEXT,
        print_form_qr_position VARCHAR(16) DEFAULT 'center',
        print_form_caption_ru TEXT DEFAULT 'Сканируй и заказывай',
        print_form_caption_uz TEXT DEFAULT 'Skanerlang va buyurtma bering',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        // Insert default settings if not exists
        await pool.query(`
      INSERT INTO billing_settings (id) 
      SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM billing_settings WHERE id = 1);
    `);
        await pool.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS superadmin_bot_token VARCHAR(255);
    `);
        await pool.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS superadmin_telegram_id VARCHAR(64);
    `);
        await pool.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS server_group_chat_id VARCHAR(64);
    `);
        await pool.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS server_stats_interval_ms INTEGER DEFAULT 1800000;
    `);
        await pool.query(`
      ALTER TABLE billing_settings
      ALTER COLUMN server_stats_interval_ms SET DEFAULT 1800000;
    `).catch(() => { });
        await pool.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS catalog_animation_season VARCHAR(16) DEFAULT 'off';
    `);
        await pool.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS print_form_background_url TEXT;
    `);
        await pool.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS print_form_qr_position VARCHAR(16) DEFAULT 'center';
    `);
        await pool.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS print_form_caption_ru TEXT DEFAULT 'Сканируй и заказывай';
    `);
        await pool.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS print_form_caption_uz TEXT DEFAULT 'Skanerlang va buyurtma bering';
    `);
        await pool.query(`
      UPDATE billing_settings
      SET catalog_animation_season = 'off'
      WHERE catalog_animation_season IS NULL
        OR BTRIM(catalog_animation_season) = ''
        OR catalog_animation_season NOT IN ('off', 'spring', 'summer', 'autumn', 'winter');
    `);
        await pool.query(`
      UPDATE billing_settings
      SET print_form_qr_position = 'center'
      WHERE print_form_qr_position IS NULL
         OR BTRIM(print_form_qr_position) = ''
         OR LOWER(print_form_qr_position) NOT IN ('center', 'lower');
    `).catch(() => { });
        await pool.query(`
      UPDATE billing_settings
      SET print_form_caption_ru = 'Сканируй и заказывай'
      WHERE print_form_caption_ru IS NULL OR BTRIM(print_form_caption_ru) = '';
    `).catch(() => { });
        await pool.query(`
      UPDATE billing_settings
      SET print_form_caption_uz = 'Skanerlang va buyurtma bering'
      WHERE print_form_caption_uz IS NULL OR BTRIM(print_form_caption_uz) = '';
    `).catch(() => { });
        await pool.query(`
      UPDATE billing_settings
      SET server_stats_interval_ms = 1800000
      WHERE server_stats_interval_ms IS NULL
         OR server_stats_interval_ms NOT IN (1800000, 3600000, 7200000, 10800000, 21600000, 86400000);
    `).catch(() => { });
        await pool.query(`
      ALTER TABLE billing_settings
      ADD CONSTRAINT IF NOT EXISTS billing_settings_catalog_animation_season_check
      CHECK (catalog_animation_season IN ('off', 'spring', 'summer', 'autumn', 'winter'));
    `).catch(() => { });
        await pool.query(`
      ALTER TABLE billing_settings
      ADD CONSTRAINT IF NOT EXISTS billing_settings_print_form_qr_position_check
      CHECK (print_form_qr_position IN ('center', 'lower'));
    `).catch(() => { });
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
