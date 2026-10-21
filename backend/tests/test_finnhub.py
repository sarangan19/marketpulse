import json

import pytest

from marketpulse import finnhub
from marketpulse.finnhub import FinnhubClient, UnknownSymbol, UpstreamError


def fake_http(status: int, body):
    calls = []

    def _get(url: str, timeout: float):
        calls.append(url)
        return status, json.dumps(body).encode()

    _get.calls = calls
    return _get


def test_quote_maps_fields():
    http = fake_http(200, {"c": 201.5, "d": 1.5, "dp": 0.75, "h": 202, "l": 199, "o": 200,
                           "pc": 200})
    q = FinnhubClient("k", http_get=http).quote("AAPL")
    assert q == {"price": 201.5, "change": 1.5, "changePct": 0.75, "high": 202.0,
                 "low": 199.0, "open": 200.0, "prevClose": 200.0}
    assert "symbol=AAPL" in http.calls[0]
    assert "token=k" in http.calls[0]


def test_quote_unknown_symbol():
    http = fake_http(200, {"c": 0, "d": None, "dp": None, "h": 0, "l": 0, "o": 0, "pc": 0})
    with pytest.raises(UnknownSymbol):
        FinnhubClient("k", http_get=http).quote("ZZZZ")


@pytest.mark.parametrize("status", [429, 500, 503])
def test_bad_status_raises_upstream(status):
    with pytest.raises(UpstreamError):
        FinnhubClient("k", http_get=fake_http(status, {})).quote("AAPL")


def test_network_error_raises_upstream():
    def boom(url, timeout):
        raise OSError("timed out")

    with pytest.raises(UpstreamError):
        FinnhubClient("k", http_get=boom).quote("AAPL")


def test_news_limit_and_dedupe():
    items = [{"headline": f"H{i}", "source": "s", "url": f"u{i}", "datetime": 1000 + i}
             for i in range(13)]
    items += [{"headline": "H3", "source": "s", "url": "dup", "datetime": 1},
              {"headline": "H4", "source": "s", "url": "dup", "datetime": 2}]
    news = FinnhubClient("k", http_get=fake_http(200, items)).company_news(
        "AAPL", "2026-10-20", "2026-10-21")
    heads = [n["headline"] for n in news]
    assert len(heads) == 10
    assert len(set(heads)) == 10
    assert heads[0] == "H12"  # newest first
    assert set(news[0]) == {"headline", "source", "url", "datetime"}


def test_search_filters():
    body = {"count": 4, "result": [
        {"symbol": "AAPL", "description": "APPLE INC", "type": "Common Stock"},
        {"symbol": "BRK.B", "description": "BERKSHIRE", "type": "Common Stock"},
        {"symbol": "ABC-W", "description": "WARRANT", "type": "Common Stock"},
        {"symbol": "SPY", "description": "ETF", "type": "ETP"},
    ]}
    res = FinnhubClient("k", http_get=fake_http(200, body)).search("a")
    assert res == [{"symbol": "AAPL", "description": "APPLE INC"},
                   {"symbol": "BRK.B", "description": "BERKSHIRE"}]


def test_get_client_stub_mode(monkeypatch):
    monkeypatch.setenv("MARKETPULSE_STUB", "1")
    client = finnhub.get_client()
    assert client.quote("AAPL")["price"] > 0
    with pytest.raises(UnknownSymbol):
        client.quote("ZZZZ")
