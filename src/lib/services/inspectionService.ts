import type { Inspection, SiteScope } from "@/lib/types";
import { store, scopeBySite, refreshCache } from "./_common";
import { apiInspections } from "@/lib/api/resources";

export const inspectionService = {
  getAll: (): Inspection[] => store().inspections,
  getById: (id: string) => store().inspections.find((i) => i.id === id),
  filterBySite: (site: SiteScope) => scopeBySite(store().inspections, site),
  search: (q: string) => store().inspections.filter((i) => JSON.stringify(i).toLowerCase().includes(q.toLowerCase())),
  // Mutation: still go through the store action so the optimistic spare
  // cascade (lastInspected / condition) stays consistent.
  create: store().addInspection,
  update: async (id: string, p: Partial<Inspection>): Promise<Inspection> => {
    const row = await apiInspections.update(id, p as never) as unknown as Inspection;
    await refreshCache("inspections");
    return row;
  },
  delete: async (id: string): Promise<void> => {
    await apiInspections.remove(id);
    await refreshCache("inspections");
  },
};
