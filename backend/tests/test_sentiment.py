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


class FakeBedrock:
    def __init__(self, text="", fail=False):
        self.text, self.fail, self.calls = text, fail, []

    def converse(self, **kw):
        self.calls.append(kw)
        if self.fail:
            raise RuntimeError("bedrock down")
        return {"output": {"message": {"content": [{"text": self.text}]}}}


def test_analyze_both_engines_fail_returns_none():
    assert analyze(["h"], client=FakeComprehend(fail=True),
                   fallback=FakeBedrock(fail=True)) is None


def test_comprehend_success_tags_source_and_skips_fallback():
    fb = FakeBedrock(text='["NEGATIVE"]')
    out = analyze(["h"], client=FakeComprehend(), fallback=fb)
    assert out["source"] == "comprehend"
    assert fb.calls == []


def test_bedrock_fallback_when_comprehend_blocked():
    fb = FakeBedrock(text='Sure! ["POSITIVE", "NEGATIVE", "POSITIVE"]')
    out = analyze(["Apple beats", "Probe opened", "Record sales"],
                  client=FakeComprehend(fail=True), fallback=fb)
    assert out["source"] == "bedrock"
    assert out["counts"] == {"POSITIVE": 2, "NEGATIVE": 1, "NEUTRAL": 0, "MIXED": 0}
    assert out["score"] == 0.333
    assert out["label"] == "POSITIVE"
    prompt = fb.calls[0]["messages"][0]["content"][0]["text"]
    assert "1. Apple beats" in prompt and "3. Record sales" in prompt


def test_bedrock_fallback_rejects_wrong_length():
    fb = FakeBedrock(text='["POSITIVE"]')
    assert analyze(["a", "b"], client=FakeComprehend(fail=True), fallback=fb) is None


def test_bedrock_fallback_rejects_unknown_labels_and_garbage():
    for text in ('["GREAT"]', "no json here", '["POSITIVE"'):
        fb = FakeBedrock(text=text)
        assert analyze(["a"], client=FakeComprehend(fail=True), fallback=fb) is None


def test_bedrock_fallback_uses_one_call_for_all_headlines():
    fb = FakeBedrock(text="[" + ",".join(['"NEUTRAL"'] * 10) + "]")
    out = analyze([f"h{i}" for i in range(10)], client=FakeComprehend(fail=True), fallback=fb)
    assert out["counts"]["NEUTRAL"] == 10
    assert len(fb.calls) == 1
