// MOCK DATA. Sample values only, not market data. Delete this folder to drop mock mode.
import type { Headline, PricePoint, SentimentLabel, SentimentPoint, SymbolMatch } from "../types";

export const UNIVERSE: SymbolMatch[] = [
  { symbol: "AAPL", description: "APPLE INC" },
  { symbol: "MSFT", description: "MICROSOFT CORP" },
  { symbol: "NVDA", description: "NVIDIA CORP" },
  { symbol: "TSLA", description: "TESLA INC" },
  { symbol: "AMZN", description: "AMAZON.COM INC" },
  { symbol: "GOOGL", description: "ALPHABET INC-CL A" },
  { symbol: "GOOG", description: "ALPHABET INC-CL C" },
  { symbol: "META", description: "META PLATFORMS INC-CLASS A" },
  { symbol: "JPM", description: "JPMORGAN CHASE & CO" },
  { symbol: "V", description: "VISA INC-CLASS A SHARES" },
  { symbol: "MA", description: "MASTERCARD INC - A" },
  { symbol: "NFLX", description: "NETFLIX INC" },
  { symbol: "AMD", description: "ADVANCED MICRO DEVICES" },
  { symbol: "AVGO", description: "BROADCOM INC" },
  { symbol: "COST", description: "COSTCO WHOLESALE CORP" },
  { symbol: "KO", description: "COCA-COLA CO/THE" },
  { symbol: "PEP", description: "PEPSICO INC" },
  { symbol: "DIS", description: "WALT DISNEY CO/THE" },
  { symbol: "BAC", description: "BANK OF AMERICA CORP" },
  { symbol: "WMT", description: "WALMART INC" },
  { symbol: "XOM", description: "EXXON MOBIL CORP" },
  { symbol: "UNH", description: "UNITEDHEALTH GROUP INC" },
  { symbol: "ORCL", description: "ORACLE CORP" },
  { symbol: "CRM", description: "SALESFORCE INC" },
  { symbol: "INTC", description: "INTEL CORP" },
  { symbol: "UBER", description: "UBER TECHNOLOGIES INC" },
  { symbol: "SHOP", description: "SHOPIFY INC - CLASS A" },
  { symbol: "PLTR", description: "PALANTIR TECHNOLOGIES INC-A" },
  { symbol: "BRK.B", description: "BERKSHIRE HATHAWAY INC-CL B" },
  { symbol: "NKE", description: "NIKE INC -CL B" },
];

/** Seed price + volatility for symbols; anything else gets a derived price. */
const BASE: Record<string, { price: number; vol: number }> = {
  AAPL: { price: 232.14, vol: 0.014 },
  MSFT: { price: 431.62, vol: 0.012 },
  NVDA: { price: 138.47, vol: 0.028 },
  TSLA: { price: 248.91, vol: 0.032 },
  AMZN: { price: 201.36, vol: 0.017 },
  GOOGL: { price: 176.52, vol: 0.016 },
  META: { price: 588.23, vol: 0.02 },
  JPM: { price: 241.77, vol: 0.011 },
};

export const SEED_WATCHLIST: { symbol: string; upper: number | null; lower: number | null }[] = [
  { symbol: "NVDA", upper: 135, lower: 112 },
  { symbol: "AAPL", upper: 240, lower: 215 },
  { symbol: "TSLA", upper: 290, lower: 255 },
  { symbol: "MSFT", upper: 450, lower: null },
  { symbol: "META", upper: 580, lower: 520 },
  { symbol: "AMZN", upper: null, lower: null },
  { symbol: "GOOGL", upper: null, lower: 170 },
  { symbol: "JPM", upper: 260, lower: 225 },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
}

export function baseFor(symbol: string) {
  return BASE[symbol] ?? { price: 40 + (hash(symbol) % 36000) / 100, vol: 0.018 };
}

const STEPS_PER_DAY = 14; // 09:30 to 16:00 ET every 30 minutes
const OPEN_UTC_MIN = 13 * 60 + 30;

