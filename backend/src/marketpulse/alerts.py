"""Pure threshold evaluation (spec section 3)."""


def evaluate(price: float, upper: float | None, lower: float | None) -> dict[str, str]:
    out = {}
    if upper is not None:
        out["UPPER"] = "BREACHED" if price >= upper else "CLEAR"
    if lower is not None:
        out["LOWER"] = "BREACHED" if price <= lower else "CLEAR"
    return out
