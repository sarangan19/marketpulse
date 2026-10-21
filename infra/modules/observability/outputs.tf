output "admin_topic_arn" {
  value = aws_sns_topic.admin.arn
}

output "dashboard_name" {
  value = aws_cloudwatch_dashboard.this.dashboard_name
}
