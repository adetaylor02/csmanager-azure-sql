# Supabase → Azure SQL Migration Checklist

Work top-to-bottom. Each item is independently verifiable.

## Infrastructure
- [ ] Azure SQL Server + Database provisioned
- [ ] SQL firewall allows the Static Web App (or "Allow Azure services")
- [ ] Static Web App created with `api_location: api` in the build workflow
- [ ] `SQL_CONNECTION_STRING` set in Static Web App → Configuration
- [ ] `JWT_SECRET` set (32+ random bytes)

## Database
- [ ] `sql/schema.sql` applied without errors
- [ ] `sql/seed.sql` applied; default admin password rotated
- [ ] Optional: data export from Supabase `app_state.data` JSON copied into
      `dbo.app_state` so the UI hydrates with existing inventory

## Backend (Azure Functions)
- [ ] `cd api && npm install` clean
- [ ] Functions run locally (`func start`) and connect to Azure SQL
- [ ] `POST /api/auth/login` returns a JWT for the seeded admin
- [ ] Each CRUD resource returns rows for `GET /api/<resource>`

## Frontend
- [ ] `src/integrations/supabase/*` no longer imported outside that folder
      (`rg "@/integrations/supabase" src/` returns only the client file)
- [ ] `src/lib/api/client.ts` is the only place that talks to `/api`
- [ ] Login + signup flow uses email/password against `/api/auth`
- [ ] Dashboard hydrates from `GET /api/app-state` and persists with `PUT`
- [ ] Users page reads `/api/users` + `/api/user-roles`

## Per-page service migration (incremental — safe to do post-cutover)
Replace `store()` reads in each `src/lib/services/*Service.ts` with calls to
the matching `api*` helper in `src/lib/api/resources.ts`. Recommended order:
- [ ] `sparePartsService` → `apiSpares`
- [ ] `equipmentService` → `apiEquipment`
- [ ] `supplierService` → `apiSuppliers`
- [ ] `inventoryTransactionService` → `apiTransactions`
- [ ] `inspectionService` → `apiInspections`
- [ ] `reorderService` → `apiPurchaseOrders`
- [ ] `notificationService` → `apiNotifications`
- [ ] `auditLogService` → `apiAuditLogs`
- [ ] `locationService` → custom (add `/api/locations` if needed)

Once a service is fully API-backed, drop its entry from `PERSIST_KEYS` in
`src/lib/store.ts` so the legacy `app_state` blob shrinks. When `PERSIST_KEYS`
is empty, delete `dbo.app_state` and remove `apiAppState` from the bundle.

## Cleanup (after the cutover is stable)
- [ ] Delete `src/integrations/supabase/`
- [ ] Remove `@supabase/supabase-js` from `package.json`
- [ ] Remove `supabase/` directory and `VITE_SUPABASE_*` env vars
- [ ] Rotate `JWT_SECRET` and the SQL password
