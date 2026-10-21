"""Single-table key builders. See spec section 3."""

PROFILE_SK = "PROFILE"


def user_pk(sub: str) -> str:
    return f"USER#{sub}"


def symbol_pk(symbol: str) -> str:
    return f"SYMBOL#{symbol}"


def watch_sk(symbol: str) -> str:
    return f"WATCH#{symbol}"


def price_sk(ts: str) -> str:
    return f"PRICE#{ts}"


def sent_sk(date: str) -> str:
    return f"SENT#{date}"


def alert_sk(symbol: str, side: str) -> str:
    return f"ALERT#{symbol}#{side}"
