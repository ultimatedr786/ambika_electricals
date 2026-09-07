"use client";

import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { motion } from "framer-motion";
import { Download, IndianRupee, Repeat, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { CustomerLineChart, MetricAreaChart, PointsBarChart, TierPieChart } from "@/components/charts";
import { useServices } from "@/lib/services";
import { useStore } from "@/lib/store";
import {
  categoryMix, rangeLabels, tierDistribution, topProducts, topRewards, type RangeKey, type SeriesPoint,
} from "@/lib/mock-data/analytics";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { createClient } from "@/lib/supabase/client";
import { tierProgress } from "@/lib/points";
import { formatINR, formatNumber } from "@/lib/utils";

const PALETTE = ["#3182f6", "#59a5ff", "#8ec6ff", "#f5b409", "#ffcf3f", "#8e9bab", "#c3ccd8"];
const ranges: RangeKey[] = ["today", "7d", "30d", "90d", "year"];

interface Bucket {
  label: string;
  start: number;
  end: number;
}

function buildBuckets(range: RangeKey, now: Date): Bucket[] {
  if (range === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 24 }, (_, h) => {
      const s = new Date(start).setHours(h);
      const e = new Date(start).setHours(h + 1);
      const label = h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;
      return { label, start: s, end: e };
    });
  }
  if (range === "7d") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    return Array.from({ length: 7 }, (_, i) => {
      const s = new Date(start);
      s.setDate(start.getDate() + i);
      const e = new Date(s);
      e.setDate(s.getDate() + 1);
      return { label: s.toLocaleDateString("en-US", { weekday: "short" }), start: s.getTime(), end: e.getTime() };
    });
  }
  if (range === "30d") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 29);
    return Array.from({ length: 30 }, (_, i) => {
      const s = new Date(start);
      s.setDate(start.getDate() + i);
      const e = new Date(s);
      e.setDate(s.getDate() + 1);
      return { label: String(s.getDate()), start: s.getTime(), end: e.getTime() };
    });
  }
  if (range === "90d") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 90);
    return Array.from({ length: 13 }, (_, i) => {
      const s = new Date(start);
      s.setDate(start.getDate() + i * 7);
      const e = new Date(s);
      e.setDate(s.getDate() + 7);
      return { label: `W${i + 1}`, start: s.getTime(), end: e.getTime() };
    });
  }
  // year
  const y = now.getFullYear();
  return Array.from({ length: 12 }, (_, m) => {
    const s = new Date(y, m, 1);
    const e = new Date(y, m + 1, 1);
    return { label: s.toLocaleDateString("en-US", { month: "short" }), start: s.getTime(), end: e.getTime() };
  });
}

function bucketIndex(buckets: Bucket[], t: number): number {
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (t >= buckets[i].start) return i;
  }
  return 0;
}

interface LiveAnalytics {
  series: SeriesPoint[];
  repeatRate: number;
  activeMembers: number;
  pointsLiabilityPaise: number;
  tierDistribution: { tier: string; customers: number }[];
  categoryMix: { category: string; revenue: number; share: number }[];
  topProducts: { name: string; units: number; revenue: number }[];
  topRewards: { name: string; redemptions: number; points: number }[];
  deltas: { revenuePct: number | undefined; ordersPct: number | undefined; avgPct: number | undefined };
}

