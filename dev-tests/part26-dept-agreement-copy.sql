-- part26-dept-agreement-copy.sql   (grieviq-37, October 2026)
--
-- The department agreement inside GrievIQ (approved 10 Oct 2026):
--   dept_agreements: the signed copy uploaded by an admin (kept privately in
--                    the photo storage; only its key and details are here)
--   dept_officers:   which version of the "Rules for officers" each officer
--                    accepted, and when (asked once at sign-in; again when
--                    the rules change)
--
-- Adds columns only. No data is changed. The trigger count stays 28.
-- Run ONCE (adding a column twice is refused with "duplicate column name";
-- if that happens, it was already done and nothing else is needed).

ALTER TABLE dept_agreements ADD COLUMN copy_key TEXT;
ALTER TABLE dept_agreements ADD COLUMN copy_type TEXT;
ALTER TABLE dept_agreements ADD COLUMN copy_size INTEGER;
ALTER TABLE dept_agreements ADD COLUMN copy_uploaded_at TEXT;
ALTER TABLE dept_agreements ADD COLUMN copy_uploaded_by TEXT;
ALTER TABLE dept_officers ADD COLUMN rules_version TEXT;
ALTER TABLE dept_officers ADD COLUMN rules_accepted_at TEXT;
