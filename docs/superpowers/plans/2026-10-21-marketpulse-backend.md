# MarketPulse Backend + Infra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full MarketPulse serverless backend, Terraform infrastructure, CI/CD, and a throwaway mock UI that the team will replace.

**Architecture:** Python 3.13 Lambdas sharing one `marketpulse` package (stdlib + boto3 only, so one zip serves every function with a different handler). EventBridge Scheduler → dispatcher → SQS/DLQ → worker → DynamoDB single table → Streams → evaluator → SNS → notifier; a scheduled digest Lambda sends SES HTML email. Terraform modules composed by `envs/staging` and `envs/prod`; GitHub Actions deploys via OIDC.

**Tech Stack:** Python 3.13, boto3, pytest, moto, ruff · Terraform ≥ 1.10, AWS provider ~> 6.0, tflint, Checkov · React 19 + Vite + TypeScript + Recharts + amazon-cognito-identity-js · GitHub Actions · LocalStack · newman.

**Spec:** `docs/superpowers/specs/2026-10-21-marketpulse-design.md`

## Global Constraints

- Region `ap-south-1`; resource names prefixed `marketpulse-<env>-`; env ∈ {`staging`, `prod`}.
- Lambda runtime `python3.13`; no third-party runtime deps (HTTP via `urllib.request`).
- Single DynamoDB table `marketpulse-<env>`, keys `PK`/`SK`, sparse `GSI1` (`GSI1PK`/`GSI1SK`), stream `NEW_IMAGE`, TTL attr `ttl`.
- TTL: price 30 days, sentiment 90 days.
- Max 20 symbols per watchlist; symbol regex `^[A-Z.]{1,10}$`; `lower < upper` when both set.
- Sentiment label: `POSITIVE` if score ≥ 0.15, `NEGATIVE` if ≤ −0.15, `MIXED` if mean Mixed > 0.3, else `NEUTRAL` (checked in that order).
- SQS: maxReceiveCount 3; visibility timeout = 6 × worker timeout (worker timeout 30 s → 180 s); ESM `maximum_concurrency = 2`, batch size 5, `ReportBatchItemFailures`.
- Schedules: daily ingest `cron(0 8 * * ? *)` Asia/Kolkata; digest `cron(15 8 * * ? *)` Asia/Kolkata; intraday `cron(0/15 9-15 ? * MON-FRI *)` America/New_York.
- Bedrock model id variable, default `apac.amazon.nova-micro-v1:0`.
- Secrets only in Secrets Manager (`marketpulse/<env>/finnhub`); never commit `.env`, tfvars with emails/phones go in `*.auto.tfvars` (gitignored).
- Env vars read by Lambdas: `TABLE_NAME`, `QUEUE_URL`, `ALERTS_TOPIC_ARN`, `FINNHUB_SECRET_ARN`, `SES_SENDER`, `BEDROCK_MODEL_ID`, `DIGEST_FUNCTION_NAME`, `FAIL_SYMBOLS` (staging only), `MARKETPULSE_STUB` (`1` = stub Finnhub/Comprehend/Bedrock).
- Dates/timestamps are UTC ISO-8601 (`2026-10-21T02:30:00Z`); sentiment date key = UTC date of the run.

## Review Focus

1. **Unknown/delisted symbol** (Finnhub quote returns `c == 0 and pc == 0`) → `PUT /watchlist/{symbol}` returns 400; worker logs and acks the message (no retry, no DLQ). Tests in Tasks 3, 6, 8.
2. **Headline text containing HTML** (`<script>`, `&`) → escaped in the digest HTML. Test in Task 11.
3. **Duplicate/concurrent stream deliveries** for the same breach → exactly one SNS publish (conditional write). Test in Task 9.
4. **User with an empty watchlist or digest opted out** → no digest email sent. Test in Task 11.
5. **SMS opted in but no phone / invalid phone** → `PUT /me` rejects non-E.164 phone with 400; notifier sends email only when phone missing. Tests in Tasks 6, 10.

---

## File structure

