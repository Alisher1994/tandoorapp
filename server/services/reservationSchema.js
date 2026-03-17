const pool = require('../database/connection');

let reservationSchemaReady = false;
let reservationSchemaPromise = null;
const RESERVATION_FURNITURE_CATEGORIES = new Set(['tables_chairs', 'bed', 'garage_box', 'work_desk', 'bunk']);
const normalizeReservationFurnitureCategory = (value, fallback = 'tables_chairs') => {
  const normalized = String(value || '').trim().toLowerCase();
  return RESERVATION_FURNITURE_CATEGORIES.has(normalized) ? normalized : fallback;
};

const SYSTEM_TABLE_TEMPLATES = [
  {
    code: 'table_round_2',
    name: 'Круглый стол (2 места)',
    shape: 'round',
    furniture_category: 'tables_chairs',
    seats_count: 2,
    width: 1.0,
    height: 1.0,
    image_url: '/reservation-furniture/table_round_2.png'
  },
  {
    code: 'table_round_4',
    name: 'Круглый стол (4 места)',
    shape: 'round',
    furniture_category: 'tables_chairs',
    seats_count: 4,
    width: 1.2,
    height: 1.2,
    image_url: '/reservation-furniture/table_round_4.png'
  },
  {
    code: 'table_square_4',
    name: 'Квадратный стол (4 места)',
    shape: 'square',
    furniture_category: 'tables_chairs',
    seats_count: 4,
    width: 1.2,
    height: 1.2,
    image_url: '/reservation-furniture/table_square_4.png'
  },
  {
    code: 'table_rect_6',
    name: 'Прямоугольный стол (6 мест)',
    shape: 'rect',
    furniture_category: 'tables_chairs',
    seats_count: 6,
    width: 1.8,
    height: 1.1,
    image_url: '/reservation-furniture/table_rect_6.png'
  },
  {
    code: 'table_sofa_4',
    name: 'Диванный стол (4 места)',
    shape: 'sofa',
    furniture_category: 'tables_chairs',
    seats_count: 4,
    width: 2.0,
    height: 1.1,
    image_url: '/reservation-furniture/table_sofa_4.png'
  },
  {
    code: 'table_round_1',
    name: 'Одиночный стол (1 место)',
    shape: 'round',
    furniture_category: 'tables_chairs',
    seats_count: 1,
    width: 0.8,
    height: 0.8,
    image_url: '/reservation-furniture/table_round_2.png'
  },
  {
    code: 'table_square_2',
    name: 'Квадратный стол (2 места)',
    shape: 'square',
    furniture_category: 'tables_chairs',
    seats_count: 2,
    width: 1.0,
    height: 1.0,
    image_url: '/reservation-furniture/table_square_4.png'
  },
  {
    code: 'table_rect_4',
    name: 'Прямоугольный стол (4 места)',
    shape: 'rect',
    furniture_category: 'tables_chairs',
    seats_count: 4,
    width: 1.5,
    height: 1.0,
    image_url: '/reservation-furniture/table_rect_6.png'
  },
  {
    code: 'table_rect_8',
    name: 'Прямоугольный стол (8 мест)',
    shape: 'rect',
    furniture_category: 'tables_chairs',
    seats_count: 8,
    width: 2.2,
    height: 1.2,
    image_url: '/reservation-furniture/table_rect_6.png'
  },
  {
    code: 'table_sofa_2',
    name: 'Диванный стол (2 места)',
    shape: 'sofa',
    furniture_category: 'tables_chairs',
    seats_count: 2,
    width: 1.6,
    height: 1.0,
    image_url: '/reservation-furniture/table_sofa_4.png'
  },
  {
    code: 'table_sofa_6',
    name: 'Диванный стол (6 мест)',
    shape: 'sofa',
    furniture_category: 'tables_chairs',
    seats_count: 6,
    width: 2.4,
    height: 1.2,
    image_url: '/reservation-furniture/table_sofa_4.png'
  },
  {
    code: 'bed_single_1',
    name: 'Кровать (1 место)',
    shape: 'custom',
    furniture_category: 'bed',
    seats_count: 1,
    width: 2.0,
    height: 1.0,
    image_url: '/reservation-furniture/bed_single.svg'
  },
  {
    code: 'bed_double_2',
    name: 'Кровать (2 места)',
    shape: 'custom',
    furniture_category: 'bed',
    seats_count: 2,
    width: 2.3,
    height: 1.4,
    image_url: '/reservation-furniture/bed_double.svg'
  },
  {
    code: 'garage_box_1',
    name: 'Гаражный бокс (1 место)',
    shape: 'custom',
    furniture_category: 'garage_box',
    seats_count: 1,
    width: 2.8,
    height: 1.6,
    image_url: '/reservation-furniture/garage_box.svg'
  },
  {
    code: 'work_desk_1',
    name: 'Рабочий стол (1 место)',
    shape: 'custom',
    furniture_category: 'work_desk',
    seats_count: 1,
    width: 1.6,
    height: 0.9,
    image_url: '/reservation-furniture/work_desk.svg'
  },
  {
    code: 'bunk_bed_2',
    name: 'Койка (2 места)',
    shape: 'custom',
    furniture_category: 'bunk',
    seats_count: 2,
    width: 2.2,
    height: 1.1,
    image_url: '/reservation-furniture/bunk_bed.svg'
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
      time_slot_step_minutes INTEGER DEFAULT 30,
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
    ALTER TABLE restaurant_reservation_settings
    ADD COLUMN IF NOT EXISTS time_slot_step_minutes INTEGER DEFAULT 30
  `).catch(() => {});
  await run(executor, `
    UPDATE restaurant_reservation_settings
    SET time_slot_step_minutes = 30
    WHERE time_slot_step_minutes IS NULL
  `).catch(() => {});
  await run(executor, `
    ALTER TABLE restaurant_reservation_settings
    ADD CONSTRAINT IF NOT EXISTS restaurant_reservation_settings_time_slot_step_check
    CHECK (time_slot_step_minutes BETWEEN 5 AND 60)
  `).catch(() => {});

  await run(executor, `
    CREATE TABLE IF NOT EXISTS reservation_floors (
      id SERIAL PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      sort_order INTEGER DEFAULT 0,
      image_url TEXT,
      plan_image_opacity DECIMAL(4, 3) DEFAULT 1,
      plan_dark_overlay DECIMAL(4, 3) DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await run(executor, `
    ALTER TABLE reservation_floors
    ADD COLUMN IF NOT EXISTS plan_image_opacity DECIMAL(4, 3) DEFAULT 1
  `).catch(() => {});
  await run(executor, `
    ALTER TABLE reservation_floors
    ADD COLUMN IF NOT EXISTS plan_dark_overlay DECIMAL(4, 3) DEFAULT 0
  `).catch(() => {});
  await run(executor, `
    UPDATE reservation_floors
    SET plan_image_opacity = 1
    WHERE plan_image_opacity IS NULL
  `).catch(() => {});
  await run(executor, `
    UPDATE reservation_floors
    SET plan_dark_overlay = 0
    WHERE plan_dark_overlay IS NULL
  `).catch(() => {});
  await run(executor, `
    ALTER TABLE reservation_floors
    ADD CONSTRAINT IF NOT EXISTS reservation_floors_plan_image_opacity_check
    CHECK (plan_image_opacity >= 0 AND plan_image_opacity <= 1)
  `).catch(() => {});
  await run(executor, `
    ALTER TABLE reservation_floors
    ADD CONSTRAINT IF NOT EXISTS reservation_floors_plan_dark_overlay_check
    CHECK (plan_dark_overlay >= 0 AND plan_dark_overlay <= 1)
  `).catch(() => {});

  await run(executor, `
    CREATE TABLE IF NOT EXISTS reservation_table_templates (
      id SERIAL PRIMARY KEY,
      code VARCHAR(80) NOT NULL,
      name VARCHAR(160) NOT NULL,
      shape VARCHAR(20) DEFAULT 'round',
      image_url TEXT,
      furniture_category VARCHAR(32) DEFAULT 'tables_chairs',
      activity_type_id INTEGER,
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
    ADD COLUMN IF NOT EXISTS image_url TEXT
  `).catch(() => {});
  await run(executor, `
    ALTER TABLE reservation_table_templates
    ADD COLUMN IF NOT EXISTS furniture_category VARCHAR(32) DEFAULT 'tables_chairs'
  `).catch(() => {});
  await run(executor, `
    ALTER TABLE reservation_table_templates
    ADD COLUMN IF NOT EXISTS activity_type_id INTEGER
  `).catch(() => {});
  await run(executor, `
    UPDATE reservation_table_templates
    SET furniture_category = 'tables_chairs'
    WHERE furniture_category IS NULL OR BTRIM(furniture_category) = ''
  `).catch(() => {});
  await run(executor, `
    ALTER TABLE reservation_table_templates
    ADD CONSTRAINT IF NOT EXISTS reservation_table_templates_shape_check
    CHECK (shape IN ('round', 'square', 'rect', 'sofa', 'custom'))
  `).catch(() => {});
  await run(executor, `
    ALTER TABLE reservation_table_templates
    ADD CONSTRAINT IF NOT EXISTS reservation_table_templates_furniture_category_check
    CHECK (furniture_category IN ('tables_chairs', 'bed', 'garage_box', 'work_desk', 'bunk'))
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
    CREATE INDEX IF NOT EXISTS idx_reservation_table_templates_furniture_category
    ON reservation_table_templates(furniture_category, id)
  `).catch(() => {});
  await run(executor, `
    CREATE INDEX IF NOT EXISTS idx_reservation_table_templates_activity_type_id
    ON reservation_table_templates(activity_type_id, id)
  `).catch(() => {});
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
        code, name, shape, image_url, furniture_category, activity_type_id, seats_count, width, height, is_system
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
      ON CONFLICT ((LOWER(code)))
      DO UPDATE SET
        name = EXCLUDED.name,
        shape = EXCLUDED.shape,
        image_url = EXCLUDED.image_url,
        furniture_category = EXCLUDED.furniture_category,
        activity_type_id = EXCLUDED.activity_type_id,
        seats_count = EXCLUDED.seats_count,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        is_system = true,
        updated_at = CURRENT_TIMESTAMP
    `, [
      template.code,
      template.name,
      template.shape,
      template.image_url || null,
      normalizeReservationFurnitureCategory(template.furniture_category, 'tables_chairs'),
      null,
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
