-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part39 (grieviq-56): authority letters for paid public notices.
--
-- A notice that speaks for a government department needs the sanction or
-- authority letter from the competent authority, uploaded with the request:
--   every notice from a department office, and a representative's notice
--   about a scheme enrolment, a health or vaccination camp, or a service
--   interruption. For other notices a letter is optional.
-- The letter is kept privately (the photo storage, under notice-letters/);
-- only GrievIQ admins and the auditor can open it, and every opening is
-- logged. The admin approves only after verifying it, and records how.
-- Citizens see only the letter's number and date on the notice.
-- Adds columns only. The trigger count stays 36.
-- Run ONCE ("duplicate column name" means it was already done).

ALTER TABLE notices ADD COLUMN letter_key TEXT;
ALTER TABLE notices ADD COLUMN letter_type TEXT;
ALTER TABLE notices ADD COLUMN letter_size INTEGER;
ALTER TABLE notices ADD COLUMN letter_no TEXT;
ALTER TABLE notices ADD COLUMN letter_date TEXT;
ALTER TABLE notices ADD COLUMN letter_by TEXT;
ALTER TABLE notices ADD COLUMN letter_uploaded_at TEXT;
ALTER TABLE notices ADD COLUMN letter_verified_how TEXT;
