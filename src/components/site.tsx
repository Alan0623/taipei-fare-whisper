import { Link } from "react-router";
import { Plane } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
        <Plane className="h-4 w-4" />
      </span>
      <span>Flight Price Notifier</span>
    </Link>
  );
}

export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) {
        el.dataset["visible"] = "true";
        io.disconnect();
      }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="orb orb-mint -left-24 top-10 h-80 w-80 sm:h-[32rem] sm:w-[32rem]" />
      <div className="orb orb-peach -right-24 top-1/4 h-72 w-72 [animation-delay:-5s] sm:h-[28rem] sm:w-[28rem]" />
      <div className="orb orb-blush bottom-[-8rem] left-1/4 h-80 w-80 [animation-delay:-9s] sm:h-[32rem] sm:w-[32rem]" />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/70 py-8 text-center text-sm text-muted-foreground">
      © 2026 Flight Price Notifier
    </footer>
  );
}
