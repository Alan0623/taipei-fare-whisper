import base64, hashlib, json, os, urllib.parse
from calendar import monthrange
from datetime import datetime, timedelta, timezone
import boto3
from botocore.exceptions import ClientError

# One zip, two functions: flight-ecpay-return (handler=index.handle_return, first charge)
# and flight-ecpay-period (handler=index.handle_period, 2nd charge onward). The callbacks
# verified by CheckMacValue are the only writers of subscription_status=active.

TABLE = boto3.resource("dynamodb").Table("subscriptions")
_secrets = boto3.client("secretsmanager")
_sqs = boto3.client("sqs")
TS = "%Y-%m-%dT%H:%M:%SZ"  # fixed-width UTC: the parser's grace check compares these as strings
TPE = timezone(timedelta(hours=8))
MAX_FAILED = 6  # ECPay auto-terminates a series after 6 consecutive failed renewals
_cfg = None
_qurl = None


def cfg():
    global _cfg
    if _cfg is None:
        _cfg = json.loads(_secrets.get_secret_value(SecretId="flight/ecpay")["SecretString"])
    return _cfg


def status_queue():
    global _qurl
    if _qurl is None:
        _qurl = _sqs.get_queue_url(QueueName=os.environ.get("STATUS_QUEUE", "flight-status-queue"))["QueueUrl"]
    return _qurl


# ---- CheckMacValue (SHA256, AIO) ----

def ecpay_url_encode(s):
    e = urllib.parse.quote_plus(str(s)).replace("~", "%7E").lower()
    for o, n in (("%2d", "-"), ("%5f", "_"), ("%2e", "."), ("%21", "!"), ("%2a", "*"), ("%28", "("), ("%29", ")")):
        e = e.replace(o, n)
    return e


def gen_cmv(params, hash_key, hash_iv):
    items = {k: v for k, v in params.items() if k != "CheckMacValue"}  # KEEP empty-string values
    body = "&".join(f"{k}={items[k]}" for k in sorted(items, key=str.lower))
    raw = f"HashKey={hash_key}&{body}&HashIV={hash_iv}"
    return hashlib.sha256(ecpay_url_encode(raw).encode()).hexdigest().upper()


def verify_cmv(params, hash_key, hash_iv):
    return params.get("CheckMacValue", "").upper() == gen_cmv(params, hash_key, hash_iv)


# ---- periods ----

def utcnow():
    return datetime.now(timezone.utc).replace(microsecond=0)


def add_period(dt, period_type, frequency):
    n = int(frequency or 1)
    if period_type == "D":
        return dt + timedelta(days=n)
    months = n * (12 if period_type == "Y" else 1)
    y, m = divmod(dt.month - 1 + months, 12)
    y, m = dt.year + y, m + 1
    return dt.replace(year=y, month=m, day=min(dt.day, monthrange(y, m)[1]))


def period_fields(end):
    return {":end": end.strftime(TS), ":end_date": end.astimezone(TPE).strftime("%Y-%m-%d")}


# ---- shared callback plumbing ----

def text(body, code=200):
    return {"statusCode": code, "headers": {"content-type": "text/plain; charset=utf-8"}, "body": body}


def parse_form(event):
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    return {k: v[0] for k, v in urllib.parse.parse_qs(raw, keep_blank_values=True).items()}


def verified(event, name):
    """Parse + authenticate a callback. Returns (params, row, None) or (None, None, response)."""
    p = parse_form(event)
    c = cfg()
    log = {k: p.get(k) for k in ("MerchantTradeNo", "RtnCode", "RtnMsg", "SimulatePaid", "TotalSuccessTimes",
                                  "CustomField1", "CustomField2")}
    print(name, "callback", json.dumps(log, ensure_ascii=False))
    if not verify_cmv(p, c["hash_key"], c["hash_iv"]):
        print("CheckMacValueInvalid received", p.get("CheckMacValue"), "expected", gen_cmv(p, c["hash_key"], c["hash_iv"]))
        return None, None, text("0|CheckMacValueInvalid", 400)
    if p.get("MerchantID") != c["merchant_id"]:
        print("MerchantID mismatch", p.get("MerchantID"))
        return None, None, text("0|MerchantIDMismatch", 400)
    print("CheckMacValue verified")
    if p.get("SimulatePaid") == "1":
        print("SimulatePaid=1 - acked, NOT activating")  # 模擬付款 must never grant access
        return None, None, text("1|OK")
    email, route = p.get("CustomField1", ""), p.get("CustomField2", "")
    row = TABLE.get_item(Key={"email": email, "route": route}).get("Item") if email and route else None
    if not row or row.get("merchant_trade_no") != p.get("MerchantTradeNo"):
        # Unknown row, or a stale order superseded by a newer checkout: ack so ECPay stops resending.
        print("no row for this MerchantTradeNo - ignoring", email, route)
        return None, None, text("1|OK")
    return p, row, None


