"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Copy, Gift, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FormDialog } from "@/components/shared/form-dialog";
import { ProductArt, type ProductArtKey } from "@/components/shared/product-art";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { formatDate, formatINR, formatNumber } from "@/lib/utils";
import { redeemMyRewardAction, type CustomerRedeemOutcome } from "@/app/customer/redemptions/redemptions-actions";

/**
 * Live rewards store (Step 3 Slice 4) — the real Supabase reward catalogue
 * for the signed-in customer, rendered above the prototype store on
 * /customer/rewards.
 *
 * Everything is RLS-filtered: customers see ACTIVE rewards of businesses
 * where they hold an active membership, and their own balance from the
 * `customer_points_balance` cache. Redeeming runs through `redeem_reward`
 * (self-service, points spent via the append-only ledger); the collection
 * code is shown exactly once — only sha256 + last4 are stored (§8.4).
 */

const TYPE_LABEL: Record<string, string> = {
  discount: "Discount",
  coupon: "Coupon",
  free_product: "Free Product",
  gift: "Gift",
  special_offer: "Special Offer",
};

interface LiveStoreReward {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  rewardType: string;
  category: string | null;
  artKey: string | null;
  pointsCost: number;
  regularPricePaise: number | null;
  expiryDays: number;
  maxPerMonth: number | null;
  terms: string[];
}

interface CustomerBusiness {
  businessId: string;
  businessName: string;
  membershipId: string;
  balance: number;
  rewards: LiveStoreReward[];
}

