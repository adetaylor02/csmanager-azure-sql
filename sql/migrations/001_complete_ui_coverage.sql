-- =====================================================================
-- Migration 001 — bring schema in line with the UI/REST contract used
-- after the Zustand → Azure SQL migration. Additive only; safe to run
-- against an existing schema.sql deployment.
-- =====================================================================

-- spares: extra fields the UI sends
IF COL_LENGTH('dbo.spares','equipment_supported') IS NULL
  ALTER TABLE dbo.spares ADD equipment_supported NVARCHAR(MAX) NULL;     -- JSON array of asset ids
IF COL_LENGTH('dbo.spares','documents') IS NULL
  ALTER TABLE dbo.spares ADD documents NVARCHAR(MAX) NULL;               -- JSON array
IF COL_LENGTH('dbo.spares','batch_id') IS NULL
  ALTER TABLE dbo.spares ADD batch_id NVARCHAR(40) NULL;
IF COL_LENGTH('dbo.spares','last_used') IS NULL
  ALTER TABLE dbo.spares ADD last_used DATETIME2 NULL;
IF COL_LENGTH('dbo.spares','last_inspected') IS NULL
  ALTER TABLE dbo.spares ADD last_inspected DATETIME2 NULL;
GO

-- equipment: system_type (UI), distinct from generic 'category'
IF COL_LENGTH('dbo.equipment','system_type') IS NULL
  ALTER TABLE dbo.equipment ADD system_type NVARCHAR(60) NULL;
GO

-- inspections: UI fields
IF COL_LENGTH('dbo.inspections','inspection_date') IS NULL
  ALTER TABLE dbo.inspections ADD inspection_date DATE NULL;
IF COL_LENGTH('dbo.inspections','findings') IS NULL
  ALTER TABLE dbo.inspections ADD findings NVARCHAR(2000) NULL;
IF COL_LENGTH('dbo.inspections','condition') IS NULL
  ALTER TABLE dbo.inspections ADD condition NVARCHAR(40) NULL;
GO

-- audit_logs: free-text details column referenced by the UI / triggers
IF COL_LENGTH('dbo.audit_logs','details') IS NULL
  ALTER TABLE dbo.audit_logs ADD details NVARCHAR(2000) NULL;
GO

-- locations: was missing entirely
IF OBJECT_ID('dbo.locations','U') IS NULL
BEGIN
  CREATE TABLE dbo.locations (
    id        NVARCHAR(40)  NOT NULL PRIMARY KEY,
    site      NVARCHAR(40)  NOT NULL,
    name      NVARCHAR(160) NOT NULL,
    building  NVARCHAR(120) NULL,
    room      NVARCHAR(120) NULL
  );
END
GO

-- reorders: domain-specific reorder requests (distinct from purchase_orders)
IF OBJECT_ID('dbo.reorders','U') IS NULL
BEGIN
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
  CREATE INDEX IX_reorders_status ON dbo.reorders(status);
END
GO
