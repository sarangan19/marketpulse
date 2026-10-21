variable "prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "admin_emails" {
  type = list(string)
}

variable "function_names" {
  type = list(string)
}

variable "queue_name" {
  type = string
}

variable "dlq_name" {
  type = string
}

variable "api_id" {
  type = string
}
