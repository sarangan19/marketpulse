terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Partial config: pass the bucket at init time, e.g.
  #   terraform init -backend-config="bucket=marketpulse-tfstate-<account_id>"
  backend "s3" {
    key          = "staging/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = "ap-south-1"
  default_tags {
    tags = { Project = "marketpulse", Environment = "staging", ManagedBy = "terraform" }
  }
}

module "stack" {
  source                = "../../modules/stack"
  env                   = "staging"
  lambda_zip            = "${path.root}/../../../build/backend.zip"
  ses_sender            = var.ses_sender
  admin_emails          = var.admin_emails
  bedrock_model_id      = var.bedrock_model_id
  fail_symbols          = var.fail_symbols
  extra_allowed_origins = ["http://localhost:5173"]
}
