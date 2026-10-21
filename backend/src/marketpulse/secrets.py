"""Finnhub API key from Secrets Manager, fetched once per cold start."""

import json

import boto3

from marketpulse import config

_key: str | None = None


def _reset_cache() -> None:
    global _key
    _key = None


def finnhub_api_key() -> str:
    global _key
    if config.stub_mode():
        return "stub"
    if _key is None:
        raw = boto3.client("secretsmanager").get_secret_value(
            SecretId=config.finnhub_secret_arn())["SecretString"]
        _key = json.loads(raw)["api_key"]
    return _key
