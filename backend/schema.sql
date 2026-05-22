-- GeoQuest SQLite Schema

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL UNIQUE,
  username TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_active_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS merchants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_name TEXT NOT NULL,
  wallet_address TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  address TEXT,
  latitude REAL,
  longitude REAL,
  operating_hours TEXT,
  logo_url TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'easy',
  reward_amount REAL NOT NULL DEFAULT 0,
  reward_token TEXT NOT NULL DEFAULT 'USDm',
  estimated_duration_mins INTEGER,
  total_budget REAL NOT NULL DEFAULT 0,
  remaining_budget REAL NOT NULL DEFAULT 0,
  on_chain_trail_id INTEGER,
  active INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);

CREATE TABLE IF NOT EXISTS stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trail_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  challenge_type TEXT NOT NULL DEFAULT 'qr',
  challenge_payload TEXT,
  geofence_radius_m INTEGER NOT NULL DEFAULT 50,
  xp_reward INTEGER NOT NULL DEFAULT 50,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (trail_id) REFERENCES trails(id)
);

CREATE TABLE IF NOT EXISTS trail_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_address TEXT NOT NULL,
  trail_id INTEGER NOT NULL,
  tx_hash TEXT,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_address, trail_id)
);

CREATE TABLE IF NOT EXISTS stop_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_address TEXT NOT NULL,
  stop_id INTEGER NOT NULL,
  trail_id INTEGER NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_address, stop_id)
);

CREATE TABLE IF NOT EXISTS used_nonces (
  nonce TEXT PRIMARY KEY,
  used_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_trails_active ON trails(active);
CREATE INDEX IF NOT EXISTS idx_stops_trail_id ON stops(trail_id);
CREATE INDEX IF NOT EXISTS idx_stop_completions_user ON stop_completions(user_address, trail_id);
CREATE INDEX IF NOT EXISTS idx_trail_completions_user ON trail_completions(user_address);
