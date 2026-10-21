// MOCK UI — throwaway.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import type { History } from "../api/types";

export default function SymbolDetail() {
  const { symbol = "" } = useParams();
  const [days, setDays] = useState(7);
  const [hist, setHist] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getHistory(symbol, days).then(setHist).catch((e) => setError(e.message));
  }, [symbol, days]);

  if (error) return <p style={{ color: "crimson" }}>{error}</p>;
  if (!hist) return <p>Loading…</p>;
  const latest = hist.sentiment.at(-1);

  return (
    <div>
      <h3>
        {symbol}{" "}
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[1, 7, 14, 30].map((d) => (
            <option key={d} value={d}>
              {d}d
            </option>
          ))}
        </select>
      </h3>
      <h4>Price</h4>
      <LineChart width={800} height={250} data={hist.prices}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="ts" tickFormatter={(t: string) => t.slice(5, 16)} />
        <YAxis domain={["auto", "auto"]} />
        <Tooltip />
        <Line type="monotone" dataKey="price" dot={false} />
      </LineChart>
      <h4>Daily sentiment (−1 … 1)</h4>
      <BarChart width={800} height={200} data={hist.sentiment}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis domain={[-1, 1]} />
        <Tooltip />
        <Bar dataKey="score" />
      </BarChart>
      {latest && (
        <div>
          <h4>
            Latest: {latest.label} ({latest.score}) on {latest.date}
          </h4>
          {latest.summary && <p>{latest.summary}</p>}
          <ul>
            {latest.headlines.map((h) => (
              <li key={h.url + h.headline}>
                <a href={h.url} target="_blank" rel="noreferrer">
                  {h.headline}
                </a>{" "}
                ({h.source})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
