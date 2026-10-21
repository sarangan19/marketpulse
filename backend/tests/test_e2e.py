"""In-process pipeline test: dispatcher -> SQS -> worker -> stream -> evaluator -> SNS -> notifier,
then the digest. moto has no Lambda event-source wiring, so this test plays the glue role."""

import json
from datetime import UTC, datetime

import boto3
from boto3.dynamodb.types import TypeSerializer
from moto.core import DEFAULT_ACCOUNT_ID
from moto.ses import ses_backends

from marketpulse import db
from marketpulse.handlers import digest, dispatcher, evaluator, notifier, worker
from marketpulse.stubs import FakeFinnhub

SENDER = "mp@marketpulse.test"
_ser = TypeSerializer()


def test_daily_run_end_to_end(table, monkeypatch):
    monkeypatch.setenv("MARKETPULSE_STUB", "1")
    sqs, sns = boto3.client("sqs"), boto3.client("sns")
    q = sqs.create_queue(QueueName="ingest")["QueueUrl"]
    topic = sns.create_topic(Name="alerts")["TopicArn"]
    boto3.client("ses").verify_email_identity(EmailAddress=SENDER)
    monkeypatch.setenv("QUEUE_URL", q)
    monkeypatch.setenv("ALERTS_TOPIC_ARN", topic)
    monkeypatch.setenv("SES_SENDER", SENDER)

    aapl = FakeFinnhub().quote("AAPL")["price"]
    db.get_or_create_profile("u1", "u1@x.com")
    db.put_watch("u1", "AAPL", aapl - 1, None)  # already above upper -> breach
    db.put_watch("u1", "MSFT", None, 1.0)  # far from lower -> no alert

    # 1. scheduler -> dispatcher
    assert dispatcher.handler({"mode": "daily"}, None) == {"dispatched": 2}

    # 2. SQS -> worker
    msgs = sqs.receive_message(QueueUrl=q, MaxNumberOfMessages=10)["Messages"]
    records = [{"messageId": m["MessageId"], "body": m["Body"]} for m in msgs]
    assert worker.handler({"Records": records}, None) == {"batchItemFailures": []}

    # 3. DynamoDB stream (INSERT of PRICE# items) -> evaluator; capture SNS publishes
    published = []
    real_client = boto3.client

    class CapturingSns:
        def publish(self, **kw):
            published.append(kw)
            return real_client("sns").publish(**kw)

    def fake_client(name, *a, **k):
        return CapturingSns() if name == "sns" else real_client(name)

    monkeypatch.setattr(evaluator.boto3, "client", fake_client)
    stream = {"Records": [
        {"eventName": "INSERT", "dynamodb": {"NewImage": {
            k: _ser.serialize(v) for k, v in db._to_ddb(db.latest_price(sym)).items()}}}
        for sym in ("AAPL", "MSFT")
    ]}
    assert evaluator.handler(stream, None) == {"published": 1}

    # 4. SNS -> notifier
    sns_event = {"Records": [{"Sns": {"Message": p["Message"]}} for p in published]}
    assert notifier.handler(sns_event, None) == {"emails": 1, "sms": 0}

    # 5. digest
    assert digest.handler({}, None) == {"sent": 1}
    sent = ses_backends[DEFAULT_ACCOUNT_ID]["ap-south-1"].sent_messages
    subjects = [m.subject for m in sent]
    assert any(s.startswith("MarketPulse alert: AAPL crossed above") for s in subjects)
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    assert f"MarketPulse digest — {today}" in subjects
    digest_body = next(m.body for m in sent if m.subject.startswith("MarketPulse digest"))
    assert "AAPL" in digest_body and "MSFT" in digest_body
    assert "Stub summary" in digest_body
    assert json.loads(published[0]["Message"])["side"] == "UPPER"
