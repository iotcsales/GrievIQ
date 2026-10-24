-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part31-speed.sql   (grieviq-47, October 2026)
--
-- Speed monitor. About 1 in 20 requests to GrievIQ's servers records how
-- long it took (no person, no address, no case: only the part of GrievIQ,
-- the time and whether it failed). Every hour the scheduler turns these into
-- hourly figures, keeps those for 30 days and deletes the raw samples after
-- 2 days. If GrievIQ is slow for 2 hours in a row, super admins get one email
-- that day.
--   speed_samples  raw samples (2 days)
--   speed_hourly   one row per hour and part of GrievIQ (30 days)
--   speed_alerts   one row per day an alert email went out
--
-- New tables only. No existing data is changed. The trigger count stays 34.
-- Run ONCE ("table ... already exists" means it was already done).

CREATE TABLE speed_samples (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('CITIZEN','REP','DEPT','ADMIN')),
  ms INTEGER NOT NULL,
  failed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_speed_samples_at ON speed_samples(at);

CREATE TABLE speed_hourly (
  hour TEXT NOT NULL,
  area TEXT NOT NULL,
  n INTEGER NOT NULL,
  p50 INTEGER NOT NULL,
  p95 INTEGER NOT NULL,
  max_ms INTEGER NOT NULL,
  failed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hour, area)
);

CREATE TABLE speed_alerts (
  day TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  detail TEXT
);
