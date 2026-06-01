import type { AuditLog, SiteScope } from "@/lib/types";
import { store, scopeBySite, refreshCache } from "./_common";
import { apiAuditLogs } from "@/lib/api/resources";

export const auditLogService = {
  getAll: (): AuditLog[] => store().auditLogs,
  getById: (id: string) => store().auditLogs.find((a) => a.id === id),
  filterBySite: (site: SiteScope) => scopeBySite(store().auditLogs, site),
  search: (q: string) => store().auditLogs.filter((a) => JSON.stringify(a).toLowerCase().includes(q.toLowerCase())),
  /** Force a re-pull from Azure SQL (server-side audit logs are append-only). */
  refresh: () => refreshCache("auditLogs"),
  /** Fetch directly from the REST endpoint without touching the cache. */
  fetch: async (): Promise<AuditLog[]> => (await apiAuditLogs.list()) as never as AuditLog[],
  create: (_a: Partial<AuditLog>) => { throw new Error("Audit logs are written server-side by the API"); },
  update: () => { throw new Error("Audit logs are immutable"); },
  delete: () => { throw new Error("Audit logs are immutable"); },
};