```
backend/
  pyproject.toml                 ruff + pytest config, dev deps
  src/marketpulse/
    __init__.py
    config.py                    env var accessors
    keys.py                      PK/SK builders
    db.py                        all DynamoDB access
    secrets.py                   Finnhub key from Secrets Manager (cached)
    finnhub.py                   Finnhub HTTP client
    sentiment.py                 Comprehend wrapper + pure aggregation
    summarize.py                 Bedrock summary
    alerts.py                    pure threshold evaluation
    digest_render.py             pure HTML/text digest rendering
    stubs.py                     fake Finnhub/Comprehend/Bedrock for MARKETPULSE_STUB=1
    handlers/{api,dispatcher,worker,evaluator,notifier,digest}.py
  tests/                         one test file per module, conftest.py with moto table fixture
infra/
  bootstrap/                     state bucket, OIDC, deploy role, budget
  modules/lambda_fn/             reusable: role + function + log group
  modules/{data,auth,api,ingestion,alerting,digest,frontend,observability}/
  envs/{staging,prod}/           main.tf, backend.tf, variables.tf, outputs.tf
frontend/                        Vite React TS mock app
  src/api/client.ts              typed API client (KEEP when replacing UI)
  src/auth/cognito.ts            sign-up/in/out, token (KEEP when replacing UI)
  src/pages/*, src/components/*  throwaway
docs/openapi.yaml
postman/marketpulse.postman_collection.json
docker-compose.yml, scripts/localstack_up.sh
.github/workflows/{ci,deploy}.yml
```

---

### Task 1: Tooling and backend skeleton

**Files:**
- Create: `backend/pyproject.toml`, `backend/src/marketpulse/__init__.py`, `backend/src/marketpulse/config.py`, `backend/tests/conftest.py`, `backend/tests/test_config.py`, `README.md`

**Interfaces:**
- Produces: `config.table_name() -> str`, `config.queue_url()`, `config.alerts_topic_arn()`, `config.finnhub_secret_arn()`, `config.ses_sender()`, `config.bedrock_model_id()` (default `apac.amazon.nova-micro-v1:0`), `config.digest_function_name()`, `config.fail_symbols() -> set[str]` (comma-split, uppercased, empty set if unset), `config.stub_mode() -> bool`.
- Produces fixture `table` in `conftest.py`: moto `mock_aws`, creates `marketpulse-test` table per Global Constraints (incl. GSI1, stream), sets `TABLE_NAME`, `AWS_DEFAULT_REGION=ap-south-1`, dummy credentials; yields the boto3 Table.

- [ ] **Step 1:** Install tools: `winget install Hashicorp.Terraform`, `winget install GitHub.cli`, `winget install TerraformLinters.tflint`, `pip install checkov`. Verify each `--version` prints.
- [ ] **Step 2:** `pyproject.toml`: project `marketpulse`, `requires-python >=3.13`, dev deps `pytest`, `moto[dynamodb,sqs,sns,ses,secretsmanager,lambda]>=5`, `boto3`, `ruff`; `[tool.pytest.ini_options] pythonpath = ["src"]`; ruff line-length 100. Create `.venv`, `pip install -e .[dev]`.
- [ ] **Step 3:** Write `test_config.py`: `fail_symbols()` with `FAIL_SYMBOLS=" aapl,MSFT "` → `{"AAPL","MSFT"}`; unset → `set()`; `bedrock_model_id()` default; `stub_mode()` true only for `"1"`.
- [ ] **Step 4:** Run `pytest backend/tests/test_config.py -v` → FAIL (module missing). Implement `config.py`. Run → PASS. `ruff check backend` clean.
- [ ] **Step 5:** README with prerequisites list (spec §9) and dev commands. Commit `chore: backend skeleton and tooling`.

### Task 2: Keys and DynamoDB access layer

**Files:**
- Create: `backend/src/marketpulse/keys.py`, `backend/src/marketpulse/db.py`, `backend/tests/test_db.py`

