-- =====================================================
-- СИСТЕМА УПРАВЛЕНИЯ ЗАКАЗАМИ - МУЛЬТИРЕСТОРАННАЯ
-- =====================================================

-- Рестораны
CREATE TABLE IF NOT EXISTS restaurants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  phone VARCHAR(20),
  telegram_bot_token VARCHAR(255),
  telegram_group_id VARCHAR(100),
  payme_enabled BOOLEAN DEFAULT false,
  payme_merchant_id VARCHAR(128),
  payme_api_login VARCHAR(255),
  payme_api_password VARCHAR(255),
  payme_account_key VARCHAR(64) DEFAULT 'order_id',
  payme_test_mode BOOLEAN DEFAULT false,
  payme_callback_timeout_ms INTEGER DEFAULT 2000,
  cash_enabled BOOLEAN DEFAULT true,
  card_payment_title VARCHAR(120),
  card_payment_number VARCHAR(40),
  card_payment_holder VARCHAR(120),
  card_receipt_target VARCHAR(16) DEFAULT 'bot' CHECK (card_receipt_target IN ('bot', 'admin')),
  send_balance_after_confirm BOOLEAN DEFAULT false,
  send_daily_close_report BOOLEAN DEFAULT false,
  close_report_last_sent_at TIMESTAMP,
  payment_placeholders JSONB DEFAULT '{}'::jsonb,
  logo_display_mode VARCHAR(20) DEFAULT 'square' CHECK (logo_display_mode IN ('square', 'horizontal')),
  ui_theme VARCHAR(20) DEFAULT 'classic' CHECK (ui_theme IN ('classic', 'modern', 'talablar_blue', 'mint_fresh', 'sunset_pop', 'berry_blast', 'violet_wave', 'rainbow')),
  currency_code VARCHAR(8) DEFAULT 'uz',
  reservation_cost DECIMAL(12, 2) DEFAULT 0,
  activity_type_id INTEGER,
  operator_registration_code VARCHAR(64),
  admin_comment TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Пользователи (superadmin, operator, customer)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE,
  username VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  phone VARCHAR(20),
  role VARCHAR(20) DEFAULT 'customer' CHECK (role IN ('superadmin', 'operator', 'customer')),
  active_restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  last_activity_at TIMESTAMP,
  last_ip_address VARCHAR(64),
  last_user_agent TEXT,
  last_device_type VARCHAR(32),
  last_browser_name VARCHAR(80),
  last_browser_version VARCHAR(40),
  last_os_name VARCHAR(60),
  last_os_version VARCHAR(40),
  last_country VARCHAR(8),
  last_region VARCHAR(120),
  last_city VARCHAR(120),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Связь Telegram-аккаунта с админским профилем (owner/operator), чтобы один Telegram мог быть customer + admin
CREATE TABLE IF NOT EXISTS telegram_admin_links (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Связь операторов с ресторанами (многие-ко-многим)
CREATE TABLE IF NOT EXISTS operator_restaurants (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, restaurant_id)
);

-- Связь клиентов с ресторанами (взаимодействия и блокировка по ресторану)
CREATE TABLE IF NOT EXISTS user_restaurants (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  is_blocked BOOLEAN DEFAULT false,
  first_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, restaurant_id)
);

-- Категории (привязаны к ресторану)
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
  name_ru VARCHAR(255) NOT NULL,
  name_uz VARCHAR(255),
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Товары (привязаны к ресторану)
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name_ru VARCHAR(255) NOT NULL,
  name_uz VARCHAR(255),
  description_ru TEXT,
  description_uz TEXT,
  image_url TEXT,
  thumb_url TEXT,
  product_images JSONB DEFAULT '[]'::jsonb,
  price DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(20) DEFAULT 'шт',
  order_step DECIMAL(10, 2),
  barcode VARCHAR(100),
  in_stock BOOLEAN DEFAULT true,
  season_scope VARCHAR(16) DEFAULT 'all',
  is_hidden_catalog BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Заказы (привязаны к ресторану)
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'new',
  total_amount DECIMAL(10, 2) NOT NULL,
  delivery_address TEXT,
  delivery_coordinates TEXT,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  payment_method VARCHAR(20) DEFAULT 'cash',
  payment_status VARCHAR(20) DEFAULT 'unpaid',
  payment_provider VARCHAR(32),
  payment_reference VARCHAR(128),
  payment_paid_at TIMESTAMP,
  payment_cancelled_at TIMESTAMP,
  payment_receipt_chat_id TEXT,
  payment_receipt_message_id BIGINT,
  payment_receipt_file_id TEXT,
  payment_receipt_submitted_at TIMESTAMP,
  comment TEXT,
  service_rating INTEGER DEFAULT 0,
  delivery_rating INTEGER DEFAULT 0,
  rating_requested_at TIMESTAMP,
  cancel_reason TEXT,
  cancelled_at_status VARCHAR(20),
  delivery_date DATE,
  delivery_time TIME,
  processed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  processed_at TIMESTAMP,
  admin_message_id BIGINT,
  admin_chat_id TEXT,
  source_type VARCHAR(20) DEFAULT 'order' CHECK (source_type IN ('order', 'reservation')),
  reservation_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Позиции заказа
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(20),
  price DECIMAL(10, 2) NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- История статусов заказа
