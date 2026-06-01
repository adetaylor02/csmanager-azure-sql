/**
 * Reports service — server-side aggregation over Azure SQL via
 * /api/dashboard/metrics. The synchronous helpers compute on the
 * hydrated cache (already populated from REST) for legacy callers.
 */
import type { SiteScope } from "@/lib/types";
import { store, scopeBySite } from "./_common";
import { apiDashboard, apiReports } from "@/lib/api/resources";

export const reportsService = {
  /** Server-side metrics — preferred path for dashboards. */
  metrics: (site?: string) => apiDashboard.metrics(site),

  stockSummary: (site: SiteScope = "All CHI Metro") => {
    const spares = scopeBySite(store().spares, site);
    return {
      total: spares.length,
      low: spares.filter((s) => s.quantity > 0 && s.quantity < s.minStock).length,
      outOfStock: spares.filter((s) => s.quantity === 0).length,
      valueUSD: spares.reduce((sum, s) => sum + (s.unitCost ?? 0) * s.quantity, 0),
    };
  },

  consumptionByMonth: (site: SiteScope = "All CHI Metro", months = 12) => {
    const tx = scopeBySite(store().transactions, site).filter((t) => t.type === "check-out");
    const buckets: Record<string, number> = {};
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets[d.toISOString().slice(0, 7)] = 0;
    }
    tx.forEach((t) => {
      const key = new Date(t.timestamp).toISOString().slice(0, 7);
      if (key in buckets) buckets[key] += t.quantity;
    });
    return Object.entries(buckets).map(([month, qty]) => ({ month, qty }));
  },

  criticalCoverageGap: (site: SiteScope = "All CHI Metro") => {
    const equipment = scopeBySite(store().equipment, site).filter((e) => e.criticality === "Critical");
    const spares = scopeBySite(store().spares, site);
    return equipment.filter((e) => !spares.some((s) => s.equipmentSupported.includes(e.id)));
  },

  /** Persist a saved-report definition through the REST API. */
  save: (view: "spares" | "transactions" | "reorders" | "inspections", params: Record<string, unknown> = {}) =>
    apiReports.create({ view, params, createdAt: new Date().toISOString() } as never),

  /** Trigger a server-side export to CSV/Parquet for Power BI dataflows. */
  exportForPowerBi: (view: "spares" | "transactions" | "reorders" | "inspections") =>
    fetch(`/api/reports?view=${view}`, { method: "POST" }),
};
