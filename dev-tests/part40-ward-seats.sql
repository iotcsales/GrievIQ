-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part40 (grieviq-57): wards with more than one elected member.
--
-- Some states elect several members per ward (Pune 2026: seats A, B, C, D
-- in one ward). Each seat is its own office on GrievIQ: own sign-in, team,
-- plan, bills and handover.
--   local_units.seat_count   1 (or empty) = one member, as before; up to 6
--   ward_seats               seats B, C, D... of a ward. Seat A stays the
--                            ward's own record in local_units, so nothing
--                            already in use changes. A seat's id is the
--                            ward's id + "~" + its letter (e.g. "w12~B").
--   local_offices            a read-only view: every seat of every ward as
--                            one office row (seat A from local_units).
--   grievances.seat_choice   in a multi-member ward: 'ANY' (any member) or
--                            the seat the citizen chose
--   grievances.seat_owner    the seat that handles the case (NULL = open to
--                            every member of the ward)
--   grievances.seat_owner_at when that seat took it
-- Taking and returning cases is written to team_activity (tamper-proof).
-- New tables, columns and a view only. The trigger count stays 36.
-- Run ONCE ("duplicate column name" or "already exists" means it was done).

ALTER TABLE local_units ADD COLUMN seat_count INTEGER;

CREATE TABLE IF NOT EXISTS ward_seats (
  id            TEXT PRIMARY KEY,
  local_unit_id TEXT NOT NULL,
  seat_label    TEXT NOT NULL CHECK (seat_label IN ('B', 'C', 'D', 'E', 'F')),
  rep_name      TEXT,
  rep_phone     TEXT,
  rep_email     TEXT,
  seat_status   TEXT,
  created_at    TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  updated_at    TEXT,
  updated_by    TEXT,
  UNIQUE (local_unit_id, seat_label)
);
CREATE INDEX IF NOT EXISTS idx_ward_seats_email ON ward_seats (rep_email);

ALTER TABLE grievances ADD COLUMN seat_choice TEXT;
ALTER TABLE grievances ADD COLUMN seat_owner TEXT;
ALTER TABLE grievances ADD COLUMN seat_owner_at TEXT;
CREATE INDEX IF NOT EXISTS idx_grievances_seat_owner ON grievances (seat_owner);

DROP VIEW IF EXISTS local_offices;
CREATE VIEW local_offices AS
  SELECT lu.id AS id, lu.id AS unit_id, 'A' AS seat_label,
         CASE WHEN COALESCE(lu.seat_count, 1) > 1 THEN lu.name || ' · Seat A' ELSE lu.name END AS name,
         lu.name AS unit_name, lu.unit_type, lu.rep_name, lu.rep_phone, lu.rep_email, lu.seat_status,
         lu.area_id, lu.municipal_body_id, lu.mla_constituency_id, COALESCE(lu.seat_count, 1) AS seat_count
    FROM local_units lu
  UNION ALL
  SELECT s.id, s.local_unit_id, s.seat_label, lu.name || ' · Seat ' || s.seat_label,
         lu.name, lu.unit_type, s.rep_name, s.rep_phone, s.rep_email, s.seat_status,
         lu.area_id, lu.municipal_body_id, lu.mla_constituency_id, COALESCE(lu.seat_count, 1)
    FROM ward_seats s JOIN local_units lu ON lu.id = s.local_unit_id;
