variable "name" {
  type = string
}

variable "handler" {
  type = string
}

variable "zip_path" {
  type = string
}

variable "zip_hash" {
  type = string
}

variable "policy_json" {
  description = "Inline IAM policy for the function's own resources"
  type        = string
}

variable "environment" {
  type    = map(string)
  default = {}
}

variable "timeout" {
  type    = number
  default = 30
}

variable "memory_size" {
  type    = number
  default = 256
}

variable "log_retention_days" {
  type    = number
  default = 14
}
