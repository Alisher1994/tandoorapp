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
  send_balance_after_confirm BOOLEAN DEFAULT false,
  send_daily_close_report BOOLEAN DEFAULT false,
  close_report_last_sent_at TIMESTAMP,
  payment_placeholders JSONB DEFAULT '{}'::jsonb,
  logo_display_mode VARCHAR(20) DEFAULT 'square' CHECK (logo_display_mode IN ('square', 'horizontal')),
  ui_theme VARCHAR(20) DEFAULT 'classic' CHECK (ui_theme IN ('classic', 'modern')),
  operator_registration_code VARCHAR(64),
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
  comment TEXT,
  cancel_reason TEXT,
  cancelled_at_status VARCHAR(20),
  delivery_date DATE,
  delivery_time TIME,
  processed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  processed_at TIMESTAMP,
  admin_message_id BIGINT,
  admin_chat_id TEXT,
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
