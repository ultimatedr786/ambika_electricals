import type { Metadata } from "next";
import { AuthShell } from "@/components/shared/auth-shell";
import { SignupForm } from "@/components/shared/signup-form";

export const metadata: Metadata = {
  title: "Create account",
  description: "Join the Ambika Electricals rewards programme and start earning points.",
};

export default function SignupPage() {
  return (
    <AuthShell
      headline="Create your Rewardly account."
      subheadline="Join Ambika Electricals and start earning rewards."
    >
      <SignupForm />
    </AuthShell>
  );
}
