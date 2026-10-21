"""Comprehend sentiment wrapper and pure aggregation (spec section 3)."""

import logging

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from marketpulse import config

log = logging.getLogger(__name__)

THRESHOLD = 0.15
MIXED_THRESHOLD = 0.3
BATCH = 25
LABELS = ("POSITIVE", "NEGATIVE", "NEUTRAL", "MIXED")


def aggregate(results: list[dict]) -> dict:
    counts = dict.fromkeys(LABELS, 0)
    if not results:
        return {"score": 0.0, "label": "NEUTRAL", "counts": counts}
    for res in results:
        if res.get("Sentiment") in counts:
            counts[res["Sentiment"]] += 1
    scores = [res["SentimentScore"] for res in results]
    score = round(sum(s["Positive"] - s["Negative"] for s in scores) / len(scores), 3)
    mixed = sum(s["Mixed"] for s in scores) / len(scores)
    if score >= THRESHOLD:
        label = "POSITIVE"
    elif score <= -THRESHOLD:
        label = "NEGATIVE"
    elif mixed > MIXED_THRESHOLD:
        label = "MIXED"
    else:
        label = "NEUTRAL"
    return {"score": score, "label": label, "counts": counts}


def _client():
    if config.stub_mode():
        from marketpulse.stubs import FakeComprehend

        return FakeComprehend()
    return boto3.client("comprehend")


def analyze(headlines: list[str], client=None) -> dict | None:
    if not headlines:
        return aggregate([])
    client = client or _client()
    results = []
    try:
        for i in range(0, len(headlines), BATCH):
            resp = client.batch_detect_sentiment(TextList=headlines[i:i + BATCH],
                                                 LanguageCode="en")
            results.extend(resp["ResultList"])
    except (ClientError, BotoCoreError):
        log.exception("comprehend failed; continuing without sentiment")
        return None
    return aggregate(results)
