import { useMemo } from "react";
import { create } from "zustand";
import {
  apiSpares, apiEquipment, apiSuppliers, apiLocations, apiTransactions,
  apiReorders, apiInspections, apiAuditLogs, apiInventoryMovements, apiSparesBulk,
} from "@/lib/api/resources";
import { isMockDisabledByBuild } from "@/lib/api/mockBackend";

import type {
  SparePart,
  EquipmentAsset,
  InventoryTransaction,
  ReorderRequest,
  Inspection,
  Supplier,
  Location,
  AuditLog,
  Notification,
  Role,
  ReorderStatus,
  Condition,
  Site,
  SiteScope,
} from "./types";
import {
  spareParts as seedSpares,
  equipment as seedEquipment,
  inventoryTransactions as seedTx,
  reorderRequests as seedReorders,
  inspections as seedInspections,
  suppliers as seedSuppliers,
  locations as seedLocations,
  auditLogs as seedAudit,
} from "./sample-data";

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

interface PersistedState {
  spares: SparePart[];
  equipment: EquipmentAsset[];
  transactions: InventoryTransaction[];
  reorders: ReorderRequest[];
  inspections: Inspection[];
  suppliers: Supplier[];
  locations: Location[];
  auditLogs: AuditLog[];
}

interface AppState extends PersistedState {
  role: Role;
  setRole: (r: Role) => void;
  currentUser: string;
  setCurrentUser: (u: string) => void;

  selectedSite: SiteScope;
  setSelectedSite: (s: SiteScope) => void;

  dismissedNotifications: string[];
  dismissNotification: (id: string) => void;
  dismissAllNotifications: (ids: string[]) => void;
  restoreNotifications: () => void;

  hydrated: boolean;
  hydrate: () => Promise<void>;

  addSpare: (s: Omit<SparePart, "id" | "createdAt" | "documents">) => SparePart;
  updateSpare: (id: string, patch: Partial<SparePart>) => void;
  deleteSpare: (id: string) => void;
  duplicateSpare: (id: string) => void;

  bulkImportSpares: (rows: Omit<SparePart, "id" | "createdAt" | "documents">[], mode: "skip" | "update" | "new") => { batchId: string; imported: number; updated: number; skipped: number };

  checkOut: (input: { spareId: string; quantity: number; technician: string; workOrder?: string; assetId?: string; reason?: string }) => void;
  checkIn: (input: { spareId: string; quantity: number; technician: string; condition: Condition; toLocation: string; reason?: string }) => void;
  transfer: (input: { spareId: string; quantity: number; technician: string; fromLocation: string; toLocation: string }) => void;

  addReorder: (r: Omit<ReorderRequest, "id" | "createdAt" | "status"> & { status?: ReorderStatus }) => void;
  setReorderStatus: (id: string, status: ReorderStatus) => void;

  addInspection: (i: Omit<Inspection, "id">) => void;

  notifications: () => Notification[];
  resetToSampleData: () => Promise<void>;
}

const log = (logs: AuditLog[], entry: Omit<AuditLog, "id" | "timestamp">): AuditLog[] => [
  { ...entry, id: uid("al"), timestamp: new Date().toISOString() },
  ...logs,
];

const PERSIST_KEYS: (keyof PersistedState)[] = [
  "spares",
  "equipment",
  "transactions",
  "reorders",
  "inspections",
  "suppliers",
  "locations",
  "auditLogs",
];

const seedState: PersistedState = {
  spares: seedSpares,
  equipment: seedEquipment,
  transactions: seedTx,
  reorders: seedReorders,
  inspections: seedInspections,
  suppliers: seedSuppliers,
  locations: seedLocations,
  auditLogs: seedAudit,
};

