import type { Metadata } from "next";
import { AuthShell } from "@/components/shared/auth-shell";
import { SignupForm } from "@/components/shared/signup-form";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create your Ambika Electricals membership in minutes.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthShell
      headline="Start earning rewards"
      subheadline="Create your Ambika Electricals membership in minutes."
    >
      <SignupForm next={params.next ?? null} />
    </AuthShell>
  );
}
