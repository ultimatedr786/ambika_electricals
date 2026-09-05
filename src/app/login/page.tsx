import type { Metadata } from "next";
import { LoginForm } from "@/components/shared/login-form";
import { AuthShell } from "@/components/shared/auth-shell";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to view your Ambika Electricals rewards.",
};

export default function LoginPage() {
  return (
    <AuthShell
      headline="Welcome back"
      subheadline="Sign in to view your Ambika Electricals rewards."
    >
      <LoginForm />
    </AuthShell>
  );
}
