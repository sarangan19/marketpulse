import json

import boto3
import pytest

from marketpulse import db
from marketpulse.handlers import dispatcher


@pytest.fixture
def queue(table, monkeypatch):
    sqs = boto3.client("sqs")
    url = sqs.create_queue(QueueName="ingest")["QueueUrl"]
    monkeypatch.setenv("QUEUE_URL", url)
    return sqs, url


def drain(sqs, url):
    bodies = []
    while True:
        msgs = sqs.receive_message(QueueUrl=url, MaxNumberOfMessages=10).get("Messages", [])
        if not msgs:
            return bodies
        for m in msgs:
            bodies.append(json.loads(m["Body"]))
            sqs.delete_message(QueueUrl=url, ReceiptHandle=m["ReceiptHandle"])


def test_one_message_per_distinct_symbol(queue):
    sqs, url = queue
    for i in range(12):
        db.put_watch("u1", f"S{chr(65 + i)}", 10.0, None)
    db.put_watch("u2", "SA", 11.0, None)  # duplicate symbol across users
    assert dispatcher.handler({"mode": "daily"}, None) == {"dispatched": 12}
    bodies = drain(sqs, url)
    assert sorted(b["symbol"] for b in bodies) == [f"S{chr(65 + i)}" for i in range(12)]
    assert {b["mode"] for b in bodies} == {"daily"}
    assert all(b["runAt"].endswith("Z") for b in bodies)


def test_default_mode_is_intraday(queue):
    sqs, url = queue
    db.put_watch("u1", "AAPL", 10.0, None)
    dispatcher.handler({}, None)
    assert drain(sqs, url)[0]["mode"] == "intraday"


def test_invalid_mode_rejected(queue):
    with pytest.raises(ValueError):
        dispatcher.handler({"mode": "weekly"}, None)


def test_no_watches_sends_nothing(queue):
    sqs, url = queue
    assert dispatcher.handler({"mode": "daily"}, None) == {"dispatched": 0}
    assert drain(sqs, url) == []
