"""Scheduled entry point: fan out one SQS message per distinct watched symbol."""

import json
import logging
from datetime import UTC, datetime

import boto3

from marketpulse import config, db

log = logging.getLogger()
log.setLevel(logging.INFO)

MODES = {"daily", "intraday"}


def handler(event, context):
    mode = (event or {}).get("mode", "intraday")
    if mode not in MODES:
        raise ValueError(f"unknown mode {mode!r}")
    run_at = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    symbols = db.distinct_symbols()
    sqs = boto3.client("sqs")
    for i in range(0, len(symbols), 10):
        chunk = symbols[i:i + 10]
        resp = sqs.send_message_batch(QueueUrl=config.queue_url(), Entries=[
            {"Id": str(n), "MessageBody": json.dumps({"symbol": s, "mode": mode, "runAt": run_at})}
            for n, s in enumerate(chunk)
        ])
        if resp.get("Failed"):
            raise RuntimeError(f"failed to enqueue: {resp['Failed']}")
    log.info("dispatched %d symbols mode=%s runAt=%s", len(symbols), mode, run_at)
    return {"dispatched": len(symbols)}
