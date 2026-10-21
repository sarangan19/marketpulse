import json

import boto3
import pytest

from marketpulse import db
from marketpulse.handlers import evaluator


@pytest.fixture
def topic(table, monkeypatch):
    sns, sqs = boto3.client("sns"), boto3.client("sqs")
    arn = sns.create_topic(Name="alerts")["TopicArn"]
    q = sqs.create_queue(QueueName="alerts-sink")["QueueUrl"]
    q_arn = sqs.get_queue_attributes(QueueUrl=q, AttributeNames=["QueueArn"])["Attributes"][
        "QueueArn"]
    sns.subscribe(TopicArn=arn, Protocol="sqs", Endpoint=q_arn,
                  Attributes={"RawMessageDelivery": "true"})
    monkeypatch.setenv("ALERTS_TOPIC_ARN", arn)

    def published():
        out = []
        while True:
            msgs = sqs.receive_message(QueueUrl=q, MaxNumberOfMessages=10).get("Messages", [])
            if not msgs:
                return out
            for m in msgs:
                out.append(json.loads(m["Body"]))
                sqs.delete_message(QueueUrl=q, ReceiptHandle=m["ReceiptHandle"])

    return published


def stream(price, sym="AAPL", ts="2026-10-21T02:30:00Z", event="INSERT"):
    return {"Records": [{"eventName": event, "dynamodb": {"NewImage": {
        "PK": {"S": f"SYMBOL#{sym}"}, "SK": {"S": f"PRICE#{ts}"},
        "symbol": {"S": sym}, "ts": {"S": ts}, "price": {"N": str(price)}}}}]}


def test_breach_publishes_once(topic):
    db.put_watch("u1", "AAPL", 200.0, 150.0)
    assert evaluator.handler(stream(201.5), None) == {"published": 1}
    msgs = topic()
    assert msgs == [{"sub": "u1", "symbol": "AAPL", "side": "UPPER", "price": 201.5,
                     "threshold": 200.0, "ts": "2026-10-21T02:30:00Z"}]


def test_duplicate_delivery_publishes_once(topic):
    db.put_watch("u1", "AAPL", 200.0, None)
    evaluator.handler(stream(201), None)
    evaluator.handler(stream(201), None)
    evaluator.handler(stream(205, ts="2026-10-21T02:45:00Z"), None)  # sustained breach
    assert len(topic()) == 1


def test_rearms_after_returning_inside_band(topic):
    db.put_watch("u1", "AAPL", 200.0, None)
    evaluator.handler(stream(201), None)
    evaluator.handler(stream(190, ts="2026-10-21T02:45:00Z"), None)
    evaluator.handler(stream(202, ts="2026-10-21T03:00:00Z"), None)
    assert len(topic()) == 2


def test_multiple_watchers(topic):
    db.put_watch("u1", "AAPL", 200.0, None)
    db.put_watch("u2", "AAPL", None, 210.0)
    db.put_watch("u3", "AAPL", 300.0, None)
    evaluator.handler(stream(205), None)
    assert sorted((m["sub"], m["side"]) for m in topic()) == [("u1", "UPPER"), ("u2", "LOWER")]


def test_ignores_non_insert_and_non_price(topic):
    db.put_watch("u1", "AAPL", 200.0, None)
    assert evaluator.handler(stream(201, event="MODIFY"), None) == {"published": 0}
    ev = stream(201)
    ev["Records"][0]["dynamodb"]["NewImage"]["SK"] = {"S": "SENT#2026-10-21"}
    assert evaluator.handler(ev, None) == {"published": 0}
    assert topic() == []


def test_failed_publish_rolls_back_so_retry_alerts(topic, monkeypatch):
    db.put_watch("u1", "AAPL", 200.0, None)
    real = boto3.client

    class FailingSns:
        def publish(self, **kw):
            raise RuntimeError("throttled")

    monkeypatch.setattr(evaluator.boto3, "client",
                        lambda name, *a, **k: FailingSns() if name == "sns" else real(name))
    with pytest.raises(RuntimeError):
        evaluator.handler(stream(201), None)
    assert db.get_alert_states("u1", "AAPL") == {"UPPER": "CLEAR"}
    monkeypatch.setattr(evaluator.boto3, "client", real)
    assert evaluator.handler(stream(201), None) == {"published": 1}  # stream retry
