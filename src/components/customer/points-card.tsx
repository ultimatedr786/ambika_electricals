"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ChevronRight, Info, TrendingUp } from "lucide-react";
import {
  Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PointsTrendChart } from "@/components/charts";
import { TierBadge } from "@/components/shared/tier-badge";
import { tierProgress, pointsToRupees } from "@/lib/points";
import { business } from "@/lib/mock-data/business";
import { formatNumber } from "@/lib/utils";
import { useStore } from "@/lib/store";
import type { Customer } from "@/types";

function useCountUp(value: number, duration = 700) {
  const [display, setDisplay] = React.useState(value);
  const prev = React.useRef(value);
  React.useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

export function PointsCard({ customer }: { customer: Customer }) {
  const [open, setOpen] = React.useState(false);
  const { state } = useStore();
  const progress = tierProgress(customer.lifetimePoints);
  const shown = useCountUp(customer.points);

  const monthStart = new Date();
  monthStart.setDate(1);
  const mine = state.transactions.filter((t) => t.customerId === customer.id);
  const earnedThisMonth = mine
    .filter((t) => t.points > 0 && new Date(t.date) >= monthStart)
    .reduce((s, t) => s + t.points, 0);
  const redeemedThisMonth = mine
    .filter((t) => t.points < 0 && new Date(t.date) >= monthStart)
    .reduce((s, t) => s + Math.abs(t.points), 0);

  const chart = React.useMemo(() => {
    const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
    let running = Math.max(400, customer.points - 1400);
    return months.map((m, i) => {
      running += 180 + ((i * 137) % 320);
      return { month: m, points: i === months.length - 1 ? customer.points : running };
    });
  }, [customer.points]);

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        whileTap={{ scale: 0.995 }}
        className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-5 text-left text-white shadow-lg shadow-brand-900/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-6"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/10 blur-2xl transition-transform duration-700 group-hover:scale-110"
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 grid-lines opacity-[0.08]" aria-hidden />

        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/60">Points balance</p>
            <p className="mt-1.5 text-[40px] font-semibold leading-none tabular sm:text-5xl">{formatNumber(shown)}</p>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-white/70">
              Worth about ₹{formatNumber(pointsToRupees(customer.points))}
              <span className="text-white/50" aria-hidden><Info className="size-3.5" /></span>
            </p>
          </div>
          <TierBadge tier={customer.tier} className="bg-white/15 text-white" />
        </div>

        <div className="relative mt-5">
          <div className="mb-1.5 flex items-center justify-between text-[13px]">
            <span className="text-white/70">
              {progress.next ? `${formatNumber(progress.pointsToNext)} points to ${progress.next.name}` : "Top tier reached"}
            </span>
            <span className="font-medium text-white/90">{progress.percent}%</span>
          </div>
          <Progress
            value={progress.percent}
            className="h-1.5 bg-white/15"
            indicatorClassName="bg-gradient-to-r from-volt-400 to-volt-300"
          />
        </div>

        <span className="relative mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-white/80">
          View points details <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </motion.button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="lg:max-w-lg lg:mx-auto lg:rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Your points</SheetTitle>
            <SheetDescription>How your Ambika Electricals balance has moved.</SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-5 pb-8">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Current points" value={formatNumber(customer.points)} />
              <Stat label="Lifetime points" value={formatNumber(customer.lifetimePoints)} />
              <Stat label="Earned this month" value={`+${formatNumber(earnedThisMonth)}`} tone="success" />
              <Stat label="Redeemed this month" value={`−${formatNumber(redeemedThisMonth)}`} tone="muted" />
            </div>

            <div className="rounded-xl border p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <TrendingUp className="size-4 text-primary" /> Balance trend
              </div>
              <div className="h-36">
                <PointsTrendChart data={chart} />
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl bg-muted/60 p-3.5 text-[13px] text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="mt-0.5 size-4 shrink-0" />
                </TooltipTrigger>
                <TooltipContent>Reward value depends on the offer.</TooltipContent>
              </Tooltip>
              <span>
                Points are worth roughly ₹0.10 each when used on discounts. Product rewards and member pricing can be
                worth more — reward value depends on the offer.
              </span>
            </div>

            <div className="rounded-xl border p-4">
              <p className="text-sm font-medium">
                {business.pointsExpiryDays === null
                  ? "Your points never expire"
                  : `Your points expire after ${business.pointsExpiryDays} days`}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {business.pointsExpiryDays === null
                  ? "Points stay in your account for as long as it's active — there are no use-it-or-lose-it deadlines."
                  : "Check your activity for the earliest expiring points."}{" "}
                (Redeemed reward vouchers do carry a short pickup window, shown on each voucher.)
              </p>
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "muted" }) {
  return (
    <div className="rounded-xl border p-3.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          "mt-1 text-lg font-semibold tabular " +
          (tone === "success" ? "text-success" : tone === "muted" ? "text-muted-foreground" : "")
        }
      >
        {value}
      </p>
    </div>
  );
}
