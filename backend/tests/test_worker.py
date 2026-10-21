import json

import pytest

from marketpulse import db
from marketpulse.finnhub import UpstreamError
from marketpulse.handlers import worker
from marketpulse.stubs import FakeFinnhub

RUN_AT = "2026-10-21T02:30:00Z"


def sqs_event(*specs):
    return {"Records": [
        {"messageId": f"m-{sym}",
         "body": json.dumps({"symbol": sym, "mode": mode, "runAt": RUN_AT})}
        for sym, mode in specs
    ]}


@pytest.fixture
def stub(table, monkeypatch):
    monkeypatch.setenv("MARKETPULSE_STUB", "1")


def test_intraday_writes_price_only(stub):
    assert worker.handler(sqs_event(("AAPL", "intraday")), None) == {"batchItemFailures": []}
    assert db.latest_price("AAPL")["ts"] == RUN_AT
    assert db.get_sentiment("AAPL", "2026-10-21") is None


def test_daily_writes_price_sentiment_summary(stub):
    worker.handler(sqs_event(("AAPL", "daily")), None)
    assert db.latest_price("AAPL") is not None
    sent = db.get_sentiment("AAPL", "2026-10-21")
    assert sent["label"] in {"POSITIVE", "NEGATIVE", "NEUTRAL", "MIXED"}
    assert 1 <= len(sent["headlines"]) <= 5
    assert set(sent["headlines"][0]) == {"headline", "source", "url"}
    assert sent["summary"].startswith("Stub summary")


def test_unknown_symbol_acked_without_writes(stub):
    assert worker.handler(sqs_event(("ZZZZ", "daily")), None) == {"batchItemFailures": []}
    assert db.latest_price("ZZZZ") is None


def test_fail_symbols_demo_hook(stub, monkeypatch):
    monkeypatch.setenv("FAIL_SYMBOLS", "MSFT")
    out = worker.handler(sqs_event(("AAPL", "intraday"), ("MSFT", "intraday")), None)
    assert out == {"batchItemFailures": [{"itemIdentifier": "m-MSFT"}]}
    assert db.latest_price("AAPL") is not None
    assert db.latest_price("MSFT") is None


class FlakyFinnhub(FakeFinnhub):
    def __init__(self, fail_news=False):
        self.fail_news = fail_news

    def quote(self, symbol):
        if not self.fail_news:
            raise UpstreamError("429")
        return super().quote(symbol)

    def company_news(self, *a, **kw):
        raise UpstreamError("503")


def test_upstream_error_reports_failure(stub, monkeypatch):
    monkeypatch.setattr(worker, "get_client", lambda: FlakyFinnhub())
    out = worker.handler(sqs_event(("AAPL", "intraday")), None)
    assert out == {"batchItemFailures": [{"itemIdentifier": "m-AAPL"}]}


def test_news_upstream_error_reports_failure(stub, monkeypatch):
    monkeypatch.setattr(worker, "get_client", lambda: FlakyFinnhub(fail_news=True))
    out = worker.handler(sqs_event(("AAPL", "daily")), None)
    assert out == {"batchItemFailures": [{"itemIdentifier": "m-AAPL"}]}




def test_malformed_message_reports_failure(stub):
    ev = {"Records": [{"messageId": "bad", "body": "not json"}]}
    assert worker.handler(ev, None) == {"batchItemFailures": [{"itemIdentifier": "bad"}]}


class NoNewsFinnhub(FakeFinnhub):
    def company_news(self, *a, **kw):
        return []


def test_no_news_writes_no_label(stub, monkeypatch):
    monkeypatch.setattr(worker, "get_client", lambda: NoNewsFinnhub())
    worker.handler(sqs_event(("AAPL", "daily")), None)
    sent = db.get_sentiment("AAPL", "2026-10-21")
    assert "label" not in sent
    assert sent["headlines"] == []


def test_comprehend_failure_writes_headlines_without_label(stub, monkeypatch):
    monkeypatch.setattr(worker, "analyze", lambda heads: None)
    worker.handler(sqs_event(("AAPL", "daily")), None)
    sent = db.get_sentiment("AAPL", "2026-10-21")
    assert "label" not in sent
    assert len(sent["headlines"]) >= 1
