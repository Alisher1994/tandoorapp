const fs = require('fs');
const path = require('path');
const pool = require('./connection');
const bcrypt = require('bcryptjs');
const { ensureReservationSchema } = require('../services/reservationSchema');

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('🔄 Starting database migration...');

    // Check DATABASE_URL
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL is not set! Cannot run migrations.');
      return false;
    }

    console.log('📊 DATABASE_URL is set, connecting...');

    // Disable global transaction because try/catch masks failures that break the whole block
    // await client.query('BEGIN');

    // =====================================================
    // Step 1: Create restaurants table FIRST (before users references it)
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS restaurants (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        phone VARCHAR(20),
        logo_url TEXT,
        telegram_bot_token VARCHAR(255),
        telegram_group_id VARCHAR(100),
        delivery_zone JSONB,
        start_time VARCHAR(5),
        end_time VARCHAR(5),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add missing columns
    const restaurantColumns = [
      'logo_url TEXT',
      `logo_display_mode VARCHAR(20) DEFAULT 'square'`,
      `ui_theme VARCHAR(20) DEFAULT 'classic'`,
      `menu_view_mode VARCHAR(24) DEFAULT 'grid_categories'`,
      'delivery_zone JSONB',
      'start_time VARCHAR(5)',
      'end_time VARCHAR(5)',
      'click_url TEXT',
      'payme_url TEXT',
      'payme_enabled BOOLEAN DEFAULT false',
      'payme_merchant_id VARCHAR(128)',
      'payme_api_login VARCHAR(255)',
      'payme_api_password VARCHAR(255)',
      `payme_account_key VARCHAR(64) DEFAULT 'order_id'`,
      'payme_test_mode BOOLEAN DEFAULT false',
      `payme_callback_timeout_ms INTEGER DEFAULT 2000`,
      'send_balance_after_confirm BOOLEAN DEFAULT false',
      'send_daily_close_report BOOLEAN DEFAULT false',
      'close_report_last_sent_at TIMESTAMP',
      `payment_placeholders JSONB DEFAULT '{}'::jsonb`,
      'uzum_url TEXT',
      'xazna_url TEXT',
      'cash_enabled BOOLEAN DEFAULT true',
      'card_payment_title VARCHAR(120)',
      'card_payment_number VARCHAR(40)',
      'card_payment_holder VARCHAR(120)',
      `card_receipt_target VARCHAR(16) DEFAULT 'bot'`,
      'msg_new TEXT',
      'msg_preparing TEXT',
      'msg_delivering TEXT',
      'msg_delivered TEXT',
      'msg_cancelled TEXT',
      'admin_comment TEXT',
      'support_username VARCHAR(100)',
      'operator_registration_code VARCHAR(64)',
      'service_fee DECIMAL(10, 2) DEFAULT 0',
      'latitude DECIMAL(10, 8)',
      'longitude DECIMAL(11, 8)',
      'delivery_base_radius DECIMAL(5, 2) DEFAULT 2',
      'delivery_base_price DECIMAL(10, 2) DEFAULT 5000',
      'delivery_price_per_km DECIMAL(10, 2) DEFAULT 2000',
      `delivery_pricing_mode VARCHAR(16) DEFAULT 'dynamic'`,
      'delivery_fixed_price DECIMAL(10, 2) DEFAULT 0',
      'is_delivery_enabled BOOLEAN DEFAULT true',
      'size_variants_enabled BOOLEAN DEFAULT false',
      `currency_code VARCHAR(8) DEFAULT 'uz'`,
      'balance DECIMAL(12, 2) DEFAULT 100000.00',
      'is_free_tier BOOLEAN DEFAULT false',
      'order_cost DECIMAL(12, 2) DEFAULT 1000.00',
      'is_scheduled_date_delivery_enabled BOOLEAN DEFAULT false',
      'scheduled_delivery_max_days INTEGER DEFAULT 7',
      'is_asap_delivery_enabled BOOLEAN DEFAULT true',
      'is_scheduled_time_delivery_enabled BOOLEAN DEFAULT true'
    ];

    for (const col of restaurantColumns) {
      try {
        await client.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS ${col}`);
      } catch (e) { }
    }
    await client.query(`
      UPDATE restaurants
      SET logo_display_mode = 'square'
      WHERE logo_display_mode IS NULL OR TRIM(COALESCE(logo_display_mode, '')) = ''
    `).catch(() => {});
    await client.query(`
      UPDATE restaurants
      SET ui_theme = 'classic'
      WHERE ui_theme IS NULL OR TRIM(COALESCE(ui_theme, '')) = ''
    `).catch(() => {});
    await client.query(`
      UPDATE restaurants
      SET menu_view_mode = 'grid_categories'
      WHERE menu_view_mode IS NULL
        OR BTRIM(COALESCE(menu_view_mode, '')) = ''
        OR menu_view_mode NOT IN ('grid_categories', 'single_list')
    `).catch(() => {});
    await client.query(`
      UPDATE restaurants
      SET payment_placeholders = '{}'::jsonb
      WHERE payment_placeholders IS NULL
    `).catch(() => {});
    await client.query(`
      UPDATE restaurants
      SET card_receipt_target = 'bot'
      WHERE card_receipt_target IS NULL OR BTRIM(COALESCE(card_receipt_target, '')) = ''
    `).catch(() => {});
    await client.query(`
      UPDATE restaurants
      SET cash_enabled = true
      WHERE cash_enabled IS NULL
    `).catch(() => {});
    await client.query(`
      UPDATE restaurants
      SET send_balance_after_confirm = false
      WHERE send_balance_after_confirm IS NULL
    `).catch(() => {});
    await client.query(`
      UPDATE restaurants
      SET send_daily_close_report = false
      WHERE send_daily_close_report IS NULL
    `).catch(() => {});
    await client.query(`
      UPDATE restaurants
      SET size_variants_enabled = false
      WHERE size_variants_enabled IS NULL
    `).catch(() => {});
    await client.query(`
      UPDATE restaurants
      SET currency_code = 'uz'
      WHERE currency_code IS NULL
        OR BTRIM(COALESCE(currency_code, '')) = ''
        OR LOWER(currency_code) NOT IN ('uz', 'kz', 'tm', 'tj', 'kg', 'af', 'ru')
    `).catch(() => {});
    await client.query(`
      UPDATE restaurants
      SET delivery_pricing_mode = 'dynamic'
      WHERE delivery_pricing_mode IS NULL
        OR BTRIM(COALESCE(delivery_pricing_mode, '')) = ''
        OR LOWER(delivery_pricing_mode) NOT IN ('dynamic', 'fixed')
    `).catch(() => {});
    await client.query(`
      UPDATE restaurants
      SET delivery_fixed_price = 0
      WHERE delivery_fixed_price IS NULL OR delivery_fixed_price < 0
    `).catch(() => {});
    await client.query(`
      ALTER TABLE restaurants
      DROP CONSTRAINT IF EXISTS restaurants_logo_display_mode_check
    `).catch(() => {});
    await client.query(`
      ALTER TABLE restaurants
      ADD CONSTRAINT restaurants_logo_display_mode_check
      CHECK (logo_display_mode IN ('square', 'horizontal'))
    `).catch(() => {});
    await client.query(`
      ALTER TABLE restaurants
      DROP CONSTRAINT IF EXISTS restaurants_ui_theme_check
    `).catch(() => {});
    await client.query(`
      ALTER TABLE restaurants
      ADD CONSTRAINT restaurants_ui_theme_check
      CHECK (ui_theme IN ('classic', 'modern', 'talablar_blue', 'mint_fresh', 'sunset_pop', 'berry_blast', 'violet_wave', 'rainbow'))
    `).catch(() => {});
    await client.query(`
      ALTER TABLE restaurants
      DROP CONSTRAINT IF EXISTS restaurants_menu_view_mode_check
    `).catch(() => {});
    await client.query(`
      ALTER TABLE restaurants
      ADD CONSTRAINT restaurants_menu_view_mode_check
      CHECK (menu_view_mode IN ('grid_categories', 'single_list'))
    `).catch(() => {});
    await client.query(`
      ALTER TABLE restaurants
      DROP CONSTRAINT IF EXISTS restaurants_card_receipt_target_check
    `).catch(() => {});
    await client.query(`
      ALTER TABLE restaurants
      ADD CONSTRAINT restaurants_card_receipt_target_check
      CHECK (card_receipt_target IN ('bot', 'admin'))
    `).catch(() => {});
    await client.query(`
      ALTER TABLE restaurants
      DROP CONSTRAINT IF EXISTS restaurants_delivery_pricing_mode_check
    `).catch(() => {});
    await client.query(`
      ALTER TABLE restaurants
      ADD CONSTRAINT restaurants_delivery_pricing_mode_check
      CHECK (delivery_pricing_mode IN ('dynamic', 'fixed'))
    `).catch(() => {});

    console.log('✅ Restaurants table ready');

    // =====================================================
    // Step 2: Add new columns to existing tables
    // =====================================================

    // Add columns to users table
    const userColumns = [
      { name: 'active_restaurant_id', type: 'INTEGER REFERENCES restaurants(id) ON DELETE SET NULL' },
      { name: 'is_active', type: 'BOOLEAN DEFAULT true' },
      { name: 'telegram_id', type: 'BIGINT UNIQUE' },
      { name: 'bot_language', type: `VARCHAR(5) DEFAULT 'ru'` },
      { name: 'last_latitude', type: 'DECIMAL(10, 8)' },
      { name: 'last_longitude', type: 'DECIMAL(11, 8)' },
      { name: 'last_address', type: 'TEXT' },
      { name: 'last_activity_at', type: 'TIMESTAMP' },
      { name: 'last_ip_address', type: 'VARCHAR(64)' },
      { name: 'last_user_agent', type: 'TEXT' },
      { name: 'last_device_type', type: 'VARCHAR(32)' },
      { name: 'last_browser_name', type: 'VARCHAR(80)' },
      { name: 'last_browser_version', type: 'VARCHAR(40)' },
      { name: 'last_os_name', type: 'VARCHAR(60)' },
      { name: 'last_os_version', type: 'VARCHAR(40)' },
      { name: 'last_country', type: 'VARCHAR(8)' },
      { name: 'last_region', type: 'VARCHAR(120)' },
      { name: 'last_city', type: 'VARCHAR(120)' }
    ];

    for (const col of userColumns) {
      try {
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        console.log(`✅ Added column users.${col.name}`);
      } catch (e) {
        if (e.code !== '42701') console.log(`ℹ️  Column users.${col.name}: ${e.message}`);
      }
    }

    // Add columns to categories table
    const categoryColumns = [
      { name: 'restaurant_id', type: 'INTEGER REFERENCES restaurants(id) ON DELETE CASCADE' },
      { name: 'is_active', type: 'BOOLEAN DEFAULT true' },
      { name: 'updated_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
    ];

    for (const col of categoryColumns) {
      try {
        await client.query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
      } catch (e) {
        if (e.code !== '42701') console.log(`ℹ️  Column categories.${col.name}: ${e.message}`);
      }
    }
    console.log('✅ Categories table updated');

    // Add columns to products table  
    const productColumns = [
      { name: 'restaurant_id', type: 'INTEGER REFERENCES restaurants(id) ON DELETE CASCADE' },
      { name: 'container_id', type: 'INTEGER' },
      { name: 'container_norm', type: 'DECIMAL(10, 2) DEFAULT 1' },
      { name: 'thumb_url', type: 'TEXT' },
      { name: 'product_images', type: `JSONB DEFAULT '[]'::jsonb` },
      { name: 'season_scope', type: `VARCHAR(16) DEFAULT 'all'` },
      { name: 'is_hidden_catalog', type: 'BOOLEAN DEFAULT false' },
      { name: 'order_step', type: 'DECIMAL(10, 2)' },
      { name: 'size_enabled', type: 'BOOLEAN DEFAULT false' },
      { name: 'size_options', type: `JSONB DEFAULT '[]'::jsonb` }
    ];

    for (const col of productColumns) {
      try {
        await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
      } catch (e) {
        if (e.code !== '42701') console.log(`ℹ️  Column products.${col.name}: ${e.message}`);
      }
    }
    console.log('✅ Products table updated');
    await client.query(`UPDATE products SET container_norm = 1 WHERE container_norm IS NULL OR container_norm <= 0`).catch(() => {});
    await client.query(`UPDATE products SET season_scope = 'all' WHERE season_scope IS NULL OR season_scope = ''`).catch(() => {});
    await client.query(`UPDATE products SET order_step = NULL WHERE order_step IS NOT NULL AND (order_step <= 0 OR unit IS DISTINCT FROM 'кг')`).catch(() => {});
    await client.query(`UPDATE products SET size_enabled = false WHERE size_enabled IS NULL`).catch(() => {});
    await client.query(`UPDATE products SET size_options = '[]'::jsonb WHERE size_options IS NULL`).catch(() => {});
    await client.query(`ALTER TABLE products ALTER COLUMN product_images SET DEFAULT '[]'::jsonb`).catch(() => {});
    await client.query(`ALTER TABLE products ALTER COLUMN size_options SET DEFAULT '[]'::jsonb`).catch(() => {});
    await client.query(`UPDATE products SET product_images = '[]'::jsonb WHERE product_images IS NULL`).catch(() => {});
    await client.query(`
      ALTER TABLE products
      ADD CONSTRAINT IF NOT EXISTS products_season_scope_check
      CHECK (season_scope IN ('all', 'spring', 'summer', 'autumn', 'winter'))
    `).catch(() => {});

    // =====================================================
    // Create containers table (посуда/тара)
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS containers (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Containers table ready');

    // Add foreign key constraint to products.container_id if not exists
    try {
      await client.query(`
        ALTER TABLE products 
        ADD CONSTRAINT fk_products_container 
        FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE SET NULL
      `);
    } catch (e) {
      // Constraint might already exist
    }

    // Add columns to orders table
    const orderColumns = [
      { name: 'restaurant_id', type: 'INTEGER REFERENCES restaurants(id) ON DELETE SET NULL' },
      { name: 'processed_by', type: 'INTEGER REFERENCES users(id) ON DELETE SET NULL' },
      { name: 'processed_at', type: 'TIMESTAMP' },
      { name: 'admin_message_id', type: 'BIGINT' },
      { name: 'admin_chat_id', type: 'TEXT' },
      { name: 'admin_comment', type: 'TEXT' },
      { name: 'service_rating', type: 'INTEGER DEFAULT 0' },
      { name: 'delivery_rating', type: 'INTEGER DEFAULT 0' },
      { name: 'rating_requested_at', type: 'TIMESTAMP' },
      { name: 'cancel_reason', type: 'TEXT' },
      { name: 'cancelled_at_status', type: 'VARCHAR(20)' },
      { name: 'service_fee', type: 'DECIMAL(10, 2) DEFAULT 0' },
      { name: 'delivery_cost', type: 'DECIMAL(10, 2) DEFAULT 0' },
      { name: 'delivery_distance_km', type: 'DECIMAL(10, 2)' },
      { name: 'is_paid', type: 'BOOLEAN DEFAULT false' },
      { name: 'paid_amount', type: 'DECIMAL(12, 2) DEFAULT 0' },
      { name: 'payment_provider', type: 'VARCHAR(32)' },
      { name: 'payment_reference', type: 'VARCHAR(128)' },
      { name: 'payment_paid_at', type: 'TIMESTAMP' },
      { name: 'payment_cancelled_at', type: 'TIMESTAMP' },
      { name: 'payment_receipt_chat_id', type: 'TEXT' },
      { name: 'payment_receipt_message_id', type: 'BIGINT' },
      { name: 'payment_receipt_file_id', type: 'TEXT' },
      { name: 'payment_receipt_submitted_at', type: 'TIMESTAMP' }
    ];

    for (const col of orderColumns) {
      try {
        await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
      } catch (e) {
        if (e.code !== '42701') console.log(`ℹ️  Column orders.${col.name}: ${e.message}`);
      }
    }

    // Fix column sizes - order_number and customer_phone were too small
    try {
      await client.query(`ALTER TABLE orders ALTER COLUMN order_number TYPE VARCHAR(50)`);
      await client.query(`ALTER TABLE orders ALTER COLUMN customer_phone TYPE VARCHAR(50)`);
      console.log('✅ Orders columns resized');
    } catch (e) {
      console.log(`ℹ️  Orders resize: ${e.message}`);
    }

    console.log('✅ Orders table updated');

    // Add container columns to order_items
    const orderItemsColumns = [
      { name: 'container_name', type: 'VARCHAR(255)' },
      { name: 'container_price', type: 'DECIMAL(10, 2) DEFAULT 0' },
      { name: 'container_norm', type: 'DECIMAL(10, 2) DEFAULT 1' }
    ];

    for (const col of orderItemsColumns) {
      try {
        await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
      } catch (e) {
        if (e.code !== '42701') console.log(`ℹ️  Column order_items.${col.name}: ${e.message}`);
      }
    }
    await client.query(`UPDATE order_items SET container_norm = 1 WHERE container_norm IS NULL OR container_norm <= 0`).catch(() => {});
    console.log('✅ Order_items table updated with container columns');

    // =====================================================
    // Payme transactions
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS payme_transactions (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        payme_transaction_id VARCHAR(64) NOT NULL UNIQUE,
        payme_time BIGINT,
        amount_tiyin BIGINT NOT NULL,
        account_data JSONB DEFAULT '{}'::jsonb,
        state INTEGER NOT NULL DEFAULT 1,
        reason INTEGER,
        create_time BIGINT NOT NULL,
        perform_time BIGINT,
        cancel_time BIGINT,
        raw_request JSONB,
        fiscal_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Payme transactions table ready');

    // =====================================================
    // Step 3: Create operator_restaurants junction table
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS operator_restaurants (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, restaurant_id)
      )
    `);
    console.log('✅ Operator_restaurants table ready');

    // =====================================================
    // Step 3.5: Create user_restaurants table for tracking customer-restaurant relationships
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_restaurants (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        is_blocked BOOLEAN DEFAULT false,
        first_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, restaurant_id)
      )
    `);

    // Ensure user_restaurants has blocking flag for per-restaurant access control
    await client.query(`
      ALTER TABLE user_restaurants
      ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false
    `);
    console.log('✅ User_restaurants table ready');

    // =====================================================
    // Step 4: Create activity_logs table
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE SET NULL,
        action_type VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER,
        entity_name VARCHAR(255),
        old_values JSONB,
        new_values JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Activity_logs table ready');

    // =====================================================
    // Step 4.5: Create feedback table
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        customer_name VARCHAR(255),
        customer_phone VARCHAR(50),
        type VARCHAR(20) DEFAULT 'complaint' CHECK (type IN ('complaint', 'suggestion', 'question', 'other')),
        message TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
        admin_response TEXT,
        responded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        responded_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Feedback table ready');

    // =====================================================
    // Step 4.6: Create user_addresses table (Мои адреса)
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_addresses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        address TEXT NOT NULL,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ User_addresses table ready');

    // =====================================================
    // Step 4.6: Create user_profile_logs table for tracking profile changes
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_profile_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        field_name VARCHAR(50) NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_via VARCHAR(20) DEFAULT 'bot',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ User_profile_logs table ready');

    // =====================================================
    // Step 4.7: Create telegram_admin_links (allows same Telegram to be customer + admin)
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS telegram_admin_links (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_telegram_admin_links_telegram_id ON telegram_admin_links(telegram_id)').catch(() => {});
    await client.query('CREATE INDEX IF NOT EXISTS idx_telegram_admin_links_user_id ON telegram_admin_links(user_id)').catch(() => {});

    // Backfill links for existing operators/superadmins with telegram_id in users table
    await client.query(`
      INSERT INTO telegram_admin_links (telegram_id, user_id)
      SELECT DISTINCT ON (u.telegram_id) u.telegram_id, u.id
      FROM users u
      WHERE u.telegram_id IS NOT NULL
        AND u.role IN ('operator', 'superadmin', 'admin')
      ORDER BY
        u.telegram_id,
        CASE WHEN u.role = 'superadmin' THEN 0 ELSE 1 END,
        u.id DESC
      ON CONFLICT DO NOTHING
    `).catch((e) => console.log(`ℹ️ telegram_admin_links backfill: ${e.message}`));
    console.log('✅ Telegram admin links ready');

    // =====================================================
    // Step 5: Update user roles - change 'admin' to 'superadmin'
    // =====================================================

    await client.query(`UPDATE users SET role = 'superadmin' WHERE role = 'admin'`);

    // Fix role constraint if exists
    try {
      await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
      await client.query(`
        ALTER TABLE users ADD CONSTRAINT users_role_check 
        CHECK (role IN ('superadmin', 'operator', 'customer'))
      `);
    } catch (e) {
      // Constraint might not exist or already correct
    }
    console.log('✅ User roles updated');

    // =====================================================
    // Step 6: Create default restaurant
    // =====================================================

    const restaurantCheck = await client.query('SELECT id FROM restaurants LIMIT 1');
    let defaultRestaurantId;

    if (restaurantCheck.rows.length === 0) {
      const restaurantResult = await client.query(`
        INSERT INTO restaurants (name, address, telegram_bot_token, telegram_group_id, is_active)
        VALUES ($1, $2, $3, $4, true)
        RETURNING id
      `, [
        process.env.DEFAULT_RESTAURANT_NAME || 'Основной ресторан',
        process.env.DEFAULT_RESTAURANT_ADDRESS || '',
        '', // Token should be set in admin panel, not from env
        ''  // Group ID should be set in admin panel, not from env
      ]);
      defaultRestaurantId = restaurantResult.rows[0].id;
      console.log(`✅ Default restaurant created with ID: ${defaultRestaurantId}`);
    } else {
      defaultRestaurantId = restaurantCheck.rows[0].id;
      console.log(`ℹ️  Restaurant exists with ID: ${defaultRestaurantId}`);
    }

    // =====================================================
    // Step 7: Create or update superadmin
    // =====================================================

    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const adminCheck = await client.query(
      'SELECT id, role FROM users WHERE username = $1',
      [adminUsername]
    );

    let adminId;

    if (adminCheck.rows.length === 0) {
      const adminResult = await client.query(`
        INSERT INTO users (username, password, full_name, role, is_active, active_restaurant_id) 
        VALUES ($1, $2, 'Super Administrator', 'superadmin', true, $3)
        RETURNING id
      `, [adminUsername, hashedPassword, defaultRestaurantId]);

      adminId = adminResult.rows[0].id;
      console.log(`✅ Superadmin created: ${adminUsername}`);
    } else {
      adminId = adminCheck.rows[0].id;

      // Update to superadmin role and set active restaurant
      await client.query(`
        UPDATE users 
        SET role = 'superadmin', 
            is_active = true,
            active_restaurant_id = COALESCE(active_restaurant_id, $1)
        WHERE id = $2
      `, [defaultRestaurantId, adminId]);

      console.log(`✅ Superadmin updated: ${adminUsername}`);
    }

    // Link superadmin to default restaurant
    await client.query(`
      INSERT INTO operator_restaurants (user_id, restaurant_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, restaurant_id) DO NOTHING
    `, [adminId, defaultRestaurantId]);

    // =====================================================
    // Step 8: Migrate existing data to default restaurant
    // =====================================================

    await client.query(`UPDATE categories SET restaurant_id = $1 WHERE restaurant_id IS NULL`, [defaultRestaurantId]);
    await client.query(`UPDATE products SET restaurant_id = $1 WHERE restaurant_id IS NULL`, [defaultRestaurantId]);
    await client.query(`UPDATE orders SET restaurant_id = $1 WHERE restaurant_id IS NULL`, [defaultRestaurantId]);

    console.log('✅ Existing data migrated to default restaurant');

    // =====================================================
    // Step 9: Create indexes
    // =====================================================

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_active_restaurant ON users(active_restaurant_id)',
      'CREATE INDEX IF NOT EXISTS idx_operator_restaurants_user ON operator_restaurants(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_operator_restaurants_restaurant ON operator_restaurants(restaurant_id)',
      'CREATE INDEX IF NOT EXISTS idx_categories_restaurant ON categories(restaurant_id)',
      'CREATE INDEX IF NOT EXISTS idx_products_restaurant ON products(restaurant_id)',
      'CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id)',
      'CREATE INDEX IF NOT EXISTS idx_orders_processed_by ON orders(processed_by)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_payme_login_unique ON restaurants(payme_api_login) WHERE payme_api_login IS NOT NULL',
      'CREATE INDEX IF NOT EXISTS idx_payme_transactions_restaurant ON payme_transactions(restaurant_id)',
      'CREATE INDEX IF NOT EXISTS idx_payme_transactions_order ON payme_transactions(order_id)',
      'CREATE INDEX IF NOT EXISTS idx_payme_transactions_state ON payme_transactions(state)',
      'CREATE INDEX IF NOT EXISTS idx_payme_transactions_create_time ON payme_transactions(create_time)',
      'CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_activity_logs_restaurant ON activity_logs(restaurant_id)',
      'CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC)'
    ];

    for (const idx of indexes) {
      try {
        await client.query(idx);
      } catch (e) {
        // Index might already exist
      }
    }
    console.log('✅ Indexes created');

    // =====================================================
    // Step 10: Billing System Tables
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS billing_settings (
        id SERIAL PRIMARY KEY,
        default_starting_balance DECIMAL(12, 2) DEFAULT 100000.00,
        default_order_cost DECIMAL(12, 2) DEFAULT 1000.00,
        superadmin_bot_token VARCHAR(255),
        superadmin_telegram_id VARCHAR(64),
        server_group_chat_id VARCHAR(64),
        server_stats_interval_ms INTEGER DEFAULT 1800000,
        server_railway_projects TEXT,
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
      )
    `);

    // Insert default settings if not exists
    await client.query(`
      INSERT INTO billing_settings (id) 
      SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM billing_settings WHERE id = 1)
    `);

    await client.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS superadmin_bot_token VARCHAR(255)
    `);

    await client.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS superadmin_telegram_id VARCHAR(64)
    `);
    await client.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS server_group_chat_id VARCHAR(64)
    `);
    await client.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS server_stats_interval_ms INTEGER DEFAULT 1800000
    `);
    await client.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS server_railway_projects TEXT
    `);
    await client.query(`
      ALTER TABLE billing_settings
      ALTER COLUMN server_stats_interval_ms SET DEFAULT 1800000
    `).catch(() => {});
    await client.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS catalog_animation_season VARCHAR(16) DEFAULT 'off'
    `);
    await client.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS print_form_background_url TEXT
    `);
    await client.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS print_form_qr_position VARCHAR(16) DEFAULT 'center'
    `);
    await client.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS print_form_caption_ru TEXT DEFAULT 'Сканируй и заказывай'
    `);
    await client.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS print_form_caption_uz TEXT DEFAULT 'Skanerlang va buyurtma bering'
    `);
    await client.query(`
      UPDATE billing_settings
      SET catalog_animation_season = 'off'
      WHERE catalog_animation_season IS NULL
        OR BTRIM(catalog_animation_season) = ''
        OR catalog_animation_season NOT IN ('off', 'spring', 'summer', 'autumn', 'winter')
    `).catch(() => {});
    await client.query(`
      UPDATE billing_settings
      SET print_form_qr_position = 'center'
      WHERE print_form_qr_position IS NULL
         OR BTRIM(print_form_qr_position) = ''
         OR LOWER(print_form_qr_position) NOT IN ('center', 'lower')
    `).catch(() => {});
    await client.query(`
      UPDATE billing_settings
      SET print_form_caption_ru = 'Сканируй и заказывай'
      WHERE print_form_caption_ru IS NULL OR BTRIM(print_form_caption_ru) = ''
    `).catch(() => {});
    await client.query(`
      UPDATE billing_settings
      SET print_form_caption_uz = 'Skanerlang va buyurtma bering'
      WHERE print_form_caption_uz IS NULL OR BTRIM(print_form_caption_uz) = ''
    `).catch(() => {});
    await client.query(`
      UPDATE billing_settings
      SET server_stats_interval_ms = 1800000
      WHERE server_stats_interval_ms IS NULL
         OR server_stats_interval_ms NOT IN (1800000, 3600000, 7200000, 10800000, 21600000, 86400000)
    `).catch(() => {});
    await client.query(`
      ALTER TABLE billing_settings
      ADD CONSTRAINT IF NOT EXISTS billing_settings_catalog_animation_season_check
      CHECK (catalog_animation_season IN ('off', 'spring', 'summer', 'autumn', 'winter'))
    `).catch(() => {});
    await client.query(`
      ALTER TABLE billing_settings
      ADD CONSTRAINT IF NOT EXISTS billing_settings_print_form_qr_position_check
      CHECK (print_form_qr_position IN ('center', 'lower'))
    `).catch(() => {});

    await client.query(`
      CREATE TABLE IF NOT EXISTS billing_transactions (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        amount DECIMAL(12, 2) NOT NULL,
        type VARCHAR(20) NOT NULL, -- 'deposit', 'withdrawal'
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add transaction indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_billing_transactions_restaurant ON billing_transactions(restaurant_id)');

    console.log('✅ Billing tables and settings ready');

    // =====================================================
    // Step 10.5: Bot Funnel events
    // =====================================================

    await client.query(`
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

    await client.query('CREATE INDEX IF NOT EXISTS idx_bot_funnel_events_restaurant_created ON bot_funnel_events(restaurant_id, created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bot_funnel_events_type_created ON bot_funnel_events(event_type, created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bot_funnel_events_telegram ON bot_funnel_events(user_telegram_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bot_funnel_events_user ON bot_funnel_events(user_id)');
    console.log('✅ Bot funnel events table ready');

    // =====================================================
    // Step 11: Global Ad Banners (superadmin-managed)
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS ad_banners (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        image_url TEXT NOT NULL,
        button_text VARCHAR(120) NOT NULL DEFAULT 'Открыть',
        target_url TEXT NOT NULL,
        ad_type VARCHAR(24) NOT NULL DEFAULT 'banner',
        slot_order INTEGER NOT NULL DEFAULT 1,
        display_seconds INTEGER NOT NULL DEFAULT 5,
        transition_effect VARCHAR(20) NOT NULL DEFAULT 'fade',
        start_at TIMESTAMP NULL,
        end_at TIMESTAMP NULL,
        repeat_days JSONB NOT NULL DEFAULT '[]'::jsonb,
        target_activity_type_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_enabled BOOLEAN NOT NULL DEFAULT true,
        is_deleted BOOLEAN NOT NULL DEFAULT false,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ad_banner_events (
        id SERIAL PRIMARY KEY,
        banner_id INTEGER NOT NULL REFERENCES ad_banners(id) ON DELETE CASCADE,
        event_type VARCHAR(20) NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE SET NULL,
        viewer_key VARCHAR(128),
        ip_address VARCHAR(128),
        user_agent TEXT,
        device_type VARCHAR(24),
        device_brand VARCHAR(80),
        device_model VARCHAR(120),
        browser_name VARCHAR(80),
        browser_version VARCHAR(40),
        os_name VARCHAR(60),
        os_version VARCHAR(40),
        app_container VARCHAR(80),
        is_in_app_browser BOOLEAN DEFAULT false,
        country VARCHAR(80),
        region VARCHAR(120),
        city VARCHAR(120),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure new columns exist if table was created earlier with an older schema
    const adBannerColumns = [
      'title VARCHAR(255)',
      'image_url TEXT',
      `button_text VARCHAR(120) DEFAULT 'Открыть'`,
      'target_url TEXT',
      `ad_type VARCHAR(24) DEFAULT 'banner'`,
      'slot_order INTEGER DEFAULT 1',
      'display_seconds INTEGER DEFAULT 5',
      `transition_effect VARCHAR(20) DEFAULT 'fade'`,
      'start_at TIMESTAMP NULL',
      'end_at TIMESTAMP NULL',
      `repeat_days JSONB DEFAULT '[]'::jsonb`,
      `target_activity_type_ids JSONB DEFAULT '[]'::jsonb`,
      'is_enabled BOOLEAN DEFAULT true',
      'is_deleted BOOLEAN DEFAULT false',
      'created_by INTEGER REFERENCES users(id) ON DELETE SET NULL',
      'updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL',
      'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    ];
    for (const col of adBannerColumns) {
      try {
        await client.query(`ALTER TABLE ad_banners ADD COLUMN IF NOT EXISTS ${col}`);
      } catch (e) { }
    }

    const adEventColumns = [
      'banner_id INTEGER REFERENCES ad_banners(id) ON DELETE CASCADE',
      'event_type VARCHAR(20)',
      'user_id INTEGER REFERENCES users(id) ON DELETE SET NULL',
      'restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE SET NULL',
      'viewer_key VARCHAR(128)',
      'ip_address VARCHAR(128)',
      'user_agent TEXT',
      'device_type VARCHAR(24)',
      'device_brand VARCHAR(80)',
      'device_model VARCHAR(120)',
      'browser_name VARCHAR(80)',
      'browser_version VARCHAR(40)',
      'os_name VARCHAR(60)',
      'os_version VARCHAR(40)',
      'app_container VARCHAR(80)',
      'is_in_app_browser BOOLEAN DEFAULT false',
      'country VARCHAR(80)',
      'region VARCHAR(120)',
      'city VARCHAR(120)',
      'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    ];
    for (const col of adEventColumns) {
      try {
        await client.query(`ALTER TABLE ad_banner_events ADD COLUMN IF NOT EXISTS ${col}`);
      } catch (e) { }
    }

    await client.query(`ALTER TABLE ad_banners ALTER COLUMN repeat_days SET DEFAULT '[]'::jsonb`);
    await client.query(`UPDATE ad_banners SET repeat_days = '[]'::jsonb WHERE repeat_days IS NULL`);
    await client.query(`ALTER TABLE ad_banners ALTER COLUMN target_activity_type_ids SET DEFAULT '[]'::jsonb`).catch(() => {});
    await client.query(`UPDATE ad_banners SET target_activity_type_ids = '[]'::jsonb WHERE target_activity_type_ids IS NULL`).catch(() => {});
    await client.query(`ALTER TABLE ad_banners ALTER COLUMN target_url DROP NOT NULL`).catch(() => {});
    await client.query(`ALTER TABLE ad_banners ALTER COLUMN ad_type SET DEFAULT 'banner'`).catch(() => {});
    await client.query(`UPDATE ad_banners SET ad_type = 'banner' WHERE ad_type IS NULL OR BTRIM(ad_type) = ''`).catch(() => {});

    await client.query(`
      ALTER TABLE ad_banners
      ADD CONSTRAINT IF NOT EXISTS ad_banners_transition_effect_check
      CHECK (transition_effect IN ('none', 'fade', 'slide'))
    `).catch(() => {});

    await client.query(`
      ALTER TABLE ad_banners
      ADD CONSTRAINT IF NOT EXISTS ad_banners_type_check
      CHECK (ad_type IN ('banner', 'entry_popup'))
    `).catch(() => {});

    await client.query(`
      ALTER TABLE ad_banner_events
      ADD CONSTRAINT IF NOT EXISTS ad_banner_events_type_check
      CHECK (event_type IN ('view', 'click'))
    `).catch(() => {});

    await client.query('CREATE INDEX IF NOT EXISTS idx_ad_banners_enabled_slot ON ad_banners(is_enabled, is_deleted, slot_order)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ad_banners_start_end ON ad_banners(start_at, end_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ad_banner_events_banner ON ad_banner_events(banner_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ad_banner_events_type ON ad_banner_events(event_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ad_banner_events_created ON ad_banner_events(created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ad_banner_events_banner_created ON ad_banner_events(banner_id, created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ad_banner_events_browser ON ad_banner_events(browser_name)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ad_banner_events_device_brand ON ad_banner_events(device_brand)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ad_banner_events_geo ON ad_banner_events(country, region, city)');
    console.log('✅ Ad banners tables ready');

    // =====================================================
    // Step 12: Reservations (tables booking module)
    // =====================================================
    await ensureReservationSchema({ client });
    console.log('✅ Reservations tables ready');

    // await client.query('COMMIT');
    console.log('✅ Migration completed successfully!');
    return true;

  } catch (error) {
    // await client.query('ROLLBACK');
    console.error('❌ Migration error:', error.message);
    console.error(error);
    return false;
  } finally {
    client.release();
  }
}

// If called directly (npm run migrate), exit after migration
if (require.main === module) {
  migrate().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = migrate;
