"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, RefreshCw, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { TierBadge } from "@/components/shared/tier-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatNumber, initials, sleep } from "@/lib/utils";
import type { Customer } from "@/types";

type Phase = "scanning" | "found";

/**
 * Mock QR scanner. There is no camera access and no real QR decoding —
 * the scan is simulated for the prototype.
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
              <div className="relative mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-2xl bg-slate-950">
                <div className="absolute inset-0 grid-lines opacity-[0.12]" aria-hidden />
                <div className="absolute inset-6 rounded-xl border-2 border-dashed border-white/15" aria-hidden />
                {/* corners */}
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
                <div className="absolute inset-x-0 bottom-3 text-center text-[11px] text-white/50">
                  Mock scanner · no camera access
                </div>
              </div>
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
