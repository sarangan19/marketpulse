resource "aws_sns_topic" "alerts" {
  name              = "${var.prefix}-alerts"
  kms_master_key_id = "alias/aws/sns"
}

# SES identities are account-wide and live in infra/bootstrap, so destroying one
# environment never un-verifies addresses the other environment uses.

# ---- evaluator: DynamoDB stream -> threshold check -> alerts topic ----

data "aws_iam_policy_document" "evaluator" {
  statement {
    sid       = "Stream"
    actions   = ["dynamodb:GetRecords", "dynamodb:GetShardIterator", "dynamodb:DescribeStream", "dynamodb:ListStreams"]
    resources = [var.stream_arn]
  }
  statement {
    sid       = "Watchers"
    actions   = ["dynamodb:Query"]
    resources = ["${var.table_arn}/index/GSI1"]
  }
  statement {
    sid       = "AlertState"
    actions   = ["dynamodb:UpdateItem"]
    resources = [var.table_arn]
  }
  statement {
    sid       = "Publish"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
  }
  statement {
    sid       = "TopicKey"
    actions   = ["kms:GenerateDataKey", "kms:Decrypt"]
    resources = ["arn:aws:kms:${var.region}:${var.account_id}:key/*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["sns.${var.region}.amazonaws.com"]
    }
  }
}

module "evaluator" {
  source      = "../lambda_fn"
  name        = "${var.prefix}-evaluator"
  handler     = "marketpulse.handlers.evaluator.handler"
  zip_path    = var.zip_path
  zip_hash    = var.zip_hash
  policy_json = data.aws_iam_policy_document.evaluator.json
  environment = {
    TABLE_NAME       = var.table_name
    ALERTS_TOPIC_ARN = aws_sns_topic.alerts.arn
  }
}

resource "aws_lambda_event_source_mapping" "evaluator" {
  event_source_arn               = var.stream_arn
  function_name                  = module.evaluator.function_arn
  starting_position              = "LATEST"
  batch_size                     = 25
  maximum_retry_attempts         = 3
  bisect_batch_on_function_error = true

  filter_criteria {
    filter {
      pattern = jsonencode({
        eventName = ["INSERT"]
        dynamodb  = { Keys = { SK = { S = [{ prefix = "PRICE#" }] } } }
      })
    }
  }
}

# ---- notifier: alerts topic -> SES email (+ SMS) ----

data "aws_iam_policy_document" "notifier" {
  #checkov:skip=CKV_AWS_356:sns:Publish to a phone number has no resource ARN
  #checkov:skip=CKV_AWS_111:Publish is the only write and it targets phone numbers, which have no ARN
  statement {
    sid       = "Profiles"
    actions   = ["dynamodb:GetItem"]
    resources = [var.table_arn]
  }
  statement {
    sid       = "Email"
    actions   = ["ses:SendEmail"]
    resources = ["arn:aws:ses:${var.region}:${var.account_id}:identity/*"]
  }
  statement {
    sid       = "Sms"
    actions   = ["sns:Publish"]
    resources = ["*"]
  }
}

module "notifier" {
  source      = "../lambda_fn"
  name        = "${var.prefix}-notifier"
  handler     = "marketpulse.handlers.notifier.handler"
  zip_path    = var.zip_path
  zip_hash    = var.zip_hash
  policy_json = data.aws_iam_policy_document.notifier.json
  environment = {
    TABLE_NAME = var.table_name
    SES_SENDER = var.ses_sender
  }
}

resource "aws_lambda_permission" "notifier_sns" {
  statement_id  = "AllowAlertsTopic"
  action        = "lambda:InvokeFunction"
  function_name = module.notifier.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.alerts.arn
}

resource "aws_sns_topic_subscription" "notifier" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "lambda"
  endpoint  = module.notifier.function_arn
}
