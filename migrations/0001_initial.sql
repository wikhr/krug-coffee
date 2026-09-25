CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer', 'staff', 'admin')),
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_by_user ON sessions(user_id);

CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX email_tokens_by_user ON email_tokens(user_id, purpose);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_kopeks INTEGER NOT NULL CHECK (price_kopeks >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX menu_items_by_category ON menu_items(category_id, sort_order);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('pickup', 'dine_in')),
  table_number TEXT,
  status TEXT NOT NULL CHECK (status IN ('awaiting_demo_payment', 'new', 'preparing', 'ready', 'completed', 'canceled')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('pending', 'simulated_paid', 'declined', 'canceled')),
  total_kopeks INTEGER NOT NULL CHECK (total_kopeks >= 0),
  idempotency_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, idempotency_key)
);
CREATE INDEX orders_by_user ON orders(user_id, created_at DESC);
CREATE INDEX orders_by_status ON orders(status, created_at DESC);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id TEXT REFERENCES menu_items(id),
  name_snapshot TEXT NOT NULL,
  price_kopeks INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99)
);
CREATE INDEX order_items_by_order ON order_items(order_id);

CREATE TABLE mock_payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  request_id TEXT NOT NULL UNIQUE,
  scenario TEXT NOT NULL CHECK (scenario IN ('success', 'decline', 'cancel')),
  created_at INTEGER NOT NULL
);
CREATE INDEX mock_payments_by_order ON mock_payments(order_id, created_at DESC);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX audit_by_time ON audit_log(created_at DESC);
