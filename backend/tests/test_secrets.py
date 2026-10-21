import json

import boto3

from marketpulse import secrets


def test_secret_read_once_and_cached(aws, monkeypatch):
    sm = boto3.client("secretsmanager")
    arn = sm.create_secret(Name="marketpulse/test/finnhub",
                           SecretString=json.dumps({"api_key": "abc"}))["ARN"]
    monkeypatch.setenv("FINNHUB_SECRET_ARN", arn)
    secrets._reset_cache()
    assert secrets.finnhub_api_key() == "abc"
    sm.put_secret_value(SecretId=arn, SecretString=json.dumps({"api_key": "changed"}))
    assert secrets.finnhub_api_key() == "abc"
    secrets._reset_cache()


def test_secret_stub_mode(monkeypatch):
    monkeypatch.setenv("MARKETPULSE_STUB", "1")
    secrets._reset_cache()
    assert secrets.finnhub_api_key() == "stub"
