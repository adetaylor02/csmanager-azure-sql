# Azure Deployment Checklist — Static Web Apps + Functions + Azure SQL

## 1. Azure SQL
- [ ] Provision Azure SQL Server + Database (S1 minimum for prod).
- [ ] Firewall: enable **Allow Azure services**, add your office IP for admin.
- [ ] Run `sql/schema.sql` against the database.
- [ ] Run `sql/migrations/001_complete_ui_coverage.sql`.
- [ ] (Optional) Run `sql/seed.sql` and rotate the seeded admin password.
- [ ] Copy the ADO.NET connection string (SQL auth) for the Functions app.

## 2. Azure Functions (under `/api`)
- [ ] `cd api && npm install` runs clean.
- [ ] `func start` boots locally; `POST /api/auth/login` returns a JWT.
- [ ] Smoke test each resource: `GET /api/{spares,equipment,suppliers,
      locations,transactions,reorders,inspections,audit-logs}`.
- [ ] Smoke test specialised endpoints:
      `POST /api/transactions/check-out|check-in|transfer`,
      `POST /api/spares/bulk-import`,
      `GET /api/dashboard/metrics`,
      `GET /api/notifications`.

## 3. Azure Static Web Apps
- [ ] Create SWA, link the GitHub repo, use `.github/workflows/azure-static-web-apps.yml`.
- [ ] Build config: `app_location: /`, `api_location: api`, `output_location: dist`.
- [ ] Configure application settings (Configuration → Application settings):
  - `SQL_CONNECTION_STRING` — full ADO.NET string from step 1.
  - `JWT_SECRET` — 32+ random bytes (`openssl rand -hex 32`).
- [ ] Configure **build-time** environment variables (Workflow file `env:` block):
  - `VITE_DISABLE_MOCK=true` — required for production.
  - `VITE_API_BASE_URL=/api` (default; only override for cross-origin setups).
- [ ] Redeploy and verify the published `/api/auth/login` endpoint responds.

## 4. Frontend cutover verification
- [ ] Hard-reload the deployed site; `localStorage` should NOT contain a
      `csm.mock.enabled` key.
- [ ] Login as the seeded admin → user list, dashboard metrics, inventory
      page all populate from Azure SQL.
- [ ] Create a spare, check it out, check it in → rows appear in
      `dbo.spares` / `dbo.transactions` / `dbo.audit_logs`.
- [ ] Bulk-import an XLSX → spares created and a `Bulk import IMP-…`
      audit entry written.
- [ ] Toggle `VITE_DISABLE_MOCK=false` in a preview slot to confirm
      mock fallback still works for offline dev.

## 5. Hardening (post-cutover)
- [ ] Rotate `JWT_SECRET` and the SQL admin password.
- [ ] Restrict SQL firewall to the SWA outbound IP set (turn off
      "Allow Azure services" once the SWA IP allowlist is in place).
- [ ] Enable Azure SQL **Auditing** and **Threat detection**.
- [ ] Set up Application Insights on the Functions app (the `host.json`
      sampling settings are already in place).
- [ ] Schedule nightly geo-redundant SQL backups (default S1) and
      confirm point-in-time restore.
- [ ] Remove `src/lib/sample-data.ts` and the "Reset to sample data"
      admin action once production data is loaded.
