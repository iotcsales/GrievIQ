-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part54 (grieviq-83): the onboarding form, filled by sales staff when an office or a department
-- office joins GrievIQ.
--
-- onboarding_forms   one form per sales lead. answers holds the form's answers (JSON); there are
--                    no boxes for party, ID numbers, bank or card details, salaries or citizens'
--                    details, and free-text answers that look like an ID, card or mobile number
--                    are refused. status: DRAFT -> SUBMITTED (by the person who filled it) ->
--                    RETURNED (sent back with a note) or CHECKED (looked over, nothing to set up)
--                    or SENT (sent for setup: change requests made for the office's official
--                    contacts and localities, and a setup checklist). The person who checks a form
--                    never filled any part of it (editors). The answers are emptied together with
--                    the lead's contact details, 2 years after the lead closes.
-- onboarding_events  what happened to a form (submitted, sent back, checked, sent for setup,
--                    checklist ticks), with who and when.
-- No triggers (the count stays 44). Run ONCE ("already exists" means it was done).

CREATE TABLE onboarding_forms (
  id            TEXT PRIMARY KEY,
  lead_id       TEXT NOT NULL UNIQUE,
  form_kind     TEXT NOT NULL CHECK (form_kind IN ('OFFICE', 'DEPARTMENT')),
  status        TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'RETURNED', 'CHECKED', 'SENT')),
  answers       TEXT NOT NULL DEFAULT '{}',
  outcome       TEXT CHECK (outcome IS NULL OR outcome IN ('SIGNED_PILOT', 'SIGNED_PAID', 'FOLLOW_UP', 'NOT_NOW', 'DECLINED')),
  version       INTEGER NOT NULL DEFAULT 1,
  editors       TEXT NOT NULL DEFAULT '[]',
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  submitted_by  TEXT,
  submitted_at  TEXT,
  return_note   TEXT,
  checked_by    TEXT,
  checked_at    TEXT,
  checklist     TEXT NOT NULL DEFAULT '[]',
  setup_notes   TEXT NOT NULL DEFAULT '[]',
  change_ids    TEXT NOT NULL DEFAULT '[]',
  erased_at     TEXT
);
CREATE INDEX idx_onboarding_status ON onboarding_forms(status);

CREATE TABLE onboarding_events (
  id        TEXT PRIMARY KEY,
  form_id   TEXT NOT NULL,
  at        TEXT NOT NULL,
  by_email  TEXT NOT NULL,
  kind      TEXT NOT NULL CHECK (kind IN ('STARTED', 'SUBMITTED', 'RETURNED', 'CHECKED', 'SENT', 'TASK_DONE', 'TASK_UNDONE', 'ERASED')),
  note      TEXT
);
CREATE INDEX idx_onboarding_events_form ON onboarding_events(form_id, at);
