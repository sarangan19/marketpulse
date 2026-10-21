"""Seed LocalStack and run one daily cycle, then print the emails LocalStack "sent".

Expects scripts/localstack_up.py to have run. Prints 1 alert email (AAPL) and 1 digest email.
"""

import json
import time
import urllib.request
import zlib
from decimal import Decimal

import boto3
from localstack_up import KW, PREFIX

USER = "local-user"
EMAIL = "you@marketpulse.local"


def stub_price(symbol: str) -> float:  # mirrors marketpulse.stubs._base_price
    return 50.0 + zlib.crc32(symbol.encode()) % 400


def main():
    table = boto3.resource("dynamodb", **KW).Table(PREFIX)
    lam = boto3.client("lambda", **KW)
    table.put_item(Item={"PK": f"USER#{USER}", "SK": "PROFILE", "sub": USER, "email": EMAIL,
                         "smsOptIn": False, "digestOptIn": True})
    boto3.client("ses", **KW).verify_email_identity(EmailAddress=EMAIL)
    for sym, upper, lower in (("AAPL", stub_price("AAPL") - 1, None), ("MSFT", None, 1)):
        item = {"PK": f"USER#{USER}", "SK": f"WATCH#{sym}", "symbol": sym,
                "GSI1PK": f"SYMBOL#{sym}", "GSI1SK": f"USER#{USER}"}
        if upper is not None:
            item["upper"] = Decimal(str(upper))
        if lower is not None:
            item["lower"] = Decimal(str(lower))
        table.put_item(Item=item)

    print("dispatcher:", lam.invoke(FunctionName=f"{PREFIX}-dispatcher",
                                    Payload=json.dumps({"mode": "daily"}))["Payload"].read())
    print("waiting for worker -> stream -> evaluator -> notifier ...")
    time.sleep(20)
    print("digest:", lam.invoke(FunctionName=f"{PREFIX}-digest", Payload=b"{}")["Payload"].read())

    with urllib.request.urlopen(f"{KW['endpoint_url']}/_aws/ses") as resp:
        messages = json.load(resp)["messages"]
    for m in messages:
        print("-", m["Destination"]["ToAddresses"], "|", m["Subject"])


if __name__ == "__main__":
    main()