def enqueue(event_type, row):
    body = {"event_type": event_type, "email": row["email"], "route": row["route"],
            "plan_name": row.get("plan_name"), "merchant_trade_no": row.get("merchant_trade_no")}
    _sqs.send_message(QueueUrl=status_queue(), MessageBody=json.dumps(body))


# ---- ReturnURL: first period ----

def handle_return(event, context):
    p, row, early = verified(event, "return")
    if early:
        return early
    if p.get("RtnCode") != "1":
        # A failed first auth never enters ECPay's scheduler; the row stays pending_payment.
        print("first authorization failed", p.get("RtnCode"), p.get("RtnMsg"))
        return text("1|OK")
    now = utcnow()
    end = add_period(now, row.get("period_type", "M"), row.get("frequency", 1))
    try:
        TABLE.update_item(
            Key={"email": row["email"], "route": row["route"]},
            UpdateExpression="SET subscription_status=:a, current_period_end=:end, current_period_end_date=:end_date, "
            "activated_at=:now, updated_at=:now, total_success_times=:n, failed_attempts=:z, ecpay_trade_no=:tn",
            ConditionExpression="merchant_trade_no=:m AND subscription_status <> :a",
            ExpressionAttributeValues={":a": "active", ":now": now.strftime(TS), ":m": p["MerchantTradeNo"],
                                       ":n": int(p.get("TotalSuccessTimes") or 1), ":z": 0,
                                       ":tn": p.get("TradeNo", ""), **period_fields(end)},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        print("already active for", p["MerchantTradeNo"], "- resend, no-op")
        return text("1|OK")
    print("UpdateItem -> active", row["email"], row["route"], "until", end.strftime(TS))
    enqueue("welcome", row)
    return text("1|OK")


# ---- PeriodReturnURL: 2nd charge onward ----

def handle_period(event, context):
    p, row, early = verified(event, "period")
    if early:
        return early
    key = {"email": row["email"], "route": row["route"]}
    now = utcnow()
    if p.get("RtnCode") == "1":
        times = int(p.get("TotalSuccessTimes") or 0)
        if times and times <= int(row.get("total_success_times", 0)):
            print("renewal", times, "already recorded - resend, no-op")
            return text("1|OK")
        start = max(now, datetime.strptime(row["current_period_end"], TS).replace(tzinfo=timezone.utc)) \
            if row.get("current_period_end") else now
        end = add_period(start, row.get("period_type", "M"), row.get("frequency", 1))
        # A cancelled series gets no more charges, so a renewal means the row is (still) paid up.
        status = "cancelled" if row.get("subscription_status") == "cancelled" else "active"
        TABLE.update_item(
            Key=key,
            UpdateExpression="SET subscription_status=:s, current_period_end=:end, current_period_end_date=:end_date, "
            "last_charged_at=:now, updated_at=:now, total_success_times=:n, failed_attempts=:z",
            ExpressionAttributeValues={":s": status, ":now": now.strftime(TS), ":n": times or
                                       int(row.get("total_success_times", 0)) + 1, ":z": 0, **period_fields(end)},
        )
        print("renewal ok", key, "TotalSuccessTimes", times, "until", end.strftime(TS))
        return text("1|OK")

    # Failed renewal: ECPay retries on its own, so don't expire on the first miss.
    failed = int(row.get("failed_attempts", 0)) + 1
    values = {":f": failed, ":now": now.strftime(TS)}
    expr = "SET failed_attempts=:f, last_failed_at=:now, updated_at=:now"
    if failed >= MAX_FAILED:
        expr += ", subscription_status=:x"
        values[":x"] = "expired"
    TABLE.update_item(Key=key, UpdateExpression=expr, ExpressionAttributeValues=values)
    print("renewal failed", key, "attempt", failed, p.get("RtnMsg"), "-> expired" if failed >= MAX_FAILED else "")
    return text("1|OK")
