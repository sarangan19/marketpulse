variable "ses_sender" {
  type = string
}

variable "ses_verified_recipients" {
  type    = list(string)
  default = []
}

variable "admin_emails" {
  type    = list(string)
  default = []
}

variable "bedrock_model_id" {
  type    = string
  default = "apac.amazon.nova-micro-v1:0"
}
