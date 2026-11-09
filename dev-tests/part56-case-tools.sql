-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part56 (grieviq-86, 9 Nov 2026): five new tools on a complaint.
--
--   1. Ask the citizen: the office asks a question; the citizen answers on
--      their Track page (the office never sees their phone or email). A case
--      whose question has had no answer for 7 days can be closed as
--      "not enough information" (closure_kind = 'NO_INFO'); the citizen can
--      reopen it within 30 days by answering.
--   2. Interim reply: "this will take longer", with a reason and an expected
--      date (at most 60 days ahead), once per level. The level's time limit
--      moves to that date (grievances.interims).
--   3. Sent to the right office: within 48 hours of filing, once, by the
--      office; any time by GrievIQ staff. The time limits start again
--      (grievances.transferred_at).
--   4. "This is my problem too": people with the same problem nearby follow
--      a complaint instead of filing it again (case_supporters). They get
--      updates by email; the office sees only how many there are.
--   5. Priority: a danger to life or health right now (grievances.priority):
--      acknowledge within 24 hours, act within 3 days at each level. The
--      office can take priority off with a recorded reason.
--
-- case_updates keeps every question, answer, interim reply, transfer and
-- priority change. Rows are never changed except to add the answer to a
-- question, and are kept as long as the complaint.
-- Adds columns and tables only. No data changes. No triggers (the trigger
-- count stays 44).
-- Run ONCE ("duplicate column name" or "already exists" means it was done).

ALTER TABLE grievances ADD COLUMN priority TEXT;
ALTER TABLE grievances ADD COLUMN priority_off_at TEXT;
ALTER TABLE grievances ADD COLUMN interims TEXT;
ALTER TABLE grievances ADD COLUMN transferred_at TEXT;
ALTER TABLE grievances ADD COLUMN transfer_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS case_updates (
  id           TEXT PRIMARY KEY,
  grievance_id TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('QUESTION', 'INTERIM', 'TRANSFER', 'PRIORITY_OFF', 'NO_INFO')),
  tier         TEXT,
  by_kind      TEXT NOT NULL CHECK (by_kind IN ('OFFICE', 'STAFF')),
  by_email     TEXT,
  reason       TEXT,
  text         TEXT,
  expected_by  TEXT,
  from_unit    TEXT,
  to_unit      TEXT,
  answer       TEXT,
  answered_at  TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_case_updates_g ON case_updates (grievance_id, created_at);
CREATE INDEX IF NOT EXISTS idx_case_updates_open_q ON case_updates (kind, answered_at, created_at);

CREATE TABLE IF NOT EXISTS case_supporters (
  id           TEXT PRIMARY KEY,
  grievance_id TEXT NOT NULL,
  email        TEXT NOT NULL,
  lang         TEXT,
  created_at   TEXT NOT NULL,
  UNIQUE (grievance_id, email)
);
CREATE INDEX IF NOT EXISTS idx_case_supporters_email ON case_supporters (email);
