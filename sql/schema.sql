-- =====================================================================
-- CSManager — Azure SQL schema
-- Run on an empty Azure SQL database. Idempotent (drops & recreates).
-- =====================================================================

IF OBJECT_ID('dbo.app_state','U') IS NOT NULL DROP TABLE dbo.app_state;
IF OBJECT_ID('dbo.notifications','U') IS NOT NULL DROP TABLE dbo.notifications;
IF OBJECT_ID('dbo.audit_logs','U') IS NOT NULL DROP TABLE dbo.audit_logs;
IF OBJECT_ID('dbo.reports','U') IS NOT NULL DROP TABLE dbo.reports;
IF OBJECT_ID('dbo.work_orders','U') IS NOT NULL DROP TABLE dbo.work_orders;
IF OBJECT_ID('dbo.purchase_orders','U') IS NOT NULL DROP TABLE dbo.purchase_orders;
IF OBJECT_ID('dbo.inspections','U') IS NOT NULL DROP TABLE dbo.inspections;
IF OBJECT_ID('dbo.transactions','U') IS NOT NULL DROP TABLE dbo.transactions;
IF OBJECT_ID('dbo.inventory','U') IS NOT NULL DROP TABLE dbo.inventory;
IF OBJECT_ID('dbo.reorders','U') IS NOT NULL DROP TABLE dbo.reorders;
IF OBJECT_ID('dbo.locations','U') IS NOT NULL DROP TABLE dbo.locations;
IF OBJECT_ID('dbo.spares','U') IS NOT NULL DROP TABLE dbo.spares;
IF OBJECT_ID('dbo.equipment','U') IS NOT NULL DROP TABLE dbo.equipment;
IF OBJECT_ID('dbo.suppliers','U') IS NOT NULL DROP TABLE dbo.suppliers;
IF OBJECT_ID('dbo.user_roles','U') IS NOT NULL DROP TABLE dbo.user_roles;
IF OBJECT_ID('dbo.users','U') IS NOT NULL DROP TABLE dbo.users;
IF OBJECT_ID('dbo.roles','U') IS NOT NULL DROP TABLE dbo.roles;
IF OBJECT_ID('dbo.sites','U') IS NOT NULL DROP TABLE dbo.sites;
IF OBJECT_ID('dbo.settings','U') IS NOT NULL DROP TABLE dbo.settings;
GO

-- ---------- Locations (UI-managed bins/rooms) ----------
CREATE TABLE dbo.locations (
  id        NVARCHAR(40)  NOT NULL PRIMARY KEY,
  site      NVARCHAR(40)  NOT NULL,
  name      NVARCHAR(160) NOT NULL,
  building  NVARCHAR(120) NULL,
  room      NVARCHAR(120) NULL
);

