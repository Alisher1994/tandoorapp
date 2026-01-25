const fs = require('fs');
const path = require('path');
const pool = require('./connection');
const bcrypt = require('bcryptjs');

async function migrate() {
  try {
    console.log('🔄 Starting database migration...');
    
    // Check DATABASE_URL
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL is not set! Cannot run migrations.');
      console.error('Please ensure PostgreSQL is connected to your service in Railway.');
      return false;
    }
    
    console.log('📊 DATABASE_URL is set, connecting...');
    
    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await pool.query(schema);
    console.log('✅ Database schema created');
    
    // Create default admin user
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    const adminCheck = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [adminUsername]
    );
    
    if (adminCheck.rows.length === 0) {
      await pool.query(
        `INSERT INTO users (username, password, full_name, role) 
         VALUES ($1, $2, $3, $4)`,
        [adminUsername, hashedPassword, 'Administrator', 'admin']
      );
      console.log(`✅ Default admin user created: ${adminUsername} / ${adminPassword}`);
    } else {
      console.log('ℹ️  Admin user already exists');
    }
    
    console.log('✅ Migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Migration error:', error);
    // Don't throw, just log - allow server to start anyway
    return false;
  }
}

// If called directly (npm run migrate), exit after migration
if (require.main === module) {
  migrate().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = migrate;

