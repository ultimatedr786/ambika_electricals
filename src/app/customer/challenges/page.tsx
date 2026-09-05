"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Target, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/shared/page-header";
import { useStore } from "@/lib/store";
import { formatDate, formatNumber } from "@/lib/utils";

export default function ChallengesPage() {
  const { state } = useStore();
  const active = state.challenges.filter((c) => c.status === "Active");
  const done = state.challenges.filter((c) => c.status !== "Active");
  const potential = active.reduce((s, c) => s + c.rewardPoints, 0);

  return (
    <div className="space-y-5">
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
                  <span className="text-muted-foreground">{c.progress} of {c.target} {c.unit}</span>
                  <span className="font-medium tabular">{Math.round((c.progress / c.target) * 100)}%</span>
                </div>
                <Progress value={(c.progress / c.target) * 100} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Ends {formatDate(c.endsOn, "long")} · {formatNumber(c.participants)} members taking part
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
  );
}
