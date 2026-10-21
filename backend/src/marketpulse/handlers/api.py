"""HTTP API (payload v2) router for watchlist, profile, history and digest routes."""

import base64
import json
import logging
import re

import boto3

from marketpulse import config, db
from marketpulse.finnhub import SYMBOL_RE, UnknownSymbol, UpstreamError, get_client

log = logging.getLogger()
log.setLevel(logging.INFO)

MAX_WATCHES = 20
PHONE_RE = re.compile(r"^\+[1-9]\d{7,14}$")
PROFILE_FIELDS = {"phone", "smsOptIn", "digestOptIn"}


class HttpError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _resp(status: int, body=None) -> dict:
    out = {"statusCode": status, "headers": {"content-type": "application/json"}}
    if body is not None:
        out["body"] = json.dumps(body)
    return out


def _lambda_client():
    return boto3.client("lambda")


def _body(event) -> dict:
    raw = event.get("body")
    if not raw:
        return {}
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode()
    try:
        data = json.loads(raw)
    except ValueError as e:
        raise HttpError(400, "invalid JSON body") from e
    if not isinstance(data, dict):
        raise HttpError(400, "body must be a JSON object")
    return data


def _symbol(event) -> str:
    sym = (event.get("pathParameters") or {}).get("symbol", "").upper()
    if not SYMBOL_RE.match(sym):
        raise HttpError(400, "invalid symbol")
    return sym


def _threshold(body: dict, name: str) -> float | None:
    val = body.get(name)
    if val is None:
        return None
    if isinstance(val, bool) or not isinstance(val, int | float) or val <= 0:
        raise HttpError(400, f"{name} must be a positive number")
    return float(val)


def _claims(event) -> tuple[str, str]:
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    return claims["sub"], claims.get("email", "")


# ---- routes ---------------------------------------------------------------

def get_me(event, sub, email):
    return 200, db.get_or_create_profile(sub, email)


def put_me(event, sub, email):
    body = _body(event)
    unknown = set(body) - PROFILE_FIELDS
    if unknown:
        raise HttpError(400, f"unknown fields: {', '.join(sorted(unknown))}")
    for flag in ("smsOptIn", "digestOptIn"):
        if flag in body and not isinstance(body[flag], bool):
            raise HttpError(400, f"{flag} must be a boolean")
    if "phone" in body and not (isinstance(body["phone"], str) and PHONE_RE.match(body["phone"])):
        raise HttpError(400, "phone must be E.164, e.g. +919876543210")
    profile = db.get_or_create_profile(sub, email)
    if body.get("smsOptIn") and not (body.get("phone") or profile.get("phone")):
        raise HttpError(400, "smsOptIn requires a phone number")
    if not body:
        return 200, profile
    return 200, db.update_profile(sub, **body)


def get_watchlist(event, sub, email):
    out = []
    for w in db.list_watches(sub):
        latest = db.latest_price(w["symbol"])
        out.append({
            "symbol": w["symbol"], "upper": w["upper"], "lower": w["lower"],
            "latest": ({"price": latest["price"], "changePct": latest.get("changePct"),
                        "ts": latest["ts"]} if latest else None),
            "alertState": db.get_alert_states(sub, w["symbol"]),
        })
    return 200, out


def put_watch(event, sub, email):
    sym = _symbol(event)
    body = _body(event)
    upper, lower = _threshold(body, "upper"), _threshold(body, "lower")
    if upper is not None and lower is not None and lower >= upper:
        raise HttpError(400, "lower must be less than upper")
    if db.get_watch(sub, sym) is None:
        if db.count_watches(sub) >= MAX_WATCHES:
            raise HttpError(400, f"watchlist is limited to {MAX_WATCHES} symbols")
        try:
            get_client().quote(sym)
        except UnknownSymbol as e:
            raise HttpError(400, f"unknown symbol {sym}") from e
        except UpstreamError as e:
            raise HttpError(503, "market data provider unavailable, try again") from e
    w = db.put_watch(sub, sym, upper, lower)
    return 200, {"symbol": w["symbol"], "upper": w["upper"], "lower": w["lower"]}


def delete_watch(event, sub, email):
    db.delete_watch(sub, _symbol(event))
    return 204, None


def search(event, sub, email):
    q = ((event.get("queryStringParameters") or {}).get("q") or "").strip()
    if not 1 <= len(q) <= 20:
        raise HttpError(400, "q must be 1-20 characters")
    try:
        return 200, get_client().search(q)
    except UpstreamError as e:
        raise HttpError(503, "market data provider unavailable, try again") from e


def get_history(event, sub, email):
    sym = _symbol(event)
    raw = (event.get("queryStringParameters") or {}).get("days", "7")
    if not raw.isdigit() or not 1 <= int(raw) <= 30:
        raise HttpError(400, "days must be an integer 1-30")
    return 200, db.history(sym, int(raw))


def trigger_digest(event, sub, email):
    _lambda_client().invoke(FunctionName=config.digest_function_name(),
                            InvocationType="Event", Payload=json.dumps({"sub": sub}))
    return 202, {"queued": True}


ROUTES = {
    "GET /me": get_me,
    "PUT /me": put_me,
    "GET /watchlist": get_watchlist,
    "PUT /watchlist/{symbol}": put_watch,
    "DELETE /watchlist/{symbol}": delete_watch,
    "GET /symbols/search": search,
    "GET /symbols/{symbol}/history": get_history,
    "POST /digest/trigger": trigger_digest,
}


def handler(event, context):
    route = event.get("routeKey", "")
    if route == "GET /health":
        return _resp(200, {"ok": True})
    fn = ROUTES.get(route)
    if fn is None:
        return _resp(404, {"error": "not found"})
    try:
        sub, email = _claims(event)
    except (KeyError, TypeError):
        return _resp(401, {"error": "unauthorized"})
    try:
        status, body = fn(event, sub, email)
        return _resp(status, body)
    except HttpError as e:
        return _resp(e.status, {"error": str(e)})
    except Exception:
        log.exception("unhandled error on %s", route)
        return _resp(500, {"error": "internal error"})
