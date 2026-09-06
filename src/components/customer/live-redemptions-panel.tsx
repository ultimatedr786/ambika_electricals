"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Gift, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/shared/form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProductArt, type ProductArtKey } from "@/components/shared/product-art";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { formatDate, formatNumber } from "@/lib/utils";
import { cancelMyRedemptionAction } from "@/app/customer/redemptions/redemptions-actions";

/**
 * Live redemptions (Step 3 Slice 4) — the signed-in customer's real
 * Supabase redemption history, rendered above the prototype list on
 * /customer/redemptions.
 *
 * RLS shows customers only their OWN redemptions. The plaintext collection
 * code is never re-readable (only sha256 + last4 are stored, §8.4) — the
 * panel shows the reference + last4, and pending redemptions can be
 * cancelled here (points refund through a compensating ledger entry).
 */

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  collected: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};

interface MyRedemption {
  id: string;
  reference: string;
  status: "pending" | "collected" | "cancelled" | "expired";
  qty: number;
  pointsUsed: number;
  codeLast4: string;
  rewardName: string;
  artKey: string | null;
  createdAt: string;
  expiresAt: string;
  collectedAt: string | null;
  cancelReason: string | null;
}

export function LiveRedemptionsPanel() {
  const supabase = React.useMemo(() => createClient(), []);
  const configured = isSupabaseConfigured();

  const [loading, setLoading] = React.useState(true);
  const [redemptions, setRedemptions] = React.useState<MyRedemption[]>([]);
  // Captured in reload() (an event/effect context) so render stays pure.
  const [now, setNow] = React.useState(0);
  const [cancelFor, setCancelFor] = React.useState<MyRedemption | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  const reload = React.useCallback(async () => {
    if (!configured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setNow(Date.now());
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      // RLS already limits this to the viewer's own rows.
      const { data } = await supabase
        .from("redemptions")
        .select(
          "id, reference, status, qty, points_used, code_last4, created_at, expires_at, collected_at, cancel_reason, rewards(name, art_key)"
        )
        .order("created_at", { ascending: false })
        .limit(50);
      setRedemptions(
        ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
          const reward = (r.rewards ?? {}) as { name?: string; art_key?: string | null };
          return {
            id: String(r.id),
            reference: String(r.reference),
            status: String(r.status) as MyRedemption["status"],
            qty: Number(r.qty ?? 1),
            pointsUsed: Number(r.points_used ?? 0),
            codeLast4: String(r.code_last4 ?? ""),
            rewardName: reward.name ?? "Reward",
            artKey: reward.art_key ?? null,
            createdAt: String(r.created_at),
            expiresAt: String(r.expires_at),
            collectedAt: (r.collected_at as string | null) ?? null,
            cancelReason: (r.cancel_reason as string | null) ?? null,
          };
        })
      );
    } finally {
      setLoading(false);
    }
  }, [configured, supabase]);

  React.useEffect(() => {
    void reload();
  }, [reload, reloadToken]);

  if (!configured) return null;
  if (loading) {
    return (
      <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        Loading live redemptions…
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          Live redemptions
          <Badge variant="outline" className="gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> Supabase
          </Badge>
        </h2>
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <Link href="/customer/rewards">Browse live rewards</Link>
        </Button>
      </div>

      {redemptions.length === 0 ? (
        <Card className="flex flex-wrap items-center gap-3 p-5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Gift className="size-4.5" aria-hidden />
          </span>
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            No live redemptions yet — redeem a reward from the live store and it will appear here with its
            one-time collection code.
          </p>
        </Card>
      ) : (
        redemptions.map((r) => {
          const expiringSoon =
            r.status === "pending" && now > 0 &&
            new Date(r.expiresAt).getTime() - now < 3 * 24 * 3600 * 1000;
          return (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <ProductArt art={(r.artKey ?? "gift") as ProductArtKey} className="size-14 shrink-0" tone="muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {r.rewardName}
                    {r.qty > 1 && <span className="text-muted-foreground"> × {r.qty}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground tabular">
                    {r.reference} · code ••••{r.codeLast4} · {formatNumber(r.pointsUsed)} pts
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.status === "pending" ? (
                      <span className={expiringSoon ? "font-medium text-amber-600 dark:text-amber-400" : undefined}>
                        Collect in store by {formatDate(r.expiresAt, "long")}
                      </span>
                    ) : r.status === "collected" && r.collectedAt ? (
                      <>Collected {formatDate(r.collectedAt, "long")}</>
                    ) : r.status === "cancelled" ? (
                      <>Cancelled{r.cancelReason ? `: ${r.cancelReason}` : ""}</>
                    ) : (
                      <>Expired — the hold was released automatically</>
                    )}
                  </p>
                </div>
                <StatusBadge status={STATUS_LABEL[r.status] ?? r.status} />
                {r.status === "pending" && (
                  <Button size="sm" variant="ghost" onClick={() => setCancelFor(r)}>
                    <XCircle /> Cancel
                  </Button>
                )}
              </div>
              {r.status === "pending" && (
                <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
                  Your full collection code was shown once, right after redeeming — it can never be shown
                  again. Lost it? Cancel here and redeem again, or ask staff at the store.
                </p>
              )}
            </Card>
          );
        })
      )}

      {cancelFor && (
        <CancelDialog
          redemption={cancelFor}
          onClose={() => setCancelFor(null)}
          onDone={(msg) => {
            setCancelFor(null);
            toast.success(msg);
            setReloadToken((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}

function CancelDialog({
  redemption,
  onClose,
  onDone,
}: {
  redemption: MyRedemption;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setBusy(true);
    const res = await cancelMyRedemptionAction(redemption.id, reason);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    if (res.data.status === "expired") {
      onDone(`${redemption.reference} had already expired — its hold was released.`);
      return;
    }
    onDone(`${redemption.reference} cancelled — ${formatNumber(res.data.pointsRefunded)} pts are back on your balance.`);
  };

  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Cancel ${redemption.reference}?`}
      description={`${formatNumber(redemption.pointsUsed)} points return to your balance immediately and the store hold is released.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Keep it</Button>
          <Button variant="destructive" onClick={submit} loading={busy} disabled={reason.trim().length < 3}>
            Cancel redemption
          </Button>
        </>
      }
    >
      <div className="space-y-1.5 py-2">
        <Label htmlFor="cr-reason">Why are you cancelling?</Label>
        <Textarea
          id="cr-reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Changed my mind"
        />
      </div>
    </FormDialog>
  );
}
