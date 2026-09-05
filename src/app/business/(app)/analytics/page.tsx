"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
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
import { useServices } from "@/lib/services";
import { useStore } from "@/lib/store";
import {
  categoryMix, rangeLabels, tierDistribution, topProducts, topRewards, type RangeKey,
} from "@/lib/mock-data/analytics";
import { formatINR, formatNumber } from "@/lib/utils";

const PALETTE = ["#3182f6", "#59a5ff", "#8ec6ff", "#f5b409", "#ffcf3f", "#8e9bab", "#c3ccd8"];
const ranges: RangeKey[] = ["today", "7d", "30d", "90d", "year"];

export default function AnalyticsPage() {
  const { analyticsService } = useServices();
  const { state } = useStore();
  const [range, setRange] = React.useState<RangeKey>("30d");
  const [metric, setMetric] = React.useState<"revenue" | "orders" | "customers">("revenue");

  const dash = analyticsService.getDashboard();
  const series = analyticsService.getSeries(range);

  const totals = React.useMemo(() => {
    const revenue = series.reduce((s, d) => s + d.revenue, 0);
    const orders = series.reduce((s, d) => s + d.orders, 0);
    const issued = series.reduce((s, d) => s + d.issued, 0);
    const redeemed = series.reduce((s, d) => s + d.redeemed, 0);
    return { revenue, orders, issued, redeemed, avg: orders ? Math.round(revenue / orders) : 0 };
  }, [series]);

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

  return (
    <div className="space-y-5">
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
        <StatCard label={`Revenue · ${rangeLabels[range]}`} value={formatINR(totals.revenue)} icon={IndianRupee} delta={12.4} hint="vs previous period" />
        <StatCard label="Orders" value={formatNumber(totals.orders)} delta={8.1} hint="vs previous period" />
        <StatCard label="Avg. order value" value={formatINR(totals.avg)} delta={3.6} hint="vs previous period" />
        <StatCard label="Repeat rate" value={`${dash.repeatRate}%`} icon={Repeat} delta={2.2} hint="vs previous period" />
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
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ left: -12, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="an-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3182f6" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#3182f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" width={60}
                tickFormatter={(v) => (metric === "revenue" ? `₹${Math.round(Number(v) / 1000)}k` : formatNumber(Number(v)))} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", fontSize: 12 }}
                formatter={(v) => [metric === "revenue" ? formatINR(Number(v)) : formatNumber(Number(v)), metric]}
              />
              <Area type="monotone" dataKey={metric} stroke="#3182f6" strokeWidth={2} fill="url(#an-grad)" />
            </AreaChart>
          </ResponsiveContainer>
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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" width={50} tickFormatter={(v) => formatNumber(Number(v))} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", fontSize: 12 }}
                  formatter={(v, n) => [formatNumber(Number(v)), String(n)]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="issued" name="Issued" fill="#3182f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="redeemed" name="Redeemed" fill="#f5b409" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Members by tier</h2>
          <div className="mt-2 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={tierDistribution} dataKey="customers" nameKey="tier" innerRadius={52} outerRadius={82} paddingAngle={2}>
                  {tierDistribution.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", fontSize: 12 }}
                  formatter={(v, n) => [`${formatNumber(Number(v))} members`, String(n)]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5">
            {tierDistribution.map((t, i) => (
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
            {categoryMix.map((c, i) => (
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
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Customer growth</h2>
          <p className="text-xs text-muted-foreground">New members joining the programme</p>
          <div className="mt-4 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ left: -18, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" width={44} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", fontSize: 12 }}
                  formatter={(v) => [`${formatNumber(Number(v))} customers`, "Customers"]}
                />
                <Line type="monotone" dataKey="customers" stroke="#3182f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-3">
            <h2 className="text-sm font-semibold">Top products</h2>
            <Badge variant="secondary">{rangeLabels[range]}</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topProducts.slice(0, 6).map((p) => (
                <TableRow key={p.name}>
                  <TableCell className="text-sm font-medium">{p.name}</TableCell>
                  <TableCell className="text-right tabular text-muted-foreground">{formatNumber(p.units)}</TableCell>
                  <TableCell className="text-right tabular font-medium">{formatINR(p.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-3">
            <h2 className="text-sm font-semibold">Top rewards</h2>
            <Sparkles className="size-4 text-muted-foreground" aria-hidden />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reward</TableHead>
                <TableHead className="text-right">Redemptions</TableHead>
                <TableHead className="text-right">Points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topRewards.slice(0, 6).map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="text-sm font-medium">{r.name}</TableCell>
                  <TableCell className="text-right tabular text-muted-foreground">{formatNumber(r.redemptions)}</TableCell>
                  <TableCell className="text-right tabular font-medium">{formatNumber(r.points)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Card className="grid gap-4 p-5 sm:grid-cols-3">
        <Insight icon={Users} label="Active members" value={formatNumber(dash.customers)} note="Enrolled in the programme" />
        <Insight icon={Repeat} label="Repeat purchase rate" value={`${dash.repeatRate}%`} note="Members with 2+ purchases" />
        <Insight icon={Sparkles} label="Points liability" value={formatINR(Math.round(state.customers.reduce((s, c) => s + c.points, 0) * 0.1))} note="Outstanding points at ₹0.10 each" />
      </Card>
    </div>
  );
}

function Insight({ icon: Icon, label, value, note }: { icon: React.ElementType; label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular">{value}</p>
      <p className="text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}
