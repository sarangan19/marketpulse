variable "ses_sender" {
  type = string
}

variable "admin_emails" {
  type    = list(string)
  default = []
}

variable "bedrock_model_id" {
  type    = string
  default = "apac.amazon.nova-micro-v1:0"
}

variable "fail_symbols" {
  description = "Comma-separated symbols the worker fails on purpose to demo retry -> DLQ"
  type        = string
  default     = ""
}
