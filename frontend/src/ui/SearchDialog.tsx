import { ArrowElbowDownLeft, MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { SymbolMatch } from "../api/types";
import { errorMessage } from "../lib/format";
import { MAX_WATCHES, useWatchlist } from "../state/watchlist";
import { Dialog } from "./Dialog";
import { Skel } from "./bits";

export function SearchDialog() {
  const { searchOpen, closeSearch, items, add, rememberNames } = useWatchlist();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SymbolMatch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const listId = useId();

  useEffect(() => {
    if (!searchOpen) {
      setQ("");
      setResults(null);
      setError(null);
      setActive(0);
    }
  }, [searchOpen]);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const hits = await api.searchSymbols(query.slice(0, 20));
        if (stale) return;
        setResults(hits);
        rememberNames(hits);
        setError(null);
        setActive(0);
      } catch (e) {
        if (!stale) setError(errorMessage(e));
      } finally {
        if (!stale) setLoading(false);
      }
    }, 220);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q, rememberNames]);

  const watched = new Set(items?.map((i) => i.symbol));
  const full = (items?.length ?? 0) >= MAX_WATCHES;

  async function choose(m: SymbolMatch) {
    if (watched.has(m.symbol)) {
      closeSearch();
      navigate(`/symbol/${encodeURIComponent(m.symbol)}`);
      return;
    }
    setBusy(m.symbol);
    const ok = await add(m.symbol);
    setBusy(null);
    if (ok) closeSearch();
  }

  function onKey(e: React.KeyboardEvent) {
    if (!results?.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[active]);
    }
  }

  return (
    <Dialog open={searchOpen} onClose={closeSearch} title="Search symbols" hideHeader className="dlg-search">
      <div className="search-field">
        <MagnifyingGlass size={18} aria-hidden />
        <input
          autoFocus
          role="combobox"
          aria-expanded={!!results?.length}
          aria-controls={listId}
          aria-activedescendant={results?.length ? `${listId}-${active}` : undefined}
          aria-label="Search US stocks by ticker or company"
          placeholder="Ticker or company, e.g. NVDA"
          value={q}
          maxLength={20}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      {error ? (
        <p className="search-msg" role="alert">
          {error}
        </p>
      ) : loading && !results ? (
        <div className="search-results" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="search-opt">
              <Skel w={44} />
              <Skel w={`${60 - i * 12}%`} />
              <span />
            </div>
          ))}
        </div>
      ) : results && results.length === 0 ? (
        <p className="search-msg">No US stocks match "{q.trim()}".</p>
      ) : results ? (
        <ul className="search-results" role="listbox" id={listId} aria-label="Matches">
          {results.map((m, i) => {
            const isWatched = watched.has(m.symbol);
            return (
              <li
                key={m.symbol}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className="search-opt"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(m)}
              >
                <span className="sym">{m.symbol}</span>
                <span className="desc">{m.description}</span>
                <span className="hint">
                  {busy === m.symbol ? "Adding" : isWatched ? "Open" : full ? "List full" : "Add"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="search-msg">
          Search US common stocks. Your watchlist holds up to {MAX_WATCHES} symbols
          {items ? ` (${items.length} used)` : ""}.
        </p>
      )}
      <div className="search-foot" aria-hidden>
        <span>
          <span className="kbd">↑</span>
          <span className="kbd">↓</span> move
        </span>
        <span>
          <span className="kbd">
            <ArrowElbowDownLeft size={11} />
          </span>
          add or open
        </span>
        <span>
          <span className="kbd">esc</span> close
        </span>
      </div>
    </Dialog>
  );
}
