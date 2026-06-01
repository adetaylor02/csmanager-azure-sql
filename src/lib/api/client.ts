/**
 * Thin fetch wrapper for the Azure Functions REST API.
 *
 * - Base URL defaults to `/api`, matching Azure Static Web Apps' integrated
 *   Functions routing. Override with `VITE_API_BASE_URL` for local dev against
 *   a standalone Functions host (e.g. `http://localhost:7071/api`).
 * - Attaches the bearer token from localStorage if present (`csm.token`).
 * - Throws on non-2xx responses with the server's error message.
 */
const BASE: string =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE_URL) ||
  "/api";

const TOKEN_KEY = "csm.token";

export function setAuthToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const msg = (data && typeof data === "object" && "error" in data) ? (data as any).error : res.statusText;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  get:    <T = unknown>(path: string) => request<T>(path),
  post:   <T = unknown>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body == null ? undefined : JSON.stringify(body) }),
  put:    <T = unknown>(path: string, body?: unknown) => request<T>(path, { method: "PUT",  body: body == null ? undefined : JSON.stringify(body) }),
  patch:  <T = unknown>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body == null ? undefined : JSON.stringify(body) }),
  delete: <T = unknown>(path: string) => request<T>(path, { method: "DELETE" }),
};
