import type { EquipmentAsset, SiteScope } from "@/lib/types";
import { store, scopeBySite, textSearch, refreshCache } from "./_common";
import { apiEquipment } from "@/lib/api/resources";

export const equipmentService = {
  getAll: (): EquipmentAsset[] => store().equipment,
  getById: (id: string) => store().equipment.find((e) => e.id === id),
  filterBySite: (site: SiteScope) => scopeBySite(store().equipment, site),
  search: (q: string, site: SiteScope = "All CHI Metro") =>
    textSearch(scopeBySite(store().equipment, site), q, ["name", "tag", "manufacturer", "model"] as never),
  create: async (e: Partial<EquipmentAsset>): Promise<EquipmentAsset> => {
    const row = await apiEquipment.create(e as never) as unknown as EquipmentAsset;
    await refreshCache("equipment");
    return row;
  },
  update: async (id: string, p: Partial<EquipmentAsset>): Promise<EquipmentAsset> => {
    const row = await apiEquipment.update(id, p as never) as unknown as EquipmentAsset;
    await refreshCache("equipment");
    return row;
  },
  delete: async (id: string): Promise<void> => {
    await apiEquipment.remove(id);
    await refreshCache("equipment");
  },
};
