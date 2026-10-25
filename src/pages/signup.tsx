import { usePageMeta } from "@/hooks/use-page-meta";
import { AuthForm } from "@/components/auth-form";

export default function SignUp() {
  usePageMeta({
    title: "Sign up — Flight Price Notifier",
    description: "Create your Flight Price Notifier account.",
    extra: { "og:type": "website", "twitter:card": "summary" },
  });

  return <AuthForm mode="signup" />;
}
