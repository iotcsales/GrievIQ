-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part43 (grieviq-68): the review office for the payment provider's reviewers.
--
-- Razorpay asks for a test login to see where offices pay. A super admin
-- switches on "review access" for one Google account: GrievIQ then makes a
-- demo office in a demo area marked review = 1. That area is never shown to
-- citizens (it can't be switched live), is left out of every government
-- dashboard and report, and holds no complaints and no citizen details.
-- No new tables, no new triggers: the count stays 38.
-- Run ONCE ("duplicate column" means it was done).

ALTER TABLE areas ADD COLUMN review INTEGER NOT NULL DEFAULT 0;
