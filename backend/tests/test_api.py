import json

import pytest

from marketpulse import db
from marketpulse.handlers import api


def make_event(route, body=None, path=None, qs=None, sub="u1", raw_body=None):
    ev = {
        "routeKey": route,
        "pathParameters": path or {},
        "queryStringParameters": qs,
        "body": raw_body if raw_body is not None else (
            json.dumps(body) if body is not None else None),
        "isBase64Encoded": False,
        "requestContext": {"authorizer": {"jwt": {"claims": {
            "sub": sub, "email": f"{sub}@x.com"}}}},
    }
    return ev


def call(*args, **kwargs):
    resp = api.handler(make_event(*args, **kwargs), None)
    body = json.loads(resp["body"]) if resp.get("body") else None
    return resp["statusCode"], body


class FakeLambda:
    def __init__(self):
        self.calls = []

    def invoke(self, **kw):
        self.calls.append(kw)
        return {"StatusCode": 202}


@pytest.fixture
def env(table, monkeypatch):
    monkeypatch.setenv("MARKETPULSE_STUB", "1")
    monkeypatch.setenv("DIGEST_FUNCTION_NAME", "marketpulse-test-digest")
    fake = FakeLambda()
    monkeypatch.setattr(api, "_lambda_client", lambda: fake)
    return fake


def put(sym, body, sub="u1"):
    return call("PUT /watchlist/{symbol}", body=body, path={"symbol": sym}, sub=sub)


def test_health(env):
    assert call("GET /health") == (200, {"ok": True})


def test_put_and_get_watchlist(env):
    status, item = put("aapl", {"upper": 200, "lower": 150})
    assert status == 200
    assert item["symbol"] == "AAPL"
    db.put_price("AAPL", "2026-10-21T02:30:00Z", {"price": 201.0, "changePct": 0.5})
    db.transition_alert("u1", "AAPL", "UPPER", "BREACHED", 201.0)
    status, items = call("GET /watchlist")
    assert status == 200
    assert items == [{"symbol": "AAPL", "upper": 200.0, "lower": 150.0,
                      "latest": {"price": 201.0, "changePct": 0.5, "ts": "2026-10-21T02:30:00Z"},
                      "alertState": {"UPPER": "BREACHED"}}]


def test_lower_must_be_below_upper(env):
    assert put("AAPL", {"upper": 150, "lower": 150})[0] == 400


def test_thresholds_must_be_positive_numbers(env):
    assert put("AAPL", {"upper": -1})[0] == 400
    assert put("AAPL", {"upper": "abc"})[0] == 400
    assert put("AAPL", {"upper": True})[0] == 400


def test_invalid_symbol_format(env):
    assert put("AAPL1", {"upper": 1})[0] == 400


def test_unknown_symbol_rejected(env):
    status, body = put("ZZZZ", {"upper": 10})
    assert status == 400
    assert "unknown symbol" in body["error"].lower()


def test_watchlist_cap_20(env):
    for i in range(20):
        db.put_watch("u1", f"S{chr(65 + i)}", 10.0, None)
    assert put("NEWX", {"upper": 10})[0] == 400
    assert put("SA", {"upper": 11})[0] == 200  # editing an existing symbol still allowed


def test_delete(env):
    put("AAPL", {"upper": 200})
    status, _ = call("DELETE /watchlist/{symbol}", path={"symbol": "AAPL"})
    assert status == 204
    assert call("GET /watchlist") == (200, [])


def test_me_autocreates(env):
    status, me = call("GET /me")
    assert status == 200
    assert me["email"] == "u1@x.com"
    assert me["digestOptIn"] is True


def test_me_phone_validation(env):
    assert call("PUT /me", body={"phone": "12345"})[0] == 400
    assert call("PUT /me", body={"smsOptIn": True})[0] == 400
    status, me = call("PUT /me", body={"phone": "+919876543210", "smsOptIn": True})
    assert status == 200
    assert me["smsOptIn"] is True
    assert me["phone"] == "+919876543210"


def test_me_rejects_unknown_fields(env):
    assert call("PUT /me", body={"email": "evil@x.com"})[0] == 400


def test_history_bounds(env):
    hist = "GET /symbols/{symbol}/history"
    assert call(hist, path={"symbol": "AAPL"}, qs={"days": "31"})[0] == 400
    assert call(hist, path={"symbol": "AAPL"}, qs={"days": "x"})[0] == 400
    status, body = call("GET /symbols/{symbol}/history", path={"symbol": "AAPL"})
    assert status == 200
    assert body == {"prices": [], "sentiment": []}


def test_search(env):
    status, body = call("GET /symbols/search", qs={"q": "app"})
    assert status == 200
    assert body[0]["symbol"] == "APP"
    assert call("GET /symbols/search", qs={"q": ""})[0] == 400


def test_bad_json(env):
    resp = api.handler(make_event("PUT /me", raw_body="{not json"), None)
    assert resp["statusCode"] == 400


def test_unknown_route(env):
    assert call("GET /nope")[0] == 404


def test_digest_trigger(env):
    status, _ = call("POST /digest/trigger")
    assert status == 202
    assert env.calls[0]["FunctionName"] == "marketpulse-test-digest"
    assert env.calls[0]["InvocationType"] == "Event"
    assert json.loads(env.calls[0]["Payload"]) == {"sub": "u1"}


def test_missing_claims_is_401(env):
    ev = make_event("GET /watchlist")
    ev["requestContext"] = {}
    assert api.handler(ev, None)["statusCode"] == 401


def test_delete_clears_alert_state(env):
    put("AAPL", {"upper": 200, "lower": 150})
    db.transition_alert("u1", "AAPL", "UPPER", "BREACHED", 201.0)
    db.transition_alert("u1", "AAPL", "LOWER", "CLEAR", 201.0)
    call("DELETE /watchlist/{symbol}", path={"symbol": "AAPL"})
    assert db.get_alert_states("u1", "AAPL") == {}


def test_removing_a_side_clears_its_alert_state(env):
    put("AAPL", {"upper": 200, "lower": 150})
    db.transition_alert("u1", "AAPL", "UPPER", "BREACHED", 201.0)
    db.transition_alert("u1", "AAPL", "LOWER", "CLEAR", 201.0)
    put("AAPL", {"lower": 150})
    assert db.get_alert_states("u1", "AAPL") == {"LOWER": "CLEAR"}
