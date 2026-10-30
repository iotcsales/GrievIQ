-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part52 (grieviq-78): staff records and access controls (ISO/IEC 27001:2022
-- people controls 6.1-6.6 and 5.18; DPDP Rules 2025, rule 6).
--
-- Only what decides who may reach personal data. Never salary, bank
-- details, Aadhaar or PAN, ID copies, attendance, leave balances or
-- appraisals: those stay in the payroll / HR system.
--
-- staff_records      one row per person: reporting manager, joining date,
--                    kind (employee, contract, intern, consultant),
--                    probation and contract end dates; the reminders sent.
-- staff_checks       joining checks with the date, who recorded it and a
--                    short reference (never a document): IDENTITY,
--                    BACKGROUND, CONFIDENTIALITY, APPOINTMENT, DEVICE, INDUCTION.
-- staff_policy_acceptances  each person accepts the staff policies at
--                    sign-in (again when a policy changes and once a year).
-- access_reviews / access_review_items  the quarterly access review: each
--                    person kept, changed or removed, by someone else.
-- staff_exit_items   the leaving checklist.
-- admin_users.last_seen_at  last sign-in (written at most once an hour).
-- admin_users.auto_paused / auto_paused_at  access paused by GrievIQ
--                    (CONTRACT_END or DORMANT: 90 days without signing in).
-- staff_duties is rebuilt to allow one more duty, STAFF_RECORDS (the person
-- the super admin trusts to keep these records). Its rows are copied as
-- they are.
-- No triggers (the count stays 42). Run ONCE ("already exists" /
-- "duplicate column name" means it was done).

CREATE TABLE staff_records (
  admin_id        TEXT PRIMARY KEY,
  manager_id      TEXT,
  joined_on       TEXT,
  kind            TEXT CHECK (kind IS NULL OR kind IN ('EMPLOYEE', 'CONTRACT', 'INTERN', 'CONSULTANT')),
  probation_end   TEXT,
  contract_end    TEXT,
  reminded_14     TEXT,
  reminded_3      TEXT,
  reminded_probation TEXT,
  updated_by      TEXT,
  updated_at      TEXT
);

CREATE TABLE staff_checks (
  id          TEXT PRIMARY KEY,
  admin_id    TEXT NOT NULL,
  item        TEXT NOT NULL CHECK (item IN ('IDENTITY', 'BACKGROUND', 'CONFIDENTIALITY', 'APPOINTMENT', 'DEVICE', 'INDUCTION')),
  done_on     TEXT NOT NULL,
  ref         TEXT,
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE (admin_id, item)
);

CREATE TABLE staff_policy_acceptances (
  id          TEXT PRIMARY KEY,
  admin_id    TEXT NOT NULL,
  policy      TEXT NOT NULL,
  version     TEXT NOT NULL,
  accepted_at TEXT NOT NULL
);
CREATE INDEX idx_staff_policy_acc ON staff_policy_acceptances(admin_id, policy, accepted_at);

CREATE TABLE access_reviews (
  id          TEXT PRIMARY KEY,
  quarter     TEXT NOT NULL UNIQUE,
  started_at  TEXT NOT NULL,
  started_by  TEXT NOT NULL,
  finished_at TEXT,
  finished_by TEXT
);
CREATE TABLE access_review_items (
  id          TEXT PRIMARY KEY,
  review_id   TEXT NOT NULL,
  admin_id    TEXT NOT NULL,
  role        TEXT NOT NULL,
  duties      TEXT,
  last_seen   TEXT,
  decision    TEXT CHECK (decision IS NULL OR decision IN ('KEEP', 'CHANGE', 'REMOVE')),
  note        TEXT,
  decided_by  TEXT,
  decided_at  TEXT,
  UNIQUE (review_id, admin_id)
);

CREATE TABLE staff_exit_items (
  id        TEXT PRIMARY KEY,
  admin_id  TEXT NOT NULL,
  item      TEXT NOT NULL CHECK (item IN ('ASSETS', 'EMAIL_ROUTING', 'ACCESS_POLICY', 'NO_COPIES')),
  done_at   TEXT NOT NULL,
  done_by   TEXT NOT NULL,
  note      TEXT,
  UNIQUE (admin_id, item)
);

ALTER TABLE admin_users ADD COLUMN last_seen_at TEXT;
ALTER TABLE admin_users ADD COLUMN auto_paused TEXT;
ALTER TABLE admin_users ADD COLUMN auto_paused_at TEXT;
-- Everyone counts as seen today, so nobody is paused for the time before
-- sign-ins were recorded.
UPDATE admin_users SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE last_seen_at IS NULL;

-- staff_duties with the STAFF_RECORDS duty (rows copied unchanged).
CREATE TABLE staff_duties_new (
  id          TEXT PRIMARY KEY,
  admin_id    TEXT NOT NULL,
  duty        TEXT NOT NULL CHECK (duty IN ('HELPER_CHECK', 'HELPER_APPROVE', 'GRIEVANCE_OFFICER', 'SECURITY_CONTACT', 'STAFF_RECORDS')),
  areas       TEXT,
  reason      TEXT,
  given_by    TEXT NOT NULL,
  given_at    TEXT NOT NULL,
  ended_at    TEXT,
  ended_by    TEXT,
  end_reason  TEXT
);
INSERT INTO staff_duties_new (id, admin_id, duty, areas, reason, given_by, given_at, ended_at, ended_by, end_reason)
  SELECT id, admin_id, duty, areas, reason, given_by, given_at, ended_at, ended_by, end_reason FROM staff_duties;
DROP TABLE staff_duties;
ALTER TABLE staff_duties_new RENAME TO staff_duties;
CREATE UNIQUE INDEX idx_staff_duty_one ON staff_duties(admin_id, duty) WHERE ended_at IS NULL;
CREATE INDEX idx_staff_duty_open ON staff_duties(duty) WHERE ended_at IS NULL;
