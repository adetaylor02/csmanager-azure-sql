import type { Supplier } from "@/lib/types";
import { store, textSearch, refreshCache } from "./_common";
import { apiSuppliers } from "@/lib/api/resources";

export const supplierService = {
  getAll: (): Supplier[] => store().suppliers,
  getById: (id: string) => store().suppliers.find((s) => s.id === id),
  filterBySite: () => store().suppliers, // suppliers are global
  search: (q: string) => textSearch(store().suppliers, q, ["name", "contact", "email"] as never),
  create: async (s: Partial<Supplier>): Promise<Supplier> => {
    const row = await apiSuppliers.create(s as never) as unknown as Supplier;
    await refreshCache("suppliers");
    return row;
  },
  update: async (id: string, p: Partial<Supplier>): Promise<Supplier> => {
    const row = await apiSuppliers.update(id, p as never) as unknown as Supplier;
    await refreshCache("suppliers");
    return row;
  },
  delete: async (id: string): Promise<void> => {
    await apiSuppliers.remove(id);
    await refreshCache("suppliers");
  },
};
