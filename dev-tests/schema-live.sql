-- The live database structure (no data), exported 9 Oct 2026 with
-- npx wrangler d1 export grieviq-db --remote --no-data, before part21.
-- The tests build on this, then run part21, part22 and part23.
PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE mp_constituencies (   id TEXT PRIMARY KEY,   name TEXT NOT NULL,   mp_name TEXT,   mp_phone TEXT,   mp_email TEXT,   created_at TEXT DEFAULT (datetime('now')) );
CREATE TABLE mla_constituencies (   id TEXT PRIMARY KEY,   name TEXT NOT NULL,   mp_constituency_id TEXT NOT NULL REFERENCES mp_constituencies(id),   mla_name TEXT,   mla_phone TEXT,   mla_email TEXT,   created_at TEXT DEFAULT (datetime('now')) );
CREATE TABLE municipal_bodies (   id TEXT PRIMARY KEY,   name TEXT NOT NULL,   mla_constituency_id TEXT NOT NULL REFERENCES mla_constituencies(id),   has_mayor INTEGER NOT NULL DEFAULT 0,   mayor_name TEXT,   mayor_phone TEXT,   mayor_email TEXT,   created_at TEXT DEFAULT (datetime('now')) , area_id TEXT);
CREATE TABLE local_units (   id TEXT PRIMARY KEY,   name TEXT NOT NULL,   unit_type TEXT NOT NULL CHECK (unit_type IN ('RURAL','URBAN')),   mla_constituency_id TEXT NOT NULL REFERENCES mla_constituencies(id),   municipal_body_id TEXT REFERENCES municipal_bodies(id),   rep_name TEXT,   rep_phone TEXT,   rep_email TEXT,   created_at TEXT DEFAULT (datetime('now')) , localities TEXT, ward_boundary_geojson TEXT, ward_num INTEGER, area_id TEXT, block TEXT);
CREATE TABLE grievance_categories (   id TEXT PRIMARY KEY,   name TEXT NOT NULL,   ack_sla_hours INTEGER NOT NULL,   resolution_sla_hours INTEGER,   notes TEXT , suggested_department TEXT);
CREATE TABLE grievance_audit (   id TEXT PRIMARY KEY,   grievance_id TEXT NOT NULL REFERENCES grievances(id),   action TEXT NOT NULL,   detail TEXT,   actor_tier TEXT,   actor_name TEXT,   created_at TEXT DEFAULT (datetime('now')) );
CREATE TABLE grievance_otp (   id TEXT PRIMARY KEY,   phone TEXT NOT NULL,   otp_code TEXT NOT NULL,   purpose TEXT NOT NULL CHECK (purpose IN ('SUBMIT','STATUS_CHECK')),   verified INTEGER NOT NULL DEFAULT 0,   expires_at TEXT NOT NULL,   created_at TEXT DEFAULT (datetime('now')) , email TEXT, channel TEXT DEFAULT 'PHONE', failed_attempts INTEGER NOT NULL DEFAULT 0, verified_at TEXT);
CREATE TABLE IF NOT EXISTS "grievances" (
  id TEXT PRIMARY KEY,
  tracking_ref TEXT NOT NULL UNIQUE,
  citizen_phone TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES grievance_categories(id),
  local_unit_id TEXT NOT NULL REFERENCES local_units(id),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','PENDING_CONFIRMATION','RESOLVED','CLOSED')),
  current_tier TEXT NOT NULL DEFAULT 'LOCAL' CHECK (current_tier IN ('LOCAL','MAYOR','MLA','MP')),
  acknowledged_at TEXT,
  resolved_at TEXT,
  citizen_confirmed INTEGER NOT NULL DEFAULT 0,
  citizen_confirmed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  photo_url TEXT,
  location_detail TEXT,
  citizen_email TEXT,
  citizen_dispute_reason TEXT,
  citizen_dispute_note TEXT
, lang TEXT, pin_lat REAL, pin_lng REAL, closure_kind TEXT, photo_hold INTEGER NOT NULL DEFAULT 0, closed_at TEXT, reopened_at TEXT, reopen_start_tier TEXT, reopen_count INTEGER NOT NULL DEFAULT 0, retention_notice_at TEXT, retention_removed_at TEXT, consent_at TEXT, consent_notice TEXT);
CREATE TABLE admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, role TEXT NOT NULL DEFAULT 'operations_admin', employee_id TEXT, phone TEXT, designation TEXT, status TEXT NOT NULL DEFAULT 'PRESENT', leave_until TEXT, access_paused INTEGER NOT NULL DEFAULT 0, left_at TEXT, left_reason TEXT, updated_at TEXT);
CREATE TABLE admin_events (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS "grievance_events" (
  id TEXT PRIMARY KEY,
  grievance_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'MARKED_RESOLVED',
    'CITIZEN_CONFIRMED',
    'CITIZEN_DISPUTED',
    'ACKNOWLEDGED',
    'FOLLOW_UP',
    'ADMIN_NUDGE'
  )),
  actor TEXT,
  reason TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE rep_suggestions (
  id TEXT PRIMARY KEY,
  grievance_id TEXT NOT NULL,
  local_unit_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('LOCAL', 'MLA', 'MP')),
  suggested_name TEXT NOT NULL,
  suggested_phone TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_by TEXT,
  updated_at TEXT
);
CREATE TABLE change_requests (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('contact', 'add_unit')),
  target_type TEXT CHECK (target_type IN ('mp', 'mla', 'ward', 'mayor')),
  target_id TEXT,
  target_label TEXT,
  old_values TEXT,
  new_values TEXT NOT NULL,
  reason TEXT NOT NULL,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'OUT_OF_DATE')),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  applied_values TEXT
);
CREATE TABLE demand_signals (
  state TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  first_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (state, city)
);
CREATE TABLE resolution_reports (
  id TEXT PRIMARY KEY,
  grievance_id TEXT NOT NULL,
  note TEXT NOT NULL,
  no_photo_reason TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, review_status TEXT CHECK (review_status IN ('PENDING', 'APPROVED', 'SENT_BACK')), reviewed_by TEXT, reviewed_at TEXT, review_note TEXT, submitted_role TEXT);
