import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
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
        <Button variant="outline" size="sm" onClick={signOut}>Sign out / 登出</Button>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-20 sm:px-6">
        <div className="glass rounded-3xl p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <h1 className="text-2xl font-semibold break-all sm:text-3xl">Hi {user.email}</h1>
          <p className="mt-4">你的航線追蹤儀表板即將上線 — 下一個里程碑會加上訂閱航線的功能。</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your dashboard is coming soon. Route-subscription will be added in the next milestone.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
