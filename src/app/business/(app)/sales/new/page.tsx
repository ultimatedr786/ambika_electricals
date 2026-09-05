"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowRight, Check, CircleAlert, Minus, PartyPopper, Plus, QrCode, Search, ShoppingCart,
  Sparkles, Trash2, UserRound, X, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { SearchInput } from "@/components/shared/search-input";
import { TierBadge } from "@/components/shared/tier-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductArt } from "@/components/shared/product-art";
import { QRScanner } from "@/components/business/qr-scanner";
import { CustomerSelector } from "@/components/business/customer-selector";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { calculatePoints } from "@/lib/points";
import { productCategories } from "@/lib/mock-data/products";
import { cn, formatINR, formatNumber, initials } from "@/lib/utils";
import { LivePosPanel } from "@/components/business/live-pos-panel";
import { isSupabaseConfigured } from "@/lib/auth/env";
import type { Customer, Product, Sale } from "@/types";

/**
 * Point of sale — scroll architecture (Phase 1.3)
 *
 * The page itself is always the fallback scroll path; nothing above it sets
 * `overflow: hidden`. Only two elements ever own a nested scroll, and both are
 * desktop-only, where a second scroll region is genuinely useful:
 *
 *   • the product catalogue grid  (lg+, bounded height beside the cart)
 *   • the desktop cart lines      (lg+, inside the sticky cart column)
 *
 * Below `lg` — every phone, every portrait tablet — the screen is one single
 * vertical flow: customer → products → cart → totals, with a sticky summary
 * bar that only ever covers the page's bottom padding.
 */
