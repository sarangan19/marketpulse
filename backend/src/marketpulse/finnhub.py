"""Minimal Finnhub REST client (stdlib only)."""

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable

from marketpulse import config

SYMBOL_RE = re.compile(r"^[A-Z.]{1,10}$")
TIMEOUT = 5.0


class UpstreamError(Exception):
    """Transient upstream failure; the caller should retry."""


class UnknownSymbol(Exception):
    """Finnhub has no data for this symbol; retrying will not help."""


def _urllib_get(url: str, timeout: float) -> tuple[int, bytes]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


class FinnhubClient:
    def __init__(self, api_key: str,
                 http_get: Callable[[str, float], tuple[int, bytes]] = _urllib_get,
                 base: str = "https://finnhub.io/api/v1"):
        self._key = api_key
        self._get = http_get
        self._base = base

    def _call(self, path: str, **params):
        url = f"{self._base}/{path}?" + urllib.parse.urlencode({**params, "token": self._key})
        try:
            status, body = self._get(url, TIMEOUT)
        except OSError as e:  # URLError, timeouts, connection resets
            raise UpstreamError(f"{path}: {e}") from e
        if status == 429 or status >= 500:
            raise UpstreamError(f"{path}: HTTP {status}")
        if status != 200:
            raise UpstreamError(f"{path}: unexpected HTTP {status}")
        return json.loads(body)

    def quote(self, symbol: str) -> dict:
        d = self._call("quote", symbol=symbol)
        if not d.get("c") and not d.get("pc"):
            raise UnknownSymbol(symbol)
        return {"price": float(d["c"]), "change": float(d.get("d") or 0),
                "changePct": float(d.get("dp") or 0), "high": float(d.get("h") or 0),
                "low": float(d.get("l") or 0), "open": float(d.get("o") or 0),
                "prevClose": float(d.get("pc") or 0)}

    def company_news(self, symbol: str, frm: str, to: str, limit: int = 10) -> list[dict]:
        items = sorted(self._call("company-news", symbol=symbol, **{"from": frm, "to": to}),
                       key=lambda n: n.get("datetime", 0), reverse=True)
        seen, out = set(), []
        for n in items:
            h = (n.get("headline") or "").strip()
            if not h or h in seen:
                continue
            seen.add(h)
            out.append({"headline": h, "source": n.get("source", ""), "url": n.get("url", ""),
                        "datetime": n.get("datetime", 0)})
            if len(out) == limit:
                break
        return out

    def search(self, q: str) -> list[dict]:
        res = self._call("search", q=q, exchange="US").get("result", [])
        return [{"symbol": r["symbol"], "description": r.get("description", "")}
                for r in res
                if r.get("type") == "Common Stock" and SYMBOL_RE.match(r.get("symbol", ""))][:10]


def get_client():
    if config.stub_mode():
        from marketpulse.stubs import FakeFinnhub

        return FakeFinnhub()
    from marketpulse.secrets import finnhub_api_key

    return FinnhubClient(finnhub_api_key())
