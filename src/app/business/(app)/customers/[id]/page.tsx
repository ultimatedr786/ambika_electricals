"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, Award, Gift, Minus, Plus, Receipt, ShoppingCart, Sparkles, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TierBadge } from "@/components/shared/tier-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ProductArt } from "@/components/shared/product-art";
import { QRCode } from "@/components/shared/qr-code";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { tierProgress } from "@/lib/points";
import { formatDate, formatINR, formatNumber, initials, relativeTime } from "@/lib/utils";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state } = useStore();
  const { customerService } = useServices();
  const customer = state.customers.find((c) => c.id === params.id);

  const sales = React.useMemo(
    () => (customer ? state.sales.filter((s) => s.customerId === customer.id) : []),
    [state.sales, customer]
  );
  const favouriteCategory = React.useMemo(() => {
    const counts = new Map<string, number>();
    sales.forEach((s) =>
      s.items.forEach((i) => {
        const p = state.products.find((x) => x.id === i.productId);
        if (p) counts.set(p.category, (counts.get(p.category) ?? 0) + i.qty);
      })
    );
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  }, [sales, state.products]);

  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [delta, setDelta] = React.useState(100);
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState(customer?.notes ?? "");

  if (!customer) {
    return (
      <ErrorState
        message="Customer not found. This member may have been removed or the link is incorrect."
        onRetry={() => router.push("/business/customers")}
      />
    );
  }

  const transactions = state.transactions.filter((t) => t.customerId === customer.id);
  const redemptions = state.redemptions.filter((r) => r.customerId === customer.id);
  const progress = tierProgress(customer.lifetimePoints);
  const avgOrder = sales.length ? customer.lifetimeSpend / customer.purchases : 0;


  const applyAdjust = async () => {
    await customerService.updateCustomer(customer.id, {
      points: Math.max(0, customer.points + delta),
      lifetimePoints: delta > 0 ? customer.lifetimePoints + delta : customer.lifetimePoints,
    });
    setAdjustOpen(false);
    setReason("");
    toast.success(`${delta > 0 ? "Added" : "Deducted"} ${Math.abs(delta)} points`, {
      description: `${customer.name}'s balance is now ${formatNumber(Math.max(0, customer.points + delta))} points.`,
    });
  };

  const saveNotes = async () => {
    await customerService.updateCustomer(customer.id, { notes });
    toast.success("Notes saved.");
  };

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/business/customers"><ArrowLeft /> All customers</Link>
      </Button>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="size-14"><AvatarFallback className="text-base">{initials(customer.name)}</AvatarFallback></Avatar>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{customer.name}</h1>
                <TierBadge tier={customer.tier} />
                <StatusBadge status={customer.status} />
              </div>
              <p className="mt-1 text-sm tabular text-muted-foreground">
                {customer.membershipId} · {customer.phone}
              </p>
              <p className="text-sm text-muted-foreground">{customer.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Member since {formatDate(customer.memberSince)} · {customer.store}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setAdjustOpen(true)}><Sparkles /> Adjust points</Button>
            <Button asChild><Link href="/business/sales/new"><ShoppingCart /> New sale</Link></Button>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
          <Metric label="Points balance" value={formatNumber(customer.points)} />
          <Metric label="Lifetime points" value={formatNumber(customer.lifetimePoints)} />
          <Metric label="Redeemed" value={formatNumber(customer.redeemedPoints)} />
          <Metric label="Lifetime spend" value={formatINR(customer.lifetimeSpend)} />
          <Metric label="Purchases" value={String(customer.purchases)} />
          <Metric label="Avg. order" value={formatINR(Math.round(avgOrder))} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Tier progress</h2>
            <span className="text-xs text-muted-foreground">{progress.current.name} tier · {progress.current.multiplier}x points</span>
          </div>
          <Progress value={progress.percent} className="mt-3" />
          <p className="mt-2 text-sm text-muted-foreground">
            {progress.next
              ? <>{formatNumber(progress.pointsToNext)} lifetime points to <span className="font-medium text-foreground">{progress.next.name}</span>.</>
              : "Highest tier reached — 2x points on every purchase."}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Insight icon={Award} label="Favourite category" value={favouriteCategory} />
            <Insight icon={Users} label="Referrals" value={String(customer.referrals)} />
            <Insight icon={Receipt} label="Last purchase" value={relativeTime(customer.lastPurchase)} />
            <Insight icon={Gift} label="Redemptions" value={String(redemptions.length)} />
          </div>
        </Card>

        <Card className="flex flex-col items-center justify-center gap-3 p-5">
          <QRCode value={customer.membershipId} className="size-32" />
          <div className="text-center">
            <p className="text-sm font-medium tabular">{customer.membershipId}</p>
            <p className="text-xs text-muted-foreground">Scan at checkout to identify this member</p>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="purchases">
        <TabsList>
          <TabsTrigger value="purchases">Purchases ({sales.length})</TabsTrigger>
          <TabsTrigger value="points">Points ({transactions.length})</TabsTrigger>
          <TabsTrigger value="redemptions">Redemptions ({redemptions.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="purchases" className="mt-4">
          {sales.length === 0 ? (
            <EmptyState icon={Receipt} title="No purchases yet." description="This member hasn't bought anything so far." />
          ) : (
            <div className="space-y-2.5">
              {sales.map((s, i) => (
                <motion.div key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium tabular">{s.invoice}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(s.date)} · {s.store} · {s.staff}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular">{formatINR(s.amount)}</p>
                        <p className="text-xs tabular text-success">+{formatNumber(s.points)} pts</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {s.items.map((it) => (
                        <div key={it.productId} className="flex items-center gap-2 rounded-lg border bg-muted/40 px-2 py-1">
                          <ProductArt art={state.products.find((p) => p.id === it.productId)?.image ?? "box"} className="size-6" tone="muted" />
                          <span className="text-xs">{it.name}</span>
                          <Badge variant="secondary" className="text-[10px]">×{it.qty}</Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="points" className="mt-4">
          {transactions.length === 0 ? (
            <EmptyState icon={Sparkles} title="No points activity yet." />
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <p className="text-sm font-medium">{t.title}</p>
                        {t.subtitle && <p className="text-xs text-muted-foreground">{t.subtitle}</p>}
                      </TableCell>
                      <TableCell className="tabular text-muted-foreground">{t.reference ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(t.date)}</TableCell>
                      <TableCell className={`text-right font-medium tabular ${t.type === "redeemed" ? "text-destructive" : "text-success"}`}>
                        {t.type === "redeemed" ? "−" : "+"}{formatNumber(Math.abs(t.points))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="redemptions" className="mt-4">
          {redemptions.length === 0 ? (
            <EmptyState icon={Gift} title="No rewards redeemed yet." description="Encourage this member to browse the rewards store." />
          ) : (
            <div className="space-y-2.5">
              {redemptions.map((r) => (
                <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium">{r.lines.map((l) => l.name).join(", ")}</p>
                    <p className="text-xs tabular text-muted-foreground">{r.redemptionId} · code {r.code} · {formatDate(r.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm tabular text-muted-foreground">−{formatNumber(r.pointsUsed)} pts</span>
                    <StatusBadge status={r.status} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card className="space-y-3 p-5">
            <Label htmlFor="notes">Internal notes</Label>
            <Textarea
              id="notes"
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Contractor — prefers Polycab wires, buys in bulk before Diwali."
            />
            <div className="flex justify-end"><Button onClick={saveNotes}>Save notes</Button></div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust points</DialogTitle>
            <DialogDescription>Manually add or deduct points for {customer.name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" size="icon" onClick={() => setDelta((d) => d - 50)} aria-label="Decrease"><Minus /></Button>
              <Input
                className="w-32 text-center text-lg font-semibold tabular"
                value={delta}
                inputMode="numeric"
                onChange={(e) => setDelta(Number(e.target.value.replace(/[^\d-]/g, "")) || 0)}
                aria-label="Points adjustment"
              />
              <Button variant="outline" size="icon" onClick={() => setDelta((d) => d + 50)} aria-label="Increase"><Plus /></Button>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              New balance: <span className="font-medium tabular text-foreground">{formatNumber(Math.max(0, customer.points + delta))} pts</span>
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Goodwill adjustment, festive bonus…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button onClick={applyAdjust} disabled={delta === 0 || !reason.trim()}>Apply adjustment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular">{value}</p>
    </div>
  );
}

function Insight({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <p className="mt-1.5 text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  );
}
