import base64, json
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import boto3

PLANS = {"tokyo": ("TPE", "TYO"), "seoul": ("TPE", "SEL"), "london": ("TPE", "LON")}
TABLE = boto3.resource("dynamodb").Table("subscriptions")


def resp(code, body):
    return {"statusCode": code, "headers": {"content-type": "application/json"}, "body": json.dumps(body)}


def handler(event, context):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    try:
        data = json.loads(raw)
    except ValueError:
        return resp(400, {"error": "invalid JSON"})

    email = str(data.get("email", "")).strip().lower()
    plan = data.get("plan_name")
    if "@" not in email:
        return resp(400, {"error": "email required"})
    if plan not in PLANS:
        return resp(400, {"error": "plan_name must be one of: " + ", ".join(PLANS)})
    try:
        target = Decimal(str(data.get("target_price")))
    except InvalidOperation:
        return resp(400, {"error": "target_price must be a number"})
    if not target.is_finite() or target <= 0:
        return resp(400, {"error": "target_price must be positive"})

    origin, dest = PLANS[plan]
    route = f"{origin}-{dest}"
    now = datetime.now(timezone.utc).isoformat()
    # No subscription_status in M1 — a row means "eligible for alerts".
    TABLE.update_item(
        Key={"email": email, "route": route},
        UpdateExpression="SET plan_name=:p, origin=:o, destination=:d, target_price=:t, "
        "currency=:c, updated_at=:n, created_at=if_not_exists(created_at, :n)",
        ExpressionAttributeValues={":p": plan, ":o": origin, ":d": dest, ":t": target, ":c": "TWD", ":n": now},
    )
    return resp(200, {"ok": True, "email": email, "route": route, "plan_name": plan, "target_price": int(target)})