export default function NewSalePage() {
  const { state } = useStore();
  const { salesService } = useServices();

  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [cart, setCart] = React.useState<Record<string, number>>({});
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [selectorOpen, setSelectorOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [completed, setCompleted] = React.useState<{ sale: Sale; points: number } | null>(null);
  const [category, setCategory] = React.useState<string>("All");
  const [query, setQuery] = React.useState("");
  const [discount, setDiscount] = React.useState(0);

  const cartSectionRef = React.useRef<HTMLDivElement>(null);
  const demoCustomer = state.customers[0];

  const entries = React.useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => {
          const product = state.products.find((p) => p.id === id);
          return product ? { product, qty } : null;
        })
        .filter(Boolean) as { product: Product; qty: number }[],
    [cart, state.products]
  );

  const breakdown = React.useMemo(
    () => calculatePoints(entries, { tier: customer?.tier, discount }),
    [entries, customer?.tier, discount]
  );

  const filtered = React.useMemo(() => {
    const t = query.trim().toLowerCase();
    return state.products
      .filter((p) => p.status === "Active")
      .filter((p) => category === "All" || p.category === category)
      .filter((p) => !t || `${p.name} ${p.brand} ${p.sku}`.toLowerCase().includes(t));
  }, [state.products, category, query]);

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const setQty = (id: string, qty: number) =>
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });

  const complete = async () => {
    if (!customer) return;
    setSubmitting(true);
    const { sale, breakdown: b } = await salesService.createSale({
      customerId: customer.id,
      entries,
      discount,
      store: "Main Store",
      staff: "Kiran Bhatt",
    });
    setSubmitting(false);
    setConfirmOpen(false);
    setCompleted({ sale, points: b.totalPoints });
    toast.success("Sale completed.", { description: `${formatNumber(b.totalPoints)} points added to ${customer.name}.` });
  };

  const reset = () => {
    setCompleted(null);
    setCart({});
    setCustomer(null);
    setDiscount(0);
  };

  if (completed) {
    return <SaleSuccess sale={completed.sale} points={completed.points} onNew={reset} />;
  }

  const cartCount = entries.reduce((s, e) => s + e.qty, 0);

  /* ----------------------------------------------------------- cart pieces */

  const cartLines = (
    <div className="space-y-2.5">
      {entries.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="Cart is empty" description="Add electrical products to build the sale." className="py-8" />
      ) : (
        <AnimatePresence initial={false}>
          {entries.map((e) => (
            <motion.div
              key={e.product.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="flex items-center gap-3 rounded-lg border p-2.5"
            >
              <ProductArt art={e.product.image} className="size-11 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{e.product.name}</p>
                <p className="text-xs tabular text-muted-foreground">
                  {formatINR(e.product.price)} × {e.qty} = {formatINR(e.product.price * e.qty)}
                </p>
                <p className="text-xs tabular text-success">+{e.product.points * e.qty} pts</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="outline" size="icon-sm" onClick={() => setQty(e.product.id, e.qty - 1)} aria-label={`Reduce ${e.product.name}`}>
                  {e.qty === 1 ? <Trash2 /> : <Minus />}
                </Button>
                <span className="w-7 text-center text-sm font-semibold tabular">{e.qty}</span>
                <Button variant="outline" size="icon-sm" onClick={() => setQty(e.product.id, e.qty + 1)} aria-label={`Add ${e.product.name}`}>
                  <Plus />
                </Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  );

  const cartTotals = entries.length > 0 && (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="discount" className="text-sm text-muted-foreground">Discount</label>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground">₹</span>
          <Input
            id="discount"
            inputMode="numeric"
            value={discount || ""}
            placeholder="0"
            onChange={(e) => setDiscount(Math.max(0, Math.min(breakdown.subtotal, Number(e.target.value.replace(/\D/g, "")) || 0)))}
            className="h-9 w-24 text-right"
          />
        </div>
      </div>
      <Separator />
      <Row label="Subtotal" value={formatINR(breakdown.subtotal)} />
      {discount > 0 && <Row label="Discount" value={`− ${formatINR(discount)}`} />}
      <Row label="Amount payable" value={formatINR(breakdown.total)} strong />

      <div className="rounded-xl border bg-accent/40 p-3.5">
        <p className="flex items-center gap-1.5 text-[13px] font-medium">
          <Zap className="size-3.5 text-primary" aria-hidden /> Reward points
        </p>
        <div className="mt-2 space-y-1 text-[13px]">
          <Row label="Base points" value={`+${formatNumber(breakdown.basePoints)}`} small />
          {breakdown.bonuses.map((b) => (
            <Row key={b.label} label={b.label} value={`+${formatNumber(b.points)}`} small tone="success" />
          ))}
          <Separator className="my-1.5" />
          <div className="flex items-center justify-between">
            <span className="font-medium">Total points</span>
            <motion.span
              key={breakdown.totalPoints}
              initial={{ scale: 1.15, color: "hsl(var(--success))" }}
              animate={{ scale: 1 }}
              className="text-lg font-semibold tabular text-primary"
            >
              {formatNumber(breakdown.totalPoints)}
            </motion.span>
          </div>
        </div>
      </div>

      <Button size="lg" className="w-full" disabled={!customer} onClick={() => setConfirmOpen(true)}>
        <Check /> Complete Sale
      </Button>
      {!customer && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <CircleAlert className="size-3.5" aria-hidden /> Identify a customer to complete the sale
        </p>
      )}
    </div>
  );

  return (
    // Bottom padding clears the sticky summary bar + the mobile tab bar,
    // so the sticky bar never covers cart rows or page content.
    <div className="space-y-5 pb-[186px] lg:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Point of sale</p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">New sale</h1>
        </div>
        <Button variant="ghost" size="sm" asChild><Link href="/business/sales"><X /> Cancel</Link></Button>
      </div>

      {/* Live Supabase POS — renders only when auth is configured */}
      <LivePosPanel />

      {isSupabaseConfigured() && (
        <div className="flex items-center gap-2 pt-1">
          <h2 className="text-sm font-semibold text-muted-foreground">Prototype billing flow</h2>
          <span className="rounded-md border border-dashed px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Demo data — product catalogue migrates in a later slice
          </span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          {/* Step 1 — customer */}
          <Card className="p-4 sm:p-5">
            <StepHeader n={1} title="Identify customer" done={!!customer} />
            <AnimatePresence mode="wait">
              {customer ? (
                <motion.div key="picked" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-success/30 bg-success/[0.05] p-3.5">
                  <Avatar className="size-10"><AvatarFallback>{initials(customer.name)}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{customer.name}</p>
                    <p className="truncate text-xs tabular text-muted-foreground">{customer.membershipId} · {customer.phone}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <TierBadge tier={customer.tier} />
                      <p className="mt-1 text-xs tabular text-muted-foreground">{formatNumber(customer.points)} pts</p>
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => setCustomer(null)} aria-label="Change customer"><X /></Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  <Button size="lg" className="h-auto flex-col gap-1.5 py-4" onClick={() => setScannerOpen(true)}>
                    <QrCode className="!size-5" aria-hidden />
                    <span>Scan Customer QR</span>
                    <span className="text-[11px] font-normal opacity-80">Fastest way at the counter</span>
                  </Button>
                  <Button size="lg" variant="outline" className="h-auto flex-col gap-1.5 py-4" onClick={() => setSelectorOpen(true)}>
                    <Search className="!size-5" aria-hidden />
                    <span>Select Customer</span>
                    <span className="text-[11px] font-normal text-muted-foreground">Name, phone or member ID</span>
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          {/* Step 2 — products */}
          <Card className="p-4 sm:p-5">
            <StepHeader n={2} title="Add electrical products" done={entries.length > 0} />
            <div className="mt-4 space-y-3">
              <SearchInput value={query} onChange={setQuery} placeholder="Search product, brand or SKU" />
              <div className="scroll-region-x -mx-1 px-1 no-scrollbar">
                <div className="flex w-max gap-2 pb-1">
                  {["All", ...productCategories].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      aria-pressed={category === c}
                      className={cn(
                        "min-h-[36px] whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-colors",
                        category === c ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {filtered.length === 0 ? (
                <EmptyState icon={Search} title="No products found" description="Try another product name, brand or SKU." className="py-10" />
              ) : (
                // Nested scrolling only on lg+, where the cart sits alongside.
                // Below lg the grid grows and the page scrolls normally.
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:max-h-[540px] lg:overflow-y-auto lg:overscroll-contain lg:pr-1 xl:grid-cols-4">
                  {filtered.map((p) => {
                    const qty = cart[p.id] ?? 0;
                    return (
                      <button
                        key={p.id}
                        onClick={() => add(p.id)}
                        disabled={p.stock === 0}
                        aria-label={`Add ${p.brand} ${p.name}, ${formatINR(p.price)}`}
                        className={cn(
                          "flex flex-col overflow-hidden rounded-xl border text-left transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0",
                          qty > 0 && "border-primary ring-1 ring-primary"
                        )}
                      >
                        <div className="relative">
                          <ProductArt art={p.image} className="aspect-[5/3] w-full rounded-none" />
                          {qty > 0 && (
                            <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                              {qty}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col p-2.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.brand}</p>
                          <p className="line-clamp-2 text-[12px] font-medium leading-snug">{p.name}</p>
                          <div className="mt-auto flex items-end justify-between pt-2">
                            <span className="text-[13px] font-semibold tabular">{formatINR(p.price)}</span>
                            <span className="text-[11px] tabular text-success">+{p.points} pts</span>
                          </div>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{p.stock} in stock</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          {/* Step 3 — cart, inline on mobile / portrait so the whole sale is one flow */}
          <Card ref={cartSectionRef} className="p-4 sm:p-5 lg:hidden" id="sale-cart">
            <StepHeader n={3} title="Cart & rewards" done={entries.length > 0 && !!customer} />
            <div className="mt-4 space-y-4">
              {cartLines}
              {cartTotals}
            </div>
          </Card>
        </div>

        {/* Desktop cart — its own scroll owner, header and totals stay put */}
        <aside className="hidden lg:block">
          <Card className="sticky top-24 flex max-h-[calc(100dvh-8rem)] flex-col p-5">
            <div className="shrink-0">
              <StepHeader n={3} title="Cart & rewards" done={entries.length > 0 && !!customer} />
            </div>
            <div className="scroll-region mt-4 min-h-0 flex-1">{cartLines}</div>
            {cartTotals && <div className="mt-4 shrink-0">{cartTotals}</div>}
          </Card>
        </aside>
      </div>

      {/* Mobile sticky summary — never overlaps content thanks to the page padding */}
      <div className="fixed inset-x-0 bottom-[62px] z-20 border-t bg-background/95 p-3 backdrop-blur-md lg:hidden">
        <div className="safe-bottom flex items-center gap-3">
          <button
            type="button"
            onClick={() => cartSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="min-w-0 rounded-lg px-1 text-left"
          >
            <p className="text-[17px] font-semibold tabular">{formatINR(breakdown.total)}</p>
            <p className="flex items-center gap-1 text-[11px] tabular text-muted-foreground">
              <ShoppingCart className="size-3" aria-hidden />
              {formatNumber(breakdown.totalPoints)} points · {cartCount} {cartCount === 1 ? "item" : "items"}
            </p>
          </button>
          <Button
            size="lg"
            className="flex-1"
            disabled={!customer || entries.length === 0}
            onClick={() => setConfirmOpen(true)}
          >
            Complete Sale
          </Button>
        </div>
      </div>

      <QRScanner open={scannerOpen} onOpenChange={setScannerOpen} customer={demoCustomer} onConfirm={setCustomer} />
      <CustomerSelector open={selectorOpen} onOpenChange={setSelectorOpen} onSelect={setCustomer} />

      {/* Confirm */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm sale</DialogTitle>
            <DialogDescription>Check the details before completing this sale.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {customer && (
              <div className="space-y-4 pb-2">
                <div className="flex items-center gap-3 rounded-xl border p-3.5">
                  <Avatar className="size-9"><AvatarFallback>{initials(customer.name)}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{customer.name}</p>
                    <p className="text-xs tabular text-muted-foreground">{customer.membershipId}</p>
                  </div>
                  <TierBadge tier={customer.tier} />
                </div>
                <div className="space-y-1.5 text-sm">
                  {entries.map((e) => (
                    <div key={e.product.id} className="flex justify-between gap-3">
                      <span className="truncate text-muted-foreground">{e.qty} × {e.product.name}</span>
                      <span className="shrink-0 tabular">{formatINR(e.product.price * e.qty)}</span>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="space-y-1.5 text-sm">
                  <Row label="Amount" value={formatINR(breakdown.total)} strong />
                  <Row label="Points earned" value={`+${formatNumber(breakdown.totalPoints)}`} tone="success" strong />
                  <Row label="New balance" value={`${formatNumber(customer.points + breakdown.totalPoints)} pts`} />
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Back</Button>
            <Button onClick={complete} loading={submitting}>Confirm Sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SaleSuccess({ sale, points, onNew }: { sale: Sale; points: number; onNew: () => void }) {
  return (
    <div className="mx-auto max-w-md py-6">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
        <Card className="overflow-hidden text-center">
          <div className="bg-success/[0.07] px-6 pb-6 pt-8">
            <motion.div
              initial={{ scale: 0.5, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 13 }}
              className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-success/15 text-success"
            >
              <PartyPopper className="size-7" />
            </motion.div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sale completed 🎉</h1>
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mt-1.5 flex items-center justify-center gap-1.5 text-[15px] font-medium text-success"
            >
              <Sparkles className="size-4" /> {formatNumber(points)} points added
            </motion.p>
          </div>
          <div className="space-y-2 p-5 text-left text-sm">
            <Row label="Invoice" value={sale.invoice} strong />
            <Row label="Customer" value={sale.customerName} />
            <Row label="Items" value={`${sale.items.reduce((s, i) => s + i.qty, 0)} products`} />
            <Row label="Amount" value={formatINR(sale.amount)} strong />
            <Row label="Store" value={`Ambika Electricals — ${sale.store}`} />
          </div>
          <div className="flex flex-col gap-2 border-t p-4 sm:flex-row">
            <Button className="flex-1" onClick={onNew}><Plus /> New Sale</Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href={`/business/customers/${sale.customerId}`}><UserRound /> View Customer</Link>
            </Button>
          </div>
        </Card>
      </motion.div>
      <Button asChild variant="ghost" className="mt-3 w-full"><Link href="/business/sales">Back to sales <ArrowRight /></Link></Button>
    </div>
  );
}

function StepHeader({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", done ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground")}>
        {done ? <Check className="size-3.5" strokeWidth={3} /> : n}
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
    </div>
  );
}

function Row({ label, value, strong, small, tone }: { label: string; value: string; strong?: boolean; small?: boolean; tone?: "success" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn("text-muted-foreground", small ? "text-[13px]" : "text-sm")}>{label}</span>
      <span className={cn("tabular", small ? "text-[13px]" : "text-sm", strong && "font-semibold", tone === "success" && "text-success")}>{value}</span>
    </div>
  );
}
