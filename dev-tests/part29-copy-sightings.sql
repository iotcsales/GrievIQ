-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part29-copy-sightings.sql   (grieviq-45, October 2026)
--
-- Copies of GrievIQ found running elsewhere (approved 12 Oct 2026). When a
-- page of GrievIQ is opened on a web address that isn't GrievIQ's own, it
-- reports that address once a day; a copied server reports itself too.
-- Only the address, the first part of the page path, the country (from
-- Cloudflare) and counts are kept: no person, no IP address, no citizen data.
--
-- Creates one new table. No existing data is changed. Trigger count stays 32.
-- Run ONCE ("table ... already exists" means it was already done).

CREATE TABLE copy_sightings (
  host TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1,
  last_path TEXT,
  country TEXT,
  seen_by TEXT NOT NULL DEFAULT ''
);
