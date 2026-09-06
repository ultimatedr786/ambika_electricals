"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Gift, Pencil, Plus, Search, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog } from "@/components/shared/form-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { TierBadge } from "@/components/shared/tier-badge";
import { ProductArt } from "@/components/shared/product-art";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { LiveRewardsPanel } from "@/components/business/live-rewards-panel";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { cn, formatINR, formatNumber } from "@/lib/utils";
import type { Reward, RewardType, Tier } from "@/types";

const rewardTypes: RewardType[] = ["Discount", "Coupon", "Free Electrical Product", "Gift", "Special Offer"];
const tiers: Tier[] = ["Bronze", "Silver", "Gold", "Platinum"];

export default function BusinessRewardsPage() {
  const { state } = useStore();
  const { rewardService } = useServices();
  const [query, setQuery] = React.useState("");
  const [tab, setTab] = React.useState("all");
  const [type, setType] = React.useState("all");
  const [editing, setEditing] = React.useState<Reward | null>(null);
  const [creating, setCreating] = React.useState(false);

  const results = React.useMemo(() => {
    const t = query.trim().toLowerCase();
    return state.rewards
      .filter((r) => (tab === "all" ? true : tab === "active" ? r.status === "Active" : r.status === "Paused"))
      .filter((r) => type === "all" || r.type === type)
      .filter((r) => !t || `${r.name} ${r.brand ?? ""}`.toLowerCase().includes(t));
  }, [state.rewards, query, tab, type]);

  const totals = React.useMemo(() => {
    const rs = state.rewards;
    return {
      total: rs.length,
      active: rs.filter((r) => r.status === "Active").length,
      redemptions: rs.reduce((s, r) => s + r.redemptions, 0),
      points: rs.reduce((s, r) => s + r.redemptions * r.points, 0),
    };
  }, [state.rewards]);

  const mostRedeemed = React.useMemo(
    () => [...state.rewards].sort((a, b) => b.redemptions - a.redemptions).slice(0, 3),
    [state.rewards]
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rewards"
        description="Manage the catalogue your members redeem points against."
        actions={<Button onClick={() => setCreating(true)}><Plus /> Create Reward</Button>}
      />

      {/* Live Supabase rewards & redemptions — renders only when auth is configured */}
      <LiveRewardsPanel />

      {isSupabaseConfigured() && (
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Prototype rewards</h2>
          <span className="rounded-md border border-dashed px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Demo data — migrates in a later slice
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total rewards" value={formatNumber(totals.total)} icon={Gift} />
        <StatCard label="Active" value={formatNumber(totals.active)} />
        <StatCard label="Total redemptions" value={formatNumber(totals.redemptions)} icon={TrendingUp} />
        <StatCard label="Points redeemed" value={formatNumber(totals.points)} />
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Most redeemed this month</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {mostRedeemed.map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <span className="text-sm font-semibold tabular text-muted-foreground">{i + 1}</span>
              <ProductArt art={r.image} className="size-10 shrink-0" tone="muted" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="text-xs tabular text-muted-foreground">{r.redemptions} redemptions</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2.5">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="paused">Paused</TabsTrigger>
          </TabsList>
        </Tabs>
        <SearchInput value={query} onChange={setQuery} placeholder="Search rewards" className="min-w-[200px] flex-1" />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-[190px]" aria-label="Reward type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {rewardTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No rewards match."
          description="Adjust your filters or create a new reward for your members."
          action={<Button onClick={() => setCreating(true)}><Plus /> Create reward</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 9) * 0.03 }}>
              <Card className="flex h-full flex-col p-4">
                <div className="flex items-start gap-3">
                  <ProductArt art={r.image} className="size-14 shrink-0" tone="muted" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">{r.name}</p>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.type}{r.brand ? ` · ${r.brand}` : ""}</p>
                  </div>
                </div>
                <p className="mt-2.5 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="tabular">{formatNumber(r.points)} pts</Badge>
                  {r.regularPrice ? <Badge variant="outline" className="tabular">Worth {formatINR(r.regularPrice)}</Badge> : null}
                  <TierBadge tier={r.minTier} />
                  <Badge variant="outline" className={cn(r.stockStatus === "Out of Stock" && "text-destructive")}>{r.stockStatus}</Badge>
                </div>
                <Separator className="my-3" />
                <div className="mt-auto flex items-center justify-between">
                  <div className="text-xs tabular text-muted-foreground">
                    {r.redemptions} redeemed · {formatNumber(r.inventory)} left
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={r.status === "Active"}
                      aria-label={`${r.status === "Active" ? "Pause" : "Activate"} ${r.name}`}
                      onCheckedChange={async (v) => {
                        await rewardService.updateReward(r.id, { status: v ? "Active" : "Paused" });
                        toast.success(v ? `${r.name} is now live.` : `${r.name} paused.`);
                      }}
                    />
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`}><Pencil /></Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <RewardDialog
        reward={editing}
        open={!!editing || creating}
        onOpenChange={(v) => { if (!v) { setEditing(null); setCreating(false); } }}
      />
    </div>
  );
}

function RewardDialog({ reward, open, onOpenChange }: { reward: Reward | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { rewardService } = useServices();
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "", description: "", type: "Gift" as RewardType, points: 500,
    regularPrice: 0, inventory: 50, minTier: "Bronze" as Tier, expiryDays: 30, terms: "",
  });

  React.useEffect(() => {
    if (reward) {
      setForm({
        name: reward.name, description: reward.description, type: reward.type, points: reward.points,
        regularPrice: reward.regularPrice ?? 0, inventory: reward.inventory, minTier: reward.minTier,
        expiryDays: reward.expiryDays, terms: reward.terms.join("\n"),
      });
    } else {
      setForm({ name: "", description: "", type: "Gift", points: 500, regularPrice: 0, inventory: 50, minTier: "Bronze", expiryDays: 30, terms: "" });
    }
  }, [reward, open]);

  const save = async () => {
    setSaving(true);
    const terms = form.terms.split("\n").map((t) => t.trim()).filter(Boolean);
    if (reward) {
      await rewardService.updateReward(reward.id, {
        name: form.name, description: form.description, type: form.type, points: form.points,
        regularPrice: form.regularPrice || undefined, inventory: form.inventory,
        minTier: form.minTier, expiryDays: form.expiryDays, terms,
      });
      toast.success("Reward updated.");
    } else {
      await rewardService.createReward({
        name: form.name, description: form.description, type: form.type,
        storeCategory: "Special Offers", points: form.points,
        regularPrice: form.regularPrice || undefined, image: "coupon",
        stockStatus: form.inventory > 20 ? "In Stock" : form.inventory > 0 ? "Low Stock" : "Out of Stock",
        inventory: form.inventory, minTier: form.minTier, expiryDays: form.expiryDays,
        status: "Active",
        options: [{ type: "points", points: form.points, cash: 0, label: "Redeem with points", description: `Use ${formatNumber(form.points)} points` }],
        terms: terms.length ? terms : ["Valid at Ambika Electricals stores only.", "Cannot be clubbed with other offers."],
      });
      toast.success("Reward created and published to the store.");
    }
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={reward ? "Edit reward" : "Create reward"}
      description={reward ? "Changes appear instantly in the customer rewards store." : "Publish a new reward to the customer rewards store."}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={form.name.trim().length < 3}>{reward ? "Save changes" : "Create reward"}</Button>
        </>
      }
    >
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rname">Reward name</Label>
            <Input id="rname" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Philips 9W LED Bulb — Free" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rdesc">Description</Label>
            <Textarea id="rdesc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What the member gets" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as RewardType })}>
                <SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger>
                <SelectContent>{rewardTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Minimum tier</Label>
              <Select value={form.minTier} onValueChange={(v) => setForm({ ...form, minTier: v as Tier })}>
                <SelectTrigger aria-label="Minimum tier"><SelectValue /></SelectTrigger>
                <SelectContent>{tiers.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rpts">Points required</Label>
              <Input id="rpts" inputMode="numeric" value={form.points} onChange={(e) => setForm({ ...form, points: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rprice">Regular value (₹)</Label>
              <Input id="rprice" inputMode="numeric" value={form.regularPrice} onChange={(e) => setForm({ ...form, regularPrice: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rinv">Inventory</Label>
              <Input id="rinv" inputMode="numeric" value={form.inventory} onChange={(e) => setForm({ ...form, inventory: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rexp">Expires after (days)</Label>
              <Input id="rexp" inputMode="numeric" value={form.expiryDays} onChange={(e) => setForm({ ...form, expiryDays: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rterms">Terms (one per line)</Label>
            <Textarea id="rterms" value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} rows={3} />
          </div>
        </div>
    </FormDialog>
  );
}
