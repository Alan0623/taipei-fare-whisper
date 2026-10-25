import { useEffect } from "react";
import { Link } from "react-router";
import { usePageMeta } from "@/hooks/use-page-meta";
import { BellRing, Radar, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Backdrop, Footer, Logo, Reveal } from "@/components/site";

const features = [
  { icon: Radar, title: "盯緊熱門航線 (Always-on route watching)", body: "持續監控台北出發的熱門航線（東京、首爾、倫敦），自動抓最低票價。" },
  { icon: BellRing, title: "達標自動通知 (Target-price email alerts)", body: "低於你設定的目標價，就寄 email 提醒你，附上立即訂購連結。" },
  { icon: XCircle, title: "隨時取消 (Cancel anytime)", body: "月訂閱制，不想用隨時停，沒有綁約。" },
];

// Travelpayouts monetization script, loaded on the landing page only.
const TP_SCRIPT_SRC = "https://emrld.ltd/NTkwOTgy.js?t=590982";

function useTravelpayoutsScript() {
  useEffect(() => {
    if (document.querySelector(`script[src="${TP_SCRIPT_SRC}"]`)) return;
    const script = document.createElement("script");
    script.async = true;
    script.setAttribute("data-cmp-ab", "2");
    script.src = TP_SCRIPT_SRC;
    document.head.appendChild(script);
  }, []);
}

export default function Index() {
  useTravelpayoutsScript();
  usePageMeta({
    title: "Flight Price Notifier 機票降價通知",
    description: "設定航線與目標價，機票降價就通知你。Set a route and a target price — we email you when the fare drops.",
    extra: { "og:type": "website", "twitter:card": "summary_large_image" },
  });

  return (
    <div className="relative isolate flex min-h-screen flex-col bg-gradient-hero">
      <Backdrop />
      <header className="mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-6xl items-center justify-between rounded-full glass px-4 py-3 sm:px-6">
        <Logo />
        <Button asChild variant="hero" size="sm">
          <Link to="/signin">Sign in / 登入</Link>
        </Button>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-28">
          <Reveal>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
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
              <div className="glass h-full rounded-3xl p-7 transition-transform duration-300 hover:-translate-y-1">
                <div className="glass mb-5 grid h-11 w-11 place-items-center rounded-2xl text-primary">
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
