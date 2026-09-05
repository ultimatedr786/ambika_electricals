"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Gift, QrCode, Zap } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { AuthArtwork } from "@/components/shared/auth-artwork";

const highlights = [
  { icon: Zap, title: "Earn on every purchase", body: "10 points for every ₹100 of lighting, wiring and fittings." },
  { icon: QrCode, title: "One QR at the counter", body: "Show your membership QR — staff apply points instantly." },
  { icon: Gift, title: "Redeem how you like", body: "Points, points + cash, or member-only pricing." },
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
    <div className="relative min-h-[100dvh] lg:grid lg:grid-cols-[1fr_minmax(0,540px)] xl:grid-cols-[1.1fr_minmax(0,560px)]">
      {/* ------------------------------------------------ Visual panel (lg+) */}
      <aside className="relative hidden overflow-hidden bg-[#060b16] text-white lg:block">
        <AuthArtwork className="absolute inset-0" />

        {/* Scrim: keeps every word on this panel legible over the artwork */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-[#04070e] via-[#04070e]/88 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#04070e]/80 to-transparent"
          aria-hidden
        />

        <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2.5 rounded-lg focus-visible:ring-offset-[#060b16]"
          >
            <Logo showTagline={false} className="[&_span]:text-white" />
            <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-white/70">
              Rewardly
            </span>
          </Link>

          <div className="max-w-[26rem]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300/70">
              Electrical Rewards Network
            </p>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="mt-3 text-[30px] font-semibold leading-[1.16] tracking-tight xl:text-[34px]"
            >
              Every switch, bulb and coil earns something back.
            </motion.h2>

            <ul className="mt-8 space-y-3.5">
              {highlights.map((h, i) => (
                <motion.li
                  key={h.title}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.08 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  className="flex gap-3.5"
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-sky-300 backdrop-blur">
                    <h.icon className="size-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{h.title}</span>
                    <span className="block text-sm leading-relaxed text-white/55">{h.body}</span>
                  </span>
                </motion.li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-white/40">Demo prototype · No real payments or accounts</p>
        </div>
      </aside>

      {/* -------------------------------------------------------- Form panel */}
      <main className="relative flex min-h-[100dvh] flex-col bg-background">
        <div className="flex items-center justify-between px-5 pb-1 pt-5 lg:hidden">
          <Logo size={30} />
          <ThemeToggle />
        </div>
        <div className="absolute right-5 top-5 hidden lg:block">
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 pb-10 pt-4 sm:px-8 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[400px]"
          >
            {/* Mobile brand pill — the artwork is desktop-only, this is its stand-in */}
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-muted/60 px-3 py-1 text-xs text-muted-foreground lg:hidden">
              <Zap className="size-3 text-primary" aria-hidden />
              <span>Ambika Electricals Rewards</span>
            </div>

            <header className="mb-7">
              <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[28px]">{headline}</h1>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{subheadline}</p>
            </header>

            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
