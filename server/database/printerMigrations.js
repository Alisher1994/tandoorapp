const pool = require('./connection');

async function runPrinterMigrations() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running printer migrations...');

    // 1. Create printers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS printers (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        printer_alias VARCHAR(50) NOT NULL, -- 'kitchen', 'bar', 'cashier'
        connection_type VARCHAR(20) DEFAULT 'network', -- 'network' or 'usb'
        ip_address VARCHAR(45),
        usb_vid_pid VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(restaurant_id, printer_alias)
      )
    `);

    // 2. Create printer_agents table (for Agent auth)
    await client.query(`
      CREATE TABLE IF NOT EXISTS printer_agents (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        name VARCHAR(100) DEFAULT 'Agent',
        agent_token VARCHAR(128) NOT NULL UNIQUE,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        last_connected_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2b. Ensure columns exist (idempotent)
    await client.query(`ALTER TABLE printer_agents ADD COLUMN IF NOT EXISTS name VARCHAR(100) DEFAULT 'Agent'`);
    await client.query(`ALTER TABLE printer_agents ADD COLUMN IF NOT EXISTS last_connected_at TIMESTAMP`);
    await client.query(`ALTER TABLE printers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

    // 3. Add printer_id to categories if not exists
    await client.query(`
      ALTER TABLE categories ADD COLUMN IF NOT EXISTS printer_id INTEGER REFERENCES printers(id) ON DELETE SET NULL
    `);

    // 4. Add printer_id to products if not exists
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS printer_id INTEGER REFERENCES printers(id) ON DELETE SET NULL
    `);

    // 5. Add additional shop metadata for receipts
    await client.query(`
      ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS receipt_logo_url TEXT;
      ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS receipt_header_text TEXT;
      ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS receipt_footer_text TEXT;
    `);

    console.log('✅ Printer migrations completed');
  } catch (error) {
    console.error('❌ Printer migration error:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = runPrinterMigrations;
