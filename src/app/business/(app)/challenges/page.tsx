"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Flag, Plus, Trophy, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog } from "@/components/shared/form-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatNumber } from "@/lib/utils";

const units = ["purchases", "products", "referrals", "categories", "₹ spent"];

interface LiveChallenge {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  target: number;
  rewardPoints: number;
  endsAt: string;
  status: string;
  participants: number;
  averageProgressPercent: number;
  completions: number;
}

function useLiveChallenges() {
  const configured = isSupabaseConfigured();
  const supabase = React.useMemo(() => createClient(), []);
  const [items, setItems] = React.useState<LiveChallenge[]>([]);
  const [businessId, setBusinessId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(configured);

  const reload = React.useCallback(async () => {
    if (!configured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data: me } = await supabase
      .from("business_memberships")
      .select("business_id")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    const bid = (me as { business_id: string } | null)?.business_id ?? null;
    if (!bid) {
      setLoading(false);
      return;
    }
    setBusinessId(bid);
    const { data, error } = await supabase.rpc("list_business_challenges", { p_business_id: bid });
    if (!error) {
      setItems(
        ((data ?? []) as Record<string, unknown>[]).map((c) => ({
          id: String(c.id), name: String(c.name), description: (c.description as string | null) ?? null,
          unit: String(c.unit), target: Number(c.target), rewardPoints: Number(c.rewardPoints),
          endsAt: String(c.endsAt), status: String(c.status), participants: Number(c.participants),
          averageProgressPercent: Number(c.averageProgressPercent), completions: Number(c.completions),
        }))
      );
    }
    setLoading(false);
  }, [configured, supabase]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const create = React.useCallback(
    async (values: { name: string; description: string; unit: string; target: number; rewardPoints: number; endsOn: string }) => {
      if (!businessId || !supabase) return;
      const endsAt = values.endsOn ? new Date(values.endsOn).toISOString() : new Date(Date.now() + 30 * 864e5).toISOString();
      const { error } = await supabase.rpc("create_challenge", {
        p_business_id: businessId,
        p_name: values.name,
        p_description: values.description || null,
        p_unit: values.unit,
        p_target: values.target,
        p_reward_points: values.rewardPoints,
        p_ends_at: endsAt,
      });
      if (error) throw error;
      await reload();
    },
    [businessId, supabase, reload]
  );

  const end = React.useCallback(
    async (challengeId: string) => {
      if (!supabase) return;
      const { error } = await supabase.rpc("end_challenge", { p_challenge_id: challengeId });
      if (error) throw error;
      await reload();
    },
    [supabase, reload]
  );

  return { configured, items, loading, create, end };
}

export default function BusinessChallengesPage() {
  const { state } = useStore();
  const { challengeService } = useServices();
  const live = useLiveChallenges();
  const configured = live.configured;
  const [tab, setTab] = React.useState("all");
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "", description: "", target: 5, unit: "purchases", rewardPoints: 500, endsOn: "",
  });

  interface ViewChallenge {
    id: string; name: string; description: string; unit: string;
    rewardPoints: number; endsOn: string; status: "Active" | "Completed";
    percent: number; progressLabel: string; participants: number;
  }
  const all: ViewChallenge[] = configured
    ? live.items.map((c) => ({
        id: c.id, name: c.name, description: c.description ?? "", unit: c.unit,
        rewardPoints: c.rewardPoints, endsOn: c.endsAt,
        status: c.status === "completed" ? "Completed" : "Active",
        percent: c.averageProgressPercent, progressLabel: `${c.averageProgressPercent}%`,
        participants: c.participants,
      }))
    : state.challenges.map((c) => ({
        id: c.id, name: c.name, description: c.description, unit: c.unit,
        rewardPoints: c.rewardPoints, endsOn: c.endsOn, status: c.status as "Active" | "Completed",
        percent: Math.min(100, Math.round((c.progress / c.target) * 100)),
        progressLabel: `${c.progress} / ${c.target} ${c.unit}`,
        participants: c.participants,
      }));
  const results = all.filter((c) => tab === "all" || c.status.toLowerCase() === tab);

  const totals = configured
    ? {
        active: live.items.filter((c) => c.status === "active").length,
        participants: live.items.reduce((s, c) => s + c.participants, 0),
        points: live.items.reduce((s, c) => s + c.rewardPoints * c.completions, 0),
        completed: live.items.filter((c) => c.status === "completed").length,
      }
    : {
        active: state.challenges.filter((c) => c.status === "Active").length,
        participants: state.challenges.reduce((s, c) => s + c.participants, 0),
        points: state.challenges.reduce((s, c) => s + c.rewardPoints * c.participants, 0),
        completed: state.challenges.filter((c) => c.status === "Completed").length,
      };

  const create = async () => {
    setSaving(true);
    try {
      if (configured) {
        await live.create(form);
      } else {
        const endsOn = form.endsOn || new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
        await challengeService.createChallenge({
          name: form.name, description: form.description, target: form.target, progress: 0,
          unit: form.unit, rewardPoints: form.rewardPoints, endsOn, status: "Active", participants: 0,
        });
      }
      setOpen(false);
      setForm({ name: "", description: "", target: 5, unit: "purchases", rewardPoints: 500, endsOn: "" });
      toast.success("Challenge published to members.");
    } catch (err) {
      toast.error("Couldn't publish the challenge", { description: err instanceof Error ? err.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 flex-1 min-h-0 flex flex-col">
      <div className="space-y-4 shrink-0">
        <PageHeader
          title="Challenges"
          description="Gamified goals that keep members coming back to Ambika Electricals."
          actions={<Button onClick={() => setOpen(true)}><Plus /> Create Challenge</Button>}
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Active challenges" value={String(totals.active)} icon={Flag} />
          <StatCard label="Total participants" value={formatNumber(totals.participants)} icon={Users} />
          <StatCard label="Points at stake" value={formatNumber(totals.points)} icon={Zap} />
          <StatCard label="Completed" value={String(totals.completed)} icon={Trophy} />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {configured && live.loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          Loading challenges…
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="No challenges here."
          description="Create a challenge to boost engagement across your member base."
          action={<Button onClick={() => setOpen(true)}><Plus /> Create challenge</Button>}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3 flex-1 min-h-0 overflow-y-auto scroll-region p-1">
          {results.map((c, i) => {
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold">{c.name}</h3>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{c.description}</p>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Average progress</span>
                      <span className="font-medium tabular">{c.progressLabel}</span>
                    </div>
                    <Progress value={c.percent} className="mt-1.5" />
                  </div>

                  <Separator className="my-4" />

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="secondary" className="tabular">+{formatNumber(c.rewardPoints)} pts reward</Badge>
                    <span className="text-xs tabular text-muted-foreground">{formatNumber(c.participants)} joined · ends {formatDate(c.endsOn)}</span>
                  </div>

                  {c.status !== "Completed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={async () => {
                        try {
                          if (configured) await live.end(c.id);
                          else await challengeService.updateChallenge(c.id, { status: "Completed" });
                          toast.success(`${c.name} marked complete.`);
                        } catch (err) {
                          toast.error("Couldn't end the challenge", { description: err instanceof Error ? err.message : "Please try again." });
                        }
                      }}
                    >
                      End challenge
                    </Button>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Create challenge"
        description="Members see active challenges on their dashboard."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} loading={saving} disabled={form.name.trim().length < 3}>Publish challenge</Button>
          </>
        }
      >
        <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="chname">Challenge name</Label>
              <Input id="chname" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Wire up your home" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chdesc">Description</Label>
              <Textarea id="chdesc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Buy from 3 different electrical categories this month." />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="chtarget">Target</Label>
                <Input id="chtarget" inputMode="numeric" value={form.target} onChange={(e) => setForm({ ...form, target: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger aria-label="Unit"><SelectValue /></SelectTrigger>
                  <SelectContent>{units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="chpts">Reward points</Label>
                <Input id="chpts" inputMode="numeric" value={form.rewardPoints} onChange={(e) => setForm({ ...form, rewardPoints: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="chend">Ends on</Label>
                <Input id="chend" type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
              </div>
            </div>
          </div>
      </FormDialog>
    </div>
  );
}
