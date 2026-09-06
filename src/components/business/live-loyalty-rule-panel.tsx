"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  CalendarClock, Coins, History, Info, Layers, Lock, ShieldCheck, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { setLoyaltyRuleAction } from "@/app/business/(app)/settings/loyalty-rule-actions";

/**
 * Live loyalty rule editor (Step 3 Slice 6) — the owner-facing entry point for
 * the versioned rule engine.
 *
 * What the owner sees is deliberately narrow: the one model the server can
 * actually evaluate (spend → points), plus the version history so a rate
 * change is visibly an append, not an overwrite. The advanced models the
 * schema anticipates are listed as explicitly future, greyed out — a control
 * that half-works is worse than one that is honestly absent.
 *
 * Everything money-related here is a *display* of what the database returned.
 * The preview in the POS and the numbers below are only ever estimates; the
 * points that get posted come from the version `create_sale` resolved.
 */

interface RuleVersion {
  id: string;
  version: number;
  earnSpendPaise: number;
  earnPoints: number;
  pointValuePaise: number;
  minSpendPaise: number;
  pointsExpiryDays: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "scheduled" | "active" | "superseded";
  notes: string | null;
}

const FUTURE_MODELS = [
  { name: "Tier multipliers", detail: "Gold members earn 1.5× — needs the tiers slice" },
  { name: "Category bonuses", detail: "Extra points on wires & cables" },
  { name: "Campaign bonuses", detail: "Time-boxed festive multipliers" },
];

