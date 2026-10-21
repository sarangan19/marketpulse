// MOCK UI — throwaway.
import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { SymbolMatch, WatchItem } from "../api/types";

const num = (s: string) => (s.trim() === "" ? null : Number(s));

export default function Watchlist() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("");
  const [upper, setUpper] = useState("");
  const [lower, setLower] = useState("");
  const [matches, setMatches] = useState<SymbolMatch[]>([]);

  const load = () => api.getWatchlist().then(setItems).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.putWatch(symbol, { upper: num(upper), lower: num(lower) });
      setSymbol("");
      setUpper("");
      setLower("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function search() {
    if (symbol.trim()) setMatches(await api.searchSymbols(symbol.trim()).catch(() => []));
  }

  return (
    <div>
      <h3>Watchlist</h3>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {msg && <p style={{ color: "green" }}>{msg}</p>}
      <table border={1} cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Price</th>
            <th>Change</th>
            <th>Lower</th>
            <th>Upper</th>
            <th>Alerts</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((w) => (
            <tr key={w.symbol}>
              <td>
                <Link to={`/symbol/${w.symbol}`}>{w.symbol}</Link>
              </td>
              <td>{w.latest?.price.toFixed(2) ?? "—"}</td>
              <td>{w.latest ? `${w.latest.changePct.toFixed(2)}%` : "—"}</td>
              <td>{w.lower ?? "—"}</td>
              <td>{w.upper ?? "—"}</td>
              <td>{JSON.stringify(w.alertState)}</td>
              <td>
                <button onClick={() => api.deleteWatch(w.symbol).then(load)}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Add / update</h4>
      <form onSubmit={save} style={{ display: "flex", gap: 8 }}>
        <input placeholder="AAPL" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
        <button type="button" onClick={search}>
          Search
        </button>
        <input placeholder="lower" value={lower} onChange={(e) => setLower(e.target.value)} />
        <input placeholder="upper" value={upper} onChange={(e) => setUpper(e.target.value)} />
        <button type="submit">Save</button>
      </form>
      {matches.length > 0 && (
        <ul>
          {matches.map((m) => (
            <li key={m.symbol}>
              <a href="#" onClick={() => (setSymbol(m.symbol), setMatches([]))}>
                {m.symbol}
              </a>{" "}
              {m.description}
            </li>
          ))}
        </ul>
      )}

      <p>
        <button
          onClick={() =>
            api
              .triggerDigest()
              .then(() => setMsg("Digest queued — check your email."))
              .catch((e) => setError(e.message))
          }
        >
          Send digest now
        </button>
      </p>
    </div>
  );
}
