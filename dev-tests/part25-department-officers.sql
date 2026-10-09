-- part25-department-officers.sql   (grieviq-32, October 2026)
--
-- Department dashboard: officers of department offices sign in with a code
-- sent to their official email and reply on the cases forwarded to their
-- office. Approved 9 Oct 2026 (email code; citizen's contact details hidden).
--
--   dept_agreements   the department office's written agreement with GrievIQ
--                     (needed before any officer of that office gets access)
--   dept_officers     the officers (one office each); removed, never deleted
--   dept_codes        sign-in codes (only a SHA-256 of each code is stored)
--   dept_sessions     signed-in sessions (only a SHA-256 of the session id)
--   dept_access_log   every sign-in, case opened and reply (kept for audit)
--
-- Adds new tables and indexes only. No existing table is changed.
-- Safe to run twice (IF NOT EXISTS). The trigger count stays 28.

CREATE TABLE IF NOT EXISTS dept_agreements (
  office_id     TEXT PRIMARY KEY REFERENCES dept_offices(id),
  signed_on     TEXT NOT NULL,
  signed_by     TEXT NOT NULL,
  document_ref  TEXT NOT NULL,
  notes         TEXT,
  recorded_by   TEXT NOT NULL,
  recorded_at   TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  ended_at      TEXT,
  ended_by      TEXT,
  end_reason    TEXT
);

CREATE TABLE IF NOT EXISTS dept_officers (
  id             TEXT PRIMARY KEY,
  office_id      TEXT NOT NULL REFERENCES dept_offices(id),
  email          TEXT NOT NULL,
  name           TEXT NOT NULL,
  designation    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REMOVED')),
  added_by       TEXT NOT NULL,
  added_at       TEXT NOT NULL,
  removed_by     TEXT,
  removed_at     TEXT,
  remove_reason  TEXT,
  last_signed_in TEXT,
  digest_sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_dept_officers_office ON dept_officers (office_id, status);
CREATE INDEX IF NOT EXISTS idx_dept_officers_email ON dept_officers (email, status);

CREATE TABLE IF NOT EXISTS dept_codes (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL,
  code_hash       TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  used_at         TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dept_codes_email ON dept_codes (email, created_at);

CREATE TABLE IF NOT EXISTS dept_sessions (
  id_hash      TEXT PRIMARY KEY,
  officer_id   TEXT NOT NULL REFERENCES dept_officers(id),
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  ended_at     TEXT,
  end_reason   TEXT
);
CREATE INDEX IF NOT EXISTS idx_dept_sessions_officer ON dept_sessions (officer_id, ended_at);

CREATE TABLE IF NOT EXISTS dept_access_log (
  id           TEXT PRIMARY KEY,
  officer_id   TEXT,
  email        TEXT,
  office_id    TEXT,
  action       TEXT NOT NULL,
  grievance_id TEXT,
  detail       TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dept_access_log_time ON dept_access_log (created_at);
CREATE INDEX IF NOT EXISTS idx_dept_access_log_office ON dept_access_log (office_id, created_at);
