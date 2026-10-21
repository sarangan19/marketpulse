"""All DynamoDB access. Callers pass and receive plain floats; Decimal stays in here."""

import time
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

from marketpulse import config
from marketpulse.keys import (
    PROFILE_SK,
    alert_sk,
    price_sk,
    sent_sk,
    symbol_pk,
    user_pk,
    watch_sk,
)

PRICE_TTL_DAYS = 30
SENT_TTL_DAYS = 90
ISO = "%Y-%m-%dT%H:%M:%SZ"

_table = None


def _reset_cache() -> None:
    global _table
    _table = None


def _tbl():
    global _table
    if _table is None:
        _table = boto3.resource("dynamodb").Table(config.table_name())
    return _table


def _to_ddb(value):
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _to_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_ddb(v) for v in value]
    return value


def _from_ddb(value):
    if isinstance(value, Decimal):
        return int(value) if value.as_tuple().exponent >= 0 else float(value)
    if isinstance(value, dict):
        return {k: _from_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_ddb(v) for v in value]
    return value


def _now_iso() -> str:
    return datetime.now(UTC).strftime(ISO)


def _ttl(days: int) -> int:
    return int(time.time()) + days * 86400


def _paged(op, **kwargs) -> list[dict]:
    items, start = [], None
    while True:
        if start:
            kwargs["ExclusiveStartKey"] = start
        resp = op(**kwargs)
        items.extend(resp.get("Items", []))
        start = resp.get("LastEvaluatedKey")
        if not start:
            return [_from_ddb(i) for i in items]


def _query_all(**kwargs) -> list[dict]:
    return _paged(_tbl().query, **kwargs)


def _scan_all(**kwargs) -> list[dict]:
    return _paged(_tbl().scan, **kwargs)


# ---- profiles -------------------------------------------------------------

def get_profile(sub: str) -> dict | None:
    item = _tbl().get_item(Key={"PK": user_pk(sub), "SK": PROFILE_SK}).get("Item")
    return _from_ddb(item) if item else None


def get_or_create_profile(sub: str, email: str) -> dict:
    existing = get_profile(sub)
    if existing:
        return existing
    item = {"PK": user_pk(sub), "SK": PROFILE_SK, "sub": sub, "email": email,
            "smsOptIn": False, "digestOptIn": True, "createdAt": _now_iso()}
    try:
        _tbl().put_item(Item=item, ConditionExpression="attribute_not_exists(PK)")
    except ClientError as e:
        if e.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        return get_profile(sub)
    return item


def update_profile(sub: str, **fields) -> dict:
    resp = _tbl().update_item(
        Key={"PK": user_pk(sub), "SK": PROFILE_SK},
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in fields),
        ExpressionAttributeNames={f"#{k}": k for k in fields},
        ExpressionAttributeValues={f":{k}": _to_ddb(v) for k, v in fields.items()},
        ReturnValues="ALL_NEW",
    )
    return _from_ddb(resp["Attributes"])


def list_profiles() -> list[dict]:
    return _scan_all(FilterExpression=Attr("SK").eq(PROFILE_SK))


# ---- watches --------------------------------------------------------------

def _watch_out(item: dict) -> dict:
    item.setdefault("upper", None)
    item.setdefault("lower", None)
    return item


def put_watch(sub: str, symbol: str, upper: float | None, lower: float | None) -> dict:
    # upper/lower are DynamoDB reserved words, so every name goes through a placeholder.
    sets = ["#symbol = :sym", "#g1pk = :g1pk", "#g1sk = :g1sk",
            "#createdAt = if_not_exists(#createdAt, :now)"]
    removes = []
    names = {"#symbol": "symbol", "#g1pk": "GSI1PK", "#g1sk": "GSI1SK",
             "#createdAt": "createdAt", "#upper": "upper", "#lower": "lower"}
    values = {":sym": symbol, ":g1pk": symbol_pk(symbol), ":g1sk": user_pk(sub),
              ":now": _now_iso()}
    for name, val in (("upper", upper), ("lower", lower)):
        if val is None:
            removes.append(f"#{name}")
        else:
            sets.append(f"#{name} = :{name}")
            values[f":{name}"] = _to_ddb(float(val))
    expr = "SET " + ", ".join(sets)
    if removes:
        expr += " REMOVE " + ", ".join(removes)
    resp = _tbl().update_item(
        Key={"PK": user_pk(sub), "SK": watch_sk(symbol)},
        UpdateExpression=expr,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
        ReturnValues="ALL_NEW",
    )
    return _watch_out(_from_ddb(resp["Attributes"]))


def get_watch(sub: str, symbol: str) -> dict | None:
    item = _tbl().get_item(Key={"PK": user_pk(sub), "SK": watch_sk(symbol)}).get("Item")
    return _watch_out(_from_ddb(item)) if item else None


