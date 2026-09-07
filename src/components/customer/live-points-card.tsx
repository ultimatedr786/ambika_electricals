"use client";

import * as React from "react";
import { BadgeCheck, Gift, Receipt, SlidersHorizontal, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TierBadge } from "@/components/shared/tier-badge";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { tierProgress } from "@/lib/points";
import { formatNumber, relativeTime } from "@/lib/utils";

/**
 * Live points card (Step 3 Slices 1–2) — real Supabase loyalty data for the
 * signed-in customer, rendered above the prototype dashboard widgets.
 *
 * Everything comes straight from RLS-filtered reads: `customer_memberships`
 * rows linked to the viewer's profile, the `customer_points_balance` cache
 * for display and the append-only `points_ledger` for history.
 *
 * The earning policy shown here is read from the versioned rule engine
 * (Slice 6), not hard-coded — customers may see the version in force right
 * now, never the history of what the business used to pay out.
 */

interface LedgerEntry {
  id: number;
  entryType: "earn" | "redeem" | "adjust" | "expiry";
  points: number;
  sourceType: string;
  reason: string | null;
  createdAt: string;
}

interface LoyaltyRule {
  version: number;
  earnSpendPaise: number;
  earnPoints: number;
  pointValuePaise: number;
  minSpendPaise: number;
  pointsExpiryDays: number | null;
}

interface LiveMembership {
  id: string;
  businessId: string;
  businessName: string;
  membershipNo: string;
  balance: { current: number; earned: number; redeemed: number } | null;
  entries: LedgerEntry[];
  rule: LoyaltyRule | null;
}