// Legacy bulk-seed helper. With the per-resource REST migration each store
// mutation now persists itself through apiX directly, so this is reserved for
// resetToSampleData() / first-time seeding only.
async function seedAllResources(data: PersistedState) {
  await Promise.allSettled([
    ...data.spares.map((s) => apiSpares.update(s.id, s as never).catch(() => apiSpares.create(s as never))),
    ...data.equipment.map((e) => apiEquipment.update(e.id, e as never).catch(() => apiEquipment.create(e as never))),
    ...data.suppliers.map((s) => apiSuppliers.update(s.id, s as never).catch(() => apiSuppliers.create(s as never))),
    ...data.locations.map((l) => apiLocations.update(l.id, l as never).catch(() => apiLocations.create(l as never))),
  ]);
}

function warn(scope: string, err: unknown) {
  // eslint-disable-next-line no-console
  console.error(`[csm:${scope}]`, err);
}


const SITE_KEY = "csm.selectedSite";
const loadSite = (): SiteScope => {
  if (typeof window === "undefined") return "All CHI Metro";
  const v = window.localStorage.getItem(SITE_KEY);
  return (v as SiteScope) || "All CHI Metro";
};

const DISMISSED_KEY = "csm.dismissedNotifications";
const loadDismissed = (): string[] => {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(DISMISSED_KEY) || "[]"); } catch { return []; }
};
const saveDismissed = (ids: string[]) => {
  if (typeof window !== "undefined") window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
};

