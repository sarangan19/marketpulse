# MarketPulse

Serverless, event-driven market intelligence and alerting on AWS (ap-south-1).
Design: [`docs/superpowers/specs/2026-10-21-marketpulse-design.md`](docs/superpowers/specs/2026-10-21-marketpulse-design.md) ·
API contract: [`docs/openapi.yaml`](docs/openapi.yaml) · Runbook: [`docs/architecture.md`](docs/architecture.md)

## Live environments
| | Staging | Prod |
|---|---|---|
| App | https://dmpzpnqxyg4tn.cloudfront.net | https://d3bss174x8ihgi.cloudfront.net |
| API | https://nh8gecxm46.execute-api.ap-south-1.amazonaws.com | https://49tc1h3a88.execute-api.ap-south-1.amazonaws.com |
| Dashboard | CloudWatch → `marketpulse-staging` | CloudWatch → `marketpulse-prod` |

Demo script: [`docs/demo-runbook.md`](docs/demo-runbook.md).

## Layout
| Path | What |
|---|---|
| `backend/src/marketpulse` | Python 3.13 Lambdas (one package, one zip, six handlers) |
| `backend/tests` | pytest + moto (incl. an in-process end-to-end pipeline test) |
| `infra/bootstrap` | one-time stack: state bucket, GitHub OIDC deploy role, budget |
| `infra/modules/*` | `stack` composes `data, auth, api, ingestion, alerting, digest, frontend, observability` |
| `infra/envs/{staging,prod}` | thin roots calling `modules/stack` |
| `frontend/` | **mock** React UI — keep `src/api/` and `src/auth/`, replace the rest |
| `.github/workflows` | `ci.yml` (PRs), `deploy.yml` → `deploy-env.yml` (main: staging → approval → prod) |
| `scripts/` | `build_lambda.py`, `make_postman.py`, `localstack_up.py`, `local_seed.py` |

## Prerequisites (team-owned)
| Item | Where it goes |
|---|---|
| Finnhub API key | Secrets Manager `marketpulse/<env>/finnhub` as `{"api_key":"..."}` |
| AWS CLI credentials | local profile, used for `infra/bootstrap` and first staging apply |
| SES sender + recipient emails | `infra/bootstrap` var `ses_identities` (account-wide); click the verification emails |
| Bedrock model access (Amazon Nova Micro) | Bedrock console → Model access (ap-south-1) |
| SMS sandbox phone numbers | SNS console → Text messaging → Sandbox destination phone numbers |
| LocalStack auth token | `.env` → `LOCALSTACK_AUTH_TOKEN` |
| GitHub repo + envs | see "CI/CD setup" below |

## Backend dev
```bash
cd backend
py -3.13 -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"
.venv/Scripts/python -m pytest
.venv/Scripts/ruff check .
```

## Deploy (first time, by hand)
```bash
# 1. bootstrap (local state, once per account)
cd infra/bootstrap
terraform init
terraform apply -var github_repo=<owner>/<repo> -var budget_email=<you@example.com> \
  -var 'ses_identities=["sender@example.com","teammate@example.com"]'

# 2. staging
cd ../..
python scripts/build_lambda.py
cd infra/envs/staging
cp terraform.tfvars.example terraform.auto.tfvars   # edit emails (file is gitignored)
terraform init -backend-config="bucket=<state_bucket output>"
terraform apply
aws secretsmanager put-secret-value --secret-id marketpulse/staging/finnhub --secret-string '{"api_key":"<key>"}'
```

> **Network note:** on networks where IPv6 to `releases.hashicorp.com` is reset, download the AWS provider
> zip with `curl -4` into a filesystem mirror and point `TF_CLI_CONFIG_FILE` at a `provider_installation`
> block using it. Lock files already contain linux + windows hashes.

## Frontend dev
```bash
cd frontend
npm install
cp .env.example .env.local   # fill from `terraform output` (api_url, user_pool_id, client_id)
npm run dev                  # http://localhost:5173 (allowed by staging CORS)
```

## Local loop (LocalStack)
```bash
echo LOCALSTACK_AUTH_TOKEN=<token> > .env
docker compose up -d
backend/.venv/Scripts/python scripts/localstack_up.py
backend/.venv/Scripts/python scripts/local_seed.py   # prints 1 alert + 1 digest email
```
Finnhub, Comprehend and Bedrock are stubbed in this mode (`MARKETPULSE_STUB=1`).

## CI/CD setup
1. Create the GitHub repo and push. Protect `main` (require PR + passing `ci`).
2. Repo variables: `AWS_ROLE_ARN` (bootstrap output), `TF_STATE_BUCKET` (bootstrap output).
3. Environments `staging` and `prod` (prod: required reviewer). Per-environment variables:
   `SES_SENDER`, `ADMIN_EMAILS` (JSON list, optional), staging only `FAIL_SYMBOLS`.
4. If the repo uses GitHub's immutable OIDC subjects (newer repos do), pass the prefix to bootstrap:
   `gh api repos/<owner>/<repo>/actions/oidc/customization/sub --jq .sub_claim_prefix` →
   `-var github_sub_prefix=...`. Without it, `configure-aws-credentials` fails with
   "Not authorized to perform sts:AssumeRoleWithWebIdentity".

## Known constraints
- **AWS Free plan accounts cannot call Comprehend** (`SubscriptionRequiredException`); headline sentiment
  then falls back to Bedrock (Nova Micro) automatically, and items record `source: bedrock`.
- **Finnhub free plan has no historical candles**, so price history accumulates from the 15-minute intraday
  runs; `scripts/backfill_sentiment.py` backfills news sentiment (real headlines) only.
- **SES sandbox**: only verified addresses receive mail (`ses_identities` in `infra/bootstrap`).
