import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { saveSubscription, PLANS, type Subscription } from "@/lib/flight-api";

type Plan = (typeof PLANS)[number];

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
  const subscribed = Boolean(subscription);

  useEffect(() => {
    if (subscription) setTarget(String(subscription.target_price));
  }, [subscription]);

  const mutation = useMutation({
    mutationFn: (target_price: number) =>
      saveSubscription({ email, plan_name: plan.name, target_price }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subscriptions", email] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(target);
    if (!Number.isFinite(value) || value <= 0) return;
    mutation.mutate(value);
  }

  const input =
    "w-full rounded-full border border-white/80 bg-white/60 px-4 py-2.5 text-sm shadow-[inset_0_1px_2px_oklch(0.45_0.04_220/0.08)] outline-none transition focus:bg-white/80 focus:ring-2 focus:ring-ring/60";

  return (
    <form onSubmit={onSubmit} className="glass space-y-4 rounded-3xl p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{plan.label}</h2>
        {subscribed && <Badge>已訂閱 / Subscribed</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">
        {subscribed
          ? `目前目標價 NT$${subscription!.target_price.toLocaleString()}`
          : `近期最低價約 NT$${plan.typicalPrice.toLocaleString()}，設定你的預算：`}
      </p>
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
      {mutation.isError && <p className="text-sm text-destructive">{mutation.error.message}</p>}
      <Button type="submit" variant="hero" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending
          ? "..."
          : subscribed
            ? "更新目標價 / Update"
            : "開始追蹤 / Start tracking"}
      </Button>
    </form>
  );
}