export const useApp = create<AppState>((set, get) => ({
  role: "Viewer",
  setRole: (r) => set({ role: r }),
  currentUser: "User",
  setCurrentUser: (u) => set({ currentUser: u }),

  selectedSite: loadSite(),
  setSelectedSite: (s) => {
    if (typeof window !== "undefined") window.localStorage.setItem(SITE_KEY, s);
    set({ selectedSite: s });
  },

  dismissedNotifications: loadDismissed(),
  dismissNotification: (id: string) => {
    const next = Array.from(new Set([...(get().dismissedNotifications ?? []), id]));
    saveDismissed(next);
    set({ dismissedNotifications: next });
  },
  dismissAllNotifications: (ids: string[]) => {
    const next = Array.from(new Set([...(get().dismissedNotifications ?? []), ...ids]));
    saveDismissed(next);
    set({ dismissedNotifications: next });
  },
  restoreNotifications: () => {
    saveDismissed([]);
    set({ dismissedNotifications: [] });
  },

  hydrated: false,

  spares: [],
  equipment: [],
  transactions: [],
  reorders: [],
  inspections: [],
  suppliers: [],
  locations: [],
  auditLogs: [],

  hydrate: async () => {
    if (get().hydrated) return;
    const allow = !isMockDisabledByBuild();
    try {
      const [spares, equipment, suppliers, locations, transactions, reorders, inspections, auditLogs] = await Promise.all([
        apiSpares.list(),
        apiEquipment.list(),
        apiSuppliers.list(),
        apiLocations.list(),
        apiTransactions.list(),
        apiReorders.list(),
        apiInspections.list(),
        apiAuditLogs.list(),
      ]);
      const next: PersistedState = {
        spares: (spares as never) ?? [],
        equipment: (equipment as never) ?? [],
        suppliers: (suppliers as never) ?? [],
        locations: (locations as never) ?? [],
        transactions: (transactions as never) ?? [],
        reorders: (reorders as never) ?? [],
        inspections: (inspections as never) ?? [],
        auditLogs: (auditLogs as never) ?? [],
      };
      const empty = PERSIST_KEYS.every((k) => (next[k] as unknown[]).length === 0);
      // Only seed sample data automatically when mock fallback is allowed
      // (preview/dev). Production never silently seeds from the bundle.
      if (empty && allow) {
        set({ ...seedState, hydrated: true });
        await seedAllResources(seedState);
      } else {
        set({ ...next, hydrated: true });
      }
    } catch (e) {
      warn("hydrate", e);
      if (allow) set({ ...seedState, hydrated: true });
      else set({ hydrated: true });
    }
  },

  resetToSampleData: async () => {
    set({ ...seedState });
    await seedAllResources(seedState);
  },

  // ---------- spares ----------
  addSpare: (s) => {
    const sp: SparePart = { ...s, id: uid("sp"), createdAt: new Date().toISOString(), documents: [] };
    set((st) => ({
      spares: [sp, ...st.spares],
      auditLogs: log(st.auditLogs, { action: "Created spare", entity: "spare", entityId: sp.id, user: st.currentUser, details: sp.partName }),
    }));
    apiSpares.create(sp as never)
      .then((row) => row && set((st) => ({ spares: st.spares.map((x) => (x.id === sp.id ? (row as never) : x)) })))
      .catch((e) => warn("addSpare", e));
    return sp;
  },
  updateSpare: (id, patch) => {
    set((st) => ({
      spares: st.spares.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      auditLogs: log(st.auditLogs, { action: "Edited spare", entity: "spare", entityId: id, user: st.currentUser }),
    }));
    apiSpares.update(id, patch as never).catch((e) => warn("updateSpare", e));
  },
  deleteSpare: (id) => {
    set((st) => ({
      spares: st.spares.filter((s) => s.id !== id),
      auditLogs: log(st.auditLogs, { action: "Deleted spare", entity: "spare", entityId: id, user: st.currentUser }),
    }));
    apiSpares.remove(id).catch((e) => warn("deleteSpare", e));
  },
  duplicateSpare: (id) => {
    const orig = get().spares.find((s) => s.id === id);
    if (!orig) return;
    const copy: SparePart = { ...orig, id: uid("sp"), partName: `${orig.partName} (Copy)`, createdAt: new Date().toISOString() };
    set((st) => ({
      spares: [copy, ...st.spares],
      auditLogs: log(st.auditLogs, { action: "Duplicated spare", entity: "spare", entityId: copy.id, user: st.currentUser }),
    }));
    apiSpares.create(copy as never)
      .then((row) => row && set((st) => ({ spares: st.spares.map((x) => (x.id === copy.id ? (row as never) : x)) })))
      .catch((e) => warn("duplicateSpare", e));
  },

  bulkImportSpares: (rows, mode) => {
    // Compute optimistic outcome locally so the UI gets immediate feedback,
    // then push the same payload to /api/spares/bulk-import for persistence.
    const batchId = `IMP-${Date.now().toString(36).toUpperCase()}`;
    let imported = 0, updated = 0, skipped = 0;
    const st = get();
    const newSpares = [...st.spares];
    const auditAdd: AuditLog[] = [];
    const now = new Date().toISOString();
    for (const r of rows) {
      const dupIdx = newSpares.findIndex(
        (s) =>
          s.site === r.site &&
          s.partName.toLowerCase() === r.partName.toLowerCase() &&
          s.modelNumber.toLowerCase() === (r.modelNumber || "").toLowerCase() &&
          (s.serialNumber || "").toLowerCase() === (r.serialNumber || "").toLowerCase(),
      );
      if (dupIdx >= 0) {
        if (mode === "skip") { skipped++; continue; }
        if (mode === "update") {
          newSpares[dupIdx] = { ...newSpares[dupIdx], ...r };
          updated++;
          auditAdd.push({ id: uid("al"), site: r.site, action: `Import ${batchId} · updated spare`, entity: "spare", entityId: newSpares[dupIdx].id, user: st.currentUser, details: r.partName, timestamp: now });
          continue;
        }
      }
      const sp: SparePart = { ...r, id: uid("sp"), createdAt: now, documents: [] };
      newSpares.unshift(sp);
      imported++;
      auditAdd.push({ id: uid("al"), site: r.site, action: `Import ${batchId} · created spare`, entity: "spare", entityId: sp.id, user: st.currentUser, details: r.partName, timestamp: now });
    }
    auditAdd.unshift({ id: uid("al"), action: `Bulk import ${batchId}`, entity: "import", entityId: batchId, user: st.currentUser, details: `${imported} created, ${updated} updated, ${skipped} skipped`, timestamp: now });
    set({ spares: newSpares, auditLogs: [...auditAdd, ...st.auditLogs] });
    apiSparesBulk.import(rows as never, mode)
      .then(() => apiSpares.list())
      .then((server) => server && set({ spares: server as never }))
      .catch((e) => warn("bulkImportSpares", e));
    return { batchId, imported, updated, skipped };
  },

  // ---------- inventory movements ----------
  checkOut: ({ spareId, quantity, technician, workOrder, assetId, reason }) => {
    const ts = new Date().toISOString();
    const tx: InventoryTransaction = { id: uid("tx"), type: "check-out", spareId, quantity, technician, workOrder, assetId, reason, timestamp: ts };
    set((st) => ({
      spares: st.spares.map((s) => (s.id === spareId ? { ...s, quantity: Math.max(0, s.quantity - quantity), lastUsed: ts } : s)),
      transactions: [tx, ...st.transactions],
      auditLogs: log(st.auditLogs, { action: "Checked out spare", entity: "spare", entityId: spareId, user: technician, details: `Qty ${quantity}${workOrder ? ` · ${workOrder}` : ""}` }),
    }));
    apiInventoryMovements.checkOut({ spareId, quantity, technician, workOrder, assetId, reason })
      .catch((e) => warn("checkOut", e));
  },

  checkIn: ({ spareId, quantity, technician, condition, toLocation, reason }) => {
    const ts = new Date().toISOString();
    const tx: InventoryTransaction = { id: uid("tx"), type: "check-in", spareId, quantity, technician, condition, toLocation, reason, timestamp: ts };
    set((st) => ({
      spares: st.spares.map((s) => (s.id === spareId ? { ...s, quantity: s.quantity + quantity, condition, location: toLocation } : s)),
      transactions: [tx, ...st.transactions],
      auditLogs: log(st.auditLogs, { action: "Checked in spare", entity: "spare", entityId: spareId, user: technician, details: `Qty ${quantity} · ${condition}` }),
    }));
    apiInventoryMovements.checkIn({ spareId, quantity, technician, condition, toLocation, reason })
      .catch((e) => warn("checkIn", e));
  },

  transfer: ({ spareId, quantity, technician, fromLocation, toLocation }) => {
    const ts = new Date().toISOString();
    const tx: InventoryTransaction = { id: uid("tx"), type: "transfer", spareId, quantity, technician, fromLocation, toLocation, timestamp: ts };
    set((st) => ({
      spares: st.spares.map((s) => (s.id === spareId ? { ...s, location: toLocation } : s)),
      transactions: [tx, ...st.transactions],
      auditLogs: log(st.auditLogs, { action: "Transferred spare", entity: "spare", entityId: spareId, user: technician, details: `${fromLocation} → ${toLocation}` }),
    }));
    apiInventoryMovements.transfer({ spareId, quantity, technician, fromLocation, toLocation })
      .catch((e) => warn("transfer", e));
  },

  // ---------- reorders ----------
  addReorder: (r) => {
    const ro: ReorderRequest = { ...r, id: uid("ro"), createdAt: new Date().toISOString(), status: r.status ?? "Pending Approval" };
    set((st) => ({
      reorders: [ro, ...st.reorders],
      auditLogs: log(st.auditLogs, { action: "Requested reorder", entity: "reorder", entityId: ro.id, user: r.requestedBy, details: `Qty ${r.quantity}` }),
    }));
    apiReorders.create(ro as never)
      .then((row) => row && set((st) => ({ reorders: st.reorders.map((x) => (x.id === ro.id ? (row as never) : x)) })))
      .catch((e) => warn("addReorder", e));
  },

  setReorderStatus: (id, status) => {
    set((st) => ({
      reorders: st.reorders.map((r) => (r.id === id ? { ...r, status } : r)),
      auditLogs: log(st.auditLogs, { action: `Reorder → ${status}`, entity: "reorder", entityId: id, user: st.currentUser }),
    }));
    apiReorders.update(id, { status } as never).catch((e) => warn("setReorderStatus", e));
  },

  // ---------- inspections ----------
  addInspection: (i) => {
    const ins: Inspection = { ...i, id: uid("in") };
    set((st) => ({
      inspections: [ins, ...st.inspections],
      spares: st.spares.map((s) => (s.id === i.spareId ? { ...s, lastInspected: i.inspectionDate, condition: i.condition } : s)),
      auditLogs: log(st.auditLogs, { action: "Completed inspection", entity: "inspection", entityId: ins.id, user: i.inspector, details: i.status }),
    }));
    apiInspections.create(ins as never)
      .then((row) => row && set((st) => ({ inspections: st.inspections.map((x) => (x.id === ins.id ? (row as never) : x)) })))
      .catch((e) => warn("addInspection", e));
    // Persist the cascaded spare update too.
    apiSpares.update(i.spareId, { lastInspected: i.inspectionDate, condition: i.condition } as never)
      .catch((e) => warn("addInspection.spare", e));
  },


  notifications: () => {
    const st = get();
    const list: Notification[] = [];
    const now = Date.now();
    st.spares.forEach((s) => {
      if (s.quantity === 0) list.push({ id: `n-oos-${s.id}`, type: "out-of-stock", message: `${s.partName} is out of stock`, severity: "critical", timestamp: new Date().toISOString(), read: false });
      else if (s.quantity < s.minStock) list.push({ id: `n-low-${s.id}`, type: "low-stock", message: `${s.partName} below minimum (${s.quantity}/${s.minStock})`, severity: "warning", timestamp: new Date().toISOString(), read: false });
      if (s.expiryDate && new Date(s.expiryDate).getTime() - now < 1000 * 86400 * 120) {
        list.push({ id: `n-exp-${s.id}`, type: "expiry", message: `${s.partName} expires soon`, severity: "warning", timestamp: new Date().toISOString(), read: false });
      }
    });
    st.inspections.forEach((i) => {
      if (new Date(i.nextDue).getTime() < now) {
        const sp = st.spares.find((s) => s.id === i.spareId);
        list.push({ id: `n-ins-${i.id}`, type: "inspection", message: `Inspection overdue: ${sp?.partName ?? i.spareId}`, severity: "warning", timestamp: new Date().toISOString(), read: false });
      }
    });
    st.reorders.forEach((r) => {
      if (r.status === "Pending Approval") {
        const sp = st.spares.find((s) => s.id === r.spareId);
        list.push({ id: `n-ro-${r.id}`, type: "reorder", message: `Reorder pending approval: ${sp?.partName ?? r.spareId}`, severity: "info", timestamp: r.createdAt, read: false });
      }
    });
    st.equipment.forEach((e) => {
      if (e.criticality === "Critical") {
        const covered = st.spares.some((s) => s.equipmentSupported.includes(e.id));
        if (!covered) list.push({ id: `n-cov-${e.id}`, type: "coverage", message: `Critical asset has no spare coverage: ${e.name}`, severity: "critical", timestamp: new Date().toISOString(), read: false });
      }
    });
    return list;
  },
}));

