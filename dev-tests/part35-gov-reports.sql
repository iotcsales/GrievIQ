-- Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part35-gov-reports.sql   (grieviq-50, October 2026)
--
-- MIS reports on the government dashboard. Officials choose whether to be
-- emailed when the monthly report is ready (on the 1st) and every Monday
-- about cases pending over 30 days. The emails carry no figures and no case
-- details: they say the report is ready and where to sign in.
--   gov_report_prefs  each official's choice (off unless they turn it on)
--   gov_report_sends  one row per email sent, so none is sent twice
--
-- New tables only. No existing data changes. The trigger count stays 36.
-- Run ONCE ("table ... already exists" means it was already done).

CREATE TABLE gov_report_prefs (
  user_id    TEXT PRIMARY KEY REFERENCES gov_users(id),
  monthly    INTEGER NOT NULL DEFAULT 0,
  weekly     INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE gov_report_sends (
  user_id TEXT NOT NULL,
  kind    TEXT NOT NULL CHECK (kind IN ('MONTHLY','WEEKLY')),
  period  TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  ok      INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, kind, period)
);
