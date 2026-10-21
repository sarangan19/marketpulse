"""Pure digest rendering in the Night Ledger theme. Every interpolated value is escaped and
headline links must be http(s)."""

from datetime import date as _date
from html import escape

from marketpulse import email_theme as t

NO_NEWS = "No news today"
NO_SENTIMENT = "Sentiment unavailable"


def _fmt_price(v) -> str:
    return "no data" if v is None else f"{v:,.2f}"


def _fmt_pct(v) -> str:
    return "" if v is None else f"{v:+.2f}%"


def _safe_url(url: str) -> str | None:
    return url if url.startswith(("https://", "http://")) else None


def _pretty_date(d: str) -> str:
    try:
        return _date.fromisoformat(d).strftime("%A, %d %B %Y")
    except ValueError:
        return d


def _sentiment(it: dict) -> str:
    label = it.get("label")
    if not label:
        note = NO_SENTIMENT if it.get("headlines") else NO_NEWS
        return f'<span style="font:400 12px/1 {t.SANS};color:{t.TEXT_3}">{note}</span>'
    score = it.get("score") or 0
    return t.chip(f'{escape(label)} <span style="font-family:{t.MONO}">{score:+.2f}</span>',
                  t.LABEL_COLOURS.get(label, t.TEXT_2))


def _headline_html(h: dict) -> str:
    text = escape(h.get("headline", ""))
    url = _safe_url(h.get("url", ""))
    if url:
        text = (f'<a href="{escape(url, quote=True)}" style="color:{t.TEXT};'
                f'text-decoration:none">{text}</a>')
    src = escape(h.get("source", ""))
    return (f'<tr><td style="padding:8px 0;border-top:1px solid {t.LINE};'
            f'font:500 14px/1.45 {t.SANS};color:{t.TEXT}">{text}'
            f'<div style="font:400 12px/1.6 {t.SANS};color:{t.TEXT_3}">{src}</div></td></tr>')


def _item_html(it: dict, app: str | None) -> str:
    sym = escape(it["symbol"])
    if app:
        sym = (f'<a href="{escape(t.symbol_url(app, it["symbol"]), quote=True)}" '
               f'style="color:{t.TEXT};text-decoration:none">{sym}</a>')
    pct = it.get("changePct")
    summary = ""
    if it.get("summary"):
        summary = (f'<tr><td colspan="2" style="padding:12px 0 0;font:400 15px/1.6 {t.SANS};'
                   f'color:{t.TEXT_2}">{escape(it["summary"])}</td></tr>')
    heads = "".join(_headline_html(h) for h in it.get("headlines") or [])
    heads_html = ""
    if heads:
        heads_html = ('<tr><td colspan="2" style="padding:12px 0 0">'
                      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
                      f'border="0">{heads}</table></td></tr>')
    return (
        f'<tr><td class="px" style="padding:24px 32px;border-top:1px solid {t.LINE}">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
        f'<tr><td style="font:600 17px/1.3 {t.SANS};color:{t.TEXT};letter-spacing:-0.01em">'
        f'{sym}</td>'
        f'<td align="right" style="font:500 17px/1.3 {t.MONO};color:{t.TEXT};'
        f'white-space:nowrap">{_fmt_price(it.get("price"))}'
        f'<span style="padding-left:10px;font:500 13px/1 {t.MONO};color:{t.change_colour(pct)}">'
        f'{escape(_fmt_pct(pct))}</span></td></tr>'
        f'<tr><td colspan="2" style="padding:10px 0 0">{_sentiment(it)}</td></tr>'
        f'{summary}{heads_html}</table></td></tr>'
    )


def _item_text(it: dict) -> str:
    lines = [f"{it['symbol']}  {_fmt_price(it.get('price'))}  {_fmt_pct(it.get('changePct'))}  "
             f"{it.get('label') or (NO_SENTIMENT if it.get('headlines') else NO_NEWS)}"]
    if it.get("summary"):
        lines.append(f"  {it['summary']}")
    lines += [f"  - {h.get('headline', '')} ({h.get('url', '')})"
              for h in it.get("headlines") or []]
    return "\n".join(lines)


def render(email: str, date: str, items: list[dict],
           app_url: str | None = None) -> tuple[str, str, str]:
    subject = f"MarketPulse digest — {date}"
    app = t.safe_app_url(app_url)
    ups = sum(1 for it in items if (it.get("changePct") or 0) > 0)
    downs = sum(1 for it in items if (it.get("changePct") or 0) < 0)
    n = len(items)

    header = (
        f'<tr><td class="px" style="padding:28px 32px 24px">'
        f'<div style="font:400 13px/1.4 {t.SANS};color:{t.TEXT_3}">Daily digest</div>'
        f'<div style="padding-top:6px;font:600 26px/1.2 {t.SANS};color:{t.TEXT};'
        f'letter-spacing:-0.02em">{escape(_pretty_date(date))}</div>'
        f'<div style="padding-top:10px;font:400 14px/1.5 {t.SANS};color:{t.TEXT_2}">'
        f'{n} symbol{"s" if n != 1 else ""} &middot; '
        f'<span style="color:{t.UP}">{ups} up</span> &middot; '
        f'<span style="color:{t.DOWN}">{downs} down</span></div></td></tr>'
    )
    cta = ""
    if app:
        cta = (f'<tr><td class="px" style="padding:24px 32px 32px;border-top:1px solid {t.LINE}">'
               f'{t.button(app, "Open MarketPulse")}</td></tr>')
    body = ('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
            f'{header}{"".join(_item_html(it, app) for it in items)}{cta}</table>')
    footer = (f"Sent to {escape(email)}. Sentiment is scored from news headlines and summaries "
              "are AI-generated. Informational only, not investment advice.")
    html = t.layout(title=subject, preheader=f"{n} symbols: {ups} up, {downs} down",
                    body=body, footer=footer)
    text = (f"MarketPulse digest — {date}\n\n" + "\n\n".join(_item_text(it) for it in items)
            + (f"\n\nOpen MarketPulse: {app}" if app else ""))
    return subject, html, text
