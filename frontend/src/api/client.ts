// Typed MarketPulse API client. KEEP this file when replacing the mock UI.
import { getIdToken } from "../auth/cognito";
import { ApiError } from "./errors";
import { createMockApi } from "./mock/api";
import { USE_MOCKS } from "./mode";
import type {
  History,
  Profile,
  ProfileUpdate,
  SymbolMatch,
  Thresholds,
  WatchItem,
} from "./types";

export { ApiError };

type TokenProvider = () => Promise<string | null>;

export function createClient(baseUrl: string, getToken: TokenProvider) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText);
    return data as T;
  }

  const sym = (s: string) => encodeURIComponent(s.toUpperCase());

  return {
    getMe: () => request<Profile>("GET", "/me"),
    updateMe: (u: ProfileUpdate) => request<Profile>("PUT", "/me", u),
    getWatchlist: () => request<WatchItem[]>("GET", "/watchlist"),
    putWatch: (symbol: string, t: Thresholds) =>
      request<Pick<WatchItem, "symbol" | "upper" | "lower">>("PUT", `/watchlist/${sym(symbol)}`, t),
    deleteWatch: (symbol: string) => request<void>("DELETE", `/watchlist/${sym(symbol)}`),
    searchSymbols: (q: string) =>
      request<SymbolMatch[]>("GET", `/symbols/search?q=${encodeURIComponent(q)}`),
    getHistory: (symbol: string, days = 7) =>
      request<History>("GET", `/symbols/${sym(symbol)}/history?days=${days}`),
    triggerDigest: () => request<{ queued: boolean }>("POST", "/digest/trigger"),
  };
}

export type MarketPulseApi = ReturnType<typeof createClient>;

// Mock mode (see ./mode.ts) swaps in an in-memory implementation of the same interface.
// To drop mocks: delete src/api/mock, drop the USE_MOCKS branches here and in src/auth/cognito.ts, and make this line createClient(...) only.
export const api: MarketPulseApi = USE_MOCKS
  ? createMockApi()
  : createClient(import.meta.env.VITE_API_URL ?? "", getIdToken);
