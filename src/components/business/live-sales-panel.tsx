"use client";

import * as React from "react";
import { toast } from "sonner";
import { Ban, Receipt, Sparkles, Store, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormDialog } from "@/components/shared/form-dialog";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { formatINR, relativeTime } from "@/lib/utils";
import { voidSaleAction } from "@/app/business/(app)/sales/sales-actions";

/**
 * Live sales ledger (Step 3 Slice 2) — real Supabase sales, rendered above the
 * prototype sales list.
 *
 * Reads obey the RLS matrix: staff+ see every sale of their business, never
 * another tenant's. Voiding goes through the `void_sale` RPC (manager+,
 * reason required): the row flips to `voided` and the points are reversed by
 * a compensating ledger entry — nothing is ever deleted.
 */

interface LiveSaleRow {
  id: string;
  invoiceNo: string;
  status: "completed" | "voided" | "refunded";
  totalPaise: number;
  totalPoints: number;
  soldAt: string;
  storeId: string;
  membershipId: string | null;
  membershipNo: string | null;
  soldBy: string | null;
  voidReason: string | null;
}

export function LiveSalesPanel() {
  const supabase = React.useMemo(() => createClient(), []);
  const configured = isSupabaseConfigured();

  const [loading, setLoading] = React.useState(true);
  const [businessId, setBusinessId] = React.useState<string | null>(null);
  const [role, setRole] = React.useState<"owner" | "manager" | "staff" | null>(null);
  const [sales, setSales] = React.useState<LiveSaleRow[]>([]);
  const [storeNames, setStoreNames] = React.useState<Map<string, string>>(new Map());

  const [voidTarget, setVoidTarget] = React.useState<LiveSaleRow | null>(null);
  const [voidReason, setVoidReason] = React.useState("");
  const [voidBusy, setVoidBusy] = React.useState(false);

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
      const { data: me } = await supabase
        .from("business_memberships")
        .select("business_id, role")
        .eq("profile_id", user.id)
        .eq("status", "active");
      const rows = (me ?? []) as { business_id: string; role: "owner" | "manager" | "staff" }[];
      if (rows.length === 0) return;

      const bid = rows[0].business_id;
      setBusinessId(bid);
      setRole(rows[0].role);

      const [salesRes, storesRes] = await Promise.all([
        supabase
          .from("sales")
          .select("id, invoice_no, status, total_paise, total_points, sold_at, store_id, customer_membership_id, sold_by_profile_id, void_reason")
          .eq("business_id", bid)
          .order("sold_at", { ascending: false })
          .limit(12),
        supabase.from("stores").select("id, name").eq("business_id", bid),
      ]);

      const saleRows = (salesRes.data ?? []) as {
        id: string; invoice_no: string; status: "completed" | "voided" | "refunded";
        total_paise: number; total_points: number; sold_at: string; store_id: string;
        customer_membership_id: string | null; sold_by_profile_id: string | null; void_reason: string | null;
      }[];

      const membershipIds = [...new Set(saleRows.map((s) => s.customer_membership_id).filter((x): x is string => !!x))];
      const { data: memRes } = membershipIds.length
        ? await supabase.from("customer_memberships").select("id, membership_no").in("id", membershipIds)
        : { data: [] };
      const memMap = new Map(
        ((memRes ?? []) as { id: string; membership_no: string }[]).map((m) => [m.id, m.membership_no])
      );

      setStoreNames(new Map(((storesRes.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name])));
      setSales(
        saleRows.map((s) => ({
          id: s.id,
          invoiceNo: s.invoice_no,
          status: s.status,
          totalPaise: Number(s.total_paise),
          totalPoints: Number(s.total_points),
          soldAt: s.sold_at,
          storeId: s.store_id,
          membershipId: s.customer_membership_id,
          membershipNo: s.customer_membership_id ? memMap.get(s.customer_membership_id) ?? null : null,
          soldBy: s.sold_by_profile_id,
          voidReason: s.void_reason,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [configured, supabase]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const submitVoid = async () => {
    if (!voidTarget || voidReason.trim().length < 3) return;
    setVoidBusy(true);
    try {
      const result = await voidSaleAction(voidTarget.id, voidReason.trim());
      if (!result.ok) {
        toast.error("Couldn't void the sale", { description: result.message });
        return;
      }
      const bits: string[] = [];
      if (result.data.pointsReversed > 0) {
        bits.push(`${result.data.pointsReversed} points reversed via a compensating ledger entry`);
      }
      if (result.data.stockLinesRestored > 0) {
        bits.push(`${result.data.stockLinesRestored} catalogue line${result.data.stockLinesRestored > 1 ? "s" : ""} restocked`);
      }
      toast.success(`${result.data.invoiceNo} voided.`, {
        description: bits.length > 0 ? `${bits.join(" · ")}.` : "No points or stock to reverse.",
      });
      setVoidTarget(null);
      setVoidReason("");
      await reload();
    } finally {
      setVoidBusy(false);
    }
  };

  if (!configured) return null;
  if (loading) {
    return (
      <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        Loading live sales…
      </Card>
    );
  }
  if (!businessId || !role) return null;

  const canVoid = role === "owner" || role === "manager";

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Receipt className="size-4.5" />
          </span>
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              Live sales
              <Badge variant="outline" className="gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> Supabase
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">
              Newest recorded sales — rows are never deleted; voiding flips the status and reverses points
            </p>
          </div>
        </div>
      </div>

      {sales.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">
          No live sales yet. Record one from the <strong className="text-foreground">New Sale</strong> page —
          invoices start at INV-000001 for your business.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden sm:table-cell">Store</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="hidden text-right md:table-cell">Points</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">When</TableHead>
              {canVoid && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.map((s) => (
              <TableRow key={s.id} className={s.status !== "completed" ? "opacity-60" : undefined}>
                <TableCell className="font-mono text-xs">{s.invoiceNo}</TableCell>
                <TableCell>
                  {s.membershipNo ? (
                    <span className="flex items-center gap-1.5 text-xs">
                      <UserRound className="size-3.5 text-muted-foreground" aria-hidden />
                      <span className="font-mono">{s.membershipNo}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Walk-in</span>
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Store className="size-3.5" aria-hidden /> {storeNames.get(s.storeId) ?? "Store"}
                  </span>
                </TableCell>
                <TableCell className="text-right text-sm font-medium">{formatINR(s.totalPaise / 100)}</TableCell>
                <TableCell className="hidden text-right md:table-cell">
                  {s.totalPoints > 0 ? (
                    <span className="flex items-center justify-end gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                      <Sparkles className="size-3" aria-hidden /> {s.totalPoints}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={s.status === "completed" ? "secondary" : "outline"}
                    className={s.status === "voided" ? "text-destructive" : ""}
                    title={s.voidReason ?? undefined}
                  >
                    {s.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                  {relativeTime(s.soldAt)}
                </TableCell>
                {canVoid && (
                  <TableCell className="text-right">
                    {s.status === "completed" && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                        onClick={() => { setVoidTarget(s); setVoidReason(""); }}
                      >
                        <Ban className="mr-1 size-3" /> Void
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <FormDialog
        open={voidTarget !== null}
        onOpenChange={(o) => { if (!o) setVoidTarget(null); }}
        title={`Void ${voidTarget?.invoiceNo ?? "sale"}`}
        description="The sale row is kept for audit — its status flips to voided and any points earned are reversed with a compensating ledger entry. Only managers and the owner can void."
        footer={
          <>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={submitVoid}
              loading={voidBusy}
              disabled={voidReason.trim().length < 3}
            >
              Void sale
            </Button>
          </>
        }
      >
        <div className="space-y-1.5 py-2">
          <Label htmlFor="void-reason">Reason (required — stored in the audit trail)</Label>
          <Input
            id="void-reason"
            placeholder="e.g. Billing mistake — customer returned items"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
          />
          {voidTarget && (
            <p className="text-xs text-muted-foreground">
              {formatINR(voidTarget.totalPaise / 100)} · {voidTarget.totalPoints > 0 ? `${voidTarget.totalPoints} pts will be reversed` : "no points to reverse"}
            </p>
          )}
        </div>
      </FormDialog>
    </Card>
  );
}
