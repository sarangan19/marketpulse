# MarketPulse — Design Spec

Date: 2026-10-21 · Source: `CCD_Miniproject_Synopsis_MarketPulse.docx`

## 1. Goal and scope

A serverless, event-driven market intelligence platform on AWS (`ap-south-1`): a daily HTML digest
(prices + news sentiment + AI summary) and near-real-time price-threshold alerts for each user's
watchlist of **US stocks** (data from **Finnhub** free tier). Infrastructure is 100% Terraform,
delivered by GitHub Actions. Focus is cloud architecture / DevOps, not financial modelling.

**Work split:** this phase builds backend + infra + a deliberately plain **mock UI**. The real UI is
built later by the team against the API contract (`docs/openapi.yaml`) and the frontend's
`src/api/` + `src/auth/` modules, which are kept when components are replaced.

### Success criteria (from synopsis)
1. A scheduled run completes end to end and produces a correct digest email for every watchlist symbol.
2. A threshold breach notifies within 1 minute of ingestion; a sustained breach is not re-notified.
3. A forced upstream error is retried; a permanently failing message lands in the DLQ and fires a CloudWatch alarm.
4. `terraform destroy` + `apply` recreates everything; merge to `main` reaches prod with no console clicks.
5. Monthly cost ≈ 0, verified via AWS Budgets.

### In scope (v1)
Cognito auth, watchlist/threshold API, scheduled + intraday ingestion, Comprehend sentiment,
Bedrock summaries, email + SMS alerts, HTML digest, mock dashboard, staging + prod, LocalStack dev,
CI/CD with tflint/Checkov/pytest.

### Out of scope
Non-US markets, real-time streaming quotes, portfolio/position tracking, custom domain, production SES/SMS
access (we run in sandbox with verified recipients).

## 2. Architecture

```
EventBridge Scheduler ──(daily 08:00 IST + intraday every 15m in US hours)──▶ dispatcher λ
dispatcher λ ──scan sparse GSI1, dedupe symbols──▶ SQS ingest-queue (1 msg / symbol)
SQS ingest-queue ──(maxReceive 3)──▶ ingest-dlq ──▶ CloudWatch alarm ──▶ SNS admin topic
SQS ingest-queue ──(event source, maximum_concurrency=2)──▶ worker λ
worker λ: Finnhub quote + company-news ─▶ Comprehend batch sentiment ─▶ (daily run only) Bedrock summary
        ─▶ DynamoDB PRICE# + SENT# items (TTL)
DynamoDB Stream (filter: SK begins_with PRICE#) ──▶ evaluator λ
evaluator λ: lookup watchers via GSI1, compare thresholds, conditional-update ALERT# state
          ─▶ on CLEAR→BREACHED: SNS alerts topic
SNS alerts topic ──▶ notifier λ ──▶ SES email (+ SNS SMS publish if user opted in)
EventBridge Scheduler (08:15 IST) + POST /digest/trigger ──▶ digest λ ──▶ SES HTML email per user
API Gateway HTTP API + Cognito JWT authorizer ──▶ api λ (single router function) ──▶ DynamoDB
S3 (private) + CloudFront (OAC) ──▶ React SPA
Secrets Manager: Finnhub key · CloudWatch: logs, dashboard, alarms · Budgets: cost alarm
```

### Key decisions
| Decision | Choice | Rationale |
|---|---|---|
| Lambda runtime | Python 3.13, zip + shared code bundled per function | boto3 built-in; no ECR. |
| API | HTTP API (REST-style routes), Cognito JWT authorizer | Native JWT auth, cheaper than REST API. |
| API Lambda | One router Lambda for all routes | Fewer resources; routes are tiny. |
| Rate limiting | SQS ESM `maximum_concurrency = 2`, Finnhub client handles 429 by raising (→ SQS retry) | New accounts may lack reserved concurrency. |
| Alert trigger | DynamoDB Streams with event filter | Decouples alerting from ingestion. |
| Per-user notification | notifier Lambda sends to the specific user | SNS email subscriptions are topic-wide. |
| Digest completion | Fixed offset schedule (+15 min) and manual trigger | Simple and reliable; run-tracking is YAGNI. |
| State | S3 backend with `use_lockfile = true` (TF ≥ 1.10) | Remote state + locking without a lock table. |
| CI auth | GitHub OIDC → IAM role | No long-lived keys in GitHub. |
| Bedrock model | Variable; default `apac.amazon.nova-micro-v1:0` inference profile | Cheapest; switchable to Claude Haiku. Summary failures degrade gracefully (digest omits summary). |
| Partial batch failure | Worker returns `batchItemFailures` | Only failed symbols retry. |

## 3. Data model (single table `marketpulse-<env>`)

