import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../api/client";
import type { SymbolMatch, Thresholds, WatchItem } from "../api/types";
import { errorMessage } from "../lib/format";
import { useToast } from "../ui/toast";

export const MAX_WATCHES = 20;
const POLL_MS = 20_000;
const NAMES_KEY = "mp.names";

interface WatchlistCtx {
  items: WatchItem[] | null;
  error: string | null;
  updatedAt: string | null;
  refresh: () => Promise<void>;
  save: (symbol: string, t: Thresholds) => Promise<void>;
  add: (symbol: string) => Promise<boolean>;
  remove: (symbol: string) => Promise<void>;
  names: Record<string, string>;
  rememberNames: (m: SymbolMatch[]) => void;
  /** Overlays */
  openSearch: () => void;
  openThresholds: (symbol: string) => void;
  searchOpen: boolean;
  editing: string | null;
  closeSearch: () => void;
  closeThresholds: () => void;
}

const Ctx = createContext<WatchlistCtx | null>(null);

function loadNames(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(NAMES_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [items, setItems] = useState<WatchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>(loadNames);
  const [searchOpen, setSearchOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const lookedUp = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      const list = await api.getWatchlist();
      setItems(list);
      setError(null);
      setUpdatedAt(new Date().toISOString());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const rememberNames = useCallback((m: SymbolMatch[]) => {
    setNames((prev) => {
      const next = { ...prev };
      for (const x of m) next[x.symbol] = x.description;
      try {
        localStorage.setItem(NAMES_KEY, JSON.stringify(next));
      } catch {
        /* cache is optional */
      }
      return next;
    });
  }, []);

  // Fill in company names once per symbol, slowly, so the provider is not hammered.
  useEffect(() => {
    if (!items) return;
    const missing = items.map((i) => i.symbol).filter((s) => !names[s] && !lookedUp.current.has(s));
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      for (const s of missing) {
        if (cancelled) return;
        lookedUp.current.add(s);
        try {
          const hits = await api.searchSymbols(s);
          const exact = hits.find((h) => h.symbol === s);
          if (exact) rememberNames([exact]);
        } catch {
          /* names are decoration only */
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items, names, rememberNames]);

  const save = useCallback(
    async (symbol: string, t: Thresholds) => {
      await api.putWatch(symbol, t);
      await refresh();
    },
    [refresh],
  );

  const add = useCallback(
    async (symbol: string) => {
      try {
        await api.putWatch(symbol, {});
        await refresh();
        toast.show("success", `${symbol} added to your watchlist`, {
          label: "Set alerts",
          run: () => setEditing(symbol),
        });
        return true;
      } catch (e) {
        toast.error(e);
        return false;
      }
    },
    [refresh, toast],
  );

  const remove = useCallback(
    async (symbol: string) => {
      const snapshot = items;
      const item = items?.find((i) => i.symbol === symbol);
      setItems((list) => list?.filter((i) => i.symbol !== symbol) ?? null);
      try {
        await api.deleteWatch(symbol);
        toast.show("info", `${symbol} removed`, {
          label: "Undo",
          run: async () => {
            try {
              await api.putWatch(symbol, { upper: item?.upper ?? null, lower: item?.lower ?? null });
              await refresh();
            } catch (e) {
              toast.error(e);
            }
          },
        });
      } catch (e) {
        setItems(snapshot);
        toast.error(e);
      }
    },
    [items, refresh, toast],
  );

  const value = useMemo<WatchlistCtx>(
    () => ({
      items,
      error,
      updatedAt,
      refresh,
      save,
      add,
      remove,
      names,
      rememberNames,
      openSearch: () => setSearchOpen(true),
      openThresholds: (s) => setEditing(s),
      searchOpen,
      editing,
      closeSearch: () => setSearchOpen(false),
      closeThresholds: () => setEditing(null),
    }),
    [items, error, updatedAt, refresh, save, add, remove, names, rememberNames, searchOpen, editing],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWatchlist() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWatchlist outside WatchlistProvider");
  return c;
}
