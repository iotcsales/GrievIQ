-- part21-departments.sql  (grieviq-24, Departments stage 1: the directory)
--
-- The department directory: for each area (city or district), the offices
-- that handle each kind of problem, with their OFFICIAL public contacts,
-- where the contact came from, and when it was last checked.
--
-- Modelled on FixMyStreet's per-council contact list (one contact per body
-- and category, confirmed or not, retired rather than deleted) and on
-- Open311 GeoReport v2 (a list of services per jurisdiction), so an Open311
-- link can be added later without reshaping this table.
--
--   departments  JSON list of department types this office handles, from
--                functions/_shared/departments.js (e.g. ["Water Supply"])
--   wards        JSON list of local_units ids it covers; NULL = the whole area
--   officer_*    a named officer's own mobile, ONLY with their recorded
--                agreement (DPDP Act s.6); otherwise left empty
--   retired_at   set instead of deleting, so old records keep their meaning
--
-- No triggers are added: the trigger count stays 28. Every change is
-- recorded in admin_events (which is protected).

CREATE TABLE IF NOT EXISTS dept_offices (
  id                   TEXT PRIMARY KEY,
  area_id              TEXT NOT NULL,
  name_en              TEXT NOT NULL,
  name_hi              TEXT,
  departments          TEXT NOT NULL,
  wards                TEXT,
  helpline             TEXT,
  office_phone         TEXT,
  office_email         TEXT,
  whatsapp             TEXT,
  website              TEXT,
  address              TEXT,
  hours                TEXT,
  officer_name         TEXT,
  officer_phone        TEXT,
  officer_consent_date TEXT,
  officer_consent_how  TEXT,
  source               TEXT NOT NULL,
  last_checked         TEXT NOT NULL,
  notes                TEXT,
  created_at           TEXT NOT NULL,
  created_by           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  updated_by           TEXT NOT NULL,
  retired_at           TEXT,
  retired_by           TEXT,
  retire_reason        TEXT
);

CREATE INDEX IF NOT EXISTS idx_dept_offices_area ON dept_offices (area_id, retired_at);
