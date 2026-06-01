import type { ReorderRequest, ReorderStatus, SiteScope } from "@/lib/types";
import { store, scopeBySite, refreshCache } from "./_common";
import { apiReorders } from "@/lib/api/resources";

export const reorderService = {
  getAll: (): ReorderRequest[] => store().reorders,
  getById: (id: string) => store().reorders.find((r) => r.id === id),
  filterBySite: (site: SiteScope) => scopeBySite(store().reorders, site),
  search: (q: string) => store().reorders.filter((r) => JSON.stringify(r).toLowerCase().includes(q.toLowerCase())),
  // Create + setStatus delegate to the store actions, which now persist via
  // /api/reorders directly and refresh the cache with the server's row.
  create: store().addReorder,
  update: (id: string, patch: Partial<ReorderRequest>) => {
    if (patch.status) store().setReorderStatus(id, patch.status as ReorderStatus);
  },
  setStatus: (id: string, status: ReorderStatus) => store().setReorderStatus(id, status),
  delete: async (id: string): Promise<void> => {
    await apiReorders.remove(id);
    await refreshCache("reorders");
  },
};