/** Weekday sessions ending at the most recent one on or before `now`, oldest first. */
function sessions(now: Date, count: number): Date[] {
  const out: Date[] = [];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (out.length < count) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.unshift(new Date(d));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

/** 30 sessions of half-hourly prices ending at `endPrice`. */
export function buildSeries(symbol: string, endPrice: number, now = new Date()): PricePoint[] {
  const { vol } = baseFor(symbol);
  const r = rng(hash(symbol) ^ 0x9e3779b9);
  const days = sessions(now, 31);
  const stamps: number[] = [];
  const nowMs = now.getTime();
  for (const day of days) {
    for (let i = 0; i < STEPS_PER_DAY; i++) {
      const t = day.getTime() + (OPEN_UTC_MIN + i * 30) * 60_000;
      if (t <= nowMs) stamps.push(t);
    }
  }
  const sigma = vol / Math.sqrt(STEPS_PER_DAY);
  const drift = (r() - 0.45) * sigma * 0.25;
  const cum: number[] = [];
  let acc = 0;
  for (let i = 0; i < stamps.length; i++) {
    acc += drift + sigma * gauss(r);
    cum.push(acc);
  }
  const last = cum[cum.length - 1] ?? 0;
  const prices = cum.map((c) => endPrice * Math.exp(c - last));

  const out: PricePoint[] = [];
  let prevClose = prices[0];
  let dayKey = "";
  let open = prices[0];
  let hi = prices[0];
  let lo = prices[0];
  for (let i = 0; i < stamps.length; i++) {
    const key = new Date(stamps[i]).toISOString().slice(0, 10);
    if (key !== dayKey) {
      if (i > 0) prevClose = prices[i - 1];
      dayKey = key;
      open = hi = lo = prices[i];
    }
    hi = Math.max(hi, prices[i]);
    lo = Math.min(lo, prices[i]);
    const price = round(prices[i]);
    out.push({
      ts: new Date(stamps[i]).toISOString(),
      price,
      open: round(open),
      high: round(hi),
      low: round(lo),
      prevClose: round(prevClose),
      change: round(price - prevClose),
      changePct: round(((price - prevClose) / prevClose) * 100, 3),
    });
  }
  // The first session only seeds prevClose.
  const firstDay = out[0]?.ts.slice(0, 10);
  return out.filter((p) => p.ts.slice(0, 10) !== firstDay);
}

export function round(n: number, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

const SOURCES = ["Wire Desk", "Market Brief", "Street Ledger", "Daily Tape", "Sector Watch", "The Open"];

const TEMPLATES: Record<"pos" | "neg" | "neu", string[]> = {
  pos: [
    "{s} climbs after analysts lift price targets on stronger demand outlook",
    "{s} beats revenue estimates as margins widen for a third straight quarter",
    "Funds add to {s} positions as buyback pace accelerates",
    "{s} wins large enterprise contract, shares extend gains",
    "Options traders pile into {s} calls ahead of product event",
  ],
  neg: [
    "{s} slips as regulators widen review of pricing practices",
    "{s} guidance comes in below consensus on softer orders",
    "Supplier delays weigh on {s} near-term shipments",
    "{s} downgraded to neutral on valuation concerns",
    "{s} faces margin pressure as input costs rise",
  ],
  neu: [
    "{s} to present at industry conference next week",
    "{s} files quarterly report, reiterates full-year targets",
    "What to watch in {s} earnings: guidance, capex, buybacks",
    "{s} names new chief financial officer effective next month",
    "{s} trades flat as sector rotation continues",
  ],
};

const SUMMARIES: Record<SentimentLabel, string> = {
  POSITIVE:
    "Coverage leaned constructive. Analysts pointed to firmer demand and widening margins, and several notes raised price targets. The main risk flagged was valuation after the recent run.",
  NEGATIVE:
    "Coverage turned cautious. Softer guidance and a regulatory review dominated the headlines, and one broker cut its rating. Commentary expects pressure until the next earnings update.",
  NEUTRAL:
    "A quiet news day. Headlines were mostly scheduled events and filings with no change to guidance. Price action tracked the broader sector rather than company news.",
  MIXED:
    "Coverage was split. Upbeat product and contract news ran alongside concerns about costs and a cautious analyst note, leaving no clear direction from the day's headlines.",
};

function labelFor(score: number, counts: Record<string, number>): SentimentLabel {
  if (counts.POSITIVE >= 2 && counts.NEGATIVE >= 2 && Math.abs(score) < 0.25) return "MIXED";
  if (score >= 0.2) return "POSITIVE";
  if (score <= -0.2) return "NEGATIVE";
  return "NEUTRAL";
}

export function buildSentiment(symbol: string, prices: PricePoint[]): SentimentPoint[] {
  const r = rng(hash(symbol) ^ 0x51ed27);
  const days = [...new Set(prices.map((p) => p.ts.slice(0, 10)))];
  let score = (r() - 0.5) * 0.6;
  return days.map((date, i) => {
    score = Math.max(-0.95, Math.min(0.95, score * 0.6 + (r() - 0.5) * 0.9));
    const n = 3 + Math.floor(r() * 5);
    const counts: Record<string, number> = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0, MIXED: 0 };
    const headlines: Headline[] = [];
    for (let k = 0; k < n; k++) {
      const x = r() + score * 0.5;
      const kind = x > 0.66 ? "pos" : x < 0.33 ? "neg" : "neu";
      counts[kind === "pos" ? "POSITIVE" : kind === "neg" ? "NEGATIVE" : "NEUTRAL"]++;
      const list = TEMPLATES[kind];
      if (headlines.length < 5) {
        headlines.push({
          headline: list[Math.floor(r() * list.length)].replace("{s}", symbol),
          source: SOURCES[Math.floor(r() * SOURCES.length)],
          url: `https://example.com/news/${symbol.toLowerCase()}/${date}/${k}`,
        });
      }
    }
    const s = round(score, 3);
    const label = labelFor(s, counts);
    return {
      date,
      score: s,
      label,
      counts,
      summary: i >= days.length - 10 ? SUMMARIES[label] : undefined,
      headlines,
    };
  });
}
