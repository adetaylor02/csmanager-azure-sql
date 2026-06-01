
# Plan: Complete Zustand → Azure SQL migration

## Scope

Replace all `useApp.getState()` data access with REST calls to `/api/*` backed by Azure SQL. Keep the existing UI, routes, and component contracts unchanged. The mock localStorage fallback in `src/lib/api/mockBackend.ts` (used by Lovable preview when the Functions API is unreachable) stays in place — it will be extended to cover the new resources so the app still renders in preview.

## Backend (api/)

### 1. Field-mapping layer (new)
- `api/src/mapping.js` — per-resource `toDb()` / `fromDb()` translating between camelCase (TS) and snake_case (SQL). Wire it into `api/src/crud.js` so all generic endpoints round-trip cleanly.
- Update `api/src/tables.js` columns to match what the UI actually sends (e.g. `spares.batch_id`, `transactions.timestamp`, `notifications.created_at`).

### 2. Schema gaps (sql/schema.sql)
Add columns currently missing from `schema.sql` that the UI depends on:
- `spares`: `batch_id`, `documents` (NVARCHAR(MAX) JSON)
- `reorder_requests` table (currently absent — UI has `ReorderRequest`)
- `locations` table (UI uses `Location[]`)
- `audit_logs`: `details` column
- `inspections`: `next_due_date`, `findings`
A single additive migration script `sql/migrations/001_complete_ui_coverage.sql` so existing DBs can upgrade non-destructively.

### 3. Specialized routes (replace HTTP 501 placeholders)
New Functions under `api/src/functions/`:
- `transactions.js` — `POST /api/transactions/check-out|check-in|transfer`: atomic SQL transaction that inserts the transaction row, updates `spares.quantity`, writes an audit log.
- `spares-bulk.js` — `POST /api/spares/bulk-import` with `{ rows, mode }`; returns `{ batchId, imported, updated, skipped }`.
- `reorders.js` — `PATCH /api/reorders/:id/status`.
- `notifications-derived.js` — `GET /api/notifications`: derives low-stock / expiring / overdue-inspection rows from current SQL state (matches today's computed `notifications()` selector).
- `dashboard.js` — `GET /api/dashboard/metrics?site=...`: server-side aggregation (counts, low-stock, criticality breakdown, recent activity) so the dashboard no longer scans the entire store client-side.
- `user-roles.js` — finish CRUD endpoints (currently partial).

### 4. Generic CRUD review
- Add `site` filter + `limit`/`offset` pagination to `listAll()` in `crud.js`.
- Wrap mutations in audit-log inserts via a `withAudit(req, entity, action, fn)` helper.

## Frontend (src/)

### 5. New shared cache (`src/lib/data/`)
- `src/lib/data/queryClient.ts` — TanStack Query client.
- `src/lib/data/hooks.ts` — one `useResource(resource)` hook per entity wrapping `apiX.list/get/create/update/remove` with `useQuery`/`useMutation`. Mutations invalidate the matching keys.
- `src/lib/data/mutations.ts` — domain mutations (`useCheckOut`, `useCheckIn`, `useTransfer`, `useBulkImport`, `useSetReorderStatus`).

### 6. Rewrite each service to call REST (no more `store()`)
Each file in `src/lib/services/` becomes a thin async wrapper around its `apiX` resource. `getAll()` returns `Promise<T[]>`, `filterBySite()` accepts a site arg and adds `?site=`. The synchronous selectors used by some components are replaced by the new query hooks.

Files:
- `sparePartsService.ts` → `apiSpares` + bulk import endpoint.
- `equipmentService.ts` → `apiEquipment`.
- `inventoryTransactionService.ts` → `apiTransactions` + check-in/out/transfer mutation endpoints.
- `supplierService.ts` → `apiSuppliers`.
- `inspectionService.ts` → `apiInspections`.
- `reorderService.ts` → `apiPurchaseOrders` (existing `purchase-orders` resource doubles as reorders) + status PATCH.
- `notificationService.ts` → `apiNotifications` (derived endpoint).
- `auditLogService.ts` → `apiAuditLogs`.
- `locationService.ts` → `apiResource('locations')` (new).
- `userRoleService.ts` → keep, drop mock-only branch once `/api/user-roles` is wired.
- `reportsService.ts` → call `/api/dashboard/metrics`.
- `cmmsSyncService.ts` → leave (already external).
- `_common.ts` → drop `store()`; keep `scopeBySite` / `textSearch` as pure utils.

### 7. Replace the Zustand store
`src/lib/store.ts` shrinks to UI-only state: `role`, `currentUser`, `selectedSite`, `dismissedNotifications`. All array fields and mutation methods are removed. Components that previously read `useApp(s => s.spares)` etc. switch to the new query hooks.

Routes touched (read-only — switch from `useApp` to `useResource`/service calls):
- `src/routes/index.tsx` (dashboard — uses new `/api/dashboard/metrics`)
- `src/routes/inventory.index.tsx`, `inventory.$id.tsx`
- `src/routes/equipment.tsx`, `suppliers.tsx`, `locations.tsx`, `transactions.tsx`, `inspections.tsx`, `reorders.tsx`, `reports.tsx`, `notifications.tsx`, `audit.tsx`, `import.tsx`, `settings.tsx`, `users.tsx`
- `src/components/SpareFormDialog.tsx`, `SiteSelector.tsx`, `TopBar.tsx`

### 8. Mock backend parity (`src/lib/api/mockBackend.ts`)
Extend with: per-resource in-memory tables seeded from `src/lib/sample-data.ts`, generic CRUD, the specialized mutations (check-in/out/transfer, bulk-import, reorder status, derived notifications, dashboard metrics). `withMockFallback` in `resources.ts` wraps every new endpoint so Lovable preview keeps working.

### 9. Cleanup
- Delete `apiAppState` and the `/api/app-state` Function.
- Drop `dbo.app_state` from `schema.sql` (kept in legacy migration note).
- Remove `seed*` imports from `store.ts`; sample data is only used by the mock backend now.

## Technical notes

```text
Component ──useQuery──▶ service ──fetch──▶ /api/<resource> ──mssql──▶ Azure SQL
                  │
                  └─(preview, no API) ──▶ withMockFallback ──▶ mockBackend (localStorage)
```

- All mutations return the updated row from `OUTPUT INSERTED.*`; React Query invalidates the matching list key.
- Check-in/out/transfer run inside `pool.transaction()` so a failed quantity update rolls back the transaction insert.
- Audit logs are written server-side inside the same SQL transaction, eliminating the client-driven `log()` helper.

## Risk / out-of-scope

- No automated tests exist; I will verify by typechecking + spot-checking the preview. Without a live Azure SQL I cannot smoke-test the real backend path — mock fallback covers preview.
- Schema changes are additive; existing seeded data is preserved. `dbo.app_state` is retained until the new code is verified in your environment, then removable.
- Auth (`auth.tsx`) and admin gating are untouched.

After approval I'll execute in this order: schema migration → API routes → mock backend parity → services → store shrink → component wiring → typecheck.
