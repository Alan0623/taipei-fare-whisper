import json, os, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

UA = "Mozilla/5.0 (compatible; flight-notifier/1.0)"
TABLE = boto3.resource("dynamodb").Table("subscriptions")
_sqs = boto3.client("sqs")
_secrets = boto3.client("secretsmanager")
QURL = None
TOKEN = None


def get_token():
    global TOKEN
    if TOKEN is None:
        raw = _secrets.get_secret_value(SecretId="flight/travelpayouts")["SecretString"]
        try:
            TOKEN = json.loads(raw)["token"]
        except (ValueError, KeyError, TypeError):
            TOKEN = raw.strip()  # tolerate a bare-string secret
    return TOKEN


def queue_url():
    global QURL
    if QURL is None:
        QURL = _sqs.get_queue_url(QueueName=os.environ.get("FARE_QUEUE", "flight-fare-queue"))["QueueUrl"]
    return QURL


def next_month():
    now = datetime.now(timezone.utc)
    year, month = (now.year + 1, 1) if now.month == 12 else (now.year, now.month + 1)
    return f"{year:04d}-{month:02d}"


def fetch_cheapest(origin, destination, month, token, currency):
    q = urllib.parse.urlencode({"origin": origin, "destination": destination, "depart_date": month,
                                "currency": currency, "token": token})
    req = urllib.request.Request(f"https://api.travelpayouts.com/v1/prices/cheap?{q}",
                                 headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = json.loads(r.read())
    except (urllib.error.URLError, ValueError) as e:  # 429 / network / bad JSON -> skip this run
        print("fetch failed", currency, origin, destination, repr(e))
        return None
    if not body.get("success") or not body.get("data"):
        return None
    offers = body["data"].get(destination, {})
    if not offers:
        return None
    best = min(offers.values(), key=lambda o: o["price"])
    return {"price": best["price"], "currency": currency.upper(), "airline": best.get("airline"),
            "depart_date": best.get("departure_at"), "return_date": best.get("return_at")}


def subscribers(route):
    # Paywall: only active rows and cancelled rows still inside their paid-through period are served.
    # A cancelled row whose current_period_end has passed is lazily retired to expired here.
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")  # same fixed-width format as the writers
    kwargs = {"FilterExpression": Attr("route").eq(route) & Attr("subscription_status").is_in(["active", "cancelled"])}
    while True:
        page = TABLE.scan(**kwargs)
        for it in page["Items"]:
            if it["subscription_status"] == "active" or it.get("current_period_end", "") >= now:
                yield it
                continue
            try:
                TABLE.update_item(Key={"email": it["email"], "route": it["route"]},
                                  UpdateExpression="SET subscription_status=:x, expired_at=:n, updated_at=:n",
                                  ConditionExpression="subscription_status=:c",
                                  ExpressionAttributeValues={":x": "expired", ":c": "cancelled", ":n": now})
                print("grace ended -> expired", it["email"], route)
            except ClientError as e:  # row changed since the scan (e.g. re-subscribed) — leave it
                print("skip expire", it["email"], route, e.response["Error"]["Code"])
        if "LastEvaluatedKey" not in page:
            return
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def handler(event, context):
    origin, destination = event["origin"], event["destination"]
    route = event.get("route") or f"{origin}-{destination}"
    month = next_month()
    token = get_token()

    tw = fetch_cheapest(origin, destination, month, token, "twd")
    if not tw:
        print("no TWD fare for", route, month, "(empty/429) - skipping")
        return {"ok": True, "route": route, "matched": 0}
    print("cheapest", route, month, tw["price"], "TWD", tw["airline"])
    us = fetch_cheapest(origin, destination, month, token, "usd")  # best-effort, never blocks

    matched = 0
    for it in subscribers(route):
        tp = Decimal(str(it["target_price"]))
        if tp < Decimal(str(tw["price"])):
            continue
        body = {"email": it["email"], "route": route, "plan_name": it.get("plan_name"),
                "target_price": int(tp), "cheapest": tw}
        if us:
            body["cheapest_usd"] = us
        _sqs.send_message(QueueUrl=queue_url(), MessageBody=json.dumps(body))
        matched += 1
    print("matched", route, matched)
    return {"ok": True, "route": route, "matched": matched, "cheapest": tw["price"]}