**Interfaces:**
- Produces `keys`: `user_pk(sub)`, `symbol_pk(sym)`, `watch_sk(sym)`, `price_sk(ts: str)`, `sent_sk(date: str)`, `alert_sk(sym, side)` → `"USER#<sub>"`, `"SYMBOL#<SYM>"`, `"WATCH#<SYM>"`, `"PRICE#<ts>"`, `"SENT#<date>"`, `"ALERT#<SYM>#<side>"`.
- Produces `db` (all floats in/out; Decimal conversion internal):
  - `get_or_create_profile(sub: str, email: str) -> dict` (defaults `smsOptIn False`, `digestOptIn True`)
  - `get_profile(sub) -> dict | None`, `update_profile(sub, **fields) -> dict`, `list_profiles() -> list[dict]`
  - `put_watch(sub, symbol, upper: float|None, lower: float|None) -> dict`, `delete_watch(sub, symbol) -> None`, `list_watches(sub) -> list[dict]`, `count_watches(sub) -> int`
  - `distinct_symbols() -> list[str]` (scan GSI1, sorted unique), `watchers(symbol) -> list[dict]` (query GSI1)
  - `put_price(symbol, ts: str, quote: dict) -> None` (ttl = now + 30 d), `latest_price(symbol) -> dict | None`
  - `put_sentiment(symbol, date: str, sentiment: dict, headlines: list[dict], summary: str|None) -> None` (ttl = now + 90 d), `get_sentiment(symbol, date) -> dict | None`
  - `history(symbol, days: int) -> {"prices": [...], "sentiment": [...]}` (ascending by SK, bounded by `days`)
  - `transition_alert(sub, symbol, side, new_state: str, price: float) -> bool` — conditional `UpdateItem`; condition `attribute_not_exists(#s) OR #s <> :new`; returns True iff the write happened. Caller notifies only when it returns True and `new_state == "BREACHED"`.
  - `get_alert_states(sub, symbol) -> dict[str, str]`

- [ ] **Step 1: Failing tests** (use `table` fixture):
  - `test_watch_roundtrip`: `put_watch("u1","AAPL",200.0,150.0)`; `list_watches("u1")[0]` has `symbol=="AAPL"`, `upper==200.0`; `watchers("AAPL")[0]["PK"]=="USER#u1"`.
  - `test_distinct_symbols_dedupes`: u1 & u2 both watch AAPL, u2 watches MSFT → `["AAPL","MSFT"]`.
  - `test_profile_defaults`: `get_or_create_profile("u1","a@x.com")` → `digestOptIn is True`, `smsOptIn is False`; second call does not overwrite an updated field.
  - `test_latest_price_and_history`: three `put_price` with increasing ts → `latest_price` is the last; `history("AAPL",7)["prices"]` length 3 ascending; each item has `ttl` ≈ now+30 d (±60 s).
  - `test_transition_alert_once`: `transition_alert(...,"BREACHED",201)` → True; repeat → False; `"CLEAR"` → True; `"BREACHED"` → True.
- [ ] **Step 2:** `pytest backend/tests/test_db.py -v` → FAIL.
- [ ] **Step 3:** Implement `keys.py`, `db.py` (lazy cached `boto3.resource("dynamodb").Table(config.table_name())`, reset helper `_reset_cache()` for tests).
- [ ] **Step 4:** Run → PASS. Commit `feat: dynamodb access layer`.

### Task 3: Secrets + Finnhub client

**Files:**
- Create: `backend/src/marketpulse/secrets.py`, `backend/src/marketpulse/finnhub.py`, `backend/src/marketpulse/stubs.py`, `backend/tests/test_finnhub.py`, `backend/tests/test_secrets.py`

**Interfaces:**
- Produces `secrets.finnhub_api_key() -> str` (cached; secret string is JSON `{"api_key": "..."}`; returns `"stub"` in stub mode).
- Produces `finnhub.UpstreamError(Exception)`, `finnhub.UnknownSymbol(Exception)`.
- Produces `class FinnhubClient(api_key: str, http_get: Callable[[str, float], tuple[int, bytes]] = _urllib_get, base="https://finnhub.io/api/v1")`:
  - `quote(symbol) -> dict` keys `price, change, changePct, high, low, open, prevClose` (from `c,d,dp,h,l,o,pc`); raises `UnknownSymbol` when `c == 0 and pc == 0`.
  - `company_news(symbol, frm: str, to: str, limit=10) -> list[dict]` keys `headline, source, url, datetime` (newest first, de-duplicated by headline).
  - `search(q) -> list[dict]` keys `symbol, description`; only `type == "Common Stock"` and symbols matching the regex; max 10.
  - Status 429 or ≥ 500 or `URLError`/timeout → `UpstreamError`. Timeout 5 s.
- Produces `stubs.FakeFinnhub` (same methods, deterministic data; `"ZZZZ"` → `UnknownSymbol`) and `finnhub.get_client() -> FinnhubClient | stubs.FakeFinnhub` (stub-mode aware).

