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
import { isSupabaseConfigured } from "@/lib/auth/env";
import { createClient } from "@/lib/supabase/client";

const ranges = [
  { value: "all", label: "All time", days: Infinity },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "365", label: "This year", days: 365 },
];

interface LiveActivityItem {
  id: string;
  type: "earned" | "redeemed" | "bonus";
  title: string;
  subtitle: string | null;
  reference: string | null;
  date: string;
  points: number;
}

const BONUS_SOURCES = new Set(["welcome", "referral", "birthday", "campaign"]);
const SOURCE_TITLE: Record<string, string> = {
  sale: "Purchase",
  redemption: "Reward redeemed",
  manual: "Store adjustment",
  welcome: "Welcome bonus",
  referral: "Referral bonus",
  birthday: "Birthday bonus",
  campaign: "Campaign bonus",
  adjustment: "Adjustment",
  import: "Imported balance",
};

function useLiveActivity() {
  const configured = isSupabaseConfigured();
  const supabase = React.useMemo(() => createClient(), []);
  const [items, setItems] = React.useState<LiveActivityItem[]>([]);
  const [balance, setBalance] = React.useState(0);
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
      const { data: memRes } = await supabase
        .from("customer_memberships")
        .select("id")
        .eq("profile_id", user.id)
        .eq("status", "active");
      const memIds = ((memRes ?? []) as { id: string }[]).map((m) => m.id);
      if (memIds.length === 0) {
        if (!cancelled) setLoading(false);
        return;
      }
      const [ledgerRes, balRes] = await Promise.all([
        supabase
          .from("points_ledger")
          .select("id, entry_type, points, source_type, reason, created_at")
          .in("customer_membership_id", memIds)
          .order("id", { ascending: false })
          .limit(200),
        supabase
          .from("customer_points_balance")
          .select("current_points")
          .in("customer_membership_id", memIds),
      ]);
      if (cancelled) return;
      const rows = (ledgerRes.data ?? []) as {
        id: number; entry_type: "earn" | "redeem" | "adjust" | "expiry";
        points: number; source_type: string; reason: string | null; created_at: string;
      }[];
      setItems(
        rows.map((r) => ({
          id: String(r.id),
          type:
            r.entry_type === "redeem" || r.entry_type === "expiry" || r.points < 0
              ? "redeemed"
              : BONUS_SOURCES.has(r.source_type)
              ? "bonus"
              : "earned",
          title: SOURCE_TITLE[r.source_type] ?? r.source_type,
          subtitle: r.reason,
          reference: null,
          date: r.created_at,
          points: r.points,
        }))
      );
      const bal = ((balRes.data ?? []) as { current_points: number }[]).reduce(
        (s, b) => s + Number(b.current_points),
        0
      );
      setBalance(bal);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, supabase]);

  return { configured, items, balance, loading };
}

export default function ActivityPage() {
  const customer = useCurrentCustomer();
  const { state, hydrated } = useStore();
  const live = useLiveActivity();
  const configured = live.configured;
  const [filter, setFilter] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [range, setRange] = React.useState("all");

  const items = React.useMemo(() => {
    const days = ranges.find((r) => r.value === range)?.days ?? Infinity;
    const cutoff = days === Infinity ? 0 : Date.now() - days * 86400000;
    const source = configured ? live.items : state.transactions.filter((t) => t.customerId === customer.id);
    return source
      .filter((t) => new Date(t.date).getTime() >= cutoff)
      .filter((t) => (filter === "all" ? true : t.type === filter))
      .filter((t) => `${t.title} ${t.subtitle ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  }, [configured, live.items, state.transactions, customer.id, filter, query, range]);

  const earned = items.filter((t) => t.points > 0).reduce((s, t) => s + t.points, 0);
  const spent = items.filter((t) => t.points < 0).reduce((s, t) => s + Math.abs(t.points), 0);
  const balance = configured ? live.balance : customer.points;
  const loading = configured ? live.loading : !hydrated;

  return (
    <div className="space-y-4 flex-1 min-h-0 flex flex-col">
      <div className="space-y-4 shrink-0">
        <PageHeader title="Activity" description="Every point you've earned and used at Ambika Electricals." />

        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className="mt-1 text-lg font-semibold tabular sm:text-xl">{formatNumber(balance)}</p>
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
      </div>

      {loading ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState icon={Receipt} title="Nothing here yet" description="Your points activity will appear here after your next purchase." />
      ) : (
        <div className="space-y-2 flex-1 min-h-0 overflow-y-auto scroll-region p-1">
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
