import type { Metadata } from "next";
import { AuthShell } from "@/components/shared/auth-shell";
import { BusinessSignupForm } from "@/components/business/business-signup-form";

export const metadata: Metadata = {
  title: "Register your business",
  description: "Set up Rewardly for your electrical retail business.",
};

export default function BusinessSignupPage() {
  return (
    <AuthShell
      headline="Set up rewards for your store."
      subheadline="Register your electrical business and start rewarding customers in minutes."
    >
      <BusinessSignupForm />
    </AuthShell>
  );
}