- [ ] **Step 1: Failing tests** with an injected fake `http_get`:
  - `test_quote_maps_fields`: body `{"c":201.5,"d":1.5,"dp":0.75,"h":202,"l":199,"o":200,"pc":200}` → `price==201.5`, `changePct==0.75`.
  - `test_quote_unknown_symbol`: `{"c":0,"d":null,"dp":null,"h":0,"l":0,"o":0,"pc":0}` → raises `UnknownSymbol`.
  - `test_rate_limit_raises_upstream`: status 429 → `UpstreamError`; status 503 → `UpstreamError`.
  - `test_news_limit_and_dedupe`: 15 items with 2 duplicate headlines → ≤ 10, unique.
  - `test_search_filters`: mixed types → only common stock, `"BRK.B"` kept, `"ABC-W"` dropped.
  - `test_secret_cached` (moto secretsmanager): value read once across two calls.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. Commit `feat: finnhub client and secrets`.

### Task 4: Sentiment

**Files:**
- Create: `backend/src/marketpulse/sentiment.py`, `backend/tests/test_sentiment.py`; Modify: `stubs.py` (add `FakeComprehend`)

**Interfaces:**
- Produces `aggregate(results: list[dict]) -> dict` — input items are Comprehend `ResultList` entries; output `{"score": float (round 3), "label": str, "counts": {"POSITIVE":n,"NEGATIVE":n,"NEUTRAL":n,"MIXED":n}}`; score = mean(Positive − Negative); empty input → score 0.0, `NEUTRAL`, zero counts.
- Produces `analyze(headlines: list[str], client=None) -> dict | None` — `batch_detect_sentiment(LanguageCode="en")` in chunks of 25; returns `aggregate(...)`; returns `None` on any `ClientError` (logged). Empty list → `aggregate([])` without calling the client.

- [ ] **Step 1: Failing tests**: two strong positives → `POSITIVE`; scores `(0.1 pos, 0.05 neg)` → `NEUTRAL`; mixed mean 0.4 with score 0.0 → `MIXED`; score −0.2 → `NEGATIVE` even if mixed high (order rule); 30 headlines → client called twice; client raising `ClientError` → `None`.
- [ ] **Step 2–4:** FAIL → implement → PASS. Commit `feat: sentiment aggregation`.

### Task 5: Bedrock summary

**Files:**
- Create: `backend/src/marketpulse/summarize.py`, `backend/tests/test_summarize.py`; Modify: `stubs.py` (`FakeBedrock`)

**Interfaces:**
- Produces `summarize(symbol: str, headlines: list[str], client=None) -> str | None` — `bedrock-runtime.converse(modelId=config.bedrock_model_id(), inferenceConfig={"maxTokens":200,"temperature":0.2})`; prompt asks for ≤ 3 sentences, neutral tone, no investment advice; returns stripped text; `None` if headlines empty or on any exception.

- [ ] **Step 1: Failing tests**: fake client returning converse-shaped response → text; empty headlines → `None` and client not called; client raising → `None`; prompt contains symbol and every headline.
- [ ] **Step 2–4:** FAIL → implement → PASS. Commit `feat: bedrock summaries`.

### Task 6: API router Lambda

**Files:**
- Create: `backend/src/marketpulse/handlers/__init__.py`, `backend/src/marketpulse/handlers/api.py`, `backend/tests/test_api.py`, `docs/openapi.yaml`

**Interfaces:**
- Consumes: `db.*`, `finnhub.get_client()`, boto3 lambda `invoke(InvocationType="Event")`.
- Produces `api.handler(event: dict, context) -> dict` for HTTP API payload v2. Routes keyed on `event["routeKey"]`, claims at `event["requestContext"]["authorizer"]["jwt"]["claims"]` (`sub`, `email`). Response `{"statusCode", "headers": {"content-type":"application/json"}, "body": json}`; errors `{"error": msg}`.
  - `GET /health` (no auth) → 200 `{"ok": true}`
  - `GET /me`, `PUT /me` (`phone` must match `^\+[1-9]\d{7,14}$`; `smsOptIn` true requires phone present on profile or in body)
  - `GET /watchlist` → items enriched with `latest` (`price, changePct, ts`) and `alertState` (`get_alert_states`)
  - `PUT /watchlist/{symbol}` → validate regex, numbers > 0, `lower < upper`, cap 20 (only for new symbols), symbol exists via `quote()` (`UnknownSymbol` → 400, `UpstreamError` → 503 only for new symbols; existing symbols skip the check)
  - `DELETE /watchlist/{symbol}` → 204
  - `GET /symbols/search?q=` (q length 1–20) · `GET /symbols/{symbol}/history?days=` (1–30, default 7)
  - `POST /digest/trigger` → invokes `config.digest_function_name()` async with `{"sub": sub}` → 202
  - Malformed JSON body → 400; unknown route → 404.
