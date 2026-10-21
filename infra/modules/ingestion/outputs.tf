output "dlq_name" {
  value = aws_sqs_queue.dlq.name
}

output "queue_name" {
  value = aws_sqs_queue.ingest.name
}

output "finnhub_secret_arn" {
  value = aws_secretsmanager_secret.finnhub.arn
}

output "finnhub_secret_name" {
  value = aws_secretsmanager_secret.finnhub.name
}

output "dispatcher_name" {
  value = module.dispatcher.function_name
}

output "worker_name" {
  value = module.worker.function_name
}
