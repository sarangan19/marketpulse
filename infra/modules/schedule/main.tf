# EventBridge Scheduler schedule that invokes one Lambda, with its own invoke-only role.

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "this" {
  name               = "${var.name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

data "aws_iam_policy_document" "invoke" {
  statement {
    actions   = ["lambda:InvokeFunction"]
    resources = [var.target_arn]
  }
}

resource "aws_iam_role_policy" "invoke" {
  name   = "invoke"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.invoke.json
}

resource "aws_scheduler_schedule" "this" {
  #checkov:skip=CKV_AWS_297:Schedule input holds only a mode flag; a CMK is not free tier
  name                         = var.name
  schedule_expression          = var.expression
  schedule_expression_timezone = var.timezone
  state                        = var.enabled ? "ENABLED" : "DISABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = var.target_arn
    role_arn = aws_iam_role.this.arn
    input    = var.input
    retry_policy {
      maximum_retry_attempts = 2
    }
  }
}
