-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part42 (grieviq-67): "Pay online" for bills, through Razorpay.
--
-- An office opens a bill and taps "Pay online": GrievIQ asks Razorpay for an
-- order of exactly the bill total, Razorpay's own payment window takes the
-- payment (UPI, card, net banking or wallet), and GrievIQ checks it with
-- Razorpay itself before the bill is marked paid. Card numbers, UPI PINs and
-- bank passwords never reach GrievIQ; only Razorpay's reference, the amount
-- and the way of paying (for example "upi") are kept.
--   bill_online_payments    one row per Razorpay order. Status:
--       CREATED   waiting for the payment
--       PAID      paid and checked; the bill is paid
--       TEST_PAID paid with Razorpay TEST keys: no money moved, the bill
--                 stays unpaid
--       EXTRA     money taken but the bill was already paid or cancelled:
--                 GrievIQ staff refund it from the Razorpay dashboard
--       REFUNDED  staff have refunded an EXTRA payment
--       EXPIRED   nothing paid within 3 days (or the keys changed)
--   payment_webhook_events  each message Razorpay sends is handled once
--       (Razorpay may send the same message more than once)
-- The existing bill_payments table (UPI and bank transfers the office
-- records itself) is unchanged. No new triggers: the count stays 38.
-- Run ONCE ("already exists" means it was done).

CREATE TABLE IF NOT EXISTS bill_online_payments (
  id            TEXT PRIMARY KEY,
  bill_id       TEXT NOT NULL REFERENCES bills(id),
  provider      TEXT NOT NULL DEFAULT 'RAZORPAY' CHECK (provider IN ('RAZORPAY')),
  mode          TEXT NOT NULL CHECK (mode IN ('TEST','LIVE')),
  order_id      TEXT NOT NULL UNIQUE,
  payment_id    TEXT UNIQUE,
  amount_paise  INTEGER NOT NULL CHECK (amount_paise > 0),
  currency      TEXT NOT NULL DEFAULT 'INR',
  status        TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','PAID','TEST_PAID','EXTRA','REFUNDED','EXPIRED')),
  method        TEXT,
  own_funds     INTEGER NOT NULL DEFAULT 1 CHECK (own_funds IN (0,1)),
  started_by    TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  last_try_at   TEXT,
  last_fail     TEXT,
  settled_at    TEXT,
  settled_via   TEXT CHECK (settled_via IS NULL OR settled_via IN ('CHECKOUT','WEBHOOK','HOURLY','STAFF')),
  staff_by      TEXT,
  staff_at      TEXT,
  staff_note    TEXT
);
CREATE INDEX IF NOT EXISTS idx_bop_bill ON bill_online_payments(bill_id, started_at);
CREATE INDEX IF NOT EXISTS idx_bop_status ON bill_online_payments(status, started_at);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id           TEXT PRIMARY KEY,
  provider     TEXT NOT NULL,
  event        TEXT NOT NULL,
  received_at  TEXT NOT NULL,
  result       TEXT
);
CREATE INDEX IF NOT EXISTS idx_pwe_at ON payment_webhook_events(received_at);