-- ---------- Reorder requests ----------
CREATE TABLE dbo.reorders (
  id              NVARCHAR(40)   NOT NULL PRIMARY KEY,
  spare_id        NVARCHAR(40)   NOT NULL,
  quantity        INT            NOT NULL,
  reason          NVARCHAR(500)  NULL,
  supplier        NVARCHAR(40)   NULL,
  estimated_cost  DECIMAL(12,2)  NOT NULL DEFAULT 0,
  required_by     DATE           NULL,
  requested_by    NVARCHAR(160)  NOT NULL,
  status          NVARCHAR(40)   NOT NULL DEFAULT 'Draft',
  site            NVARCHAR(40)   NULL,
  created_at      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- ---------- Reference tables ----------
CREATE TABLE dbo.sites (
  id           NVARCHAR(40)  NOT NULL PRIMARY KEY,
  name         NVARCHAR(160) NOT NULL,
  region       NVARCHAR(80)  NULL,
  active       BIT           NOT NULL DEFAULT 1,
  created_at   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.roles (
  id           NVARCHAR(40)  NOT NULL PRIMARY KEY,   -- 'Admin','Manager','Technician','Viewer'
  description  NVARCHAR(200) NULL
);

CREATE TABLE dbo.users (
  id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  email         NVARCHAR(160)    NOT NULL UNIQUE,
  display_name  NVARCHAR(160)    NULL,
  password_hash NVARCHAR(255)    NULL,             -- bcrypt; null if SSO-only
  active        BIT              NOT NULL DEFAULT 1,
  created_at    DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at    DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.user_roles (
  id        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  user_id   UNIQUEIDENTIFIER NOT NULL,
  role      NVARCHAR(40)     NOT NULL,
  CONSTRAINT FK_user_roles_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE,
  CONSTRAINT UQ_user_roles UNIQUE (user_id, role)
);

-- ---------- Domain tables ----------
CREATE TABLE dbo.suppliers (
  id              NVARCHAR(40)  NOT NULL PRIMARY KEY,
  name            NVARCHAR(160) NOT NULL,
  contact         NVARCHAR(120) NULL,
  email           NVARCHAR(160) NULL,
  phone           NVARCHAR(40)  NULL,
  lead_time_days  INT           NOT NULL DEFAULT 14,
  created_at      DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.equipment (
  id            NVARCHAR(40)  NOT NULL PRIMARY KEY,
  tag           NVARCHAR(40)  NULL UNIQUE,
  name          NVARCHAR(160) NOT NULL,
  manufacturer  NVARCHAR(160) NULL,
  model         NVARCHAR(160) NULL,
  system_type   NVARCHAR(60)  NULL,
  category      NVARCHAR(60)  NULL,
  criticality   NVARCHAR(20)  NULL,
  site          NVARCHAR(40)  NULL,
  location_id   NVARCHAR(40)  NULL,
  install_date  DATE          NULL,
  created_at    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.spares (
  id                  NVARCHAR(40)   NOT NULL PRIMARY KEY,
  part_name           NVARCHAR(160)  NOT NULL,
  description         NVARCHAR(500)  NULL,
  manufacturer        NVARCHAR(160)  NOT NULL,
  model_number        NVARCHAR(80)   NOT NULL,
  serial_number       NVARCHAR(80)   NULL,
  equipment_supported NVARCHAR(MAX)  NULL,  -- JSON array of equipment ids
  documents           NVARCHAR(MAX)  NULL,  -- JSON array of Document
  category            NVARCHAR(60)   NOT NULL,
  criticality         NVARCHAR(20)   NOT NULL,
  condition           NVARCHAR(40)   NOT NULL,
  min_stock           INT            NOT NULL DEFAULT 0,
  quantity            INT            NOT NULL DEFAULT 0,
  unit_cost           DECIMAL(12,2)  NOT NULL DEFAULT 0,
  lead_time_days      INT            NOT NULL DEFAULT 0,
  expiry_date         DATE           NULL,
  last_used           DATETIME2      NULL,
  last_inspected      DATETIME2      NULL,
  site                NVARCHAR(40)   NOT NULL,
  location_id         NVARCHAR(40)   NULL,
  bin                 NVARCHAR(40)   NULL,
  supplier_id         NVARCHAR(40)   NULL,
  batch_id            NVARCHAR(40)   NULL,
  notes               NVARCHAR(2000) NULL,
  created_at          DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at          DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_spares_site ON dbo.spares(site);
CREATE INDEX IX_spares_supplier ON dbo.spares(supplier_id);

CREATE TABLE dbo.inventory (
  id            NVARCHAR(40)  NOT NULL PRIMARY KEY,
  spare_id      NVARCHAR(40)  NOT NULL,
  site          NVARCHAR(40)  NOT NULL,
  location_id   NVARCHAR(40)  NULL,
  bin           NVARCHAR(40)  NULL,
  quantity      INT           NOT NULL DEFAULT 0,
  updated_at    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.transactions (
  id              NVARCHAR(40)   NOT NULL PRIMARY KEY,
  type            NVARCHAR(20)   NOT NULL, -- check-in | check-out | transfer
  spare_id        NVARCHAR(40)   NOT NULL,
  quantity        INT            NOT NULL,
  technician      NVARCHAR(160)  NOT NULL,
  work_order      NVARCHAR(60)   NULL,
  asset_id        NVARCHAR(40)   NULL,
  from_location   NVARCHAR(40)   NULL,
  to_location     NVARCHAR(40)   NULL,
  condition       NVARCHAR(40)   NULL,
  reason          NVARCHAR(500)  NULL,
  site            NVARCHAR(40)   NOT NULL,
  ts              DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_transactions_site_ts ON dbo.transactions(site, ts DESC);

CREATE TABLE dbo.inspections (
  id              NVARCHAR(40)  NOT NULL PRIMARY KEY,
  spare_id        NVARCHAR(40)  NOT NULL,
  inspector       NVARCHAR(160) NOT NULL,
  status          NVARCHAR(40)  NOT NULL,
  inspection_date DATE          NULL,
  next_due        DATE          NULL,
  condition       NVARCHAR(40)  NULL,
  findings        NVARCHAR(2000) NULL,
  site            NVARCHAR(40)  NOT NULL,
  notes           NVARCHAR(2000) NULL
);

CREATE TABLE dbo.purchase_orders (
  id           NVARCHAR(40)   NOT NULL PRIMARY KEY,
  spare_id     NVARCHAR(40)   NOT NULL,
  quantity     INT            NOT NULL,
  supplier_id  NVARCHAR(40)   NOT NULL,
  status       NVARCHAR(40)   NOT NULL DEFAULT 'Draft',
  requested_by NVARCHAR(160)  NOT NULL,
  approved_by  NVARCHAR(160)  NULL,
  eta          DATE           NULL,
  site         NVARCHAR(40)   NOT NULL,
  notes        NVARCHAR(2000) NULL,
  created_at   DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.work_orders (
  id           NVARCHAR(40)   NOT NULL PRIMARY KEY,
  title        NVARCHAR(200)  NOT NULL,
  asset_id     NVARCHAR(40)   NULL,
  status       NVARCHAR(40)   NOT NULL DEFAULT 'Open',
  priority     NVARCHAR(20)   NOT NULL DEFAULT 'Medium',
  assignee     NVARCHAR(160)  NULL,
  site         NVARCHAR(40)   NOT NULL,
  description  NVARCHAR(2000) NULL,
  created_at   DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
  due_date     DATE           NULL,
  closed_at    DATETIME2      NULL
);

CREATE TABLE dbo.audit_logs (
  id          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  ts          DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
  [user]      NVARCHAR(160)    NOT NULL,
  site        NVARCHAR(40)     NULL,
  action      NVARCHAR(80)     NOT NULL,
  entity      NVARCHAR(40)     NOT NULL,
  entity_id   NVARCHAR(60)     NOT NULL,
  old_value   NVARCHAR(MAX)    NULL,
  new_value   NVARCHAR(MAX)    NULL,
  details     NVARCHAR(2000)   NULL,
  notes       NVARCHAR(2000)   NULL
);
CREATE INDEX IX_audit_logs_ts ON dbo.audit_logs(ts DESC);

CREATE TABLE dbo.notifications (
  id            NVARCHAR(60)   NOT NULL PRIMARY KEY,
  type          NVARCHAR(40)   NOT NULL,
  severity      NVARCHAR(20)   NOT NULL,
  message       NVARCHAR(500)  NOT NULL,
  entity_id     NVARCHAR(60)   NULL,
  site          NVARCHAR(40)   NULL,
  acknowledged  BIT            NOT NULL DEFAULT 0,
  ack_by        NVARCHAR(160)  NULL,
  ack_at        DATETIME2      NULL,
  created_at    DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.reports (
  id          NVARCHAR(40)   NOT NULL PRIMARY KEY,
  name        NVARCHAR(200)  NOT NULL,
  kind        NVARCHAR(40)   NOT NULL,
  params      NVARCHAR(MAX)  NULL,
  created_by  NVARCHAR(160)  NULL,
  created_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.settings (
  [key]      NVARCHAR(80)  NOT NULL PRIMARY KEY,
  value      NVARCHAR(MAX) NULL,
  updated_at DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);

-- JSON blob used by the current Zustand-backed UI during the migration window.
-- Acts as a compatibility shim while individual /api/* endpoints are wired into
-- the per-page services. Safe to drop once UI reads exclusively from REST.
CREATE TABLE dbo.app_state (
  id         NVARCHAR(40)  NOT NULL PRIMARY KEY DEFAULT 'singleton',
  data       NVARCHAR(MAX) NOT NULL,
  updated_at DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
