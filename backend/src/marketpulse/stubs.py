"""Deterministic fakes used when MARKETPULSE_STUB=1 (LocalStack / offline dev)."""

import zlib

from marketpulse.finnhub import UnknownSymbol

UNKNOWN = "ZZZZ"


def _base_price(symbol: str) -> float:
    return 50.0 + zlib.crc32(symbol.encode()) % 400


class FakeFinnhub:
    def quote(self, symbol: str) -> dict:
        if symbol == UNKNOWN:
            raise UnknownSymbol(symbol)
        p = _base_price(symbol)
        return {"price": p, "change": 1.0, "changePct": round(100 / p, 2), "high": p + 1,
                "low": p - 1, "open": p - 0.5, "prevClose": p - 1}

    def company_news(self, symbol: str, frm: str, to: str, limit: int = 10) -> list[dict]:
        heads = [f"{symbol} beats expectations", f"{symbol} faces regulatory probe",
                 f"Analysts neutral on {symbol}"]
        return [{"headline": h, "source": "stub", "url": "https://example.com",
                 "datetime": 1_700_000_000 - i} for i, h in enumerate(heads)][:limit]

    def search(self, q: str) -> list[dict]:
        return [{"symbol": q.upper(), "description": f"{q.upper()} INC (stub)"}]


class FakeComprehend:
    """Keyword sentiment so local runs produce varied labels."""

    def batch_detect_sentiment(self, TextList, LanguageCode):  # noqa: N803 (boto3 casing)
        out = []
        for i, text in enumerate(TextList):
            t = text.lower()
            pos = 0.8 if "beat" in t else 0.1
            neg = 0.8 if "probe" in t else 0.05
            label = "POSITIVE" if pos > neg and pos > 0.5 else (
                "NEGATIVE" if neg > 0.5 else "NEUTRAL")
            out.append({"Index": i, "Sentiment": label,
                        "SentimentScore": {"Positive": pos, "Negative": neg,
                                           "Neutral": 1 - pos - neg, "Mixed": 0.0}})
        return {"ResultList": out, "ErrorList": []}


class FakeBedrock:
    def converse(self, **kwargs):
        return {"output": {"message": {"role": "assistant", "content": [
            {"text": "Stub summary: coverage was mixed, with an earnings beat offset by a "
                     "regulatory probe."}]}}}
