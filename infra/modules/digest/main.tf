data "aws_iam_policy_document" "fn" {
  statement {
    sid       = "ReadTable"
    actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan"]
    resources = [var.table_arn]
  }
  statement {
    sid       = "SendDigest"
    actions   = ["ses:SendEmail"]
    resources = ["arn:aws:ses:${var.region}:${var.account_id}:identity/*"]
  }
}

module "fn" {
  source      = "../lambda_fn"
  name        = "${var.prefix}-digest"
  handler     = "marketpulse.handlers.digest.handler"
  zip_path    = var.zip_path
  zip_hash    = var.zip_hash
  timeout     = 120
  policy_json = data.aws_iam_policy_document.fn.json
  environment = {
    TABLE_NAME = var.table_name
    SES_SENDER = var.ses_sender
  }
}

module "schedule" {
  source     = "../schedule"
  name       = "${var.prefix}-digest"
  expression = "cron(15 8 * * ? *)"
  timezone   = "Asia/Kolkata"
  target_arn = module.fn.function_arn
  input      = "{}"
}
