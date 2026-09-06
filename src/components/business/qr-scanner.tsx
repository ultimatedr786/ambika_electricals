"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, KeyRound, RefreshCw, ScanLine, Search, ShieldAlert, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { TierBadge } from "@/components/shared/tier-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { verifyMembershipQrAction, type VerifiedMember } from "@/lib/qr/qr-actions";
import { isQrTokenShape } from "@/lib/qr/token";
import { formatNumber, initials, sleep } from "@/lib/utils";
import type { Customer } from "@/types";

type Phase = "scanning" | "found";

/**
 * Simulated capture frame shared by the prototype scanner and the live one.
 * There is no camera access anywhere in this MVP — capture is simulated and
 * the real security boundary is the token itself, which the server verifies.
 */
function ScanFrame({ caption }: { caption: string }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-2xl bg-slate-950">
      <div className="absolute inset-0 grid-lines opacity-[0.12]" aria-hidden />
      <div className="absolute inset-6 rounded-xl border-2 border-dashed border-white/15" aria-hidden />
      {[
        "left-5 top-5 border-l-2 border-t-2 rounded-tl-lg",
        "right-5 top-5 border-r-2 border-t-2 rounded-tr-lg",
        "left-5 bottom-5 border-l-2 border-b-2 rounded-bl-lg",
        "right-5 bottom-5 border-r-2 border-b-2 rounded-br-lg",
      ].map((c) => (
        <span key={c} className={`absolute size-8 border-primary ${c}`} aria-hidden />
      ))}
      <motion.div
        className="absolute inset-x-6 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_18px_hsl(var(--primary))]"
        initial={{ top: "12%" }}
        animate={{ top: ["12%", "86%", "12%"] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
      <div className="absolute inset-x-0 bottom-3 text-center text-[11px] text-white/50">{caption}</div>
    </div>
  );
}

/**
 * Mock QR scanner (prototype/demo data). There is no camera access and no real
 * QR decoding — the scan is simulated. The live counter flow is `LiveQRScanner`
 * below, which verifies a real single-use token server-side.
 */
export function QRScanner({
  open,
  onOpenChange,
  customer,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customer: Customer;
  onConfirm: (c: Customer) => void;
}) {
  const [phase, setPhase] = React.useState<Phase>("scanning");

  const run = React.useCallback(async () => {
    setPhase("scanning");
    await sleep(1900);
    setPhase("found");
  }, []);

  React.useEffect(() => {
    if (open) run();
  }, [open, run]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Scan Customer QR</DialogTitle>
          <DialogDescription>
            {phase === "scanning" ? "Position customer QR inside the frame" : "Customer found"}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="pb-6">
        <AnimatePresence mode="wait">
          {phase === "scanning" ? (
            <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ScanFrame caption="Mock scanner · no camera access" />
              <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                <ScanLine className="size-4 animate-pulse" /> Scanning…
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="found"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="rounded-2xl border bg-success/[0.06] p-5 text-center">
                <motion.div
                  initial={{ scale: 0.6 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 240, damping: 14 }}
                  className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/12 text-success"
                >
                  <CheckCircle2 className="size-6" />
                </motion.div>
                <p className="mt-3 text-sm font-medium text-success">Customer found</p>
                <div className="mt-4 flex items-center gap-3 rounded-xl border bg-card p-3.5 text-left">
                  <Avatar className="size-10"><AvatarFallback>{initials(customer.name)}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{customer.name}</p>
                    <p className="text-xs tabular text-muted-foreground">{customer.membershipId}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <TierBadge tier={customer.tier} />
                    <p className="mt-1 text-xs tabular text-muted-foreground">{formatNumber(customer.points)} pts</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={run}><RefreshCw /> Rescan</Button>
                <Button className="flex-1" onClick={() => { onConfirm(customer); onOpenChange(false); }}>Continue</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Live scanner — real single-use token verification                   */
/* ------------------------------------------------------------------ */

export interface ScannedMember extends VerifiedMember {
  /** True when staff picked the member by name/number instead of a QR. */
  manual: boolean;
}

interface LookupHit {
  id: string;
  membershipNo: string;
  displayName: string | null;
  phoneMasked: string | null;
}

/**
 * Live counter scanner (Step 3 Slice 4).
 *
 * The capture channel is simulated — staff paste or key in the code the
 * customer is showing — but everything that matters happens server-side:
 * `verify_membership_qr_token` re-checks the scanner's business role and store
 * scoping, enforces expiry/single-use/revocation, rate-limits the scanner and
 * records every attempt. This component only renders the outcome; it never
 * decides whether a code is valid, and it never stores the code.
 *
 * Manual lookup is the documented fallback for a dead phone battery: it is an
 * ordinary RLS-scoped read of the business's own membership directory, clearly
 * labelled as unverified so staff know a QR was not presented.
 */
export function LiveQRScanner({
  open,
  onOpenChange,
  storeId,
  businessId,
  onVerified,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  storeId: string | null;
  businessId: string | null;
  onVerified: (member: ScannedMember) => void;
}) {
  const supabase = React.useMemo(() => createClient(), []);

  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [member, setMember] = React.useState<ScannedMember | null>(null);

  const [manualOpen, setManualOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<LookupHit[]>([]);
  const [searching, setSearching] = React.useState(false);

  const reset = React.useCallback(() => {
    setCode("");
    setError(null);
    setMember(null);
    setManualOpen(false);
    setQuery("");
    setHits([]);
  }, []);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const verify = React.useCallback(
    async (raw: string) => {
      const token = raw.trim();
      if (token.length === 0) return;
      setBusy(true);
      setError(null);
      try {
        const res = await verifyMembershipQrAction({ token, storeId });
        if (!res.ok) {
          setError(res.message);
          setCode("");
          return;
        }
        setMember({ ...res.data, manual: false });
      } finally {
        setBusy(false);
      }
    },
    [storeId]
  );

  // Debounced manual lookup — RLS keeps this to the viewer's own business.
  React.useEffect(() => {
    if (!manualOpen || !supabase || !businessId) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from("customer_memberships")
        .select("id, membership_no, display_name, phone_masked")
        .eq("business_id", businessId)
        .eq("status", "active")
        .or(`display_name.ilike.%${q}%,membership_no.ilike.%${q}%,phone_masked.ilike.%${q}%`)
        .limit(6);
      setHits(
        ((data ?? []) as { id: string; membership_no: string; display_name: string | null; phone_masked: string | null }[])
          .map((m) => ({
            id: m.id,
            membershipNo: m.membership_no,
            displayName: m.display_name,
            phoneMasked: m.phone_masked,
          }))
      );
      setSearching(false);
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, manualOpen, businessId, supabase]);

  const pickManually = React.useCallback(
    async (hit: LookupHit) => {
      setBusy(true);
      try {
        let balance = 0;
        if (supabase) {
          const { data } = await supabase
            .from("customer_points_balance")
            .select("current_points")
            .eq("customer_membership_id", hit.id)
            .maybeSingle();
          balance = Number((data as { current_points?: number } | null)?.current_points ?? 0);
        }
        setMember({
          customerMembershipId: hit.id,
          membershipNo: hit.membershipNo,
          displayName: hit.displayName,
          phoneMasked: hit.phoneMasked,
          pointsBalance: balance,
          businessId: businessId ?? "",
          verifiedAt: new Date().toISOString(),
          manual: true,
        });
      } finally {
        setBusy(false);
      }
    },
    [supabase, businessId]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Scan member QR</DialogTitle>
          <DialogDescription>
            {member ? "Member verified" : "Ask the customer to show their checkout code"}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="pb-6">
          <AnimatePresence mode="wait">
            {member ? (
              <motion.div
                key="verified"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className={member.manual ? "rounded-2xl border bg-muted/30 p-5 text-center" : "rounded-2xl border bg-success/[0.06] p-5 text-center"}>
                  <motion.div
                    initial={{ scale: 0.6 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 240, damping: 14 }}
                    className={
                      member.manual
                        ? "mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
                        : "mx-auto flex size-12 items-center justify-center rounded-full bg-success/12 text-success"
                    }
                  >
                    {member.manual ? <UserRound className="size-6" /> : <CheckCircle2 className="size-6" />}
                  </motion.div>
                  <p className={member.manual ? "mt-3 text-sm font-medium text-muted-foreground" : "mt-3 text-sm font-medium text-success"}>
                    {member.manual ? "Selected manually — no QR presented" : "QR verified · code now used up"}
                  </p>
                  <div className="mt-4 flex items-center gap-3 rounded-xl border bg-card p-3.5 text-left">
                    <Avatar className="size-10">
                      <AvatarFallback>{initials(member.displayName ?? "Member")}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{member.displayName ?? "Member"}</p>
                      <p className="font-mono text-xs text-muted-foreground">{member.membershipNo}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge variant="outline" className="text-[10px]">
                        {formatNumber(member.pointsBalance)} pts
                      </Badge>
                      {member.phoneMasked && (
                        <p className="mt-1 text-[11px] text-muted-foreground">{member.phoneMasked}</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={reset}>
                    <RefreshCw /> Scan again
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => {
                      onVerified(member);
                      onOpenChange(false);
                    }}
                  >
                    Continue
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="capture" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ScanFrame caption="Capture simulated · paste or key in the code" />

                <form
                  className="mt-4 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void verify(code);
                  }}
                >
                  <label htmlFor="qr-code-input" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <KeyRound className="size-3.5" aria-hidden /> Customer code
                  </label>
                  <Input
                    id="qr-code-input"
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="RWD1.XXXXXXXXXXXXXXXX.XXXX…"
                    className="font-mono text-xs"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  {code.trim().length > 0 && !isQrTokenShape(code) && (
                    <p className="text-[11px] text-muted-foreground">
                      That doesn&apos;t look like a checkout code yet — it reads
                      <span className="font-mono"> RWD1.…</span>
                    </p>
                  )}
                  <Button type="submit" className="w-full" loading={busy} disabled={code.trim().length === 0}>
                    <ScanLine /> Verify code
                  </Button>
                </form>

                {error && (
                  <p
                    className="mt-3 flex items-start gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
                    role="alert"
                  >
                    <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                    {error}
                  </p>
                )}

                <div className="mt-4 border-t pt-3">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                    onClick={() => setManualOpen((v) => !v)}
                    aria-expanded={manualOpen}
                  >
                    <Search className="size-3" aria-hidden />
                    {manualOpen ? "Hide manual lookup" : "No phone? Look the member up"}
                  </button>

                  {manualOpen && (
                    <div className="mt-2 space-y-1.5">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input
                          className="pl-8"
                          placeholder="Name, AE-… number or phone"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          aria-label="Look up member"
                        />
                        {searching && (
                          <span className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" aria-hidden />
                        )}
                      </div>
                      {hits.length > 0 && (
                        <ul className="space-y-1 rounded-lg border bg-background p-1.5">
                          {hits.map((h) => (
                            <li key={h.id}>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                                onClick={() => void pickManually(h)}
                              >
                                <UserRound className="size-3.5 text-muted-foreground" aria-hidden />
                                <span className="truncate font-medium">{h.displayName ?? "Member"}</span>
                                <span className="ml-auto font-mono text-[10px] text-muted-foreground">{h.membershipNo}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        Manual selection is recorded on the sale as unverified — prefer the QR whenever the customer has it.
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
