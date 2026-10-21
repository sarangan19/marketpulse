from marketpulse.digest_render import render


def item(**kw):
    base = {"symbol": "AAPL", "price": 201.5, "changePct": 0.75, "label": "POSITIVE",
            "score": 0.4, "summary": "Apple had a good day.",
            "headlines": [{"headline": "Apple beats", "url": "https://n/1", "source": "Reuters"}]}
    return {**base, **kw}


def test_subject_and_content():
    subject, html, text = render("a@x.com", "2026-10-21", [item()])
    assert subject == "MarketPulse digest — 2026-10-21"
    for s in ("AAPL", "201.50", "+0.75%", "POSITIVE", "Apple had a good day.", "Apple beats",
              "https://n/1"):
        assert s in html
    assert "AAPL" in text
    assert "201.50" in text


def test_headline_html_is_escaped():
    _, html, _ = render("a@x.com", "2026-10-21", [item(
        headlines=[{"headline": "<script>x</script> & co", "url": "javascript:alert(1)",
                    "source": "<b>s</b>"}],
        summary="<img src=x onerror=alert(1)>")])
    assert "<script>" not in html
    assert "&lt;script&gt;x&lt;/script&gt; &amp; co" in html
    assert "<img" not in html
    assert "javascript:" not in html
    assert "&lt;b&gt;s&lt;/b&gt;" in html


def test_no_sentiment_shows_no_news():
    _, html, text = render("a@x.com", "2026-10-21",
                           [item(label=None, score=None, summary=None, headlines=[])])
    assert "No news today" in html
    assert "No news today" in text


def test_no_price_shows_no_data():
    _, html, _ = render("a@x.com", "2026-10-21", [item(price=None, changePct=None)])
    assert "no data" in html


def test_negative_change_formatting():
    _, html, _ = render("a@x.com", "2026-10-21", [item(changePct=-1.234)])
    assert "-1.23%" in html


def test_headlines_without_sentiment_say_unavailable():
    _, html, text = render("a@x.com", "2026-10-21", [item(label=None, score=None)])
    assert "Sentiment unavailable" in html
    assert "No news today" not in html
    assert "Sentiment unavailable" in text
