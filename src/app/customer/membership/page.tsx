"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { MembershipCard, ShowQRSheet } from "@/components/customer/membership-qr";
import { LiveMembershipQr } from "@/components/customer/live-membership-qr";
import { TierBadge } from "@/components/shared/tier-badge";
import { useCurrentCustomer } from "@/lib/store";
import { tiers } from "@/lib/mock-data/business";
import { tierProgress } from "@/lib/points";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { createClient } from "@/lib/supabase/client";

function useLiveMembershipStats() {
  const configured = isSupabaseConfigured();
  const supabase = React.useMemo(() => createClient(), []);
  const [stats, setStats] = React.useState<{
    lifetimePoints: number; memberSince: string; purchases: number; store: string;
  } | null>(null);
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
      const { data: mem } = await supabase
        .from("customer_memberships")
        .select("id, enrolled_at, stores(name)")
        .eq("profile_id", user.id)
        .eq("status", "active")
        .order("enrolled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const m = mem as unknown as { id: string; enrolled_at: string; stores: { name: string } | null } | null;
      if (!m) {
        if (!cancelled) setLoading(false);
        return;
      }
      const [balRes, salesRes] = await Promise.all([
        supabase.from("customer_points_balance").select("lifetime_earned").eq("customer_membership_id", m.id).maybeSingle(),
        supabase.from("sales").select("id", { count: "exact", head: true }).eq("customer_membership_id", m.id).eq("status", "completed"),
      ]);
      if (cancelled) return;
      setStats({
        lifetimePoints: Number((balRes.data as { lifetime_earned: number } | null)?.lifetime_earned ?? 0),
        memberSince: m.enrolled_at,
        purchases: salesRes.count ?? 0,
        store: m.stores?.name ?? "—",
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, supabase]);

  return { configured, stats, loading };
}

export default function MembershipPage() {
  const customer = useCurrentCustomer();
  const live = useLiveMembershipStats();
  const configured = live.configured;
  const lifetimePoints = configured ? live.stats?.lifetimePoints ?? 0 : customer.lifetimePoints;
  const progress = tierProgress(lifetimePoints);

  return (
    <div className="space-y-5 flex-1 min-h-0 overflow-y-auto scroll-region pb-6 pr-1">
      <PageHeader title="Membership" description="Your Ambika Electricals loyalty card and tier benefits." />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <LiveMembershipQr />
          {!configured && (
            <>
              <MembershipCard customer={customer} />
              <ShowQRSheet customer={customer} />
            </>
          )}
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Current tier</p>
              <div className="mt-1"><TierBadge tier={progress.current.name} /></div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Lifetime points</p>
              <p className="text-lg font-semibold tabular">{formatNumber(lifetimePoints)}</p>
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-1.5 flex justify-between text-[13px]">
              <span className="text-muted-foreground">
                {progress.next ? `${formatNumber(progress.pointsToNext)} points to ${progress.next.name}` : "You're at the top tier"}
              </span>
              <span className="font-medium tabular">{progress.percent}%</span>
            </div>
            <Progress value={progress.percent} />
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Member since</dt><dd className="font-medium">{formatDate(configured ? live.stats?.memberSince ?? new Date().toISOString() : customer.memberSince, "long")}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Purchases</dt><dd className="font-medium tabular">{configured ? live.stats?.purchases ?? 0 : customer.purchases}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Home store</dt><dd className="font-medium">{configured ? live.stats?.store ?? "—" : customer.store}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Points multiplier</dt><dd className="font-medium">{progress.current.multiplier}x</dd></div>
          </dl>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Tier benefits</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tiers.map((t) => {
            const current = t.name === progress.current.name;
            return (
              <Card key={t.name} className={cn("p-4", current && "border-primary ring-1 ring-primary")}>
                <div className="flex items-center justify-between">
                  <TierBadge tier={t.name} />
                  {current && <Badge>Current</Badge>}
                </div>
                <p className="mt-2.5 text-sm tabular text-muted-foreground">
                  {formatNumber(t.min)}{t.max ? `–${formatNumber(t.max)}` : "+"} lifetime points
                </p>
                <p className="mt-1 text-sm font-semibold">{t.multiplier}x points</p>
                <ul className="mt-3 space-y-1.5">
                  {t.benefits.map((b) => (
                    <li key={b} className="flex gap-2 text-[13px] text-muted-foreground">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" />{b}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
