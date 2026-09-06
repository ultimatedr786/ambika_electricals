import type { Metadata } from "next";
import { AuthShell } from "@/components/shared/auth-shell";
import { ResetPasswordForm } from "@/components/shared/reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new password for your Ambika Electricals rewards account.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthShell
      headline="Choose a new password"
      subheadline="Pick something strong you haven't used before."
    >
      <ResetPasswordForm next={params.next ?? null} />
    </AuthShell>
  );
}
