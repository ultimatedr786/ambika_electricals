import type { Metadata } from "next";
import { LoginForm } from "@/components/shared/login-form";
import { AuthShell } from "@/components/shared/auth-shell";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Ambika Electricals rewards account.",
};

export default function LoginPage() {
  return (
    <AuthShell headline="Welcome back." subheadline="Your rewards are waiting.">
      <LoginForm />
    </AuthShell>
  );
}
