INSERT INTO admin_users (id,email,role,name,employee_id) VALUES
 ('a1','super@test.in','super_admin','Asha Super','GIQ-001'),
 ('a2','ops@test.in','operations_admin','Omar Ops','GIQ-002'),
 ('a3','deo@test.in','data_entry_operator','Dev Entry','GIQ-003'),
 ('a4','audit@test.in','auditor','Anu Audit','GIQ-004'),
 ('a5','mod@test.in','data_moderator','Mona Mod','GIQ-005');
INSERT INTO areas (id,name,state,kind,slug,live) VALUES ('lucknow','Lucknow','Uttar Pradesh','CITY','lucknow',1),('kanpur','kanpur','Uttar Pradesh','CITY','kanpur',0);
INSERT INTO mp_constituencies (id,name,mp_name,mp_email) VALUES ('mp-lko','Lucknow','MP','mp@x.in');
INSERT INTO mla_constituencies (id,name,mp_constituency_id,mla_name,mla_email) VALUES ('mla-c','Lucknow Central','mp-lko','MLA','mla@x.in');
INSERT INTO local_units (id,name,unit_type,mla_constituency_id,rep_email,area_id) VALUES
 ('lu-hazratganj','Hazratganj-Ramtirth','URBAN','mla-c','r1@x.in','lucknow'),
 ('lu-tilak','Tilak Nagar-Kundari Rakabganj','URBAN','mla-c','r2@x.in','lucknow'),
 ('lu-aishbagh','Aishbagh','URBAN','mla-c',NULL,'lucknow'),
 ('lu-gomti','Gomti Nagar','URBAN','mla-c',NULL,'lucknow'),
 ('lu-maulvi','Maulvi Ganj','URBAN','mla-c',NULL,'lucknow'),
 ('lu-knp1','Swaroop Nagar','URBAN','mla-c',NULL,'kanpur');
INSERT INTO grievance_categories (id,name,ack_sla_hours,resolution_sla_hours,suggested_department) VALUES
 ('water-sanitation','Water Supply / Sanitation',48,168,'Water Supply'),('electricity','Electricity Supply',24,72,'Electricity'),('other','Other / Uncategorized',72,240,NULL);
INSERT INTO grievances (id, tracking_ref, citizen_phone, local_unit_id, category_id, status, description, current_tier, created_at) VALUES
 ('g1','GRV-TEST01','9000000001','lu-hazratganj','water-sanitation','OPEN','Pipe burst near the market','LOCAL','2026-10-08T10:00:00Z'),
 ('g2','GRV-TEST02','9000000002','lu-hazratganj','water-sanitation','OPEN','Leaking pipe on the main road','LOCAL','2026-10-08T10:00:00Z');
INSERT INTO resolution_photos (id, grievance_id, report_id, r2_key, content_type, sha256, uploaded_by, created_at) VALUES
 ('ph1','g2',NULL,'k1','image/jpeg','s1','fw@x.in','2026-10-09T05:00:00Z'), ('ph2','g2',NULL,'k2','image/jpeg','s2','r1@x.in','2026-10-09T05:00:00Z'), ('ph3','g2',NULL,'k3','image/jpeg','s3','r1@x.in','2026-10-09T05:00:00Z');
INSERT INTO office_team (id, office_tier, office_id, member_email, member_name, role, status, confirmed_by_rep_email, added_by, added_at) VALUES
 ('t1','LOCAL','lu-hazratganj','om@x.in','Omi Manager','OFFICE_MANAGER','ACTIVE','r1@x.in','r1@x.in','2026-10-01T00:00:00Z'),
 ('t2','LOCAL','lu-hazratganj','fw@x.in','Farid Worker','FIELD_WORKER','ACTIVE','r1@x.in','r1@x.in','2026-10-01T00:00:00Z');
INSERT INTO case_assignments (id, grievance_id, office_tier, office_id, assignee_email, assigned_by, assigned_at) VALUES ('a1','g2','LOCAL','lu-hazratganj','fw@x.in','r1@x.in','2026-10-09T04:00:00Z');
