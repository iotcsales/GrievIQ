-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part34-gov-login.sql   (grieviq-49, October 2026)
--
-- Government dashboard sign-in. Officials sign in with their official
-- government email (gov.in or nic.in), as the Government of India's email
-- policy asks. On the owner's decision (16 Oct 2026) the super admin may
-- allow another email as a recorded exception, only when the state's letter
-- names that email: the reason is kept, the account is marked, and it is
-- reviewed every 90 days instead of every year.
--   gov_users + email_kind   OFFICIAL (gov.in / nic.in) or OTHER (exception)
--             + other_reason why another email was allowed
--
-- Adds two columns only. No existing data changes (every existing account
-- is OFFICIAL). The trigger count stays 36.
-- Run ONCE ("duplicate column name" means it was already done).

ALTER TABLE gov_users ADD COLUMN email_kind TEXT NOT NULL DEFAULT 'OFFICIAL';
ALTER TABLE gov_users ADD COLUMN other_reason TEXT;
