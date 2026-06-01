import { apiUsers, apiRoles, mockBridge } from "@/lib/api/resources";
import { api } from "@/lib/api/client";
import type { Role } from "@/lib/types";

/**
 * User & role management — backed by Azure SQL via /api/user-roles. Falls
 * back to a localStorage mock when the API is unavailable (Lovable preview).
 */
type UserRoleRow = { id?: string; user_id: string; role: Role };

async function tryReal<T>(fn: () => Promise<T>, mock: () => T): Promise<T> {
  if (mockBridge.isMockEnabled()) return mock();
  try { return await fn(); }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("Failed to fetch") || msg.includes("Unexpected token") ||
      msg.includes("not valid JSON")  || msg.startsWith("HTTP 404") ||
      msg.startsWith("HTTP 405")      || msg === "Not Found"
    ) return mock();
    throw err;
  }
}

export const userRoleService = {
  async getAll(): Promise<UserRoleRow[]> {
    return tryReal(
      () => api.get<UserRoleRow[]>("/user-roles"),
      () => mockBridge.getAllRoles(),
    );
  },
  async getById(userId: string): Promise<Role[]> {
    const rows = await this.getAll();
    return rows.filter((r) => r.user_id === userId).map((r) => r.role);
  },
  async create(userId: string, role: Role) {
    await tryReal(
      () => api.post("/user-roles", { user_id: userId, role }),
      () => mockBridge.setRole(userId, role),
    );
  },
  async update(userId: string, role: Role) {
    await tryReal(
      async () => {
        await api.delete(`/user-roles/by-user/${encodeURIComponent(userId)}`);
        await api.post("/user-roles", { user_id: userId, role });
      },
      () => mockBridge.setRole(userId, role),
    );
  },
  async delete(userId: string, role: Role) {
    await tryReal(
      () => api.delete(`/user-roles?user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`),
      () => { /* role replaced via setRole; no-op for mock */ void role; void userId; },
    );
  },
  search: async (_q: string) => { throw new Error("Not implemented"); },
  filterBySite: async () => { throw new Error("Roles are tenant-wide; site scoping handled in app logic"); },

  apiUsers,
  apiRoles,
};

export const ENTRA_GROUP_TO_ROLE: Record<string, Role> = {
  CriticalSpares_Admins: "Admin",
  CriticalSpares_Managers: "Manager",
  CriticalSpares_Technicians: "Technician",
  CriticalSpares_Viewers: "Viewer",
};
