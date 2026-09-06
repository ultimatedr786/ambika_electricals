"use client";

import * as React from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, BadgeCheck, Gift, PackageCheck, Search, TicketCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog } from "@/components/shared/form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProductArt, type ProductArtKey } from "@/components/shared/product-art";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { formatDate, formatINR, formatNumber } from "@/lib/utils";
import {
  cancelRedemptionAction,
  collectRedemptionAction,
  createRewardAction,
  redeemOnBehalfAction,
  setRewardInventoryAction,
  updateRewardAction,
  type RedeemOutcome,
} from "@/app/business/(app)/rewards/rewards-actions";

/**
 * Live rewards & redemptions (Step 3 Slice 4) — real Supabase reward
 * catalogue, inventory holds and the redemption counter flow, rendered above
 * the prototype rewards manager on the Business → Rewards page.
 *
 * Reads obey RLS: staff+ see the business catalogue, per-store/pool stock and
 * every redemption; writes are RPC-only. Collection codes are stored as
 * sha256 + last4 and shown exactly once at redeem time (§8.4) — collection
 * matches the normalized code server-side. Points move only through the
 * append-only ledger inside the RPCs.
 */

const REWARD_TYPES = [
  { value: "discount", label: "Discount" },
  { value: "coupon", label: "Coupon" },
  { value: "free_product", label: "Free Product" },
  { value: "gift", label: "Gift" },
  { value: "special_offer", label: "Special Offer" },
] as const;

const TYPE_LABEL: Record<string, string> = Object.fromEntries(REWARD_TYPES.map((t) => [t.value, t.label]));

/** DB enum → StatusBadge vocabulary. */
const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  archived: "Inactive",
  pending: "Pending",
  collected: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};

interface LiveReward {
  id: string;
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
  status: "active" | "archived";
  stock: { storeId: string | null; storeName: string; onHand: number; reserved: number }[];
}

interface LiveRedemption {
  id: string;
  reference: string;
  status: "pending" | "collected" | "cancelled" | "expired";
  qty: number;
  pointsUsed: number;
  codeLast4: string;
  rewardName: string;
  artKey: string | null;
  memberLabel: string;
  storeName: string | null;
  createdAt: string;
  expiresAt: string;
  cancelReason: string | null;
}

const POOL = "pool";

