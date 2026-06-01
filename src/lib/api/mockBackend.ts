/**
 * Local mock backend used when the Azure Functions API is not reachable
 * (e.g. inside the Lovable preview). Persists to localStorage so data
 * survives page reloads. Activated automatically on the first failed
 * API call.
 *
 * NOT FOR PRODUCTION. Passwords are hashed with a simple SHA-256 — adequate
 * for a preview-only fallback, not for real deployments. The real Azure SQL
 * backend (bcrypt + JWT) is used whenever `/api/*` responds.
 */
import type { Role } from "@/lib/types";
import {
  spareParts as seedSpares,
  equipment as seedEquipment,
  suppliers as seedSuppliers,
  locations as seedLocations,
  inventoryTransactions as seedTx,
  reorderRequests as seedReorders,
  inspections as seedInspections,
  auditLogs as seedAuditLogs,
} from "@/lib/sample-data";

const FLAG_KEY = "csm.mock.enabled";
const USERS_KEY = "csm.mock.users";
const ROLES_KEY = "csm.mock.user_roles";
const TABLE_KEY = (name: string) => `csm.mock.tbl.${name}`;

type MockUser = { id: string; email: string; display_name: string | null; password_hash: string };
type MockRoleRow = { id: string; user_id: string; role: Role };

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
}
function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Build-time kill-switch for the mock backend. Set `VITE_DISABLE_MOCK=true`
 * in production deployments (Azure Static Web Apps app settings) so that the
 * UI never silently falls back to localStorage when /api/* hiccups. With the
 * flag on, API errors propagate to the caller (and surface as toasts).
 */
const MOCK_DISABLED: boolean =
  (typeof import.meta !== "undefined" &&
    String((import.meta as any).env?.VITE_DISABLE_MOCK ?? "").toLowerCase() === "true");

export function isMockEnabled(): boolean {
  if (MOCK_DISABLED) return false;
  if (typeof window === "undefined") return false;
  return localStorage.getItem(FLAG_KEY) === "1";
}
export function enableMock() {
  if (MOCK_DISABLED) return; // production: never enable mock fallback
  if (typeof window === "undefined") return;
  if (localStorage.getItem(FLAG_KEY) === "1") return;
  localStorage.setItem(FLAG_KEY, "1");
  seedTablesOnce();
  // eslint-disable-next-line no-console
  console.warn("[csm] API unavailable — using local mock backend (preview only).");
}
export function isMockDisabledByBuild(): boolean { return MOCK_DISABLED; }


async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
function token(userId: string): string {
  return `mock.${btoa(userId)}.${Date.now().toString(36)}`;
}

/* -------- auth tables -------- */
function loadUsers(): MockUser[]      { return read<MockUser[]>(USERS_KEY, []); }
function saveUsers(u: MockUser[])     { write(USERS_KEY, u); }
function loadRoles(): MockRoleRow[]   { return read<MockRoleRow[]>(ROLES_KEY, []); }
function saveRoles(r: MockRoleRow[])  { write(ROLES_KEY, r); }
function rolesFor(userId: string): Role[] {
  return loadRoles().filter((r) => r.user_id === userId).map((r) => r.role);
}
function publicUser(u: MockUser) {
  return { id: u.id, email: u.email, display_name: u.display_name, roles: rolesFor(u.id) };
}

export const mockAuth = {
  async register(email: string, password: string, display_name?: string) {
    const users = loadUsers();
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error("Email already registered");
    }
    const user: MockUser = {
      id: uuid(), email, display_name: display_name ?? email.split("@")[0],
      password_hash: await sha256(password),
    };
    users.push(user); saveUsers(users);
    const role: Role = users.length === 1 ? "Admin" : "Viewer";
    const roles = loadRoles(); roles.push({ id: uuid(), user_id: user.id, role }); saveRoles(roles);
    return { user: publicUser(user) };
  },
  async login(email: string, password: string) {
    const hash = await sha256(password);
    const user = loadUsers().find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password_hash === hash,
    );
    if (!user) throw new Error("Invalid email or password");
    return { token: token(user.id), user: publicUser(user) };
  },
};

export const mockUsers = {
  list() { return loadUsers().map((u) => ({ id: u.id, email: u.email, display_name: u.display_name })); },
  remove(id: string) {
    saveUsers(loadUsers().filter((u) => u.id !== id));
    saveRoles(loadRoles().filter((r) => r.user_id !== id));
  },
};
export const mockUserRoles = {
  getAll(): MockRoleRow[] { return loadRoles(); },
  setRole(userId: string, role: Role) {
    const rows = loadRoles().filter((r) => r.user_id !== userId);
    rows.push({ id: uuid(), user_id: userId, role });
    saveRoles(rows);
  },
};

