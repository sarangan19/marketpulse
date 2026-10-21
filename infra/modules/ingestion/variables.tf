variable "env" {
  type = string
}

variable "prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "account_id" {
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

variable "bedrock_model_id" {
  type = string
}

variable "fail_symbols" {
  description = "Comma-separated symbols the worker fails on purpose (staging demo of retry -> DLQ)"
  type        = string
  default     = ""
}

variable "intraday_enabled" {
  type    = bool
  default = true
}
