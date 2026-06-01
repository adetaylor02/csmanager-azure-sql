import type { Notification } from "@/lib/types";
import { apiNotifications } from "@/lib/api/resources";
import { store } from "./_common";

/**
 * Notifications are derived server-side from current Azure SQL state by
 * /api/notifications. The in-store `notifications()` computer is kept as a
 * synchronous fallback for components that prefer the hydrated cache.
 */
export const notificationService = {
  getAll: (): Notification[] => store().notifications(),
  getById: (id: string) => store().notifications().find((n) => n.id === id),
  filterBySite: () => store().notifications(),
  search: (q: string) => store().notifications().filter((n) => n.message.toLowerCase().includes(q.toLowerCase())),
  /** Fetch the live, server-derived notification list. */
  fetch: async (site?: string): Promise<Notification[]> => {
    const rows = await apiNotifications.list(site ? { site } : undefined);
    return rows as never as Notification[];
  },
  create: (_n: Partial<Notification>) => { throw new Error("Notifications are derived from SQL state, not created directly"); },
  update: () => { throw new Error("Not supported"); },
  delete: () => { throw new Error("Not supported"); },
};
