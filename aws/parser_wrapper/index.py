import json, os
import boto3

_s3 = boto3.client("s3")
_lambda = boto3.client("lambda")


def handler(event, context):
    obj = _s3.get_object(Bucket=os.environ["CONFIG_BUCKET"], Key="flight-routes.json")
    routes = json.loads(obj["Body"].read())
    for r in routes:
        payload = {"origin": r["origin"], "destination": r["destination"],
                   "route": f"{r['origin']}-{r['destination']}"}
        # Async fan-out: one parser invocation per route.
        _lambda.invoke(FunctionName="flight-parser", InvocationType="Event", Payload=json.dumps(payload))
        print("dispatched", payload["route"])
    return {"ok": True, "dispatched": len(routes)}