| Item | PK | SK | Attributes | GSI1PK / GSI1SK |
|---|---|---|---|---|
| Profile | `USER#<sub>` | `PROFILE` | email, phone, smsOptIn, digestOptIn, createdAt | — |
| Watch | `USER#<sub>` | `WATCH#<SYM>` | symbol, upper, lower, createdAt | `SYMBOL#<SYM>` / `USER#<sub>` |
| Price | `SYMBOL#<SYM>` | `PRICE#<iso-ts>` | price, change, changePct, high, low, open, prevClose, ttl | — |
| Sentiment | `SYMBOL#<SYM>` | `SENT#<yyyy-mm-dd>` | score (−1..1), label, counts, headlines[≤5], summary?, ttl | — |
| Alert state | `USER#<sub>` | `ALERT#<SYM>#<UPPER\|LOWER>` | state, lastPrice, lastNotifiedAt | — |

- GSI1 is sparse (only Watch items carry GSI1 keys): dispatcher scans it for distinct symbols;
  evaluator queries it per symbol.
- TTL: price 30 days, sentiment 90 days.
- Sentiment score = mean over headlines of (Positive − Negative); label = POSITIVE ≥ 0.15, NEGATIVE ≤ −0.15,
  MIXED if mean Mixed > 0.3, else NEUTRAL.
- Alert rule: `price >= upper` → UPPER breached, `price <= lower` → LOWER breached; returning inside the
  band resets to CLEAR. Transition is a conditional write so concurrent evaluations notify once.

## 4. API contract (all routes require Cognito JWT; `sub` from claims)

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/me` | — | profile (auto-created on first call from token email) |
| PUT | `/me` | `{phone?, smsOptIn?, digestOptIn?}` | profile |
| GET | `/watchlist` | — | `[{symbol, upper, lower, latest?{price, changePct, ts}, alertState}]` |
| PUT | `/watchlist/{symbol}` | `{upper?, lower?}` (lower < upper when both set) | watch item |
| DELETE | `/watchlist/{symbol}` | — | 204 |
| GET | `/symbols/search` | `q` | `[{symbol, description}]` (Finnhub lookup, US common stock) |
| GET | `/symbols/{symbol}/history` | `days` (1–30, default 7) | `{prices:[...], sentiment:[...]}` |
| POST | `/digest/trigger` | — | 202; async-invokes digest for caller only |

Errors: `{"error": "<message>"}` with 400/401/404/429/500. Max 20 symbols per watchlist.
Symbols are validated `^[A-Z.]{1,10}$`. Full schema lives in `docs/openapi.yaml`.

## 5. Error handling
- Finnhub 429/5xx/timeouts → raise → message retried by SQS (visibility timeout 6× function timeout);
  after 3 receives → DLQ → alarm (`ApproximateNumberOfMessagesVisible > 0`) → admin SNS (email).
- Comprehend/Bedrock failures → logged, item written without sentiment/summary (degraded, not lost).
- Demo hook: `FAIL_SYMBOLS` env var (staging only) makes the worker raise for listed symbols, to show retry → DLQ.
- Ops alarms: Lambda errors per function, DLQ depth, API 5xx; all → admin topic.

## 6. Security
- One IAM role per function, scoped to exact table/queue/topic/secret ARNs; Comprehend/Bedrock actions only on worker.
- Finnhub key only in Secrets Manager; fetched once per cold start and cached.
- S3 bucket private (OAC), TLS-only bucket policy; DynamoDB + SQS + SNS encrypted (AWS-managed keys).
- Checkov runs in CI; justified skips documented inline.

## 7. Environments & delivery
- `infra/bootstrap` (applied once by hand): state bucket, GitHub OIDC provider + deploy role, budget alarm.
- `infra/envs/staging`, `infra/envs/prod` call the same `infra/modules/*`.
- `ci.yml` (PR): terraform fmt/validate, tflint, Checkov, ruff, pytest, `terraform plan` (staging) as PR comment.
- `deploy.yml` (push to main): apply staging → smoke test → (GitHub environment approval) apply prod → build + upload SPA → CloudFront invalidation.
- LocalStack (`docker-compose.yml`) for DynamoDB/SQS/SNS/Lambda/S3 local runs; Comprehend/Bedrock/Finnhub stubbed via `MARKETPULSE_STUB=1`.

## 8. Testing
- pytest + moto for every Lambda handler and shared module; Finnhub mocked with `responses`.
- Pure functions (sentiment aggregation, alert transition, digest rendering) unit-tested directly.
- Postman/newman collection for API smoke test against staging (also used in `deploy.yml`).

## 9. External prerequisites (owner: team)
Finnhub API key · AWS CLI credentials for bootstrap · SES verified sender + recipient emails ·
Bedrock model access (Nova Micro) · SNS SMS sandbox verified phones · LocalStack auth token ·
GitHub repo with `staging`/`prod` environments and `AWS_ROLE_ARN` variable.
