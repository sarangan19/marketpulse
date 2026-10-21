"""One-off: backfill daily news sentiment (real Finnhub headlines) for the last N days.

Finnhub's free plan has no historical prices, so only SENT# items are backfilled. Days without
headlines are skipped (charts show a gap, not a fake neutral). Existing days are not overwritten.

Usage (credentials via AWS_PROFILE):
  backend/.venv/Scripts/python scripts/backfill_sentiment.py --env staging --days 30 [SYM ...]
"""

import argparse
import os
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend" / "src"))

DEMO = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "TSLA", "META", "JPM"]
FINNHUB_PAUSE_S = 1.1  # free plan: 60 calls/minute


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--env", default="staging")
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("symbols", nargs="*")
    args = ap.parse_args()

    os.environ.setdefault("AWS_DEFAULT_REGION", "ap-south-1")
    os.environ["TABLE_NAME"] = f"marketpulse-{args.env}"
    os.environ["FINNHUB_SECRET_ARN"] = f"marketpulse/{args.env}/finnhub"

    from marketpulse import db
    from marketpulse.finnhub import UpstreamError, get_client
    from marketpulse.sentiment import analyze

    symbols = sorted(set(args.symbols or DEMO) | set(db.distinct_symbols()))
    client = get_client()
    today = datetime.now(UTC).date()
    for sym in symbols:
        written = skipped = 0
        for back in range(1, args.days + 1):
            day = (today - timedelta(days=back)).isoformat()
            if db.get_sentiment(sym, day):
                skipped += 1
                continue
            try:
                news = client.company_news(sym, day, day)
            except UpstreamError as e:
                print(f"  {sym} {day}: finnhub error {e}; waiting 30s")
                time.sleep(30)
                continue
            finally:
                time.sleep(FINNHUB_PAUSE_S)
            if not news:
                continue
            sentiment = analyze([n["headline"] for n in news])
            if sentiment is None:
                print(f"  {sym} {day}: sentiment unavailable, skipped")
                continue
            top = [{"headline": n["headline"], "source": n["source"], "url": n["url"]}
                   for n in news[:5]]
            db.put_sentiment(sym, day, sentiment, top, None)
            written += 1
        print(f"{sym}: wrote {written} days, {skipped} already present")


if __name__ == "__main__":
    main()
