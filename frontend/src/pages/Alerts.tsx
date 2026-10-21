import { EnvelopeSimple, PencilSimple, ChatText } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { AlertSide, AlertState, Profile, WatchItem } from "../api/types";
import { price as fmt } from "../lib/format";
import { useWatchlist } from "../state/watchlist";
import { AlertChip, InlineError, Skel } from "../ui/bits";

interface Line {
  symbol: string;
  side: AlertSide;
  threshold: number;
  state: AlertState | undefined;
  last: number | null;
}

function lines(items: WatchItem[]): Line[] {
  const out: Line[] = [];
  for (const i of items) {
    for (const side of ["UPPER", "LOWER"] as const) {
      const t = side === "UPPER" ? i.upper : i.lower;
      if (t == null) continue;
      out.push({ symbol: i.symbol, side, threshold: t, state: i.alertState[side], last: i.latest?.price ?? null });
    }
  }
  return out;
}

function distance(l: Line) {
  if (l.last == null) return "-";
  const d = ((l.threshold - l.last) / l.last) * 100;
  if (l.state === "BREACHED") {
    const past = Math.abs(d).toFixed(2);
    return `${past}% past`;
  }
  return `${Math.abs(d).toFixed(2)}% to go`;
}

function AlertRow({ l }: { l: Line }) {
  const { openThresholds } = useWatchlist();
  return (
    <div className="al-row">
      <div className="al-main">
        <Link to={`/symbol/${encodeURIComponent(l.symbol)}`}>{l.symbol}</Link>
        {l.state ? <AlertChip side={l.side} state={l.state} /> : <span className="chip chip-neutral">Awaiting check</span>}
      </div>
      <div className="al-nums num">
        <span>
          {l.side === "UPPER" ? "Above" : "Below"} <b>{fmt(l.threshold)}</b>
        </span>
        <span>
          Last <b>{fmt(l.last)}</b>
        </span>
        <span>{distance(l)}</span>
      </div>
      <button
        className="icon-btn"
        aria-label={`Edit alerts for ${l.symbol}`}
        onClick={() => openThresholds(l.symbol)}
        style={{ gridRow: 1, gridColumn: -2 }}
      >
        <PencilSimple size={17} />
      </button>
    </div>
  );
}

export default function Alerts() {
  const { items, error, refresh } = useWatchlist();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    api.getMe().then(setProfile).catch(() => undefined);
  }, []);

  const all = items ? lines(items) : [];
  const breached = all.filter((l) => l.state === "BREACHED");
  const armed = all.filter((l) => l.state !== "BREACHED");
  const unset = items?.filter((i) => i.upper == null && i.lower == null) ?? [];

  return (
    <div className="wrap page">
      <h1 className="page-title">Alerts</h1>
      {profile && (
        <p className="channel-note" style={{ marginTop: 8 }}>
          <EnvelopeSimple size={16} aria-hidden /> Email to {profile.email}
          {profile.smsOptIn && profile.phone && (
            <>
              <ChatText size={16} aria-hidden style={{ marginLeft: 8 }} /> SMS to {profile.phone}
            </>
          )}
          <Link to="/settings" className="faint" style={{ marginLeft: 8 }}>
            Change
          </Link>
        </p>
      )}

      {error && !items && (
        <div style={{ marginTop: 24 }}>
          <InlineError message={error} onRetry={refresh} />
        </div>
      )}

      {!items && !error ? (
        <div className="stat-row" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skel w={60} h={40} />
              <Skel w={90} h={12} style={{ marginTop: 8 }} />
            </div>
          ))}
        </div>
      ) : items ? (
        <div className="stat-row">
          <div className="stat">
            <div className={`n ${breached.length ? "signal" : ""}`}>{breached.length}</div>
            <div className="l">Breached</div>
          </div>
          <div className="stat">
            <div className="n">{armed.length}</div>
            <div className="l">Watching</div>
          </div>
          <div className="stat">
            <div className="n">{unset.length}</div>
            <div className="l">Symbols without alerts</div>
          </div>
        </div>
      ) : null}

      {items && all.length === 0 && (
        <div className="empty">
          <h3>No alerts set</h3>
          <p>Set an upper or lower price on any watchlist symbol and it will show up here.</p>
          <Link className="btn btn-primary" to="/">
            Go to watchlist
          </Link>
        </div>
      )}

      {breached.length > 0 && (
        <section aria-labelledby="al-breached">
          <div className="section-head">
            <h2 id="al-breached">Breached</h2>
          </div>
          {breached.map((l) => (
            <AlertRow key={`${l.symbol}-${l.side}`} l={l} />
          ))}
        </section>
      )}

      {armed.length > 0 && (
        <section aria-labelledby="al-armed" style={{ marginTop: 24 }}>
          <div className="section-head">
            <h2 id="al-armed">Watching</h2>
          </div>
          {armed.map((l) => (
            <AlertRow key={`${l.symbol}-${l.side}`} l={l} />
          ))}
        </section>
      )}

      {unset.length > 0 && all.length > 0 && (
        <p className="muted" style={{ marginTop: 28, fontSize: 13 }}>
          No alerts on {unset.map((u) => u.symbol).join(", ")}.
        </p>
      )}
    </div>
  );
}
