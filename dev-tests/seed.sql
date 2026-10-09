INSERT INTO admin_users (id,email,role,name,employee_id) VALUES
 ('a1','super@test.in','super_admin','Asha Super','GIQ-001'),
 ('a2','ops@test.in','operations_admin','Omar Ops','GIQ-002'),
 ('a3','deo@test.in','data_entry_operator','Dev Entry','GIQ-003'),
 ('a4','audit@test.in','auditor','Anu Audit','GIQ-004'),
 ('a5','mod@test.in','data_moderator','Mona Mod','GIQ-005');
INSERT INTO areas (id,name,state,kind,slug,live) VALUES ('lucknow','Lucknow','Uttar Pradesh','CITY','lucknow',1),('kanpur','kanpur','Uttar Pradesh','CITY','kanpur',0);
INSERT INTO mp_constituencies VALUES ('mp-lko','Lucknow','MP','','mp@x.in');
INSERT INTO mla_constituencies VALUES ('mla-c','Lucknow Central','MLA','','mla@x.in','mp-lko');
INSERT INTO local_units (id,name,unit_type,mla_constituency_id,rep_email,area_id) VALUES
 ('lu-hazratganj','Hazratganj-Ramtirth','URBAN','mla-c','r1@x.in','lucknow'),
 ('lu-tilak','Tilak Nagar-Kundari Rakabganj','URBAN','mla-c','r2@x.in','lucknow'),
 ('lu-aishbagh','Aishbagh','URBAN','mla-c',NULL,'lucknow'),
 ('lu-gomti','Gomti Nagar','URBAN','mla-c',NULL,'lucknow'),
 ('lu-maulvi','Maulvi Ganj','URBAN','mla-c',NULL,'lucknow'),
 ('lu-knp1','Swaroop Nagar','URBAN','mla-c',NULL,'kanpur');
INSERT INTO grievance_categories VALUES ('water-sanitation','Water Supply / Sanitation',48,168,'Water Supply'),('electricity','Electricity Supply',24,72,'Electricity'),('other','Other / Uncategorized',72,240,NULL);
INSERT INTO grievances (id, tracking_ref, local_unit_id, category_id, status, description, current_tier, created_at) VALUES
 ('g1','GRV-TEST01','lu-hazratganj','water-sanitation','OPEN','Pipe burst near the market','LOCAL','2026-10-08T10:00:00Z');
