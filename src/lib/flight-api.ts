// Client for the AWS API Gateway in front of the subscription Lambdas.
// The browser only talks to this API; it never holds AWS credentials.
const API_URL = import.meta.env["VITE_FLIGHT_API_URL"] as string;

export type PlanName = "tokyo" | "seoul" | "london";

// pending_payment → active → cancelled (still alerted until current_period_end) → expired
export type SubscriptionStatus = "pending_payment" | "active" | "cancelled" | "expired";

export type Subscription = {
  route: string;
  plan_name: PlanName;
  target_price: number;
  currency: string;
  updated_at?: string;
  subscription_status: SubscriptionStatus;
  current_period_end_date?: string | null;
};

// /subscribe either returns ECPay's auto-submit checkout form (HTML) or, for an
// already-paid subscription, a JSON in-place target update.
export type SaveResult =
  | { kind: "checkout"; html: string }
  | { kind: "updated"; target_price: number; subscription_status: SubscriptionStatus };

export const PLANS: { name: PlanName; label: string; route: string; typicalPrice: number }[] = [
  { name: "tokyo", label: "台北 ✈ 東京", route: "TPE-TYO", typicalPrice: 9325 },
  { name: "seoul", label: "台北 ✈ 首爾", route: "TPE-SEL", typicalPrice: 5989 },
  { name: "london", label: "台北 ✈ 倫敦", route: "TPE-LON", typicalPrice: 23081 },
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
}): Promise<SaveResult> {
  const res = await fetch(`${API_URL}/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.ok && res.headers.get("content-type")?.includes("text/html")) {
    return { kind: "checkout", html: await res.text() };
  }
  const body = await parse<{ target_price: number; subscription_status: SubscriptionStatus }>(res);
  return { kind: "updated", ...body };
}

// Hand the browser to ECPay: the returned form's inline script auto-POSTs to the cashier.
export function goToCheckout(html: string) {
  document.open();
  document.write(html);
  document.close();
}

export async function cancelSubscription(input: { email: string; route: string }) {
  const res = await fetch(`${API_URL}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parse<{
    ok: true;
    subscription_status: SubscriptionStatus;
    current_period_end_date?: string;
  }>(res);
}
