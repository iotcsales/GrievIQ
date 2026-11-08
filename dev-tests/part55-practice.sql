-- grieviq-85 (8 Nov 2026): the practice record for the onboarding form.
-- One line each time someone submits a practice form: who, when, which form
-- and what a sales manager would do (APPROVE, RETURN or REFUSED) with how
-- many things to fix. Never the answers. Lines older than 12 months are
-- deleted by the API on the next practice submit. No triggers.
CREATE TABLE IF NOT EXISTS onboarding_practice (
  id TEXT PRIMARY KEY,
  admin_id TEXT,
  email TEXT NOT NULL,
  form_kind TEXT NOT NULL CHECK (form_kind IN ('OFFICE', 'DEPARTMENT')),
  result TEXT NOT NULL CHECK (result IN ('APPROVE', 'RETURN', 'REFUSED')),
  to_fix INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_onboarding_practice_email ON onboarding_practice (email, created_at);
CREATE INDEX IF NOT EXISTS idx_onboarding_practice_created ON onboarding_practice (created_at);
