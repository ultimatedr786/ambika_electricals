"use client";

import * as React from "react";
import { BadgeCheck, Gift, Receipt, Sparkles, SlidersHorizontal, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { relativeTime } from "@/lib/utils";

/**
 * Live points card (Step 3 Slices 1–2) — real Supabase loyalty data for the
 * signed-in customer, rendered above the prototype dashboard widgets.
 *
 * Everything comes straight from RLS-filtered reads: `customer_memberships`
 * rows linked to the viewer's profile, the `customer_points_balance` cache
 * for display and the append-only `points_ledger` for history. Launch policy:
 * ₹100 spent → 10 points, 1 point = ₹0.10, no expiry.
 */

interface LedgerEntry {
  id: number;
  entryType: "earn" | "redeem" | "adjust" | "expiry";
  points: number;
  sourceType: string;
  reason: string | null;
  createdAt: string;
}

interface LiveMembership {
  id: string;
  businessId: string;
  businessName: string;
  membershipNo: string;
  balance: { current: number; earned: number; redeemed: number } | null;
  entries: LedgerEntry[];
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
      const [balRes, ledgerRes, bizRes] = await Promise.all([
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
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              Live membership
              <Badge variant="outline" className="gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> Supabase
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">
              No live membership linked to your account yet — ask staff to enrol you at checkout and your
              real balance will appear here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {memberships.map((m) => (
        <Card key={m.id}>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-4" aria-hidden />
              </span>
              Live points
              <Badge variant="outline" className="gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> Supabase
              </Badge>
              <span className="ml-auto font-mono text-xs font-normal text-muted-foreground">{m.membershipNo}</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {m.businessName} · launch policy ₹100 → 10 pts · 1 pt = ₹0.10 · no expiry
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-muted/40 p-3 text-center">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Balance</p>
                <p className="text-xl font-semibold">{m.balance?.current ?? 0} pts</p>
                <p className="text-[11px] text-muted-foreground">≈ ₹{((m.balance?.current ?? 0) / 10).toFixed(2)}</p>
              </div>
              <div className="rounded-xl bg-muted/40 p-3 text-center">
                <p className="flex items-center justify-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <TrendingUp className="size-3" aria-hidden /> Lifetime earned
                </p>
                <p className="text-xl font-semibold">{m.balance?.earned ?? 0}</p>
              </div>
              <div className="rounded-xl bg-muted/40 p-3 text-center">
                <p className="flex items-center justify-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Gift className="size-3" aria-hidden /> Redeemed
                </p>
                <p className="text-xl font-semibold">{m.balance?.redeemed ?? 0}</p>
              </div>
            </div>

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
      ))}
    </div>
  );
}
