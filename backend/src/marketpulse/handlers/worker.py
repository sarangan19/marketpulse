"""SQS consumer: quote per symbol, plus news, sentiment and summary on daily runs."""

import json
import logging
from datetime import date, timedelta

from marketpulse import config, db
from marketpulse.finnhub import UnknownSymbol, get_client
from marketpulse.sentiment import analyze
from marketpulse.summarize import summarize

log = logging.getLogger()
log.setLevel(logging.INFO)

NEUTRAL = {"score": 0.0, "label": "NEUTRAL", "counts": {}}


class InjectedFailure(Exception):
    """Raised for FAIL_SYMBOLS to demonstrate retry -> DLQ."""


def _process(client, msg: dict) -> None:
    symbol, mode, run_at = msg["symbol"], msg["mode"], msg["runAt"]
    if symbol in config.fail_symbols():
        raise InjectedFailure(symbol)
    try:
        quote = client.quote(symbol)
    except UnknownSymbol:
        log.warning("unknown symbol %s; acking without retry", symbol)
        return
    db.put_price(symbol, run_at, quote)
    if mode != "daily":
        return
    run_date = run_at[:10]
    frm = (date.fromisoformat(run_date) - timedelta(days=1)).isoformat()
    news = client.company_news(symbol, frm, run_date)
    headlines = [n["headline"] for n in news]
    sentiment = analyze(headlines) or NEUTRAL
    summary = summarize(symbol, headlines)
    top = [{"headline": n["headline"], "source": n["source"], "url": n["url"]} for n in news[:5]]
    db.put_sentiment(symbol, run_date, sentiment, top, summary)


def handler(event, context):
    client = get_client()
    failures = []
    for record in event.get("Records", []):
        try:
            _process(client, json.loads(record["body"]))
        except Exception:
            log.exception("failed message %s", record.get("messageId"))
            failures.append({"itemIdentifier": record["messageId"]})
    return {"batchItemFailures": failures}
