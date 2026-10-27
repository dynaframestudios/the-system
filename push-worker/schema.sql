CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  subscription TEXT NOT NULL,
  tz TEXT NOT NULL,
  morning_enabled INTEGER NOT NULL DEFAULT 0,
  morning_time TEXT NOT NULL DEFAULT '08:00',
  evening_enabled INTEGER NOT NULL DEFAULT 0,
  evening_time TEXT NOT NULL DEFAULT '20:00',
  last_morning TEXT,
  last_evening TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS subs_token_idx ON subscriptions(token_hash);
