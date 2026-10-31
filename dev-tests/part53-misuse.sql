-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part53 (grieviq-82): controls against misuse of the complaint service.
--
-- complaint_reports    an office or a department officer reports a complaint as false, abusive,
--                      a duplicate or outside the area (or GrievIQ's text check flags it: AUTO).
--                      It never closes the case: GrievIQ staff decide.
-- filing_restrictions  staff stop a phone number or an email from filing for 30, 90 or 365 days,
--                      with a reason; a second person approves it. Only a one-way fingerprint of
--                      the number or email is kept, with its last 4 characters to recognise it.
-- app_switches         on/off switches a super admin turns with one click (SMS_FILING: a code by
--                      SMS before filing), and switch_events, every change, kept for good.
-- grievances           contact_verified (PHONE: SMS code at filing; EMAIL: the citizen proved the
--                      email with a code), text_flags (ABUSIVE, THREAT: GrievIQ's text check),
--                      and the "not genuine" closure with the citizen's one appeal.
-- Two triggers keep switch_events unchangeable: the trigger count goes from 42 to 44.
-- Run ONCE ("already exists" / "duplicate column name" means it was done).

CREATE TABLE complaint_reports (
  id            TEXT PRIMARY KEY,
  grievance_id  TEXT NOT NULL,
  by_kind       TEXT NOT NULL CHECK (by_kind IN ('REP', 'DEPT', 'AUTO')),
  by_email      TEXT,
  office_key    TEXT,
  reason        TEXT NOT NULL CHECK (reason IN ('FALSE', 'ABUSIVE', 'DUPLICATE', 'OUTSIDE', 'OTHER', 'THREAT')),
  note          TEXT,
  created_at    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UPHELD', 'DISMISSED')),
  decided_by    TEXT,
  decided_at    TEXT,
  decision_note TEXT
);
CREATE INDEX idx_complaint_reports_open ON complaint_reports (status, created_at);
CREATE INDEX idx_complaint_reports_case ON complaint_reports (grievance_id);

CREATE TABLE filing_restrictions (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('PHONE', 'EMAIL')),
  value_hash   TEXT NOT NULL,
  hint         TEXT NOT NULL,
  grievance_id TEXT,
  reason       TEXT NOT NULL,
  days         INTEGER NOT NULL CHECK (days IN (30, 90, 365)),
  status       TEXT NOT NULL CHECK (status IN ('PENDING', 'ACTIVE', 'REFUSED', 'LIFTED')),
  proposed_by  TEXT NOT NULL,
  proposed_at  TEXT NOT NULL,
  decided_by   TEXT,
  decided_at   TEXT,
  starts_at    TEXT,
  ends_at      TEXT,
  lifted_by    TEXT,
  lifted_at    TEXT,
  lift_reason  TEXT
);
CREATE INDEX idx_filing_restrictions_hash ON filing_restrictions (value_hash, status);

CREATE TABLE app_switches (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  changed_by TEXT,
  changed_at TEXT,
  detail     TEXT
);
CREATE TABLE switch_events (
  id         TEXT PRIMARY KEY,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  reason     TEXT,
  actor      TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER switch_events_no_update BEFORE UPDATE ON switch_events BEGIN SELECT RAISE(ABORT, 'Switch records cannot be changed.'); END;
CREATE TRIGGER switch_events_no_delete BEFORE DELETE ON switch_events BEGIN SELECT RAISE(ABORT, 'Switch records cannot be deleted.'); END;

ALTER TABLE grievances ADD COLUMN contact_verified TEXT;
ALTER TABLE grievances ADD COLUMN text_flags TEXT;
ALTER TABLE grievances ADD COLUMN not_genuine_reason TEXT;
ALTER TABLE grievances ADD COLUMN not_genuine_at TEXT;
ALTER TABLE grievances ADD COLUMN not_genuine_by TEXT;
ALTER TABLE grievances ADD COLUMN appeal_note TEXT;
ALTER TABLE grievances ADD COLUMN appeal_at TEXT;
ALTER TABLE grievances ADD COLUMN appeal_decision TEXT;
ALTER TABLE grievances ADD COLUMN appeal_decided_by TEXT;
ALTER TABLE grievances ADD COLUMN appeal_decided_at TEXT;
