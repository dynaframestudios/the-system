-- Run once against the existing D1 database. Does not modify existing subscription rows.
CREATE TABLE IF NOT EXISTS notification_preferences (token_hash TEXT PRIMARY KEY, prefs TEXT NOT NULL, steps_logged_date TEXT);
CREATE TABLE IF NOT EXISTS notification_delivery (subscription_id TEXT NOT NULL, marker TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(subscription_id,marker));
CREATE INDEX IF NOT EXISTS notification_delivery_created ON notification_delivery(created_at);
