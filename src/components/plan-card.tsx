import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  cancelSubscription,
  goToCheckout,
  saveSubscription,
  PLANS,
  type Subscription,
  type SubscriptionStatus,
} from "@/lib/flight-api";

type Plan = (typeof PLANS)[number];

const BADGE: Record<
  SubscriptionStatus,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  active: { label: "已訂閱 / Subscribed", variant: "default" },
  pending_payment: { label: "未完成付款 / Unpaid", variant: "outline" },
  cancelled: { label: "已取消 / Cancelled", variant: "secondary" },
  expired: { label: "已結束 / Expired", variant: "outline" },
};

const SUBMIT: Record<SubscriptionStatus | "none", string> = {
  none: "開始追蹤 / Start tracking",
  active: "更新目標價 / Update",
  cancelled: "更新目標價 / Update",
  pending_payment: "完成付款 / Pay",
  expired: "重新訂閱 / Resubscribe",
};

function summary(plan: Plan, subscription: Subscription | undefined) {
  if (!subscription) return `近期最低價約 NT$${plan.typicalPrice.toLocaleString()}，設定你的預算：`;
  const target = `目標價 NT$${subscription.target_price.toLocaleString()}`;
  switch (subscription.subscription_status) {
    case "active":
      return `目前${target}`;
    case "pending_payment":
      return `${target}，尚未完成付款 — 付款後才會開始通知。`;
    case "cancelled":
      return `${target}，有效至 ${subscription.current_period_end_date ?? "本期結束"}（仍會通知到該日）`;
    case "expired":
      return `${target}，訂閱已結束，重新訂閱即可恢復通知。`;
  }
}

export function PlanCard({
  plan,
  email,
  subscription,
}: {
  plan: Plan;
  email: string;
  subscription: Subscription | undefined;
}) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState(String(subscription?.target_price ?? ""));
  const status = subscription?.subscription_status;

  useEffect(() => {
    if (subscription) setTarget(String(subscription.target_price));
  }, [subscription]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["subscriptions", email] });

  const mutation = useMutation({
    mutationFn: (target_price: number) =>
      saveSubscription({ email, plan_name: plan.name, target_price }),
    onSuccess: (result) => (result.kind === "checkout" ? goToCheckout(result.html) : refresh()),
  });

  const cancel = useMutation({
    mutationFn: () => cancelSubscription({ email, route: plan.route }),
    onSuccess: refresh,
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(target);
    if (!Number.isFinite(value) || value <= 0) return;
    mutation.mutate(value);
  }

  function onCancel() {
    if (window.confirm(`確定取消 ${plan.label} 的訂閱？已付費的期間內仍會收到通知。`))
      cancel.mutate();
  }

  const input =
    "w-full rounded-full border border-white/80 bg-white/60 px-4 py-2.5 text-sm shadow-[inset_0_1px_2px_oklch(0.45_0.04_220/0.08)] outline-none transition focus:bg-white/80 focus:ring-2 focus:ring-ring/60";
  const error = mutation.error ?? cancel.error;

  return (
    <form onSubmit={onSubmit} className="glass space-y-4 rounded-3xl p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{plan.label}</h2>
        {status && <Badge variant={BADGE[status].variant}>{BADGE[status].label}</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">{summary(plan, subscription)}</p>
      <label className="block space-y-1 text-sm">
        <span>目標價 (TWD)</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          required
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={String(plan.typicalPrice)}
          className={input}
        />
      </label>
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      <Button type="submit" variant="hero" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending ? "..." : SUBMIT[status ?? "none"]}
      </Button>
      {(!status || status === "expired") && (
        <p className="text-center text-xs text-muted-foreground">
          送出後將前往綠界 ECPay 以信用卡定期定額付款
        </p>
      )}
      {status === "active" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={onCancel}
          disabled={cancel.isPending}
        >
          {cancel.isPending ? "..." : "取消訂閱 / Cancel subscription"}
        </Button>
      )}
    </form>
  );
}
