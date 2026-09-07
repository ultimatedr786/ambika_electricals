"use client";

import type { LucideIcon } from "lucide-react";
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
import { FormDialog } from "@/components/shared/form-dialog";
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
import { isSupabaseConfigured } from "@/lib/auth/env";
import { createClient } from "@/lib/supabase/client";
import { adjustPointsAction } from "../customers-actions";

const MEMBERSHIP_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  pending: "Pending",
  blocked: "Disabled",
  closed: "Inactive",
};
const SOURCE_LABEL: Record<string, string> = {
  sale: "Purchase",
  redemption: "Reward redemption",
  manual: "Store adjustment",
  welcome: "Welcome bonus",
  referral: "Referral bonus",
  birthday: "Birthday bonus",
  campaign: "Campaign",
  adjustment: "Adjustment",
  import: "Imported balance",
};

interface LiveSale {
  id: string;
  invoiceNo: string;
  totalPaise: number;
  totalPoints: number;
  soldAt: string;
  storeName: string;
  items: { name: string; qty: number }[];
}
interface LiveLedgerEntry {
  id: number;
  entryType: string;
  points: number;
  sourceType: string;
  reason: string | null;
  createdAt: string;
}
interface LiveRedemption {
  id: string;
  reference: string;
  rewardName: string;
  qty: number;
  pointsUsed: number;
  status: string;
  codeLast4: string;
  createdAt: string;
}
interface LiveMembership {
  id: string;
  businessId: string;
  name: string;
  phone: string;
  membershipNo: string;
  status: string;
  enrolledAt: string;
  storeName: string;
}

