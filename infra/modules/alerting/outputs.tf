output "alerts_topic_arn" {
  value = aws_sns_topic.alerts.arn
}

output "evaluator_name" {
  value = module.evaluator.function_name
}

output "notifier_name" {
  value = module.notifier.function_name
}
