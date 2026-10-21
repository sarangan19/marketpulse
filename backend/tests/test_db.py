import time
from datetime import UTC, datetime, timedelta

from marketpulse import db


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _quote(price: float) -> dict:
    return {"price": price, "change": 1.0, "changePct": 0.5, "high": price, "low": price,
            "open": price, "prevClose": price - 1}


def test_watch_roundtrip(table):
    db.put_watch("u1", "AAPL", 200.0, 150.0)
    items = db.list_watches("u1")
    assert len(items) == 1
    assert items[0]["symbol"] == "AAPL"
    assert items[0]["upper"] == 200.0
    assert items[0]["lower"] == 150.0
    assert db.watchers("AAPL")[0]["PK"] == "USER#u1"
    assert db.count_watches("u1") == 1


def test_watch_without_lower(table):
    db.put_watch("u1", "AAPL", 200.0, None)
    assert db.list_watches("u1")[0]["lower"] is None


def test_delete_watch(table):
    db.put_watch("u1", "AAPL", 200.0, 150.0)
    db.delete_watch("u1", "AAPL")
    assert db.list_watches("u1") == []
    assert db.watchers("AAPL") == []


def test_distinct_symbols_dedupes(table):
    db.put_watch("u1", "AAPL", 200.0, None)
    db.put_watch("u2", "AAPL", 210.0, None)
    db.put_watch("u2", "MSFT", None, 300.0)
    assert db.distinct_symbols() == ["AAPL", "MSFT"]


def test_profile_defaults_and_no_overwrite(table):
    p = db.get_or_create_profile("u1", "a@x.com")
    assert p["digestOptIn"] is True
    assert p["smsOptIn"] is False
    assert p["email"] == "a@x.com"
    db.update_profile("u1", smsOptIn=True, phone="+919876543210")
    again = db.get_or_create_profile("u1", "a@x.com")
    assert again["smsOptIn"] is True
    assert again["phone"] == "+919876543210"
    assert [x["email"] for x in db.list_profiles()] == ["a@x.com"]


def test_latest_price_and_history(table):
    now = datetime.now(UTC)
    for i, price in enumerate([100.0, 101.0, 102.5]):
        db.put_price("AAPL", _iso(now - timedelta(minutes=30 - i * 10)), _quote(price))
    assert db.latest_price("AAPL")["price"] == 102.5
    hist = db.history("AAPL", 7)
    assert [p["price"] for p in hist["prices"]] == [100.0, 101.0, 102.5]
    expected_ttl = time.time() + 30 * 86400
    assert abs(hist["prices"][0]["ttl"] - expected_ttl) < 60


def test_history_excludes_old_prices(table):
    now = datetime.now(UTC)
    db.put_price("AAPL", _iso(now - timedelta(days=10)), _quote(90.0))
    db.put_price("AAPL", _iso(now - timedelta(days=1)), _quote(100.0))
    assert [p["price"] for p in db.history("AAPL", 7)["prices"]] == [100.0]


def test_latest_price_none(table):
    assert db.latest_price("NOPE") is None


def test_sentiment_roundtrip(table):
    sent = {"score": 0.25, "label": "POSITIVE", "counts": {"POSITIVE": 2}}
    heads = [{"headline": "Up", "url": "u", "source": "s"}]
    db.put_sentiment("AAPL", "2026-10-21", sent, heads, "Summary.")
    got = db.get_sentiment("AAPL", "2026-10-21")
    assert got["score"] == 0.25
    assert got["label"] == "POSITIVE"
    assert got["headlines"] == heads
    assert got["summary"] == "Summary."
    assert abs(got["ttl"] - (time.time() + 90 * 86400)) < 60
    assert db.get_sentiment("AAPL", "2026-10-20") is None


def test_transition_alert_once(table):
    assert db.transition_alert("u1", "AAPL", "UPPER", "BREACHED", 201.0) is True
    assert db.transition_alert("u1", "AAPL", "UPPER", "BREACHED", 202.0) is False
    assert db.transition_alert("u1", "AAPL", "UPPER", "CLEAR", 199.0) is True
    assert db.transition_alert("u1", "AAPL", "UPPER", "BREACHED", 203.0) is True
    assert db.get_alert_states("u1", "AAPL") == {"UPPER": "BREACHED"}
