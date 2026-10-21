"""Create the MarketPulse stack inside LocalStack (no Terraform; mirrors infra/modules/stack).

Usage:  docker compose up -d
        python scripts/localstack_up.py
"""

import json
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from build_lambda import build

ENDPOINT = "http://localhost:4566"
REGION = "ap-south-1"
PREFIX = "marketpulse-local"
SENDER = "mp@marketpulse.local"
KW = {"endpoint_url": ENDPOINT, "region_name": REGION,
      "aws_access_key_id": "test", "aws_secret_access_key": "test"}
FUNCTIONS = {
    "api": "marketpulse.handlers.api.handler",
    "dispatcher": "marketpulse.handlers.dispatcher.handler",
    "worker": "marketpulse.handlers.worker.handler",
    "evaluator": "marketpulse.handlers.evaluator.handler",
    "notifier": "marketpulse.handlers.notifier.handler",
    "digest": "marketpulse.handlers.digest.handler",
}


def client(name):
    return boto3.client(name, **KW)


def ensure(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ClientError as e:
        if e.response["Error"]["Code"] in {"ResourceInUseException", "ResourceConflictException",
                                           "EntityAlreadyExists", "QueueAlreadyExists"}:
            return None
        raise


def main():
    ddb, sqs, sns, lam, iam = (client(n) for n in ("dynamodb", "sqs", "sns", "lambda", "iam"))

    ensure(ddb.create_table, TableName=PREFIX, BillingMode="PAY_PER_REQUEST",
           AttributeDefinitions=[{"AttributeName": n, "AttributeType": "S"}
                                 for n in ("PK", "SK", "GSI1PK", "GSI1SK")],
           KeySchema=[{"AttributeName": "PK", "KeyType": "HASH"},
                      {"AttributeName": "SK", "KeyType": "RANGE"}],
           GlobalSecondaryIndexes=[{"IndexName": "GSI1", "Projection": {"ProjectionType": "ALL"},
                                    "KeySchema": [{"AttributeName": "GSI1PK", "KeyType": "HASH"},
                                                  {"AttributeName": "GSI1SK", "KeyType": "RANGE"}]}],
           StreamSpecification={"StreamEnabled": True, "StreamViewType": "NEW_IMAGE"})
    stream_arn = ddb.describe_table(TableName=PREFIX)["Table"]["LatestStreamArn"]

    dlq = sqs.create_queue(QueueName=f"{PREFIX}-ingest-dlq")["QueueUrl"]
    dlq_arn = sqs.get_queue_attributes(QueueUrl=dlq, AttributeNames=["QueueArn"])["Attributes"][
        "QueueArn"]
    queue = sqs.create_queue(QueueName=f"{PREFIX}-ingest", Attributes={
        "VisibilityTimeout": "180",
        "RedrivePolicy": json.dumps({"deadLetterTargetArn": dlq_arn, "maxReceiveCount": 3})})[
        "QueueUrl"]
    queue_arn = sqs.get_queue_attributes(QueueUrl=queue, AttributeNames=["QueueArn"])[
        "Attributes"]["QueueArn"]
    topic = sns.create_topic(Name=f"{PREFIX}-alerts")["TopicArn"]
    client("ses").verify_email_identity(EmailAddress=SENDER)

    role = ensure(iam.create_role, RoleName=f"{PREFIX}-lambda", AssumeRolePolicyDocument=json.dumps(
        {"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Action": "sts:AssumeRole",
                                                 "Principal": {"Service": "lambda.amazonaws.com"}}]}))
    role_arn = role["Role"]["Arn"] if role else iam.get_role(RoleName=f"{PREFIX}-lambda")["Role"][
        "Arn"]

    zip_bytes = build(Path(__file__).resolve().parent.parent / "build" / "backend.zip").read_bytes()
    env = {"TABLE_NAME": PREFIX, "QUEUE_URL": queue, "ALERTS_TOPIC_ARN": topic,
           "SES_SENDER": SENDER, "DIGEST_FUNCTION_NAME": f"{PREFIX}-digest",
           "MARKETPULSE_STUB": "1"}
    arns = {}
    for short, handler in FUNCTIONS.items():
        name = f"{PREFIX}-{short}"
        try:
            lam.create_function(FunctionName=name, Runtime="python3.13", Role=role_arn,
                                Handler=handler, Code={"ZipFile": zip_bytes}, Timeout=30,
                                Environment={"Variables": env})
        except ClientError as e:
            if e.response["Error"]["Code"] != "ResourceConflictException":
                raise
            lam.update_function_code(FunctionName=name, ZipFile=zip_bytes)
        arns[short] = lam.get_function(FunctionName=name)["Configuration"]["FunctionArn"]
    for short in FUNCTIONS:
        lam.get_waiter("function_active_v2").wait(FunctionName=f"{PREFIX}-{short}")

    existing = {m["EventSourceArn"] for m in lam.list_event_source_mappings()["EventSourceMappings"]}
    if queue_arn not in existing:
        lam.create_event_source_mapping(EventSourceArn=queue_arn, FunctionName=arns["worker"],
                                        BatchSize=5, FunctionResponseTypes=["ReportBatchItemFailures"])
    if stream_arn not in existing:
        lam.create_event_source_mapping(
            EventSourceArn=stream_arn, FunctionName=arns["evaluator"], StartingPosition="LATEST",
            FilterCriteria={"Filters": [{"Pattern": json.dumps(
                {"eventName": ["INSERT"],
                 "dynamodb": {"Keys": {"SK": {"S": [{"prefix": "PRICE#"}]}}}})}]})
    sns.subscribe(TopicArn=topic, Protocol="lambda", Endpoint=arns["notifier"])
    time.sleep(2)
    print(json.dumps({"table": PREFIX, "queue": queue, "topic": topic, "functions": arns}, indent=2))


if __name__ == "__main__":
    main()
