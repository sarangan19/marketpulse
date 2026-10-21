import { price as fmt } from "../lib/format";

/**
 * Lower ... upper range with the live price marker. A threshold the price has crossed turns amber.
 */
export function ThresholdBand({
  price,
  lower,
  upper,
}: {
  price: number | null;
  lower: number | null;
  upper: number | null;
}) {
  if (lower == null && upper == null) {
    return <div className="band-empty">No thresholds set</div>;
  }
  if (price == null) {
    return <div className="band-empty">Waiting for first price</div>;
  }
  const values = [price, lower, upper].filter((v): v is number => v != null);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const span = hi - lo || price * 0.04;
  lo -= span * 0.18;
  hi += span * 0.18;
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;

  const lowHit = lower != null && price <= lower;
  const upHit = upper != null && price >= upper;
  const zoneL = pos(lower ?? lo);
  const zoneR = pos(upper ?? hi);
  const label = [
    `Price ${fmt(price)}`,
    lower != null ? `lower ${fmt(lower)}${lowHit ? " breached" : ""}` : null,
    upper != null ? `upper ${fmt(upper)}${upHit ? " breached" : ""}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const edge = (p: number) => (p < 12 ? "edge-l" : p > 88 ? "edge-r" : "");

  return (
    <div className="band" role="img" aria-label={label}>
      <div className="band-track" />
      <div className="band-zone" style={{ left: `${zoneL}%`, width: `${Math.max(0, zoneR - zoneL)}%` }} />
      {lower != null && (
        <>
          <div className={`band-tick ${lowHit ? "hit" : ""}`} style={{ left: `${pos(lower)}%` }} />
          <div
            className={`band-tick-label ${lowHit ? "hit" : ""} ${edge(pos(lower))}`}
            data-threshold="lower"
            style={{ left: `${pos(lower)}%` }}
          >
            {fmt(lower)}
          </div>
        </>
      )}
      {upper != null && (
        <>
          <div className={`band-tick ${upHit ? "hit" : ""}`} style={{ left: `${pos(upper)}%` }} />
          <div
            className={`band-tick-label ${upHit ? "hit" : ""} ${edge(pos(upper))}`}
            data-threshold="upper"
            style={{ left: `${pos(upper)}%` }}
          >
            {fmt(upper)}
          </div>
        </>
      )}
      <div className={`band-marker ${lowHit || upHit ? "hit" : ""}`} style={{ left: `${pos(price)}%` }} />
    </div>
  );
}
