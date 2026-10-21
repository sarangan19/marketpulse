locals {
  authed_routes = [
    "GET /me",
    "PUT /me",
    "GET /watchlist",
    "PUT /watchlist/{symbol}",
    "DELETE /watchlist/{symbol}",
    "GET /symbols/search",
    "GET /symbols/{symbol}/history",
    "POST /digest/trigger",
  ]
}

data "aws_iam_policy_document" "fn" {
  statement {
    sid = "Table"
    actions = [
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem",
      "dynamodb:Query",
    ]
    resources = [var.table_arn]
  }
  statement {
    sid       = "FinnhubKey"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.finnhub_secret_arn]
  }
  statement {
    sid       = "TriggerDigest"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.digest_function_arn]
  }
}

module "fn" {
  source      = "../lambda_fn"
  name        = "${var.prefix}-api"
  handler     = "marketpulse.handlers.api.handler"
  zip_path    = var.zip_path
  zip_hash    = var.zip_hash
  timeout     = 10
  policy_json = data.aws_iam_policy_document.fn.json
  environment = {
    TABLE_NAME           = var.table_name
    FINNHUB_SECRET_ARN   = var.finnhub_secret_arn
    DIGEST_FUNCTION_NAME = var.digest_function_name
  }
}

resource "aws_apigatewayv2_api" "this" {
  name          = var.prefix
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["GET", "PUT", "POST", "DELETE", "OPTIONS"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.this.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  jwt_configuration {
    issuer   = var.jwt_issuer
    audience = [var.jwt_audience]
  }
}

resource "aws_apigatewayv2_integration" "fn" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = module.fn.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "authed" {
  for_each           = toset(local.authed_routes)
  api_id             = aws_apigatewayv2_api.this.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.fn.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "health" {
  #checkov:skip=CKV_AWS_309:Health check is intentionally public and returns no data
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.fn.id}"
}

resource "aws_cloudwatch_log_group" "access" {
  #checkov:skip=CKV_AWS_158:AWS-managed encryption is sufficient; a KMS CMK is not free tier
  #checkov:skip=CKV_AWS_338:14-day retention keeps CloudWatch within free tier
  name              = "/aws/apigateway/${var.prefix}"
  retention_in_days = 14
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId = "$context.requestId"
      ip        = "$context.identity.sourceIp"
      route     = "$context.routeKey"
      status    = "$context.status"
      latency   = "$context.responseLatency"
      error     = "$context.integrationErrorMessage"
    })
  }
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = module.fn.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}
