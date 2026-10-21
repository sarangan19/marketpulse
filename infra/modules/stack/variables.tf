variable "env" {
  type = string
  validation {
    condition     = contains(["staging", "prod"], var.env)
    error_message = "env must be staging or prod."
  }
}

variable "lambda_zip" {
  description = "Path to build/backend.zip produced by scripts/build_lambda.py"
  type        = string
}

variable "ses_sender" {
  description = "Verified SES From address for alerts and digests"
  type        = string
}

variable "ses_verified_recipients" {
  description = "Recipient addresses to verify while SES is in sandbox mode"
  type        = list(string)
  default     = []
}

variable "admin_emails" {
  description = "Addresses subscribed to operational alarms"
  type        = list(string)
  default     = []
}

variable "bedrock_model_id" {
  type    = string
  default = "apac.amazon.nova-micro-v1:0"
}

variable "fail_symbols" {
  type    = string
  default = ""
}

variable "intraday_enabled" {
  type    = bool
  default = true
}

variable "extra_allowed_origins" {
  description = "CORS origins besides the CloudFront URL, e.g. the Vite dev server"
  type        = list(string)
  default     = []
}
