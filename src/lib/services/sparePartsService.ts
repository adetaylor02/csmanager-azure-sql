import type { SparePart, SiteScope } from "@/lib/types";
import { store, scopeBySite, textSearch, refreshCache } from "./_common";
import { apiSpares } from "@/lib/api/resources";

export const sparePartsService = {
  getAll: (): SparePart[] => store().spares,
  getById: (id: string) => store().spares.find((s) => s.id === id),
  filterBySite: (site: SiteScope) => scopeBySite(store().spares, site),
  search: (q: string, site: SiteScope = "All CHI Metro") =>
    textSearch(scopeBySite(store().spares, site), q, [
      "partName", "manufacturer", "modelNumber", "description",
    ]),
  // Mutations delegate to the store actions, which now persist directly to
  // /api/spares and reconcile the cache with the server response.
  create: (input: Omit<SparePart, "id" | "createdAt" | "documents">) => store().addSpare(input),
  update: (id: string, patch: Partial<SparePart>) => store().updateSpare(id, patch),
  delete: (id: string) => store().deleteSpare(id),
  /** Force a re-pull from Azure SQL. */
  refresh: () => refreshCache("spares"),
  /** Direct REST fetch bypassing the cache. */
  fetch: async (): Promise<SparePart[]> => (await apiSpares.list()) as never as SparePart[],
};
