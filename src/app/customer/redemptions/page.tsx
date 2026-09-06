"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Copy, Gift, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductArt } from "@/components/shared/product-art";
import { QRCode } from "@/components/shared/qr-code";
import { useCurrentCustomer, useStore } from "@/lib/store";
import { LiveRedemptionsPanel } from "@/components/customer/live-redemptions-panel";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { formatDate, formatINR, formatNumber } from "@/lib/utils";
import type { Redemption } from "@/types";

const groups: Record<string, string[]> = {
  active: ["Pending", "Confirmed", "Ready for Pickup"],
  completed: ["Completed"],
  expired: ["Expired"],
  cancelled: ["Cancelled"],
};

export default function RedemptionsPage() {
  const customer = useCurrentCustomer();
  const { state } = useStore();
  const [tab, setTab] = React.useState("active");
  const [open, setOpen] = React.useState<Redemption | null>(null);

  const list = state.redemptions
    .filter((r) => r.customerId === customer.id)
    .filter((r) => groups[tab].includes(r.status));

  return (
    <div className="space-y-5">
      <PageHeader title="My redemptions" description="Track every reward you've unlocked." />

      {/* Live Supabase redemption history — renders only when auth is configured */}
      <LiveRedemptionsPanel />

      {isSupabaseConfigured() && (
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Prototype history</h2>
          <span className="rounded-md border border-dashed px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Demo data — migrates in a later slice
          </span>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full overflow-x-auto no-scrollbar sm:w-auto">
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="expired">Expired</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      {list.length === 0 ? (
        <EmptyState
          icon={Gift}
          title="Nothing here yet"
          description="Redeem a reward and it will show up here with its pickup code."
          action={<Button asChild><Link href="/customer/rewards">Browse Rewards Store</Link></Button>}
        />
      ) : (
        <div className="space-y-3">
          {list.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="p-4">
                <div className="flex gap-3.5">
                  <ProductArt art={r.lines[0].image} className="size-16 shrink-0 sm:size-20" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {r.lines[0].name}
                          {r.lines.length > 1 && <span className="text-muted-foreground"> +{r.lines.length - 1} more</span>}
                        </p>
                        <p className="mt-0.5 text-[13px] text-muted-foreground tabular">
                          {formatNumber(r.pointsUsed)} points{r.cashPaid > 0 && ` + ${formatINR(r.cashPaid)}`} · Redeemed {formatDate(r.createdAt, "long")}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground tabular">Redemption ID {r.redemptionId}</p>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setOpen(r)}><QrCode /> Show QR</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { navigator.clipboard?.writeText(r.code); toast.success("Copied to clipboard"); }}
                      >
                        <Copy /> {r.code}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reward pass</DialogTitle>
            <DialogDescription>Show this at Ambika Electricals to collect your reward.</DialogDescription>
          </DialogHeader>
          <DialogBody className="pb-6">
          {open && (
            <div className="text-center">
              <div className="mx-auto size-52 rounded-xl border bg-white p-3">
                <QRCode value={open.code} />
              </div>
              <p className="mt-4 text-lg font-semibold tabular tracking-wider">{open.code}</p>
              <p className="text-sm text-muted-foreground">{open.redemptionId}</p>
              <Separator className="my-4" />
              <div className="space-y-1.5 text-left text-sm">
                <Row label="Reward" value={open.lines[0].name} />
                <Row label="Points used" value={`${formatNumber(open.pointsUsed)} pts`} />
                {open.cashPaid > 0 && <Row label="Cash payable" value={formatINR(open.cashPaid)} />}
                <Row label="Collect at" value={open.fulfilment === "pickup" ? open.store : "Home delivery"} />
                <Row label="Expires" value={formatDate(open.expiresAt, "long")} />
              </div>
              <Button
                className="mt-5 w-full"
                variant="outline"
                onClick={() => { navigator.clipboard?.writeText(open.code); toast.success("Copied to clipboard"); }}
              >
                <Copy /> Copy Code
              </Button>
            </div>
          )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
