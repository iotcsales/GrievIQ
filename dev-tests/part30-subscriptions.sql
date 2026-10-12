-- Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part30-subscriptions.sql   (grieviq-46, October 2026)
--
-- Office subscriptions (approved 12 Oct 2026): each office's pilot dates,
-- the date it is paid up to, and anything the super admin set by hand
-- (pause, end, complimentary for department offices), always with a reason.
--   office_subscriptions  one row per office (created when first needed;
--                         an office with no row is a pilot until the date
--                         in Prices & site details)
--   subscription_events   every change, kept for good: two triggers refuse
--                         changing or deleting a record
--   bills: two new columns for bills the hourly job makes: they wait for a
--          super or operations admin to send them.
--
-- Adds new tables and two columns. No existing data is changed.
-- The trigger count goes from 32 to 34.
-- Run ONCE ("table ... already exists" / "duplicate column" means it was already done).

CREATE TABLE office_subscriptions (
  office_type TEXT NOT NULL CHECK (office_type IN ('REP','DEPT')),
  office_tier TEXT NOT NULL DEFAULT '',
  office_id TEXT NOT NULL,
  office_name TEXT NOT NULL,
  plan_id TEXT,
  pilot_start TEXT,
  pilot_end TEXT,
  paid_through TEXT,
  complimentary_until TEXT,
  complimentary_reason TEXT,
  paused_by_admin INTEGER NOT NULL DEFAULT 0,
  pause_reason TEXT,
  ended_at TEXT,
  end_reason TEXT,
  last_notice TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (office_type, office_tier, office_id)
);

CREATE TABLE subscription_events (
  id TEXT PRIMARY KEY,
  office_key TEXT NOT NULL,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX idx_subscription_events_office ON subscription_events (office_key, at);
CREATE TRIGGER no_update_subscription_events BEFORE UPDATE ON subscription_events
BEGIN SELECT RAISE(ABORT, 'Subscription records cannot be changed.'); END;
CREATE TRIGGER no_delete_subscription_events BEFORE DELETE ON subscription_events
BEGIN SELECT RAISE(ABORT, 'Subscription records cannot be deleted.'); END;

ALTER TABLE bills ADD COLUMN auto INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN sent_at TEXT;
