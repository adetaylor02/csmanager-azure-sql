import { useApp } from "@/lib/store";
import type { Site, SiteScope } from "@/lib/types";
import {
  apiSpares, apiEquipment, apiSuppliers, apiLocations,
  apiTransactions, apiReorders, apiInspections, apiAuditLogs,
} from "@/lib/api/resources";

/**
 * Snapshot of the hydrated cache. The store is hydrated from REST in
 * `useApp.hydrate()` and refreshed by the service mutations below; reading
 * from it gives synchronous components a consistent view of Azure SQL data
 * without each caller having to await a request.
 */
export const store = () => useApp.getState();

/** Apply site scoping consistently across services. */
export function scopeBySite<T extends { site?: Site }>(rows: T[], site: SiteScope): T[] {
  if (site === "All CHI Metro") return rows;
  return rows.filter((r) => r.site === site);
}

/** Naive in-memory search across stringifiable fields. */
export function textSearch<T>(rows: T[], q: string, fields: (keyof T)[]): T[] {
  if (!q) return rows;
  const needle = q.toLowerCase();
  return rows.filter((r) =>
    fields.some((f) => String(r[f] ?? "").toLowerCase().includes(needle)),
  );
}

type CacheKey =
  | "spares" | "equipment" | "suppliers" | "locations"
  | "transactions" | "reorders" | "inspections" | "auditLogs";

const REFRESHERS: Record<CacheKey, () => Promise<unknown[]>> = {
  spares:       () => apiSpares.list(),
  equipment:    () => apiEquipment.list(),
  suppliers:    () => apiSuppliers.list(),
  locations:    () => apiLocations.list(),
  transactions: () => apiTransactions.list(),
  reorders:     () => apiReorders.list(),
  inspections:  () => apiInspections.list(),
  auditLogs:    () => apiAuditLogs.list(),
};

/**
 * Pull a single resource from the REST API and replace its slice of the
 * store cache. Used by service mutations so reads after a write reflect
 * what Azure SQL accepted.
 */
export async function refreshCache(key: CacheKey): Promise<void> {
  try {
    const rows = await REFRESHERS[key]();
    useApp.setState({ [key]: rows } as never);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[csm:refresh:${key}]`, err);
  }
}
