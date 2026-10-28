-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part47 (grieviq-73): Community helpers, part 2 — filing for a citizen.
--
-- A helper files a complaint for a citizen, but it reaches the
-- representative only after the CITIZEN confirms they asked for it: with a
-- code sent to their own email (or the link in that email), or, when they
-- have no email, a phone call from GrievIQ staff. Until then it waits here,
-- never in grievances, so no office sees it.
--   helper_filings  one row per filing. The complaint itself (payload) is
--                   kept only while it waits, and cleared once it is sent,
--                   refused or runs out of time. Status:
--       WAITING_CODE  waiting for the citizen's email code or link (3 days)
--       WAITING_CALL  no email (or no code in 3 days): GrievIQ staff call
--                     the citizen (up to 7 days after filing)
--       SENT          the citizen confirmed; it is now complaint grievance_id
--       NOT_ASKED     the citizen said they didn't ask for it (a strike)
--       CANCELLED     the helper cancelled it, or the citizen didn't want it now
--       FAKE          GrievIQ staff found it false (a strike)
--       EXPIRED       not confirmed in time
--   grievances.helper_id        who helped (offices see only "Filed with help
--                               from a Community helper", never who)
--   grievances.helper_removed_at the citizen removed the helper (Track page):
--                               the helper can't see the complaint any more
-- No triggers (the count stays 40). Run ONCE ("duplicate column name" means it was done).

ALTER TABLE grievances ADD COLUMN helper_id TEXT;
ALTER TABLE grievances ADD COLUMN helper_removed_at TEXT;

CREATE TABLE IF NOT EXISTS helper_filings (
  id             TEXT PRIMARY KEY,
  helper_id      TEXT NOT NULL REFERENCES helpers(id),
  created_at     TEXT NOT NULL,
  day            TEXT NOT NULL,                      -- India date, for the 15-a-day limit
  unit_id        TEXT NOT NULL,
  category_id    TEXT NOT NULL,
  payload        TEXT,                               -- the complaint while it waits; then NULL
  phone_hash     TEXT NOT NULL,                      -- SHA-256 of the citizen's mobile (repeat check)
  text_sig       TEXT,                               -- words of the description, for "similar" flags
  has_email      INTEGER NOT NULL DEFAULT 0 CHECK (has_email IN (0,1)),
  status         TEXT NOT NULL CHECK (status IN ('WAITING_CODE','WAITING_CALL','SENT','NOT_ASKED','CANCELLED','FAKE','EXPIRED')),
  code_hash      TEXT,
  code_tries     INTEGER NOT NULL DEFAULT 0,
  codes_sent     INTEGER NOT NULL DEFAULT 0,
  code_sent_at   TEXT,
  link_hash      TEXT UNIQUE,
  flags          TEXT,                               -- JSON list: SIMILAR_TEXT, SAME_PHONE
  flag_review    TEXT CHECK (flag_review IS NULL OR flag_review IN ('FINE','FAKE')),
  call_tries     INTEGER NOT NULL DEFAULT 0,
  last_call_at   TEXT,
  consent_via    TEXT CHECK (consent_via IS NULL OR consent_via IN ('CODE','LINK','CALL')),
  decided_at     TEXT,
  decided_by     TEXT,
  note           TEXT,
  grievance_id   TEXT,
  removed_at     TEXT,
  remove_reason  TEXT CHECK (remove_reason IS NULL OR remove_reason IN ('DIDNT_ASK','NO_LONGER','OTHER'))
);
CREATE INDEX IF NOT EXISTS idx_hf_helper ON helper_filings(helper_id, created_at);
CREATE INDEX IF NOT EXISTS idx_hf_status ON helper_filings(status, created_at);
CREATE INDEX IF NOT EXISTS idx_hf_grievance ON helper_filings(grievance_id);
