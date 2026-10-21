"""Night Ledger look for emails (tokens mirror frontend/src/styles/tokens.css, dark theme).

Email clients ignore most CSS, so everything here is table layout with inline styles and
bgcolor attributes (Outlook). Geist loads where web fonts are supported (Apple Mail, iOS);
elsewhere the system stack takes over. Callers pass already-escaped HTML fragments.
"""

from html import escape
from urllib.parse import quote

BG = "#0c0d0f"
SURFACE = "#131518"
SURFACE_2 = "#1a1d21"
LINE = "#25292e"
TEXT = "#eceef0"
TEXT_2 = "#a4aab2"
TEXT_3 = "#7e848d"
UP = "#3fd49a"
DOWN = "#ff7a66"
SIGNAL = "#f0b43c"

SANS = "Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace"

LABEL_COLOURS = {"POSITIVE": UP, "NEGATIVE": DOWN, "MIXED": SIGNAL, "NEUTRAL": TEXT_2}


def safe_app_url(app_url: str | None) -> str | None:
    """Only https links (http for local dev) ever reach an email."""
    if not app_url or not app_url.startswith(("https://", "http://localhost")):
        return None
    return app_url.rstrip("/")


def symbol_url(app_url: str, symbol: str) -> str:
    return f"{app_url}/symbol/{quote(symbol, safe='.')}"


def change_colour(pct: float | None) -> str:
    if not pct:
        return TEXT_2
    return UP if pct > 0 else DOWN


def chip(text: str, colour: str, filled: bool = False) -> str:
    """Pill chip. Filled = tinted background (attention), outlined otherwise."""
    bg = f"background-color:{colour}1f;" if filled else ""
    return (f'<span style="display:inline-block;{bg}border:1px solid {colour}66;color:{colour};'
            f'font:600 12px/1 {SANS};padding:5px 10px;border-radius:999px;'
            f'white-space:nowrap">{text}</span>')


def button(href: str, label: str) -> str:
    """Inverted primary button, as in the app (off-white on graphite)."""
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
            f'<td bgcolor="{TEXT}" style="border-radius:8px">'
            f'<a href="{escape(href, quote=True)}" style="display:inline-block;padding:12px 20px;'
            f'font:600 14px/1 {SANS};color:{BG};text-decoration:none;border-radius:8px">'
            f'{escape(label)}</a></td></tr></table>')


def layout(*, title: str, preheader: str, body: str, footer: str) -> str:
    """Full HTML document: dark page, 600px column, wordmark header, footer note."""
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="color-scheme" content="dark">'
        '<meta name="supported-color-schemes" content="dark">'
        f'<title>{escape(title)}</title>'
        '<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600'
        '&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">'
        f'<style>:root{{color-scheme:dark}}body{{margin:0;background:{BG}}}'
        'a{color:inherit}@media (max-width:620px){.px{padding-left:20px!important;'
        'padding-right:20px!important}.hero{font-size:40px!important}}</style>'
        f'</head><body style="margin:0;padding:0;background-color:{BG}" bgcolor="{BG}">'
        # Preheader: the inbox preview line, hidden in the body.
        f'<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{BG}">'
        f'{escape(preheader)}</div>'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'bgcolor="{BG}" style="background-color:{BG}"><tr><td align="center" '
        'style="padding:32px 12px">'
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" '
        'style="width:100%;max-width:600px">'
        # Wordmark
        f'<tr><td class="px" style="padding:0 32px 24px;font:600 16px/1 {SANS};color:{TEXT};'
        'letter-spacing:-0.01em">'
        f'<span style="display:inline-block;width:22px;height:22px;border-radius:6px;'
        f'background-color:{TEXT};color:{BG};text-align:center;font:700 13px/22px {MONO};'
        'vertical-align:middle;margin-right:8px">~</span>'
        '<span style="vertical-align:middle">MarketPulse</span></td></tr>'
        # Panel
        f'<tr><td bgcolor="{SURFACE}" style="background-color:{SURFACE};border:1px solid '
        f'{LINE};border-radius:14px">{body}</td></tr>'
        # Footer
        f'<tr><td class="px" style="padding:20px 32px 0;font:400 12px/1.6 {SANS};'
        f'color:{TEXT_3}">{footer}</td></tr>'
        '</table></td></tr></table></body></html>'
    )