export function LiveRewardsPanel() {
  const supabase = React.useMemo(() => createClient(), []);
  const configured = isSupabaseConfigured();

  const [loading, setLoading] = React.useState(true);
  const [businessId, setBusinessId] = React.useState<string | null>(null);
  const [role, setRole] = React.useState<"owner" | "manager" | "staff" | null>(null);
  const [rewards, setRewards] = React.useState<LiveReward[]>([]);
  const [redemptions, setRedemptions] = React.useState<LiveRedemption[]>([]);
  const [stores, setStores] = React.useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = React.useState<"catalogue" | "redemptions">("catalogue");
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("open");

  // Dialogs
  const [rewardDialog, setRewardDialog] = React.useState<{ reward: LiveReward | null } | null>(null);
  const [stockFor, setStockFor] = React.useState<LiveReward | null>(null);
  const [behalfOpen, setBehalfOpen] = React.useState(false);
  const [collectFor, setCollectFor] = React.useState<LiveRedemption | null>(null);
  const [cancelFor, setCancelFor] = React.useState<LiveRedemption | null>(null);
  const [issued, setIssued] = React.useState<RedeemOutcome | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const isManager = role === "owner" || role === "manager";

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
      const { data: me } = await supabase
        .from("business_memberships")
        .select("business_id, role")
        .eq("profile_id", user.id)
        .eq("status", "active");
      const rows = (me ?? []) as { business_id: string; role: "owner" | "manager" | "staff" }[];
      if (rows.length === 0) return;
      const bid = rows[0].business_id;
      setBusinessId(bid);
      setRole(rows[0].role);

      const [rewardRes, storeRes, invRes, redRes] = await Promise.all([
        supabase.from("rewards").select("*").eq("business_id", bid).order("created_at", { ascending: false }),
        supabase.from("stores").select("id, name").eq("business_id", bid).order("name"),
        // RLS scopes this to the business (staff+ only; customers get nothing).
        supabase.from("reward_inventory").select("reward_id, store_id, on_hand, reserved"),
        supabase
          .from("redemptions")
          .select(
            "id, reference, status, qty, points_used, code_last4, created_at, expires_at, cancel_reason, reward_id, store_id, rewards(name, art_key), customer_memberships(membership_no, display_name), stores(name)"
          )
          .eq("business_id", bid)
          .order("created_at", { ascending: false })
          .limit(60),
      ]);

      const storeRows = (storeRes.data ?? []) as { id: string; name: string }[];
      const storeNames = new Map<string, string>(storeRows.map((s) => [s.id, s.name]));

      const stockByReward = new Map<string, LiveReward["stock"]>();
      for (const inv of (invRes.data ?? []) as {
        reward_id: string; store_id: string | null; on_hand: number; reserved: number;
      }[]) {
        const list = stockByReward.get(inv.reward_id) ?? [];
        list.push({
          storeId: inv.store_id,
          storeName: inv.store_id == null ? "Business-wide pool" : (storeNames.get(inv.store_id) ?? "Store"),
          onHand: Number(inv.on_hand),
          reserved: Number(inv.reserved),
        });
        stockByReward.set(inv.reward_id, list);
      }

      setRewards(
        ((rewardRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
          id: String(r.id),
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
          status: r.status === "archived" ? "archived" : "active",
          stock: stockByReward.get(String(r.id)) ?? [],
        }))
      );

      setRedemptions(
        ((redRes.data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
          const reward = (r.rewards ?? {}) as { name?: string; art_key?: string | null };
          const member = (r.customer_memberships ?? {}) as { membership_no?: string; display_name?: string | null };
          const store = (r.stores ?? {}) as { name?: string };
          return {
            id: String(r.id),
            reference: String(r.reference),
            status: String(r.status) as LiveRedemption["status"],
            qty: Number(r.qty ?? 1),
            pointsUsed: Number(r.points_used ?? 0),
            codeLast4: String(r.code_last4 ?? ""),
            rewardName: reward.name ?? "Reward",
            artKey: reward.art_key ?? null,
            memberLabel: member.display_name || member.membership_no || "Member",
            storeName: store.name ?? null,
            createdAt: String(r.created_at),
            expiresAt: String(r.expires_at),
            cancelReason: (r.cancel_reason as string | null) ?? null,
          };
        })
      );
      setStores(storeRows);
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
      <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        Loading live rewards…
      </Card>
    );
  }
  if (!businessId) return null;

  const q = query.trim().toLowerCase();
  const visibleRewards = rewards.filter(
    (r) => !q || `${r.name} ${r.category ?? ""}`.toLowerCase().includes(q)
  );
  const visibleRedemptions = redemptions.filter((r) =>
    statusFilter === "open" ? r.status === "pending" : statusFilter === "all" ? true : r.status === statusFilter
  );
  const pendingCount = redemptions.filter((r) => r.status === "pending").length;

  const toggleArchive = async (reward: LiveReward) => {
    setBusyId(reward.id);
    const res = await updateRewardAction({
      rewardId: reward.id,
      status: reward.status === "active" ? "archived" : "active",
    });
    setBusyId(null);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(reward.status === "active" ? `${reward.name} archived.` : `${reward.name} is live again.`);
    await reload();
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Gift className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              Live rewards &amp; redemptions
              <Badge variant="outline" className="gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> Supabase
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">
              {rewards.filter((r) => r.status === "active").length} live rewards · {pendingCount} pending pickups ·
              codes are hashed — shown once at redeem time
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isManager && (
              <Button size="sm" onClick={() => setRewardDialog({ reward: null })}>
                <PackageCheck /> New reward
              </Button>
            )}
            {role !== null && (
              <Button size="sm" variant="outline" onClick={() => setBehalfOpen(true)}>
                <TicketCheck /> Redeem at counter
              </Button>
            )}
          </div>
        </div>

        <Separator className="my-4" />

        <div className="flex flex-wrap items-center gap-2.5">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "catalogue" | "redemptions")}>
            <TabsList>
              <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
              <TabsTrigger value="redemptions">
                Redemptions{pendingCount > 0 ? ` · ${pendingCount}` : ""}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {tab === "catalogue" ? (
            <SearchInput value={query} onChange={setQuery} placeholder="Search rewards" className="min-w-[180px] flex-1" />
          ) : (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="ml-auto w-[150px]" aria-label="Filter redemptions">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Pending</SelectItem>
                <SelectItem value="collected">Collected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {tab === "catalogue" ? (
          visibleRewards.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No live rewards yet."
              description="Create your first reward — it appears in the customer rewards store instantly."
              action={isManager ? <Button onClick={() => setRewardDialog({ reward: null })}><PackageCheck /> New reward</Button> : undefined}
            />
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleRewards.map((r) => {
                const units = r.stock.reduce((s, x) => s + x.onHand, 0);
                const held = r.stock.reduce((s, x) => s + x.reserved, 0);
                return (
                  <div key={r.id} className="rounded-xl border p-3.5">
                    <div className="flex items-start gap-3">
                      <ProductArt art={(r.artKey ?? "gift") as ProductArtKey} className="size-12 shrink-0" tone="muted" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-snug">{r.name}</p>
                          <StatusBadge status={STATUS_LABEL[r.status] ?? r.status} />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {TYPE_LABEL[r.rewardType] ?? r.rewardType}
                          {r.category ? ` · ${r.category}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="tabular">{formatNumber(r.pointsCost)} pts</Badge>
                      {r.regularPricePaise != null && r.regularPricePaise > 0 && (
                        <Badge variant="outline" className="tabular">Worth {formatINR(r.regularPricePaise / 100)}</Badge>
                      )}
                      <Badge variant="outline" className="tabular">
                        {r.stock.length === 0 ? "Unlimited" : `${units - held} of ${units} left`}
                      </Badge>
                      {held > 0 && <Badge variant="outline" className="tabular text-amber-600 dark:text-amber-400">{held} held</Badge>}
                      <Badge variant="outline" className="tabular">Collect ≤ {r.expiryDays}d</Badge>
                      {r.maxPerMonth != null && (
                        <Badge variant="outline" className="tabular">{r.maxPerMonth}/member/month</Badge>
                      )}
                    </div>
                    {isManager && (
                      <>
                        <Separator className="my-3" />
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => setRewardDialog({ reward: r })}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => setStockFor(r)}>Stock</Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-auto"
                            disabled={busyId === r.id}
                            onClick={() => void toggleArchive(r)}
                          >
                            {r.status === "active" ? (<><Archive /> Archive</>) : (<><ArchiveRestore /> Restore</>)}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : visibleRedemptions.length === 0 ? (
          <EmptyState
            icon={BadgeCheck}
            title="Nothing here."
            description="Redemptions appear the moment a member redeems a reward."
          />
        ) : (
          <div className="mt-3 space-y-2">
            {visibleRedemptions.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
                <ProductArt art={(r.artKey ?? "gift") as ProductArtKey} className="size-10 shrink-0" tone="muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {r.rewardName}
                    {r.qty > 1 && <span className="text-muted-foreground"> × {r.qty}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground tabular">
                    {r.reference} · code ••••{r.codeLast4} · {formatNumber(r.pointsUsed)} pts · {r.memberLabel}
                    {r.storeName ? ` · ${r.storeName}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.status === "pending"
                      ? `Collect by ${formatDate(r.expiresAt, "long")}`
                      : r.status === "cancelled" && r.cancelReason
                        ? `Cancelled: ${r.cancelReason}`
                        : formatDate(r.createdAt)}
                  </p>
                </div>
                <StatusBadge status={STATUS_LABEL[r.status] ?? r.status} />
                {r.status === "pending" && role !== null && (
                  <Button size="sm" variant="outline" onClick={() => setCollectFor(r)}>
                    <TicketCheck /> Collect
                  </Button>
                )}
                {r.status === "pending" && isManager && (
                  <Button size="sm" variant="ghost" onClick={() => setCancelFor(r)}>
                    <XCircle /> Cancel
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {rewardDialog && (
        <RewardFormDialog
          reward={rewardDialog.reward}
          onClose={() => setRewardDialog(null)}
          onSaved={() => {
            setRewardDialog(null);
            void reload();
          }}
        />
      )}
      {stockFor && (
        <StockDialog
          reward={stockFor}
          stores={stores}
          onClose={() => setStockFor(null)}
          onSaved={() => {
            void reload();
          }}
        />
      )}
      {behalfOpen && (
        <BehalfDialog
          businessId={businessId}
          rewards={rewards.filter((r) => r.status === "active")}
          stores={stores}
          onClose={() => setBehalfOpen(false)}
          onIssued={(outcome) => {
            setBehalfOpen(false);
            setIssued(outcome);
            void reload();
          }}
        />
      )}
      {collectFor && (
        <CollectDialog
          redemption={collectFor}
          onClose={() => setCollectFor(null)}
          onDone={(msg) => {
            setCollectFor(null);
            toast.success(msg);
            void reload();
          }}
        />
      )}
      {cancelFor && (
        <CancelDialog
          redemption={cancelFor}
          onClose={() => setCancelFor(null)}
          onDone={(msg) => {
            setCancelFor(null);
            toast.success(msg);
            void reload();
          }}
        />
      )}
      {issued && <CodeOnceDialog outcome={issued} onClose={() => setIssued(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reward create / edit (manager+)                                     */
/* ------------------------------------------------------------------ */

function RewardFormDialog({
  reward,
  onClose,
  onSaved,
}: {
  reward: LiveReward | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [businessId, setBusinessId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    name: reward?.name ?? "",
    description: reward?.description ?? "",
    rewardType: reward?.rewardType ?? "gift",
    category: reward?.category ?? "",
    points: String(reward?.pointsCost ?? 500),
    worth: reward?.regularPricePaise != null ? String(reward.regularPricePaise / 100) : "",
    expiryDays: String(reward?.expiryDays ?? 30),
    maxPerMonth: reward?.maxPerMonth != null ? String(reward.maxPerMonth) : "",
    terms: (reward?.terms ?? []).join("\n"),
  });

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !alive) return;
      const { data } = await supabase
        .from("business_memberships")
        .select("business_id")
        .eq("profile_id", user.id)
        .eq("status", "active")
        .limit(1);
      const bid = (data?.[0] as { business_id?: string } | undefined)?.business_id;
      if (alive && bid) setBusinessId(bid);
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const save = async () => {
    if (!businessId) return;
    setSaving(true);
    const terms = form.terms.split("\n").map((t) => t.trim()).filter(Boolean);
    const worthPaise = form.worth.trim() === "" ? null : Math.round(Number(form.worth) * 100);
    const maxPerMonth = form.maxPerMonth.trim() === "" ? null : Number(form.maxPerMonth);
    const res = reward
      ? await updateRewardAction({
          rewardId: reward.id,
          name: form.name,
          description: form.description || null,
          pointsCost: Number(form.points),
          category: form.category || null,
          regularPricePaise: worthPaise,
          expiryDays: Number(form.expiryDays),
          maxPerCustomerPerMonth: maxPerMonth,
        })
      : await createRewardAction({
          businessId,
          name: form.name,
          rewardType: form.rewardType,
          pointsCost: Number(form.points),
          description: form.description || null,
          category: form.category || null,
          regularPricePaise: worthPaise,
          artKey: form.rewardType === "coupon" || form.rewardType === "discount" ? "coupon" : "gift",
          expiryDays: Number(form.expiryDays),
          maxPerCustomerPerMonth: maxPerMonth,
          terms: terms.length ? terms : ["Valid at Ambika Electricals stores only.", "Cannot be clubbed with other offers."],
        });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(reward ? "Reward updated." : "Reward created and published to the customer store.");
    onSaved();
  };

  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={reward ? "Edit reward" : "New live reward"}
      description={
        reward
          ? "Changes apply to future redemptions; existing ones keep their snapshots."
          : "Publishes to the customer rewards store immediately (RPC + RLS enforced)."
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={form.name.trim().length < 3 || Number(form.points) <= 0}>
            {reward ? "Save changes" : "Create reward"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="lr-name">Reward name</Label>
          <Input id="lr-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Philips 9W LED Bulb — Free" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lr-desc">Description</Label>
          <Textarea id="lr-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What the member gets" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.rewardType} onValueChange={(v) => setForm({ ...form, rewardType: v })} disabled={!!reward}>
              <SelectTrigger aria-label="Reward type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REWARD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {reward && <p className="text-[11px] text-muted-foreground">Type is fixed after creation.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lr-cat">Category</Label>
            <Input id="lr-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Lighting" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lr-pts">Points cost</Label>
            <Input id="lr-pts" inputMode="numeric" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value.replace(/\D/g, "") })} />
            <p className="text-[11px] text-muted-foreground">1 pt = ₹0.10 · {form.points ? `≈ ${formatINR(Number(form.points) / 10)}` : "—"}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lr-worth">Regular value (₹)</Label>
            <Input id="lr-worth" inputMode="decimal" value={form.worth} onChange={(e) => setForm({ ...form, worth: e.target.value.replace(/[^\d.]/g, "") })} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lr-exp">Collect within (days)</Label>
            <Input id="lr-exp" inputMode="numeric" value={form.expiryDays} onChange={(e) => setForm({ ...form, expiryDays: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lr-limit">Per member / month</Label>
            <Input id="lr-limit" inputMode="numeric" value={form.maxPerMonth} onChange={(e) => setForm({ ...form, maxPerMonth: e.target.value.replace(/\D/g, "") })} placeholder="No limit" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lr-terms">Terms (one per line)</Label>
          <Textarea id="lr-terms" rows={3} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
        </div>
      </div>
    </FormDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Stock (manager+) — per-store rows + the business-wide pool          */
/* ------------------------------------------------------------------ */

function StockDialog({
  reward,
  stores,
  onClose,
  onSaved,
}: {
  reward: LiveReward;
  stores: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = React.useState<Record<string, string>>(() => {
    const init: Record<string, string> = { [POOL]: "" };
    for (const s of stores) init[s.id] = "";
    for (const row of reward.stock) {
      init[row.storeId ?? POOL] = String(row.onHand);
    }
    return init;
  });
  const [busyKey, setBusyKey] = React.useState<string | null>(null);

  const stockRow = (key: string) => reward.stock.find((x) => (x.storeId ?? POOL) === key);

  const save = async (key: string) => {
    const raw = values[key];
    if (raw.trim() === "") return;
    setBusyKey(key);
    const res = await setRewardInventoryAction(reward.id, key === POOL ? null : key, Number(raw));
    setBusyKey(null);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(`${reward.name}: stock set to ${res.data.onHandAfter}${key === POOL ? " (pool)" : ""}.`);
    onSaved();
  };

  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Stock — ${reward.name}`}
      description="No rows at all = unlimited. The store row is preferred over the pool when redeeming at that store; pending redemptions hold units until collected or cancelled."
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-3 py-2">
        {[{ id: POOL, name: "Business-wide pool" }, ...stores].map((s) => {
          const row = stockRow(s.id);
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-2.5 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground tabular">
                  {row ? `${row.onHand} on hand · ${row.reserved} held` : "Not tracked here yet"}
                </p>
              </div>
              <Input
                className="w-24"
                inputMode="numeric"
                aria-label={`On-hand units for ${s.name}`}
                value={values[s.id]}
                onChange={(e) => setValues({ ...values, [s.id]: e.target.value.replace(/\D/g, "") })}
                placeholder={row ? String(row.onHand) : "0"}
              />
              <Button size="sm" variant="secondary" disabled={busyKey === s.id || values[s.id].trim() === ""} onClick={() => void save(s.id)}>
                Set
              </Button>
            </div>
          );
        })}
      </div>
    </FormDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Redeem at the counter (staff+)                                      */
/* ------------------------------------------------------------------ */

function BehalfDialog({
  businessId,
  rewards,
  stores,
  onClose,
  onIssued,
}: {
  businessId: string;
  rewards: LiveReward[];
  stores: { id: string; name: string }[];
  onClose: () => void;
  onIssued: (outcome: RedeemOutcome) => void;
}) {
  const [membershipNo, setMembershipNo] = React.useState("");
  const [rewardId, setRewardId] = React.useState(rewards[0]?.id ?? "");
  const [storeId, setStoreId] = React.useState(POOL);
  const [qty, setQty] = React.useState("1");
  const [busy, setBusy] = React.useState(false);
  const idemKey = React.useRef<string | null>(null);

  const submit = async () => {
    if (!rewardId || membershipNo.trim().length < 3) return;
    setBusy(true);
    if (!idemKey.current) idemKey.current = crypto.randomUUID();
    const res = await redeemOnBehalfAction({
      businessId,
      rewardId,
      membershipNo,
      storeId: storeId === POOL ? null : storeId,
      qty: Number(qty) || 1,
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
      title="Redeem at the counter"
      description="Spends the member's points through the ledger, holds the stock and issues a one-time collection code."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={membershipNo.trim().length < 3 || !rewardId}>
            Redeem
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="rb-mem">Membership number</Label>
          <Input
            id="rb-mem"
            value={membershipNo}
            onChange={(e) => setMembershipNo(e.target.value.toUpperCase())}
            placeholder="AE-…"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Reward</Label>
          <Select value={rewardId} onValueChange={setRewardId}>
            <SelectTrigger aria-label="Reward"><SelectValue /></SelectTrigger>
            <SelectContent>
              {rewards.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name} — {formatNumber(r.pointsCost)} pts
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Collecting store</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger aria-label="Store"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={POOL}>Business pool / unlimited</SelectItem>
                {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rb-qty">Quantity</Label>
            <Input id="rb-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, "") || "1")} />
          </div>
        </div>
      </div>
    </FormDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Collect (staff+) / Cancel (manager+)                                */
/* ------------------------------------------------------------------ */

function CollectDialog({
  redemption,
  onClose,
  onDone,
}: {
  redemption: LiveRedemption;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setBusy(true);
    const res = await collectRedemptionAction(redemption.id, code);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    if (res.data.status === "expired") {
      onDone(`${redemption.reference} had passed its deadline — marked expired and its hold released.`);
      return;
    }
    onDone(`${redemption.reference} collected — stock updated.`);
  };

  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Collect ${redemption.reference}`}
      description={`${redemption.rewardName} for ${redemption.memberLabel}. The code was shown to the member once — last four ••••${redemption.codeLast4}.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={code.trim().length < 8}>Hand over reward</Button>
        </>
      }
    >
      <div className="space-y-1.5 py-2">
        <Label htmlFor="rc-code">Collection code</Label>
        <Input
          id="rc-code"
          value={code}
          autoComplete="off"
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
          placeholder="8 characters"
          className="font-mono tracking-[0.3em]"
        />
        <p className="text-[11px] text-muted-foreground">
          Case-insensitive; I/L/O are normalized to 1/1/0. Wrong attempts are audit-logged.
        </p>
      </div>
    </FormDialog>
  );
}

function CancelDialog({
  redemption,
  onClose,
  onDone,
}: {
  redemption: LiveRedemption;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setBusy(true);
    const res = await cancelRedemptionAction(redemption.id, reason);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    if (res.data.status === "expired") {
      onDone(`${redemption.reference} had already expired — hold released.`);
      return;
    }
    onDone(`${redemption.reference} cancelled — ${formatNumber(res.data.pointsRefunded)} pts refunded.`);
  };

  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Cancel ${redemption.reference}`}
      description={`Refunds ${formatNumber(redemption.pointsUsed)} points via a compensating ledger entry and releases the stock hold.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Keep</Button>
          <Button variant="destructive" onClick={submit} loading={busy} disabled={reason.trim().length < 3}>
            Cancel redemption
          </Button>
        </>
      }
    >
      <div className="space-y-1.5 py-2">
        <Label htmlFor="rx-reason">Reason (kept in the audit trail)</Label>
        <Textarea id="rx-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Member changed their mind" />
      </div>
    </FormDialog>
  );
}

/* ------------------------------------------------------------------ */
/* One-time code reveal                                                */
/* ------------------------------------------------------------------ */

function CodeOnceDialog({ outcome, onClose }: { outcome: RedeemOutcome; onClose: () => void }) {
  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Redeemed — ${outcome.reference}`}
      description="This collection code is shown exactly once. Only its hash is stored — nobody can look it up later."
      footer={<Button onClick={onClose}>Done</Button>}
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
                toast.success("Code copied");
              }}
            >
              Copy code
            </Button>
            <p className="text-xs text-destructive">
              Save it now — it can never be shown again. Lost it? Cancel the redemption and redeem again.
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
