"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight, BadgePercent, Gift, Package, Plus, QrCode, ShoppingCart, TrendingUp, Users, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatCard } from "@/components/shared/stat-card";
import { StatsSkeleton } from "@/components/shared/loading-skeleton";
import { PointsBarChart, RevenueAreaChart, TierPieChart } from "@/components/charts";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { categoryMix, tierDistribution, topProducts, topRewards } from "@/lib/mock-data/analytics";
import { formatDate, formatINR, formatNumber, initials } from "@/lib/utils";

const PIE = ["#3182f6", "#59a5ff", "#8ec6ff", "#f5b409", "#ffcf3f", "#8e9bab", "#c3ccd8"];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function BusinessDashboard() {
  const { state, hydrated } = useStore();
  const { analyticsService } = useServices();
  const stats = analyticsService.getDashboard();
  const series = analyticsService.getSeries("30d");
  const recent = state.sales.slice(0, 6);

  const pointsSeries = React.useMemo(
    () => analyticsService.getSeries("7d").map((d) => ({ label: d.label, issued: d.issued, redeemed: d.redeemed })),
    [analyticsService]
  );

  if (!hydrated) {
    return <div className="space-y-5"><StatsSkeleton count={6} /><div className="h-72 animate-pulse rounded-xl bg-muted" /></div>;
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()} 👋</p>
          <h1 className="text-2xl font-semibold tracking-tight">Ambika Electricals</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Main Store · Surat, Gujarat</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/business/sales/new"><QrCode /> Scan QR</Link></Button>
          <Button asChild><Link href="/business/sales/new"><Plus /> New Sale</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard index={0} label="Today's Sales" value={formatINR(stats.todayRevenue)} delta={12.4} icon={ShoppingCart} hint={`${stats.todayOrders} invoices`} />
        <StatCard index={1} label="Monthly Revenue" value={formatINR(stats.monthlyRevenue, { compact: true })} delta={8.1} icon={TrendingUp} hint="vs last month" />
        <StatCard index={2} label="Customers" value={formatNumber(stats.customers)} delta={4.6} icon={Users} hint="total members" />
        <StatCard index={3} label="Repeat Rate" value={`${stats.repeatRate}%`} delta={2.2} icon={Zap} hint="returning buyers" />
        <StatCard index={4} label="Points Issued" value={formatNumber(stats.pointsIssued)} delta={9.8} icon={BadgePercent} hint="this month" />
        <StatCard index={5} label="Points Redeemed" value={formatNumber(stats.pointsRedeemed)} delta={-3.4} icon={Gift} hint="this month" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        {/* Revenue */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Revenue</CardTitle>
              <p className="text-sm text-muted-foreground">Last 30 days</p>
            </div>
            <Button asChild variant="ghost" size="sm"><Link href="/business/analytics">Analytics <ArrowRight /></Link></Button>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <RevenueAreaChart data={series} />
            </div>
          </CardContent>
        </Card>

        {/* Points issued vs redeemed */}
        <Card>
          <CardHeader><CardTitle className="text-base">Points issued vs redeemed</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <PointsBarChart data={pointsSeries} compact />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {/* Recent sales */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent sales</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link href="/business/sales">View all</Link></Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {recent.map((s) => (
              <Link
                key={s.id}
                href="/business/sales"
                className="flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-accent/50"
              >
                <Avatar className="size-9"><AvatarFallback>{initials(s.customerName)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.customerName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.invoice} · {s.items.length} products · {formatDate(s.date)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular">{formatINR(s.amount)}</p>
                  <p className="text-xs tabular text-success">+{formatNumber(s.points)} pts</p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Tier distribution */}
        <Card>
          <CardHeader><CardTitle className="text-base">Customer tiers</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[190px]">
              <TierPieChart data={tierDistribution} palette={PIE} />
            </div>
            <div className="mt-2 space-y-1.5">
              {tierDistribution.map((t, i) => (
                <div key={t.tier} className="flex items-center gap-2 text-[13px]">
                  <span className="size-2.5 rounded-sm" style={{ background: PIE[i] }} />
                  <span className="flex-1">{t.tier}</span>
                  <span className="tabular text-muted-foreground">{formatNumber(t.customers)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Top products */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Top electrical products</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link href="/business/products"><Package /> Manage</Link></Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {topProducts.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3 rounded-lg px-1 py-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs tabular text-muted-foreground">{formatNumber(p.units)} units · {formatNumber(p.sales)} sales · {formatNumber(p.points)} pts issued</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular">{formatINR(p.revenue, { compact: true })}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Category mix */}
        <Card>
          <CardHeader><CardTitle className="text-base">Category mix</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {categoryMix.map((c, i) => (
              <div key={c.category}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span>{c.category}</span>
                  <span className="tabular text-muted-foreground">{c.share}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${c.share * 3.4}%` }}
                    transition={{ duration: 0.6, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full"
                    style={{ background: PIE[i % PIE.length] }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Top rewards */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Top rewards</CardTitle>
          <Button asChild variant="ghost" size="sm"><Link href="/business/rewards"><Gift /> Manage rewards</Link></Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {topRewards.map((r) => (
              <div key={r.name} className="rounded-xl border p-3.5">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular text-muted-foreground">
                  <span>{formatNumber(r.redemptions)} redemptions</span>
                  <span>{formatNumber(r.customers)} customers</span>
                </div>
                <Badge variant="secondary" className="mt-2">{formatNumber(r.points)} pts consumed</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