export function LiveRewardsStore() {
  const supabase = React.useMemo(() => createClient(), []);
  const configured = isSupabaseConfigured();

  const [loading, setLoading] = React.useState(true);
  const [businesses, setBusinesses] = React.useState<CustomerBusiness[]>([]);
  const [redeeming, setRedeeming] = React.useState<LiveStoreReward | null>(null);
  const [issued, setIssued] = React.useState<CustomerRedeemOutcome | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

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

      // Only rows linked to this exact profile (RLS self-query scoping).
      const { data: memRes } = await supabase
        .from("customer_memberships")
        .select("id, business_id")
        .eq("profile_id", user.id)
        .eq("status", "active");
      const mems = (memRes ?? []) as { id: string; business_id: string }[];
      if (mems.length === 0) {
        setBusinesses([]);
        return;
      }

      const businessIds = [...new Set(mems.map((m) => m.business_id))];
      const [balRes, rewardRes, bizRes] = await Promise.all([
        supabase
          .from("customer_points_balance")
          .select("customer_membership_id, current_points")
          .in("customer_membership_id", mems.map((m) => m.id)),
        // RLS: only ACTIVE rewards of businesses where this profile is a member.
        supabase
          .from("rewards")
          .select("id, business_id, name, description, reward_type, category, art_key, points_cost, regular_price_paise, expiry_days, max_per_customer_per_month, terms")
          .in("business_id", businessIds)
          .order("points_cost"),
        supabase.from("businesses").select("id, name").in("id", businessIds),
      ]);

      const balances = new Map(
        ((balRes.data ?? []) as { customer_membership_id: string; current_points: number }[]).map((b) => [
          b.customer_membership_id,
          Number(b.current_points),
        ])
      );
      const bizNames = new Map(((bizRes.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
      const rewardsByBiz = new Map<string, LiveStoreReward[]>();
      for (const r of (rewardRes.data ?? []) as Record<string, unknown>[]) {
        const list = rewardsByBiz.get(String(r.business_id)) ?? [];
        list.push({
          id: String(r.id),
          businessId: String(r.business_id),
          name: String(r.name),
          description: (r.description as string | null) ?? null,
          rewardType: String(r.reward_type),
          category: (r.category as string | null) ?? null,
          artKey: (r.art_key as string | null) ?? null,
          pointsCost: Number(r.points_cost),
          regularPricePaise: r.regular_price_paise == null ? null : Number(r.regular_price_paise),
          expiryDays: Number(r.expiry_days ?? 30),
          maxPerMonth: r.max_per_customer_per_month == null ? null : Number(r.max_per_customer_per_month),
          terms: Array.isArray(r.terms) ? (r.terms as string[]) : [],
        });
        rewardsByBiz.set(String(r.business_id), list);
      }

      setBusinesses(
        mems.map((m) => ({
          businessId: m.business_id,
          businessName: bizNames.get(m.business_id) ?? "Your business",
          membershipId: m.id,
          balance: balances.get(m.id) ?? 0,
          rewards: rewardsByBiz.get(m.business_id) ?? [],
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [configured, supabase]);

  React.useEffect(() => {
    void reload();
  }, [reload, reloadToken]);

  if (!configured) return null;
  if (loading) {
    return (
      <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        Loading live rewards…
      </Card>
    );
  }
  if (businesses.length === 0 || businesses.every((b) => b.rewards.length === 0)) return null;

  return (
    <div className="space-y-4">
      {businesses
        .filter((b) => b.rewards.length > 0)
        .map((b) => (
          <div key={b.membershipId} className="space-y-3">
            <Card className="flex flex-wrap items-center gap-3 bg-gradient-to-r from-accent/70 to-accent/20 p-4">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="size-4.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  Live rewards — {b.businessName}
                  <Badge variant="outline" className="gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> Supabase
                  </Badge>
                </h2>
                <p className="text-xs text-muted-foreground tabular">
                  Your balance: <span className="font-semibold text-foreground">{formatNumber(b.balance)} pts</span>
                  {" "}≈ {formatINR(b.balance / 10)} · 1 pt = ₹0.10 · no expiry
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/customer/redemptions">My redemptions</Link>
              </Button>
            </Card>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {b.rewards.map((r) => {
                const affordable = b.balance >= r.pointsCost;
                return (
                  <Card key={r.id} className="flex h-full flex-col p-3.5">
                    <div className="flex items-start gap-2.5">
                      <ProductArt art={(r.artKey ?? "gift") as ProductArtKey} className="size-12 shrink-0" tone="muted" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug">{r.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {TYPE_LABEL[r.rewardType] ?? r.rewardType}
                          {r.category ? ` · ${r.category}` : ""}
                        </p>
                      </div>
                    </div>
                    {r.description && (
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>
                    )}
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="tabular">{formatNumber(r.pointsCost)} pts</Badge>
                      {r.regularPricePaise != null && r.regularPricePaise > 0 && (
                        <Badge variant="outline" className="tabular">Worth {formatINR(r.regularPricePaise / 100)}</Badge>
                      )}
                      <Badge variant="outline" className="tabular">Collect ≤ {r.expiryDays}d</Badge>
                      {r.maxPerMonth != null && (
                        <Badge variant="outline" className="tabular">{r.maxPerMonth}/month</Badge>
                      )}
                    </div>
                    <div className="mt-auto pt-3">
                      <Button
                        className="w-full"
                        size="sm"
                        variant={affordable ? "default" : "outline"}
                        disabled={!affordable}
                        onClick={() => setRedeeming(r)}
                      >
                        <Gift /> {affordable ? "Redeem now" : `Need ${formatNumber(r.pointsCost - b.balance)} more pts`}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}

      {redeeming && (
        <ConfirmRedeemDialog
          reward={redeeming}
          balance={businesses.find((b) => b.businessId === redeeming.businessId)?.balance ?? 0}
          onClose={() => setRedeeming(null)}
          onIssued={(outcome) => {
            setRedeeming(null);
            setIssued(outcome);
            setReloadToken((t) => t + 1);
          }}
        />
      )}
      {issued && (
        <CodeOnceDialog
          outcome={issued}
          onClose={() => {
            setIssued(null);
            setReloadToken((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}

function ConfirmRedeemDialog({
  reward,
  balance,
  onClose,
  onIssued,
}: {
  reward: LiveStoreReward;
  balance: number;
  onClose: () => void;
  onIssued: (outcome: CustomerRedeemOutcome) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  // One key per opened dialog: a retry after a network blip replays safely
  // instead of double-spending.
  const idemKey = React.useRef<string>(crypto.randomUUID());

  const submit = async () => {
    setBusy(true);
    const res = await redeemMyRewardAction({
      businessId: reward.businessId,
      rewardId: reward.id,
      qty: 1,
      idempotencyKey: idemKey.current,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    onIssued(res.data);
  };

  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Redeem ${reward.name}?`}
      description="Points are spent immediately and held for collection at the store."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Not now</Button>
          <Button onClick={submit} loading={busy}>Spend {formatNumber(reward.pointsCost)} pts</Button>
        </>
      }
    >
      <div className="space-y-2 py-2 text-sm">
        <p className="flex justify-between"><span className="text-muted-foreground">Your balance</span><span className="tabular font-medium">{formatNumber(balance)} pts</span></p>
        <p className="flex justify-between"><span className="text-muted-foreground">This reward</span><span className="tabular font-medium">− {formatNumber(reward.pointsCost)} pts</span></p>
        <Separator />
        <p className="flex justify-between"><span className="text-muted-foreground">Balance after</span><span className="tabular font-semibold">{formatNumber(balance - reward.pointsCost)} pts</span></p>
        {reward.terms.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {reward.terms.map((t) => <li key={t}>{t}</li>)}
          </ul>
        )}
      </div>
    </FormDialog>
  );
}

function CodeOnceDialog({ outcome, onClose }: { outcome: CustomerRedeemOutcome; onClose: () => void }) {
  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Redeemed — ${outcome.reference}`}
      description="Show this code at the store to collect your reward."
      footer={
        <>
          <Button variant="outline" asChild onClick={onClose}>
            <Link href="/customer/redemptions">My redemptions</Link>
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="space-y-3 py-2 text-center">
        {outcome.code ? (
          <>
            <p className="font-mono text-3xl font-semibold tracking-[0.35em]">{outcome.code}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(outcome.code ?? "");
                toast.success("Code copied — keep it safe");
              }}
            >
              <Copy /> Copy code
            </Button>
            <p className="text-xs text-destructive">
              This code is shown only once and cannot be recovered — only its hash is stored.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Replay of an earlier redemption — the code was shown once and can&apos;t be repeated.
          </p>
        )}
        <Separator />
        <div className="space-y-1 text-sm">
          <p className="flex justify-between"><span className="text-muted-foreground">Points spent</span><span className="tabular font-medium">{formatNumber(outcome.pointsUsed)} pts</span></p>
          {outcome.balanceAfter != null && (
            <p className="flex justify-between"><span className="text-muted-foreground">Balance after</span><span className="tabular font-medium">{formatNumber(outcome.balanceAfter)} pts</span></p>
          )}
          {outcome.expiresAt && (
            <p className="flex justify-between"><span className="text-muted-foreground">Collect by</span><span className="font-medium">{formatDate(outcome.expiresAt, "long")}</span></p>
          )}
        </div>
      </div>
    </FormDialog>
  );
}
