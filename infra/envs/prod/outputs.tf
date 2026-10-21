output "api_url" {
  value = module.stack.api_url
}

output "user_pool_id" {
  value = module.stack.user_pool_id
}

output "client_id" {
  value = module.stack.client_id
}

output "frontend_url" {
  value = module.stack.frontend_url
}

output "frontend_bucket" {
  value = module.stack.frontend_bucket
}

output "distribution_id" {
  value = module.stack.distribution_id
}

output "finnhub_secret_name" {
  value = module.stack.finnhub_secret_name
}

output "table_name" {
  value = module.stack.table_name
}

output "dispatcher_name" {
  value = module.stack.dispatcher_name
}

output "digest_function_name" {
  value = module.stack.digest_function_name
}

output "dlq_name" {
  value = module.stack.dlq_name
}

output "dashboard_name" {
  value = module.stack.dashboard_name
}
