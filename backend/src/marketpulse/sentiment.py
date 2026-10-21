"""Comprehend sentiment wrapper and pure aggregation (spec section 3).

If Comprehend is unavailable (e.g. accounts on the AWS Free plan get SubscriptionRequiredException),
headlines are labelled by the Bedrock model instead and run through the same aggregation.
"""

import json
import logging
import re

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


BEDROCK_PROMPT = (
    "Classify the sentiment of each financial news headline below as exactly one of "
    "POSITIVE, NEGATIVE, NEUTRAL or MIXED, from the perspective of the company's investors. "
    "Reply with only a JSON array of {n} labels, in the same order, and nothing else.\n\n{lines}"
)


def _bedrock_results(headlines: list[str], client) -> list[dict] | None:
    """Label headlines with the Bedrock model; shaped like Comprehend's ResultList."""
    from marketpulse.summarize import _client as bedrock_client

    lines = "\n".join(f"{i}. {h}" for i, h in enumerate(headlines, 1))
    try:
        resp = (client or bedrock_client()).converse(
            modelId=config.bedrock_model_id(),
            messages=[{"role": "user", "content": [{"text": BEDROCK_PROMPT.format(
                n=len(headlines), lines=lines)}]}],
            inferenceConfig={"maxTokens": 300, "temperature": 0},
        )
        text = "".join(c.get("text", "") for c in resp["output"]["message"]["content"])
        match = re.search(r"\[.*\]", text, re.S)
        labels = json.loads(match.group(0)) if match else None
    except Exception:
        log.exception("bedrock sentiment fallback failed")
        return None
    if (not isinstance(labels, list) or len(labels) != len(headlines)
            or not all(isinstance(lb, str) and lb.upper() in LABELS for lb in labels)):
        log.warning("bedrock sentiment fallback returned unusable output: %r", text[:200])
        return None
    return [{"Sentiment": lb.upper(),
             "SentimentScore": {k.title(): float(k == lb.upper()) for k in LABELS}}
            for lb in labels]


def analyze(headlines: list[str], client=None, fallback=None) -> dict | None:
    """Aggregate sentiment with a `source` of comprehend or bedrock; None if both fail."""
    if not headlines:
        return aggregate([])
    client = client or _client()
    results = []
    try:
        for i in range(0, len(headlines), BATCH):
            resp = client.batch_detect_sentiment(TextList=headlines[i:i + BATCH],
                                                 LanguageCode="en")
            results.extend(resp["ResultList"])
        return {**aggregate(results), "source": "comprehend"}
    except (ClientError, BotoCoreError) as e:
        log.warning("comprehend failed (%s); falling back to bedrock", e)
    fallback_results = _bedrock_results(headlines, fallback)
    if fallback_results is None:
        return None
    return {**aggregate(fallback_results), "source": "bedrock"}
