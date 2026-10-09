-- Minimal test schema (rebuilt from the code; replace with the live export when available)
CREATE TABLE admin_users (id TEXT PRIMARY KEY, email TEXT UNIQUE, role TEXT, name TEXT, employee_id TEXT, phone TEXT, designation TEXT,
  status TEXT DEFAULT 'PRESENT', leave_until TEXT, access_paused INTEGER DEFAULT 0, updated_at TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE staff_covers (id TEXT PRIMARY KEY, away_email TEXT, cover_email TEXT, from_date TEXT, to_date TEXT, ended_at TEXT);
CREATE TABLE staff_email_history (id TEXT PRIMARY KEY, admin_id TEXT, old_email TEXT);
CREATE TABLE admin_events (id TEXT PRIMARY KEY, actor_email TEXT, action TEXT, target TEXT, detail TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TRIGGER admin_events_no_update BEFORE UPDATE ON admin_events BEGIN SELECT RAISE(ABORT, 'admin_events is append-only'); END;
CREATE TRIGGER admin_events_no_delete BEFORE DELETE ON admin_events BEGIN SELECT RAISE(ABORT, 'admin_events is append-only'); END;
CREATE TABLE areas (id TEXT PRIMARY KEY, name TEXT, state TEXT, kind TEXT, slug TEXT, live INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')),
  created_by TEXT, live_changed_at TEXT, live_changed_by TEXT);
CREATE TABLE mp_constituencies (id TEXT PRIMARY KEY, name TEXT, mp_name TEXT, mp_phone TEXT, mp_email TEXT);
CREATE TABLE mla_constituencies (id TEXT PRIMARY KEY, name TEXT, mla_name TEXT, mla_phone TEXT, mla_email TEXT, mp_constituency_id TEXT);
CREATE TABLE municipal_bodies (id TEXT PRIMARY KEY, name TEXT, mla_constituency_id TEXT, has_mayor INTEGER, mayor_name TEXT, mayor_phone TEXT, mayor_email TEXT, area_id TEXT);
CREATE TABLE local_units (id TEXT PRIMARY KEY, name TEXT, unit_type TEXT, mla_constituency_id TEXT, municipal_body_id TEXT, rep_name TEXT, rep_phone TEXT,
  rep_email TEXT, localities TEXT, area_id TEXT, block TEXT, ward_boundary_geojson TEXT);
CREATE TABLE change_requests (id TEXT PRIMARY KEY, kind TEXT, target_type TEXT, target_id TEXT, target_label TEXT, old_values TEXT, new_values TEXT,
  applied_values TEXT, reason TEXT, source TEXT, status TEXT DEFAULT 'PENDING', requested_by TEXT, requested_at TEXT, reviewed_by TEXT, reviewed_at TEXT, review_note TEXT);
CREATE TABLE grievance_categories (id TEXT PRIMARY KEY, name TEXT, ack_sla_hours INTEGER, resolution_sla_hours INTEGER, suggested_department TEXT);
CREATE TABLE grievances (id TEXT PRIMARY KEY, tracking_ref TEXT, local_unit_id TEXT, category_id TEXT, status TEXT, description TEXT, current_tier TEXT, citizen_email TEXT, created_at TEXT);
CREATE TABLE office_team (id TEXT PRIMARY KEY, office_tier TEXT, office_id TEXT, member_email TEXT, member_name TEXT, role TEXT, status TEXT, confirmed_by_rep_email TEXT);
CREATE TABLE case_assignments (id TEXT PRIMARY KEY, grievance_id TEXT, office_tier TEXT, office_id TEXT, assignee_email TEXT, assigned_at TEXT, ended_at TEXT);
