"""Generate postman/marketpulse.postman_collection.json (run after changing API routes).

Folder "smoke" runs unauthenticated checks in CI; folder "api" needs an idToken variable.
"""

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "postman" / "marketpulse.postman_collection.json"


def req(name, method, path, body=None, auth=True, tests=None, url=None):
    item = {
        "name": name,
        "request": {
            "method": method,
            "header": [{"key": "content-type", "value": "application/json"}] if body else [],
            "url": url or "{{baseUrl}}" + path,
        },
    }
    if auth:
        item["request"]["auth"] = {"type": "bearer",
                                   "bearer": [{"key": "token", "value": "{{idToken}}"}]}
    else:
        item["request"]["auth"] = {"type": "noauth"}
    if body is not None:
        item["request"]["body"] = {"mode": "raw", "raw": json.dumps(body, indent=2)}
    if tests:
        item["event"] = [{"listen": "test", "script": {"type": "text/javascript", "exec": tests}}]
    return item


def status(code):
    return [f'pm.test("status {code}", () => pm.response.to.have.status({code}));']


collection = {
    "info": {"name": "MarketPulse",
             "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
    "variable": [{"key": "baseUrl", "value": ""}, {"key": "frontendUrl", "value": ""},
                 {"key": "idToken", "value": ""}],
    "item": [
        {"name": "smoke", "item": [
            req("health", "GET", "/health", auth=False, tests=status(200)),
            req("watchlist requires auth", "GET", "/watchlist", auth=False, tests=status(401)),
            req("frontend serves index", "GET", "", auth=False, url="{{frontendUrl}}",
                tests=status(200)),
        ]},
        {"name": "api", "item": [
            req("get me", "GET", "/me", tests=status(200)),
            req("update me", "PUT", "/me", body={"digestOptIn": True}, tests=status(200)),
            req("add AAPL", "PUT", "/watchlist/AAPL", body={"upper": 300, "lower": 150},
                tests=status(200)),
            req("bad thresholds", "PUT", "/watchlist/AAPL", body={"upper": 100, "lower": 200},
                tests=status(400)),
            req("unknown symbol", "PUT", "/watchlist/ZZZZZ", body={"upper": 1},
                tests=status(400)),
            req("get watchlist", "GET", "/watchlist", tests=status(200)),
            req("search", "GET", "/symbols/search?q=apple", tests=status(200)),
            req("history", "GET", "/symbols/AAPL/history?days=7", tests=status(200)),
            req("trigger digest", "POST", "/digest/trigger", tests=status(202)),
            req("remove AAPL", "DELETE", "/watchlist/AAPL", tests=status(204)),
        ]},
    ],
}

if __name__ == "__main__":
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(collection, indent=2) + "\n")
    print(OUT)
