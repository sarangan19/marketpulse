import { useId, useMemo } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PricePoint } from "../../api/types";
import { day, dayTime, price as fmt, time } from "../../lib/format";
import { useCssVars, usePrefersReducedMotion } from "../../lib/useCssVars";

const VARS = ["up", "down", "text-3", "line", "line-strong", "text", "bg"] as const;

export function PriceChart({
  prices,
  intraday,
  upper,
  lower,
  direction,
  onHover,
}: {
  prices: PricePoint[];
  intraday: boolean;
  upper: number | null;
  lower: number | null;
  direction: "up" | "down" | "flat";
  onHover: (i: number | null) => void;
}) {
  const c = useCssVars(VARS);
  const reduce = usePrefersReducedMotion();
  const gid = useId().replace(/:/g, "");
  const data = useMemo(() => prices.map((p, i) => ({ i, price: p.price, ts: p.ts })), [prices]);
  const stroke = direction === "down" ? c.down : direction === "up" ? c.up : c.text;

  const [min, max] = useMemo(() => {
    const ps = prices.map((p) => p.price);
    let lo = Math.min(...ps);
    let hi = Math.max(...ps);
    const last = ps[ps.length - 1];
    // Pull thresholds into view when they are reasonably close to the action.
    for (const t of [upper, lower]) {
      if (t != null && Math.abs(t - last) / last < 0.15) {
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
    }
    const pad = (hi - lo) * 0.08 || last * 0.01;
    return [lo - pad, hi + pad];
  }, [prices, upper, lower]);

  // One tick per session (or every 2 hours intraday), thinned to at most 6.
  const xTicks = useMemo(() => {
    const idx: number[] = [];
    prices.forEach((p, i) => {
      if (intraday) {
        if (i % 4 === 0) idx.push(i);
      } else if (i === 0 || p.ts.slice(0, 10) !== prices[i - 1].ts.slice(0, 10)) idx.push(i);
    });
    // Labels centred on the very first point get clipped at the edge.
    const inner = idx.filter((i) => i >= prices.length * 0.05);
    const step = Math.ceil(inner.length / 6);
    return inner.filter((_, k) => k % step === 0);
  }, [prices, intraday]);

  const yTicks = useMemo(() => {
    const raw = (max - min) / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
    const out: number[] = [];
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(Number(v.toFixed(6)));
    return out;
  }, [min, max]);

  const label = (i: number) => {
    const p = prices[i];
    if (!p) return "";
    return intraday ? time(p.ts) : day(p.ts);
  };

  const tick = { fill: c["text-3"], fontSize: 11, fontFamily: "Geist Mono Variable, ui-monospace, monospace" };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 24, right: 8, bottom: 0, left: 8 }}
        onMouseMove={(s) => {
          const idx = s?.activeTooltipIndex;
          onHover(idx == null ? null : Number(idx));
        }}
        onMouseLeave={() => onHover(null)}
      >
        <defs>
          <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="i"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={label}
          tick={tick}
          tickLine={false}
          axisLine={false}
          ticks={xTicks}
          interval={0}
          minTickGap={24}
        />
        <YAxis
          orientation="right"
          domain={[min, max]}
          tickFormatter={(v: number) => fmt(v)}
          tick={tick}
          tickLine={false}
          axisLine={false}
          width={64}
          ticks={yTicks}
        />
        {upper != null && upper > min && upper < max && (
          <ReferenceLine
            y={upper}
            stroke={c.up}
            strokeDasharray="4 4"
            strokeOpacity={0.8}
            label={{ value: `Upper ${fmt(upper)}`, position: "insideTopLeft", fill: c.up, fontSize: 11 }}
          />
        )}
        {lower != null && lower > min && lower < max && (
          <ReferenceLine
            y={lower}
            stroke={c.down}
            strokeDasharray="4 4"
            strokeOpacity={0.8}
            label={{ value: `Lower ${fmt(lower)}`, position: "insideBottomLeft", fill: c.down, fontSize: 11 }}
          />
        )}
        <Tooltip
          cursor={{ stroke: c["line-strong"], strokeWidth: 1 }}
          isAnimationActive={false}
          position={{ y: 0 }}
          content={({ label: l }) =>
            l == null || !prices[Number(l)] ? null : (
              <span style={{ fontSize: 11, color: c["text-3"], fontFamily: tick.fontFamily }}>
                {dayTime(prices[Number(l)].ts)}
              </span>
            )
          }
        />
        <Area
          type="monotone"
          dataKey="price"
          stroke={stroke}
          strokeWidth={2}
          fill={`url(#fill-${gid})`}
          isAnimationActive={!reduce}
          animationDuration={500}
          activeDot={{ r: 4, fill: stroke, stroke: c.bg, strokeWidth: 2 }}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
