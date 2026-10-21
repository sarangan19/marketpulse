locals {
  # A cross-region inference profile id ("apac.amazon.nova-micro-v1:0") wraps a foundation model
  # ("amazon.nova-micro-v1:0") that may be served from any region in the profile.
  model_parts      = split(".", var.bedrock_model_id)
  is_profile       = contains(["apac", "us", "eu", "global"], local.model_parts[0])
  foundation_model = local.is_profile ? join(".", slice(local.model_parts, 1, length(local.model_parts))) : var.bedrock_model_id
  bedrock_resources = concat(
    ["arn:aws:bedrock:*::foundation-model/${local.foundation_model}"],
    local.is_profile ? ["arn:aws:bedrock:${var.region}:${var.account_id}:inference-profile/${var.bedrock_model_id}"] : [],
  )
  worker_timeout = 30
}

resource "aws_secretsmanager_secret" "finnhub" {
  #checkov:skip=CKV_AWS_149:AWS-managed key is sufficient; a CMK is not free tier
  #checkov:skip=CKV2_AWS_57:Finnhub keys cannot be rotated programmatically
  name                    = "marketpulse/${var.env}/finnhub"
  description             = "Finnhub API key as JSON with key api_key. Value is set by hand, never in Terraform."
  recovery_window_in_days = 0 # allow immediate recreate in the destroy/recreate drill
}

resource "aws_sqs_queue" "dlq" {
  name                      = "${var.prefix}-ingest-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "ingest" {
  name                       = "${var.prefix}-ingest"
  visibility_timeout_seconds = 6 * local.worker_timeout
  message_retention_seconds  = 86400
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue_redrive_allow_policy" "dlq" {
  queue_url = aws_sqs_queue.dlq.id
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.ingest.arn]
  })
}

# ---- dispatcher ----

data "aws_iam_policy_document" "dispatcher" {
  statement {
    sid       = "ScanWatches"
    actions   = ["dynamodb:Scan"]
    resources = ["${var.table_arn}/index/GSI1"]
  }
  statement {
    sid       = "Enqueue"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.ingest.arn]
  }
}

module "dispatcher" {
  source      = "../lambda_fn"
  name        = "${var.prefix}-dispatcher"
  handler     = "marketpulse.handlers.dispatcher.handler"
  zip_path    = var.zip_path
  zip_hash    = var.zip_hash
  policy_json = data.aws_iam_policy_document.dispatcher.json
  environment = {
    TABLE_NAME = var.table_name
    QUEUE_URL  = aws_sqs_queue.ingest.url
  }
}

module "daily" {
  source     = "../schedule"
  name       = "${var.prefix}-ingest-daily"
  expression = "cron(0 8 * * ? *)"
  timezone   = "Asia/Kolkata"
  target_arn = module.dispatcher.function_arn
  input      = jsonencode({ mode = "daily" })
}

module "intraday" {
  source     = "../schedule"
  name       = "${var.prefix}-ingest-intraday"
  expression = "cron(0/15 9-15 ? * MON-FRI *)"
  timezone   = "America/New_York"
  target_arn = module.dispatcher.function_arn
  input      = jsonencode({ mode = "intraday" })
  enabled    = var.intraday_enabled
}

# ---- worker ----

data "aws_iam_policy_document" "worker" {
  #checkov:skip=CKV_AWS_356:comprehend:BatchDetectSentiment does not support resource-level permissions
  statement {
    sid       = "WriteTable"
    actions   = ["dynamodb:PutItem"]
    resources = [var.table_arn]
  }
  statement {
    sid       = "Consume"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.ingest.arn]
  }
  statement {
    sid       = "FinnhubKey"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.finnhub.arn]
  }
  statement {
    sid       = "Sentiment"
    actions   = ["comprehend:BatchDetectSentiment"]
    resources = ["*"]
  }
  statement {
    sid       = "Summaries"
    actions   = ["bedrock:InvokeModel"]
    resources = local.bedrock_resources
  }
}

module "worker" {
  source      = "../lambda_fn"
  name        = "${var.prefix}-worker"
  handler     = "marketpulse.handlers.worker.handler"
  zip_path    = var.zip_path
  zip_hash    = var.zip_hash
  timeout     = local.worker_timeout
  policy_json = data.aws_iam_policy_document.worker.json
  environment = merge({
    TABLE_NAME         = var.table_name
    FINNHUB_SECRET_ARN = aws_secretsmanager_secret.finnhub.arn
    BEDROCK_MODEL_ID   = var.bedrock_model_id
  }, var.fail_symbols == "" ? {} : { FAIL_SYMBOLS = var.fail_symbols })
}

resource "aws_lambda_event_source_mapping" "worker" {
  event_source_arn        = aws_sqs_queue.ingest.arn
  function_name           = module.worker.function_arn
  batch_size              = 5
  function_response_types = ["ReportBatchItemFailures"]
  scaling_config {
    maximum_concurrency = 2
  }
}
