import { Link, useNavigate } from "react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Backdrop, Footer, Logo } from "@/components/site";

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isSignup = mode === "signup";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data, error } = isSignup
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/app" } })
      : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    if (data.session) navigate("/app");
    else setError("請到信箱確認後再登入 / Check your email to confirm.");
  }

  const input = "w-full rounded-full border border-white/80 bg-white/60 px-4 py-2.5 text-sm shadow-[inset_0_1px_2px_oklch(0.45_0.04_220/0.08)] outline-none transition focus:bg-white/80 focus:ring-2 focus:ring-ring/60";

  return (
    <div className="relative isolate flex min-h-screen flex-col bg-gradient-hero">
      <Backdrop />
      <header className="mx-auto mt-4 w-[calc(100%-2rem)] max-w-6xl rounded-full glass px-4 py-3 sm:px-6"><Logo /></header>
      <main className="flex flex-1 items-center justify-center px-4">
        <form onSubmit={onSubmit} className="glass w-full max-w-sm space-y-4 rounded-3xl p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <h1 className="text-2xl font-semibold">{isSignup ? "Sign up / 註冊" : "Sign in / 登入"}</h1>
          <label className="block space-y-1 text-sm">
            <span>Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </label>
          <label className="block space-y-1 text-sm">
            <span>Password</span>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" variant="hero" className="w-full" disabled={loading}>
            {loading ? "..." : isSignup ? "Create account" : "Sign in"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {isSignup ? "已有帳號？" : "還沒有帳號？"}{" "}
            <Link to={isSignup ? "/signin" : "/signup"} className="font-medium text-primary hover:underline">
              {isSignup ? "Sign in" : "Sign up"}
            </Link>
          </p>
        </form>
      </main>
      <Footer />
    </div>
  );
}
