const pool = require('../database/connection');

let reservationSchemaReady = false;
let reservationSchemaPromise = null;

const SYSTEM_TABLE_TEMPLATES = [
  {
    code: 'table_round_2',
    name: 'Круглый стол (2 места)',
    shape: 'round',
    seats_count: 2,
    width: 1.0,
    height: 1.0
  },
  {
    code: 'table_round_4',
    name: 'Круглый стол (4 места)',
    shape: 'round',
    seats_count: 4,
    width: 1.2,
    height: 1.2
  },
  {
    code: 'table_square_4',
    name: 'Квадратный стол (4 места)',
    shape: 'square',
    seats_count: 4,
    width: 1.2,
    height: 1.2
  },
  {
    code: 'table_rect_6',
    name: 'Прямоугольный стол (6 мест)',
    shape: 'rect',
    seats_count: 6,
    width: 1.8,
    height: 1.1
  },
  {
    code: 'table_sofa_4',
    name: 'Диванный стол (4 места)',
    shape: 'sofa',
    seats_count: 4,
    width: 2.0,
    height: 1.1
  }
];

const run = async (executor, sql, params = []) => executor.query(sql, params);

async function createReservationSchema(executor) {
  await run(executor, `
    ALTER TABLE restaurants
    ADD COLUMN IF NOT EXISTS reservation_cost DECIMAL(12, 2) DEFAULT 0
  `);
  await run(executor, `
    UPDATE restaurants
    SET reservation_cost = 0
    WHERE reservation_cost IS NULL
  `);

  await run(executor, `
    CREATE TABLE IF NOT EXISTS restaurant_reservation_settings (
      restaurant_id INTEGER PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
      enabled BOOLEAN DEFAULT false,
      reservation_fee DECIMAL(12, 2) DEFAULT 0,
      reservation_service_cost DECIMAL(12, 2) DEFAULT 0,
      max_duration_minutes INTEGER DEFAULT 180,
      allow_multi_table BOOLEAN DEFAULT true,
      prepay_mode VARCHAR(20) DEFAULT 'none',
      prepay_percent DECIMAL(5, 2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await run(executor, `
    ALTER TABLE restaurant_reservation_settings
    ADD CONSTRAINT IF NOT EXISTS restaurant_reservation_settings_prepay_mode_check
    CHECK (prepay_mode IN ('none', 'fixed', 'percent'))
  `).catch(() => {});
  await run(executor, `
    UPDATE restaurant_reservation_settings
    SET reservation_service_cost = 0
    WHERE reservation_service_cost IS NULL
  `).catch(() => {});

  await run(executor, `
    CREATE TABLE IF NOT EXISTS reservation_floors (
      id SERIAL PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      sort_order INTEGER DEFAULT 0,
      image_url TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(executor, `
    CREATE TABLE IF NOT EXISTS reservation_table_templates (
      id SERIAL PRIMARY KEY,
      code VARCHAR(80) NOT NULL,
      name VARCHAR(160) NOT NULL,
      shape VARCHAR(20) DEFAULT 'round',
      seats_count INTEGER DEFAULT 2,
      width DECIMAL(8, 2) DEFAULT 1,
      height DECIMAL(8, 2) DEFAULT 1,
      is_system BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await run(executor, `
    CREATE UNIQUE INDEX IF NOT EXISTS uq_reservation_table_templates_code
    ON reservation_table_templates (LOWER(code))
  `);
  await run(executor, `
    ALTER TABLE reservation_table_templates
    ADD CONSTRAINT IF NOT EXISTS reservation_table_templates_shape_check
    CHECK (shape IN ('round', 'square', 'rect', 'sofa', 'custom'))
  `).catch(() => {});

  await run(executor, `
    CREATE TABLE IF NOT EXISTS reservation_tables (
      id SERIAL PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      floor_id INTEGER NOT NULL REFERENCES reservation_floors(id) ON DELETE CASCADE,
      template_id INTEGER REFERENCES reservation_table_templates(id) ON DELETE SET NULL,
      name VARCHAR(120) NOT NULL,
      capacity INTEGER DEFAULT 1,
      photo_url TEXT,
      x DECIMAL(10, 3) DEFAULT 0,
      y DECIMAL(10, 3) DEFAULT 0,
      rotation DECIMAL(8, 2) DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await run(executor, `
    ALTER TABLE reservation_tables
    ADD COLUMN IF NOT EXISTS photo_url TEXT
  `).catch(() => {});
  await run(executor, `
    CREATE UNIQUE INDEX IF NOT EXISTS uq_reservation_tables_floor_name
    ON reservation_tables (floor_id, LOWER(name))
  `);

  await run(executor, `
    CREATE TABLE IF NOT EXISTS reservations (
      id SERIAL PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reservation_number VARCHAR(50) NOT NULL UNIQUE,
      status VARCHAR(20) DEFAULT 'new',
      booking_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      guests_count INTEGER DEFAULT 1,
      booking_mode VARCHAR(24) DEFAULT 'reservation_only',
      reservation_fee DECIMAL(12, 2) DEFAULT 0,
      items_prepay_amount DECIMAL(12, 2) DEFAULT 0,
      service_fee DECIMAL(12, 2) DEFAULT 0,
      total_prepay_amount DECIMAL(12, 2) DEFAULT 0,
      payment_method VARCHAR(20) DEFAULT 'cash',
      payment_status VARCHAR(20) DEFAULT 'unpaid',
      is_paid BOOLEAN DEFAULT false,
      paid_amount DECIMAL(12, 2) DEFAULT 0,
      comment TEXT,
      cancel_reason TEXT,
      cancelled_at_status VARCHAR(20),
      processed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      processed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await run(executor, `
    ALTER TABLE reservations
    ADD CONSTRAINT IF NOT EXISTS reservations_status_check
    CHECK (status IN ('new', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'))
  `).catch(() => {});
  await run(executor, `
    ALTER TABLE reservations
    ADD CONSTRAINT IF NOT EXISTS reservations_booking_mode_check
    CHECK (booking_mode IN ('reservation_only', 'with_items'))
  `).catch(() => {});

  await run(executor, `
    CREATE TABLE IF NOT EXISTS reservation_tables_map (
      id SERIAL PRIMARY KEY,
      reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      table_id INTEGER NOT NULL REFERENCES reservation_tables(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(reservation_id, table_id)
    )
  `);

  await run(executor, `
    CREATE TABLE IF NOT EXISTS reservation_status_history (
      id SERIAL PRIMARY KEY,
      reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL,
      changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      comment TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(executor, `
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'order'
  `).catch(() => {});
  await run(executor, `
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS reservation_id INTEGER REFERENCES reservations(id) ON DELETE SET NULL
  `).catch(() => {});
  await run(executor, `
    UPDATE orders
    SET source_type = 'order'
    WHERE source_type IS NULL OR BTRIM(source_type) = ''
  `).catch(() => {});
  await run(executor, `
    ALTER TABLE orders
    ADD CONSTRAINT IF NOT EXISTS orders_source_type_check
    CHECK (source_type IN ('order', 'reservation'))
  `).catch(() => {});

  await run(executor, `
    CREATE INDEX IF NOT EXISTS idx_restaurants_reservation_cost
    ON restaurants(reservation_cost)
  `).catch(() => {});
  await run(executor, `
    CREATE INDEX IF NOT EXISTS idx_reservation_floors_restaurant
    ON reservation_floors(restaurant_id, sort_order, id)
  `);
  await run(executor, `
    CREATE INDEX IF NOT EXISTS idx_reservation_tables_restaurant_floor
    ON reservation_tables(restaurant_id, floor_id, is_active, id)
  `);
  await run(executor, `
    CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_date
    ON reservations(restaurant_id, booking_date, start_time, end_time)
  `);
  await run(executor, `
    CREATE INDEX IF NOT EXISTS idx_reservations_status
    ON reservations(status)
  `);
  await run(executor, `
    CREATE INDEX IF NOT EXISTS idx_reservations_user
    ON reservations(user_id, created_at DESC)
  `);
  await run(executor, `
    CREATE INDEX IF NOT EXISTS idx_reservation_tables_map_reservation
    ON reservation_tables_map(reservation_id)
  `);
  await run(executor, `
    CREATE INDEX IF NOT EXISTS idx_reservation_tables_map_table
    ON reservation_tables_map(table_id)
  `);
  await run(executor, `
    CREATE INDEX IF NOT EXISTS idx_reservation_status_history_reservation
    ON reservation_status_history(reservation_id, created_at)
  `);
  await run(executor, `
    CREATE INDEX IF NOT EXISTS idx_orders_reservation_id
    ON orders(reservation_id)
  `).catch(() => {});

  for (const template of SYSTEM_TABLE_TEMPLATES) {
    await run(executor, `
      INSERT INTO reservation_table_templates (
        code, name, shape, seats_count, width, height, is_system
      )
      VALUES ($1, $2, $3, $4, $5, $6, true)
      ON CONFLICT ((LOWER(code)))
      DO UPDATE SET
        name = EXCLUDED.name,
        shape = EXCLUDED.shape,
        seats_count = EXCLUDED.seats_count,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        is_system = true,
        updated_at = CURRENT_TIMESTAMP
    `, [
      template.code,
      template.name,
      template.shape,
      template.seats_count,
      template.width,
      template.height
    ]);
  }
}

async function ensureReservationSchema(options = {}) {
  const { client = null, force = false } = options;
  if (reservationSchemaReady && !force) return;
  if (reservationSchemaPromise && !force && !client) {
    await reservationSchemaPromise;
    return;
  }

  const executor = client || pool;

  if (client) {
    await createReservationSchema(executor);
    reservationSchemaReady = true;
    return;
  }

  reservationSchemaPromise = (async () => {
    await createReservationSchema(executor);
    reservationSchemaReady = true;
  })();

  try {
    await reservationSchemaPromise;
  } finally {
    reservationSchemaPromise = null;
  }
}

module.exports = {
  ensureReservationSchema
};
