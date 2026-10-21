variable "name" {
  type = string
}

variable "expression" {
  type = string
}

variable "timezone" {
  type = string
}

variable "target_arn" {
  type = string
}

variable "input" {
  type = string
}

variable "enabled" {
  type    = bool
  default = true
}
