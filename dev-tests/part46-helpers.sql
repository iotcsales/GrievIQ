-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part46 (grieviq-72): Community helpers, part 1.
--
-- A Community helper is a local person who helps neighbours file and follow
-- complaints. They apply with Google sign-in, a photo ID, a selfie holding
-- the ID and the code of conduct; pay the monthly fee (the same for
-- everyone, set in Prices & site details) from their own money; and are
-- checked by GrievIQ staff (one checks, including a video call; a different
-- one approves). Only GrievIQ staff approve: a representative can't approve
-- or block a helper.
--   helpers          one row per application. Kept about the ID: its type,
--                    the last 4 characters, and a keyed fingerprint (HMAC)
--                    of the number so the same ID can't be used twice. A full
--                    Aadhaar number is never accepted or stored. The ID
--                    photo and selfie (private storage) are deleted 30 days
--                    after the decision; every staff view is recorded.
--   helper_events    the helper's history: what happened, who did it, when.
--                    Can't be changed, and can't be deleted for 3 years
--                    (2 new triggers: the trigger count becomes 40).
--   helper_payments  the monthly fee through Razorpay, with receipts.
-- Also: oauth_states.purpose, so "Sign in with Google" knows a helper is
-- signing in (and sends them to /helper, not the representatives' console).
-- Run ONCE ("duplicate column name: purpose" means it was done).

ALTER TABLE oauth_states ADD COLUMN purpose TEXT;

CREATE TABLE IF NOT EXISTS helpers (
  id                 TEXT PRIMARY KEY,
  ref                TEXT UNIQUE,                 -- GIQ-H-0001, given on approval (the public record)
  email              TEXT NOT NULL,               -- Google sign-in (lower case)
  name               TEXT NOT NULL,               -- as on the ID; seen by GrievIQ staff only
  mobile             TEXT NOT NULL,
  unit_id            TEXT NOT NULL,               -- ward or village
  area_id            TEXT,
  state              TEXT,
  about              TEXT,
  id_type            TEXT NOT NULL CHECK (id_type IN ('EPIC','PAN','DL','PASSPORT','AADHAAR')),
  id_last4           TEXT NOT NULL,
  id_hash            TEXT,                        -- HMAC-SHA256 of the ID number (not for masked Aadhaar)
  id_key             TEXT,                        -- private storage keys
  selfie_key         TEXT,
  files_at           TEXT,
  files_decided_at   TEXT,                        -- files are deleted 30 days after this
  files_deleted_at   TEXT,
  conduct_at         TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','WAITING','CHECKED','ACTIVE','LAPSED','SUSPENDED','REMOVED','REFUSED','STOPPED','WITHDRAWN')),
  submitted_at       TEXT,
  checked_by         TEXT,
  checked_at         TEXT,
  check_note         TEXT,
  video_on           TEXT,
  decided_by         TEXT,
  decided_at         TEXT,
  decision_note      TEXT,
  refuse_kind        TEXT CHECK (refuse_kind IS NULL OR refuse_kind IN ('NOT_FAULT','FORGED')),
  approved_at        TEXT,
  paid_until         TEXT,                        -- last day paid for (India date)
  kyc_due            TEXT,                        -- ID checked again every 12 months
  recheck            TEXT CHECK (recheck IS NULL OR recheck IN ('WAITING','CHECKED')),
  recheck_by         TEXT,
  recheck_at         TEXT,
  action_by          TEXT,                        -- suspended or removed by
  action_at          TEXT,
  action_reason      TEXT,
  appeal_text        TEXT,
  appeal_at          TEXT,
  appeal_by          TEXT,                        -- the staff member who decided it
  appeal_decided_at  TEXT,
  appeal_result      TEXT CHECK (appeal_result IS NULL OR appeal_result IN ('UPHELD','OVERTURNED')),
  appeal_note        TEXT,
  reminded_for       TEXT,                        -- paid_until the renewal reminder was sent for
  credit_day         TEXT,                        -- last election-code day added to the month
  strikes            INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
-- One open application or helper role per Google account.
CREATE UNIQUE INDEX IF NOT EXISTS ux_helpers_open_email ON helpers(email) WHERE status NOT IN ('REFUSED','STOPPED','WITHDRAWN','REMOVED');
CREATE INDEX IF NOT EXISTS idx_helpers_status ON helpers(status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_helpers_hash ON helpers(id_hash);
CREATE INDEX IF NOT EXISTS idx_helpers_unit ON helpers(unit_id, status);

CREATE TABLE IF NOT EXISTS helper_events (
  id         TEXT PRIMARY KEY,
  helper_id  TEXT NOT NULL,
  at         TEXT NOT NULL,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  detail     TEXT
);
CREATE INDEX IF NOT EXISTS idx_helper_events ON helper_events(helper_id, at);
CREATE TRIGGER IF NOT EXISTS no_update_helper_events BEFORE UPDATE ON helper_events
BEGIN SELECT RAISE(ABORT, 'helper_events rows cannot be changed'); END;
CREATE TRIGGER IF NOT EXISTS no_delete_recent_helper_events BEFORE DELETE ON helper_events
WHEN OLD.at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 years')
BEGIN SELECT RAISE(ABORT, 'helper_events rows are kept for 3 years'); END;

CREATE TABLE IF NOT EXISTS helper_payments (
  id            TEXT PRIMARY KEY,
  helper_id     TEXT NOT NULL REFERENCES helpers(id),
  receipt_no    TEXT UNIQUE,                      -- GIQ-HR-000001 once paid
  kind          TEXT NOT NULL CHECK (kind IN ('FIRST','RENEWAL')),
  provider      TEXT NOT NULL DEFAULT 'RAZORPAY' CHECK (provider IN ('RAZORPAY')),
  mode          TEXT NOT NULL CHECK (mode IN ('TEST','LIVE')),
  order_id      TEXT NOT NULL UNIQUE,
  payment_id    TEXT UNIQUE,
  amount_paise  INTEGER NOT NULL CHECK (amount_paise > 0),
  price         INTEGER NOT NULL,                 -- rupees, GST included
  base          INTEGER NOT NULL,
  gst           INTEGER NOT NULL,
  gst_rate      INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','PAID','TEST_PAID','EXTRA','REFUND_DUE','REFUNDED','EXPIRED')),
  method        TEXT,
  own_funds     INTEGER NOT NULL DEFAULT 1 CHECK (own_funds IN (0,1)),
  period_from   TEXT,
  period_to     TEXT,
  started_by    TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  last_try_at   TEXT,
  last_fail     TEXT,
  settled_at    TEXT,
  settled_via   TEXT CHECK (settled_via IS NULL OR settled_via IN ('CHECKOUT','WEBHOOK','HOURLY','STAFF')),
  refund_why    TEXT,
  staff_by      TEXT,
  staff_at      TEXT,
  staff_note    TEXT
);
CREATE INDEX IF NOT EXISTS idx_hp_helper ON helper_payments(helper_id, started_at);
CREATE INDEX IF NOT EXISTS idx_hp_status ON helper_payments(status, started_at);
