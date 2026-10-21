// MOCK API. In-memory implementation of MarketPulseApi for demos without a backend.
import type { MarketPulseApi } from "../client";
import { ApiError } from "../errors";
import type { AlertSide, AlertState, History, PricePoint, Profile, WatchItem } from "../types";
import { mockSession } from "./auth";
import { SEED_WATCHLIST, UNIVERSE, baseFor, buildSentiment, buildSeries, rng, round } from "./data";

const MAX_WATCHES = 20;
const SYMBOL_RE = /^[A-Za-z.]{1,10}$/;
const PHONE_RE = /^\+[1-9]\d{7,14}$/;

interface Entry {
  upper: number | null;
  lower: number | null;
  price: number;
  series: PricePoint[];
}

export function createMockApi(): MarketPulseApi {
  const r = rng(Date.now() & 0xffff);
  const delay = <T>(v: T, ms = 180 + r() * 320) =>
    new Promise<T>((resolve) => setTimeout(() => resolve(structuredClone(v)), ms));
  const fail = (status: number, message: string, ms = 220) =>
    new Promise<never>((_, reject) => setTimeout(() => reject(new ApiError(status, message)), ms));

  const watch = new Map<string, Entry>();
  const seriesCache = new Map<string, PricePoint[]>();
  function series(symbol: string) {
    let s = seriesCache.get(symbol);
    if (!s) {
      s = buildSeries(symbol, baseFor(symbol).price);
      seriesCache.set(symbol, s);
    }
    return s;
  }
  for (const w of SEED_WATCHLIST) {
    const s = series(w.symbol);
    watch.set(w.symbol, { upper: w.upper, lower: w.lower, price: s[s.length - 1].price, series: s });
  }

  let profile: Profile = {
    sub: "mock-0b6c1e2a",
    email: mockSession() ?? "you@example.com",
    smsOptIn: false,
    digestOptIn: true,
    createdAt: "2026-09-14T08:12:44Z",
  };

  function prevClose(e: Entry) {
    const last = e.series[e.series.length - 1];
    return last.prevClose ?? last.price;
  }

  function alertState(e: Entry): WatchItem["alertState"] {
    const out: Partial<Record<AlertSide, AlertState>> = {};
    if (e.upper != null) out.UPPER = e.price >= e.upper ? "BREACHED" : "CLEAR";
    if (e.lower != null) out.LOWER = e.price <= e.lower ? "BREACHED" : "CLEAR";
    return out;
  }

  function toItem(symbol: string, e: Entry): WatchItem {
    const pc = prevClose(e);
    return {
      symbol,
      upper: e.upper,
      lower: e.lower,
      latest: {
        price: e.price,
        changePct: round(((e.price - pc) / pc) * 100, 3),
        ts: new Date().toISOString(),
      },
      alertState: alertState(e),
    };
  }

  function tick() {
    for (const [sym, e] of watch) {
      const { vol } = baseFor(sym);
      const step = (r() - 0.5) * vol * 0.12;
      e.price = round(e.price * (1 + step));
    }
  }

  function positive(name: string, v: unknown) {
    if (v == null) return null;
    if (typeof v !== "number" || !(v > 0)) throw new ApiError(400, `${name} must be a positive number`);
    return v;
  }

  return {
    async getMe() {
      return delay({ ...profile, email: mockSession() ?? profile.email });
    },

    async updateMe(u) {
      const unknown = Object.keys(u).filter((k) => !["phone", "smsOptIn", "digestOptIn"].includes(k));
      if (unknown.length) return fail(400, `unknown fields: ${unknown.sort().join(", ")}`);
      if (u.phone !== undefined && !PHONE_RE.test(u.phone)) {
        return fail(400, "phone must be E.164, e.g. +919876543210");
      }
      const phone = u.phone ?? profile.phone;
      if (u.smsOptIn && !phone) return fail(400, "smsOptIn requires a phone number");
      profile = { ...profile, ...u };
      return delay(profile);
    },

    async getWatchlist() {
      tick();
      return delay([...watch].map(([s, e]) => toItem(s, e)));
    },

    async putWatch(symbol, t) {
      const sym = symbol.toUpperCase();
      if (!SYMBOL_RE.test(sym)) return fail(400, "invalid symbol");
      let upper: number | null;
      let lower: number | null;
      try {
        upper = positive("upper", t.upper);
        lower = positive("lower", t.lower);
      } catch (e) {
        return fail(400, (e as Error).message);
      }
      if (upper != null && lower != null && lower >= upper) {
        return fail(400, "lower must be less than upper");
      }
      const existing = watch.get(sym);
      if (!existing) {
        if (watch.size >= MAX_WATCHES) return fail(400, `watchlist is limited to ${MAX_WATCHES} symbols`);
        if (!UNIVERSE.some((u) => u.symbol === sym)) return fail(400, `unknown symbol ${sym}`);
        const s = series(sym);
        watch.set(sym, { upper, lower, price: s[s.length - 1].price, series: s });
      } else {
        existing.upper = upper;
        existing.lower = lower;
      }
      return delay({ symbol: sym, upper, lower });
    },

    async deleteWatch(symbol) {
      watch.delete(symbol.toUpperCase());
      return delay(undefined as void);
    },

    async searchSymbols(q) {
      const query = q.trim().toUpperCase();
      if (query.length < 1 || query.length > 20) return fail(400, "q must be 1-20 characters");
      const hits = UNIVERSE.filter(
        (u) => u.symbol.startsWith(query) || u.description.includes(query),
      ).sort((a, b) => Number(b.symbol.startsWith(query)) - Number(a.symbol.startsWith(query)));
      return delay(hits.slice(0, 10), 120 + r() * 160);
    },

    async getHistory(symbol, days = 7) {
      const sym = symbol.toUpperCase();
      if (!Number.isInteger(days) || days < 1 || days > 30) return fail(400, "days must be an integer 1-30");
      if (!UNIVERSE.some((u) => u.symbol === sym)) return delay<History>({ prices: [], sentiment: [] });
      const all = series(sym);
      const live = watch.get(sym);
      const lastTs = new Date(all[all.length - 1].ts).getTime();
      const cutoff = lastTs - days * 86_400_000;
      const prices = all.filter((p) => new Date(p.ts).getTime() > cutoff);
      if (live && prices.length) {
        const last = prices[prices.length - 1];
        prices[prices.length - 1] = { ...last, price: live.price };
      }
      const firstDate = prices[0]?.ts.slice(0, 10) ?? "";
      const sentiment = buildSentiment(sym, all).filter((s) => s.date >= firstDate);
      return delay<History>({ prices, sentiment }, 260 + r() * 380);
    },

    async triggerDigest() {
      return delay({ queued: true }, 500);
    },
  };
}
