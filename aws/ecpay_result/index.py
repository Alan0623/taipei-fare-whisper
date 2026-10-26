import base64, os, urllib.parse

# OrderResultURL arrives as a browser POST; the static SPA would answer 405. Turn it into a
# redirect. UX only — activation happens in the ReturnURL callback, never here.


def handler(event, context):
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    params = urllib.parse.parse_qs(raw)
    outcome = "success" if params.get("RtnCode", [""])[0] == "1" else "failed"
    site = os.environ["SITE_URL"].strip().rstrip("/")
    return {"statusCode": 302, "headers": {"location": f"{site}/app?purchase={outcome}"}, "body": ""}
