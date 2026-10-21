output "api_url" {
  value = aws_apigatewayv2_api.this.api_endpoint
}

output "api_id" {
  value = aws_apigatewayv2_api.this.id
}

output "function_name" {
  value = module.fn.function_name
}
