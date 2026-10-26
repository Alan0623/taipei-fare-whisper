import html, json, urllib.error, urllib.request
from datetime import datetime, timezone
import boto3
from boto3.dynamodb.conditions import Key

# The one consumer of flight-status-queue: routes on message["event_type"] ("welcome" | "cancel").

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


def route_label(route):
    o, d = route.split("-")
    return f"{CITY.get(o, o)} → {CITY.get(d, d)}"


def render(msg):
    label = route_label(msg["route"])
    if msg["event_type"] == "welcome":
        subj = f"✈️ 訂閱成功：{label} 降價通知已啟用"
        lines = [f"感謝訂閱 Flight Price Notifier！{label} 的降價通知已經啟用。",
                 "票價降到你的目標價以下時，我們會寄 email 通知你。"]
    else:
        until = msg.get("current_period_end_date") or "本期結束"
        subj = f"已取消訂閱：{label}"
        lines = [f"你已取消 {label} 的訂閱，之後不會再扣款。",
                 f"已付費的期間內（至 {until}）仍會照常收到降價通知。"]
    body_html = ('<div style="font-family:sans-serif;max-width:480px">' +
                 "".join(f"<p>{html.escape(l)}</p>" for l in lines) +
                 '<p style="color:#999;font-size:12px">Flight Price Notifier</p></div>')
    return subj, body_html, "\n".join(lines)


def send_email(to, subj, body_html, body_text):
    c = cfg()
    body = {"from": c["from"], "to": to, "subject": subj, "html": body_html, "text": body_text}
    req = urllib.request.Request("https://api.resend.com/emails", data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + c["api_key"],
                                          "Content-Type": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def process(msg):
    if msg.get("event_type") not in ("welcome", "cancel"):
        print("unknown event_type, dropping", msg.get("event_type"))
        return
    pk = f"status#{msg['event_type']}#{msg['email']}#{msg['route']}#{msg.get('merchant_trade_no')}"
    if HISTORY.query(KeyConditionExpression=Key("pk").eq(pk), Limit=1)["Items"]:
        print("skipped (already sent)", pk)  # once per order per event
        return
    subj, body_html, body_text = render(msg)
    try:
        res = send_email(msg["email"], subj, body_html, body_text)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:300]
        if e.code == 429 or e.code >= 500:
            print("transient Resend error, will retry", e.code, detail)
            raise
        print("permanent Resend error, dropping", e.code, pk, detail)
        return
    HISTORY.put_item(Item={"pk": pk, "sent_at": datetime.now(timezone.utc).isoformat(), "email": msg["email"],
                           "route": msg["route"], "event_type": msg["event_type"], "resend_id": res.get("id")})
    print("sent", pk, res.get("id"))


def handler(event, context):
    failures = []
    for record in event.get("Records", []):
        try:
            process(json.loads(record["body"]))
        except Exception as e:
            print("failed", record.get("messageId"), repr(e))
            failures.append({"itemIdentifier": record["messageId"]})
    return {"batchItemFailures": failures}
