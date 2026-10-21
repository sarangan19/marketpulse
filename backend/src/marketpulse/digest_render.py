"""Pure digest rendering. Every interpolated value is escaped; links must be http(s)."""

from html import escape

COLOURS = {"POSITIVE": "#1a7f37", "NEGATIVE": "#cf222e", "MIXED": "#bf8700",
           "NEUTRAL": "#6e7781"}
NO_NEWS = "No news today"
NO_SENTIMENT = "Sentiment unavailable"


def _fmt_price(v) -> str:
    return "no data" if v is None else f"{v:.2f}"


def _fmt_pct(v) -> str:
    return "" if v is None else f"{v:+.2f}%"


def _safe_url(url: str) -> str | None:
    return url if url.startswith(("https://", "http://")) else None


def _headline_html(h: dict) -> str:
    text = escape(h.get("headline", ""))
    url = _safe_url(h.get("url", ""))
    link = f'<a href="{escape(url, quote=True)}" style="color:#0969da">{text}</a>' if url else text
    src = escape(h.get("source", ""))
    return f'<li style="margin:2px 0">{link} <span style="color:#6e7781">({src})</span></li>'


def _item_html(it: dict) -> str:
    sym = escape(it["symbol"])
    price = _fmt_price(it.get("price"))
    pct = _fmt_pct(it.get("changePct"))
    pct_colour = "#cf222e" if (it.get("changePct") or 0) < 0 else "#1a7f37"
    label = it.get("label")
    if label:
        badge = (f'<span style="background:{COLOURS.get(label, "#6e7781")};color:#fff;'
                 f'padding:2px 6px;border-radius:4px;font-size:12px">{escape(label)} '
                 f'{it.get("score", 0):+.2f}</span>')
    else:
        note = NO_SENTIMENT if it.get("headlines") else NO_NEWS
        badge = f'<span style="color:#6e7781">{note}</span>'
    summary = (f'<p style="margin:6px 0">{escape(it["summary"])}</p>'
               if it.get("summary") else "")
    heads = "".join(_headline_html(h) for h in it.get("headlines") or [])
    heads_html = f'<ul style="margin:4px 0;padding-left:18px">{heads}</ul>' if heads else ""
    return (
        '<tr><td style="padding:12px;border-bottom:1px solid #d0d7de">'
        f'<strong style="font-size:16px">{sym}</strong> '
        f'<span style="font-size:16px">{price}</span> '
        f'<span style="color:{pct_colour}">{escape(pct)}</span> {badge}'
        f'{summary}{heads_html}</td></tr>'
    )


def _item_text(it: dict) -> str:
    lines = [f"{it['symbol']}  {_fmt_price(it.get('price'))}  {_fmt_pct(it.get('changePct'))}  "
             f"{it.get('label') or (NO_SENTIMENT if it.get('headlines') else NO_NEWS)}"]
    if it.get("summary"):
        lines.append(f"  {it['summary']}")
    lines += [f"  - {h.get('headline', '')} ({h.get('url', '')})"
              for h in it.get("headlines") or []]
    return "\n".join(lines)


def render(email: str, date: str, items: list[dict]) -> tuple[str, str, str]:
    subject = f"MarketPulse digest — {date}"
    rows = "".join(_item_html(it) for it in items)
    html = (
        '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2328;'
        'max-width:640px;margin:0 auto">'
        f'<h2 style="margin:16px 0 4px">MarketPulse digest</h2>'
        f'<p style="margin:0 0 12px;color:#6e7781">{escape(date)} · {escape(email)}</p>'
        f'<table style="width:100%;border-collapse:collapse">{rows}</table>'
        '<p style="color:#6e7781;font-size:12px">Informational only, not investment advice.</p>'
        '</body></html>'
    )
    text = f"MarketPulse digest — {date}\n\n" + "\n\n".join(_item_text(it) for it in items)
    return subject, html, text
