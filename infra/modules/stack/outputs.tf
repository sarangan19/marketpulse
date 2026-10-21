output "api_url" {
  value = module.api.api_url
}

output "user_pool_id" {
  value = module.auth.user_pool_id
}

output "client_id" {
  value = module.auth.client_id
}

output "frontend_url" {
  value = module.frontend.url
}

output "frontend_bucket" {
  value = module.frontend.bucket
}

output "distribution_id" {
  value = module.frontend.distribution_id
}

output "finnhub_secret_name" {
  value = module.ingestion.finnhub_secret_name
}

output "table_name" {
  value = module.data.table_name
}

output "dispatcher_name" {
  value = module.ingestion.dispatcher_name
}

output "evaluator_name" {
  value = module.alerting.evaluator_name
}

output "digest_function_name" {
  value = module.digest.function_name
}

output "dlq_name" {
  value = module.ingestion.dlq_name
}

output "dashboard_name" {
  value = module.observability.dashboard_name
}
