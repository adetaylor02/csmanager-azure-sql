import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { apiAuth } from "@/lib/api/resources";
import { setAuthToken, getAuthToken } from "@/lib/api/client";
import type { Role } from "./types";

interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
}

interface AuthSession {
  token: string;
  user: Profile & { roles: Role[] };
}

interface AuthContextValue {
  session: AuthSession | null;
  user: (Profile & { roles: Role[] }) | null;
  profile: Profile | null;
  role: Role;
  roles: Role[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const ROLE_RANK: Record<Role, number> = { Viewer: 0, Technician: 1, Manager: 2, Admin: 3 };
const SESSION_KEY = "csm.session";

function highestRole(rs: Role[]): Role {
  if (!rs.length) return "Viewer";
  return rs.reduce((acc, r) => (ROLE_RANK[r] > ROLE_RANK[acc] ? r : acc), rs[0]);
}

function loadStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthSession; } catch { return null; }
}
function persistSession(s: AuthSession | null) {
  if (typeof window === "undefined") return;
  if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else window.localStorage.removeItem(SESSION_KEY);
  setAuthToken(s?.token ?? null);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = loadStoredSession();
    if (stored && getAuthToken() !== stored.token) setAuthToken(stored.token);
    setSession(stored);
    setLoading(false);
  }, []);

  const apply = useCallback((s: AuthSession | null) => {
    persistSession(s);
    setSession(s);
  }, []);

  const refreshRoles = useCallback(async () => {
    // Roles are issued at login; future improvement: GET /api/auth/me to refresh.
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile: session?.user ?? null,
    role: highestRole(session?.user.roles ?? []),
    roles: session?.user.roles ?? [],
    loading,
    signIn: async (email, password) => {
      const res = await apiAuth.login(email, password);
      apply({ token: res.token, user: { ...res.user, roles: res.user.roles as Role[] } });
    },
    signUp: async (email, password, displayName) => {
      await apiAuth.register(email, password, displayName);
      const res = await apiAuth.login(email, password);
      apply({ token: res.token, user: { ...res.user, roles: res.user.roles as Role[] } });
    },
    signInGoogle: async () => {
      throw new Error("OAuth sign-in is not enabled in this build. Use email + password.");
    },
    signOut: async () => { apply(null); },
    refreshRoles,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

// Permission helpers
export type Action =
  | "spare.create" | "spare.edit" | "spare.delete"
  | "tx.create"
  | "reorder.create" | "reorder.approve"
  | "inspection.create"
  | "users.manage" | "users.delete"
  | "audit.view"
  | "notification.acknowledge"
  | "settings.manage";

const RULES: Record<Action, Role> = {
  "spare.create": "Manager",
  "spare.edit": "Manager",
  "spare.delete": "Admin",
  "tx.create": "Technician",
  "reorder.create": "Technician",
  "reorder.approve": "Manager",
  "inspection.create": "Technician",
  "users.manage": "Admin",
  "users.delete": "Admin",
  "audit.view": "Manager",
  "notification.acknowledge": "Manager",
  "settings.manage": "Admin",
};

export function can(role: Role, action: Action): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[RULES[action]];
}

export function Gate({ action, role, children, fallback = null }: { action: Action; role: Role; children: ReactNode; fallback?: ReactNode }) {
  return can(role, action) ? <>{children}</> : <>{fallback}</>;
}
