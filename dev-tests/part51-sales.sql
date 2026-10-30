-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part51 (grieviq-77): the sales pipeline.
--
-- sales_leads: one office GrievIQ is talking to. From a pilot request on
-- /for-offices (source PILOT, copied over once) or added by sales staff
-- (MANUAL). Stages: NEW, CONTACTED, DEMO (demo done), QUOTED (quotation
-- sent), WON, LOST (with a reason). There is deliberately no field for a
-- political party, caste or religion: GrievIQ sells to every party at the
-- same price. Contact details (name, designation, mobile, email) are kept
-- while the lead is open and for 2 years after it closes, then removed
-- (erased_at); the office, stage and dates stay for the totals.
-- sales_lead_events: what was done (call, meeting, email, demo, note) and
-- every change of stage, owner or follow-up date. Notes are removed with
-- the contact details.
-- sales_territories: the states each sales person covers (GST state codes).
-- quotations.approval: 'PENDING' for a State, National or District quotation
-- prepared by a sales manager, until the super admin approves it
-- ('APPROVED'); NULL when no approval is needed. quotations.lead_id links a
-- quotation to its lead.
-- No triggers (the count stays 42). Run ONCE ("already exists" /
-- "duplicate column name" means it was done).

CREATE TABLE sales_leads (
  id               TEXT PRIMARY KEY,
  ref              TEXT NOT NULL UNIQUE,
  source           TEXT NOT NULL CHECK (source IN ('PILOT', 'MANUAL')),
  pilot_request_id TEXT UNIQUE,
  office_kind      TEXT NOT NULL CHECK (office_kind IN ('PRADHAN', 'COUNCILLOR', 'MAYOR', 'MLA', 'MP', 'DEPARTMENT', 'DISTRICT', 'STATE', 'NATIONAL', 'OTHER')),
  office_name      TEXT NOT NULL,
  place            TEXT,
  state_code       TEXT,
  contact_name     TEXT,
  designation      TEXT,
  mobile           TEXT,
  email            TEXT,
  stage            TEXT NOT NULL DEFAULT 'NEW' CHECK (stage IN ('NEW', 'CONTACTED', 'DEMO', 'QUOTED', 'WON', 'LOST')),
  lost_reason      TEXT CHECK (lost_reason IS NULL OR lost_reason IN ('PRICE', 'NO_BUDGET', 'NOT_INTERESTED', 'OTHER_PRODUCT', 'NO_REPLY', 'ELECTION', 'NOT_ELIGIBLE', 'OTHER')),
  owner_email      TEXT,
  next_date        TEXT,
  next_step        TEXT,
  quotation_id     TEXT,
  created_by       TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  closed_at        TEXT,
  erased_at        TEXT
);
CREATE INDEX idx_sales_leads_owner ON sales_leads(owner_email, stage);
CREATE INDEX idx_sales_leads_state ON sales_leads(state_code);
CREATE INDEX idx_sales_leads_next ON sales_leads(next_date) WHERE closed_at IS NULL;
CREATE INDEX idx_sales_leads_closed ON sales_leads(closed_at) WHERE erased_at IS NULL;

CREATE TABLE sales_lead_events (
  id        TEXT PRIMARY KEY,
  lead_id   TEXT NOT NULL,
  at        TEXT NOT NULL,
  by_email  TEXT NOT NULL,
  kind      TEXT NOT NULL CHECK (kind IN ('CREATED', 'CALL', 'MEETING', 'EMAIL', 'DEMO', 'NOTE', 'STAGE', 'OWNER', 'NEXT', 'DETAILS', 'QUOTATION', 'ERASED')),
  stage_from TEXT,
  stage_to  TEXT,
  note      TEXT
);
CREATE INDEX idx_sales_lead_events_lead ON sales_lead_events(lead_id, at);

CREATE TABLE sales_territories (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  state_code TEXT NOT NULL,
  given_by   TEXT NOT NULL,
  given_at   TEXT NOT NULL,
  UNIQUE (email, state_code)
);

ALTER TABLE quotations ADD COLUMN approval TEXT CHECK (approval IS NULL OR approval IN ('PENDING', 'APPROVED'));
ALTER TABLE quotations ADD COLUMN approved_by TEXT;
ALTER TABLE quotations ADD COLUMN approved_at TEXT;
ALTER TABLE quotations ADD COLUMN lead_id TEXT;
