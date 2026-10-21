# The whole MarketPulse environment. envs/staging and envs/prod differ only in inputs.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  prefix     = "marketpulse-${var.env}"
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region
  zip_hash   = filebase64sha256(var.lambda_zip)
}

module "data" {
  source = "../data"
  name   = local.prefix
}

module "auth" {
  source = "../auth"
  name   = local.prefix
}

module "ingestion" {
  source           = "../ingestion"
  env              = var.env
  prefix           = local.prefix
  region           = local.region
  account_id       = local.account_id
  zip_path         = var.lambda_zip
  zip_hash         = local.zip_hash
  table_name       = module.data.table_name
  table_arn        = module.data.table_arn
  bedrock_model_id = var.bedrock_model_id
  fail_symbols     = var.fail_symbols
  intraday_enabled = var.intraday_enabled
}

module "alerting" {
  source     = "../alerting"
  prefix     = local.prefix
  region     = local.region
  account_id = local.account_id
  zip_path   = var.lambda_zip
  zip_hash   = local.zip_hash
  table_name = module.data.table_name
  table_arn  = module.data.table_arn
  stream_arn = module.data.stream_arn
  ses_sender = var.ses_sender
  app_url    = module.frontend.url
}

module "digest" {
  source     = "../digest"
  prefix     = local.prefix
  region     = local.region
  account_id = local.account_id
  zip_path   = var.lambda_zip
  zip_hash   = local.zip_hash
  table_name = module.data.table_name
  table_arn  = module.data.table_arn
  ses_sender = var.ses_sender
  app_url    = module.frontend.url
}

module "frontend" {
  source = "../frontend"
  prefix = local.prefix
}

module "api" {
  source               = "../api"
  prefix               = local.prefix
  zip_path             = var.lambda_zip
  zip_hash             = local.zip_hash
  table_name           = module.data.table_name
  table_arn            = module.data.table_arn
  finnhub_secret_arn   = module.ingestion.finnhub_secret_arn
  digest_function_name = module.digest.function_name
  digest_function_arn  = module.digest.function_arn
  jwt_issuer           = module.auth.issuer
  jwt_audience         = module.auth.client_id
  allowed_origins      = concat([module.frontend.url], var.extra_allowed_origins)
}

module "observability" {
  source       = "../observability"
  prefix       = local.prefix
  region       = local.region
  admin_emails = var.admin_emails
  function_names = [
    module.ingestion.dispatcher_name,
    module.ingestion.worker_name,
    module.alerting.evaluator_name,
    module.alerting.notifier_name,
    module.digest.function_name,
    module.api.function_name,
  ]
  queue_name = module.ingestion.queue_name
  dlq_name   = module.ingestion.dlq_name
  api_id     = module.api.api_id
}
