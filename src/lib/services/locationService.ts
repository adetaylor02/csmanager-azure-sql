import type { Location, SiteScope } from "@/lib/types";
import { store, scopeBySite, textSearch, refreshCache } from "./_common";
import { apiLocations } from "@/lib/api/resources";

export const locationService = {
  getAll: (): Location[] => store().locations,
  getById: (id: string) => store().locations.find((l) => l.id === id),
  filterBySite: (site: SiteScope) => scopeBySite(store().locations, site),
  search: (q: string, site: SiteScope = "All CHI Metro") =>
    textSearch(scopeBySite(store().locations, site), q, ["name", "building", "room"] as never),
  create: async (l: Partial<Location>): Promise<Location> => {
    const row = await apiLocations.create(l as never) as unknown as Location;
    await refreshCache("locations");
    return row;
  },
  update: async (id: string, p: Partial<Location>): Promise<Location> => {
    const row = await apiLocations.update(id, p as never) as unknown as Location;
    await refreshCache("locations");
    return row;
  },
  delete: async (id: string): Promise<void> => {
    await apiLocations.remove(id);
    await refreshCache("locations");
  },
};
