import base64, hashlib, json, os, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
import boto3

# Cancel = stop future renewals at ECPay, keep service until current_period_end (grace).
# The parser flips cancelled -> expired once that date passes.

UA = "Mozilla/5.0 (compatible; flight-notifier/1.0)"
TABLE = boto3.resource("dynamodb").Table("subscriptions")
_secrets = boto3.client("secretsmanager")
_sqs = boto3.client("sqs")
TS = "%Y-%m-%dT%H:%M:%SZ"
TPE = timezone(timedelta(hours=8))
_cfg = None


def cfg():
    global _cfg
    if _cfg is None:
        _cfg = json.loads(_secrets.get_secret_value(SecretId="flight/ecpay")["SecretString"])
    return _cfg


def ecpay_url_encode(s):
    e = urllib.parse.quote_plus(str(s)).replace("~", "%7E").lower()
    for o, n in (("%2d", "-"), ("%5f", "_"), ("%2e", "."), ("%21", "!"), ("%2a", "*"), ("%28", "("), ("%29", ")")):
        e = e.replace(o, n)
    return e


def gen_cmv(params, hash_key, hash_iv):
    items = {k: v for k, v in params.items() if k != "CheckMacValue"}
    body = "&".join(f"{k}={items[k]}" for k in sorted(items, key=str.lower))
    raw = f"HashKey={hash_key}&{body}&HashIV={hash_iv}"
    return hashlib.sha256(ecpay_url_encode(raw).encode()).hexdigest().upper()


def resp(code, body):
    return {"statusCode": code, "headers": {"content-type": "application/json"}, "body": json.dumps(body)}


def ecpay_cancel(trade_no):
    c = cfg()
    host = "payment.ecpay.com.tw" if c.get("env") == "prod" else "payment-stage.ecpay.com.tw"
    params = {"MerchantID": c["merchant_id"], "MerchantTradeNo": trade_no, "Action": "Cancel",
              "TimeStamp": str(int(time.time()))}
    params["CheckMacValue"] = gen_cmv(params, c["hash_key"], c["hash_iv"])
    req = urllib.request.Request(f"https://{host}/Cashier/CreditCardPeriodAction",
                                 data=urllib.parse.urlencode(params).encode(), method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=10) as r:
        result = dict(urllib.parse.parse_qsl(r.read().decode("utf-8"), keep_blank_values=True))
    # 90100150 不存在的訂單編號 on a never-paid stage order is expected — still cancel locally.
    print("CreditCardPeriodAction Cancel", trade_no, result.get("RtnCode"), result.get("RtnMsg"))
    return result


def handler(event, context):
    # No auth, same as /subscribe in this course: trusts the client-supplied email.
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    try:
        data = json.loads(raw)
    except ValueError:
        return resp(400, {"error": "invalid JSON"})
    key = {"email": str(data.get("email", "")).strip().lower(), "route": str(data.get("route", ""))}
    row = TABLE.get_item(Key=key).get("Item") if "@" in key["email"] and key["route"] else None
    if not row:
        return resp(404, {"error": "subscription not found"})
    status = row.get("subscription_status")
    if status == "cancelled":
        return resp(200, {"ok": True, "subscription_status": status,
                          "current_period_end_date": row.get("current_period_end_date")})
    if status != "active":
        return resp(409, {"error": f"cannot cancel a {status or 'unpaid'} subscription"})

    try:
        ecpay_cancel(row["merchant_trade_no"])
    except Exception as e:  # network/ECPay outage: still stop alerts locally; renewals can be stopped in 後台
        print("CreditCardPeriodAction failed", row["merchant_trade_no"], repr(e))

    now = datetime.now(timezone.utc).replace(microsecond=0)
    end, end_date = row.get("current_period_end"), row.get("current_period_end_date")
    if not end:  # activated before period tracking existed: grant one month rather than expiring now
        e = now + timedelta(days=30)
        end, end_date = e.strftime(TS), e.astimezone(TPE).strftime("%Y-%m-%d")
    TABLE.update_item(
        Key=key,
        UpdateExpression="SET subscription_status=:s, cancelled_at=:now, updated_at=:now, "
        "current_period_end=:end, current_period_end_date=:end_date",
        ExpressionAttributeValues={":s": "cancelled", ":now": now.strftime(TS), ":end": end, ":end_date": end_date},
    )
    qurl = _sqs.get_queue_url(QueueName=os.environ.get("STATUS_QUEUE", "flight-status-queue"))["QueueUrl"]
    _sqs.send_message(QueueUrl=qurl, MessageBody=json.dumps(
        {"event_type": "cancel", "email": key["email"], "route": key["route"], "plan_name": row.get("plan_name"),
         "merchant_trade_no": row.get("merchant_trade_no"), "current_period_end_date": end_date}))
    print("cancelled", key, "service until", end)
    return resp(200, {"ok": True, "subscription_status": "cancelled", "current_period_end_date": end_date})