def delete_watch(sub: str, symbol: str) -> None:
    _tbl().delete_item(Key={"PK": user_pk(sub), "SK": watch_sk(symbol)})


def list_watches(sub: str) -> list[dict]:
    items = _query_all(
        KeyConditionExpression=Key("PK").eq(user_pk(sub)) & Key("SK").begins_with("WATCH#")
    )
    return [_watch_out(i) for i in items]


def count_watches(sub: str) -> int:
    return len(list_watches(sub))


def distinct_symbols() -> list[str]:
    items = _scan_all(IndexName="GSI1", ProjectionExpression="GSI1PK")
    return sorted({i["GSI1PK"].removeprefix("SYMBOL#") for i in items})


def watchers(symbol: str) -> list[dict]:
    items = _query_all(IndexName="GSI1",
                       KeyConditionExpression=Key("GSI1PK").eq(symbol_pk(symbol)))
    return [_watch_out(i) for i in items]


# ---- prices & sentiment ---------------------------------------------------

def put_price(symbol: str, ts: str, quote: dict) -> None:
    item = {"PK": symbol_pk(symbol), "SK": price_sk(ts), "symbol": symbol, "ts": ts,
            "ttl": _ttl(PRICE_TTL_DAYS), **quote}
    _tbl().put_item(Item=_to_ddb(item))


def latest_price(symbol: str) -> dict | None:
    resp = _tbl().query(
        KeyConditionExpression=Key("PK").eq(symbol_pk(symbol)) & Key("SK").begins_with("PRICE#"),
        ScanIndexForward=False,
        Limit=1,
    )
    items = resp.get("Items", [])
    return _from_ddb(items[0]) if items else None


def put_sentiment(symbol: str, date: str, sentiment: dict | None, headlines: list[dict],
                  summary: str | None) -> None:
    """sentiment=None means no news or Comprehend unavailable: stored without label/score."""
    item = {"PK": symbol_pk(symbol), "SK": sent_sk(date), "symbol": symbol, "date": date,
            "ttl": _ttl(SENT_TTL_DAYS), "headlines": headlines, **(sentiment or {})}
    if summary:
        item["summary"] = summary
    _tbl().put_item(Item=_to_ddb(item))


def get_sentiment(symbol: str, date: str) -> dict | None:
    item = _tbl().get_item(Key={"PK": symbol_pk(symbol), "SK": sent_sk(date)}).get("Item")
    return _from_ddb(item) if item else None


def history(symbol: str, days: int) -> dict:
    since = datetime.now(UTC) - timedelta(days=days)
    pk = Key("PK").eq(symbol_pk(symbol))
    prices = _query_all(KeyConditionExpression=pk & Key("SK").between(
        price_sk(since.strftime(ISO)), "PRICE#~"))
    sentiment = _query_all(KeyConditionExpression=pk & Key("SK").between(
        sent_sk(since.strftime("%Y-%m-%d")), "SENT#~"))
    return {"prices": prices, "sentiment": sentiment}


# ---- alert state ----------------------------------------------------------

def transition_alert(sub: str, symbol: str, side: str, new_state: str, price: float) -> bool:
    """Write new_state only if it differs from the stored state. True iff written."""
    expr = "SET #s = :new, lastPrice = :p, updatedAt = :now, symbol = :sym, side = :side"
    if new_state == "BREACHED":
        expr += ", lastNotifiedAt = :now"
    try:
        _tbl().update_item(
            Key={"PK": user_pk(sub), "SK": alert_sk(symbol, side)},
            UpdateExpression=expr,
            ConditionExpression="attribute_not_exists(#s) OR #s <> :new",
            ExpressionAttributeNames={"#s": "state"},
            ExpressionAttributeValues={":new": new_state, ":p": _to_ddb(float(price)),
                                       ":now": _now_iso(), ":sym": symbol, ":side": side},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return False
        raise
    return True


def rollback_alert(sub: str, symbol: str, side: str) -> None:
    """Undo a BREACHED transition whose notification failed, so a retry re-notifies."""
    try:
        _tbl().update_item(
            Key={"PK": user_pk(sub), "SK": alert_sk(symbol, side)},
            UpdateExpression="SET #s = :clear",
            ConditionExpression="#s = :breached",
            ExpressionAttributeNames={"#s": "state"},
            ExpressionAttributeValues={":clear": "CLEAR", ":breached": "BREACHED"},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise


def delete_alerts(sub: str, symbol: str, sides: tuple[str, ...] = ("UPPER", "LOWER")) -> None:
    for side in sides:
        _tbl().delete_item(Key={"PK": user_pk(sub), "SK": alert_sk(symbol, side)})


def get_alert_states(sub: str, symbol: str) -> dict[str, str]:
    items = _query_all(
        KeyConditionExpression=Key("PK").eq(user_pk(sub))
        & Key("SK").begins_with(f"ALERT#{symbol}#")
    )
    return {i["side"]: i["state"] for i in items}
