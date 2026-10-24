-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part37 (grieviq-54): transfers of department officers and government officials.
--
-- When an officer is transferred to another department office on GrievIQ,
-- or an official's access moves to another state, district or level, the
-- old record is closed and a new one opened, linked both ways:
--   moved_to    on the old record: the new record's id
--   moved_from  on the new record: the old record's id
--   order_ref   the transfer order's number (department officers)
-- Records are never deleted; every step is also in admin_events.
-- Adds columns only. No data changes. The trigger count stays 36.
-- Run ONCE ("duplicate column name" means it was already done).

ALTER TABLE dept_officers ADD COLUMN moved_from TEXT;
ALTER TABLE dept_officers ADD COLUMN moved_to TEXT;
ALTER TABLE dept_officers ADD COLUMN order_ref TEXT;
ALTER TABLE gov_users ADD COLUMN moved_from TEXT;
ALTER TABLE gov_users ADD COLUMN moved_to TEXT;
