import type { Metadata } from "next";
import { LoginForm } from "@/components/shared/login-form";
import { AuthShell } from "@/components/shared/auth-shell";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to view your Ambika Electricals rewards.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthShell
      headline="Welcome back"
      subheadline="Sign in to view your Ambika Electricals rewards."
    >
      <LoginForm next={params.next ?? null} error={params.error ?? null} />
    </AuthShell>
  );
}
