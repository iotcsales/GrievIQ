ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT 'operations_admin';

UPDATE admin_users SET role = 'super_admin' WHERE email = 'grieviq@gmail.com';

CREATE TABLE IF NOT EXISTS admin_events (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);