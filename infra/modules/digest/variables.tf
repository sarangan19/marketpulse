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

variable "ses_sender" {
  type = string
}

variable "app_url" {
  description = "Public dashboard URL used for links in emails"
  type        = string
  default     = ""
}
