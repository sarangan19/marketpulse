# MarketPulse architecture and runbook

## Event flow
```
EventBridge Scheduler (08:00 IST daily, every 15 min in US hours)
  └─▶ dispatcher λ ── one message per distinct symbol ─▶ SQS ingest ──(3 receives)─▶ DLQ ─▶ alarm ─▶ admin SNS
                                                          └─▶ worker λ (max concurrency 2)
                                                                ├─ Finnhub quote (+ news on daily runs)
                                                                ├─ Comprehend sentiment, Bedrock summary
                                                                └─▶ DynamoDB PRICE# / SENT# (TTL 30 / 90 d)
DynamoDB Stream (INSERT, SK prefix PRICE#) ─▶ evaluator λ ─(CLEAR→BREACHED only)─▶ SNS alerts ─▶ notifier λ ─▶ SES / SMS
EventBridge Scheduler (08:15 IST) or POST /digest/trigger ─▶ digest λ ─▶ SES HTML email
Browser ─▶ CloudFront ─▶ S3 (SPA)      Browser ─▶ API Gateway (Cognito JWT) ─▶ api λ ─▶ DynamoDB
```

## Demo scripts
| Criterion | How to show it |
|---|---|
| End-to-end scheduled run | `aws lambda invoke --function-name marketpulse-staging-dispatcher --cli-binary-format raw-in-base64-out --payload '{"mode":"daily"}' out.json`, wait ~1 min, then `aws lambda invoke --function-name marketpulse-staging-digest out.json` |
| Alert < 1 min, no repeats | set a threshold the current price already breaches; run an intraday dispatch twice; one email arrives |
| Retry → DLQ → alarm | set GitHub env var `FAIL_SYMBOLS=AAPL` on staging (or `terraform apply -var fail_symbols=AAPL`), dispatch; after 3 receives (~18 min with the 360 s visibility timeout) the message is in the DLQ and the alarm emails the admin list |
| Rebuild from scratch | `terraform destroy` then `terraform apply` in `infra/envs/staging` |

## Runbook
- **Rotate the Finnhub key:** `aws secretsmanager put-secret-value --secret-id marketpulse/<env>/finnhub --secret-string '{"api_key":"..."}'`. Warm Lambdas keep the old key until they recycle; force it with any config change or redeploy.
- **Replay the DLQ:** `aws sqs start-message-move-task --source-arn <dlq arn>` (moves messages back to the ingest queue).
- **Add an SES recipient (sandbox):** add the address to `ses_identities` in `infra/bootstrap`, apply it, click the verification email. New sign-ups with unverified emails are skipped by the digest (logged), not fatal.
- **After a destroy/recreate:** the Finnhub secret comes back empty; put the value again.
- **SMS:** while the account is in the SNS SMS sandbox, add each phone under SNS → Text messaging → Sandbox destinations. Production SMS to India requires DLT registration.
- **Costs:** the bootstrap budget emails at 80 % of 5 USD actual and 100 % forecast.
