from marketpulse.summarize import summarize


class FakeBedrock:
    def __init__(self, text="  Apple rose on strong iPhone demand.  ", fail=False):
        self.text, self.fail, self.calls = text, fail, []

    def converse(self, **kwargs):
        self.calls.append(kwargs)
        if self.fail:
            raise RuntimeError("AccessDeniedException")
        return {"output": {"message": {"role": "assistant",
                                       "content": [{"text": self.text}]}}}


def test_returns_stripped_text_and_uses_model(monkeypatch):
    monkeypatch.setenv("BEDROCK_MODEL_ID", "my-model")
    client = FakeBedrock()
    out = summarize("AAPL", ["Apple beats", "iPhone sales up"], client=client)
    assert out == "Apple rose on strong iPhone demand."
    call = client.calls[0]
    assert call["modelId"] == "my-model"
    assert call["inferenceConfig"] == {"maxTokens": 200, "temperature": 0.2}
    prompt = call["messages"][0]["content"][0]["text"]
    assert "AAPL" in prompt
    assert "Apple beats" in prompt
    assert "iPhone sales up" in prompt


def test_empty_headlines_skip_call():
    client = FakeBedrock()
    assert summarize("AAPL", [], client=client) is None
    assert client.calls == []


def test_failure_returns_none():
    assert summarize("AAPL", ["x"], client=FakeBedrock(fail=True)) is None


def test_blank_response_returns_none():
    assert summarize("AAPL", ["x"], client=FakeBedrock(text="   ")) is None


def test_bedrock_client_has_short_timeouts():
    from marketpulse import summarize as mod

    cfg = mod._client().meta.config
    assert cfg.read_timeout <= 10
    assert cfg.connect_timeout <= 5