const rupees = (paise: number) =>
  (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** `datetime-local` wants a local-time string without the zone suffix. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LiveLoyaltyRulePanel() {
  const supabase = React.useMemo(() => createClient(), []);
  const configured = isSupabaseConfigured();

  const [loading, setLoading] = React.useState(true);
  const [businessId, setBusinessId] = React.useState<string | null>(null);
  const [isOwner, setIsOwner] = React.useState(false);
  const [versions, setVersions] = React.useState<RuleVersion[]>([]);

  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({ spend: "100", points: "10", minSpend: "0", startNow: true, from: "" });
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    if (!configured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
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
      setIsOwner(rows[0].role === "owner");

      // RLS: staff+ see the whole history, customers only the current version.
      const { data } = await supabase
        .from("loyalty_rule_versions")
        .select(
          "id, version, earn_spend_paise, earn_points, point_value_paise, min_spend_paise, points_expiry_days, effective_from, effective_to, status, notes"
        )
        .eq("business_id", bid)
        .order("version", { ascending: false })
        .limit(12);

      const list = ((data ?? []) as Record<string, unknown>[]).map((v) => ({
        id: String(v.id),
        version: Number(v.version),
        earnSpendPaise: Number(v.earn_spend_paise),
        earnPoints: Number(v.earn_points),
        pointValuePaise: Number(v.point_value_paise),
        minSpendPaise: Number(v.min_spend_paise),
        pointsExpiryDays: v.points_expiry_days == null ? null : Number(v.points_expiry_days),
        effectiveFrom: String(v.effective_from),
        effectiveTo: v.effective_to == null ? null : String(v.effective_to),
        status: v.status as RuleVersion["status"],
        notes: v.notes == null ? null : String(v.notes),
      }));
      setVersions(list);

      const live = list.find((v) => v.effectiveTo === null) ?? list[0];
      if (live) {
        setForm((f) => ({
          ...f,
          spend: String(live.earnSpendPaise / 100),
          points: String(live.earnPoints),
          minSpend: String(live.minSpendPaise / 100),
        }));
      }
    } finally {
      setLoading(false);
    }
  }, [configured, supabase]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const current = React.useMemo(() => {
    const now = Date.now();
    return (
      versions.find(
        (v) =>
          new Date(v.effectiveFrom).getTime() <= now &&
          (v.effectiveTo === null || new Date(v.effectiveTo).getTime() > now)
      ) ?? null
    );
  }, [versions]);

  const scheduled = React.useMemo(
    () => versions.filter((v) => new Date(v.effectiveFrom).getTime() > Date.now()),
    [versions]
  );

  const save = async () => {
    setError(null);
    const spend = Math.round(Number.parseFloat(form.spend) * 100);
    const points = Number.parseInt(form.points, 10);
    const minSpend = Math.round(Number.parseFloat(form.minSpend || "0") * 100);

    if (!Number.isFinite(spend) || spend <= 0 || !Number.isFinite(points) || points < 0) {
      setError("Enter a spend amount above ₹0 and a whole number of points.");
      return;
    }

    setSaving(true);
    try {
      const res = await setLoyaltyRuleAction({
        businessId,
        earnSpendPaise: spend,
        earnPoints: points,
        minSpendPaise: Number.isFinite(minSpend) ? minSpend : 0,
        effectiveFrom: form.startNow || !form.from ? null : new Date(form.from).toISOString(),
        note: null,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      toast.success(
        res.data.status === "scheduled"
          ? `Version ${res.data.version} scheduled for ${formatWhen(res.data.effectiveFrom)}.`
          : `Version ${res.data.version} is now live.`
      );
      setEditing(false);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  if (!configured) return null;
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          Loading the live loyalty rule…
        </CardContent>
      </Card>
    );
  }
  if (!businessId || !current) return null;

  const example = Math.floor((100000 * current.earnPoints) / current.earnSpendPaise);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Coins className="size-4" aria-hidden />
          </span>
          Loyalty rule
          <Badge variant="outline" className="gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> Live · v{current.version}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Server-authoritative. Every sale stores the version that priced it, so changing the rate never
          re-prices history.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Earning</p>
            <p className="text-lg font-semibold">
              ₹{rupees(current.earnSpendPaise)} → {current.earnPoints} pts
            </p>
            <p className="text-[11px] text-muted-foreground">₹1,000 spend ≈ {example} points</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Point value</p>
            <p className="text-lg font-semibold">₹{rupees(current.pointValuePaise)}</p>
            <p className="text-[11px] text-muted-foreground">
              {current.minSpendPaise > 0
                ? `Minimum spend ₹${rupees(current.minSpendPaise)}`
                : "No minimum spend"}
            </p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Points expiry</p>
            <p className="text-lg font-semibold">
              {current.pointsExpiryDays === null ? "Never" : `${current.pointsExpiryDays} days`}
            </p>
            <p className="text-[11px] text-muted-foreground">No expiry process runs at launch</p>
          </div>
        </div>

        {scheduled.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs">
            <CalendarClock className="mt-px size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              <span className="font-medium">Version {scheduled[0].version} is scheduled</span> for{" "}
              {formatWhen(scheduled[0].effectiveFrom)} — ₹{rupees(scheduled[0].earnSpendPaise)} →{" "}
              {scheduled[0].earnPoints} pts. Sales before then keep the current rate.
            </span>
          </div>
        )}

        {!isOwner ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Lock className="size-3.5 shrink-0" aria-hidden />
            Only the business owner can change the loyalty rule.
          </p>
        ) : !editing ? (
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Sparkles /> Change the earning rate
          </Button>
        ) : (
          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden />
              Saving creates version {(versions[0]?.version ?? current.version) + 1}. The current version is
              closed at the new start time and kept for history — nothing is overwritten.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="rule-spend">Spend step (₹)</Label>
                <Input
                  id="rule-spend"
                  inputMode="decimal"
                  value={form.spend}
                  onChange={(e) => setForm({ ...form, spend: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-points">Points awarded</Label>
                <Input
                  id="rule-points"
                  inputMode="numeric"
                  value={form.points}
                  onChange={(e) => setForm({ ...form, points: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-min">Minimum spend (₹)</Label>
                <Input
                  id="rule-min"
                  inputMode="decimal"
                  value={form.minSpend}
                  onChange={(e) => setForm({ ...form, minSpend: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-from">Starts</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={form.startNow ? "default" : "outline"}
                  onClick={() => setForm({ ...form, startNow: true })}
                >
                  Immediately
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={form.startNow ? "outline" : "default"}
                  onClick={() =>
                    setForm({
                      ...form,
                      startNow: false,
                      from: form.from || toLocalInput(new Date(Date.now() + 60 * 60 * 1000)),
                    })
                  }
                >
                  Schedule
                </Button>
                {!form.startNow && (
                  <Input
                    id="rule-from"
                    type="datetime-local"
                    className="w-auto"
                    value={form.from}
                    min={toLocalInput(new Date())}
                    onChange={(e) => setForm({ ...form, from: e.target.value })}
                  />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Backdating is refused by the server — past sales are already settled.
              </p>
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button onClick={save} loading={saving}>
                <ShieldCheck /> Publish new version
              </Button>
              <Button variant="ghost" onClick={() => { setEditing(false); setError(null); }} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <Separator />

        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <History className="size-3.5" aria-hidden /> Version history
          </h3>
          <ul className="mt-2 divide-y rounded-xl border">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                <Badge variant="outline" className="font-mono text-[10px]">v{v.version}</Badge>
                <span className="font-medium">
                  ₹{rupees(v.earnSpendPaise)} → {v.earnPoints} pts
                </span>
                <span className="text-muted-foreground">
                  {formatWhen(v.effectiveFrom)}
                  {v.effectiveTo ? ` → ${formatWhen(v.effectiveTo)}` : " → now"}
                </span>
                <Badge
                  variant="outline"
                  className={
                    v.id === current.id
                      ? "ml-auto text-[10px] text-emerald-600 dark:text-emerald-400"
                      : "ml-auto text-[10px] text-muted-foreground"
                  }
                >
                  {v.id === current.id ? "in force" : v.status}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Layers className="size-3.5" aria-hidden /> Coming later
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {FUTURE_MODELS.map((m) => (
              <div
                key={m.name}
                className="rounded-lg border border-dashed p-2.5 opacity-60"
                aria-disabled="true"
              >
                <p className="flex items-center gap-1 text-xs font-medium">
                  <Lock className="size-3" aria-hidden /> {m.name}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{m.detail}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Only the spend-based rule is evaluated by the server today. These are shown so the roadmap is
            visible — not as controls that would silently do nothing.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
