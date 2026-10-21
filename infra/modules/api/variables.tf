variable "prefix" {
  type = string
}

variable "zip_path" {
  type = string
}

variable "zip_hash" {
  type = string
}

variable "table_name" {
  type = string
}

variable "table_arn" {
  type = string
}

variable "finnhub_secret_arn" {
  type = string
}

variable "digest_function_name" {
  type = string
}

variable "digest_function_arn" {
  type = string
}

variable "jwt_issuer" {
  type = string
}

variable "jwt_audience" {
  description = "Cognito app client id"
  type        = string
}

variable "allowed_origins" {
  type = list(string)
}
