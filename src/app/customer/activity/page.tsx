"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Gift, Receipt, Sparkles, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchInput } from "@/components/shared/search-input";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton } from "@/components/shared/loading-skeleton";
import { useCurrentCustomer, useStore } from "@/lib/store";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";

const ranges = [
  { value: "all", label: "All time", days: Infinity },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "365", label: "This year", days: 365 },
];

export default function ActivityPage() {
  const customer = useCurrentCustomer();
  const { state, hydrated } = useStore();
  const [filter, setFilter] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [range, setRange] = React.useState("all");

  const items = React.useMemo(() => {
    const days = ranges.find((r) => r.value === range)?.days ?? Infinity;
    const cutoff = days === Infinity ? 0 : Date.now() - days * 86400000;
    return state.transactions
      .filter((t) => t.customerId === customer.id)
      .filter((t) => new Date(t.date).getTime() >= cutoff)
      .filter((t) => (filter === "all" ? true : t.type === filter))
      .filter((t) => `${t.title} ${t.subtitle ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  }, [state.transactions, customer.id, filter, query, range]);

  const earned = items.filter((t) => t.points > 0).reduce((s, t) => s + t.points, 0);
  const spent = items.filter((t) => t.points < 0).reduce((s, t) => s + Math.abs(t.points), 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Activity" description="Every point you've earned and used at Ambika Electricals." />

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Balance</p>
          <p className="mt-1 text-lg font-semibold tabular sm:text-xl">{formatNumber(customer.points)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Earned</p>
          <p className="mt-1 text-lg font-semibold tabular text-success sm:text-xl">+{formatNumber(earned)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Redeemed</p>
          <p className="mt-1 text-lg font-semibold tabular sm:text-xl">−{formatNumber(spent)}</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Tabs value={filter} onValueChange={setFilter} className="min-w-0">
          <TabsList className="overflow-x-auto no-scrollbar">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="earned">Earned</TabsTrigger>
            <TabsTrigger value="redeemed">Redeemed</TabsTrigger>
            <TabsTrigger value="bonus">Bonus</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[150px]" aria-label="Date range"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ranges.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <SearchInput value={query} onChange={setQuery} placeholder="Search activity" className="min-w-[180px] flex-1" />
      </div>

      {!hydrated ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState icon={Receipt} title="Nothing here yet" description="Your points activity will appear here after your next purchase." />
      ) : (
        <div className="space-y-2">
          {items.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: Math.min(i, 10) * 0.025 }}
            >
              <Card className="flex items-center gap-3.5 p-4">
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-lg",
                    t.type === "bonus" ? "bg-warning/12 text-warning" : t.points > 0 ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                  )}
                >
                  {t.type === "bonus" ? <Sparkles className="size-[18px]" /> : t.points > 0 ? <Zap className="size-[18px]" /> : <Gift className="size-[18px]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  {t.subtitle && <p className="truncate text-[13px] text-muted-foreground">{t.subtitle}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDateTime(t.date)}{t.reference && ` · ${t.reference}`}
                  </p>
                </div>
                <span className={cn("shrink-0 text-[15px] font-semibold tabular", t.points > 0 ? "text-success" : "text-muted-foreground")}>
                  {t.points > 0 ? "+" : "−"}{formatNumber(Math.abs(t.points))}
                </span>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
