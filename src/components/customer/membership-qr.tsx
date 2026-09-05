"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { QrCode, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { QRCode } from "@/components/shared/qr-code";
import { TierBadge } from "@/components/shared/tier-badge";
import { LogoMark } from "@/components/shared/logo";
import { formatNumber } from "@/lib/utils";
import type { Customer } from "@/types";

export function MembershipCard({ customer }: { customer: Customer }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-lg">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-[0.06]" aria-hidden />
      <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-brand-500/25 blur-3xl" aria-hidden />
      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <div>
            <p className="text-sm font-semibold leading-tight">Ambika Electricals</p>
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/50">Rewards Member</p>
          </div>
        </div>
        <TierBadge tier={customer.tier} className="bg-white/12 text-white" />
      </div>

      <div className="relative mt-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{customer.name}</p>
          <p className="mt-0.5 text-sm tabular text-white/60">Member ID · {customer.membershipId}</p>
          <p className="mt-3 text-2xl font-semibold tabular">{formatNumber(customer.points)}<span className="ml-1.5 text-sm font-normal text-white/60">points</span></p>
        </div>
        <div className="size-[76px] shrink-0 rounded-lg bg-white p-1.5">
          <QRCode value={customer.membershipId} />
        </div>
      </div>
    </div>
  );
}

export function ShowQRSheet({
  customer,
  trigger,
}: {
  customer: Customer;
  trigger?: React.ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button size="lg" className="w-full">
            <QrCode /> Show QR
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="bottom" className="lg:mx-auto lg:max-w-md lg:rounded-t-2xl">
        <SheetTitle className="sr-only">Membership QR code</SheetTitle>
        <div className="flex flex-col items-center px-6 pb-10 pt-6 text-center">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Sparkles className="size-4 text-primary" /> Show this QR at checkout
          </div>
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 rounded-2xl border bg-white p-4 shadow-sm"
          >
            <div className="size-56 sm:size-64">
              <QRCode value={`AMBIKA|${customer.membershipId}`} size={29} />
            </div>
          </motion.div>
          <p className="mt-5 text-lg font-semibold">{customer.name}</p>
          <p className="text-sm tabular text-muted-foreground">{customer.membershipId}</p>
          <div className="mt-3 flex items-center gap-2">
            <TierBadge tier={customer.tier} />
            <span className="text-sm tabular text-muted-foreground">{formatNumber(customer.points)} points</span>
          </div>
          <p className="mt-6 max-w-xs text-xs text-muted-foreground">
            Mock QR for demonstration. No personal or payment information is encoded.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
