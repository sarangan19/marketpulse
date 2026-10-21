"""Pure rendering of one threshold alert email (subject, html, text)."""

from datetime import datetime
from html import escape

from marketpulse import email_theme as t

VERB = {"UPPER": "crossed above", "LOWER": "fell below"}
CHIP = {"UPPER": "Upper breached", "LOWER": "Lower breached"}
ARROW = {"UPPER": "&uarr;", "LOWER": "&darr;"}


def _when(ts: str) -> str:
    try:
        return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").strftime("%b %d, %H:%M UTC")
    except ValueError:
        return ts


def render_alert(alert: dict, app_url: str | None = None) -> tuple[str, str, str]:
    sym, side = alert["symbol"], alert["side"]
    price, threshold = alert["price"], alert["threshold"]
    verb = VERB[side]
    subject = f"MarketPulse alert: {sym} {verb} {threshold:.2f}"
    app = t.safe_app_url(app_url)
    when = _when(alert.get("ts", ""))
    s = escape(sym)

    open_btn = ""
    if app:
        open_btn = (f'<tr><td class="px" style="padding:8px 32px 32px">'
                    f'{t.button(t.symbol_url(app, sym), f"Open {sym}")}</td></tr>')
    body = (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
        f'<tr><td class="px" style="padding:28px 32px 0">'
        f'{t.chip(f"{ARROW[side]} {CHIP[side]}", t.SIGNAL, filled=True)}</td></tr>'
        f'<tr><td class="px" style="padding:20px 32px 0;font:600 15px/1.2 {t.SANS};'
        f'color:{t.TEXT}">{s}</td></tr>'
        f'<tr><td class="px hero" style="padding:6px 32px 0;font:500 52px/1.05 {t.SANS};'
        f'letter-spacing:-0.03em;color:{t.TEXT}">${price:,.2f}</td></tr>'
        f'<tr><td class="px" style="padding:12px 32px 24px;font:400 15px/1.5 {t.SANS};'
        f'color:{t.TEXT_2}">{s} {verb} your threshold of '
        f'<span style="font-family:{t.MONO};color:{t.SIGNAL}">{threshold:,.2f}</span>.</td></tr>'
        # Facts row
        f'<tr><td class="px" style="padding:0 32px 24px">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="border-top:1px solid {t.LINE}">'
        f'<tr><td style="padding:14px 0 0;font:400 12px/1.4 {t.SANS};color:{t.TEXT_3}">Threshold'
        f'<br><span style="font:500 15px/1.6 {t.MONO};color:{t.TEXT}">{threshold:,.2f}</span></td>'
        f'<td style="padding:14px 0 0;font:400 12px/1.4 {t.SANS};color:{t.TEXT_3}">Last price'
        f'<br><span style="font:500 15px/1.6 {t.MONO};color:{t.TEXT}">{price:,.2f}</span></td>'
        f'<td style="padding:14px 0 0;font:400 12px/1.4 {t.SANS};color:{t.TEXT_3}">Seen at'
        f'<br><span style="font:500 15px/1.6 {t.MONO};color:{t.TEXT}">{escape(when)}</span></td>'
        '</tr></table></td></tr>'
        f'{open_btn}</table>'
    )
    footer = ("You won't be alerted again for this side until the price moves back inside "
              "your band. Informational only, not investment advice.")
    html = t.layout(title=subject, preheader=f"{sym} {verb} {threshold:.2f}, now {price:.2f}",
                    body=body, footer=footer)
    text = (f"{sym} {verb} your threshold of {threshold:.2f}.\n"
            f"Latest price: {price:.2f} at {alert.get('ts', '')}.\n\n"
            + (f"Open: {t.symbol_url(app, sym)}\n\n" if app else "")
            + "You will not be alerted again until the price returns inside your band.")
    return subject, html, text
