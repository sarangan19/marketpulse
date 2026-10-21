import { price as fmt } from "./format";

export type Side = "upper" | "lower";
export type CheckResult = { ok: true; value: number | null } | { ok: false; error: string };

/**
 * Validate one inline-edited threshold against the row's current values.
 * Empty input clears that side; the other side must stay on the correct side of it.
 */
export function checkThreshold(
  side: Side,
  raw: string,
  current: { upper: number | null; lower: number | null },
): CheckResult {
  const s = raw.trim().replace(/,/g, "");
  if (!s) return { ok: true, value: null };
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "Enter a positive number" };
  if (side === "lower" && current.upper != null && n >= current.upper) {
    return { ok: false, error: `Must be below the upper alert (${fmt(current.upper)})` };
  }
  if (side === "upper" && current.lower != null && n <= current.lower) {
    return { ok: false, error: `Must be above the lower alert (${fmt(current.lower)})` };
  }
  return { ok: true, value: n };
}
