import { usePageMeta } from "@/hooks/use-page-meta";
import { AuthForm } from "@/components/auth-form";

export default function SignIn() {
  usePageMeta({
    title: "Sign in — Flight Price Notifier",
    description: "Sign in to Flight Price Notifier.",
    extra: { "og:type": "website", "twitter:card": "summary" },
  });

  return <AuthForm mode="signin" />;
}
