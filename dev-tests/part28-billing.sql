-- part28-billing.sql   (grieviq-41, October 2026)
--
-- Bills for offices, paid by UPI or bank transfer (approved 11 Oct 2026):
--   bills          one bill per office per period, with its own reference
--                  (GIQ-PAY-000001). Amount, GST and total are worked out
--                  from the published plan prices when the bill is made,
--                  never typed in, so every party pays the same.
--   bill_payments  "I have paid": the office's transaction reference (UTR),
--                  amount and date; GrievIQ staff check it against the bank
--                  statement and confirm or turn it back with a reason.
--   bill_events    everything that happened to a bill. Kept for good: two
--                  triggers refuse changing or deleting a record.
--
-- Creates new tables only. No existing data is changed.
-- The trigger count goes from 30 to 32.
-- Run ONCE ("table ... already exists" means it was already done).

CREATE TABLE bills (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  office_type TEXT NOT NULL CHECK (office_type IN ('REP','DEPT')),
  office_tier TEXT,
  office_id TEXT NOT NULL,
  office_name TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('MONTH','YEAR')),
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  amount INTEGER NOT NULL,
  gst_rate REAL NOT NULL,
  gst INTEGER NOT NULL,
  total INTEGER NOT NULL,
  offer_id TEXT,
  settings_version INTEGER NOT NULL,
  due_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DUE' CHECK (status IN ('DUE','REPORTED','PAID','CANCELLED')),
  issued_by TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  paid_at TEXT,
  paid_checked_by TEXT,
  cancelled_at TEXT,
  cancelled_by TEXT,
  cancel_reason TEXT,
  note TEXT
);
CREATE INDEX idx_bills_office ON bills (office_type, office_id, issued_at);
CREATE INDEX idx_bills_status ON bills (status, issued_at);

CREATE TABLE bill_payments (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL REFERENCES bills(id),
  method TEXT NOT NULL CHECK (method IN ('UPI','BANK')),
  utr TEXT NOT NULL,
  amount INTEGER NOT NULL,
  paid_on TEXT NOT NULL,
  reported_by TEXT NOT NULL,
  reported_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REPORTED' CHECK (status IN ('REPORTED','CONFIRMED','RETURNED')),
  checked_by TEXT,
  checked_at TEXT,
  reason TEXT
);
CREATE INDEX idx_bill_payments_bill ON bill_payments (bill_id, reported_at);
CREATE INDEX idx_bill_payments_utr ON bill_payments (utr);

CREATE TABLE bill_events (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX idx_bill_events_bill ON bill_events (bill_id, at);
CREATE TRIGGER no_update_bill_events BEFORE UPDATE ON bill_events
BEGIN SELECT RAISE(ABORT, 'Bill records cannot be changed.'); END;
CREATE TRIGGER no_delete_bill_events BEFORE DELETE ON bill_events
BEGIN SELECT RAISE(ABORT, 'Bill records cannot be deleted.'); END;
