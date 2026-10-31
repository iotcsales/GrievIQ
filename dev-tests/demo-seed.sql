-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- demo-seed.sql (grieviq-81): the invented places and people behind the public demos
-- (grieviq.in/rep?demo=1 and grieviq.in/dept?demo=1). Used ONLY by dev-tests/demo-build.mjs on a
-- separate, throw-away database; never run on the live database. Every name, place, phone number
-- and email here is invented; emails use demo.grieviq.in, which has no mailboxes.
INSERT INTO admin_users (id,email,role,name,employee_id) VALUES ('d-a1','super@demo.grieviq.in','super_admin','Demo Admin','DEMO-1');
INSERT INTO areas (id,name,state,kind,slug,live) VALUES ('demo-city','Demo City','Demo State','CITY','demo-city',1);
INSERT INTO mp_constituencies (id,name,mp_name,mp_email) VALUES ('mp-demo','Demo Lok Sabha seat','Demo MP','mp@demo.grieviq.in');
INSERT INTO mla_constituencies (id,name,mp_constituency_id,mla_name,mla_email) VALUES ('mla-demo','Demo Vidhan Sabha seat','mp-demo','Demo MLA','mla@demo.grieviq.in');
INSERT INTO municipal_bodies (id,name,mla_constituency_id,has_mayor,mayor_name,mayor_email,area_id) VALUES ('mb-demo','Demo City Municipal Corporation','mla-demo',1,'Demo Mayor','mayor@demo.grieviq.in','demo-city');
INSERT INTO local_units (id,name,unit_type,mla_constituency_id,municipal_body_id,rep_name,rep_email,area_id,ward_num) VALUES
 ('dw-1','Ward 1, Demo Nagar','URBAN','mla-demo','mb-demo','Demo Councillor','councillor@demo.grieviq.in','demo-city',1),
 ('dw-2','Ward 2, Demo Bazaar','URBAN','mla-demo','mb-demo','Demo Councillor 2','councillor2@demo.grieviq.in','demo-city',2),
 ('dw-3','Ward 3, Demo Colony','URBAN','mla-demo','mb-demo','Demo Councillor 3','councillor3@demo.grieviq.in','demo-city',3),
 ('dv-1','Demo Gaon','RURAL','mla-demo',NULL,'Demo Pradhan','pradhan@demo.grieviq.in','demo-city',NULL);
INSERT INTO grievance_categories (id,name,ack_sla_hours,resolution_sla_hours,suggested_department) VALUES
 ('water-sanitation','Water Supply / Sanitation',48,168,'Water Supply'),
 ('electricity','Electricity Supply',24,72,'Electricity'),
 ('streetlight','Street Lights',24,120,'Electricity'),
 ('garbage','Garbage Collection',24,72,'Sanitation / Garbage'),
 ('roads','Roads and Potholes',72,240,'Roads & Public Works'),
 ('other','Other / Uncategorized',72,240,NULL);
UPDATE grievance_categories SET theme = 'WATER' WHERE id = 'water-sanitation';
UPDATE grievance_categories SET theme = 'ENERGY' WHERE id IN ('electricity', 'streetlight');
INSERT INTO office_team (id, office_tier, office_id, member_email, member_name, role, status, confirmed_by_rep_email, added_by, added_at) VALUES
 ('dt1','LOCAL','dw-1','manager@demo.grieviq.in','Neha Verma','OFFICE_MANAGER','ACTIVE','councillor@demo.grieviq.in','councillor@demo.grieviq.in','2026-09-01T00:00:00Z'),
 ('dt2','LOCAL','dw-1','field1@demo.grieviq.in','Ravi Kumar','FIELD_WORKER','ACTIVE','councillor@demo.grieviq.in','councillor@demo.grieviq.in','2026-09-01T00:00:00Z'),
 ('dt3','LOCAL','dw-1','field2@demo.grieviq.in','Salim Khan','FIELD_WORKER','ACTIVE','councillor@demo.grieviq.in','councillor@demo.grieviq.in','2026-09-01T00:00:00Z'),
 ('dt4','MLA','mla-demo','mlaoffice@demo.grieviq.in','Meera Joshi','OFFICE_MANAGER','ACTIVE','mla@demo.grieviq.in','mla@demo.grieviq.in','2026-09-01T00:00:00Z'),
 ('dt5','LOCAL','dv-1','fieldv@demo.grieviq.in','Sunita Devi','FIELD_WORKER','ACTIVE','pradhan@demo.grieviq.in','pradhan@demo.grieviq.in','2026-09-01T00:00:00Z');
