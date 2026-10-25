import { createFileRoute, Link } from "@tanstack/react-router";
import { BellRing, Radar, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Footer, Logo, Reveal } from "@/components/site";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flight Price Notifier 機票降價通知" },
      { name: "description", content: "設定航線與目標價，機票降價就通知你。Set a route and a target price — we email you when the fare drops." },
      { property: "og:title", content: "Flight Price Notifier 機票降價通知" },
      { property: "og:description", content: "Set a route and a target price — we email you when the fare drops." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const features = [
  { icon: Radar, title: "盯緊熱門航線 (Always-on route watching)", body: "持續監控台北出發的熱門航線（東京、首爾），自動抓最低票價。" },
  { icon: BellRing, title: "達標自動通知 (Target-price email alerts)", body: "低於你設定的目標價，就寄 email 提醒你，附上立即訂購連結。" },
  { icon: XCircle, title: "隨時取消 (Cancel anytime)", body: "月訂閱制，不想用隨時停，沒有綁約。" },
];

function Index() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-hero">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <Button asChild variant="hero" size="sm">
          <Link to="/signin">Sign in / 登入</Link>
        </Button>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-28">
          <Reveal>
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              <span className="text-gradient">Flight Price Notifier</span>
            </h1>
          </Reveal>
          <Reveal delay={100}>
            <p className="mt-6 text-xl font-medium sm:text-2xl">設定航線與目標價，機票降價就通知你</p>
            <p className="mt-3 text-muted-foreground">Set a route and a target price — we email you when the fare drops.</p>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-10 flex justify-center gap-3">
              <Button asChild variant="hero" size="lg"><Link to="/signup">免費註冊 / Get started</Link></Button>
              <Button asChild variant="outline" size="lg"><Link to="/signin">Sign in</Link></Button>
            </div>
          </Reveal>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-24 sm:px-6 md:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 120}>
              <div className="h-full rounded-xl border bg-card p-6 transition-colors hover:border-primary/60">
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-accent text-primary-glow">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </section>
      </main>
      <Footer />
    </div>
  );
}
