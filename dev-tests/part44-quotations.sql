-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part44 (grieviq-70): quotations for offices.
--
-- A department (or a representative's office) often needs a formal
-- quotation for its file before it can issue a work order or purchase
-- order. GrievIQ staff make one from the published prices: reference
-- GIQ-QT-000001, the office it is for, the plan and period, amount, GST,
-- total and how long it is valid. It can be printed or saved as a PDF and
-- emailed with a private link. When the office's order arrives, staff turn
-- it into a bill at the quoted price, even if prices have changed since.
-- Every step is written to admin_events (which can't be changed).
-- No new triggers: the count stays 38.
-- Run ONCE ("already exists" means it was done).

CREATE TABLE IF NOT EXISTS quotations (
  id               TEXT PRIMARY KEY,
  ref              TEXT NOT NULL UNIQUE,
  office_name      TEXT NOT NULL,
  addressee        TEXT,
  email            TEXT,
  plan_id          TEXT NOT NULL,
  plan_name        TEXT NOT NULL,
  period           TEXT NOT NULL CHECK (period IN ('MONTH','YEAR')),
  amount           INTEGER NOT NULL,
  gst_rate         REAL NOT NULL,
  gst              INTEGER NOT NULL,
  total            INTEGER NOT NULL,
  offer_id         TEXT,
  settings_version INTEGER,
  valid_until      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACCEPTED','WITHDRAWN')),
  note             TEXT,
  view_key         TEXT NOT NULL,
  made_by          TEXT NOT NULL,
  made_at          TEXT NOT NULL,
  emailed_to       TEXT,
  emailed_at       TEXT,
  order_ref        TEXT,
  bill_id          TEXT,
  accepted_by      TEXT,
  accepted_at      TEXT,
  withdrawn_by     TEXT,
  withdrawn_at     TEXT,
  withdraw_reason  TEXT
);
CREATE INDEX IF NOT EXISTS idx_quotations_made ON quotations(made_at);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status, valid_until);
