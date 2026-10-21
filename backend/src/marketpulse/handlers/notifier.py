"""SNS alerts-topic subscriber: deliver one alert to its user by email and, if opted in, SMS."""

import json
import logging

import boto3

from marketpulse import config, db

log = logging.getLogger()
log.setLevel(logging.INFO)

VERB = {"UPPER": "crossed above", "LOWER": "fell below"}


def _texts(a: dict) -> tuple[str, str, str]:
    verb = VERB[a["side"]]
    subject = f"MarketPulse alert: {a['symbol']} {verb} {a['threshold']:.2f}"
    body = (f"{a['symbol']} {verb} your threshold of {a['threshold']:.2f}.\n"
            f"Latest price: {a['price']:.2f} at {a['ts']}.\n\n"
            "You will not be alerted again until the price returns inside your band.")
    sms = f"MarketPulse: {a['symbol']} {verb} {a['threshold']:.2f} (now {a['price']:.2f})"
    return subject, body, sms[:160]


def handler(event, context):
    ses, sns = boto3.client("ses"), boto3.client("sns")
    emails = smses = 0
    for record in event.get("Records", []):
        alert = json.loads(record["Sns"]["Message"])
        profile = db.get_profile(alert["sub"])
        if not profile:
            log.warning("no profile for %s; dropping alert", alert["sub"])
            continue
        subject, body, sms = _texts(alert)
        ses.send_email(Source=config.ses_sender(),
                       Destination={"ToAddresses": [profile["email"]]},
                       Message={"Subject": {"Data": subject}, "Body": {"Text": {"Data": body}}})
        emails += 1
        if profile.get("smsOptIn") and profile.get("phone"):
            sns.publish(PhoneNumber=profile["phone"], Message=sms, MessageAttributes={
                "AWS.SNS.SMS.SMSType": {"DataType": "String", "StringValue": "Transactional"}})
            smses += 1
    return {"emails": emails, "sms": smses}