// Memoized hook to safely consume computed notifications without causing
// infinite render loops (the selector approach returns a new array each call).
export function useNotifications(): Notification[] {
  const spares = useApp((s) => s.spares);
  const inspections = useApp((s) => s.inspections);
  const reorders = useApp((s) => s.reorders);
  const equipment = useApp((s) => s.equipment);
  const dismissed = useApp((s) => s.dismissedNotifications);
  return useMemo(() => {
    const list: Notification[] = [];
    const now = Date.now();
    spares.forEach((s) => {
      if (s.quantity === 0) list.push({ id: `n-oos-${s.id}`, type: "out-of-stock", message: `${s.partName} is out of stock`, severity: "critical", timestamp: new Date().toISOString(), read: false });
      else if (s.quantity < s.minStock) list.push({ id: `n-low-${s.id}`, type: "low-stock", message: `${s.partName} below minimum (${s.quantity}/${s.minStock})`, severity: "warning", timestamp: new Date().toISOString(), read: false });
      if (s.expiryDate && new Date(s.expiryDate).getTime() - now < 1000 * 86400 * 120) {
        list.push({ id: `n-exp-${s.id}`, type: "expiry", message: `${s.partName} expires soon`, severity: "warning", timestamp: new Date().toISOString(), read: false });
      }
    });
    inspections.forEach((i) => {
      if (new Date(i.nextDue).getTime() < now) {
        const sp = spares.find((s) => s.id === i.spareId);
        list.push({ id: `n-ins-${i.id}`, type: "inspection", message: `Inspection overdue: ${sp?.partName ?? i.spareId}`, severity: "warning", timestamp: new Date().toISOString(), read: false });
      }
    });
    reorders.forEach((r) => {
      if (r.status === "Pending Approval") {
        const sp = spares.find((s) => s.id === r.spareId);
        list.push({ id: `n-ro-${r.id}`, type: "reorder", message: `Reorder pending approval: ${sp?.partName ?? r.spareId}`, severity: "info", timestamp: r.createdAt, read: false });
      }
    });
    equipment.forEach((e) => {
      if (e.criticality === "Critical") {
        const covered = spares.some((s) => s.equipmentSupported.includes(e.id));
        if (!covered) list.push({ id: `n-cov-${e.id}`, type: "coverage", message: `Critical asset has no spare coverage: ${e.name}`, severity: "critical", timestamp: new Date().toISOString(), read: false });
      }
    });
    const dset = new Set(dismissed);
    return list.filter((n) => !dset.has(n.id));
  }, [spares, inspections, reorders, equipment, dismissed]);
}

