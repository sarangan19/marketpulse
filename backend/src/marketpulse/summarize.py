"""Short per-symbol news summary via Bedrock Converse. Best effort: None on any failure."""

import logging

import boto3

from marketpulse import config

log = logging.getLogger(__name__)

PROMPT = (
    "You are writing one line of a daily market digest. Using only the headlines below about "
    "{symbol}, summarise the day's coverage in at most 3 sentences. Neutral tone, no investment "
    "advice, no speculation beyond the headlines.\n\nHeadlines:\n{lines}"
)


def _client():
    if config.stub_mode():
        from marketpulse.stubs import FakeBedrock

        return FakeBedrock()
    return boto3.client("bedrock-runtime")


def summarize(symbol: str, headlines: list[str], client=None) -> str | None:
    if not headlines:
        return None
    prompt = PROMPT.format(symbol=symbol, lines="\n".join(f"- {h}" for h in headlines))
    try:
        resp = (client or _client()).converse(
            modelId=config.bedrock_model_id(),
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": 200, "temperature": 0.2},
        )
        text = "".join(c.get("text", "") for c in resp["output"]["message"]["content"]).strip()
    except Exception:  # summaries are optional; never fail ingestion over them
        log.exception("bedrock summary failed for %s", symbol)
        return None
    return text or None
