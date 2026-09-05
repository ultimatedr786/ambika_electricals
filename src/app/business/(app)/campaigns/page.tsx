"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { CalendarRange, Megaphone, Pause, Play, Plus, Target, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { CampaignWizard } from "@/components/business/campaign-wizard";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { formatDate, formatINR, formatNumber } from "@/lib/utils";

export default function CampaignsPage() {
  const { state } = useStore();
  const { campaignService } = useServices();
  const [tab, setTab] = React.useState("all");
  const [wizardOpen, setWizardOpen] = React.useState(false);

  const results = state.campaigns.filter((c) => tab === "all" || c.status.toLowerCase() === tab);

  const totals = React.useMemo(() => {
    const cs = state.campaigns;
    return {
      active: cs.filter((c) => c.status === "Active").length,
      reach: cs.reduce((s, c) => s + c.reach, 0),
      redemptions: cs.reduce((s, c) => s + c.redemptions, 0),
      revenue: cs.reduce((s, c) => s + c.revenue, 0),
    };
  }, [state.campaigns]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Campaigns"
        description="Run targeted point offers to bring members back into store."
        actions={<Button onClick={() => setWizardOpen(true)}><Plus /> Create Campaign</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active campaigns" value={String(totals.active)} icon={Megaphone} />
        <StatCard label="Total reach" value={formatNumber(totals.reach)} icon={Users} />
        <StatCard label="Redemptions" value={formatNumber(totals.redemptions)} icon={Target} />
        <StatCard label="Attributed revenue" value={formatINR(totals.revenue)} icon={TrendingUp} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="ended">Ended</TabsTrigger>
        </TabsList>
      </Tabs>

      {results.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns here yet."
          description="Create a campaign to reward members and drive repeat purchases."
          action={<Button onClick={() => setWizardOpen(true)}><Plus /> Create campaign</Button>}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {results.map((c, i) => {
            const conversion = c.reach ? Math.round((c.redemptions / c.reach) * 100) : 0;
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">{c.name}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{c.audience}</Badge>
                    <Badge variant="outline">{c.reward}</Badge>
                  </div>

                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarRange className="size-3.5" aria-hidden />
                    {formatDate(c.startDate)} — {formatDate(c.endDate)}
                  </p>

                  <Separator className="my-4" />

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-sm font-semibold tabular">{formatNumber(c.reach)}</p>
                      <p className="text-[11px] text-muted-foreground">Reach</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold tabular">{formatNumber(c.redemptions)}</p>
                      <p className="text-[11px] text-muted-foreground">Redemptions</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold tabular">{formatINR(c.revenue)}</p>
                      <p className="text-[11px] text-muted-foreground">Revenue</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Conversion</span>
                      <span className="font-medium tabular">{conversion}%</span>
                    </div>
                    <Progress value={conversion} className="mt-1.5" />
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    {c.status === "Active" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await campaignService.updateCampaign(c.id, { status: "Ended" });
                          toast.success(`${c.name} ended.`);
                        }}
                      >
                        <Pause /> End campaign
                      </Button>
                    ) : c.status !== "Ended" ? (
                      <Button
                        size="sm"
                        onClick={async () => {
                          await campaignService.updateCampaign(c.id, { status: "Active" });
                          toast.success(`${c.name} is now live.`);
                        }}
                      >
                        <Play /> Activate
                      </Button>
                    ) : null}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <CampaignWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}
