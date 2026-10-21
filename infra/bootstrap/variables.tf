variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "github_repo" {
  description = "GitHub repository allowed to assume the deploy role, as owner/name"
  type        = string
  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repo))
    error_message = "github_repo must look like owner/name."
  }
}

variable "budget_email" {
  description = "Email that receives AWS Budgets alerts"
  type        = string
}

variable "budget_usd" {
  description = "Monthly budget in USD"
  type        = string
  default     = "5"
}