/* -------- per-resource generic tables -------- */
type Row = Record<string, unknown> & { id?: string };
const SEEDS: Record<string, Row[]> = {
  spares: seedSpares as unknown as Row[],
  equipment: seedEquipment as unknown as Row[],
  suppliers: seedSuppliers as unknown as Row[],
  locations: seedLocations as unknown as Row[],
  transactions: seedTx as unknown as Row[],
  reorders: seedReorders as unknown as Row[],
  inspections: seedInspections as unknown as Row[],
  'audit-logs': seedAuditLogs as unknown as Row[],
  'purchase-orders': [],
  'work-orders': [],
  sites: [],
  roles: [
    { id: "Admin", description: "Full access" },
    { id: "Manager", description: "Approve reorders, acknowledge notifications" },
    { id: "Technician", description: "Check-in / check-out spares" },
    { id: "Viewer", description: "Read-only" },
  ],
  reports: [],
  settings: [],
  inventory: [],
  notifications: [],
};

function seedTablesOnce() {
  if (typeof window === "undefined") return;
  for (const [name, rows] of Object.entries(SEEDS)) {
    const key = TABLE_KEY(name);
    if (localStorage.getItem(key) == null) write(key, rows);
  }
}

function loadTable(name: string): Row[] {
  seedTablesOnce();
  return read<Row[]>(TABLE_KEY(name), []);
}
function saveTable(name: string, rows: Row[]) { write(TABLE_KEY(name), rows); }

function matchesSite(row: Row, site?: string) {
  if (!site || site === "All CHI Metro") return true;
  return (row as { site?: string }).site === site;
}

export const mockResource = {
  list(name: string, query?: Record<string, string>): Row[] {
    const rows = loadTable(name);
    return query?.site ? rows.filter((r) => matchesSite(r, query.site)) : rows;
  },
  get(name: string, id: string): Row | null {
    return loadTable(name).find((r) => r.id === id) ?? null;
  },
  create(name: string, body: Row): Row {
    const rows = loadTable(name);
    const row = { id: uuid(), createdAt: new Date().toISOString(), ...body };
    rows.unshift(row);
    saveTable(name, rows);
    return row;
  },
  update(name: string, id: string, body: Row): Row | null {
    const rows = loadTable(name);
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    rows[idx] = { ...rows[idx], ...body, id };
    saveTable(name, rows);
    return rows[idx];
  },
  remove(name: string, id: string): boolean {
    const rows = loadTable(name);
    const next = rows.filter((r) => r.id !== id);
    if (next.length === rows.length) return false;
    saveTable(name, next);
    return true;
  },
};

/* -------- specialized mutations -------- */
type Movement = {
  spareId: string; quantity: number; technician: string;
  workOrder?: string; assetId?: string; reason?: string;
  fromLocation?: string; toLocation?: string;
  condition?: string; site?: string;
};

export const mockTransactions = {
  movement(kind: "check-in" | "check-out" | "transfer", body: Movement) {
    const spares = loadTable("spares");
    const idx = spares.findIndex((s) => s.id === body.spareId);
    if (idx < 0) throw new Error(`Spare ${body.spareId} not found`);
    const spare = spares[idx] as Row & { quantity: number; site?: string; partName?: string };
    let newQty = spare.quantity;
    if (kind === "check-out") {
      if (body.quantity > spare.quantity) throw new Error("Insufficient stock");
      newQty -= body.quantity;
    } else if (kind === "check-in") {
      newQty += body.quantity;
    }
    if (newQty !== spare.quantity) {
      spares[idx] = { ...spare, quantity: newQty };
      saveTable("spares", spares);
    }
    const tx = {
      id: uuid(), type: kind, spareId: body.spareId, quantity: body.quantity,
      technician: body.technician, workOrder: body.workOrder, assetId: body.assetId,
      fromLocation: body.fromLocation, toLocation: body.toLocation,
      condition: body.condition, reason: body.reason,
      site: body.site ?? spare.site, timestamp: new Date().toISOString(),
    };
    const txs = loadTable("transactions"); txs.unshift(tx); saveTable("transactions", txs);
    const logs = loadTable("audit-logs");
    logs.unshift({ id: uuid(), action: kind, entity: "transaction", entityId: tx.id,
      user: body.technician, details: `${kind} ${body.quantity} × ${spare.partName ?? body.spareId}`,
      site: tx.site, timestamp: tx.timestamp });
    saveTable("audit-logs", logs);
    return { ...tx, newQuantity: newQty };
  },
};