CREATE TABLE resolution_photos (
  id TEXT PRIMARY KEY,
  grievance_id TEXT NOT NULL,
  report_id TEXT,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER,
  sha256 TEXT NOT NULL,
  dhash TEXT,
  taken_at TEXT,
  gps_lat REAL,
  gps_lng REAL,
  dup_grievance_id TEXT,
  dup_kind TEXT,
  matches_citizen INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, dev_lat REAL, dev_lng REAL, dev_accuracy REAL, dev_status TEXT, thumb_key TEXT, thumb_size INTEGER, full_deleted_at TEXT, deleted_at TEXT);
CREATE TABLE resolution_checks (
  id TEXT PRIMARY KEY,
  grievance_id TEXT NOT NULL,
  report_id TEXT,
  method TEXT NOT NULL CHECK (method IN ('PHOTO', 'PHONE')),
  outcome TEXT NOT NULL CHECK (outcome IN ('VERIFIED', 'NOT_FIXED', 'CANT_TELL', 'NO_ANSWER')),
  note TEXT,
  checked_by TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE complaint_photos (
  id TEXT PRIMARY KEY,
  grievance_id TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  thumb_key TEXT,
  content_type TEXT NOT NULL,
  byte_size INTEGER,
  thumb_size INTEGER,
  width INTEGER,
  height INTEGER,
  sha256 TEXT,
  dhash TEXT,
  source TEXT NOT NULL DEFAULT 'UPLOAD' CHECK (source IN ('UPLOAD', 'MIGRATED')),
  legacy_url TEXT,
  created_at TEXT NOT NULL,
  full_deleted_at TEXT,
  deleted_at TEXT
, dev_status TEXT, dev_lat REAL, dev_lng REAL, dev_accuracy INTEGER, gps_lat REAL, gps_lng REAL, taken_at TEXT, has_camera INTEGER, dev_where TEXT, dev_distance_m INTEGER, gps_where TEXT, gps_distance_m INTEGER, dup_grievance_id TEXT, dup_kind TEXT, checked_at TEXT, capture_kind TEXT);
CREATE TABLE grievance_reopens (
  id TEXT PRIMARY KEY,
  grievance_id TEXT NOT NULL,
  reopened_at TEXT NOT NULL,
  closed_at_before TEXT,
  reason TEXT NOT NULL CHECK (reason IN ('NOT_FIXED', 'PARTIALLY_FIXED', 'CAME_BACK', 'WRONG_ISSUE', 'OTHER')),
  note TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('citizen', 'staff')),
  staff_email TEXT,
  staff_reason TEXT,
  from_tier TEXT NOT NULL,
  to_tier TEXT NOT NULL
);
CREATE TABLE rep_sessions (
  id_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ended_at TEXT,
  end_reason TEXT,
  ip TEXT,
  user_agent TEXT
);
CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE rep_auth_events (
  id TEXT PRIMARY KEY,
  email TEXT,
  event TEXT NOT NULL CHECK (event IN ('SIGNED_IN', 'SIGNED_OUT', 'SIGN_IN_REFUSED')),
  detail TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE case_assignments (
  id TEXT PRIMARY KEY,
  grievance_id TEXT NOT NULL,
  office_tier TEXT NOT NULL,
  office_id TEXT NOT NULL,
  assignee_email TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  ended_at TEXT,
  ended_by TEXT,
  end_reason TEXT
);
CREATE TABLE team_activity (
  id TEXT PRIMARY KEY,
  office_tier TEXT NOT NULL,
  office_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_role TEXT,
  on_behalf_of TEXT,
  action TEXT NOT NULL,
  grievance_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "office_team" (
  id TEXT PRIMARY KEY,
  office_tier TEXT NOT NULL CHECK (office_tier IN ('LOCAL', 'MAYOR', 'MLA', 'MP')),
  office_id TEXT NOT NULL,
  member_email TEXT NOT NULL,
  member_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OFFICE_MANAGER', 'FIELD_WORKER', 'OFFICE_ASSISTANT')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REMOVED')),
  confirmed_by_rep_email TEXT,
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL,
  updated_at TEXT,
  removed_by TEXT,
  removed_at TEXT,
  designation TEXT,
  designation_other TEXT,
  duties TEXT,
  wards TEXT,
  issue_types TEXT,
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1))
, employee_id TEXT, phone TEXT, leave_until TEXT);
CREATE TABLE observations (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  engagement_id TEXT,
  title TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('CASE', 'OFFICE', 'PROCESS')),
  subject_cases TEXT,
  subject_office TEXT,
  subject_process TEXT,
  criteria TEXT,
  condition TEXT,
  cause TEXT,
  effect TEXT,
  recommendation TEXT,
  rating TEXT NOT NULL CHECK (rating IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  owner_type TEXT NOT NULL DEFAULT 'STAFF' CHECK (owner_type IN ('STAFF', 'OFFICE')),
  owner_email TEXT,
  owner_office TEXT,
  due_date TEXT,
  due_reason TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ISSUED', 'RESPONDED', 'DONE_REPORTED', 'CLOSED', 'RISK_ACCEPTED', 'WITHDRAWN')),
  response_agree INTEGER,
  response_text TEXT,
  action_plan TEXT,
  target_date TEXT,
  done_evidence TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  issued_at TEXT,
  issued_by TEXT,
  closed_at TEXT,
  closed_by TEXT,
  risk_reason TEXT,
  risk_review_date TEXT
);
CREATE TABLE observation_events (
  id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_role TEXT,
  text TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE observation_amendments (
  id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT NOT NULL,
  amended_by TEXT NOT NULL,
  amended_at TEXT NOT NULL
);
CREATE TABLE audit_engagements (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  objectives TEXT,
  scope TEXT,
  criteria TEXT,
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE audit_reports (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('PERIOD', 'FOLLOW_UP', 'REGISTER', 'ANALYTICS')),
  title TEXT NOT NULL,
  engagement_id TEXT,
  period_from TEXT,
  period_to TEXT,
  params TEXT,
  content TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  correction_reason TEXT,
  issued_by TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  UNIQUE (ref, version)
);
CREATE TABLE retention_holds (
  id TEXT PRIMARY KEY,
  grievance_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('HOLD', 'RELEASE')),
  reason TEXT NOT NULL,
  by_email TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE TABLE retention_runs (
  id TEXT PRIMARY KEY,
  ran_at TEXT NOT NULL,
  ran_by TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('AUTO', 'MANUAL')),
  cases_anonymised INTEGER NOT NULL DEFAULT 0,
  refs TEXT,
  fields_removed INTEGER NOT NULL DEFAULT 0,
  notices_sent INTEGER NOT NULL DEFAULT 0,
  notice_refs TEXT,
  signins_cleared INTEGER NOT NULL DEFAULT 0,
  codes_deleted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE retention_grants (
  id TEXT PRIMARY KEY,
  grievance_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE staff_covers (
  id TEXT PRIMARY KEY,
  away_email TEXT NOT NULL,
  cover_email TEXT NOT NULL,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ended_at TEXT,
  ended_by TEXT,
  end_reason TEXT
);
CREATE TABLE staff_email_history (
  old_email TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  new_email TEXT NOT NULL,
  reason TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL
);
CREATE TABLE demand_salts (
  day TEXT PRIMARY KEY,
  salt TEXT NOT NULL
);
CREATE TABLE demand_presses (
  fp TEXT PRIMARY KEY,
  day TEXT NOT NULL
);
CREATE TABLE visit_fps (
  fp TEXT PRIMARY KEY,
  day TEXT NOT NULL
);
CREATE TABLE visit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  vid TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL
);
CREATE TABLE visit_daily (
  day TEXT PRIMARY KEY,
  visitors INTEGER NOT NULL DEFAULT 0,
  pageviews INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE visit_city_daily (
  day TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  visitors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, country, region, city)
);
CREATE TABLE areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'CITY' CHECK (kind IN ('CITY', 'DISTRICT')),
  slug TEXT NOT NULL UNIQUE,
  live INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  created_by TEXT,
  live_changed_at TEXT,
  live_changed_by TEXT
);
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  category TEXT NOT NULL CHECK (category IN ('BUG', 'CONFUSING', 'SUGGESTION', 'OTHER')),
  message TEXT,
  email TEXT,
  tracking_ref TEXT,
  lang TEXT,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'IN_PROGRESS', 'DONE')),
  note TEXT,
  updated_at TEXT,
  updated_by TEXT
);
CREATE TABLE feedback_rate (
  fp TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  recipient TEXT NOT NULL,
  kind TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  office_tier TEXT,
  office_id TEXT,
  grievance_id TEXT,
  tracking_ref TEXT,
  ward_name TEXT,
  category_id TEXT,
  category_name TEXT,
  due_at TEXT,
  data TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT,
  pushed_at TEXT,
  emailed_at TEXT
, seen_at TEXT);
CREATE TABLE notify_state (
  grievance_id TEXT PRIMARY KEY,
  notified_index INTEGER NOT NULL,
  reopen_marker TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  lang TEXT,
  device TEXT,
  created_at TEXT NOT NULL,
  last_ok_at TEXT,
  last_error TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE email_outbox (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  kind TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL,
  recipients INTEGER NOT NULL DEFAULT 0,
  offices INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE announcement_replies (
  id TEXT PRIMARY KEY,
  announcement_id TEXT NOT NULL,
  office_tier TEXT NOT NULL,
  office_id TEXT NOT NULL,
  author_email TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('OFFICE', 'GRIEVIQ')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_by_giq_at TEXT
);
CREATE TABLE citizen_push (
  id TEXT PRIMARY KEY,
  grievance_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  lang TEXT,
  consent_at TEXT NOT NULL,
  last_ok_at TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (grievance_id, endpoint)
);
CREATE TABLE citizen_push_sent (
  dedupe_key TEXT PRIMARY KEY,
  grievance_id TEXT NOT NULL,
  sent_at TEXT NOT NULL
);
CREATE TABLE citizen_update_passes (
  grievance_id TEXT PRIMARY KEY,
  pass_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
DELETE FROM sqlite_sequence;
CREATE INDEX idx_rep_suggestions_status ON rep_suggestions (status);
CREATE INDEX idx_change_requests_status ON change_requests (status, requested_at);
CREATE INDEX idx_change_requests_requester ON change_requests (requested_by, requested_at);
CREATE INDEX idx_resolution_reports_grievance ON resolution_reports (grievance_id, created_at);
CREATE INDEX idx_resolution_photos_grievance ON resolution_photos (grievance_id, report_id);
CREATE INDEX idx_resolution_photos_report ON resolution_photos (report_id);
CREATE INDEX idx_resolution_photos_sha ON resolution_photos (sha256);
CREATE INDEX idx_resolution_checks_grievance ON resolution_checks (grievance_id, checked_at);
CREATE INDEX idx_complaint_photos_grievance ON complaint_photos (grievance_id);
CREATE INDEX idx_complaint_photos_sha ON complaint_photos (sha256);
CREATE INDEX idx_grievance_reopens_grievance ON grievance_reopens (grievance_id, reopened_at);
CREATE INDEX idx_rep_sessions_email ON rep_sessions (email);
CREATE INDEX idx_rep_auth_events_email ON rep_auth_events (email, created_at);
CREATE INDEX idx_case_assignments_grievance ON case_assignments (grievance_id, ended_at);
CREATE INDEX idx_case_assignments_assignee ON case_assignments (assignee_email, ended_at);
CREATE INDEX idx_team_activity_office ON team_activity (office_tier, office_id, created_at);
CREATE INDEX idx_team_activity_grievance ON team_activity (grievance_id);
CREATE INDEX idx_office_team_office ON office_team (office_tier, office_id, status);
CREATE INDEX idx_office_team_member ON office_team (member_email, status);
CREATE INDEX idx_observations_status ON observations (status, due_date);
CREATE INDEX idx_observations_owner ON observations (owner_email, status);
CREATE INDEX idx_observation_events_obs ON observation_events (observation_id, created_at);
CREATE INDEX idx_observation_amendments_obs ON observation_amendments (observation_id, amended_at);
CREATE INDEX idx_audit_reports_engagement ON audit_reports (engagement_id);
CREATE INDEX idx_audit_reports_supersedes ON audit_reports (supersedes_id);
CREATE INDEX idx_retention_holds_grievance ON retention_holds (grievance_id, at);
CREATE INDEX idx_retention_runs_at ON retention_runs (ran_at);
CREATE INDEX idx_retention_grants_grievance ON retention_grants (grievance_id, created_at);
CREATE UNIQUE INDEX idx_admin_users_employee_id ON admin_users (UPPER(employee_id)) WHERE employee_id IS NOT NULL;
CREATE INDEX idx_staff_covers_cover ON staff_covers (cover_email, from_date, to_date);
CREATE INDEX idx_staff_covers_away ON staff_covers (away_email, from_date, to_date);
CREATE UNIQUE INDEX idx_office_team_employee_id ON office_team (office_tier, office_id, UPPER(employee_id)) WHERE employee_id IS NOT NULL AND status = 'ACTIVE';
CREATE INDEX idx_staff_email_history_admin ON staff_email_history (admin_id);
CREATE INDEX idx_demand_presses_day ON demand_presses(day);
CREATE INDEX idx_visit_fps_day ON visit_fps(day);
CREATE INDEX idx_visit_events_at ON visit_events(at);
CREATE INDEX idx_local_units_area ON local_units(area_id);
CREATE INDEX idx_feedback_status ON feedback(status, created_at);
CREATE INDEX idx_notif_recipient ON notifications(recipient, created_at);
CREATE INDEX idx_notif_unread ON notifications(recipient, read_at);
CREATE INDEX idx_push_email ON push_subscriptions(email);
CREATE INDEX idx_outbox_status ON email_outbox(status, created_at);
CREATE INDEX idx_reply_thread ON announcement_replies(announcement_id, office_tier, office_id, created_at);
CREATE INDEX idx_citizen_push_case ON citizen_push(grievance_id);
CREATE TRIGGER no_delete_admin_events BEFORE DELETE ON admin_events
BEGIN SELECT RAISE(ABORT, 'Audit records cannot be deleted.'); END;
CREATE TRIGGER no_delete_rep_auth_events BEFORE DELETE ON rep_auth_events
BEGIN SELECT RAISE(ABORT, 'Audit records cannot be deleted.'); END;
CREATE TRIGGER no_update_team_activity BEFORE UPDATE ON team_activity
BEGIN SELECT RAISE(ABORT, 'Audit records cannot be changed.'); END;
CREATE TRIGGER no_delete_team_activity BEFORE DELETE ON team_activity
BEGIN SELECT RAISE(ABORT, 'Audit records cannot be deleted.'); END;
CREATE TRIGGER no_delete_grievance_events BEFORE DELETE ON grievance_events
BEGIN SELECT RAISE(ABORT, 'Audit records cannot be deleted.'); END;
CREATE TRIGGER no_delete_grievance_reopens BEFORE DELETE ON grievance_reopens
BEGIN SELECT RAISE(ABORT, 'Audit records cannot be deleted.'); END;
CREATE TRIGGER no_update_observation_events BEFORE UPDATE ON observation_events
BEGIN SELECT RAISE(ABORT, 'Audit records cannot be changed.'); END;
CREATE TRIGGER no_delete_observation_events BEFORE DELETE ON observation_events
BEGIN SELECT RAISE(ABORT, 'Audit records cannot be deleted.'); END;
CREATE TRIGGER no_update_observation_amendments BEFORE UPDATE ON observation_amendments
BEGIN SELECT RAISE(ABORT, 'Audit records cannot be changed.'); END;
CREATE TRIGGER no_delete_observation_amendments BEFORE DELETE ON observation_amendments
BEGIN SELECT RAISE(ABORT, 'Audit records cannot be deleted.'); END;
CREATE TRIGGER no_delete_observations BEFORE DELETE ON observations
BEGIN SELECT RAISE(ABORT, 'Observations cannot be deleted.'); END;
CREATE TRIGGER lock_issued_observations BEFORE UPDATE ON observations
WHEN OLD.status <> 'DRAFT' AND (
  NEW.ref IS NOT OLD.ref OR NEW.title IS NOT OLD.title OR NEW.subject_type IS NOT OLD.subject_type
  OR NEW.subject_cases IS NOT OLD.subject_cases OR NEW.subject_office IS NOT OLD.subject_office
  OR NEW.subject_process IS NOT OLD.subject_process OR NEW.criteria IS NOT OLD.criteria
  OR NEW.condition IS NOT OLD.condition OR NEW.cause IS NOT OLD.cause OR NEW.effect IS NOT OLD.effect
  OR NEW.recommendation IS NOT OLD.recommendation OR NEW.rating IS NOT OLD.rating
  OR NEW.owner_type IS NOT OLD.owner_type OR NEW.owner_email IS NOT OLD.owner_email
  OR NEW.owner_office IS NOT OLD.owner_office OR NEW.due_date IS NOT OLD.due_date
  OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at
  OR NEW.issued_at IS NOT OLD.issued_at OR NEW.issued_by IS NOT OLD.issued_by)
BEGIN SELECT RAISE(ABORT, 'An issued observation cannot be edited. Add an amendment instead.'); END;
CREATE TRIGGER lock_final_observations BEFORE UPDATE ON observations
WHEN OLD.status IN ('CLOSED', 'RISK_ACCEPTED', 'WITHDRAWN')
BEGIN SELECT RAISE(ABORT, 'This observation is final and cannot be changed.'); END;
CREATE TRIGGER no_update_audit_reports BEFORE UPDATE ON audit_reports
BEGIN SELECT RAISE(ABORT, 'Issued reports cannot be changed. Issue a corrected version instead.'); END;
CREATE TRIGGER no_delete_audit_reports BEFORE DELETE ON audit_reports
BEGIN SELECT RAISE(ABORT, 'Issued reports cannot be deleted.'); END;
CREATE TRIGGER no_delete_audit_engagements BEFORE DELETE ON audit_engagements
BEGIN SELECT RAISE(ABORT, 'Engagements cannot be deleted.'); END;
CREATE TRIGGER no_update_retention_holds BEFORE UPDATE ON retention_holds
BEGIN SELECT RAISE(ABORT, 'Retention records cannot be changed.'); END;
CREATE TRIGGER no_delete_retention_holds BEFORE DELETE ON retention_holds
BEGIN SELECT RAISE(ABORT, 'Retention records cannot be deleted.'); END;
CREATE TRIGGER no_update_retention_runs BEFORE UPDATE ON retention_runs
BEGIN SELECT RAISE(ABORT, 'Retention records cannot be changed.'); END;
CREATE TRIGGER no_delete_retention_runs BEFORE DELETE ON retention_runs
BEGIN SELECT RAISE(ABORT, 'Retention records cannot be deleted.'); END;
CREATE TRIGGER no_update_retention_grants BEFORE UPDATE ON retention_grants
BEGIN SELECT RAISE(ABORT, 'Retention records cannot be changed.'); END;
CREATE TRIGGER no_delete_retention_grants BEFORE DELETE ON retention_grants
BEGIN SELECT RAISE(ABORT, 'Retention records cannot be deleted.'); END;
CREATE TRIGGER no_update_grievance_events BEFORE UPDATE ON grievance_events
WHEN NOT (
  EXISTS (SELECT 1 FROM retention_grants rg WHERE rg.grievance_id = OLD.grievance_id AND rg.created_at > datetime('now', '-10 minutes'))
  AND NEW.id IS OLD.id AND NEW.grievance_id IS OLD.grievance_id AND NEW.event_type IS OLD.event_type
  AND (NEW.actor IS OLD.actor OR (OLD.event_type LIKE 'CITIZEN_%' AND NEW.actor = 'citizen'))
  AND NEW.reason IS OLD.reason AND NEW.created_at IS OLD.created_at AND NEW.note IS NULL)
BEGIN SELECT RAISE(ABORT, 'Audit records cannot be changed.'); END;
CREATE TRIGGER no_update_grievance_reopens BEFORE UPDATE ON grievance_reopens
WHEN NOT (
  EXISTS (SELECT 1 FROM retention_grants rg WHERE rg.grievance_id = OLD.grievance_id AND rg.created_at > datetime('now', '-10 minutes'))
  AND NEW.id IS OLD.id AND NEW.grievance_id IS OLD.grievance_id AND NEW.reopened_at IS OLD.reopened_at
  AND NEW.closed_at_before IS OLD.closed_at_before AND NEW.reason IS OLD.reason AND NEW.actor IS OLD.actor
  AND NEW.staff_email IS OLD.staff_email AND NEW.from_tier IS OLD.from_tier AND NEW.to_tier IS OLD.to_tier
  AND NEW.note = '' AND NEW.staff_reason IS NULL)
BEGIN SELECT RAISE(ABORT, 'Audit records cannot be changed.'); END;
CREATE TRIGGER no_update_admin_events BEFORE UPDATE ON admin_events
WHEN NOT (
  EXISTS (SELECT 1 FROM retention_grants rg WHERE rg.grievance_id = OLD.target AND rg.created_at > datetime('now', '-10 minutes'))
  AND NEW.id IS OLD.id AND NEW.actor_email IS OLD.actor_email AND NEW.action IS OLD.action
  AND NEW.target IS OLD.target AND NEW.created_at IS OLD.created_at)
BEGIN SELECT RAISE(ABORT, 'Audit records cannot be changed.'); END;
CREATE TRIGGER no_update_rep_auth_events BEFORE UPDATE ON rep_auth_events
WHEN NOT (
  REPLACE(REPLACE(OLD.created_at, 'T', ' '), 'Z', '') < datetime('now', '-365 days')
  AND NEW.id IS OLD.id AND NEW.email IS OLD.email AND NEW.event IS OLD.event AND NEW.detail IS OLD.detail
  AND NEW.created_at IS OLD.created_at AND NEW.ip IS NULL AND NEW.user_agent IS NULL)
BEGIN SELECT RAISE(ABORT, 'Audit records cannot be changed.'); END;
CREATE TRIGGER no_update_staff_email_history BEFORE UPDATE ON staff_email_history
BEGIN SELECT RAISE(ABORT, 'Email history cannot be changed.'); END;
CREATE TRIGGER no_delete_staff_email_history BEFORE DELETE ON staff_email_history
BEGIN SELECT RAISE(ABORT, 'Email history cannot be deleted.'); END;
