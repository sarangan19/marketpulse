"""Daily digest: one HTML email per user summarising their watchlist."""

import logging
from datetime import UTC, datetime

import boto3
from botocore.exceptions import ClientError

from marketpulse import config, db
from marketpulse.digest_render import render

log = logging.getLogger()
log.setLevel(logging.INFO)


def _items(sub: str, date: str) -> list[dict]:
    items = []
    for w in db.list_watches(sub):
        sym = w["symbol"]
        price = db.latest_price(sym) or {}
        sent = db.get_sentiment(sym, date) or {}
        items.append({"symbol": sym, "price": price.get("price"),
                      "changePct": price.get("changePct"), "label": sent.get("label"),
                      "score": sent.get("score"), "summary": sent.get("summary"),
                      "headlines": sent.get("headlines", [])})
    return items


def handler(event, context):
    date = datetime.now(UTC).strftime("%Y-%m-%d")
    target = (event or {}).get("sub")
    if target:
        profile = db.get_profile(target)
        profiles = [profile] if profile else []
    else:
        profiles = [p for p in db.list_profiles() if p.get("digestOptIn", True)]
    ses = boto3.client("ses")
    sent = failed = 0
    for p in profiles:
        items = _items(p["sub"], date)
        if not items:
            continue
        subject, html, text = render(p["email"], date, items, app_url=config.app_url())
        try:
            ses.send_email(Source=config.ses_sender(), Destination={"ToAddresses": [p["email"]]},
                           Message={"Subject": {"Data": subject, "Charset": "UTF-8"},
                                    "Body": {"Html": {"Data": html, "Charset": "UTF-8"},
                                             "Text": {"Data": text, "Charset": "UTF-8"}}})
        except ClientError:
            # e.g. MessageRejected for an unverified address in the SES sandbox. Do not raise:
            # an async retry would re-send to everyone already emailed.
            log.exception("digest to %s failed", p["email"])
            failed += 1
            continue
        sent += 1
    log.info("sent %d digests, %d failed", sent, failed)
    return {"sent": sent, "failed": failed}
