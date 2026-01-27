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
      console.error('Please ensure PostgreSQL is connected to your service in Railway.');
      return false;
    }
    
    console.log('📊 DATABASE_URL is set, connecting...');
    
    await client.query('BEGIN');
    
    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await client.query(schema);
    console.log('✅ Database schema created');
    
    // =====================================================
    // Migrate existing data if needed
    // =====================================================
    
    // Update old 'admin' role to 'superadmin'
    await client.query(`
      UPDATE users SET role = 'superadmin' WHERE role = 'admin'
    `);
    console.log('✅ Updated admin roles to superadmin');
    
    // =====================================================
    // Create default restaurant if none exists
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
      console.log(`ℹ️  Restaurant already exists with ID: ${defaultRestaurantId}`);
    }
    
    // =====================================================
    // Create superadmin user
    // =====================================================
    
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    const adminCheck = await client.query(
      'SELECT id, role FROM users WHERE username = $1',
      [adminUsername]
    );
    
    if (adminCheck.rows.length === 0) {
      const adminResult = await client.query(`
        INSERT INTO users (username, password, full_name, role, is_active) 
        VALUES ($1, $2, $3, 'superadmin', true)
        RETURNING id
      `, [adminUsername, hashedPassword, 'Super Administrator']);
      
      console.log(`✅ Superadmin created: ${adminUsername}`);
      
      // Link superadmin to default restaurant
      await client.query(`
        INSERT INTO operator_restaurants (user_id, restaurant_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [adminResult.rows[0].id, defaultRestaurantId]);
      
      // Set active restaurant for superadmin
      await client.query(`
        UPDATE users SET active_restaurant_id = $1 WHERE id = $2
      `, [defaultRestaurantId, adminResult.rows[0].id]);
      
    } else {
      // Update existing admin to superadmin if needed
      if (adminCheck.rows[0].role !== 'superadmin') {
        await client.query(`
          UPDATE users SET role = 'superadmin' WHERE id = $1
        `, [adminCheck.rows[0].id]);
        console.log(`✅ Updated ${adminUsername} to superadmin`);
      }
      
      // Ensure superadmin has access to default restaurant
      await client.query(`
        INSERT INTO operator_restaurants (user_id, restaurant_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [adminCheck.rows[0].id, defaultRestaurantId]);
      
      // Set active restaurant if not set
      await client.query(`
        UPDATE users SET active_restaurant_id = $1 
        WHERE id = $2 AND active_restaurant_id IS NULL
      `, [defaultRestaurantId, adminCheck.rows[0].id]);
      
      console.log('ℹ️  Superadmin already exists');
    }
    
    // =====================================================
    // Migrate existing products and categories to default restaurant
    // =====================================================
    
    await client.query(`
      UPDATE categories SET restaurant_id = $1 WHERE restaurant_id IS NULL
    `, [defaultRestaurantId]);
    
    await client.query(`
      UPDATE products SET restaurant_id = $1 WHERE restaurant_id IS NULL
    `, [defaultRestaurantId]);
    
    await client.query(`
      UPDATE orders SET restaurant_id = $1 WHERE restaurant_id IS NULL
    `, [defaultRestaurantId]);
    
    console.log('✅ Migrated existing data to default restaurant');
    
    await client.query('COMMIT');
    console.log('✅ Migration completed successfully');
    return true;
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration error:', error);
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
