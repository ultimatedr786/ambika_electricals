"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Filter, Plus, Receipt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { SearchInput } from "@/components/shared/search-input";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { useStore } from "@/lib/store";
import { formatDate, formatDateTime, formatINR, formatNumber } from "@/lib/utils";
import type { Sale } from "@/types";

const ranges = [
  { value: "all", label: "All time", days: Infinity },
  { value: "7", label: "Last 7 days", days: 7 },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
];
const amounts = [
  { value: "all", label: "Any amount", min: 0 },
  { value: "1000", label: "Over ₹1,000", min: 1000 },
  { value: "5000", label: "Over ₹5,000", min: 5000 },
];

export default function SalesPage() {
  const { state } = useStore();
  const [query, setQuery] = React.useState("");
  const [store, setStore] = React.useState("all");
  const [range, setRange] = React.useState("all");
  const [amount, setAmount] = React.useState("all");
  const [open, setOpen] = React.useState<Sale | null>(null);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const activeFilters = [store !== "all", range !== "all", amount !== "all"].filter(Boolean).length;

  const results = React.useMemo(() => {
    const days = ranges.find((r) => r.value === range)?.days ?? Infinity;
    const cutoff = days === Infinity ? 0 : Date.now() - days * 86400000;
    const min = amounts.find((a) => a.value === amount)?.min ?? 0;
    const t = query.trim().toLowerCase();
    return state.sales
      .filter((s) => new Date(s.date).getTime() >= cutoff)
      .filter((s) => store === "all" || s.store === store)
      .filter((s) => s.amount >= min)
      .filter((s) => !t || `${s.invoice} ${s.customerName}`.toLowerCase().includes(t));
  }, [state.sales, query, store, range, amount]);

  const revenue = results.reduce((s, x) => s + x.amount, 0);
  const points = results.reduce((s, x) => s + x.points, 0);

  const filterControls = (
    <div className="flex flex-wrap gap-2.5">
      <Select value={store} onValueChange={setStore}>
        <SelectTrigger className="w-[170px]" aria-label="Store"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All stores</SelectItem>
          <SelectItem value="Main Store">Main Store</SelectItem>
          <SelectItem value="City Branch">City Branch</SelectItem>
        </SelectContent>
      </Select>
      <Select value={range} onValueChange={setRange}>
        <SelectTrigger className="w-[150px]" aria-label="Date range"><SelectValue /></SelectTrigger>
        <SelectContent>{ranges.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={amount} onValueChange={setAmount}>
        <SelectTrigger className="w-[150px]" aria-label="Amount"><SelectValue /></SelectTrigger>
        <SelectContent>{amounts.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
      </Select>
      {activeFilters > 0 && (
        <Button variant="ghost" onClick={() => { setStore("all"); setRange("all"); setAmount("all"); }}>
          <X /> Clear all
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sales"
        description="Every invoice raised at Ambika Electricals."
        actions={<Button asChild><Link href="/business/sales/new"><Plus /> New Sale</Link></Button>}
      />

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Invoices</p><p className="mt-1 text-xl font-semibold tabular">{results.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Revenue</p><p className="mt-1 text-xl font-semibold tabular">{formatINR(revenue, { compact: true })}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Points issued</p><p className="mt-1 text-xl font-semibold tabular text-success">+{formatNumber(points)}</p></Card>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={query} onChange={setQuery} placeholder="Search invoice or customer" className="min-w-[220px] flex-1" />
        <div className="hidden lg:block">{filterControls}</div>
        <Button variant="outline" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
          <Filter /> Filters{activeFilters > 0 && <Badge className="ml-1">{activeFilters}</Badge>}
        </Button>
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Your sales activity will appear here."
          description="No invoices match these filters yet."
          action={<Button asChild><Link href="/business/sales/new"><Plus /> Create a sale</Link></Button>}
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => setOpen(s)}>
                    <TableCell className="font-medium tabular">{s.invoice}</TableCell>
                    <TableCell>{s.customerName}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-muted-foreground">
                      {s.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular">{formatINR(s.amount)}</TableCell>
                    <TableCell className="text-right tabular text-success">+{formatNumber(s.points)}</TableCell>
                    <TableCell className="text-muted-foreground">{s.store}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(s.date, "long")}</TableCell>
                    <TableCell><StatusBadge status={s.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-2.5 lg:hidden">
            {results.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
                <Card className="cursor-pointer p-4" onClick={() => setOpen(s)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold tabular">{s.invoice}</p>
                      <p className="truncate text-[13px] text-muted-foreground">{s.customerName} · {s.store}</p>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">
                    {s.items.map((it) => `${it.qty} × ${it.name}`).join(", ")}
                  </p>
                  <div className="mt-3 flex items-end justify-between">
                    <span className="text-xs text-muted-foreground">{formatDate(s.date, "long")}</span>
                    <div className="text-right">
                      <p className="text-[15px] font-semibold tabular">{formatINR(s.amount)}</p>
                      <p className="text-xs tabular text-success">+{formatNumber(s.points)} pts</p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </>
      )}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom">
          <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
          <SheetBody>
            <div className="[&_button]:w-full [&>div]:flex-col">{filterControls}</div>
          </SheetBody>
          <SheetFooter>
            <Button className="w-full" onClick={() => setFiltersOpen(false)}>Apply</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{open?.invoice}</DialogTitle>
            <DialogDescription>{open && formatDateTime(open.date)} · {open?.store}</DialogDescription>
          </DialogHeader>
          <DialogBody className="pb-5">
          {open && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border p-3.5">
                <div>
                  <p className="text-sm font-medium">{open.customerName}</p>
                  <p className="text-xs text-muted-foreground">Served by {open.staff}</p>
                </div>
                <StatusBadge status={open.status} />
              </div>
              <div className="space-y-2">
                {open.items.map((i) => (
                  <div key={i.productId} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate">{i.name}</p>
                      <p className="text-xs text-muted-foreground">{i.brand} · {i.qty} × {formatINR(i.price)}</p>
                    </div>
                    <span className="shrink-0 tabular">{formatINR(i.price * i.qty)}</span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="space-y-1.5 text-sm">
                <Row label="Subtotal" value={formatINR(open.subtotal)} />
                {open.discount > 0 && <Row label="Discount" value={`− ${formatINR(open.discount)}`} />}
                <Row label="Amount" value={formatINR(open.amount)} strong />
                <Row label="Base points" value={`+${formatNumber(open.basePoints)}`} />
                <Row label="Bonus points" value={`+${formatNumber(open.bonusPoints)}`} />
                <Row label="Total points" value={`+${formatNumber(open.points)}`} strong tone="success" />
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href={`/business/customers/${open.customerId}`}>View customer</Link>
              </Button>
            </div>
          )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "success" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular ${strong ? "font-semibold" : ""} ${tone === "success" ? "text-success" : ""}`}>{value}</span>
    </div>
  );
}