- `docs/openapi.yaml`: OpenAPI 3.1 for the routes above with schemas `Profile`, `WatchItem`, `History`, `Error`; `bearerAuth` JWT.

- [ ] **Step 1: Failing tests** (helper `make_event(route, body=None, path=None, qs=None, sub="u1")`; patch `finnhub.get_client` with `FakeFinnhub`):
  - put + get watchlist roundtrip; `lower >= upper` → 400; 21st symbol → 400; `ZZZZ` → 400; lowercase `aapl` normalized to `AAPL`.
  - `PUT /me {"phone":"12345"}` → 400; `{"smsOptIn":true}` with no phone → 400; `{"phone":"+919876543210","smsOptIn":true}` → 200.
  - history `days=31` → 400; delete → 204 then list empty; bad JSON → 400; `/health` → 200; digest trigger → 202 and fake lambda client called with `{"sub":"u1"}`.
- [ ] **Step 2–4:** FAIL → implement → PASS. Write `docs/openapi.yaml`. Commit `feat: watchlist/profile API`.

### Task 7: Dispatcher

**Files:**
- Create: `backend/src/marketpulse/handlers/dispatcher.py`, `backend/tests/test_dispatcher.py`

**Interfaces:**
- Produces `dispatcher.handler(event, context) -> {"dispatched": int}`; `event["mode"]` ∈ {`daily`,`intraday`} (default `intraday`); sends one message per `db.distinct_symbols()` via `send_message_batch` in chunks of 10; message body JSON `{"symbol", "mode", "runAt"}`; raises if any batch entry fails.

- [ ] **Step 1: Failing tests** (moto SQS + table): 12 distinct symbols across users → 12 messages, 2 batches, each body has mode `daily`; no watches → `{"dispatched": 0}` and no messages.
- [ ] **Step 2–4:** FAIL → implement → PASS. Commit `feat: dispatcher`.

### Task 8: Worker

**Files:**
- Create: `backend/src/marketpulse/handlers/worker.py`, `backend/tests/test_worker.py`

**Interfaces:**
- Consumes: `finnhub.get_client()`, `sentiment.analyze`, `summarize.summarize`, `db.put_price`, `db.put_sentiment`, `config.fail_symbols()`.
- Produces `worker.handler(event, context) -> {"batchItemFailures": [{"itemIdentifier": messageId}, ...]}`. Per record:
  - symbol in `fail_symbols()` → failure (demo hook).
  - `quote()` → `put_price(symbol, runAt, quote)`. `UnknownSymbol` → log warning, success (ack). `UpstreamError` / unexpected exception → failure.
  - mode `daily` only: news for last 1 day (`frm`=run date −1, `to`=run date) → `analyze(headlines)` → `summarize(...)` → `put_sentiment(symbol, run date, sentiment or {"score":0.0,"label":"NEUTRAL","counts":{}}, headlines[:5], summary)`.
  - News fetch `UpstreamError` → failure (whole message retried; price write is idempotent by SK).

- [ ] **Step 1: Failing tests** (stub clients via monkeypatch): intraday writes price only; daily writes price + sentiment with ≤ 5 headlines and summary; `ZZZZ` → no failures, no writes; `FAIL_SYMBOLS=MSFT` with AAPL+MSFT batch → only MSFT's messageId in failures, AAPL written; client raising `UpstreamError` → failure listed.
- [ ] **Step 2–4:** FAIL → implement → PASS. Commit `feat: ingestion worker`.

### Task 9: Alert evaluator

**Files:**
- Create: `backend/src/marketpulse/alerts.py`, `backend/src/marketpulse/handlers/evaluator.py`, `backend/tests/test_alerts.py`, `backend/tests/test_evaluator.py`

**Interfaces:**
- Produces `alerts.evaluate(price: float, upper: float|None, lower: float|None) -> dict[str, str]` — `{"UPPER": "BREACHED"|"CLEAR"}` if upper set (`price >= upper`), `{"LOWER": ...}` if lower set (`price <= lower`).
- Produces `evaluator.handler(event, context) -> {"published": int}` — for each stream record with `eventName == "INSERT"` and `NewImage.SK` starting `PRICE#`: symbol from PK, price from image; for each `db.watchers(symbol)` and each side in `evaluate(...)`: `db.transition_alert(...)`; if it returned True and state is `BREACHED` → SNS publish to `config.alerts_topic_arn()` with JSON `{"sub","symbol","side","price","threshold","ts"}`.

