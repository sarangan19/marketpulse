from botocore.exceptions import ClientError

from marketpulse.sentiment import aggregate, analyze


def r(pos=0.0, neg=0.0, neu=0.0, mixed=0.0, label="NEUTRAL"):
    return {"Sentiment": label, "SentimentScore": {"Positive": pos, "Negative": neg,
                                                   "Neutral": neu, "Mixed": mixed}}


def test_strong_positive():
    out = aggregate([r(pos=0.9, neg=0.05, label="POSITIVE"), r(pos=0.8, label="POSITIVE")])
    assert out["label"] == "POSITIVE"
    assert out["score"] == 0.825
    assert out["counts"]["POSITIVE"] == 2


def test_weak_signal_is_neutral():
    assert aggregate([r(pos=0.1, neg=0.05, neu=0.85)])["label"] == "NEUTRAL"


def test_mixed_when_mixed_high_and_score_flat():
    assert aggregate([r(pos=0.3, neg=0.3, mixed=0.4, label="MIXED")])["label"] == "MIXED"


def test_negative_beats_mixed_by_order():
    out = aggregate([r(pos=0.0, neg=0.2, mixed=0.8, label="MIXED")])
    assert out["score"] == -0.2
    assert out["label"] == "NEGATIVE"


def test_threshold_boundary_is_inclusive():
    assert aggregate([r(pos=0.15)])["label"] == "POSITIVE"
    assert aggregate([r(neg=0.15)])["label"] == "NEGATIVE"


def test_empty_is_neutral_zero():
    assert aggregate([]) == {"score": 0.0, "label": "NEUTRAL",
                             "counts": {"POSITIVE": 0, "NEGATIVE": 0, "NEUTRAL": 0, "MIXED": 0}}


class FakeComprehend:
    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail

    def batch_detect_sentiment(self, TextList, LanguageCode):
        self.calls.append(TextList)
        if self.fail:
            raise ClientError({"Error": {"Code": "ThrottlingException", "Message": "x"}},
                              "BatchDetectSentiment")
        return {"ResultList": [{"Index": i, **r(pos=0.6, label="POSITIVE")}
                               for i in range(len(TextList))], "ErrorList": []}


def test_analyze_chunks_by_25():
    client = FakeComprehend()
    out = analyze([f"h{i}" for i in range(30)], client=client)
    assert [len(c) for c in client.calls] == [25, 5]
    assert out["counts"]["POSITIVE"] == 30


def test_analyze_empty_skips_client():
    client = FakeComprehend()
    assert analyze([], client=client)["label"] == "NEUTRAL"
    assert client.calls == []


def test_analyze_client_error_returns_none():
    assert analyze(["h"], client=FakeComprehend(fail=True)) is None