CREATE TABLE IF NOT EXISTS order_status_history (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL,
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Настройки бронирования (по ресторану)
CREATE TABLE IF NOT EXISTS restaurant_reservation_settings (
  restaurant_id INTEGER PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  reservation_fee DECIMAL(12, 2) DEFAULT 0,
  reservation_service_cost DECIMAL(12, 2) DEFAULT 0,
  max_duration_minutes INTEGER DEFAULT 180,
  time_slot_step_minutes INTEGER DEFAULT 30 CHECK (time_slot_step_minutes BETWEEN 5 AND 60),
  allow_multi_table BOOLEAN DEFAULT true,
  prepay_mode VARCHAR(20) DEFAULT 'none' CHECK (prepay_mode IN ('none', 'fixed', 'percent')),
  prepay_percent DECIMAL(5, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Этажи бронирования
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
);

-- Системные шаблоны столов
CREATE TABLE IF NOT EXISTS reservation_table_templates (
  id SERIAL PRIMARY KEY,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  shape VARCHAR(20) DEFAULT 'round' CHECK (shape IN ('round', 'square', 'rect', 'sofa', 'custom')),
  seats_count INTEGER DEFAULT 2,
  width DECIMAL(8, 2) DEFAULT 1,
  height DECIMAL(8, 2) DEFAULT 1,
  is_system BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Столы на этажах
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
);

-- Бронирования
CREATE TABLE IF NOT EXISTS reservations (
  id SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reservation_number VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show')),
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  guests_count INTEGER DEFAULT 1,
  booking_mode VARCHAR(24) DEFAULT 'reservation_only' CHECK (booking_mode IN ('reservation_only', 'with_items')),
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
);

-- Связь броней и столов (многие-ко-многим)
CREATE TABLE IF NOT EXISTS reservation_tables_map (
  id SERIAL PRIMARY KEY,
  reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  table_id INTEGER NOT NULL REFERENCES reservation_tables(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(reservation_id, table_id)
);

-- История статусов брони
CREATE TABLE IF NOT EXISTS reservation_status_history (
  id SERIAL PRIMARY KEY,
  reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL,
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Логи активности (для супер-админа)
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
);

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
);

-- =====================================================
-- ИНДЕКСЫ
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_telegram_admin_links_telegram_id ON telegram_admin_links(telegram_id);
CREATE INDEX IF NOT EXISTS idx_telegram_admin_links_user_id ON telegram_admin_links(user_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active_restaurant ON users(active_restaurant_id);

CREATE INDEX IF NOT EXISTS idx_operator_restaurants_user ON operator_restaurants(user_id);
CREATE INDEX IF NOT EXISTS idx_operator_restaurants_restaurant ON operator_restaurants(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_user_restaurants_user ON user_restaurants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_restaurants_restaurant ON user_restaurants(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_categories_restaurant ON categories(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_products_restaurant ON products(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_processed_by ON orders(processed_by);
CREATE INDEX IF NOT EXISTS idx_orders_reservation_id ON orders(reservation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_payme_login_unique ON restaurants(payme_api_login) WHERE payme_api_login IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payme_transactions_restaurant ON payme_transactions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_payme_transactions_order ON payme_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payme_transactions_state ON payme_transactions(state);
CREATE INDEX IF NOT EXISTS idx_payme_transactions_create_time ON payme_transactions(create_time);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_restaurant ON activity_logs(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reservation_table_templates_code ON reservation_table_templates (LOWER(code));
CREATE UNIQUE INDEX IF NOT EXISTS uq_reservation_tables_floor_name ON reservation_tables (floor_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_reservation_floors_restaurant ON reservation_floors(restaurant_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_reservation_tables_restaurant_floor ON reservation_tables(restaurant_id, floor_id, is_active, id);
CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_date ON reservations(restaurant_id, booking_date, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_user ON reservations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservation_tables_map_reservation ON reservation_tables_map(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_tables_map_table ON reservation_tables_map(table_id);
CREATE INDEX IF NOT EXISTS idx_reservation_status_history_reservation ON reservation_status_history(reservation_id, created_at);

-- =====================================================
-- КОММЕНТАРИИ К ТИПАМ ДЕЙСТВИЙ ДЛЯ ЛОГОВ
-- =====================================================
-- action_type значения:
-- 'create_product', 'update_product', 'delete_product'
-- 'create_category', 'update_category', 'delete_category'
-- 'process_order', 'update_order_status', 'cancel_order'
-- 'create_user', 'update_user', 'delete_user'
-- 'create_restaurant', 'update_restaurant', 'delete_restaurant'
-- 'login', 'logout'
-- =====================================================