- [ ] **Step 1: Failing tests**: `evaluate(201,200,150) == {"UPPER":"BREACHED","LOWER":"CLEAR"}`; `evaluate(150,None,150) == {"LOWER":"BREACHED"}`; evaluator with moto SNS (subscribe an SQS queue to count publishes): breach → 1 publish; **same record delivered twice → still 1 publish**; price back inside band then breach again → 2 publishes total; `MODIFY` events ignored.
- [ ] **Step 2–4:** FAIL → implement → PASS. Commit `feat: alert evaluator with dedup`.

### Task 10: Notifier

**Files:**
- Create: `backend/src/marketpulse/handlers/notifier.py`, `backend/tests/test_notifier.py`

**Interfaces:**
- Produces `notifier.handler(event, context) -> {"emails": int, "sms": int}` — SNS event; loads `db.get_profile(sub)`; SES `send_email` from `config.ses_sender()`, subject `"MarketPulse alert: {symbol} {crossed above|fell below} {threshold}"`; if `smsOptIn` and `phone` → `sns.publish(PhoneNumber=phone, Message=<≤160 chars>, MessageAttributes={"AWS.SNS.SMS.SMSType": Transactional})`. Missing profile → skip, log.

- [ ] **Step 1: Failing tests** (moto SES with verified sender, moto SNS): email sent with correct subject for UPPER; SMS sent when opted in with phone; opted in but no phone → email only; SMS message ≤ 160 chars.
- [ ] **Step 2–4:** FAIL → implement → PASS. Commit `feat: alert notifier`.

### Task 11: Digest

**Files:**
- Create: `backend/src/marketpulse/digest_render.py`, `backend/src/marketpulse/handlers/digest.py`, `backend/tests/test_digest_render.py`, `backend/tests/test_digest.py`

**Interfaces:**
- Produces `digest_render.render(email: str, date: str, items: list[dict]) -> tuple[str, str, str]` (subject, html, text). Each item: `symbol, price, changePct, label, score, summary|None, headlines[{headline,url,source}]`, price may be None (“no data”). Subject `"MarketPulse digest — {date}"`. All interpolated values `html.escape`d; inline CSS only; label colour green/red/grey/amber.
- Produces `digest.handler(event, context) -> {"sent": int}` — targets `[event["sub"]]` if present else all `db.list_profiles()` with `digestOptIn`; skips users with no watches; date = today UTC; builds items from `latest_price` + `get_sentiment`; SES `send_email` with HTML + text bodies.

- [ ] **Step 1: Failing tests**: headline `"<script>x</script> & co"` appears escaped (`&lt;script&gt;`, `&amp;`) and raw `<script>` absent; item with no sentiment renders "No news today"; digest handler with 3 users (one empty watchlist, one opted out, one normal) sends exactly 1; `{"sub":"u1"}` sends only to u1 even if opted out (manual trigger).
- [ ] **Step 2–4:** FAIL → implement → PASS. Commit `feat: digest`.

### Task 12: Terraform bootstrap (user applies once)

**Files:**
- Create: `infra/bootstrap/{main.tf,variables.tf,outputs.tf,versions.tf}`

**Interfaces:**
- Produces outputs: `state_bucket` (`marketpulse-tfstate-<account_id>`), `deploy_role_arn`.
- Resources: S3 state bucket (versioning, SSE, public access block, TLS-only policy); `aws_iam_openid_connect_provider` for `token.actions.githubusercontent.com`; role `marketpulse-github-deploy` trusted for `repo:<github_repo>:*` (variable `github_repo`, e.g. `owner/marketpulse`) with `PowerUserAccess` + an inline IAM policy allowing `iam:*` on `arn:aws:iam::*:role/marketpulse-*` and `arn:aws:iam::*:policy/marketpulse-*`; `aws_budgets_budget` monthly 5 USD with 80 % actual and 100 % forecast email notifications to `var.budget_email`. Local state (committed nowhere; documented).

- [ ] **Step 1:** Write files. `terraform -chdir=infra/bootstrap init && terraform validate` → "Success!". `tflint --chdir infra/bootstrap` clean.
- [ ] **Step 2 (USER):** `aws configure` / SSO login; `terraform apply -var github_repo=... -var budget_email=...`. Record outputs. Commit `infra: bootstrap stack`.

### Task 13: Reusable lambda module + data + auth modules