// Site-scoped data hooks. Pass an item's `site` (or undefined for "ungated" items
// such as legacy transactions) and they will be filtered by the global site selector.
function filterBySite<T extends { site?: Site }>(items: T[], scope: SiteScope): T[] {
  if (scope === "All CHI Metro") return items;
  return items.filter((i) => !i.site || i.site === scope);
}

export function useScopedSpares() {
  const spares = useApp((s) => s.spares);
  const scope = useApp((s) => s.selectedSite);
  return useMemo(() => filterBySite(spares, scope), [spares, scope]);
}
export function useScopedEquipment() {
  const equipment = useApp((s) => s.equipment);
  const scope = useApp((s) => s.selectedSite);
  return useMemo(() => filterBySite(equipment, scope), [equipment, scope]);
}
export function useScopedTransactions() {
  const tx = useApp((s) => s.transactions);
  const scope = useApp((s) => s.selectedSite);
  return useMemo(() => filterBySite(tx, scope), [tx, scope]);
}
export function useScopedReorders() {
  const r = useApp((s) => s.reorders);
  const scope = useApp((s) => s.selectedSite);
  return useMemo(() => filterBySite(r, scope), [r, scope]);
}
export function useScopedInspections() {
  const i = useApp((s) => s.inspections);
  const scope = useApp((s) => s.selectedSite);
  return useMemo(() => filterBySite(i, scope), [i, scope]);
}
export function useScopedLocations() {
  const l = useApp((s) => s.locations);
  const scope = useApp((s) => s.selectedSite);
  return useMemo(() => filterBySite(l, scope), [l, scope]);
}
export function useScopedAuditLogs() {
  const a = useApp((s) => s.auditLogs);
  const scope = useApp((s) => s.selectedSite);
  return useMemo(() => filterBySite(a, scope), [a, scope]);
}


