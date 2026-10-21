# One Lambda function with its own least-privilege role and log group.

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "this" {
  name               = var.name
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

data "aws_iam_policy_document" "logs" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.this.arn}:*"]
  }
}

resource "aws_iam_role_policy" "logs" {
  name   = "logs"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.logs.json
}

resource "aws_iam_role_policy" "app" {
  name   = "app"
  role   = aws_iam_role.this.id
  policy = var.policy_json
}

resource "aws_cloudwatch_log_group" "this" {
  #checkov:skip=CKV_AWS_158:AWS-managed encryption is sufficient; a KMS CMK is not free tier
  #checkov:skip=CKV_AWS_338:14-day retention keeps CloudWatch within free tier
  name              = "/aws/lambda/${var.name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "this" {
  #checkov:skip=CKV_AWS_116:Async failures are not used; SQS/stream sources carry their own DLQ/retry
  #checkov:skip=CKV_AWS_117:No VPC resources are accessed; a VPC would need a NAT gateway (not free)
  #checkov:skip=CKV_AWS_173:Env vars hold only resource names/ARNs; secrets live in Secrets Manager
  #checkov:skip=CKV_AWS_272:Code signing is out of scope for this project
  #checkov:skip=CKV_AWS_115:Concurrency is bounded by event-source settings; new accounts cannot reserve
  function_name    = var.name
  role             = aws_iam_role.this.arn
  runtime          = "python3.13"
  architectures    = ["arm64"]
  handler          = var.handler
  filename         = var.zip_path
  source_code_hash = var.zip_hash
  timeout          = var.timeout
  memory_size      = var.memory_size

  environment {
    variables = var.environment
  }

  tracing_config {
    mode = "Active"
  }

  depends_on = [aws_cloudwatch_log_group.this, aws_iam_role_policy.logs]
}

data "aws_iam_policy_document" "xray" {
  statement {
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "xray" {
  name   = "xray"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.xray.json
}
