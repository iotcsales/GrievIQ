-- part22-department-types.sql  (grieviq-25: department types managed by admins)
--
-- The list of department types (Water Supply, Electricity, ...), until now
-- fixed in the code, becomes a table admins manage on the Departments page.
--   key          never changes; it is what past records store. For the
--                original seven it is their English name, so every existing
--                follow-up, office and issue-type suggestion keeps its meaning.
--   name_en/hi   the names people see; can be corrected.
--   retired_at   set instead of deleting.
-- The original seven are added here. Running this file twice is harmless.
-- No triggers are added: the trigger count stays 28.

CREATE TABLE IF NOT EXISTS dept_types (
  key           TEXT PRIMARY KEY,
  name_en       TEXT NOT NULL,
  name_hi       TEXT NOT NULL,
  description   TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 100,
  built_in      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,
  retired_at    TEXT,
  retired_by    TEXT,
  retire_reason TEXT
);

INSERT OR IGNORE INTO dept_types (key, name_en, name_hi, description, sort_order, built_in, created_at, created_by, updated_at, updated_by) VALUES
  ('Water Supply', 'Water Supply', 'जलापूर्ति विभाग', NULL, 1, 1, '2026-10-09T00:00:00.000Z', 'system', '2026-10-09T00:00:00.000Z', 'system'),
  ('Electricity', 'Electricity', 'विद्युत विभाग', NULL, 2, 1, '2026-10-09T00:00:00.000Z', 'system', '2026-10-09T00:00:00.000Z', 'system'),
  ('Sanitation / Garbage', 'Sanitation / Garbage', 'सफ़ाई / कूड़ा संग्रहण विभाग', NULL, 3, 1, '2026-10-09T00:00:00.000Z', 'system', '2026-10-09T00:00:00.000Z', 'system'),
  ('Roads & Public Works', 'Roads & Public Works', 'सड़क एवं लोक निर्माण विभाग', NULL, 4, 1, '2026-10-09T00:00:00.000Z', 'system', '2026-10-09T00:00:00.000Z', 'system'),
  ('Health', 'Health', 'स्वास्थ्य विभाग', NULL, 5, 1, '2026-10-09T00:00:00.000Z', 'system', '2026-10-09T00:00:00.000Z', 'system'),
  ('Legal / Land Records', 'Legal / Land Records', 'विधिक / भू-अभिलेख विभाग', NULL, 6, 1, '2026-10-09T00:00:00.000Z', 'system', '2026-10-09T00:00:00.000Z', 'system'),
  ('Other', 'Other', 'अन्य', NULL, 999, 1, '2026-10-09T00:00:00.000Z', 'system', '2026-10-09T00:00:00.000Z', 'system');
