-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part36 (grieviq-53): change of representative.
--
-- Every seat (ward or village, mayor, MLA, MP) gets a status:
--   NULL or 'ELECTED'  the normal state
--   'ADMINISTRATOR'    held by an administrator (for example a panchayat
--                      run by an administrator until elections are held)
--   'VACANT'           nobody holds it: complaints go straight to the next
--                      level, which is not marked late for the empty seat
-- seat_handovers keeps every change of the person holding a seat: who,
-- why, on what evidence, who asked, who approved, and what was done
-- (sessions ended, cases returned to the office, sharing switched off).
-- Every step is also written to admin_events (tamper-proof).
-- Trigger count stays 36.

ALTER TABLE local_units ADD COLUMN seat_status TEXT;
ALTER TABLE municipal_bodies ADD COLUMN seat_status TEXT;
ALTER TABLE mla_constituencies ADD COLUMN seat_status TEXT;
ALTER TABLE mp_constituencies ADD COLUMN seat_status TEXT;

CREATE TABLE IF NOT EXISTS seat_handovers (
  id               TEXT PRIMARY KEY,
  seat_type        TEXT NOT NULL CHECK (seat_type IN ('ward', 'mayor', 'mla', 'mp')),
  seat_id          TEXT NOT NULL,
  seat_label       TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('NEW_REP', 'ADMINISTRATOR', 'VACANT')),
  reason           TEXT NOT NULL CHECK (reason IN ('ELECTION', 'BY_ELECTION', 'RESIGNATION', 'DEATH', 'DISQUALIFICATION', 'ADMINISTRATOR', 'TERM_ENDED', 'OTHER')),
  reason_note      TEXT,
  evidence         TEXT NOT NULL,
  effective_date   TEXT NOT NULL,
  old_name         TEXT,
  old_phone        TEXT,
  old_email        TEXT,
  old_status       TEXT,
  new_name         TEXT,
  new_phone        TEXT,
  new_email        TEXT,
  status           TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPLIED', 'REJECTED', 'WITHDRAWN', 'OUT_OF_DATE')),
  requested_by     TEXT NOT NULL,
  requested_at     TEXT NOT NULL,
  decided_by       TEXT,
  decided_at       TEXT,
  decision_note    TEXT,
  applied_summary  TEXT,
  welcome_seen_at  TEXT,
  plan_accepted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_seat_handovers_seat ON seat_handovers (seat_type, seat_id, status);
CREATE INDEX IF NOT EXISTS idx_seat_handovers_new ON seat_handovers (new_email, status);
CREATE INDEX IF NOT EXISTS idx_seat_handovers_status ON seat_handovers (status, requested_at);
