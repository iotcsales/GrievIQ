-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part57 (grieviq-88, 12 Nov 2026): GrievIQ-assisted wards (a pilot before
-- the ward's office joins).
--
--   A super admin starts a pilot: chosen wards whose office has NOT joined,
--   the dates filing is open, and a daily limit on new complaints. Citizens
--   there can file, after an honest notice that GrievIQ's team (not the
--   office) will send their complaint on and follow it up.
--   GrievIQ staff forward each complaint to the councillor's office and the
--   department (by email with a reply link, or by letter, call or visit),
--   follow up on days 3, 7 and 14, and record every reply. The citizen sees
--   each step on the Track page. Nothing moves up the chain on its own.
--   When the office joins, staff hand its open cases over: they move to the
--   office's console with fresh time limits.
--   Each office can be sent a private link (30 days) to a report on its own
--   ward: counts only, no citizen details, counts 1-9 shown as "<10".
--
-- Adds tables and columns only. No data changes. No triggers (the trigger
-- count stays 44).
-- Run ONCE ("duplicate column name" or "already exists" means it was done).

CREATE TABLE IF NOT EXISTS assisted_pilots (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  starts_on   TEXT NOT NULL,          -- YYYY-MM-DD, India time, first filing day
  ends_on     TEXT NOT NULL,          -- YYYY-MM-DD, last filing day
  daily_cap   INTEGER NOT NULL,       -- new complaints a day, all its wards together
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_by  TEXT,
  updated_at  TEXT,
  stopped_at  TEXT,                   -- filing stopped early (open cases carry on)
  stopped_by  TEXT
);

CREATE TABLE IF NOT EXISTS assisted_wards (
  id            TEXT PRIMARY KEY,
  pilot_id      TEXT NOT NULL,
  unit_id       TEXT NOT NULL,
  office_email  TEXT,                 -- the councillor's office's OFFICIAL public email
  email_source  TEXT,                 -- where it was found (website, notice board, ...)
  added_by      TEXT NOT NULL,
  added_at      TEXT NOT NULL,
  removed_at    TEXT,
  removed_by    TEXT
);
CREATE INDEX IF NOT EXISTS idx_assisted_wards_unit ON assisted_wards (unit_id, removed_at);
CREATE INDEX IF NOT EXISTS idx_assisted_wards_pilot ON assisted_wards (pilot_id, removed_at);

ALTER TABLE grievances ADD COLUMN assisted_pilot TEXT;
ALTER TABLE grievances ADD COLUMN assisted_handed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_grievances_assisted ON grievances (assisted_pilot, created_at);

-- Every forwarding, follow-up, reply, handover and note on an assisted case.
-- Never changed or deleted except with the complaint.
CREATE TABLE IF NOT EXISTS assisted_steps (
  id            TEXT PRIMARY KEY,
  grievance_id  TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('FORWARD', 'FOLLOWUP', 'REPLY', 'HANDOVER', 'NOTE')),
  target        TEXT CHECK (target IN ('OFFICE', 'DEPT')),
  target_name   TEXT,
  channel       TEXT CHECK (channel IN ('EMAIL', 'DASHBOARD', 'LETTER', 'CALL', 'VISIT', 'LINK')),
  reply_kind    TEXT CHECK (reply_kind IN ('PLANNED', 'IN_PROGRESS', 'DONE', 'NOT_OURS', 'CANT_DO', 'OTHER')),
  expected_by   TEXT,
  text          TEXT,
  replied_by    TEXT,                 -- name and post given on the reply link (an official)
  minutes       INTEGER,              -- staff time on this step
  dept_step_id  TEXT,                 -- the department step made with it, if any
  by_email      TEXT,                 -- staff member (NULL for a reply through the link)
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assisted_steps_g ON assisted_steps (grievance_id, created_at);

-- Reply links sent to offices that haven't joined (only a hash is kept).
CREATE TABLE IF NOT EXISTS assisted_links (
  id            TEXT PRIMARY KEY,
  grievance_id  TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  target        TEXT NOT NULL CHECK (target IN ('OFFICE', 'DEPT')),
  target_name   TEXT NOT NULL,
  sent_to       TEXT NOT NULL,
  replies       INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_assisted_links_g ON assisted_links (grievance_id);

-- Private links to an office's area report (only a hash is kept).
CREATE TABLE IF NOT EXISTS assisted_reports (
  id            TEXT PRIMARY KEY,
  unit_id       TEXT NOT NULL,
  pilot_id      TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  sent_to       TEXT,
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT,
  opened_count  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_assisted_reports_unit ON assisted_reports (unit_id, created_at);
