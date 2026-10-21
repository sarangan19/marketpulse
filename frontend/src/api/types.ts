// Mirrors docs/openapi.yaml. KEEP this file when replacing the mock UI.

export type AlertSide = "UPPER" | "LOWER";
export type AlertState = "BREACHED" | "CLEAR";
export type SentimentLabel = "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED";

export interface Profile {
  sub: string;
  email: string;
  phone?: string;
  smsOptIn: boolean;
  digestOptIn: boolean;
  createdAt: string;
}

export interface ProfileUpdate {
  phone?: string;
  smsOptIn?: boolean;
  digestOptIn?: boolean;
}

export interface WatchItem {
  symbol: string;
  upper: number | null;
  lower: number | null;
  latest: { price: number; changePct: number; ts: string } | null;
  alertState: Partial<Record<AlertSide, AlertState>>;
}

export interface Thresholds {
  upper?: number | null;
  lower?: number | null;
}

export interface SymbolMatch {
  symbol: string;
  description: string;
}

export interface PricePoint {
  ts: string;
  price: number;
  change?: number;
  changePct?: number;
  high?: number;
  low?: number;
  open?: number;
  prevClose?: number;
}

export interface Headline {
  headline: string;
  source: string;
  url: string;
}

export interface SentimentPoint {
  date: string;
  score: number;
  label: SentimentLabel;
  counts: Record<string, number>;
  summary?: string;
  headlines: Headline[];
}

export interface History {
  prices: PricePoint[];
  sentiment: SentimentPoint[];
}
