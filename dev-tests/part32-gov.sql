-- Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part32-gov.sql   (grieviq-48, October 2026)
--
-- Groundwork for the state government dashboard (approved 16 Oct 2026).
--   states            the 28 states and 8 union territories, with their
--                     official LGD codes (Local Government Directory, NIC)
--   districts         districts with their LGD codes, added on the Areas page
--   areas             + district_id (the district a city or district area is
--                     in) and lgd_code (the local body's LGD code)
--   local_units       + lgd_code (the ward's or village's LGD code)
--   grievance_categories + theme (the ISO 37120 city-service theme)
--   gov_users         state and district officials who may open the
--                     government dashboard; only on a letter from the state;
--                     removed, never deleted
--   gov_codes         sign-in codes (only a SHA-256 of each code is stored)
--   gov_sessions      signed-in sessions (only a SHA-256 of the session id)
--   gov_view_log      who opened which figures, and when. It can't be changed
--                     or deleted (two triggers)
--   office_gov_share  representatives' offices that chose to show their own
--                     figures to the state government (off unless chosen)
--
-- No existing data is changed except: the standard issue types get their
-- theme. The trigger count goes from 34 to 36.
-- Run ONCE ("duplicate column name" or "table ... already exists" means it
-- was already done).

CREATE TABLE states (
  id         TEXT PRIMARY KEY,
  name_en    TEXT NOT NULL UNIQUE,
  name_hi    TEXT,
  lgd_code   TEXT UNIQUE,
  kind       TEXT NOT NULL DEFAULT 'STATE' CHECK (kind IN ('STATE','UT')),
  demo       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

INSERT INTO states (id, name_en, name_hi, lgd_code, kind, created_by) VALUES
 ('andhra-pradesh','Andhra Pradesh','आंध्र प्रदेश','28','STATE','setup'),
 ('arunachal-pradesh','Arunachal Pradesh','अरुणाचल प्रदेश','12','STATE','setup'),
 ('assam','Assam','असम','18','STATE','setup'),
 ('bihar','Bihar','बिहार','10','STATE','setup'),
 ('chhattisgarh','Chhattisgarh','छत्तीसगढ़','22','STATE','setup'),
 ('goa','Goa','गोवा','30','STATE','setup'),
 ('gujarat','Gujarat','गुजरात','24','STATE','setup'),
 ('haryana','Haryana','हरियाणा','6','STATE','setup'),
 ('himachal-pradesh','Himachal Pradesh','हिमाचल प्रदेश','2','STATE','setup'),
 ('jharkhand','Jharkhand','झारखंड','20','STATE','setup'),
 ('karnataka','Karnataka','कर्नाटक','29','STATE','setup'),
 ('kerala','Kerala','केरल','32','STATE','setup'),
 ('madhya-pradesh','Madhya Pradesh','मध्य प्रदेश','23','STATE','setup'),
 ('maharashtra','Maharashtra','महाराष्ट्र','27','STATE','setup'),
 ('manipur','Manipur','मणिपुर','14','STATE','setup'),
 ('meghalaya','Meghalaya','मेघालय','17','STATE','setup'),
 ('mizoram','Mizoram','मिज़ोरम','15','STATE','setup'),
 ('nagaland','Nagaland','नागालैंड','13','STATE','setup'),
 ('odisha','Odisha','ओडिशा','21','STATE','setup'),
 ('punjab','Punjab','पंजाब','3','STATE','setup'),
 ('rajasthan','Rajasthan','राजस्थान','8','STATE','setup'),
 ('sikkim','Sikkim','सिक्किम','11','STATE','setup'),
 ('tamil-nadu','Tamil Nadu','तमिलनाडु','33','STATE','setup'),
 ('telangana','Telangana','तेलंगाना','36','STATE','setup'),
 ('tripura','Tripura','त्रिपुरा','16','STATE','setup'),
 ('uttar-pradesh','Uttar Pradesh','उत्तर प्रदेश','9','STATE','setup'),
 ('uttarakhand','Uttarakhand','उत्तराखंड','5','STATE','setup'),
 ('west-bengal','West Bengal','पश्चिम बंगाल','19','STATE','setup'),
 ('andaman-and-nicobar-islands','Andaman and Nicobar Islands','अंडमान और निकोबार द्वीपसमूह','35','UT','setup'),
 ('chandigarh','Chandigarh','चंडीगढ़','4','UT','setup'),
 ('dadra-and-nagar-haveli-and-daman-and-diu','Dadra and Nagar Haveli and Daman and Diu','दादरा और नगर हवेली और दमन और दीव','38','UT','setup'),
 ('delhi','Delhi','दिल्ली','7','UT','setup'),
 ('jammu-and-kashmir','Jammu and Kashmir','जम्मू और कश्मीर','1','UT','setup'),
 ('ladakh','Ladakh','लद्दाख','37','UT','setup'),
 ('lakshadweep','Lakshadweep','लक्षद्वीप','31','UT','setup'),
 ('puducherry','Puducherry','पुडुचेरी','34','UT','setup');

CREATE TABLE districts (
  id         TEXT PRIMARY KEY,
  state_id   TEXT NOT NULL REFERENCES states(id),
  name_en    TEXT NOT NULL,
  name_hi    TEXT,
  lgd_code   TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_at TEXT,
  updated_by TEXT,
  UNIQUE (state_id, name_en)
);
CREATE INDEX idx_districts_state ON districts (state_id);

ALTER TABLE areas ADD COLUMN district_id TEXT;
ALTER TABLE areas ADD COLUMN lgd_code TEXT;
ALTER TABLE local_units ADD COLUMN lgd_code TEXT;
ALTER TABLE grievance_categories ADD COLUMN theme TEXT;

-- ISO 37120:2018 themes for the standard issue types. Types added later are
-- grouped on the Issue types page.
UPDATE grievance_categories SET theme = 'WATER' WHERE id = 'water-sanitation';
UPDATE grievance_categories SET theme = 'ENERGY' WHERE id = 'electricity';
UPDATE grievance_categories SET theme = 'SOLID_WASTE' WHERE id = 'garbage';
UPDATE grievance_categories SET theme = 'TRANSPORT' WHERE id = 'road-infra';
UPDATE grievance_categories SET theme = 'SAFETY' WHERE id = 'public-safety';
UPDATE grievance_categories SET theme = 'GOVERNANCE' WHERE id IN ('land-dispute', 'doc-correction');

CREATE TABLE gov_users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  designation   TEXT NOT NULL,
  level         TEXT NOT NULL CHECK (level IN ('NATIONAL','STATE','DISTRICT')),
  state_id      TEXT REFERENCES states(id),
  district_id   TEXT REFERENCES districts(id),
  letter_ref    TEXT NOT NULL,
  letter_date   TEXT NOT NULL,
  review_by     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REMOVED')),
  added_by      TEXT NOT NULL,
  added_at      TEXT NOT NULL,
  renewed_by    TEXT,
  renewed_at    TEXT,
  removed_by    TEXT,
  removed_at    TEXT,
  remove_reason TEXT,
  last_signed_in TEXT
);
CREATE INDEX idx_gov_users_email ON gov_users (email, status);

CREATE TABLE gov_codes (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL,
  code_hash       TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  used_at         TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_gov_codes_email ON gov_codes (email, created_at);

CREATE TABLE gov_sessions (
  id_hash      TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES gov_users(id),
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  ended_at     TEXT,
  end_reason   TEXT
);
CREATE INDEX idx_gov_sessions_user ON gov_sessions (user_id, ended_at);

CREATE TABLE gov_view_log (
  id         TEXT PRIMARY KEY,
  at         TEXT NOT NULL,
  user_id    TEXT,
  email      TEXT,
  action     TEXT NOT NULL,
  scope      TEXT,
  detail     TEXT
);
CREATE INDEX idx_gov_view_log_at ON gov_view_log (at);
CREATE TRIGGER no_update_gov_view_log BEFORE UPDATE ON gov_view_log
BEGIN SELECT RAISE(ABORT, 'gov_view_log rows cannot be changed'); END;
CREATE TRIGGER no_delete_gov_view_log BEFORE DELETE ON gov_view_log
BEGIN SELECT RAISE(ABORT, 'gov_view_log rows cannot be deleted'); END;

CREATE TABLE office_gov_share (
  office_tier TEXT NOT NULL,
  office_id   TEXT NOT NULL,
  office_name TEXT,
  share       INTEGER NOT NULL DEFAULT 0,
  changed_at  TEXT NOT NULL,
  changed_by  TEXT NOT NULL,
  PRIMARY KEY (office_tier, office_id)
);
