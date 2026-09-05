"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import { Gift, QrCode, Sparkles, Zap } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { AuthVisualFallback } from "@/components/shared/auth-visual";

const AuthVisual = dynamic(
  () => import("@/components/shared/auth-visual").then((m) => m.AuthVisual),
  {
    ssr: false,
    loading: () => <AuthVisualFallback className="absolute inset-0" />,
  }
);

const highlights = [
  { icon: Zap, title: "Earn on every purchase", body: "10 points for every ₹100 spent on lighting, wiring and fittings." },
  { icon: QrCode, title: "One QR at the counter", body: "Show your membership QR — staff apply your points instantly." },
  { icon: Gift, title: "Redeem how you like", body: "Points, points + cash, or exclusive member pricing." },
];

export function AuthShell({
  children,
  headline,
  subheadline,
}: {
  children: React.ReactNode;
  headline: string;
  subheadline: string;
}) {
  return (
    <div className="relative min-h-[100dvh] lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Visual panel (Desktop) */}
      <aside className="relative hidden overflow-hidden bg-slate-950 text-white lg:block">
        <div className="absolute inset-0 grid-lines opacity-[0.07]" aria-hidden />
        <div
          className="absolute -left-24 top-1/3 size-[34rem] rounded-full bg-brand-500/25 blur-[120px] animate-spark-pulse"
          aria-hidden
        />
        <AuthVisual className="absolute inset-0" />
        <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
          <Link href="/" className="inline-flex w-fit items-center gap-2.5 rounded-lg focus-visible:ring-offset-slate-950">
            <Logo showTagline={false} className="[&_span]:text-white" />
            <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-white/70">
              Rewardly
            </span>
          </Link>

          <div className="max-w-md">
            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="text-[32px] font-semibold leading-[1.15] tracking-tight xl:text-[38px]"
            >
              Every switch, bulb and coil earns you something back.
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
              className="mt-3 text-[15px] leading-relaxed text-white/60"
            >
              The loyalty programme built for Ambika Electricals customers, staff and owners.
            </motion.p>

            <ul className="mt-8 space-y-3.5">
              {highlights.map((h, i) => (
                <motion.li
                  key={h.title}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  className="flex gap-3.5"
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-brand-300 backdrop-blur">
                    <h.icon className="size-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{h.title}</span>
                    <span className="block text-sm text-white/50">{h.body}</span>
                  </span>
                </motion.li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-2 text-xs text-white/40">
            <Sparkles className="size-3.5" aria-hidden />
            Demo prototype · No real payments or accounts
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <main className="relative flex min-h-[100dvh] flex-col bg-background">
        <div className="flex items-center justify-between p-5 lg:hidden">
          <Logo size={30} />
          <ThemeToggle />
        </div>
        <div className="absolute right-5 top-5 hidden lg:block">
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 pb-10 pt-2 sm:px-8 lg:px-10">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[420px]"
          >
            {/* Mobile subtle brand pill */}
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-muted/60 px-3 py-1 text-xs text-muted-foreground lg:hidden">
              <Zap className="size-3 text-primary" />
              <span>Ambika Electricals Rewards Network</span>
            </div>

            <div className="mb-6">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{headline}</h1>
              <p className="mt-1.5 text-[15px] text-muted-foreground">{subheadline}</p>
            </div>
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
