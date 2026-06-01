/**
 * Per-resource REST helpers. Every endpoint transparently falls back to a
 * localStorage mock backend when the Azure Functions API is not reachable
 * (e.g. in Lovable preview). The real Azure SQL backend is used whenever
 * /api/* responds.
 */
import { api } from "./client";
import {
  enableMock, isMockEnabled,
  mockAuth, mockUsers, mockUserRoles, mockResource,
  mockTransactions, mockBulkImport, mockDashboard, mockNotificationsDerived,
} from "./mockBackend";
import type { Role } from "@/lib/types";

type Row = Record<string, unknown>;

function isApiMissingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("Unexpected token") ||
    msg.includes("not valid JSON") ||
    msg.includes("JSON.parse") ||
    msg.startsWith("HTTP 404") ||
    msg.startsWith("HTTP 405") ||
    msg.startsWith("HTTP 501") ||
    msg === "Not Found"
  );
}

async function withMockFallback<T>(real: () => Promise<T>, mock: () => Promise<T> | T): Promise<T> {
  if (isMockEnabled()) return await mock();
  try { return await real(); }
  catch (err) {
    if (isApiMissingError(err)) { enableMock(); return await mock(); }
    throw err;
  }
}

/** Generic CRUD wrapper that auto-falls-back to the mock table. */
function resource<T extends Row = Row>(name: string) {
  return {
    list: (query?: Record<string, string>) => withMockFallback<T[]>(
      () => {
        const qs = query ? "?" + new URLSearchParams(query).toString() : "";
        return api.get<T[]>(`/${name}${qs}`);
      },
      () => mockResource.list(name, query) as T[],
    ),
    get: (id: string) => withMockFallback<T | null>(
      () => api.get<T>(`/${name}/${encodeURIComponent(id)}`),
      () => mockResource.get(name, id) as T | null,
    ),
    create: (body: Partial<T>) => withMockFallback<T>(
      () => api.post<T>(`/${name}`, body),
      () => mockResource.create(name, body as Row) as T,
    ),
    update: (id: string, body: Partial<T>) => withMockFallback<T>(
      () => api.put<T>(`/${name}/${encodeURIComponent(id)}`, body),
      () => mockResource.update(name, id, body as Row) as T,
    ),
    remove: (id: string) => withMockFallback<void>(
      () => api.delete<void>(`/${name}/${encodeURIComponent(id)}`),
      () => { mockResource.remove(name, id); },
    ),
  };
}

export const apiSpares          = resource("spares");
export const apiInventory       = resource("inventory");
export const apiEquipment       = resource("equipment");
export const apiSuppliers       = resource("suppliers");
export const apiLocations       = resource("locations");
export const apiTransactions    = resource("transactions");
export const apiRoles           = resource("roles");
export const apiSites           = resource("sites");
export const apiInspections     = resource("inspections");
export const apiReorders        = resource("reorders");
export const apiPurchaseOrders  = resource("purchase-orders");
export const apiWorkOrders      = resource("work-orders");
export const apiAuditLogs       = resource("audit-logs");
export const apiNotifications   = resource("notifications");
export const apiReports         = resource("reports");
export const apiSettings        = resource("settings");

/* ---------- specialized endpoints ---------- */

type Movement = {
  spareId: string; quantity: number; technician: string;
  workOrder?: string; assetId?: string; reason?: string;
  fromLocation?: string; toLocation?: string;
  condition?: string; site?: string;
};

export const apiInventoryMovements = {
  checkOut: (body: Movement) => withMockFallback(
    () => api.post(`/transactions/check-out`, body),
    () => mockTransactions.movement("check-out", body),
  ),
  checkIn: (body: Movement) => withMockFallback(
    () => api.post(`/transactions/check-in`, body),
    () => mockTransactions.movement("check-in", body),
  ),
  transfer: (body: Movement) => withMockFallback(
    () => api.post(`/transactions/transfer`, body),
    () => mockTransactions.movement("transfer", body),
  ),
};

export const apiSparesBulk = {
  import: (rows: Row[], mode: "skip" | "update" | "new") => withMockFallback(
    () => api.post<{ batchId: string; imported: number; updated: number; skipped: number }>(
      `/spares/bulk-import`, { rows, mode }
    ),
    () => mockBulkImport.run(rows as never, mode),
  ),
};

export const apiDashboard = {
  metrics: (site?: string) => withMockFallback(
    () => api.get(`/dashboard/metrics${site ? `?site=${encodeURIComponent(site)}` : ""}`),
    () => mockDashboard.metrics(site),
  ),
};

/** Override notifications.list with the derived-on-the-fly endpoint. */
apiNotifications.list = ((query?: Record<string, string>) => withMockFallback(
  () => {
    const qs = query ? "?" + new URLSearchParams(query).toString() : "";
    return api.get(`/notifications${qs}`);
  },
  () => mockNotificationsDerived.list(query?.site) as never,
)) as typeof apiNotifications.list;

/* ---------- users / auth (uses dedicated mock helpers) ---------- */

type UserRow = { id: string; email: string | null; display_name: string | null };

export const apiUsers = {
  list: () => withMockFallback<UserRow[]>(
    () => api.get<UserRow[]>("/users"),
    () => mockUsers.list(),
  ),
  remove: (id: string) => withMockFallback<void>(
    () => api.delete<void>(`/users/${encodeURIComponent(id)}`),
    () => { mockUsers.remove(id); },
  ),
};

type AuthResp = { token: string; user: { id: string; email: string; display_name: string | null; roles: string[] } };
type RegResp  = { user: { id: string; email: string; display_name: string | null; roles: string[] } };

export const apiAuth = {
  login: (email: string, password: string) => withMockFallback<AuthResp>(
    () => api.post<AuthResp>("/auth/login", { email, password }),
    () => mockAuth.login(email, password),
  ),
  register: (email: string, password: string, display_name?: string) => withMockFallback<RegResp>(
    () => api.post<RegResp>("/auth/register", { email, password, display_name }),
    () => mockAuth.register(email, password, display_name),
  ),
};

/** Bridge for userRoleService — kept for compatibility. */
export const mockBridge = {
  getAllRoles: () => mockUserRoles.getAll(),
  setRole: (userId: string, role: Role) => mockUserRoles.setRole(userId, role),
  isMockEnabled,
};
