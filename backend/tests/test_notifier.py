import json

import boto3
import pytest
from moto.core import DEFAULT_ACCOUNT_ID
from moto.ses import ses_backends
from moto.sns import sns_backends

from marketpulse import db
from marketpulse.handlers import notifier

SENDER = "alerts@marketpulse.test"


@pytest.fixture
def env(table, monkeypatch):
    boto3.client("ses").verify_email_identity(EmailAddress=SENDER)
    monkeypatch.setenv("SES_SENDER", SENDER)


def sent_emails():
    return ses_backends[DEFAULT_ACCOUNT_ID]["ap-south-1"].sent_messages


def sent_sms():
    return sns_backends[DEFAULT_ACCOUNT_ID]["ap-south-1"].sms_messages


def sns_event(**alert):
    base = {"sub": "u1", "symbol": "AAPL", "side": "UPPER", "price": 201.5, "threshold": 200.0,
            "ts": "2026-10-21T02:30:00Z"}
    return {"Records": [{"Sns": {"Message": json.dumps({**base, **alert})}}]}


def test_email_subject_upper(env):
    db.get_or_create_profile("u1", "u1@x.com")
    assert notifier.handler(sns_event(), None) == {"emails": 1, "sms": 0}
    msg = sent_emails()[-1]
    assert msg.subject == "MarketPulse alert: AAPL crossed above 200.00"
    assert msg.destinations["ToAddresses"] == ["u1@x.com"]


def test_email_subject_lower(env):
    db.get_or_create_profile("u1", "u1@x.com")
    notifier.handler(sns_event(side="LOWER", price=149.0, threshold=150.0), None)
    assert sent_emails()[-1].subject == "MarketPulse alert: AAPL fell below 150.00"


def test_sms_when_opted_in(env):
    db.get_or_create_profile("u1", "u1@x.com")
    db.update_profile("u1", smsOptIn=True, phone="+919876543210")
    assert notifier.handler(sns_event(), None) == {"emails": 1, "sms": 1}
    sms = list(sent_sms().values())[-1]
    assert sms[0] == "+919876543210"
    assert len(sms[1]) <= 160


def test_opted_in_without_phone_is_email_only(env):
    db.get_or_create_profile("u1", "u1@x.com")
    db.update_profile("u1", smsOptIn=True)
    assert notifier.handler(sns_event(), None) == {"emails": 1, "sms": 0}


def test_missing_profile_skipped(env):
    assert notifier.handler(sns_event(sub="ghost"), None) == {"emails": 0, "sms": 0}
