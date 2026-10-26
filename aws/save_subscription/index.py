import base64, hashlib, html, json, os, secrets, urllib.parse
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
import boto3

PLANS = {"tokyo": ("TPE", "TYO"), "seoul": ("TPE", "SEL"), "london": ("TPE", "LON")}
TABLE = boto3.resource("dynamodb").Table("subscriptions")
_secrets = boto3.client("secretsmanager")
TS = "%Y-%m-%dT%H:%M:%SZ"
TPE = timezone(timedelta(hours=8))
# Monthly, effectively long-term (ECPay has no "until cancelled"). To test PeriodReturnURL
# next day instead of next month, temporarily set PERIOD_TYPE=D and EXEC_TIMES=2.
PERIOD_TYPE = os.environ.get("PERIOD_TYPE", "M")
EXEC_TIMES = os.environ.get("EXEC_TIMES", "999")
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


def in_grace(row, now):
    return row.get("subscription_status") == "cancelled" and row.get("current_period_end", "") >= now


def checkout_form(c, trade_no, email, route, plan):
    api = os.environ["API_URL"].strip().rstrip("/")
    host = "payment.ecpay.com.tw" if c.get("env") == "prod" else "payment-stage.ecpay.com.tw"
    amount = str(int(c["amount"]))  # TotalAmount must equal PeriodAmount
    params = {
        "MerchantID": c["merchant_id"], "MerchantTradeNo": trade_no,
        "MerchantTradeDate": datetime.now(TPE).strftime("%Y/%m/%d %H:%M:%S"),
        "PaymentType": "aio", "ChoosePayment": "Credit", "EncryptType": "1",
        "TotalAmount": amount, "PeriodAmount": amount,
        "PeriodType": PERIOD_TYPE, "Frequency": "1", "ExecTimes": EXEC_TIMES,
        "ItemName": f"Flight Price Notifier {route} 月訂閱", "TradeDesc": "Flight Price Notifier subscription",
        "ReturnURL": f"{api}/ecpay-return", "PeriodReturnURL": f"{api}/ecpay-period",
        "OrderResultURL": f"{api}/ecpay-result",
        "CustomField1": email, "CustomField2": route, "CustomField3": plan,
    }
    params["CheckMacValue"] = gen_cmv(params, c["hash_key"], c["hash_iv"])
    inputs = "".join(f'<input type="hidden" name="{k}" value="{html.escape(v, quote=True)}">' for k, v in params.items())
    return (f'<!doctype html><meta charset="utf-8"><title>前往綠界付款…</title><p>前往綠界付款中…</p>'
            f'<form action="https://{host}/Cashier/AioCheckOut/V5" method="post">{inputs}</form>'
            "<script>document.forms[0].submit()</script>")


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
    key = {"email": email, "route": route}
    now = datetime.now(timezone.utc).strftime(TS)
    common = {":p": plan, ":o": origin, ":d": dest, ":t": target, ":c": "TWD", ":n": now}
    fields = "plan_name=:p, origin=:o, destination=:d, target_price=:t, currency=:c, updated_at=:n, " \
             "created_at=if_not_exists(created_at, :n)"

    row = TABLE.get_item(Key=key).get("Item") or {}
    if row.get("subscription_status") == "active" or in_grace(row, now):
        # Already paid through this period: update the target in place, never back to pending_payment.
        TABLE.update_item(Key=key, UpdateExpression="SET " + fields, ExpressionAttributeValues=common)
        return resp(200, {"ok": True, "email": email, "route": route, "plan_name": plan,
                          "target_price": int(target), "subscription_status": row["subscription_status"]})

    # New, unpaid, or expired: a fresh recurring order (≤20 chars, unique per checkout attempt).
    trade_no = "FPN" + datetime.now(TPE).strftime("%y%m%d%H%M%S") + secrets.token_hex(2).upper()
    TABLE.update_item(
        Key=key,
        UpdateExpression="SET " + fields + ", subscription_status=:s, merchant_trade_no=:m, period_type=:pt, frequency=:f",
        ExpressionAttributeValues={**common, ":s": "pending_payment", ":m": trade_no, ":pt": PERIOD_TYPE, ":f": 1},
    )
    print("pending_payment", email, route, trade_no)
    return {"statusCode": 200, "headers": {"content-type": "text/html; charset=utf-8"},
            "body": checkout_form(cfg(), trade_no, email, route, plan)}
