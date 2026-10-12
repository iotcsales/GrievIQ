-- Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part27-site-settings.sql   (grieviq-39, October 2026)
--
-- "Prices & site details" and the "For offices" page (approved 11 Oct 2026):
--   site_settings_draft     the super admin's unpublished changes (one row)
--   site_settings_versions  every published version of the prices and site
--                           details; the newest is what the public sees.
--                           Kept for good: two triggers refuse changing or
--                           deleting a published version.
--   pilot_requests          "Request a free pilot" form on /for-offices
--                           (deleted automatically one year after sending)
--
-- Creates new tables only. No existing data is changed.
-- The trigger count goes from 28 to 30.
-- Run ONCE ("table ... already exists" means it was already done).

CREATE TABLE site_settings_draft (
  id TEXT PRIMARY KEY CHECK (id = 'draft'),
  data TEXT NOT NULL,
  base_version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE site_settings_versions (
  version INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  note TEXT,
  restored_from INTEGER
);

CREATE TRIGGER no_update_site_settings_versions BEFORE UPDATE ON site_settings_versions
BEGIN SELECT RAISE(ABORT, 'Published versions cannot be changed.'); END;
CREATE TRIGGER no_delete_site_settings_versions BEFORE DELETE ON site_settings_versions
BEGIN SELECT RAISE(ABORT, 'Published versions cannot be deleted.'); END;

CREATE TABLE pilot_requests (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  office_kind TEXT NOT NULL CHECK (office_kind IN ('PRADHAN','COUNCILLOR','MAYOR','MLA','MP','DEPARTMENT','OTHER')),
  place TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT,
  lang TEXT NOT NULL DEFAULT 'en',
  consent_at TEXT NOT NULL,
  consent_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','CONTACTED','CLOSED')),
  status_at TEXT,
  status_by TEXT,
  note TEXT
);
CREATE INDEX idx_pilot_requests_created ON pilot_requests (created_at);