**Files:**
- Create: `infra/modules/lambda_fn/*`, `infra/modules/data/*`, `infra/modules/auth/*`

**Interfaces:**
- `lambda_fn` inputs: `name, handler, source_zip, source_hash, env (map), timeout=30, memory=256, policy_json`; outputs `function_name, function_arn, role_arn, invoke_arn`. Creates role (assume lambda), basic logging, inline policy, log group (14-day retention), function `python3.13`, `arm64`.
- `data` outputs: `table_name, table_arn, stream_arn, gsi_arn`. Table per Global Constraints, `PAY_PER_REQUEST`, PITR on.
- `auth` inputs `name, callback_urls`; outputs `user_pool_id, user_pool_arn, client_id, issuer`. Email username, auto-verified email, public SPA client without secret, `ALLOW_USER_SRP_AUTH` + `ALLOW_REFRESH_TOKEN_AUTH`.
- Backend zip produced in env root via `data "archive_file"` of `backend/src` (excludes `__pycache__`).

- [ ] **Step 1:** Write modules. Temporary `infra/envs/staging/main.tf` composes data + auth. `terraform validate` passes; `tflint` clean; `checkov -d infra --quiet` has no failures except documented skips (`#checkov:skip=<id>:<reason>`).
- [ ] **Step 2:** Commit `infra: lambda_fn, data, auth modules`.

### Task 14: api, ingestion, alerting, digest, observability modules

**Files:**
- Create: `infra/modules/{api,ingestion,alerting,digest,observability}/*`

**Interfaces:**
- `api`: HTTP API, JWT authorizer (issuer/audience from auth), routes from Task 6 (`GET /health` without auth), CORS for `var.allowed_origins`, `$default` stage with access logs; api Lambda via `lambda_fn` (DynamoDB CRUD on table + GSI, `secretsmanager:GetSecretValue` on Finnhub secret, `lambda:InvokeFunction` on digest). Output `api_url`.
- `ingestion`: Secrets Manager secret `marketpulse/<env>/finnhub` (no value — user sets it), SQS queue + DLQ (constraints), dispatcher + worker via `lambda_fn`, ESM per constraints, EventBridge Scheduler schedules daily (`{"mode":"daily"}`) + intraday with a scheduler role. Worker policy: `comprehend:BatchDetectSentiment`, `bedrock:InvokeModel` on the model/inference-profile ARNs, table write, secret read. Output `queue_arn, dlq_name, finnhub_secret_arn`.
- `alerting`: SNS `alerts` topic, evaluator (stream ESM with filter `{"eventName":["INSERT"],"dynamodb":{"Keys":{"SK":{"S":[{"prefix":"PRICE#"}]}}}}`), notifier subscribed to topic; notifier policy `ses:SendEmail`, `sns:Publish` (for SMS, `Resource "*"` with checkov skip reason), table read. SES email identity for `var.ses_sender` and each of `var.ses_verified_recipients`.
- `digest`: digest Lambda (timeout 120 s), schedule per constraints. Output `function_name`.
- `observability`: SNS admin topic with email subscriptions `var.admin_emails`; alarms: DLQ visible > 0 (1 period, 60 s), per-function `Errors > 0` over 5 min, API 5xx > 5 over 5 min; CloudWatch dashboard (invocations/errors per function, queue depth, DLQ depth).

- [ ] **Step 1:** Write modules, compose all in `infra/envs/staging/main.tf` with `backend.tf` (S3, `use_lockfile = true`, key `staging/terraform.tfstate`). `terraform validate`, `tflint`, `checkov` pass.
- [ ] **Step 2 (USER):** `terraform apply` staging; set Finnhub secret: `aws secretsmanager put-secret-value --secret-id marketpulse/staging/finnhub --secret-string '{"api_key":"..."}'`; click SES verification emails; enable Bedrock Nova Micro access.
- [ ] **Step 3: Verify:** `aws lambda invoke --function-name marketpulse-staging-dispatcher --payload '{"mode":"daily"}'` after adding a watch via API → price + sentiment rows exist; set `FAIL_SYMBOLS` → DLQ alarm fires to admin email within ~5 min; breached threshold → alert email < 1 min; second run → no email. Commit `infra: full staging stack`.

### Task 15: Mock UI + frontend hosting

**Files:**
- Create: `frontend/` (Vite React TS), `infra/modules/frontend/*`; Modify: `infra/envs/staging/main.tf`

