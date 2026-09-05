"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Coins, Gift, QrCode, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/logo";
import { QRCode } from "@/components/shared/qr-code";
import { useCurrentCustomer } from "@/lib/store";
import { useServices } from "@/lib/services";
import { cn, formatNumber } from "@/lib/utils";

const steps = [
  {
    icon: Sparkles,
    title: "Welcome to Ambika Electricals Rewards",
    body: "A loyalty programme built for the electrical products you already buy — lighting, wiring, switches, fans and fittings.",
  },
  {
    icon: Coins,
    title: "Your points",
    body: "Earn 10 points for every ₹100 you spend. Weekend shopping, LED products and wire purchases earn bonus points on top.",
  },
  {
    icon: Gift,
    title: "How rewards work",
    body: "Spend points on free electrical products, discount coupons, points + cash deals or unlock member-only pricing.",
  },
  {
    icon: QrCode,
    title: "Show your QR at the counter",
    body: "Our staff scan your membership QR and your points are applied to the bill automatically.",
  },
  {
    icon: Zap,
    title: "You're all set",
    body: "Browse the Rewards Store and see what your points can unlock today.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const customer = useCurrentCustomer();
  const { authService } = useServices();
  const [i, setI] = React.useState(0);
  const step = steps[i];
  const Icon = step.icon;

  const finish = () => {
    authService.completeOnboarding();
    router.push("/customer/rewards");
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-accent/60 to-transparent" aria-hidden />
      <header className="relative flex items-center justify-between px-5 py-5 sm:px-8">
        <Logo size={30} />
        <Button variant="ghost" size="sm" onClick={finish}>Skip</Button>
      </header>

      <main className="relative mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 pb-8 sm:px-8">
        <div className="mb-8 flex gap-1.5" role="progressbar" aria-valuenow={i + 1} aria-valuemin={1} aria-valuemax={steps.length}>
          {steps.map((_, idx) => (
            <span
              key={idx}
              className={cn("h-1 flex-1 rounded-full transition-colors duration-300", idx <= i ? "bg-primary" : "bg-muted")}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="size-6" aria-hidden />
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-[28px]">{step.title}</h1>
            <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">{step.body}</p>

            {i === 1 && (
              <div className="mt-6 overflow-hidden rounded-2xl border bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-lg">
                <p className="text-xs uppercase tracking-[0.14em] text-white/60">Your balance</p>
                <p className="mt-1 text-4xl font-semibold tabular">{formatNumber(customer.points)}</p>
                <p className="mt-0.5 text-sm text-white/70">points · worth about ₹{Math.round(customer.points * 0.1)}</p>
              </div>
            )}

            {i === 3 && (
              <div className="mt-6 flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm">
                <div className="size-24 shrink-0 overflow-hidden rounded-xl border bg-white p-2">
                  <QRCode value={customer.membershipId} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{customer.name}</p>
                  <p className="text-sm text-muted-foreground">Member ID {customer.membershipId}</p>
                  <p className="mt-2 text-[13px] text-muted-foreground">Show this QR at checkout.</p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-9 flex items-center gap-3">
          {i > 0 && (
            <Button variant="outline" size="lg" onClick={() => setI((v) => v - 1)}>
              Back
            </Button>
          )}
          <Button
            size="lg"
            className="flex-1"
            onClick={() => (i === steps.length - 1 ? finish() : setI((v) => v + 1))}
          >
            {i === steps.length - 1 ? "Explore Rewards" : "Continue"} <ArrowRight />
          </Button>
        </div>
      </main>
    </div>
  );
}
