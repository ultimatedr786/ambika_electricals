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
import { formatDate, formatNumber } from "@/lib/utils";

const units = ["purchases", "products", "referrals", "categories", "₹ spent"];

export default function BusinessChallengesPage() {
  const { state } = useStore();
  const { challengeService } = useServices();
  const [tab, setTab] = React.useState("all");
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "", description: "", target: 5, unit: "purchases", rewardPoints: 500, endsOn: "",
  });

  const results = state.challenges.filter((c) => tab === "all" || c.status.toLowerCase() === tab);

  const totals = React.useMemo(() => ({
    active: state.challenges.filter((c) => c.status === "Active").length,
    participants: state.challenges.reduce((s, c) => s + c.participants, 0),
    points: state.challenges.reduce((s, c) => s + c.rewardPoints * c.participants, 0),
  }), [state.challenges]);

  const create = async () => {
    setSaving(true);
    const endsOn = form.endsOn || new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    await challengeService.createChallenge({
      name: form.name, description: form.description, target: form.target, progress: 0,
      unit: form.unit, rewardPoints: form.rewardPoints, endsOn, status: "Active", participants: 0,
    });
    setSaving(false);
    setOpen(false);
    setForm({ name: "", description: "", target: 5, unit: "purchases", rewardPoints: 500, endsOn: "" });
    toast.success("Challenge published to members.");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Challenges"
        description="Gamified goals that keep members coming back to Ambika Electricals."
        actions={<Button onClick={() => setOpen(true)}><Plus /> Create Challenge</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active challenges" value={String(totals.active)} icon={Flag} />
        <StatCard label="Total participants" value={formatNumber(totals.participants)} icon={Users} />
        <StatCard label="Points at stake" value={formatNumber(totals.points)} icon={Zap} />
        <StatCard label="Completed" value={String(state.challenges.filter((c) => c.status === "Completed").length)} icon={Trophy} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
      </Tabs>

      {results.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="No challenges here."
          description="Create a challenge to boost engagement across your member base."
          action={<Button onClick={() => setOpen(true)}><Plus /> Create challenge</Button>}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {results.map((c, i) => {
            const percent = Math.min(100, Math.round((c.progress / c.target) * 100));
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
                      <span className="font-medium tabular">{c.progress} / {c.target} {c.unit}</span>
                    </div>
                    <Progress value={percent} className="mt-1.5" />
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
                        await challengeService.updateChallenge(c.id, { status: "Completed" });
                        toast.success(`${c.name} marked complete.`);
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
