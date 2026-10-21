const usd = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const price = (n: number | null | undefined) => (n == null ? "-" : usd.format(n));

/** Signed percent, e.g. "+1.24%" / "-0.31%". Uses a true minus sign for alignment. */
export function pct(n: number | null | undefined, dp = 2) {
  if (n == null || Number.isNaN(n)) return "-";
  const s = Math.abs(n).toFixed(dp);
  if (Number(s) === 0) return `${(0).toFixed(dp)}%`;
  return `${n > 0 ? "+" : "−"}${s}%`;
}

export function signed(n: number, dp = 2) {
  const s = usd.format(Math.abs(n));
  if (Number(Math.abs(n).toFixed(dp)) === 0) return usd.format(0);
  return `${n > 0 ? "+" : "−"}${s}`;
}

export const dir = (n: number | null | undefined): "up" | "down" | "flat" =>
  n == null || Math.abs(n) < 0.005 ? "flat" : n > 0 ? "up" : "down";

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const dayTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export const time = (iso: string) => timeFmt.format(new Date(iso));
export const day = (iso: string) => dayFmt.format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
export const dayTime = (iso: string) => dayTimeFmt.format(new Date(iso));

export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return dayTime(iso);
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
