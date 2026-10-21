"""DynamoDB Stream consumer: compare new prices to watchers' thresholds, publish on new breaches."""

import json
import logging

import boto3
from boto3.dynamodb.types import TypeDeserializer

from marketpulse import config, db
from marketpulse.alerts import evaluate

log = logging.getLogger()
log.setLevel(logging.INFO)

_deser = TypeDeserializer()


def _image(record: dict) -> dict:
    raw = record["dynamodb"]["NewImage"]
    return {k: _deser.deserialize(v) for k, v in raw.items()}


def handler(event, context):
    sns = boto3.client("sns")
    published = 0
    for record in event.get("Records", []):
        if record.get("eventName") != "INSERT":
            continue
        img = _image(record)
        if not img.get("SK", "").startswith("PRICE#"):
            continue
        symbol, price, ts = img["symbol"], float(img["price"]), img["ts"]
        for w in db.watchers(symbol):
            sub = w["PK"].removeprefix("USER#")
            for side, state in evaluate(price, w["upper"], w["lower"]).items():
                changed = db.transition_alert(sub, symbol, side, state, price)
                if not (changed and state == "BREACHED"):
                    continue
                threshold = w["upper"] if side == "UPPER" else w["lower"]
                sns.publish(TopicArn=config.alerts_topic_arn(), Message=json.dumps({
                    "sub": sub, "symbol": symbol, "side": side, "price": price,
                    "threshold": threshold, "ts": ts}))
                published += 1
    log.info("published %d alerts", published)
    return {"published": published}
