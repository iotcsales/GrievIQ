-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part41 (grieviq-65): follow-up requests between government officials.
--
-- A state official asks a district (or a department office) "what is being
-- done about this figure?"; national officials ask a state; districts and
-- states can raise an issue to the level above. Each request carries a
-- snapshot of one dashboard figure, a short note, the official letter or
-- eOffice number if an order was issued, and a reply-by date. On that date
-- the same figure is measured again. It is not an official order: orders go
-- through NIC email or eOffice (Government of India e-mail policy, cl. 2.1).
-- No citizen details, attachments or links are ever stored here.
--   followups               one row per request (status changes over time)
--   followup_events         every step; rows can't be changed, and can be
--                           deleted only 3 years after they were written
--                           (2 new triggers: the count becomes 38)
--   gov_followup_settings   per state ('*' = national requests): switched
--                           on by a super admin only on the state's (or the
--                           ministry's) letter
-- Run ONCE ("already exists" means it was done).

CREATE TABLE IF NOT EXISTS followups (
  id               TEXT PRIMARY KEY,
  ref              TEXT NOT NULL UNIQUE,
  from_level       TEXT NOT NULL CHECK (from_level IN ('NATIONAL','STATE','DISTRICT')),
  from_state_id    TEXT,
  from_district_id TEXT,
  from_user_id     TEXT NOT NULL,
  to_kind          TEXT NOT NULL CHECK (to_kind IN ('NATIONAL','STATE','DISTRICT','DEPT')),
  to_state_id      TEXT,
  to_district_id   TEXT,
  to_office_id     TEXT,
  to_name          TEXT NOT NULL,
  figure           TEXT NOT NULL,
  snapshot         TEXT NOT NULL,
  snapshot_at      TEXT NOT NULL,
  note             TEXT NOT NULL,
  letter_ref       TEXT,
  letter_date      TEXT,
  reply_by         TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','REPLIED','OVERDUE','CLOSED')),
  was_overdue      INTEGER NOT NULL DEFAULT 0,
  reminded         INTEGER NOT NULL DEFAULT 0,
  result           TEXT,
  measured_at      TEXT,
  closed_as        TEXT CHECK (closed_as IS NULL OR closed_as IN ('DONE','NOT_RESOLVED')),
  closed_reason    TEXT,
  closed_by        TEXT,
  closed_at        TEXT,
  follows          TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_followups_to ON followups (to_kind, to_state_id, to_district_id, to_office_id, status);
CREATE INDEX IF NOT EXISTS idx_followups_from ON followups (from_level, from_state_id, from_district_id, status);
CREATE INDEX IF NOT EXISTS idx_followups_due ON followups (status, reply_by);

CREATE TABLE IF NOT EXISTS followup_events (
  id          TEXT PRIMARY KEY,
  followup_id TEXT NOT NULL,
  at          TEXT NOT NULL,
  kind        TEXT NOT NULL,
  by_kind     TEXT,
  by_id       TEXT,
  by_name     TEXT,
  by_place    TEXT,
  text        TEXT,
  letter_ref  TEXT,
  data        TEXT
);
CREATE INDEX IF NOT EXISTS idx_followup_events_fu ON followup_events (followup_id, at);
CREATE TRIGGER IF NOT EXISTS no_update_followup_events BEFORE UPDATE ON followup_events
BEGIN SELECT RAISE(ABORT, 'followup_events rows cannot be changed'); END;
CREATE TRIGGER IF NOT EXISTS no_delete_recent_followup_events BEFORE DELETE ON followup_events
WHEN OLD.at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 years')
BEGIN SELECT RAISE(ABORT, 'followup_events rows are kept for 3 years'); END;

CREATE TABLE IF NOT EXISTS gov_followup_settings (
  state_id    TEXT PRIMARY KEY,
  enabled     INTEGER NOT NULL DEFAULT 0,
  letter_ref  TEXT,
  changed_by  TEXT NOT NULL,
  changed_at  TEXT NOT NULL
);
