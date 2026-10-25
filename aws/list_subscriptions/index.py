import json
import boto3
from boto3.dynamodb.conditions import Key

TABLE = boto3.resource("dynamodb").Table("subscriptions")


def resp(code, body):
    return {"statusCode": code, "headers": {"content-type": "application/json"}, "body": json.dumps(body)}


def handler(event, context):
    # No auth in M1: trusts the client-supplied email. Production would verify the Supabase JWT.
    email = ((event.get("queryStringParameters") or {}).get("email") or "").strip().lower()
    if "@" not in email:
        return resp(400, {"error": "email required"})
    items = TABLE.query(KeyConditionExpression=Key("email").eq(email))["Items"]
    subs = [
        {
            "route": i["route"],
            "plan_name": i.get("plan_name"),
            "target_price": int(i["target_price"]),
            "currency": i.get("currency", "TWD"),
            "updated_at": i.get("updated_at"),
        }
        for i in items
    ]
    return resp(200, {"email": email, "subscriptions": subs})
