# MarketPulse

Serverless, event-driven market intelligence and alerting on AWS (ap-south-1).
Design: `docs/superpowers/specs/2026-10-21-marketpulse-design.md` · Plan: `docs/superpowers/plans/`.

## Layout
- `backend/` — Python 3.13 Lambdas (`src/marketpulse`), tests (`tests/`)
- `infra/` — Terraform: `bootstrap/`, `modules/`, `envs/{staging,prod}`
- `frontend/` — mock React UI (keep `src/api` and `src/auth` when replacing)
- `.github/workflows/` — CI (PRs) and deploy (main)

## Prerequisites (team-owned)
| Item | Where it goes |
|---|---|
| Finnhub API key | Secrets Manager `marketpulse/<env>/finnhub` as `{"api_key":"..."}` |
| AWS CLI credentials | local profile, used once for `infra/bootstrap` |
| SES sender + recipient emails | Terraform vars; click the verification emails |
| Bedrock model access (Amazon Nova Micro) | Bedrock console → Model access |
| SMS sandbox phone numbers | SNS console → Text messaging → Sandbox destinations |
| LocalStack auth token | `.env` → `LOCALSTACK_AUTH_TOKEN` |
| GitHub repo, envs `staging`/`prod`, var `AWS_ROLE_ARN` | GitHub settings |

## Backend dev
```bash
cd backend
py -3.13 -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"
.venv/Scripts/python -m pytest
.venv/Scripts/ruff check .
```
