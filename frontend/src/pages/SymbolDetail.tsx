import { ArrowLeft, PencilSimple, Plus, Sparkle } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { History } from "../api/types";
import { day, dayTime, dir, errorMessage, pct, price as fmt, signed } from "../lib/format";
import { MAX_WATCHES, useWatchlist } from "../state/watchlist";
import { AlertChip, InlineError, Skel } from "../ui/bits";
import { PriceChart } from "./symbol/PriceChart";
import { SentimentBars } from "./symbol/SentimentBars";

const RANGES = [
  { key: "1D", days: 1, label: "Today" },
  { key: "7D", days: 7, label: "Past 7 days" },
  { key: "14D", days: 14, label: "Past 14 days" },
  { key: "30D", days: 30, label: "Past 30 days" },
] as const;

export default function SymbolDetail() {
  const symbol = decodeURIComponent(useParams().symbol ?? "").toUpperCase();
  const { items, names, rememberNames, openThresholds, add } = useWatchlist();
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1]);
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [sel, setSel] = useState<number | null>(null);

  const item = items?.find((i) => i.symbol === symbol);
  const name = names[symbol];

  useEffect(() => {
    document.title = `${symbol} · MarketPulse`;
    return () => {
      document.title = "MarketPulse";
    };
  }, [symbol]);

  useEffect(() => {
    if (name) return;
    api
      .searchSymbols(symbol)
      .then((hits) => {
        const exact = hits.find((h) => h.symbol === symbol);
        if (exact) rememberNames([exact]);
      })
      .catch(() => undefined);
  }, [symbol, name, rememberNames]);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    setError(null);
    setHover(null);
    api
      .getHistory(symbol, range.days)
      .then((h) => {
        if (stale) return;
        setData(h);
        setSel(null);
      })
      .catch((e) => !stale && setError(errorMessage(e)))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [symbol, range, reload]);

  const prices = data?.prices ?? [];
  const sentiment = data?.sentiment ?? [];
  const last = prices[prices.length - 1];
  const livePrice = item?.latest?.price ?? last?.price ?? null;
  const shown = hover != null ? prices[hover] : null;
  const heroPrice = shown?.price ?? livePrice;

  const base = useMemo(() => {
    if (!prices.length) return null;
    if (range.days === 1) return last?.prevClose ?? prices[0].price;
    return prices[0].price;
  }, [prices, range.days, last]);

  const delta = heroPrice != null && base != null ? heroPrice - base : null;
  const deltaPct = delta != null && base ? (delta / base) * 100 : null;
  const rangeDir = dir(livePrice != null && base != null ? livePrice - base : null);
  const d = dir(delta);

  const selIdx = sel ?? sentiment.length - 1;
  const day0 = sentiment[selIdx];

  // Range applies to both charts; it sits under the sentiment bars, where history is deepest.
  const rangePicker = (
    <div className="chart-bar">
      <div className="seg" role="group" aria-label="History range">
        {RANGES.map((r) => (
          <button key={r.key} aria-pressed={r.key === range.key} onClick={() => setRange(r)}>
            {r.key}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="wrap page">
      <Link to="/" className="back">
        <ArrowLeft size={14} aria-hidden /> Watchlist
      </Link>
      <div className="detail">
        <div style={{ minWidth: 0 }}>
          <div className="sym-head">
            <h1>{symbol}</h1>
            <span className="name">{name ?? ""}</span>
          </div>

          <div className="price-hero" aria-live="polite">
            {heroPrice == null && loading ? (
              <>
                <Skel w={220} h={56} style={{ margin: "12px 0 8px" }} />
                <Skel w={180} h={16} />
              </>
            ) : (
              <>
                <p className="hero-number num" style={{ fontFamily: "var(--font-sans)" }}>
                  {heroPrice != null ? `$${fmt(heroPrice)}` : "-"}
                </p>
                <p className={`delta ${d}`}>
                  <span className="tnum">
                    {delta != null ? `${signed(delta)} (${pct(deltaPct)})` : "No price change data"}
                  </span>
                  <span className="when">{shown ? dayTime(shown.ts) : range.label}</span>
                </p>
              </>
            )}
          </div>

          <div className="chart-wrap">
            {error ? (
              <InlineError message={error} onRetry={() => setReload((n) => n + 1)} />
            ) : loading && !data ? (
              <Skel h={320} style={{ borderRadius: 12 }} />
            ) : prices.length < 2 ? (
              <div className="empty" style={{ padding: "60px 0" }}>
                <h3>No price points yet</h3>
                <p>
                  {range.days === 1
                    ? "Nothing recorded in the last 24 hours. Try a longer range."
                    : "Prices are recorded during US market hours once a symbol is on a watchlist."}
                </p>
              </div>
            ) : (
              <div style={{ height: "100%", opacity: loading ? 0.5 : 1, transition: "opacity 200ms" }}>
                <PriceChart
                  prices={prices}
                  intraday={range.days === 1}
                  upper={item?.upper ?? null}
                  lower={item?.lower ?? null}
                  direction={rangeDir}
                  onHover={setHover}
                />
              </div>
            )}
          </div>

          <section className="section senti" aria-labelledby="senti-title" style={{ marginTop: 40 }}>
            <div className="section-head">
              <h2 id="senti-title">News sentiment</h2>
              <span className="spacer" />
              <span className="faint" style={{ fontSize: 12 }}>
                Score from -1 to +1, one bar per day
              </span>
            </div>
            {loading && !data ? (
              <Skel h={120} />
            ) : sentiment.length === 0 ? (
              <p className="muted" style={{ padding: "8px 0 24px" }}>
                No news has been scored for {symbol} in this range yet.
              </p>
            ) : (
              <SentimentBars points={sentiment} selected={selIdx} onSelect={setSel} />
            )}
            {!(loading && !data) && rangePicker}
            {(loading && !data) || sentiment.length === 0 ? null : (
              <>
                {day0 && (
                  <div className="senti-detail">
                    <div>
                      <div className="senti-meta">
                        <span className={`label-chip ${day0.label}`}>{day0.label}</span>
                        <span className="num">
                          {day0.score >= 0 ? "+" : "−"}
                          {Math.abs(day0.score).toFixed(2)}
                        </span>
                        <span>{day(day0.date)}</span>
                        <span className="faint">
                          {Object.values(day0.counts).reduce((a, b) => a + b, 0)} headlines scored
                        </span>
                      </div>
                      {day0.summary ? (
                        <>
                          <p className="summary">{day0.summary}</p>
                          <p className="summary-note">
                            <Sparkle size={12} aria-hidden /> AI summary of the day's headlines
                          </p>
                        </>
                      ) : (
                        <p className="muted">No AI summary for this day.</p>
                      )}
                    </div>
                    <div>
                      <h3 className="label" style={{ marginBottom: 4 }}>
                        Top headlines
                      </h3>
                      {day0.headlines.length ? (
                        <ul className="headlines">
                          {day0.headlines.map((h) => (
                            <li key={h.url}>
                              <a href={h.url} target="_blank" rel="noreferrer noopener">
                                <span className="h">{h.headline}</span>
                                <span className="src">{h.source}</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted">No headlines for this day.</p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <aside aria-label="Alerts and session">
          <div className="panel">
            <h2>Price alerts</h2>
            {!items ? (
              <Skel h={80} style={{ marginTop: 12 }} />
            ) : !item ? (
              <>
                <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {symbol} is not on your watchlist. Add it to set alerts and include it in your digest.
                </p>
                <button
                  className="btn btn-primary btn-block"
                  style={{ marginTop: 16 }}
                  disabled={items.length >= MAX_WATCHES}
                  onClick={() => add(symbol)}
                >
                  <Plus size={16} weight="bold" aria-hidden /> Add to watchlist
                </button>
              </>
            ) : (
              <>
                {(["UPPER", "LOWER"] as const).map((side) => {
                  const v = side === "UPPER" ? item.upper : item.lower;
                  const state = item.alertState[side];
                  const dist = v != null && livePrice ? ((v - livePrice) / livePrice) * 100 : null;
                  return (
                    <div className="th-side" key={side}>
                      <span className="muted">{side === "UPPER" ? "Alert above" : "Alert below"}</span>
                      <span>{v != null && state && <AlertChip side={side} state={state} />}</span>
                      <span className="num v">{v != null ? `$${fmt(v)}` : <span className="faint">Off</span>}</span>
                      <span />
                      {dist != null && (
                        <span className="meta">
                          {state === "BREACHED"
                            ? "Price is past this level"
                            : `${Math.abs(dist).toFixed(2)}% away from last price`}
                        </span>
                      )}
                    </div>
                  );
                })}
                <button
                  className="btn btn-secondary btn-block"
                  style={{ marginTop: 8 }}
                  onClick={() => openThresholds(symbol)}
                >
                  <PencilSimple size={16} aria-hidden /> Edit alerts
                </button>
              </>
            )}
          </div>

          {last && (
            <div className="panel">
              <h2>Latest session</h2>
              <dl className="kv">
                {last.open != null && (
                  <>
                    <dt>Open</dt>
                    <dd>{fmt(last.open)}</dd>
                  </>
                )}
                {last.high != null && (
                  <>
                    <dt>High</dt>
                    <dd>{fmt(last.high)}</dd>
                  </>
                )}
                {last.low != null && (
                  <>
                    <dt>Low</dt>
                    <dd>{fmt(last.low)}</dd>
                  </>
                )}
                {last.prevClose != null && (
                  <>
                    <dt>Prev close</dt>
                    <dd>{fmt(last.prevClose)}</dd>
                  </>
                )}
                <dt>As of</dt>
                <dd>{dayTime(item?.latest?.ts ?? last.ts)}</dd>
              </dl>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
