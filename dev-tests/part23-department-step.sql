-- part23-department-step.sql  (grieviq-29: Departments stage 3, the department step)
--
-- What happens with the department on each case, step by step, as recorded
-- by the representative's office (and, later, by department officers):
--   FORWARDED        sent to an office (how: PHONE / WHATSAPP / EMAIL / IN_PERSON / LETTER)
--   SCHEDULED        the department gave a date (expected_date)
--   IN_PROGRESS      work under way
--   DONE_CLAIMED     the department says the work is done -> field check needed
--   NOT_OURS         the department says another office handles it (never a closure)
--   CANT_DO          the department says it can't be done (reason in note)
--   CHECK_FIXED      the field check found it fixed (photos with the fix report)
--   CHECK_PARTLY     the field check found it partly fixed (photos: photo_report_id)
--   CHECK_NOT_FIXED  the field check found it not fixed (photos: photo_report_id)
-- by_office_tier / by_office_id: the representative's office that recorded the
-- step (it gets the reminder when the department's target time passes).
-- The latest row is the department's current state on the case (derived,
-- never stored on the case). Rows are never deleted; only overdue_notified_at
-- is filled in once, when the office is reminded that the target has passed.
--
-- dept_types.target_days: how many days a department of this type has to act
-- after a case is forwarded (default 7, at most 21 as in the DARPG/CPGRAMS
-- guidelines). It doesn't change the representative's own time limit.
--
-- No triggers are added: the trigger count stays 28. Run this file once only.

CREATE TABLE IF NOT EXISTS case_dept_steps (
  id                  TEXT PRIMARY KEY,
  grievance_id        TEXT NOT NULL,
  kind                TEXT NOT NULL,
  department          TEXT,
  office_id           TEXT,
  office_name         TEXT,
  channel             TEXT,
  expected_date       TEXT,
  suggested_department TEXT,
  note                TEXT,
  photo_report_id     TEXT,
  actor               TEXT NOT NULL,
  actor_role          TEXT,
  by_office_tier      TEXT,
  by_office_id        TEXT,
  created_at          TEXT NOT NULL,
  overdue_notified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_case_dept_steps_case ON case_dept_steps (grievance_id, created_at);

ALTER TABLE dept_types ADD COLUMN target_days INTEGER;

-- ---------------------------------------------------------------------------
-- Two existing tables only accept a fixed list of values. SQLite can't change
-- such a rule in place, so each table is copied into a new one with the wider
-- rule (every row kept exactly), the old one removed and the new one renamed.
-- Neither table has triggers, so the trigger count stays 28.
--
-- 1. change_requests: data entry operators' department requests (grieviq-24
--    and 25: kinds dept_office, dept_import, dept_type; target types dept,
--    dept_type) were refused by the old rule. This lets them through.
CREATE TABLE change_requests_v2 (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('contact', 'add_unit', 'dept_office', 'dept_import', 'dept_type')),
  target_type TEXT CHECK (target_type IN ('mp', 'mla', 'ward', 'mayor', 'dept', 'dept_type')),
  target_id TEXT,
  target_label TEXT,
  old_values TEXT,
  new_values TEXT NOT NULL,
  reason TEXT NOT NULL,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'OUT_OF_DATE')),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  applied_values TEXT
);
INSERT INTO change_requests_v2 (id, kind, target_type, target_id, target_label, old_values, new_values, reason, source, status,
  requested_by, requested_at, reviewed_by, reviewed_at, review_note, applied_values)
  SELECT id, kind, target_type, target_id, target_label, old_values, new_values, reason, source, status,
  requested_by, requested_at, reviewed_by, reviewed_at, review_note, applied_values FROM change_requests;
DROP TABLE change_requests;
ALTER TABLE change_requests_v2 RENAME TO change_requests;
CREATE INDEX idx_change_requests_status ON change_requests (status, requested_at);
CREATE INDEX idx_change_requests_requester ON change_requests (requested_by, requested_at);

-- 2. resolution_reports: a failed field check keeps its photos as evidence in
--    a report with review_status 'FIELD_CHECK' (never shown as a resolution).
CREATE TABLE resolution_reports_v2 (
  id TEXT PRIMARY KEY,
  grievance_id TEXT NOT NULL,
  note TEXT NOT NULL,
  no_photo_reason TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  review_status TEXT CHECK (review_status IN ('PENDING', 'APPROVED', 'SENT_BACK', 'FIELD_CHECK')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  submitted_role TEXT
);
INSERT INTO resolution_reports_v2 (id, grievance_id, note, no_photo_reason, created_by, created_at, review_status, reviewed_by, reviewed_at, review_note, submitted_role)
  SELECT id, grievance_id, note, no_photo_reason, created_by, created_at, review_status, reviewed_by, reviewed_at, review_note, submitted_role FROM resolution_reports;
DROP TABLE resolution_reports;
ALTER TABLE resolution_reports_v2 RENAME TO resolution_reports;
CREATE INDEX idx_resolution_reports_grievance ON resolution_reports (grievance_id, created_at);
