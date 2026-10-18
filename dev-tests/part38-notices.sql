-- Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part38 (grieviq-55): paid public notices.
--
-- An office (a representative's office or a department office) asks for a
-- public notice in a fixed text template; an admin approves it against a
-- checklist; approval makes a bill; once the payment is confirmed the
-- notice is shown to citizens of that office's area, labelled "Paid notice"
-- with who published and paid for it.
--   notices         every request and its whole life (never deleted)
--   notice_pauses   Model Code of Conduct periods (by state, or one city or
--                   district): representatives' notices are paused, and the
--                   paused days are added back at the end
-- bills get two columns so a notice's bill is told apart from a plan's.
-- Every step is also written to admin_events (tamper-proof).
-- New tables and columns only. The trigger count stays 36.
-- Run ONCE ("duplicate column name" or "table ... already exists" means it
-- was already done).

CREATE TABLE IF NOT EXISTS notices (
  id               TEXT PRIMARY KEY,
  ref              TEXT NOT NULL UNIQUE,
  office_type      TEXT NOT NULL CHECK (office_type IN ('REP', 'DEPT')),
  office_tier      TEXT,
  office_id        TEXT NOT NULL,
  office_name      TEXT NOT NULL,
  office_label     TEXT NOT NULL,
  area_id          TEXT,
  state            TEXT,
  category         TEXT NOT NULL,
  title_en         TEXT,
  title_hi         TEXT,
  body_en          TEXT,
  body_hi          TEXT,
  event_date       TEXT,
  event_time       TEXT,
  place            TEXT,
  plan_id          TEXT NOT NULL,
  plan_name        TEXT NOT NULL,
  days             INTEGER NOT NULL,
  reach            TEXT NOT NULL CHECK (reach IN ('LOCAL', 'WIDE')),
  amount           INTEGER NOT NULL,
  gst_rate         REAL NOT NULL,
  gst              INTEGER NOT NULL,
  total            INTEGER NOT NULL,
  settings_version INTEGER NOT NULL,
  start_on         TEXT NOT NULL,
  starts_on        TEXT,
  flags            TEXT,
  status           TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'PAID', 'REJECTED', 'WITHDRAWN', 'TAKEN_DOWN', 'CANCELLED')),
  requested_by     TEXT NOT NULL,
  requested_at     TEXT NOT NULL,
  decided_by       TEXT,
  decided_at       TEXT,
  decision_note    TEXT,
  checks           TEXT,
  bill_id          TEXT,
  paid_at          TEXT,
  ended_by         TEXT,
  ended_at         TEXT,
  end_reason       TEXT
);
CREATE INDEX IF NOT EXISTS idx_notices_office ON notices (office_type, office_id, status);
CREATE INDEX IF NOT EXISTS idx_notices_status ON notices (status, starts_on);

CREATE TABLE IF NOT EXISTS notice_pauses (
  id           TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  state        TEXT NOT NULL,
  area_id      TEXT,
  from_on      TEXT NOT NULL,
  to_on        TEXT NOT NULL,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  removed_by   TEXT,
  removed_at   TEXT,
  remove_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_notice_pauses_state ON notice_pauses (state, from_on);

ALTER TABLE bills ADD COLUMN kind TEXT;
ALTER TABLE bills ADD COLUMN notice_id TEXT;
