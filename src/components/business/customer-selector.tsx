"use client";

import * as React from "react";
import { Users } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { TierBadge } from "@/components/shared/tier-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useStore } from "@/lib/store";
import { formatNumber, initials } from "@/lib/utils";
import type { Customer } from "@/types";

export function CustomerSelector({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSelect: (c: Customer) => void;
}) {
  const { state } = useStore();
  const [q, setQ] = React.useState("");

  const results = React.useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return state.customers.slice(0, 8);
    return state.customers.filter(
      (c) =>
        c.name.toLowerCase().includes(t) ||
        c.phone.replace(/\s/g, "").includes(t.replace(/\s/g, "")) ||
        c.membershipId.toLowerCase().includes(t)
    );
  }, [q, state.customers]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select customer</DialogTitle>
          <DialogDescription>Search by name, phone number or membership ID.</DialogDescription>
        </DialogHeader>
        <SearchInput value={q} onChange={setQ} placeholder="Rahul Sharma, AE-10248, 98240…" autoFocus />
        <div className="-mx-1 max-h-[52vh] space-y-1 overflow-y-auto px-1">
          {results.length === 0 ? (
            <EmptyState icon={Users} title="No customer found" description="Try a different name, phone or membership ID." className="py-10" />
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                onClick={() => { onSelect(c); onOpenChange(false); setQ(""); }}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/50"
              >
                <Avatar className="size-9"><AvatarFallback>{initials(c.name)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-xs tabular text-muted-foreground">{c.membershipId} · {c.phone}</p>
                </div>
                <div className="shrink-0 text-right">
                  <TierBadge tier={c.tier} showIcon={false} />
                  <p className="mt-1 text-xs tabular text-muted-foreground">{formatNumber(c.points)} pts</p>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
