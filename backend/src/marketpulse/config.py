"""Environment variable accessors. Read lazily so tests can monkeypatch."""

import os

DEFAULT_BEDROCK_MODEL = "apac.amazon.nova-micro-v1:0"


def _req(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"missing required env var {name}")
    return value


def table_name() -> str:
    return _req("TABLE_NAME")


def queue_url() -> str:
    return _req("QUEUE_URL")


def alerts_topic_arn() -> str:
    return _req("ALERTS_TOPIC_ARN")


def finnhub_secret_arn() -> str:
    return _req("FINNHUB_SECRET_ARN")


def ses_sender() -> str:
    return _req("SES_SENDER")


def digest_function_name() -> str:
    return _req("DIGEST_FUNCTION_NAME")


def bedrock_model_id() -> str:
    return os.environ.get("BEDROCK_MODEL_ID") or DEFAULT_BEDROCK_MODEL


def fail_symbols() -> set[str]:
    raw = os.environ.get("FAIL_SYMBOLS", "")
    return {s.strip().upper() for s in raw.split(",") if s.strip()}


def stub_mode() -> bool:
    return os.environ.get("MARKETPULSE_STUB") == "1"
