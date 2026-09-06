"use client";

import * as React from "react";
import { EyeOff, QrCode, RefreshCw, ShieldCheck, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QRCode } from "@/components/shared/qr-code";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { groupQrToken } from "@/lib/qr/token";
import {
  issueMembershipQrAction,
  revokeMembershipQrAction,
  type IssuedQrToken,
} from "@/lib/qr/qr-actions";

/**
 * Live membership QR (Step 3 Slice 4) — the real checkout code for the
 * signed-in customer, rendered above the prototype membership card.
 *
 * Security model:
 *   • The code is an opaque, single-use, short-lived token minted by
 *     `issue_membership_qr_token`. It contains no membership number, name,
 *     phone or points — a screenshot leaks nothing and stops working in
 *     ~90 seconds, or the moment it is scanned once.
 *   • The token lives in component state only: never localStorage, never a
 *     URL, never a log. Issuing a new one supersedes the previous one.
 *   • "Hide my QR" calls `revoke_membership_qr_tokens`, which kills every live
 *     token immediately (lost-phone control).
 *
 * Refresh policy: the code is minted on demand, auto-renewed a few seconds
 * before it expires while the panel is visible, paused when the tab is
 * hidden and renewed on return. That keeps issuance far below the RPC's
 * 10-per-minute rate limit.
 */

/** Renew this many seconds before `expires_at` so the counter never sees a dead code. */
const RENEW_LEAD_SECONDS = 8;

export function LiveMembershipQr() {
  const configured = isSupabaseConfigured();

  const [issued, setIssued] = React.useState<IssuedQrToken | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [hidden, setHidden] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [unavailable, setUnavailable] = React.useState(false);
  const [secondsLeft, setSecondsLeft] = React.useState(0);
  const [showCode, setShowCode] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await issueMembershipQrAction();
      if (!res.ok) {
        setIssued(null);
        if (res.reason === "membership_not_found") setUnavailable(true);
        else setError(res.message);
        return;
      }
      setIssued(res.data);
      setHidden(false);
    } finally {
      setBusy(false);
    }
  }, []);

  const hide = React.useCallback(async () => {
    setBusy(true);
    try {
      await revokeMembershipQrAction("customer_hidden");
    } finally {
      setIssued(null);
      setHidden(true);
      setShowCode(false);
      setBusy(false);
    }
  }, []);

  // Countdown + auto-renew. Both live in one interval so they can never drift
  // apart, and neither runs while the tab is in the background.
  React.useEffect(() => {
    if (!issued || hidden) return;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const left = Math.max(0, Math.round((new Date(issued.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= RENEW_LEAD_SECONDS && document.visibilityState === "visible" && !busy) {
        void refresh();
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [issued, hidden, busy, refresh]);

  if (!configured || unavailable) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <QrCode className="size-4" aria-hidden />
          </span>
          Checkout code
          <Badge variant="outline" className="gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> Secure
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Single-use and short-lived. It carries no name, phone or member number — nothing to leak in a screenshot.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {hidden || !issued ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center">
            <ShieldCheck className="size-6 text-muted-foreground" aria-hidden />
            <p className="max-w-xs text-xs text-muted-foreground">
              Generate a code when you reach the counter. It expires on its own and can only be scanned once.
            </p>
            <Button onClick={refresh} loading={busy}>
              <QrCode /> Show my code
            </Button>
            {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-2xl border bg-white p-3 shadow-sm">
                <div className="size-48 sm:size-56">
                  <QRCode value={issued.token} size={29} />
                </div>
              </div>

              <p
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                aria-live="polite"
                role="status"
              >
                <TimerReset className="size-3.5" aria-hidden />
                {secondsLeft > 0 ? `Refreshes in ${secondsLeft}s` : "Refreshing…"}
              </p>

              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setShowCode((v) => !v)}
                aria-expanded={showCode}
              >
                {showCode ? "Hide the code text" : "Scanner not working? Show the code"}
              </button>
              {showCode && (
                <p className="select-all break-all rounded-lg bg-muted/50 px-3 py-2 text-center font-mono text-[11px] tracking-wide">
                  {groupQrToken(issued.token)}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={refresh} loading={busy}>
                <RefreshCw /> New code
              </Button>
              <Button variant="outline" className="flex-1" onClick={hide} disabled={busy}>
                <EyeOff /> Hide my QR
              </Button>
            </div>
            {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
