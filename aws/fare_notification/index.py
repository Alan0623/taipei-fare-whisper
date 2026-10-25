import html, json, os, urllib.error, urllib.request
from datetime import datetime, timedelta, timezone
import boto3
from boto3.dynamodb.conditions import Key

UA = "Mozilla/5.0 (compatible; flight-notifier/1.0)"
HISTORY = boto3.resource("dynamodb").Table("notification_history")
_secrets = boto3.client("secretsmanager")
CITY = {"TPE": "台北", "TYO": "東京", "SEL": "首爾", "LON": "倫敦"}
_cfg = None


def cfg():
    # Cached per warm container; bump an env var after changing flight/resend to force a re-read.
    global _cfg
    if _cfg is None:
        _cfg = json.loads(_secrets.get_secret_value(SecretId="flight/resend")["SecretString"])
    return _cfg


def num_env(name, default):
    return float(os.environ.get(name, default))


# ---- renderer (folded inline: subject / booking_url / render_html / render_text) ----

def _cities(fare):
    o, d = fare["origin"], fare["destination"]
    return CITY.get(o, o), CITY.get(d, d)


def subject(fare):
    o, d = _cities(fare)
    return f"✈️ {o} → {d} 降價通知！NT${fare['price']:,} 已達標"


def _ddmm(iso):
    return iso[8:10] + iso[5:7] if iso and len(iso) >= 10 else ""


def booking_url(fare, marker=None):
    path = f"{fare['origin']}{_ddmm(fare.get('depart_date'))}{fare['destination']}{_ddmm(fare.get('return_date'))}"
    url = f"https://www.aviasales.com/search/{path}?currency=twd"
    return url + (f"&marker={marker}" if marker else "")


def _dates(fare):
    dep, ret = (fare.get("depart_date") or "")[:10], (fare.get("return_date") or "")[:10]
    return f"{dep} → {ret}" if ret else dep


def render_html(fare, target_price, marker=None, usd_price=None):
    o, d = _cities(fare)
    usd = f'<p style="margin:4px 0;color:#666">約 US${usd_price:,}</p>' if usd_price else ""
    link = html.escape(booking_url(fare, marker))
    return (
        '<div style="font-family:sans-serif;max-width:480px">'
        f"<h2>{o} → {d} 機票降價了</h2>"
        f'<p style="font-size:28px;font-weight:bold;margin:8px 0">NT${fare["price"]:,}</p>{usd}'
        f"<p>你的目標價：NT${target_price:,}</p>"
        f"<p>航空公司：{html.escape(str(fare.get('airline') or '-'))}<br>日期：{html.escape(_dates(fare))}</p>"
        f'<p><a href="{link}" style="display:inline-block;padding:10px 20px;background:#6d28d9;'
        'color:#fff;border-radius:999px;text-decoration:none">立即訂購</a></p>'
        '<p style="color:#999;font-size:12px">Flight Price Notifier</p></div>'
    )


def render_text(fare, target_price, marker=None, usd_price=None):
    o, d = _cities(fare)
    lines = [f"{o} → {d} 機票降價了：NT${fare['price']:,}"]
    if usd_price:
        lines.append(f"約 US${usd_price:,}")
    lines += [f"你的目標價：NT${target_price:,}", f"航空公司：{fare.get('airline') or '-'}",
              f"日期：{_dates(fare)}", f"立即訂購：{booking_url(fare, marker)}"]
    return "\n".join(lines)


# ---- dedup + send ----

def should_send(pk, price):
    last = HISTORY.query(KeyConditionExpression=Key("pk").eq(pk), ScanIndexForward=False, Limit=1)["Items"]
    if not last:
        return True
    sent_at = datetime.fromisoformat(last[0]["sent_at"])
    if datetime.now(timezone.utc) - sent_at >= timedelta(hours=num_env("NOTIFY_FLOOR_HOURS", 24)):
        return True
    prev = float(last[0]["price"])
    return price <= prev * (1 - num_env("REALERT_PCT", 20) / 100) or prev - price >= num_env("REALERT_ABS_TWD", 2000)


def send_email(to, subj, body_html, body_text):
    c = cfg()
    body = {"from": c["from"], "to": to, "subject": subj, "html": body_html, "text": body_text}
    req = urllib.request.Request("https://api.resend.com/emails", data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + c["api_key"],
                                          "Content-Type": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def process(msg):
    email, route = msg["email"], msg["route"]
    origin, dest = route.split("-")
    fare = dict(msg["cheapest"], origin=origin, destination=dest)
    pk = f"{email}#{route}"
    if not should_send(pk, fare["price"]):
        print("skipped (deduped)", pk, fare["price"])
        return
    usd = (msg.get("cheapest_usd") or {}).get("price")
    marker = cfg().get("marker")
    try:
        res = send_email(email, subject(fare), render_html(fare, msg["target_price"], marker, usd),
                         render_text(fare, msg["target_price"], marker, usd))
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:300]
        if e.code == 429 or e.code >= 500:
            print("transient Resend error, will retry", e.code, detail)
            raise
        print("permanent Resend error, dropping", e.code, pk, detail)  # 403/422 etc. never succeed on retry
        return
    HISTORY.put_item(Item={"pk": pk, "sent_at": datetime.now(timezone.utc).isoformat(), "email": email,
                           "route": route, "price": fare["price"], "currency": "TWD", "resend_id": res.get("id")})
    print("sent", pk, fare["price"], res.get("id"))


def handler(event, context):
    failures = []
    for record in event.get("Records", []):
        try:
            process(json.loads(record["body"]))
        except Exception as e:
            print("failed", record.get("messageId"), repr(e))
            failures.append({"itemIdentifier": record["messageId"]})
    # Partial batch response: only failed (transient) messages are redelivered.
    return {"batchItemFailures": failures}
