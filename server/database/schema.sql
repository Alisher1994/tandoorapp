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

-- Связь операторов с ресторанами (многие-ко-многим)
CREATE TABLE IF NOT EXISTS operator_restaurants (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
  price DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(20) DEFAULT 'шт',
  barcode VARCHAR(100),
  in_stock BOOLEAN DEFAULT true,
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
  comment TEXT,
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

-- =====================================================
-- ИНДЕКСЫ
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active_restaurant ON users(active_restaurant_id);

CREATE INDEX IF NOT EXISTS idx_operator_restaurants_user ON operator_restaurants(user_id);
CREATE INDEX IF NOT EXISTS idx_operator_restaurants_restaurant ON operator_restaurants(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_categories_restaurant ON categories(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_products_restaurant ON products(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_processed_by ON orders(processed_by);

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