export const mockBulkImport = {
  run(rows: Array<Row & { partName?: string; modelNumber?: string; serialNumber?: string; site?: string }>, mode: "skip" | "update" | "new") {
    const spares = loadTable("spares") as Array<Row & { partName?: string; modelNumber?: string; serialNumber?: string; site?: string }>;
    const batchId = `IMP-${Date.now().toString(36).toUpperCase()}`;
    let imported = 0, updated = 0, skipped = 0;
    for (const r of rows) {
      const dupIdx = spares.findIndex((s) =>
        s.site === r.site &&
        String(s.partName ?? "").toLowerCase() === String(r.partName ?? "").toLowerCase() &&
        String(s.modelNumber ?? "").toLowerCase() === String(r.modelNumber ?? "").toLowerCase() &&
        String(s.serialNumber ?? "").toLowerCase() === String(r.serialNumber ?? "").toLowerCase());
      if (dupIdx >= 0) {
        if (mode === "skip") { skipped++; continue; }
        if (mode === "update") { spares[dupIdx] = { ...spares[dupIdx], ...r, batchId }; updated++; continue; }
      }
      spares.unshift({ ...r, id: uuid(), batchId, createdAt: new Date().toISOString(), documents: [] });
      imported++;
    }
    saveTable("spares", spares);
    return { batchId, imported, updated, skipped };
  },
};

export const mockDashboard = {
  metrics(site?: string) {
    const scope = (rows: Row[]) => rows.filter((r) => matchesSite(r, site));
    const spares = scope(loadTable("spares")) as Array<Row & { quantity: number; minStock: number; unitCost: number; criticality?: string }>;
    const tx = scope(loadTable("transactions"));
    const wo = scope(loadTable("work-orders")) as Array<Row & { status?: string }>;
    const ro = scope(loadTable("reorders")) as Array<Row & { status?: string }>;
    const byCrit: Record<string, number> = {};
    for (const s of spares) byCrit[s.criticality ?? "Unknown"] = (byCrit[s.criticality ?? "Unknown"] ?? 0) + 1;
    return {
      totalParts: spares.length,
      totalValue: spares.reduce((a, s) => a + (s.quantity || 0) * (s.unitCost || 0), 0),
      lowStock: spares.filter((s) => s.quantity > 0 && s.quantity < s.minStock).length,
      outOfStock: spares.filter((s) => s.quantity === 0).length,
      openWorkOrders: wo.filter((w) => w.status && !["Closed", "Completed"].includes(w.status)).length,
      pendingReorders: ro.filter((r) => r.status === "Pending Approval").length,
      byCriticality: byCrit,
      recentTransactions: tx.slice(0, 10),
    };
  },
};

export const mockNotificationsDerived = {
  list(site?: string) {
    const scope = <T extends Row>(rows: T[]) => rows.filter((r) => matchesSite(r, site));
    const spares = scope(loadTable("spares")) as Array<Row & { partName: string; quantity: number; minStock: number; expiryDate?: string; equipmentSupported?: string[] }>;
    const inspections = scope(loadTable("inspections")) as Array<Row & { spareId: string; nextDue?: string }>;
    const reorders = scope(loadTable("reorders")) as Array<Row & { spareId: string; status: string; createdAt: string }>;
    const equipment = scope(loadTable("equipment")) as Array<Row & { name: string; criticality: string }>;
    const list: Array<{ id: string; type: string; severity: string; message: string; timestamp: string; read: boolean }> = [];
    const now = Date.now();
    for (const s of spares) {
      if (s.quantity === 0) list.push({ id: `n-oos-${s.id}`, type: "out-of-stock", severity: "critical", message: `${s.partName} is out of stock`, timestamp: new Date().toISOString(), read: false });
      else if (s.quantity < s.minStock) list.push({ id: `n-low-${s.id}`, type: "low-stock", severity: "warning", message: `${s.partName} below minimum (${s.quantity}/${s.minStock})`, timestamp: new Date().toISOString(), read: false });
      if (s.expiryDate && new Date(s.expiryDate).getTime() - now < 1000 * 86400 * 120)
        list.push({ id: `n-exp-${s.id}`, type: "expiry", severity: "warning", message: `${s.partName} expires soon`, timestamp: new Date().toISOString(), read: false });
    }
    for (const i of inspections) {
      if (i.nextDue && new Date(i.nextDue).getTime() < now)
        list.push({ id: `n-ins-${i.id}`, type: "inspection", severity: "warning", message: `Inspection overdue: ${i.spareId}`, timestamp: new Date().toISOString(), read: false });
    }
    for (const r of reorders) {
      if (r.status === "Pending Approval")
        list.push({ id: `n-ro-${r.id}`, type: "reorder", severity: "info", message: `Reorder pending approval: ${r.spareId}`, timestamp: r.createdAt, read: false });
    }
    const covered = new Set<string>();
    for (const s of spares) for (const e of (s.equipmentSupported ?? [])) covered.add(e);
    for (const e of equipment) {
      if (e.criticality === "Critical" && !covered.has(String(e.id)))
        list.push({ id: `n-cov-${e.id}`, type: "coverage", severity: "critical", message: `Critical asset has no spare coverage: ${e.name}`, timestamp: new Date().toISOString(), read: false });
    }
    return list;
  },
};
