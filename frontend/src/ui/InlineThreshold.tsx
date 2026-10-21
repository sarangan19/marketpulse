import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { WatchItem } from "../api/types";
import { errorMessage, price as fmt } from "../lib/format";
import { checkThreshold, type Side } from "../lib/thresholds";
import { useWatchlist } from "../state/watchlist";
import { useToast } from "./toast";

const LABEL: Record<Side, string> = { lower: "Below", upper: "Above" };

/**
 * One side of a row's alert band, edited in place: click the value, type, Enter (or click away)
 * saves, Esc cancels. An empty value turns that side off.
 */
export function InlineThreshold({ item, side }: { item: WatchItem; side: Side }) {
  const { save, inline, clearInline } = useWatchlist();
  const toast = useToast();
  const current = item[side];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  const price = item.latest?.price ?? null;
  const hit =
    current != null && price != null && (side === "upper" ? price >= current : price <= current);
  const errId = `th-${item.symbol}-${side}-err`;

  function start() {
    cancelled.current = false;
    setDraft(current != null ? String(current) : "");
    setError(null);
    setEditing(true);
  }

  // Opened from elsewhere: the "e" shortcut or the "Set alerts" toast after adding a symbol.
  useEffect(() => {
    if (inline && inline.symbol === item.symbol && inline.side === side) {
      start();
      clearInline();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inline]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function commit() {
    if (cancelled.current || saving) return;
    const r = checkThreshold(side, draft, { upper: item.upper, lower: item.lower });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (r.value === current) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await save(item.symbol, {
        upper: side === "upper" ? r.value : item.upper,
        lower: side === "lower" ? r.value : item.lower,
      });
      setEditing(false);
      toast.show(
        "success",
        r.value == null
          ? `${item.symbol}: alert ${LABEL[side].toLowerCase()} turned off`
          : `${item.symbol}: alert ${LABEL[side].toLowerCase()} $${fmt(r.value)}`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    e.stopPropagation(); // keep j/k/e list shortcuts from firing while typing
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelled.current = true;
      setEditing(false);
      setError(null);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={`th-pill ${current == null ? "unset" : ""} ${hit ? "hit" : ""}`}
        data-threshold={side}
        onClick={start}
        aria-label={
          current == null
            ? `Set an alert when ${item.symbol} goes ${LABEL[side].toLowerCase()} a price`
            : `Alert ${LABEL[side].toLowerCase()} ${fmt(current)} for ${item.symbol}. Click to edit`
        }
        title="Click to edit"
      >
        {current == null ? (
          <span className="th-add">+ {LABEL[side]}</span>
        ) : (
          <>
            <span className="th-k">{LABEL[side]}</span>
            <span className="num">{fmt(current)}</span>
          </>
        )}
      </button>
    );
  }

  return (
    <span className="th-edit" data-threshold={side}>
      <span className="input-affix th-affix">
        <span className="prefix">$</span>
        <input
          ref={inputRef}
          className="input num th-input"
          inputMode="decimal"
          autoComplete="off"
          placeholder="off"
          value={draft}
          disabled={saving}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={onKey}
          onBlur={commit}
          aria-label={`Alert ${LABEL[side].toLowerCase()} for ${item.symbol}. Enter to save, Escape to cancel, empty to turn off`}
          aria-invalid={!!error}
          aria-describedby={error ? errId : undefined}
          autoFocus
        />
      </span>
      {error && (
        <span className="th-err" id={errId} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
