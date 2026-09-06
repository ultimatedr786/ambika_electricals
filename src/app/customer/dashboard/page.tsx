"use client";

import type { LucideIcon } from "lucide-react";
import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight, ChevronRight, Gift, QrCode, Receipt, Sparkles, Target, TrendingUp, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PointsCard } from "@/components/customer/points-card";
import { ShowQRSheet } from "@/components/customer/membership-qr";
import { RewardCard } from "@/components/customer/reward-card";
import { ProductArt } from "@/components/shared/product-art";
import { StatsSkeleton } from "@/components/shared/loading-skeleton";
import { useCurrentCustomer, useStore } from "@/lib/store";
import { LivePointsCard } from "@/components/customer/live-points-card";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { meetsTier } from "@/lib/points";
import { cn, formatNumber, relativeTime } from "@/lib/utils";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function CustomerDashboard() {
  const customer = useCurrentCustomer();
  const { state, hydrated } = useStore();

  const activity = state.transactions.filter((t) => t.customerId === customer.id).slice(0, 4);
  const challenge = state.challenges.find((c) => c.status === "Active");
  const campaign = state.campaigns.find((c) => c.status === "Active");

  const picked = React.useMemo(() => {
    const eligible = state.rewards.filter((r) => r.status === "Active" && meetsTier(customer.tier, r.minTier));
    const affordable = eligible.filter((r) => Math.min(...r.options.map((o) => o.points)) <= customer.points);
    const almost = eligible.filter((r) => !affordable.includes(r));
    return [...affordable, ...almost].slice(0, 4);
  }, [state.rewards, customer.tier, customer.points]);

  const featured = picked[0];

  if (!hydrated) {
    return (
      <div className="space-y-5">
        <div className="h-44 animate-pulse rounded-2xl bg-muted" />
        <StatsSkeleton count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Hi {customer.name.split(" ")[0]} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Ambika Electricals · {customer.store}</p>
        </div>
      </header>

      {/* Live Supabase loyalty — renders only when auth is configured */}
      <LivePointsCard />

      {isSupabaseConfigured() && (
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Prototype dashboard</h2>
          <span className="rounded-md border border-dashed px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Demo data
          </span>
        </div>
      )}

      <PointsCard customer={customer} />

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        <ShowQRSheet
          customer={customer}
          trigger={
            <button className="flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-3 text-[13px] font-medium shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <QrCode className="size-[18px]" />
              </span>
              Show QR
            </button>
          }
        />
        <QuickAction href="/customer/rewards" icon={Gift} label="Rewards" />
        <QuickAction href="/customer/activity" icon={Receipt} label="Activity" />
      </div>

      {/* Featured reward */}
      {featured && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card className="overflow-hidden">
            <div className="flex flex-col sm:flex-row">
              <ProductArt art={featured.image} className="h-36 w-full rounded-none sm:h-auto sm:w-48 sm:shrink-0" />
              <div className="flex flex-1 flex-col justify-center p-5">
                <Badge variant="default" className="w-fit"><Sparkles className="size-3" /> Featured reward</Badge>
                <h2 className="mt-2.5 text-lg font-semibold tracking-tight">{featured.name}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{featured.description}</p>
                <div className="mt-3.5 flex flex-wrap items-center gap-3">
                  <span className="text-lg font-semibold tabular text-primary">
                    {formatNumber(Math.min(...featured.options.map((o) => o.points)))}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">points</span>
                  </span>
                  <Button asChild size="sm">
                    <Link href={`/customer/rewards/${featured.id}`}>View reward <ArrowRight /></Link>
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </motion.section>
      )}

      {/* Picked for you */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Rewards picked for you</h2>
            <p className="text-sm text-muted-foreground">Based on your {customer.tier} tier and recent purchases.</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/customer/rewards">View all <ChevronRight /></Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {picked.map((r, i) => (
            <RewardCard key={r.id} reward={r} points={customer.points} tier={customer.tier} index={i} compact />
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Recent activity */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent activity</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link href="/customer/activity">All</Link></Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {activity.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-lg px-1 py-2.5">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    t.points > 0 ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                  )}
                >
                  {t.type === "bonus" ? <Sparkles className="size-4" /> : t.points > 0 ? <Zap className="size-4" /> : <Gift className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{relativeTime(t.date)}</p>
                </div>
                <span className={cn("shrink-0 text-sm font-semibold tabular", t.points > 0 ? "text-success" : "text-muted-foreground")}>
                  {t.points > 0 ? "+" : "−"}{formatNumber(Math.abs(t.points))}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-5">
          {/* Active challenge */}
          {challenge && (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Active challenge</CardTitle>
                <Badge variant="warning"><Target className="size-3" /> {challenge.rewardPoints} pts</Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">{challenge.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{challenge.description}</p>
                <div className="mt-3.5">
                  <div className="mb-1.5 flex justify-between text-[13px]">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium tabular">{challenge.progress} / {challenge.target} {challenge.unit}</span>
                  </div>
                  <Progress value={(challenge.progress / challenge.target) * 100} />
                </div>
                <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                  <Link href="/customer/challenges">View all challenges</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Recommended offer */}
          {campaign && (
            <Card className="border-primary/20 bg-accent/40">
              <CardContent className="flex items-start gap-3.5 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <TrendingUp className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{campaign.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{campaign.description}</p>
                  <p className="mt-2 text-[13px] font-medium text-primary">{campaign.reward} · live now</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-3 text-[13px] font-medium shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]"
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-[18px]" />
      </span>
      {label}
    </Link>
  );
}
