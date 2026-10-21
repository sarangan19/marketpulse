from marketpulse.alert_render import render_alert

ALERT = {"sub": "u1", "symbol": "AAPL", "side": "UPPER", "price": 201.5, "threshold": 200.0,
         "ts": "2026-10-21T14:45:00Z"}


def test_subject_unchanged():
    subject, _, _ = render_alert(ALERT)
    assert subject == "MarketPulse alert: AAPL crossed above 200.00"


def test_html_has_price_threshold_and_state():
    _, html, _ = render_alert(ALERT)
    for s in ("AAPL", "201.50", "200.00", "Upper breached", "crossed above"):
        assert s in html
    assert html.startswith("<!doctype html>")
    assert "#0c0d0f" in html  # Night Ledger background
    assert "#f0b43c" in html  # signal amber for the breached chip


def test_lower_side_wording():
    _, html, text = render_alert({**ALERT, "side": "LOWER", "price": 149.0, "threshold": 150.0})
    assert "Lower breached" in html
    assert "fell below" in html
    assert "fell below" in text


def test_open_button_only_with_app_url():
    _, without, _ = render_alert(ALERT)
    assert "Open AAPL" not in without
    _, with_url, text = render_alert(ALERT, app_url="https://app.example.com/")
    assert 'href="https://app.example.com/symbol/AAPL"' in with_url
    assert "Open AAPL" in with_url
    assert "https://app.example.com/symbol/AAPL" in text


def test_symbol_is_escaped_and_url_encoded():
    _, html, _ = render_alert({**ALERT, "symbol": "BRK.B<x>"}, app_url="https://a.test")
    assert "<x>" not in html
    assert "BRK.B&lt;x&gt;" in html
    assert "/symbol/BRK.B%3Cx%3E" in html


def test_non_https_app_url_is_ignored():
    _, html, _ = render_alert(ALERT, app_url="javascript:alert(1)")
    assert "javascript:" not in html


def test_text_version_has_essentials():
    _, _, text = render_alert(ALERT)
    assert "AAPL crossed above your threshold of 200.00" in text
    assert "201.50" in text
