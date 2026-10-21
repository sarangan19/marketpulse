# Final demo runbook

All commands are for **PowerShell**, run from the repo root (`C:\Users\saran\OneDrive\Documents\marketpulse`).
Run this first in every new terminal:

```powershell
$env:AWS_PROFILE = "marketpulse"; $env:AWS_REGION = "ap-south-1"
```

| Thing | Value |
|---|---|
| App (staging) | https://dmpzpnqxyg4tn.cloudfront.net |
| API (staging) | https://nh8gecxm46.execute-api.ap-south-1.amazonaws.com |
| Repo / pipeline | https://github.com/sarangan19/marketpulse → Actions |
| Dashboard | CloudWatch → Dashboards → `marketpulse-staging` |
| Demo login | `marketpulse164@gmail.com` (the only SES-verified recipient) |

## 0. Night before / 30 min before (prep)

1. Sign in to the app and confirm the watchlist shows prices. Open a symbol page to check that the sentiment chart has ~30 days of bars (from the backfill).
2. Have these tabs open: the app, the Gmail inbox for `marketpulse164@gmail.com`, GitHub Actions, the CloudWatch dashboard, and SQS → `marketpulse-staging-ingest-dlq`.
3. **Pre-record backups** of the two slow parts (screen recordings): the GitHub pipeline run (PR checks → merge → staging → approve → prod), and the DLQ alarm email arriving.
4. If the last scheduled run was hours ago, refresh the data:
   ```powershell
   aws lambda invoke --function-name marketpulse-staging-dispatcher --cli-binary-format raw-in-base64-out --payload fileb://scripts/payloads/daily.json out.json; Get-Content out.json
   ```

## 1. Architecture (slides, ~2 min)
Use the flow in `docs/architecture.md`: Scheduler → dispatcher → SQS/DLQ → worker → DynamoDB → Stream → evaluator → SNS → notifier, plus digest, API Gateway + Cognito, CloudFront. Mention that everything is Terraform modules, and that there are two environments built from one `stack` module.

## 2. Start the DLQ demo FIRST (it runs in the background: ~7 min to the DLQ, alarm ~2 min later)
Criterion: *a deliberately induced API error is retried, then routed to the DLQ and surfaced by an alarm.*

```powershell
# a) make the worker fail for TSLA (simulated upstream API error); only the worker's env changes
python scripts/build_lambda.py
cd infra/envs/staging
terraform apply -var fail_symbols=TSLA -auto-approve
cd ../../..
# b) shorten retries for the live demo: 60 s visibility (normally 360 s) -> 3 tries; rehearsed: DLQ at +6.5 min, ALARM at +9 min
$q = aws sqs get-queue-url --queue-name marketpulse-staging-ingest --query QueueUrl --output text
aws sqs set-queue-attributes --queue-url $q --attributes VisibilityTimeout=60
# c) make sure TSLA is on the watchlist (add it in the app), then dispatch
aws lambda invoke --function-name marketpulse-staging-dispatcher --cli-binary-format raw-in-base64-out --payload fileb://scripts/payloads/intraday.json out.json; Get-Content out.json
```
Narrate while it runs: the worker returns `batchItemFailures` only for TSLA, so the other symbols succeed. SQS redelivers TSLA, and after 3 receives it moves to the DLQ. Come back to it in step 6.

## 3. App walkthrough (~3 min)
- Sign in. In the watchlist, add `MSFT` with an **upper** threshold just *below* its current price. (Search for it, save, and the price shows after the next run.)
- Open AAPL to show the price line and the 30-day sentiment bars, with the AI summary and headlines underneath.
- Settings: phone and SMS opt-in, digest opt-in.

## 4. Alert in under 1 minute, then no repeats (~2 min)
Criterion: *a breach notifies within 1 minute, and a sustained breach isn't repeated.*
```powershell
aws lambda invoke --function-name marketpulse-staging-dispatcher --cli-binary-format raw-in-base64-out --payload fileb://scripts/payloads/intraday.json out.json
```
- The email "MarketPulse alert: MSFT crossed above …" arrives in about 10–30 s. Show the timestamp.
- Run the same command again. **No second email** arrives. Point at the watchlist's `alertState` (`UPPER: BREACHED`) and explain the conditional write (`CLEAR → BREACHED` only).

## 5. Digest (~1 min)
Criterion: *the scheduled run produces a correct digest.* In the app, click **Send digest now** (or run the command below), then open the email: prices, sentiment badge, AI summary, headlines.
```powershell
aws lambda invoke --function-name marketpulse-staging-digest --cli-binary-format raw-in-base64-out --payload fileb://scripts/payloads/digest-all.json out.json; Get-Content out.json
```
Mention that the real schedule runs at 08:00 IST (ingest) and 08:15 IST (digest) via EventBridge Scheduler.

## 6. Back to the DLQ (~1 min)
```powershell
$dlq = aws sqs get-queue-url --queue-name marketpulse-staging-ingest-dlq --query QueueUrl --output text
aws sqs get-queue-attributes --queue-url $dlq --attribute-names ApproximateNumberOfMessages
aws cloudwatch describe-alarms --alarm-names marketpulse-staging-dlq-not-empty --query "MetricAlarms[0].StateValue"
```
Show the DLQ count of 1, the alarm in `ALARM` state, and the "ALARM: marketpulse-staging-dlq-not-empty" email. Show the worker's logs in CloudWatch with the 3 attempts. Then **reset**:
```powershell
cd infra/envs/staging; terraform apply -auto-approve; cd ../../..   # removes FAIL_SYMBOLS, restores 360 s
# do the reset BEFORE merging/approving any pipeline run, so CI and your laptop agree on state
aws sqs purge-queue --queue-url $dlq
```
(Or replay instead of purging: `aws sqs start-message-move-task --source-arn <dlq arn>`.)

## 7. IaC + CI/CD (~3 min)
Criterion: *the whole infra is reproducible from Terraform, and a merge reaches prod through the pipeline.*
- GitHub → PR #1: CI checks (ruff, pytest, vitest, tflint, Checkov) and the Terraform plan comment.
- Actions → `deploy`: staging job → **waiting for approval** → prod job. Approve live if a run is pending; otherwise play the recording.
- Show the prod app URL from the prod job output.
- Reproducibility: `cd infra/envs/staging; terraform plan` reports **No changes** (no drift between code and cloud). Explain that `terraform destroy` + `apply` rebuilds everything; a full CloudFront rebuild takes about 10 min, so it isn't done live.

## 8. Cost (~1 min)
Criterion: *runs at about zero cost.*
```powershell
aws budgets describe-budget --account-id 567519737402 --budget-name marketpulse-monthly --query "Budget.CalculatedSpend"
```
Explain: everything is pay-per-request and scales to zero; the budget alarm is at $5; Comprehend is unavailable on the AWS Free plan, so sentiment falls back to Bedrock Nova Micro (a fraction of a cent per run).

## If something breaks live
| Symptom | Fix |
|---|---|
| No alert email | Check spam. `aws logs tail /aws/lambda/marketpulse-staging-notifier --since 10m` |
| Watchlist prices empty | Run the dispatcher (step 0.4), wait 30 s, refresh |
| `UnrecognizedClientException` / expired creds | `$env:AWS_PROFILE = "marketpulse"` in this terminal |
| Pipeline slow | Play the recording; the live run can finish in the background |
