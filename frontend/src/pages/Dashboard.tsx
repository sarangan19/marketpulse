import { EnvelopeSimple, Plus, Trash } from "@phosphor-icons/react";
import { type KeyboardEvent, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { WatchItem } from "../api/types";
import { dir, pct, price, time } from "../lib/format";
import { MAX_WATCHES, useWatchlist } from "../state/watchlist";
import { AlertChip, InlineError, Skel, Tick } from "../ui/bits";
import { InlineThreshold } from "../ui/InlineThreshold";
import { ThresholdBand } from "../ui/ThresholdBand";
import { useToast } from "../ui/toast";

function Hero({ items, updatedAt }: { items: WatchItem[]; updatedAt: string | null }) {
  const priced = items.filter((i) => i.latest);
  const avg = priced.length ? priced.reduce((s, i) => s + i.latest!.changePct, 0) / priced.length : 0;
  const ups = priced.filter((i) => i.latest!.changePct > 0).length;
  const downs = priced.filter((i) => i.latest!.changePct < 0).length;
  const d = dir(avg);
  return (
    <div>
      <p className="label">Watchlist today, equal weighted</p>
      <p className={`hero-number ${d}`} aria-live="polite">
        {pct(avg)}
      </p>
      <p className="hero-sub">
        {ups} advancing, {downs} declining
        {updatedAt && (
          <>
            {". "}Updated <span className="tnum">{time(updatedAt)}</span>
          </>
        )}
      </p>
    </div>
  );
}

function Movers({ items }: { items: WatchItem[] }) {
  const priced = items.filter((i) => i.latest);
  const max = Math.max(0.5, ...priced.map((i) => Math.abs(i.latest!.changePct)));
  if (!priced.length) return null;
  return (
    <div className="movers" role="list" aria-label="Today's move per symbol">
      {priced.map((i) => {
        const c = i.latest!.changePct;
        const h = `${Math.max(2, (Math.abs(c) / max) * 100)}%`;
        const d = dir(c);
        return (
          <Link
            key={i.symbol}
            to={`/symbol/${encodeURIComponent(i.symbol)}`}
            className="mover"
            role="listitem"
            aria-label={`${i.symbol} ${pct(c)}`}
            title={`${i.symbol} ${pct(c)}`}
          >
            <span className="mover-half top">{c >= 0 && <span className={`mover-bar ${d}`} style={{ height: h }} />}</span>
            <span className="mover-half bottom">{c < 0 && <span className={`mover-bar ${d}`} style={{ height: h }} />}</span>
            <span className="mover-sym">{i.symbol}</span>
          </Link>
        );
      })}
    </div>
  );
}

function Row({ item, name }: { item: WatchItem; name?: string }) {
  const { remove } = useWatchlist();
  const p = item.latest?.price ?? null;
  const c = item.latest?.changePct ?? null;
  const d = dir(c);
  const sides = (["UPPER", "LOWER"] as const).filter((s) => item.alertState[s]);
  const change = <span className={`num wl-chg ${d}`}>{pct(c)}</span>;
  return (
    <div className="wl-row">
      <div className="wl-sym">
        <Link className="wl-link" to={`/symbol/${encodeURIComponent(item.symbol)}`} data-symbol={item.symbol}>
          {item.symbol}
        </Link>
        <span className="wl-name">{name ?? " "}</span>
      </div>
      <div className="wl-px">
        <span className="num wl-price">
          {p == null ? <span className="faint">-</span> : <Tick value={p}>{price(p)}</Tick>}
        </span>
        <span className="wl-chg-mobile">{change}</span>
      </div>
      <div className="wl-chg-desktop">{change}</div>
      <div className="wl-band th-inline">
        <InlineThreshold item={item} side="lower" />
        <div className="th-track">
          <ThresholdBand price={p} lower={item.lower} upper={item.upper} labels={false} />
        </div>
        <InlineThreshold item={item} side="upper" />
      </div>
      <div className="wl-alerts">
        {sides.length ? (
          sides.map((s) => <AlertChip key={s} side={s} state={item.alertState[s]!} />)
        ) : item.upper != null || item.lower != null ? (
          <span className="chip chip-neutral">Awaiting check</span>
        ) : null}
      </div>
      <div className="wl-actions">
        <button
          className="icon-btn"
          aria-label={`Remove ${item.symbol}`}
          title="Remove"
          onClick={() => remove(item.symbol)}
        >
          <Trash size={17} />
        </button>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="wl-list" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <li key={i}>
          <div className="wl-row">
            <div className="wl-sym">
              <Skel w={56} h={16} />
              <Skel w={110} h={11} style={{ marginTop: 6 }} />
            </div>
            <div className="wl-px">
              <Skel w={72} h={16} />
            </div>
            <div className="wl-chg-desktop">
              <Skel w={52} h={14} style={{ marginLeft: "auto" }} />
            </div>
            <div className="wl-band">
              <Skel h={8} style={{ marginTop: 6 }} />
            </div>
            <div className="wl-alerts">
              <Skel w={110} h={22} style={{ borderRadius: 999 }} />
            </div>
            <div className="wl-actions" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  const { items, error, updatedAt, refresh, openSearch, editInline, names } = useWatchlist();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  async function sendDigest() {
    setSending(true);
    try {
      await api.triggerDigest();
      toast.show("success", "Digest queued. It should reach your inbox in a minute or two.");
    } catch (e) {
      toast.error(e);
    } finally {
      setSending(false);
    }
  }

  function onListKey(e: KeyboardEvent<HTMLUListElement>) {
    const links = [...(listRef.current?.querySelectorAll<HTMLAnchorElement>(".wl-link") ?? [])];
    const idx = links.findIndex((l) => l.closest(".wl-row")?.contains(document.activeElement));
    const k = e.key;
    if (k === "ArrowDown" || k === "j") {
      e.preventDefault();
      links[Math.min(links.length - 1, idx + 1)]?.focus();
    } else if (k === "ArrowUp" || k === "k") {
      e.preventDefault();
      links[Math.max(0, idx - 1)]?.focus();
    } else if (k === "e" && idx >= 0) {
      e.preventDefault();
      editInline(links[idx].dataset.symbol!, "upper");
    }
  }

  const count = items?.length ?? 0;

  return (
    <div className="wrap page">
      <h1 className="sr-only">Watchlist</h1>
      {items && items.length > 0 && (
        <section className="hero" aria-label="Today">
          <div>
            <Hero items={items} updatedAt={updatedAt} />
            <div className="hero-actions">
              <button className="btn btn-primary" onClick={openSearch} disabled={count >= MAX_WATCHES}>
                <Plus size={16} weight="bold" aria-hidden /> Add symbol
              </button>
              <button className="btn btn-secondary" onClick={sendDigest} disabled={sending}>
                <EnvelopeSimple size={16} aria-hidden /> {sending ? "Sending" : "Send digest now"}
              </button>
            </div>
          </div>
          <Movers items={items} />
        </section>
      )}

      {!items && !error && (
        <div className="hero" aria-hidden>
          <div>
            <Skel w={180} h={13} />
            <Skel w={220} h={56} style={{ margin: "10px 0" }} />
            <Skel w={240} h={13} />
          </div>
        </div>
      )}

      <section className="section" aria-labelledby="wl-title">
        <div className="section-head">
          <h2 id="wl-title">Watchlist</h2>
          <span className="faint num" style={{ fontSize: 12 }}>
            {items ? `${count}/${MAX_WATCHES}` : ""}
          </span>
          <span className="spacer" />
          <span className="faint kbd-hint" style={{ fontSize: 12 }}>
            <span className="kbd">j</span> <span className="kbd">k</span> move, <span className="kbd">e</span> edit
          </span>
        </div>

        {error && !items && <InlineError message={error} onRetry={refresh} />}
        {!items && !error && <ListSkeleton />}

        {items && items.length === 0 && (
          <div className="empty">
            <h3>Your watchlist is empty</h3>
            <p>
              Add a US stock to track its price, set alert thresholds, and include it in your daily digest.
            </p>
            <button className="btn btn-primary" onClick={openSearch}>
              <Plus size={16} weight="bold" aria-hidden /> Add symbol
            </button>
          </div>
        )}

        {items && items.length > 0 && (
          <>
            <div className="wl-head" aria-hidden>
              <span>Symbol</span>
              <span className="r">Last</span>
              <span className="r">Today</span>
              <span style={{ paddingLeft: 16 }}>Alerts: click a value to edit</span>
              <span>Status</span>
              <span />
            </div>
            <ul className="wl-list" ref={listRef} onKeyDown={onListKey} aria-label="Watchlist">
              {items.map((i) => (
                <li key={i.symbol}>
                  <Row item={i} name={names[i.symbol]} />
                </li>
              ))}
            </ul>
            {error && <InlineError message={`Could not refresh prices: ${error}`} onRetry={refresh} />}
          </>
        )}
      </section>
    </div>
  );
}
