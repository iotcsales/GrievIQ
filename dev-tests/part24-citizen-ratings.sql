-- part24-citizen-ratings.sql   (grieviq-30, October 2026)
--
-- Citizen ratings: after a case is closed, the citizen can say how satisfied
-- they are with the representative's office and, if a department worked on
-- the case, with the department. Five worded answers (GOV.UK's satisfaction
-- scale), stored as 5 (Very satisfied) to 1 (Very dissatisfied).
--
--   - one row per case; the citizen can change it for 7 days after sending
--     (and again if the case is reopened and closed again)
--   - office_tier / office_id: the office that resolved the case
--   - department: the department type key the citizen rated (or NULL)
--   - a low rating (1 or 2 on either question) goes on the admin
--     "Low ratings" list until an admin marks it followed up
--   - comment and follow_up_note are removed when the case is anonymised
--
-- Adds one new table and its indexes. No existing table is changed.
-- Safe to run twice (IF NOT EXISTS). The trigger count stays 28.

CREATE TABLE IF NOT EXISTS case_ratings (
  id TEXT PRIMARY KEY,
  grievance_id TEXT NOT NULL UNIQUE REFERENCES grievances(id),
  office_score INTEGER NOT NULL CHECK (office_score BETWEEN 1 AND 5),
  dept_score INTEGER CHECK (dept_score IS NULL OR dept_score BETWEEN 1 AND 5),
  department TEXT,
  office_tier TEXT,
  office_id TEXT,
  comment TEXT,
  low INTEGER NOT NULL DEFAULT 0 CHECK (low IN (0, 1)),
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  round_closed_at TEXT,
  edit_count INTEGER NOT NULL DEFAULT 0,
  followed_up_at TEXT,
  followed_up_by TEXT,
  follow_up_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_case_ratings_office ON case_ratings (office_tier, office_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_case_ratings_low ON case_ratings (low, followed_up_at);
