# Azure SQL Migration — Completion Report

## Architecture (final)

```
React UI  ─►  service layer  ─►  apiX REST  ─►  Azure Functions  ─►  Azure SQL
                  │
                  └─►  Zustand cache (hydrated from REST on app load)
```

- **Reads**: the Zustand store is a hot cache, hydrated exclusively from
  `apiX.list()` (Azure SQL via Azure Functions) on `useApp.hydrate()`.
  No production read path touches `localStorage` or bundled sample data.
- **Writes**: every mutation (store action OR service method) calls its
  matching REST endpoint and reconciles the cache with the server's row.
  The legacy bulk `/api/app-state` blob is no longer written.
- **Mock fallback**: gated by `VITE_DISABLE_MOCK`. Set to `"true"` in Azure
  Static Web Apps so production never silently falls back to localStorage.

## Service layer — final state

| Service | Reads (sync, from hydrated cache) | Writes (direct REST) |
|---|---|---|
| sparePartsService | `apiSpares.list` → cache | `apiSpares.create/update/remove` + `apiSparesBulk.import` |
| equipmentService | `apiEquipment.list` → cache | `apiEquipment.create/update/remove` |
| supplierService | `apiSuppliers.list` → cache | `apiSuppliers.create/update/remove` |
| locationService | `apiLocations.list` → cache | `apiLocations.create/update/remove` |
| inventoryTransactionService | `apiTransactions.list` → cache | `apiInventoryMovements.checkOut/checkIn/transfer` (atomic SQL tx) |
| inspectionService | `apiInspections.list` → cache | `apiInspections.create/update/remove` + cascading spare update |
| reorderService | `apiReorders.list` → cache | `apiReorders.create/update/remove` |
| notificationService | `apiNotifications` (derived server-side) + cache compute | n/a (derived) |
| auditLogService | `apiAuditLogs.list` → cache | n/a (server-side append-only) |
| reportsService | `apiDashboard.metrics` (server agg) + cache compute | `apiReports.create` (saved defs) |
| userRoleService | `apiUsers.list` / `apiRoles.list` | `/api/user-roles` POST/DELETE |

## Routes — data source audit

All routes consume the hydrated Zustand cache (which is populated from
Azure SQL). Mutations from any route flow through REST.

| Route | Reads via | Writes via |
|---|---|---|
| `/` (Dashboard) | `useScopedSpares/Equipment/...` (cache) | — |
| `/inventory` | `useApp.spares` (cache) | `store.deleteSpare/duplicateSpare` → `apiSpares.*` |
| `/inventory/$id` | cache | `store.checkOut/In/transfer/addReorder/addInspection` → `apiInventoryMovements.*`, `apiReorders.create`, `apiInspections.create` |
| `/equipment` | cache | — |
| `/suppliers` | cache | — |
| `/locations` | cache | — |
| `/transactions` | cache | — |
| `/inspections` | cache | — |
| `/reorders` | cache | `store.setReorderStatus/addReorder` → `apiReorders.update/create` |
| `/notifications` | `useNotifications` (cache compute) + `apiNotifications` available | dismissals: localStorage (UI-only state, not business data) |
| `/audit` | cache | — |
| `/reports` | cache | `reportsService.save` → `apiReports.create` |
| `/import` | — | `store.bulkImportSpares` → `apiSparesBulk.import` |
| `/users` | `apiUsers/apiRoles` direct | `userRoleService` → `/api/user-roles` |
| `/admin`, `/settings` | cache | settings via `apiSettings` |
| `/login` | — | `apiAuth.login/register` |

## Remaining store-only state (intentional, non-business)

The following Zustand state is intentionally local and never persisted to SQL:

- `role`, `currentUser` — populated from the JWT/auth session.
- `selectedSite` — UI preference (`localStorage` key `csm.selectedSite`).
- `dismissedNotifications` — UI preference (`localStorage` key `csm.dismissedNotifications`).
- Derived `notifications()` — pure compute over cached SQL data; the
  authoritative server-derived list is at `GET /api/notifications`.

## Mock fallback — production behaviour

- `VITE_DISABLE_MOCK=true` → `isMockEnabled()` returns false unconditionally
  and `enableMock()` is a no-op. API errors propagate to the caller and
  surface as toast errors instead of silently switching to localStorage.
- `hydrate()` no longer seeds the bundled sample data in production. If
  the database is empty the app shows empty tables and the user can
  populate via the UI or by running `sql/seed.sql`.
- Preview / local dev (flag unset or `false`) keeps the existing behaviour:
  first failed `/api/*` call enables the localStorage mock for the session.

## Remaining blockers / follow-ups

1. **No live Azure SQL smoke test from this environment** — every endpoint
   has been wired and the mock backend mirrors the contracts, but a real
   round-trip against Azure SQL should be run before cutover.
2. **`reportsService.exportForPowerBi`** still POSTs to `/api/reports?view=…`
   expecting a streaming export; the Azure Function for that streaming
   path is not yet implemented (CRUD `/api/reports` exists).
3. **Cascading writes on `addInspection`** issue two REST calls (insert
   inspection + update spare). Acceptable today; promoting to a single
   server-side transaction is a future hardening.
4. **Sample-data dependency** remains in `src/lib/sample-data.ts` only for
   the `resetToSampleData()` admin action and preview seeding. Safe to
   delete once the production DB is populated and the admin button is
   removed.