**Interfaces:**
- Consumes: API contract (Task 6), Terraform outputs `api_url, user_pool_id, client_id` as `VITE_API_URL, VITE_USER_POOL_ID, VITE_CLIENT_ID`.
- Produces `src/auth/cognito.ts`: `signUp(email, password)`, `confirmSignUp(email, code)`, `signIn(email, password)`, `signOut()`, `getIdToken(): Promise<string|null>`.
- Produces `src/api/client.ts`: typed `getMe, updateMe, getWatchlist, putWatch, deleteWatch, searchSymbols, getHistory, triggerDigest` mirroring openapi schemas; attaches `Authorization: Bearer <idToken>`; throws `ApiError{status, message}`.
- Pages (plain, unstyled): Login/Signup/Confirm, Watchlist (table + add/edit thresholds + delete + search), Symbol detail (Recharts line of price + bar of sentiment score), Settings (phone, SMS/digest opt-in), "Send digest now" button.
- `frontend` module: private S3 bucket, CloudFront with OAC, SPA fallback (403/404 → `/index.html`), outputs `bucket, distribution_id, url`.

- [ ] **Step 1:** `npm create vite@latest frontend -- --template react-ts`; add deps; implement; `npm run build` succeeds; `npm run dev` against staging: sign up, add AAPL, see chart.
- [ ] **Step 2:** Add module, apply, `aws s3 sync frontend/dist s3://<bucket>` + invalidation; CloudFront URL loads and logs in. Commit `feat: mock UI and hosting`.

### Task 16: Prod env + CI/CD

**Files:**
- Create: `infra/envs/prod/*`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `postman/marketpulse.postman_collection.json`, `.tflint.hcl`

**Interfaces:**
- `envs/prod` = same composition as staging, `FAIL_SYMBOLS` not set, key `prod/terraform.tfstate`.
- `ci.yml` on `pull_request`: jobs `python` (3.13, ruff, pytest), `terraform` (fmt -check, validate both envs, tflint, checkov), `plan` (OIDC `aws-actions/configure-aws-credentials` with `vars.AWS_ROLE_ARN`, `terraform plan` staging, post output as PR comment), `frontend` (npm ci, build).
- `deploy.yml` on push to `main`: `staging` job (environment `staging`): apply → newman smoke (`/health` 200, `/watchlist` without token 401, CloudFront 200) → frontend build with staging outputs → s3 sync → invalidation; `prod` job `needs: staging`, environment `prod` (required reviewer) does the same for prod.
- Postman collection variables `baseUrl`, `idToken`; requests for every route.

- [ ] **Step 1:** Write files; `actionlint` (or `gh workflow view` after push) shows no errors.
- [ ] **Step 2 (USER):** Create GitHub repo, push, set `AWS_ROLE_ARN` variable, create `staging`/`prod` environments (prod with required reviewer), protect `main`.
- [ ] **Step 3: Verify:** open a PR → CI green with plan comment; merge → staging deploys, prod waits for approval, then deploys. Commit `ci: pipelines and prod env`.

### Task 17: LocalStack dev loop

**Files:**
- Create: `docker-compose.yml`, `scripts/localstack_up.sh`, `scripts/local_seed.py`; Modify: `README.md`

**Interfaces:**
- `docker-compose.yml`: `localstack/localstack` with `LOCALSTACK_AUTH_TOKEN` from `.env`, services `dynamodb,sqs,sns,lambda,s3,ses,secretsmanager,logs`.
- `localstack_up.sh`: creates the table (same schema), queue+DLQ, alerts topic, verified SES sender with `awslocal`; deploys the zip as functions with `MARKETPULSE_STUB=1`.
- `local_seed.py`: inserts a profile + watches (AAPL breached, MSFT not), invokes dispatcher `daily`, then evaluator via stream (or direct invoke), then digest; prints SES sent messages from LocalStack's `/_aws/ses` endpoint.

- [ ] **Step 1:** Implement; `docker compose up -d && bash scripts/localstack_up.sh && python scripts/local_seed.py` prints 1 alert email and 1 digest email. Commit `chore: localstack dev loop`.

### Task 18: Destroy/recreate drill + docs

- [ ] **Step 1 (USER + agent):** `terraform destroy` staging, then `apply` → Task 14 Step 3 checks pass again; record times.
- [ ] **Step 2:** Add `docs/architecture.md` (diagram from spec §2, runbook: rotate Finnhub key, replay DLQ with `aws sqs start-message-move-task`, add SES recipient). Commit `docs: runbook`.
