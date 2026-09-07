"use client";

import * as React from "react";
import { Info, Sparkles, Building2, Layers } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

export interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Logo showTagline={false} size={28} />
            <Badge variant="secondary" className="font-mono text-[10px] tracking-tight">
              v1.0.0
            </Badge>
          </div>
          <DialogTitle className="mt-2 text-xl">Rewardly for Ambika Electricals</DialogTitle>
          <DialogDescription>
            Enterprise Loyalty &amp; Rewards Platform
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 py-2">
          {/* NisuNex Attribution Block */}
          <div className="rounded-xl border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Software Architecture &amp; Engineering
            </p>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Developed by</p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-primary via-sky-500 to-indigo-500 bg-clip-text text-transparent">
                    NisuNex
                  </span>
                  <Sparkles className="size-3.5 text-primary" />
                </div>
              </div>
              <Badge variant="outline" className="text-[11px] font-medium border-primary/30 bg-primary/5">
                NisuNex Core v1
              </Badge>
            </div>
          </div>

          {/* System & Environment Info */}
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1.5"><Building2 className="size-3.5" /> Client</span>
              <span className="font-medium text-foreground">Ambika Electricals</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1.5"><Layers className="size-3.5" /> Version</span>
              <span className="font-mono font-medium text-foreground">1.0.0-stable</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1.5"><Info className="size-3.5" /> Framework</span>
              <span className="font-medium text-foreground">Next.js 16 (Turbopack)</span>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
