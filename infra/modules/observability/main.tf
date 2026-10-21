resource "aws_sns_topic" "admin" {
  #checkov:skip=CKV_AWS_26:CloudWatch alarms cannot publish to a topic encrypted with the AWS-managed aws/sns key; a CMK costs money and the topic carries only alarm metadata
  name = "${var.prefix}-admin"
}

resource "aws_sns_topic_subscription" "admin_email" {
  for_each  = toset(var.admin_emails)
  topic_arn = aws_sns_topic.admin.arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_cloudwatch_metric_alarm" "dlq" {
  alarm_name          = "${var.prefix}-dlq-not-empty"
  alarm_description   = "A symbol failed ingestion 3 times and is parked in the DLQ"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = var.dlq_name }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.admin.arn]
  ok_actions          = [aws_sns_topic.admin.arn]
}

resource "aws_cloudwatch_metric_alarm" "fn_errors" {
  for_each            = toset(var.function_names)
  alarm_name          = "${each.value}-errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = each.value }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.admin.arn]
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${var.prefix}-api-5xx"
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  dimensions          = { ApiId = var.api_id, Stage = "$default" }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.admin.arn]
}

resource "aws_cloudwatch_dashboard" "this" {
  dashboard_name = var.prefix
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6
        properties = {
          title   = "Lambda invocations", region = var.region, stat = "Sum", period = 300
          metrics = [for f in var.function_names : ["AWS/Lambda", "Invocations", "FunctionName", f]]
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6
        properties = {
          title   = "Lambda errors", region = var.region, stat = "Sum", period = 300
          metrics = [for f in var.function_names : ["AWS/Lambda", "Errors", "FunctionName", f]]
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 12, height = 6
        properties = {
          title = "Ingest queue vs DLQ depth", region = var.region, stat = "Maximum", period = 60
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.queue_name],
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.dlq_name],
          ]
        }
      },
      {
        type = "metric", x = 12, y = 6, width = 12, height = 6
        properties = {
          title = "API requests and errors", region = var.region, stat = "Sum", period = 300
          metrics = [
            ["AWS/ApiGateway", "Count", "ApiId", var.api_id, "Stage", "$default"],
            ["AWS/ApiGateway", "4xx", "ApiId", var.api_id, "Stage", "$default"],
            ["AWS/ApiGateway", "5xx", "ApiId", var.api_id, "Stage", "$default"],
          ]
        }
      },
    ]
  })
}
