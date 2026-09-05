import type { Metadata } from "next";
import { AuthShell } from "@/components/shared/auth-shell";
import { ForgotPasswordForm } from "@/components/shared/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Reset your Ambika Electricals rewards password.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell headline="Reset your password" subheadline="We'll send you instructions to get back in.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
