from datetime import UTC, datetime

import boto3
import pytest
from moto.core import DEFAULT_ACCOUNT_ID
from moto.ses import ses_backends

from marketpulse import db
from marketpulse.handlers import digest

SENDER = "digest@marketpulse.test"
TODAY = datetime.now(UTC).strftime("%Y-%m-%d")


@pytest.fixture
def env(table, monkeypatch):
    boto3.client("ses").verify_email_identity(EmailAddress=SENDER)
    monkeypatch.setenv("SES_SENDER", SENDER)
    db.get_or_create_profile("normal", "normal@x.com")
    db.put_watch("normal", "AAPL", 200.0, None)
    db.get_or_create_profile("empty", "empty@x.com")
    db.get_or_create_profile("optout", "optout@x.com")
    db.update_profile("optout", digestOptIn=False)
    db.put_watch("optout", "MSFT", None, 100.0)
    db.put_price("AAPL", f"{TODAY}T02:30:00Z", {"price": 201.0, "changePct": 0.5})
    db.put_sentiment("AAPL", TODAY, {"score": 0.3, "label": "POSITIVE", "counts": {}},
                     [{"headline": "Apple beats", "url": "u", "source": "s"}], "Good day.")


def sent():
    return ses_backends[DEFAULT_ACCOUNT_ID]["ap-south-1"].sent_messages


def test_scheduled_run_skips_empty_and_opted_out(env):
    assert digest.handler({}, None) == {"sent": 1, "failed": 0}
    msg = sent()[-1]
    assert msg.destinations["ToAddresses"] == ["normal@x.com"]
    assert "Apple beats" in msg.body
    assert "Good day." in msg.body


def test_manual_trigger_targets_one_user_even_if_opted_out(env):
    assert digest.handler({"sub": "optout"}, None) == {"sent": 1, "failed": 0}
    msg = sent()[-1]
    assert msg.destinations["ToAddresses"] == ["optout@x.com"]
    assert "MSFT" in msg.body
    assert "No news today" in msg.body


def test_manual_trigger_empty_watchlist_sends_nothing(env):
    assert digest.handler({"sub": "empty"}, None) == {"sent": 0, "failed": 0}


def test_one_rejected_recipient_does_not_block_others(env, monkeypatch):
    db.get_or_create_profile("aaa", "unverified@x.com")
    db.put_watch("aaa", "AAPL", 200.0, None)
    real = boto3.client

    class PickySes:
        def __init__(self):
            self._ses = real("ses")

        def send_email(self, **kw):
            if kw["Destination"]["ToAddresses"] == ["unverified@x.com"]:
                from botocore.exceptions import ClientError
                raise ClientError({"Error": {"Code": "MessageRejected", "Message": "no"}},
                                  "SendEmail")
            return self._ses.send_email(**kw)

    monkeypatch.setattr(digest.boto3, "client",
                        lambda name, *a, **k: PickySes() if name == "ses" else real(name))
    assert digest.handler({}, None) == {"sent": 1, "failed": 1}
    assert sent()[-1].destinations["ToAddresses"] == ["normal@x.com"]


def test_digest_links_to_app_when_configured(env, monkeypatch):
    monkeypatch.setenv("APP_URL", "https://app.example.com")
    digest.handler({"sub": "normal"}, None)
    assert 'href="https://app.example.com/symbol/AAPL"' in sent()[-1].body