function useLiveAnalytics(range: RangeKey) {
  const configured = isSupabaseConfigured();
  const supabase = React.useMemo(() => createClient(), []);
  const [data, setData] = React.useState<LiveAnalytics | null>(null);
  const [loading, setLoading] = React.useState(configured);

  React.useEffect(() => {
    if (!configured || !supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data: me } = await supabase
        .from("business_memberships")
        .select("business_id")
        .eq("profile_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      const bid = (me as { business_id: string } | null)?.business_id ?? null;
      if (!bid) {
        if (!cancelled) setLoading(false);
        return;
      }

      const now = new Date();
      const buckets = buildBuckets(range, now);
      const from = buckets[0].start;
      const to = buckets[buckets.length - 1].end;
      const prevFrom = from - (to - from);

      const [salesRes, ledgerRes, memRes, balRes, redRes, ruleRes] = await Promise.all([
        supabase
          .from("sales")
          .select("id, total_paise, sold_at, customer_membership_id, sale_items(product_id, qty, line_total_paise)")
          .eq("business_id", bid)
          .eq("status", "completed")
          .gte("sold_at", new Date(prevFrom).toISOString())
          .lt("sold_at", new Date(to).toISOString())
          .limit(5000),
        supabase
          .from("points_ledger")
          .select("points, entry_type, created_at")
          .eq("business_id", bid)
          .gte("created_at", new Date(from).toISOString())
          .lt("created_at", new Date(to).toISOString())
          .limit(5000),
        supabase.from("customer_memberships").select("id, enrolled_at").eq("business_id", bid).eq("status", "active").limit(5000),
        supabase.from("customer_points_balance").select("customer_membership_id, current_points, lifetime_earned").eq("business_id", bid).limit(5000),
        supabase
          .from("redemptions")
          .select("points_used, created_at, rewards(name)")
          .eq("business_id", bid)
          .gte("created_at", new Date(from).toISOString())
          .lt("created_at", new Date(to).toISOString())
          .limit(2000),
        supabase.from("loyalty_rule_versions").select("point_value_paise").eq("business_id", bid).maybeSingle(),
      ]);
      if (cancelled) return;

      type SaleRow = {
        id: string; total_paise: number; sold_at: string; customer_membership_id: string | null;
        sale_items: { product_id: string | null; qty: number; line_total_paise: number }[];
      };
      const saleRows = ((salesRes.data ?? []) as unknown as SaleRow[]);
      const currentSales = saleRows.filter((s) => new Date(s.sold_at).getTime() >= from);
      const prevSales = saleRows.filter((s) => {
        const t = new Date(s.sold_at).getTime();
        return t >= prevFrom && t < from;
      });

      // Per-membership purchase counts (repeat rate is period-scoped: real,
      // just not all-time, since all-time would require an unbounded query).
      const salesByMember = new Map<string, number>();
      for (const s of currentSales) {
        const id = s.customer_membership_id;
        if (id) salesByMember.set(id, (salesByMember.get(id) ?? 0) + 1);
      }
      const buyers = salesByMember.size;
      const repeaters = [...salesByMember.values()].filter((n) => n >= 2).length;
      const repeatRate = buyers > 0 ? Math.round((repeaters / buyers) * 1000) / 10 : 0;

      const ledgerRows = (ledgerRes.data ?? []) as { points: number; entry_type: string; created_at: string }[];
      const memRows = (memRes.data ?? []) as { id: string; enrolled_at: string }[];

      const series: SeriesPoint[] = buckets.map((b) => ({
        label: b.label, revenue: 0, customers: 0, issued: 0, redeemed: 0, orders: 0,
      }));
      for (const s of currentSales) {
        const i = bucketIndex(buckets, new Date(s.sold_at).getTime());
        series[i].revenue += Number(s.total_paise) / 100;
        series[i].orders += 1;
      }
      for (const e of ledgerRows) {
        const i = bucketIndex(buckets, new Date(e.created_at).getTime());
        if (e.entry_type === "redeem") series[i].redeemed += Math.abs(Number(e.points));
        else if (Number(e.points) > 0) series[i].issued += Number(e.points);
      }
      for (const m of memRows) {
        const t = new Date(m.enrolled_at).getTime();
        if (t >= from && t < to) series[bucketIndex(buckets, t)].customers += 1;
      }

      // Category mix + top products, from real sale line items.
      const productIds = [...new Set(currentSales.flatMap((s) => s.sale_items ?? []).map((i) => i.product_id).filter((x): x is string => !!x))];
      const { data: prodRes } = productIds.length
        ? await supabase.from("products").select("id, name, category").in("id", productIds)
        : { data: [] };
      const prodMeta = new Map(((prodRes ?? []) as { id: string; name: string; category: string | null }[]).map((p) => [p.id, p]));

      const productAgg = new Map<string, { name: string; units: number; revenue: number }>();
      const categoryAgg = new Map<string, number>();
      let totalLineRevenue = 0;
      for (const s of currentSales) {
        for (const item of s.sale_items ?? []) {
          const revenue = Number(item.line_total_paise) / 100;
          totalLineRevenue += revenue;
          if (item.product_id) {
            const meta = prodMeta.get(item.product_id);
            const key = item.product_id;
            const agg = productAgg.get(key) ?? { name: meta?.name ?? "Product", units: 0, revenue: 0 };
            agg.units += Number(item.qty);
            agg.revenue += revenue;
            productAgg.set(key, agg);
            if (meta?.category) categoryAgg.set(meta.category, (categoryAgg.get(meta.category) ?? 0) + revenue);
          }
        }
      }
      const liveTopProducts = [...productAgg.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6);
      const liveCategoryMix = [...categoryAgg.entries()]
        .map(([category, revenue]) => ({ category, revenue, share: totalLineRevenue > 0 ? Math.round((revenue / totalLineRevenue) * 100) : 0 }))
        .sort((a, b) => b.revenue - a.revenue);

      // Top rewards, from real redemptions.
      const rewardAgg = new Map<string, { name: string; redemptions: number; points: number }>();
      for (const r of ((redRes.data ?? []) as unknown as { points_used: number; rewards: { name?: string } | null }[])) {
        const name = r.rewards?.name ?? "Reward";
        const agg = rewardAgg.get(name) ?? { name, redemptions: 0, points: 0 };
        agg.redemptions += 1;
        agg.points += Number(r.points_used);
        rewardAgg.set(name, agg);
      }
      const liveTopRewards = [...rewardAgg.values()].sort((a, b) => b.redemptions - a.redemptions).slice(0, 6);

      // Tier distribution + points liability, from the real all-time balance.
      const balRows = (balRes.data ?? []) as { customer_membership_id: string; current_points: number; lifetime_earned: number }[];
      const balByMember = new Map(balRows.map((b) => [b.customer_membership_id, b]));
      const tierCounts = new Map<string, number>();
      let outstandingPoints = 0;
      for (const m of memRows) {
        const b = balByMember.get(m.id);
        const tier = tierProgress(Number(b?.lifetime_earned ?? 0)).current.name;
        tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
        outstandingPoints += Number(b?.current_points ?? 0);
      }
      const liveTierDistribution = ["Bronze", "Silver", "Gold", "Platinum"].map((tier) => ({
        tier, customers: tierCounts.get(tier) ?? 0,
      }));
      const pointValuePaise = Number((ruleRes.data as { point_value_paise: number } | null)?.point_value_paise ?? 10);

      // Previous-period deltas — real, comparing two equal-length windows.
      const prevRevenue = prevSales.reduce((s, x) => s + Number(x.total_paise) / 100, 0);
      const curRevenue = currentSales.reduce((s, x) => s + Number(x.total_paise) / 100, 0);
      const pct = (cur: number, prev: number): number | undefined => {
        if (prev <= 0) return undefined;
        return Math.round(((cur - prev) / prev) * 1000) / 10;
      };
      const curOrders = currentSales.length;
      const prevOrders = prevSales.length;
      const curAvg = curOrders ? curRevenue / curOrders : 0;
      const prevAvg = prevOrders ? prevRevenue / prevOrders : 0;

      setData({
        series,
        repeatRate,
        activeMembers: memRows.length,
        pointsLiabilityPaise: Math.round(outstandingPoints * pointValuePaise),
        tierDistribution: liveTierDistribution,
        categoryMix: liveCategoryMix,
        topProducts: liveTopProducts,
        topRewards: liveTopRewards,
        deltas: { revenuePct: pct(curRevenue, prevRevenue), ordersPct: pct(curOrders, prevOrders), avgPct: pct(curAvg, prevAvg) },
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, supabase, range]);

  return { configured, data, loading };
}

export default function AnalyticsPage() {
  const { analyticsService } = useServices();
  const { state } = useStore();
  const [range, setRange] = React.useState<RangeKey>("30d");
  const [metric, setMetric] = React.useState<"revenue" | "orders" | "customers">("revenue");
  const live = useLiveAnalytics(range);
  const configured = live.configured;

  const dash = analyticsService.getDashboard();
  const mockSeries = analyticsService.getSeries(range);
  const series = configured ? live.data?.series ?? [] : mockSeries;

  const totals = (() => {
    const revenue = series.reduce((s, d) => s + d.revenue, 0);
    const orders = series.reduce((s, d) => s + d.orders, 0);
    const issued = series.reduce((s, d) => s + d.issued, 0);
    const redeemed = series.reduce((s, d) => s + d.redeemed, 0);
    return { revenue, orders, issued, redeemed, avg: orders ? Math.round(revenue / orders) : 0 };
  })();

  const liveTierDist = live.data?.tierDistribution ?? [];
  const liveCategoryMix = live.data?.categoryMix ?? [];
  const liveTopProducts = live.data?.topProducts ?? [];
  const liveTopRewards = live.data?.topRewards ?? [];

  const exportCsv = () => {
    const rows = [["Period", "Revenue", "Orders", "Customers", "Points issued", "Points redeemed"], ...series.map((d) => [d.label, d.revenue, d.orders, d.customers, d.issued, d.redeemed])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ambika-analytics-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported", { description: `ambika-analytics-${range}.csv downloaded.` });
  };

  if (configured && live.loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        Loading analytics…
      </div>
    );
  }

  return (
    <div className="space-y-5 flex-1 min-h-0 overflow-y-auto scroll-region pb-6 pr-1">
      <PageHeader
        title="Analytics"
        description="Revenue, loyalty and customer performance across Ambika Electricals."
        actions={
          <>
            <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <SelectTrigger className="w-[140px]" aria-label="Date range"><SelectValue /></SelectTrigger>
              <SelectContent>{ranges.map((r) => <SelectItem key={r} value={r}>{rangeLabels[r]}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCsv}><Download /> Export</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Revenue · ${rangeLabels[range]}`} value={formatINR(totals.revenue)} icon={IndianRupee} delta={configured ? live.data?.deltas.revenuePct : 12.4} hint="vs previous period" />
        <StatCard label="Orders" value={formatNumber(totals.orders)} delta={configured ? live.data?.deltas.ordersPct : 8.1} hint="vs previous period" />
        <StatCard label="Avg. order value" value={formatINR(totals.avg)} delta={configured ? live.data?.deltas.avgPct : 3.6} hint="vs previous period" />
        <StatCard label="Repeat rate" value={`${configured ? live.data?.repeatRate ?? 0 : dash.repeatRate}%`} icon={Repeat} delta={configured ? undefined : 2.2} hint={configured ? "of buyers this period" : "vs previous period"} />
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Performance trend</h2>
            <p className="text-xs text-muted-foreground">{rangeLabels[range]} · {metric}</p>
          </div>
          <Tabs value={metric} onValueChange={(v) => setMetric(v as typeof metric)}>
            <TabsList>
              <TabsTrigger value="revenue">Revenue</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="customers">Customers</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="mt-4 h-[280px]">
          <MetricAreaChart data={series} metric={metric} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Points issued vs redeemed</h2>
          <p className="text-xs text-muted-foreground">
            {formatNumber(totals.issued)} issued · {formatNumber(totals.redeemed)} redeemed ·{" "}
            <span className="text-foreground">{Math.round((totals.redeemed / Math.max(1, totals.issued)) * 100)}% redemption rate</span>
          </p>
          <div className="mt-4 h-[240px]">
            <PointsBarChart data={series} />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Members by tier</h2>
          <div className="mt-2 h-[240px]">
            <TierPieChart data={configured ? liveTierDist : tierDistribution} palette={PALETTE} innerRadius={52} outerRadius={82} />
          </div>
          <div className="space-y-1.5">
            {(configured ? liveTierDist : tierDistribution).map((t, i) => (
              <div key={t.tier} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden />
                  {t.tier}
                </span>
                <span className="tabular text-muted-foreground">{formatNumber(t.customers)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Category mix</h2>
          <p className="text-xs text-muted-foreground">Share of revenue by electrical category</p>
          <div className="mt-4 space-y-2.5">
            {(configured ? liveCategoryMix : categoryMix).length === 0 && configured ? (
              <p className="text-xs text-muted-foreground">No categorised sales in this period yet.</p>
            ) : (
              (configured ? liveCategoryMix : categoryMix).map((c, i) => (
                <div key={c.category}>
                  <div className="flex items-center justify-between text-xs">
                    <span>{c.category}</span>
                    <span className="tabular text-muted-foreground">{c.share}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${c.share}%` }}
                      transition={{ duration: 0.6, delay: i * 0.05 }}
                      className="h-full rounded-full"
                      style={{ background: PALETTE[i % PALETTE.length] }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Customer growth</h2>
          <p className="text-xs text-muted-foreground">New members joining the programme</p>
          <div className="mt-4 h-[220px]">
            <CustomerLineChart data={series} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-3">
            <h2 className="text-sm font-semibold">Top products</h2>
            <Badge variant="secondary">{rangeLabels[range]}</Badge>
          </div>
          {(configured ? liveTopProducts : topProducts).length === 0 && configured ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">No product sales in this period yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(configured ? liveTopProducts : topProducts.slice(0, 6)).map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="text-sm font-medium">{p.name}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{formatNumber(p.units)}</TableCell>
                    <TableCell className="text-right tabular font-medium">{formatINR(p.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-3">
            <h2 className="text-sm font-semibold">Top rewards</h2>
            <Sparkles className="size-4 text-muted-foreground" aria-hidden />
          </div>
          {(configured ? liveTopRewards : topRewards).length === 0 && configured ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">No rewards redeemed in this period yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reward</TableHead>
                  <TableHead className="text-right">Redemptions</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(configured ? liveTopRewards : topRewards.slice(0, 6)).map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="text-sm font-medium">{r.name}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{formatNumber(r.redemptions)}</TableCell>
                    <TableCell className="text-right tabular font-medium">{formatNumber(r.points)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Card className="grid gap-4 p-5 sm:grid-cols-3">
        <Insight icon={Users} label="Active members" value={formatNumber(configured ? live.data?.activeMembers ?? 0 : dash.customers)} note="Enrolled in the programme" />
        <Insight icon={Repeat} label="Repeat purchase rate" value={`${configured ? live.data?.repeatRate ?? 0 : dash.repeatRate}%`} note={configured ? "Buyers with 2+ purchases this period" : "Members with 2+ purchases"} />
        <Insight
          icon={Sparkles}
          label="Points liability"
          value={formatINR(configured ? (live.data?.pointsLiabilityPaise ?? 0) / 100 : Math.round(state.customers.reduce((s, c) => s + c.points, 0) * 0.1))}
          note={configured ? "Outstanding points at the current point value" : "Outstanding points at ₹0.10 each"}
        />
      </Card>
    </div>
  );
}

function Insight({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular">{value}</p>
      <p className="text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}
