import { useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlanCard } from "@/components/plan-card";
import { listSubscriptions, PLANS } from "@/lib/flight-api";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Backdrop, Footer, Logo } from "@/components/site";
import { useAuth } from "@/components/require-auth";
import { usePageMeta } from "@/hooks/use-page-meta";

export default function AppPage() {
  usePageMeta({
    title: "Dashboard — Flight Price Notifier",
    description: "Your Flight Price Notifier dashboard.",
    extra: { "og:type": "website", "twitter:card": "summary" },
  });
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const email = user.email ?? "";
  // Set by the ECPay OrderResultURL redirect. Activation itself arrives via the server-to-server
  // callback, which can land a few seconds after the browser does — so poll while still unpaid.
  const [params] = useSearchParams();
  const purchase = params.get("purchase");
  const subscriptions = useQuery({
    queryKey: ["subscriptions", email],
    queryFn: () => listSubscriptions(email),
    enabled: Boolean(email),
    refetchInterval: (query) =>
      purchase === "success" &&
      query.state.data?.some((s) => s.subscription_status === "pending_payment")
        ? 3000
        : false,
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate("/signin", { replace: true });
  }

  return (
    <div className="relative isolate flex min-h-screen flex-col bg-gradient-hero">
      <Backdrop />
      <header className="mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-6xl items-center justify-between rounded-full glass px-4 py-3 sm:px-6">
        <Logo />
        <Button variant="outline" size="sm" onClick={signOut}>
          Sign out / 登出
        </Button>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-20 sm:px-6">
        <div className="glass rounded-3xl p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <h1 className="text-2xl font-semibold break-all sm:text-3xl">Hi {user.email}</h1>
          <p className="mt-4">選一條航線、設定目標價，票價降到目標以下就寄 email 通知你。</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick a route and a target price — we email you when the fare drops to it.
          </p>
        </div>
        {purchase === "success" && (
          <p className="mt-6 glass rounded-2xl px-5 py-3 text-sm">
            付款完成，感謝訂閱！訂閱狀態會在幾秒內更新。 / Payment received — your subscription will
            activate in a few seconds.
          </p>
        )}
        {purchase === "failed" && (
          <p className="mt-6 glass rounded-2xl px-5 py-3 text-sm text-destructive">
            付款未完成，請再試一次。 / Payment didn't go through — please try again.
          </p>
        )}
        {subscriptions.isError && (
          <p className="mt-6 text-sm text-destructive">
            無法載入訂閱 / Couldn't load subscriptions: {subscriptions.error.message}
          </p>
        )}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.name}
              plan={plan}
              email={email}
              subscription={subscriptions.data?.find((s) => s.route === plan.route)}
            />
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
