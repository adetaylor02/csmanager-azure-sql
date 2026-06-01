-- =====================================================================
-- CSManager — Seed data
-- Run after schema.sql. Idempotent: clears domain tables before insert.
-- =====================================================================

DELETE FROM dbo.user_roles;
DELETE FROM dbo.users;
DELETE FROM dbo.roles;
DELETE FROM dbo.sites;
DELETE FROM dbo.suppliers;
DELETE FROM dbo.settings;

INSERT INTO dbo.roles(id, description) VALUES
  ('Admin','Full access'),
  ('Manager','Approve reorders, acknowledge notifications'),
  ('Technician','Check-in / check-out spares'),
  ('Viewer','Read-only');

INSERT INTO dbo.sites(id,name,region,active) VALUES
  ('CHI01','Chicago MMR-01','Midwest',1),
  ('CHI05','Chicago MMR-05','Midwest',1),
  ('CHI10','Chicago MMR-10','Midwest',1),
  ('CHI22','Chicago MMR-22','Midwest',1);

INSERT INTO dbo.suppliers(id,name,contact,email,phone,lead_time_days) VALUES
  ('sup-1','Schneider Electric','K. Wallace','sales@schneider.example','+1-312-555-0100',14),
  ('sup-2','Eaton','J. Park','orders@eaton.example','+1-312-555-0140',21),
  ('sup-3','Vertiv','L. Chen','channel@vertiv.example','+1-312-555-0180',10);

-- Default admin user. Replace the bcrypt hash before going live.
-- bcrypt('admin123', 10) — change immediately after first login.
DECLARE @adminId UNIQUEIDENTIFIER = NEWID();
INSERT INTO dbo.users(id,email,display_name,password_hash) VALUES
  (@adminId,'admin@example.com','Admin','$2b$10$wXrLFqQp.SH3o9Y0w9PpEubAxF6Pq9Sq5Eo0e8oBP3rE3qLKQ2yYi');
INSERT INTO dbo.user_roles(user_id, role) VALUES (@adminId, 'Admin');

INSERT INTO dbo.settings([key],value) VALUES
  ('app.name','"CSManager"'),
  ('app.defaultSite','"All CHI Metro"');
GO