function useLiveCustomerDetail(membershipId: string) {
  const configured = isSupabaseConfigured();
  const supabase = React.useMemo(() => createClient(), []);
  const [membership, setMembership] = React.useState<LiveMembership | null | undefined>(undefined);
  const [balance, setBalance] = React.useState({ current: 0, earned: 0, redeemed: 0 });
  const [sales, setSales] = React.useState<LiveSale[]>([]);
  const [ledger, setLedger] = React.useState<LiveLedgerEntry[]>([]);
  const [redemptions, setRedemptions] = React.useState<LiveRedemption[]>([]);
  const [favouriteCategory, setFavouriteCategory] = React.useState("—");
  const [viewerRole, setViewerRole] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(configured);

  const reload = React.useCallback(async () => {
    if (!configured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const [memRes, meRes] = await Promise.all([
        supabase
          .from("customer_memberships")
          .select("id, business_id, membership_no, display_name, phone_masked, status, enrolled_at, enrolled_store_id, stores(name)")
          .eq("id", membershipId)
          .maybeSingle(),
        supabase.from("business_memberships").select("role").eq("profile_id", user.id).eq("status", "active").limit(1).maybeSingle(),
      ]);
      setViewerRole((meRes.data as { role: string } | null)?.role ?? null);

      const m = memRes.data as {
        id: string; business_id: string; membership_no: string; display_name: string | null;
        phone_masked: string | null; status: string; enrolled_at: string;
        stores: { name: string } | null;
      } | null;
      if (!m) {
        setMembership(null);
        return;
      }
      setMembership({
        id: m.id,
        businessId: m.business_id,
        name: m.display_name ?? "Member",
        phone: m.phone_masked ?? "",
        membershipNo: m.membership_no,
        status: MEMBERSHIP_STATUS_LABEL[m.status] ?? m.status,
        enrolledAt: m.enrolled_at,
        storeName: m.stores?.name ?? "—",
      });

      const [balRes, salesRes, ledgerRes, redRes] = await Promise.all([
        supabase.from("customer_points_balance").select("current_points, lifetime_earned, lifetime_redeemed").eq("customer_membership_id", membershipId).maybeSingle(),
        supabase
          .from("sales")
          .select("id, invoice_no, total_paise, total_points, sold_at, store_id, stores(name), sale_items(name_snapshot, qty, product_id)")
          .eq("customer_membership_id", membershipId)
          .eq("status", "completed")
          .order("sold_at", { ascending: false })
          .limit(200),
        supabase
          .from("points_ledger")
          .select("id, entry_type, points, source_type, reason, created_at")
          .eq("customer_membership_id", membershipId)
          .order("id", { ascending: false })
          .limit(200),
        supabase
          .from("redemptions")
          .select("id, reference, qty, points_used, status, code_last4, created_at, rewards(name)")
          .eq("customer_membership_id", membershipId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const b = balRes.data as { current_points: number; lifetime_earned: number; lifetime_redeemed: number } | null;
      setBalance({ current: Number(b?.current_points ?? 0), earned: Number(b?.lifetime_earned ?? 0), redeemed: Number(b?.lifetime_redeemed ?? 0) });

      const saleRows = ((salesRes.data ?? []) as unknown as Record<string, unknown>[]).map((s) => ({
        id: String(s.id),
        invoice_no: String(s.invoice_no),
        total_paise: Number(s.total_paise),
        total_points: Number(s.total_points),
        sold_at: String(s.sold_at),
        stores: (s.stores ?? null) as { name: string } | null,
        sale_items: (s.sale_items ?? []) as { name_snapshot: string; qty: number; product_id: string | null }[],
      }));
      setSales(
        saleRows.map((s) => ({
          id: s.id, invoiceNo: s.invoice_no, totalPaise: Number(s.total_paise), totalPoints: Number(s.total_points),
          soldAt: s.sold_at, storeName: s.stores?.name ?? "—",
          items: (s.sale_items ?? []).map((i) => ({ name: i.name_snapshot, qty: Number(i.qty) })),
        }))
      );

      const productIds = [...new Set(saleRows.flatMap((s) => s.sale_items ?? []).map((i) => i.product_id).filter((x): x is string => !!x))];
      if (productIds.length > 0) {
        const { data: prodRes } = await supabase.from("products").select("id, category").in("id", productIds);
        const catByProduct = new Map(((prodRes ?? []) as { id: string; category: string | null }[]).map((p) => [p.id, p.category]));
        const counts = new Map<string, number>();
        for (const s of saleRows) {
          for (const item of s.sale_items ?? []) {
            const cat = item.product_id ? catByProduct.get(item.product_id) : null;
            if (cat) counts.set(cat, (counts.get(cat) ?? 0) + Number(item.qty));
          }
        }
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        setFavouriteCategory(top?.[0] ?? "—");
      } else {
        setFavouriteCategory("—");
      }

      setLedger(
        ((ledgerRes.data ?? []) as { id: number; entry_type: string; points: number; source_type: string; reason: string | null; created_at: string }[]).map((e) => ({
          id: e.id, entryType: e.entry_type, points: Number(e.points), sourceType: e.source_type, reason: e.reason, createdAt: e.created_at,
        }))
      );

      setRedemptions(
        ((redRes.data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
          const reward = (r.rewards ?? {}) as { name?: string };
          return {
            id: String(r.id), reference: String(r.reference), rewardName: reward.name ?? "Reward", qty: Number(r.qty ?? 1),
            pointsUsed: Number(r.points_used ?? 0), status: String(r.status), codeLast4: String(r.code_last4 ?? ""),
            createdAt: String(r.created_at),
          };
        })
      );
    } finally {
      setLoading(false);
    }
  }, [configured, supabase, membershipId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  return { configured, membership, balance, sales, ledger, redemptions, favouriteCategory, viewerRole, loading, reload };
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state } = useStore();
  const { customerService } = useServices();
  const live = useLiveCustomerDetail(params.id);
  const configured = live.configured;
  const mockCustomer = state.customers.find((c) => c.id === params.id);

  const mockSales = React.useMemo(
    () => (mockCustomer ? state.sales.filter((s) => s.customerId === mockCustomer.id) : []),
    [state.sales, mockCustomer]
  );
  const mockFavouriteCategory = React.useMemo(() => {
    const counts = new Map<string, number>();
    mockSales.forEach((s) =>
      s.items.forEach((i) => {
        const p = state.products.find((x) => x.id === i.productId);
        if (p) counts.set(p.category, (counts.get(p.category) ?? 0) + i.qty);
      })
    );
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  }, [mockSales, state.products]);

  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [delta, setDelta] = React.useState(100);
  const [reason, setReason] = React.useState("");
  const [adjustBusy, setAdjustBusy] = React.useState(false);
  const [notes, setNotes] = React.useState(mockCustomer?.notes ?? "");

  if (configured) {
    if (live.membership === undefined || live.loading) {
      return (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          Loading customer…
        </div>
      );
    }
    if (live.membership === null) {
      return (
        <ErrorState
          message="Customer not found. This member may have been removed or the link is incorrect."
          onRetry={() => router.push("/business/customers")}
        />
      );
    }
  } else if (!mockCustomer) {
    return (
      <ErrorState
        message="Customer not found. This member may have been removed or the link is incorrect."
        onRetry={() => router.push("/business/customers")}
      />
    );
  }

  const canAdjust = configured ? live.viewerRole === "owner" : true;
  const spendPaise = configured ? live.sales.reduce((s, x) => s + x.totalPaise, 0) : 0;
  const purchases = configured ? live.sales.length : mockSales.length;
  const avgOrder = configured
    ? (purchases ? spendPaise / 100 / purchases : 0)
    : mockSales.length
    ? (mockCustomer as NonNullable<typeof mockCustomer>).lifetimeSpend / (mockCustomer as NonNullable<typeof mockCustomer>).purchases
    : 0;

  const applyAdjust = async () => {
    if (configured) {
      if (!live.membership || delta === 0 || !reason.trim()) return;
      setAdjustBusy(true);
      try {
        const key = `adjust:${live.membership.id}:${Date.now()}`;
        const result = await adjustPointsAction(live.membership.businessId, live.membership.id, delta, reason.trim(), key);
        if (!result.ok) {
          toast.error("Couldn't adjust points", { description: result.message });
          return;
        }
        setAdjustOpen(false);
        setReason("");
        await live.reload();
        toast.success(`${delta > 0 ? "Added" : "Deducted"} ${Math.abs(delta)} points`, {
          description: `${live.membership.name}'s balance is now ${formatNumber(result.data.balanceAfter)} points.`,
        });
      } finally {
        setAdjustBusy(false);
      }
      return;
    }
    if (!mockCustomer) return;
    await customerService.updateCustomer(mockCustomer.id, {
      points: Math.max(0, mockCustomer.points + delta),
      lifetimePoints: delta > 0 ? mockCustomer.lifetimePoints + delta : mockCustomer.lifetimePoints,
    });
    setAdjustOpen(false);
    setReason("");
    toast.success(`${delta > 0 ? "Added" : "Deducted"} ${Math.abs(delta)} points`, {
      description: `${mockCustomer.name}'s balance is now ${formatNumber(Math.max(0, mockCustomer.points + delta))} points.`,
    });
  };

  const saveNotes = async () => {
    if (!mockCustomer) return;
    await customerService.updateCustomer(mockCustomer.id, { notes });
    toast.success("Notes saved.");
  };

  const name = configured ? live.membership!.name : mockCustomer!.name;
  const membershipId = configured ? live.membership!.membershipNo : mockCustomer!.membershipId;
  const phone = configured ? live.membership!.phone : mockCustomer!.phone;
  const currentPoints = configured ? live.balance.current : mockCustomer!.points;
  const progress = configured ? null : tierProgress(mockCustomer!.lifetimePoints);
  const realTier = configured ? tierProgress(live.balance.earned).current.name : null;

  return (
    <div className="space-y-5 flex-1 min-h-0 overflow-y-auto scroll-region pb-6 pr-1">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/business/customers"><ArrowLeft /> All customers</Link>
      </Button>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="size-14"><AvatarFallback className="text-base">{initials(name)}</AvatarFallback></Avatar>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
                {configured ? (
                  <>
                    <TierBadge tier={realTier!} />
                    <StatusBadge status={live.membership!.status} />
                  </>
                ) : (
                  <>
                    <TierBadge tier={mockCustomer!.tier} />
                    <StatusBadge status={mockCustomer!.status} />
                  </>
                )}
              </div>
              <p className="mt-1 text-sm tabular text-muted-foreground">
                {membershipId}{phone && ` · ${phone}`}
              </p>
              {!configured && <p className="text-sm text-muted-foreground">{mockCustomer!.email}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {configured
                  ? <>Member since {formatDate(live.membership!.enrolledAt)} · {live.membership!.storeName}</>
                  : <>Member since {formatDate(mockCustomer!.memberSince)} · {mockCustomer!.store}</>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canAdjust && <Button variant="outline" onClick={() => setAdjustOpen(true)}><Sparkles /> Adjust points</Button>}
            <Button asChild><Link href="/business/sales/new"><ShoppingCart /> New sale</Link></Button>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
          <Metric label="Points balance" value={formatNumber(currentPoints)} />
          <Metric label="Lifetime points" value={formatNumber(configured ? live.balance.earned : mockCustomer!.lifetimePoints)} />
          <Metric label="Redeemed" value={formatNumber(configured ? live.balance.redeemed : mockCustomer!.redeemedPoints)} />
          <Metric label="Lifetime spend" value={formatINR(configured ? spendPaise / 100 : mockCustomer!.lifetimeSpend)} />
          <Metric label="Purchases" value={String(purchases)} />
          <Metric label="Avg. order" value={formatINR(Math.round(avgOrder))} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {!configured && progress && (
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
              <Insight icon={Award} label="Favourite category" value={mockFavouriteCategory} />
              <Insight icon={Users} label="Referrals" value={String(mockCustomer!.referrals)} />
              <Insight icon={Receipt} label="Last purchase" value={relativeTime(mockCustomer!.lastPurchase)} />
              <Insight icon={Gift} label="Redemptions" value={String(state.redemptions.filter((r) => r.customerId === mockCustomer!.id).length)} />
            </div>
          </Card>
        )}

        {configured && (
          <Card className="p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold">Member insights</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Insight icon={Award} label="Favourite category" value={live.favouriteCategory} />
              <Insight icon={Receipt} label="Last purchase" value={live.sales[0] ? relativeTime(live.sales[0].soldAt) : "—"} />
              <Insight icon={Gift} label="Redemptions" value={String(live.redemptions.length)} />
            </div>
          </Card>
        )}

        <Card className="flex flex-col items-center justify-center gap-3 p-5">
          <QRCode value={membershipId} className="size-32" />
          <div className="text-center">
            <p className="text-sm font-medium tabular">{membershipId}</p>
            <p className="text-xs text-muted-foreground">Scan at checkout to identify this member</p>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="purchases">
        <TabsList>
          <TabsTrigger value="purchases">Purchases ({configured ? live.sales.length : mockSales.length})</TabsTrigger>
          <TabsTrigger value="points">Points ({configured ? live.ledger.length : state.transactions.filter((t) => t.customerId === mockCustomer!.id).length})</TabsTrigger>
          <TabsTrigger value="redemptions">Redemptions ({configured ? live.redemptions.length : state.redemptions.filter((r) => r.customerId === mockCustomer!.id).length})</TabsTrigger>
          {!configured && <TabsTrigger value="notes">Notes</TabsTrigger>}
        </TabsList>

        <TabsContent value="purchases" className="mt-4">
          {configured ? (
            live.sales.length === 0 ? (
              <EmptyState icon={Receipt} title="No purchases yet." description="This member hasn't bought anything so far." />
            ) : (
              <div className="space-y-2.5">
                {live.sales.map((s, i) => (
                  <motion.div key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                    <Card className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium tabular">{s.invoiceNo}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(s.soldAt)} · {s.storeName}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular">{formatINR(s.totalPaise / 100)}</p>
                          <p className="text-xs tabular text-success">+{formatNumber(s.totalPoints)} pts</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {s.items.map((it, idx) => (
                          <div key={idx} className="flex items-center gap-2 rounded-lg border bg-muted/40 px-2 py-1">
                            <span className="text-xs">{it.name}</span>
                            <Badge variant="secondary" className="text-[10px]">×{it.qty}</Badge>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )
          ) : mockSales.length === 0 ? (
            <EmptyState icon={Receipt} title="No purchases yet." description="This member hasn't bought anything so far." />
          ) : (
            <div className="space-y-2.5">
              {mockSales.map((s, i) => (
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
          {configured ? (
            live.ledger.length === 0 ? (
              <EmptyState icon={Sparkles} title="No points activity yet." />
            ) : (
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Activity</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Points</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {live.ledger.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>
                          <p className="text-sm font-medium">{SOURCE_LABEL[e.sourceType] ?? e.sourceType}</p>
                          {e.reason && <p className="text-xs text-muted-foreground">{e.reason}</p>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(e.createdAt)}</TableCell>
                        <TableCell className={`text-right font-medium tabular ${e.points < 0 ? "text-destructive" : "text-success"}`}>
                          {e.points >= 0 ? "+" : "−"}{formatNumber(Math.abs(e.points))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )
          ) : (
            (() => {
              const transactions = state.transactions.filter((t) => t.customerId === mockCustomer!.id);
              return transactions.length === 0 ? (
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
              );
            })()
          )}
        </TabsContent>

        <TabsContent value="redemptions" className="mt-4">
          {configured ? (
            live.redemptions.length === 0 ? (
              <EmptyState icon={Gift} title="No rewards redeemed yet." description="Encourage this member to browse the rewards store." />
            ) : (
              <div className="space-y-2.5">
                {live.redemptions.map((r) => (
                  <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="text-sm font-medium">{r.rewardName}{r.qty > 1 ? ` ×${r.qty}` : ""}</p>
                      <p className="text-xs tabular text-muted-foreground">{r.reference} · code ••••{r.codeLast4} · {formatDate(r.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm tabular text-muted-foreground">−{formatNumber(r.pointsUsed)} pts</span>
                      <StatusBadge status={r.status.charAt(0).toUpperCase() + r.status.slice(1)} />
                    </div>
                  </Card>
                ))}
              </div>
            )
          ) : (
            (() => {
              const redemptions = state.redemptions.filter((r) => r.customerId === mockCustomer!.id);
              return redemptions.length === 0 ? (
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
              );
            })()
          )}
        </TabsContent>

        {!configured && (
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
        )}
      </Tabs>

      <FormDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        title="Adjust points"
        description={`Manually add or deduct points for ${name}.`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button onClick={applyAdjust} loading={adjustBusy} disabled={delta === 0 || !reason.trim()}>Apply adjustment</Button>
          </>
        }
      >
          <div className="space-y-4 py-2">
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
              New balance: <span className="font-medium tabular text-foreground">{formatNumber(Math.max(0, currentPoints + delta))} pts</span>
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Goodwill adjustment, festive bonus…" />
            </div>
          </div>
      </FormDialog>
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

function Insight({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <p className="mt-1.5 text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  );
}
