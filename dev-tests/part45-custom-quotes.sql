-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part45 (grieviq-71): quotations priced on request (State, National and
-- District dashboards, and plans published as "price on request").
-- Only a super admin can make one: the yearly price is typed in, with the
-- scope it covers (shown on the quotation) and a reason (kept for the
-- auditor, never shown to the buyer). When the order arrives it is recorded
-- on the quotation; such orders are invoiced outside GrievIQ's bills.
-- No new tables or triggers: the count stays 38.
-- Run ONCE ("duplicate column" means it was done).

ALTER TABLE quotations ADD COLUMN kind TEXT NOT NULL DEFAULT 'PLAN' CHECK (kind IN ('PLAN','CUSTOM'));
ALTER TABLE quotations ADD COLUMN basis TEXT;
ALTER TABLE quotations ADD COLUMN custom_reason TEXT;
