import type { SentimentPoint } from "../../api/types";
import { day } from "../../lib/format";

const WORD: Record<string, string> = {
  POSITIVE: "positive",
  NEGATIVE: "negative",
  NEUTRAL: "neutral",
  MIXED: "mixed",
};

/** Diverging bars around zero: one per day, height = |score|. Click a day to read it. */
export function SentimentBars({
  points,
  selected,
  onSelect,
}: {
  points: SentimentPoint[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div>
      <div className="senti-bars" role="group" aria-label="Daily news sentiment, select a day">
        {points.map((p, i) => {
          const h = `${Math.max(3, Math.abs(p.score) * 100)}%`;
          const bar = <span className={`senti-bar ${p.label}`} style={{ height: h }} />;
          return (
            <button
              key={p.date}
              className="senti-day"
              aria-pressed={i === selected}
              aria-label={`${day(p.date)}: ${WORD[p.label]}, score ${p.score.toFixed(2)}`}
              title={`${day(p.date)} ${p.score >= 0 ? "+" : ""}${p.score.toFixed(2)}`}
              onClick={() => onSelect(i)}
            >
              <span className="senti-half top">{p.score >= 0 && bar}</span>
              <span className="senti-half bottom">{p.score < 0 && bar}</span>
            </button>
          );
        })}
      </div>
      <div className="senti-axis" aria-hidden>
        <span>{points[0] && day(points[0].date)}</span>
        <span>{points.length > 1 && day(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}
