-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part49 (grieviq-75): named duties for GrievIQ staff, new staff roles.
--
-- staff_duties: a duty given to one named person by the super admin
-- (NIST SP 800-53 AC-2 account management, AC-5 separation of duties):
--   HELPER_CHECK      checks Community helper applications (ID, selfie,
--                     card photo, video call)
--   HELPER_APPROVE    approves helpers (never the person who checked),
--                     suspends, removes, decides appeals, calls citizens
--                     about helper filings, refunds helper fees
--   GRIEVANCE_OFFICER the Grievance Officer under the DPDP Act (one person)
--   SECURITY_CONTACT  the CERT-In point of contact (one person)
-- areas: a JSON list of area ids, or NULL for all areas (helper duties only).
-- The history of who gave or removed which duty is in admin_events, which
-- can't be changed or deleted.
--
-- New roles (admin_users.role has no CHECK, so no change is needed there):
-- accounts_executive, accounts_manager, support_executive,
-- sales_executive, sales_manager, management_viewer.
-- admin_users.code_version / code_accepted_at: the sales code of conduct,
-- accepted once by sales staff (again when the version changes).
-- admin_settings (already there): billing_accounts_only, the super admin's switch.
--
-- Moving over: everyone who could check or approve helpers until now keeps
-- that duty, for all areas (the inserts at the end). No triggers (the count
-- stays 40). Run ONCE ("already exists" / "duplicate column name" means it was done).

CREATE TABLE staff_duties (
  id          TEXT PRIMARY KEY,
  admin_id    TEXT NOT NULL,
  duty        TEXT NOT NULL CHECK (duty IN ('HELPER_CHECK', 'HELPER_APPROVE', 'GRIEVANCE_OFFICER', 'SECURITY_CONTACT')),
  areas       TEXT,
  reason      TEXT,
  given_by    TEXT NOT NULL,
  given_at    TEXT NOT NULL,
  ended_at    TEXT,
  ended_by    TEXT,
  end_reason  TEXT
);
CREATE UNIQUE INDEX idx_staff_duty_one ON staff_duties(admin_id, duty) WHERE ended_at IS NULL;
CREATE INDEX idx_staff_duty_open ON staff_duties(duty) WHERE ended_at IS NULL;

ALTER TABLE admin_users ADD COLUMN code_version TEXT;
ALTER TABLE admin_users ADD COLUMN code_accepted_at TEXT;

INSERT INTO staff_duties (id, admin_id, duty, areas, reason, given_by, given_at)
  SELECT lower(hex(randomblob(16))), id, 'HELPER_CHECK', NULL, 'Kept from their role when named duties started (grieviq-75)', 'system', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM admin_users WHERE role IN ('super_admin', 'operations_admin', 'data_moderator') AND COALESCE(status, 'PRESENT') <> 'LEFT';
INSERT INTO staff_duties (id, admin_id, duty, areas, reason, given_by, given_at)
  SELECT lower(hex(randomblob(16))), id, 'HELPER_APPROVE', NULL, 'Kept from their role when named duties started (grieviq-75)', 'system', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM admin_users WHERE role IN ('super_admin', 'operations_admin') AND COALESCE(status, 'PRESENT') <> 'LEFT';
