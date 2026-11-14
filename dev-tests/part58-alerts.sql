-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part58 (grieviq-89, 14 Nov 2026): alerts that can't be missed.
--
--   Staff: an urgent item (a pilot request, a complaint in a GrievIQ-assisted
--   ward, a danger complaint that has reached GrievIQ staff) alerts the staff
--   whose job it is on their phones and in a red bar on every admin page,
--   again after 15 minutes, and the super admin after 1 hour, until someone
--   taps "I'll take it". One owner; everyone else's alerts stop. Items that
--   aren't about danger wait for GrievIQ's working hours (set by the super
--   admin; default every day 9 am to 7 pm India time).
--   Offices: a danger complaint not acknowledged gets reminders at 2 and 4
--   hours; a department reminder 4 hours after a danger complaint is
--   forwarded with no reply. Other alerts wait out each office's quiet hours
--   (default 10 pm to 7 am), held until morning.
--
-- Adds tables and columns only. No data changes. No triggers (the trigger
-- count stays 44). Run ONCE ("duplicate column name" or "already exists"
-- means it was done).

CREATE TABLE IF NOT EXISTS staff_alerts (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('PILOT_REQUEST', 'ASSISTED_NEW', 'ASSISTED_DANGER', 'STAFF_DANGER')),
  item_id       TEXT NOT NULL,              -- the pilot request or the complaint
  always        INTEGER NOT NULL DEFAULT 0, -- 1: danger, ignores working hours
  created_at    TEXT NOT NULL,
  release_at    TEXT NOT NULL,              -- when it starts alerting (working hours)
  alerted_at    TEXT,                       -- first alert sent
  realerted_at  TEXT,                       -- second alert (15 minutes)
  escalated_at  TEXT,                       -- super admin alerted (1 hour)
  taken_by      TEXT,
  taken_at      TEXT,
  owner_reminded_at TEXT,                   -- one reminder to the owner (4 working hours)
  done_at       TEXT,
  done_reason   TEXT,
  UNIQUE (kind, item_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_alerts_open ON staff_alerts (done_at, release_at);

-- A staff member switched one kind of alert off for themselves.
CREATE TABLE IF NOT EXISTS staff_alert_prefs (
  email       TEXT NOT NULL,
  kind        TEXT NOT NULL,
  off_at      TEXT NOT NULL,
  PRIMARY KEY (email, kind)
);

-- An office's quiet hours for alerts that aren't about danger (no row = 22:00 to 07:00).
CREATE TABLE IF NOT EXISTS office_quiet_hours (
  office_tier TEXT NOT NULL,                -- LOCAL / MAYOR / MLA / MP / DEPT
  office_id   TEXT NOT NULL,
  quiet_from  TEXT,                         -- "HH:MM" India time; NULL with quiet_to NULL = no quiet hours
  quiet_to    TEXT,
  updated_by  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (office_tier, office_id)
);

-- A notice held during quiet hours goes out at this time.
ALTER TABLE notifications ADD COLUMN held_until TEXT;
CREATE INDEX IF NOT EXISTS idx_notifications_held ON notifications (held_until);
