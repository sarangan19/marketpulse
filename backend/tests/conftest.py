import os

import boto3
import pytest
from moto import mock_aws

TABLE = "marketpulse-test"


@pytest.fixture(autouse=True)
def aws_env(monkeypatch):
    monkeypatch.setenv("AWS_DEFAULT_REGION", "ap-south-1")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("TABLE_NAME", TABLE)
    for var in ("FAIL_SYMBOLS", "MARKETPULSE_STUB", "BEDROCK_MODEL_ID"):
        monkeypatch.delenv(var, raising=False)
    yield


@pytest.fixture
def aws():
    with mock_aws():
        yield


@pytest.fixture
def table(aws):
    ddb = boto3.resource("dynamodb", region_name=os.environ["AWS_DEFAULT_REGION"])
    t = ddb.create_table(
        TableName=TABLE,
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[
            {"AttributeName": n, "AttributeType": "S"} for n in ("PK", "SK", "GSI1PK", "GSI1SK")
        ],
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        GlobalSecondaryIndexes=[
            {
                "IndexName": "GSI1",
                "KeySchema": [
                    {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                    {"AttributeName": "GSI1SK", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
        StreamSpecification={"StreamEnabled": True, "StreamViewType": "NEW_IMAGE"},
    )
    from marketpulse import db

    db._reset_cache()
    yield t
    db._reset_cache()
