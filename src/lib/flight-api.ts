// Client for the AWS API Gateway in front of the subscription Lambdas.
// The browser only talks to this API; it never holds AWS credentials.
const API_URL = import.meta.env["VITE_FLIGHT_API_URL"] as string;

export type PlanName = "tokyo" | "seoul";

export type Subscription = {
  route: string;
  plan_name: PlanName;
  target_price: number;
  currency: string;
  updated_at?: string;
};

export const PLANS: { name: PlanName; label: string; route: string; typicalPrice: number }[] = [
  { name: "tokyo", label: "台北 ✈ 東京", route: "TPE-TYO", typicalPrice: 9325 },
  { name: "seoul", label: "台北 ✈ 首爾", route: "TPE-SEL", typicalPrice: 5989 },
];

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export async function listSubscriptions(email: string): Promise<Subscription[]> {
  const res = await fetch(`${API_URL}/subscriptions?email=${encodeURIComponent(email)}`);
  return (await parse<{ subscriptions: Subscription[] }>(res)).subscriptions;
}

export async function saveSubscription(input: {
  email: string;
  plan_name: PlanName;
  target_price: number;
}) {
  const res = await fetch(`${API_URL}/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parse<{ ok: true; route: string; target_price: number }>(res);
}
