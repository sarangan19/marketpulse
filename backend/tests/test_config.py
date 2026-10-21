from marketpulse import config


def test_fail_symbols_parses_and_uppercases(monkeypatch):
    monkeypatch.setenv("FAIL_SYMBOLS", " aapl,MSFT ")
    assert config.fail_symbols() == {"AAPL", "MSFT"}


def test_fail_symbols_unset_is_empty():
    assert config.fail_symbols() == set()


def test_bedrock_model_default():
    assert config.bedrock_model_id() == "apac.amazon.nova-micro-v1:0"


def test_stub_mode_only_for_1(monkeypatch):
    assert config.stub_mode() is False
    monkeypatch.setenv("MARKETPULSE_STUB", "true")
    assert config.stub_mode() is False
    monkeypatch.setenv("MARKETPULSE_STUB", "1")
    assert config.stub_mode() is True


def test_table_name_from_env():
    assert config.table_name() == "marketpulse-test"