const rupees = (paise: number) =>
  (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** How the launch policy reads when a business somehow has no rule row yet. */
function describeRule(rule: LoyaltyRule | null): string {
  if (!rule) return "Earning policy unavailable right now";
  const expiry =
    rule.pointsExpiryDays === null ? "no expiry" : `points expire after ${rule.pointsExpiryDays} days`;
  const min = rule.minSpendPaise > 0 ? ` · min spend ₹${rupees(rule.minSpendPaise)}` : "";
  return `₹${rupees(rule.earnSpendPaise)} → ${rule.earnPoints} pts · 1 pt = ₹${rupees(rule.pointValuePaise)} · ${expiry}${min}`;
}

const SOURCE_LABEL: Record<string, string> = {
  sale: "Purchase",
  redemption: "Reward redemption",
  manual: "Store adjustment",
  welcome: "Welcome bonus",
  referral: "Referral bonus",
  birthday: "Birthday bonus",
  campaign: "Campaign",
  adjustment: "Adjustment",
  import: "Imported balance",
};

export function LivePointsCard() {
  const supabase = React.useMemo(() => createClient(), []);
  const configured = isSupabaseConfigured();

  const [loading, setLoading] = React.useState(true);
  const [memberships, setMemberships] = React.useState<LiveMembership[]>([]);

  const reload = React.useCallback(async () => {
    if (!configured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Only rows linked to this exact profile — the directory policy also
      // exposes walk-in memberships of staff-visible businesses.
      const { data: memRes } = await supabase
        .from("customer_memberships")
        .select("id, business_id, membership_no")
        .eq("profile_id", user.id)
        .eq("status", "active")
        .order("enrolled_at", { ascending: false });
      const mems = (memRes ?? []) as { id: string; business_id: string; membership_no: string }[];
      if (mems.length === 0) {
        setMemberships([]);
        return;
      }

      const memIds = mems.map((m) => m.id);
      const businessIds = [...new Set(mems.map((m) => m.business_id))];
      const [balRes, ledgerRes, bizRes, ruleRes] = await Promise.all([
        supabase
          .from("customer_points_balance")
          .select("customer_membership_id, current_points, lifetime_earned, lifetime_redeemed")
          .in("customer_membership_id", memIds),
        supabase
          .from("points_ledger")
          .select("id, customer_membership_id, entry_type, points, source_type, reason, created_at")
          .in("customer_membership_id", memIds)
          .order("id", { ascending: false })
          .limit(12),
        supabase.from("businesses").select("id, name").in("id", businessIds),
        // RLS returns only the version in force right now for these businesses.
        supabase
          .from("loyalty_rule_versions")
          .select(
            "business_id, version, earn_spend_paise, earn_points, point_value_paise, min_spend_paise, points_expiry_days"
          )
          .in("business_id", businessIds),
      ]);

      const balances = new Map(
        ((balRes.data ?? []) as {
          customer_membership_id: string; current_points: number;
          lifetime_earned: number; lifetime_redeemed: number;
        }[]).map((b) => [b.customer_membership_id, b])
      );
      const bizNames = new Map(
        ((bizRes.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name])
      );
      const rules = new Map<string, LoyaltyRule>(
        ((ruleRes.data ?? []) as Record<string, unknown>[]).map((r) => [
          String(r.business_id),
          {
            version: Number(r.version),
            earnSpendPaise: Number(r.earn_spend_paise),
            earnPoints: Number(r.earn_points),
            pointValuePaise: Number(r.point_value_paise),
            minSpendPaise: Number(r.min_spend_paise),
            pointsExpiryDays: r.points_expiry_days == null ? null : Number(r.points_expiry_days),
          },
        ])
      );
      const entriesByMember = new Map<string, LedgerEntry[]>();
      for (const e of ((ledgerRes.data ?? []) as {
        id: number; customer_membership_id: string; entry_type: LedgerEntry["entryType"];
        points: number; source_type: string; reason: string | null; created_at: string;
      }[])) {
        const list = entriesByMember.get(e.customer_membership_id) ?? [];
        if (list.length < 5) {
          list.push({
            id: e.id, entryType: e.entry_type, points: Number(e.points),
            sourceType: e.source_type, reason: e.reason, createdAt: e.created_at,
          });
        }
        entriesByMember.set(e.customer_membership_id, list);
      }

      setMemberships(
        mems.map((m) => {
          const b = balances.get(m.id);
          return {
            id: m.id,
            businessId: m.business_id,
            businessName: bizNames.get(m.business_id) ?? "Your business",
            membershipNo: m.membership_no,
            balance: b
              ? {
                  current: Number(b.current_points),
                  earned: Number(b.lifetime_earned),
                  redeemed: Number(b.lifetime_redeemed),
                }
              : null,
            entries: entriesByMember.get(m.id) ?? [],
            rule: rules.get(m.business_id) ?? null,
          };
        })
      );
    } finally {
      setLoading(false);
    }
  }, [configured, supabase]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  if (!configured) return null;
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          Loading live points…
        </CardContent>
      </Card>
    );
  }
  if (memberships.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BadgeCheck className="size-4.5" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Membership</h2>
            <p className="text-xs text-muted-foreground">
              No membership linked to your account yet — ask staff to enrol you at checkout and your
              real balance will appear here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {memberships.map((m) => {
        const current = m.balance?.current ?? 0;
        const earned = m.balance?.earned ?? 0;
        const pointValue = m.rule?.pointValuePaise ?? 10;
        const progress = tierProgress(earned);
        return (
        <div key={m.id} className="space-y-4">
          <div className="group relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900 via-slate-950 to-black p-5 text-white shadow-lg transition-shadow duration-300 hover:shadow-xl hover:shadow-amber-500/10 sm:p-6">
            <div
              className="pointer-events-none absolute -bottom-14 -left-14 size-52 rounded-full bg-amber-400/0 blur-3xl transition-colors duration-500 group-hover:bg-amber-400/25"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
              aria-hidden
            />

            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/60">Available points</p>
                <p className="mt-1.5 text-[40px] font-semibold leading-none tabular sm:text-5xl">
                  {formatNumber(current)}<span className="ml-1.5 text-base font-normal text-white/60">pts</span>
                </p>
                <p className="mt-2 text-sm text-white/70">
                  Worth ₹{rupees(current * pointValue)} in electrical rewards
                </p>
              </div>
              <TierBadge tier={progress.current.name} className="bg-white/15 text-white" />
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
                indicatorClassName="bg-gradient-to-r from-amber-400 to-amber-300"
              />
            </div>

            <p className="relative mt-4 text-xs text-white/50">
              {m.businessName} · {m.membershipNo}
            </p>
          </div>

          <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/40 p-3 text-center">
                <p className="flex items-center justify-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <TrendingUp className="size-3" aria-hidden /> Lifetime earned
                </p>
                <p className="text-xl font-semibold">{earned}</p>
              </div>
              <div className="rounded-xl bg-muted/40 p-3 text-center">
                <p className="flex items-center justify-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Gift className="size-3" aria-hidden /> Redeemed
                </p>
                <p className="text-xl font-semibold">{m.balance?.redeemed ?? 0}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{describeRule(m.rule)}</p>

            {m.entries.length > 0 && (
              <ul className="divide-y rounded-xl border">
                {m.entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                    <span
                      className={
                        e.entryType === "earn"
                          ? "flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "flex size-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive"
                      }
                    >
                      {e.entryType === "earn" ? (
                        <Receipt className="size-3.5" aria-hidden />
                      ) : (
                        <SlidersHorizontal className="size-3.5" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {SOURCE_LABEL[e.sourceType] ?? e.sourceType}
                        {e.reason && <span className="font-normal text-muted-foreground"> — {e.reason}</span>}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">{relativeTime(e.createdAt)}</span>
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        e.points >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                      }`}
                    >
                      {e.points >= 0 ? `+${e.points}` : e.points} pts
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          </Card>
        </div>
        );
      })}
    </div>
  );
}
