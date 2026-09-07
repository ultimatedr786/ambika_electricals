"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Target, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/shared/page-header";
import { useStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatNumber } from "@/lib/utils";

interface LiveChallenge {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  target: number;
  progress: number;
  rewardPoints: number;
  endsAt: string;
  completed: boolean;
}

function useLiveChallenges() {
  const configured = isSupabaseConfigured();
  const supabase = React.useMemo(() => createClient(), []);
  const [items, setItems] = React.useState<LiveChallenge[]>([]);
  const [loading, setLoading] = React.useState(configured);

  React.useEffect(() => {
    if (!configured || !supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("my_challenges");
      if (cancelled) return;
      if (!error) {
        setItems(
          ((data ?? []) as Record<string, unknown>[]).map((c) => ({
            id: String(c.id),
            name: String(c.name),
            description: (c.description as string | null) ?? null,
            unit: String(c.unit),
            target: Number(c.target),
            progress: Number(c.progress),
            rewardPoints: Number(c.rewardPoints),
            endsAt: String(c.endsAt),
            completed: Boolean(c.completed),
          }))
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, supabase]);

  return { configured, items, loading };
}

export default function ChallengesPage() {
  const { state } = useStore();
  const live = useLiveChallenges();
  const configured = live.configured;

  interface ViewChallenge {
    id: string; name: string; description: string; unit: string;
    target: number; progress: number; rewardPoints: number; endsOn: string;
    participants: number | null; done: boolean;
  }
  const all: ViewChallenge[] = configured
    ? live.items.map((c) => ({
        id: c.id, name: c.name, description: c.description ?? "", unit: c.unit,
        target: c.target, progress: c.progress, rewardPoints: c.rewardPoints,
        endsOn: c.endsAt, participants: null, done: c.completed,
      }))
    : state.challenges.map((c) => ({
        id: c.id, name: c.name, description: c.description, unit: c.unit,
        target: c.target, progress: c.progress, rewardPoints: c.rewardPoints,
        endsOn: c.endsOn, participants: c.participants, done: c.status !== "Active",
      }));
  const active = all.filter((c) => !c.done);
  const done = all.filter((c) => c.done);
  const potential = active.reduce((s, c) => s + c.rewardPoints, 0);
  const loading = configured && live.loading;

  return (
    <div className="space-y-4 flex-1 min-h-0 flex flex-col">
      <div className="space-y-4 shrink-0">
        <PageHeader
          title="Challenges"
          description="Complete these to earn bonus points on your electrical purchases."
        />

        <Card className="flex items-center gap-4 bg-gradient-to-r from-accent/70 to-accent/20 p-5">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Trophy className="size-5" />
          </span>
          <div>
            <p className="text-sm text-muted-foreground">Up for grabs this month</p>
            <p className="text-2xl font-semibold tabular">{formatNumber(potential)} points</p>
          </div>
        </Card>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          Loading challenges…
        </div>
      ) : (
      <div className="space-y-5 flex-1 min-h-0 overflow-y-auto scroll-region p-1">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">In progress</h2>
          {active.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium">{c.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{c.description}</p>
                  </div>
                  <Badge variant="warning" className="shrink-0"><Target className="size-3" /> +{c.rewardPoints}</Badge>
                </div>
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-[13px]">
                    <span className="text-muted-foreground">{Math.min(c.progress, c.target)} of {c.target} {c.unit}</span>
                    <span className="font-medium tabular">{Math.min(100, Math.round((c.progress / c.target) * 100))}%</span>
                  </div>
                  <Progress value={Math.min(100, (c.progress / c.target) * 100)} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Ends {formatDate(c.endsOn, "long")}
                  {c.participants !== null && ` · ${formatNumber(c.participants)} members taking part`}
                </p>
              </Card>
            </motion.div>
          ))}
        </section>

        {done.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Completed</h2>
            {done.map((c) => (
              <Card key={c.id} className="flex items-center gap-3.5 p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                  <CheckCircle2 className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-[13px] text-muted-foreground">{c.description}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular text-success">+{c.rewardPoints}</span>
              </Card>
            ))}
          </section>
        )}
      </div>
      )}
    </div>
  );
}
