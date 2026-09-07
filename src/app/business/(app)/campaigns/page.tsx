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
import { useLiveCampaigns } from "@/lib/campaigns/use-live-campaigns";
import { formatDate, formatINR, formatNumber } from "@/lib/utils";

export default function CampaignsPage() {
  const { state } = useStore();
  const { campaignService } = useServices();
  const live = useLiveCampaigns();
  const configured = live.configured;
  const [tab, setTab] = React.useState("all");
  const [wizardOpen, setWizardOpen] = React.useState(false);

  interface ViewCampaign {
    id: string; name: string; description: string; audience: string; reward: string;
    status: "Active" | "Scheduled" | "Draft" | "Ended"; startDate: string; endDate: string;
    reach: number; redemptions: number; revenue: number;
  }
  const STATUS_LABEL: Record<string, ViewCampaign["status"]> = {
    draft: "Draft", scheduled: "Scheduled", active: "Active", ended: "Ended",
  };
  const all: ViewCampaign[] = configured
    ? live.items.map((c) => ({
        id: c.id, name: c.name, description: c.description ?? "", audience: c.audience, reward: c.reward,
        status: STATUS_LABEL[c.status], startDate: c.startsAt, endDate: c.endsAt,
        reach: live.activeMembers, redemptions: 0, revenue: 0,
      }))
    : state.campaigns;

  const results = all.filter((c) => tab === "all" || c.status.toLowerCase() === tab);

  const totals = {
    active: all.filter((c) => c.status === "Active").length,
    reach: all.reduce((s, c) => s + c.reach, 0),
    redemptions: all.reduce((s, c) => s + c.redemptions, 0),
    revenue: all.reduce((s, c) => s + c.revenue, 0),
  };

  return (
    <div className="space-y-4 flex-1 min-h-0 flex flex-col">
      <div className="space-y-4 shrink-0">
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
      </div>

      {configured && live.loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          Loading campaigns…
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns here yet."
          description="Create a campaign to reward members and drive repeat purchases."
          action={<Button onClick={() => setWizardOpen(true)}><Plus /> Create campaign</Button>}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 flex-1 min-h-0 overflow-y-auto scroll-region p-1">
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
                          try {
                            if (configured) await live.setStatus(c.id, "ended");
                            else await campaignService.updateCampaign(c.id, { status: "Ended" });
                            toast.success(`${c.name} ended.`);
                          } catch (err) {
                            toast.error("Couldn't end the campaign", { description: err instanceof Error ? err.message : "Please try again." });
                          }
                        }}
                      >
                        <Pause /> End campaign
                      </Button>
                    ) : c.status !== "Ended" ? (
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            if (configured) await live.setStatus(c.id, "active");
                            else await campaignService.updateCampaign(c.id, { status: "Active" });
                            toast.success(`${c.name} is now live.`);
                          } catch (err) {
                            toast.error("Couldn't activate the campaign", { description: err instanceof Error ? err.message : "Please try again." });
                          }
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
