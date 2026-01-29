const fs = require('fs');
const path = require('path');
const pool = require('./connection');
const bcrypt = require('bcryptjs');

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
    
    await client.query('BEGIN');
    
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
      'delivery_zone JSONB',
      'start_time VARCHAR(5)',
      'end_time VARCHAR(5)',
      'click_url TEXT',
      'payme_url TEXT',
      'msg_new TEXT',
      'msg_preparing TEXT',
      'msg_delivering TEXT',
      'msg_delivered TEXT',
      'msg_cancelled TEXT',
      'support_username VARCHAR(100)'
    ];
    
    for (const col of restaurantColumns) {
      try {
        await client.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS ${col}`);
      } catch (e) {}
    }
    
    console.log('✅ Restaurants table ready');
    
    // =====================================================
    // Step 2: Add new columns to existing tables
    // =====================================================
    
    // Add columns to users table
    const userColumns = [
      { name: 'active_restaurant_id', type: 'INTEGER REFERENCES restaurants(id) ON DELETE SET NULL' },
      { name: 'is_active', type: 'BOOLEAN DEFAULT true' },
      { name: 'last_latitude', type: 'DECIMAL(10, 8)' },
      { name: 'last_longitude', type: 'DECIMAL(11, 8)' },
      { name: 'last_address', type: 'TEXT' }
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
      { name: 'restaurant_id', type: 'INTEGER REFERENCES restaurants(id) ON DELETE CASCADE' }
    ];
    
    for (const col of productColumns) {
      try {
        await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
      } catch (e) {
        if (e.code !== '42701') console.log(`ℹ️  Column products.${col.name}: ${e.message}`);
      }
    }
    console.log('✅ Products table updated');
    
    // Add columns to orders table
    const orderColumns = [
      { name: 'restaurant_id', type: 'INTEGER REFERENCES restaurants(id) ON DELETE SET NULL' },
      { name: 'processed_by', type: 'INTEGER REFERENCES users(id) ON DELETE SET NULL' },
      { name: 'processed_at', type: 'TIMESTAMP' },
      { name: 'admin_message_id', type: 'BIGINT' },
      { name: 'admin_chat_id', type: 'TEXT' },
      { name: 'admin_comment', type: 'TEXT' },
      { name: 'cancel_reason', type: 'TEXT' },
      { name: 'cancelled_at_status', type: 'VARCHAR(20)' }
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
        first_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, restaurant_id)
      )
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
        process.env.TELEGRAM_BOT_TOKEN || '',
        process.env.TELEGRAM_ADMIN_CHAT_ID || ''
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
    
    await client.query('COMMIT');
    console.log('✅ Migration completed successfully!');
    return true;
    
  } catch (error) {
    await client.query('ROLLBACK');
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
