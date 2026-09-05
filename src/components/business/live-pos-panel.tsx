"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  CheckCircle2, IndianRupee, Package, Plus, Receipt, Search, Sparkles, Store, Trash2, UserPlus, UserRound, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { formatINR } from "@/lib/utils";
import {
  recordSaleAction,
  type LivePaymentMethod,
  type SaleOutcome,
} from "@/app/business/(app)/sales/sales-actions";

/**
 * Live POS (Step 3 Slice 2) — real Supabase sales, rendered above the
 * prototype billing flow on the New Sale page.
 *
 * The server is the only source of truth: `create_sale` recomputes totals,
 * validates payments to the paise, assigns the sequential invoice and posts
 * the immutable points-ledger entry. Everything money-related shown here
 * before submit is a *preview*; the receipt renders what the RPC returned.
 *
 * Visibility: staff/manager/owner of a configured business only; demo mode
 * and customer sessions render nothing.
 */

interface MemberHit {
  id: string;
  membershipNo: string;
  displayName: string | null;
  phoneMasked: string | null;
}

interface CartLine {
  key: number;
  /** Catalogue-backed lines are re-priced and stock-checked by the RPC. */
  productId?: string | null;
  name: string;
  qty: string;
  price: string; // rupees, free text
}

interface CatalogueHit {
  id: string;
  sku: string;
  name: string;
  pricePaise: number;
  onHand: number | null;
}

const PAYMENT_METHODS: { value: LivePaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "credit", label: "Store credit" },
  { value: "other", label: "Other" },
];

/** Rupee text → whole paise (server does the authoritative math). */
function toPaise(rupees: string): number {
  const n = Number.parseFloat(rupees);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

export function LivePosPanel() {
  const supabase = React.useMemo(() => createClient(), []);
  const configured = isSupabaseConfigured();

  const [loading, setLoading] = React.useState(true);
  const [businessId, setBusinessId] = React.useState<string | null>(null);
  const [role, setRole] = React.useState<"owner" | "manager" | "staff" | null>(null);
  const [stores, setStores] = React.useState<{ id: string; name: string }[]>([]);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const [earn, setEarn] = React.useState({ spendPaise: 10000, points: 10 });

  // Customer picker
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<MemberHit[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [customer, setCustomer] = React.useState<MemberHit | null>(null);
  const [enrolling, setEnrolling] = React.useState(false);
  const [enrollForm, setEnrollForm] = React.useState({ name: "", phone: "" });
  const [enrollBusy, setEnrollBusy] = React.useState(false);

  // Catalogue picker
  const [catQuery, setCatQuery] = React.useState("");
  const [catHits, setCatHits] = React.useState<CatalogueHit[]>([]);
  const [catSearching, setCatSearching] = React.useState(false);

  // Cart
  const [lines, setLines] = React.useState<CartLine[]>([{ key: 1, name: "", qty: "1", price: "" }]);
  const [discount, setDiscount] = React.useState("");
  const [method, setMethod] = React.useState<LivePaymentMethod>("cash");
  const [submitting, setSubmitting] = React.useState(false);
  const [receipt, setReceipt] = React.useState<SaleOutcome | null>(null);

  // Idempotency: one key per cart submission, reused on retry after a network
  // error (a failed validation never consumes it server-side), dropped when
  // the next sale starts. A committed-but-lost response replays the winner.
  const idemRef = React.useRef<string | null>(null);
  const lineKey = React.useRef(2);

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
      // Own membership only — the management policy exposes the whole roster.
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

      const [businessRes, storeRes, scopeRes] = await Promise.all([
        supabase.from("businesses").select("earn_spend_paise, earn_points").eq("id", bid).maybeSingle(),
        supabase.from("stores").select("id, name").eq("business_id", bid).order("name"),
        rows[0].role === "staff"
          ? supabase.from("store_memberships").select("store_id").eq("profile_id", user.id)
          : Promise.resolve({ data: [] }),
      ]);
      const b = businessRes.data as { earn_spend_paise?: number; earn_points?: number } | null;
      if (b?.earn_spend_paise && b?.earn_points) {
        setEarn({ spendPaise: Number(b.earn_spend_paise), points: Number(b.earn_points) });
      }

      let storeRows = (storeRes.data ?? []) as { id: string; name: string }[];
      if (rows[0].role === "staff") {
        const scoped = ((scopeRes.data ?? []) as { store_id: string }[]).map((s) => s.store_id);
        if (scoped.length > 0) storeRows = storeRows.filter((s) => scoped.includes(s.id));
      }
      setStores(storeRows);
      if (storeRows.length > 0) setStoreId(storeRows[0].id);
    } finally {
      setLoading(false);
    }
  }, [configured, supabase]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  // Debounced member search (RLS keeps this to the viewer's business).
  React.useEffect(() => {
    if (!configured || !supabase || !businessId || customer) return;
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
        ((data ?? []) as { id: string; membership_no: string; display_name: string | null; phone_masked: string | null }[]).map(
          (m) => ({ id: m.id, membershipNo: m.membership_no, displayName: m.display_name, phoneMasked: m.phone_masked })
        )
      );
      setSearching(false);
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, businessId, customer, configured, supabase]);

  // Debounced catalogue search (RLS keeps this to the viewer's business; the
  // stock figures respect the store-scoped inventory policy).
  React.useEffect(() => {
    if (!configured || !supabase || !businessId) return;
    const q = catQuery.trim();
    if (q.length < 2) {
      setCatHits([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setCatSearching(true);
      const { data } = await supabase
        .from("products")
        .select("id, sku, name, price_paise")
        .eq("business_id", businessId)
        .eq("status", "active")
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
        .limit(6);
      const prods = ((data ?? []) as { id: string; sku: string; name: string; price_paise: number }[]);
      const ids = prods.map((p) => p.id);
      const { data: inv } = ids.length && storeId
        ? await supabase.from("inventory_by_store").select("product_id, on_hand").in("product_id", ids).eq("store_id", storeId)
        : { data: [] };
      const stock = new Map(((inv ?? []) as { product_id: string; on_hand: number }[]).map((i) => [i.product_id, Number(i.on_hand)]));
      setCatHits(
        prods.map((p) => ({
          id: p.id, sku: p.sku, name: p.name, pricePaise: Number(p.price_paise),
          onHand: stock.has(p.id) ? stock.get(p.id)! : null,
        }))
      );
      setCatSearching(false);
    }, 250);
    return () => window.clearTimeout(t);
  }, [catQuery, businessId, storeId, configured, supabase]);

  const addCatalogueLine = (hit: CatalogueHit) => {
    const key = lineKey.current++;
    setLines([...lines, { key, productId: hit.id, name: hit.name, qty: "1", price: (hit.pricePaise / 100).toFixed(2) }]);
    setCatQuery("");
    setCatHits([]);
  };

  /* ---- cart math (previews only — the RPC is authoritative) ---- */
  const linePaise = (l: CartLine) => {
    const qty = Number.parseInt(l.qty, 10);
    if (!Number.isFinite(qty) || qty <= 0) return 0;
    return qty * toPaise(l.price);
  };
  const subtotalPaise = lines.reduce((sum, l) => sum + linePaise(l), 0);
  const discountPaise = Math.min(toPaise(discount), subtotalPaise);
  const totalPaise = Math.max(subtotalPaise - discountPaise, 0);
  const previewPoints = customer && totalPaise > 0 ? Math.floor((totalPaise * earn.points) / earn.spendPaise) : 0;

  const filledLines = lines.filter((l) => (l.productId || l.name.trim().length > 0) && linePaise(l) > 0);
  const canSubmit =
    !!businessId && !!storeId && !submitting && filledLines.length > 0 && totalPaise > 0;

  const enrollMember = async () => {
    if (!businessId || !supabase) return;
    const name = enrollForm.name.trim();
    const phone = enrollForm.phone.replace(/\D/g, "");
    if (name.length < 2) return;
    setEnrollBusy(true);
    try {
      // Direct insert is RLS-guarded (staff+ of the business); the trigger
      // assigns the membership number and we never store raw phone digits —
      // only the masked tail (schema CHECK enforces the mask format).
      const { data, error } = await supabase
        .from("customer_memberships")
        .insert({
          business_id: businessId,
          display_name: name,
          phone_masked: phone.length >= 4 ? `XXXXX${phone.slice(-4)}` : null,
          enrollment_data: { source: "pos-live" },
          enrolled_store_id: storeId,
        })
        .select("id, membership_no, display_name, phone_masked")
        .maybeSingle();
      if (error || !data) {
        toast.error("Couldn't enrol the member", { description: error?.message ?? "Please try again." });
        return;
      }
      const row = data as { id: string; membership_no: string; display_name: string | null; phone_masked: string | null };
      setCustomer({ id: row.id, membershipNo: row.membership_no, displayName: row.display_name, phoneMasked: row.phone_masked });
      setEnrolling(false);
      setEnrollForm({ name: "", phone: "" });
      toast.success(`Member ${row.membership_no} enrolled.`);
    } finally {
      setEnrollBusy(false);
    }
  };

  const submit = async () => {
    if (!storeId || !canSubmit) return;
    setSubmitting(true);
    try {
      if (!idemRef.current) idemRef.current = crypto.randomUUID();
      const result = await recordSaleAction({
        storeId,
        customerMembershipId: customer?.id ?? null,
        lines: filledLines.map((l) => ({
          productId: l.productId ?? null,
          name: l.name.trim(),
          qty: Number.parseInt(l.qty, 10) || 1,
          unitPricePaise: toPaise(l.price),
        })),
        discountPaise,
        payments: [{ method, amountPaise: totalPaise }],
        idempotencyKey: idemRef.current,
      });
      if (!result.ok) {
        toast.error("Sale not recorded", { description: result.message });
        return;
      }
      setReceipt(result.data);
      toast.success(
        result.data.replayed ? "Sale recovered (already recorded)." : `Sale ${result.data.invoiceNo} recorded.`,
        { description: `${formatINR(result.data.totalPaise / 100)}${result.data.pointsTotal > 0 ? ` · ${result.data.pointsTotal} pts added` : ""}` }
      );
    } finally {
      setSubmitting(false);
    }
  };

  const startNextSale = () => {
    idemRef.current = null;
    setReceipt(null);
    setCustomer(null);
    setQuery("");
    setLines([{ key: 1, name: "", qty: "1", price: "" }]);
    setDiscount("");
    setMethod("cash");
  };

  if (!configured) return null;
  if (loading) {
    return (
      <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        Loading live POS…
      </Card>
    );
  }
  if (!businessId || !role) return null;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Receipt className="size-4.5" />
          </span>
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              Live POS
              <Badge variant="outline" className="gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> Supabase
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">
              Server-computed totals, sequential invoices &amp; immutable points ledger — figures below
              are previews until the sale is recorded
            </p>
          </div>
        </div>
      </div>

      {receipt ? (
        /* ---------------- Receipt (what the RPC actually stored) ---------------- */
        <div className="space-y-4 px-5 py-6 text-center">
          <CheckCircle2 className="mx-auto size-10 text-emerald-500" aria-hidden />
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Invoice</p>
            <p className="font-mono text-2xl font-semibold">{receipt.invoiceNo}</p>
          </div>
          <p className="text-sm">
            Total <strong>{formatINR(receipt.totalPaise / 100)}</strong>
            {receipt.discountPaise > 0 && <> · discount {formatINR(receipt.discountPaise / 100)}</>}
          </p>
          {customer ? (
            receipt.pointsTotal > 0 ? (
              <p className="flex items-center justify-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                <Sparkles className="size-4" aria-hidden />
                {receipt.pointsTotal} points added
                {receipt.balanceAfter != null && <> · balance {receipt.balanceAfter}</>}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No points on this sale.</p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Walk-in sale — no points earned.</p>
          )}
          {receipt.stockLines > 0 && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Package className="size-3.5" aria-hidden />
              Stock decremented for {receipt.stockLines} catalogue line{receipt.stockLines > 1 ? "s" : ""}
              {receipt.priceOverrides > 0 && ` · ${receipt.priceOverrides} manager price override${receipt.priceOverrides > 1 ? "s" : ""} (audited)`}
            </p>
          )}
          {receipt.replayed && (
            <p className="text-xs text-muted-foreground">
              This sale was already recorded (idempotent replay) — nothing was double-charged.
            </p>
          )}
          <Button onClick={startNextSale} className="mx-auto">
            <Plus /> Start next sale
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_320px]">
          {/* ---------------- Items ---------------- */}
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pos-store">Store</Label>
                <Select value={storeId ?? ""} onValueChange={setStoreId}>
                  <SelectTrigger id="pos-store" aria-label="Store"><SelectValue placeholder="Select store" /></SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Customer</Label>
                {customer ? (
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1.5">
                    <UserRound className="size-4 text-muted-foreground" aria-hidden />
                    <span className="truncate text-sm font-medium">{customer.displayName ?? "Member"}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">{customer.membershipNo}</Badge>
                    <Button variant="ghost" size="sm" className="ml-auto h-6 px-1.5" aria-label="Clear customer"
                      onClick={() => { setCustomer(null); setQuery(""); }}>
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <Input
                        className="pl-8"
                        placeholder="Search name, AE-… no or phone — or walk-in"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Search members"
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
                              onClick={() => { setCustomer(h); setHits([]); setQuery(""); }}
                            >
                              <UserRound className="size-3.5 text-muted-foreground" aria-hidden />
                              <span className="truncate font-medium">{h.displayName ?? "Member"}</span>
                              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{h.membershipNo}</span>
                              {h.phoneMasked && <span className="text-[10px] text-muted-foreground">{h.phoneMasked}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                      onClick={() => setEnrolling((v) => !v)}
                    >
                      <UserPlus className="size-3" aria-hidden /> {enrolling ? "Cancel enrolment" : "Enrol a new member"}
                    </button>
                    {enrolling && (
                      <div className="space-y-2 rounded-lg border bg-muted/20 p-2.5">
                        <Input
                          placeholder="Full name"
                          value={enrollForm.name}
                          onChange={(e) => setEnrollForm({ ...enrollForm, name: e.target.value })}
                          aria-label="New member name"
                        />
                        <Input
                          placeholder="Phone (only last 4 digits are stored)"
                          inputMode="tel"
                          value={enrollForm.phone}
                          onChange={(e) => setEnrollForm({ ...enrollForm, phone: e.target.value })}
                          aria-label="New member phone"
                        />
                        <Button size="sm" onClick={enrollMember} loading={enrollBusy}
                          disabled={enrollForm.name.trim().length < 2}>
                          <UserPlus /> Enrol member
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label htmlFor="pos-catalogue">Add from catalogue</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="pos-catalogue"
                  className="pl-8"
                  placeholder="Search live products by name or SKU — server re-prices and decrements stock"
                  value={catQuery}
                  onChange={(e) => setCatQuery(e.target.value)}
                />
                {catSearching && (
                  <span className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" aria-hidden />
                )}
              </div>
              {catHits.length > 0 && (
                <ul className="space-y-1 rounded-lg border bg-background p-1.5">
                  {catHits.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                        onClick={() => addCatalogueLine(h)}
                      >
                        <Package className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1 truncate font-medium">{h.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{h.sku}</span>
                        {h.onHand != null && (
                          <span className={`text-[10px] ${h.onHand > 0 ? "text-muted-foreground" : "text-destructive"}`}>
                            {h.onHand} in stock
                          </span>
                        )}
                        <span className="text-xs font-semibold">{formatINR(h.pricePaise / 100)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={l.key} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    {i === 0 && <Label htmlFor={`pos-item-${l.key}`}>Item</Label>}
                    <Input
                      id={`pos-item-${l.key}`}
                      placeholder="Manual line — item name (e.g. LED bulb 9W)"
                      value={l.name}
                      disabled={!!l.productId}
                      title={l.productId ? "Catalogue lines are named and priced by the server" : undefined}
                      onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, name: e.target.value } : x)))}
                    />
                  </div>
                  <div className="w-20 space-y-1">
                    {i === 0 && <Label htmlFor={`pos-qty-${l.key}`}>Qty</Label>}
                    <Input
                      id={`pos-qty-${l.key}`}
                      type="number" min={1} step={1}
                      value={l.qty}
                      onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, qty: e.target.value } : x)))}
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    {i === 0 && <Label htmlFor={`pos-price-${l.key}`}>Price (₹)</Label>}
                    <Input
                      id={`pos-price-${l.key}`}
                      type="number" min={0} step={0.01}
                      placeholder="0.00"
                      value={l.price}
                      disabled={!!l.productId && role === "staff"}
                      title={l.productId ? (role === "staff" ? "Catalogue price — managers can override" : "Editing the catalogue price records an audited manager override") : undefined}
                      onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, price: e.target.value } : x)))}
                    />
                  </div>
                  <p className="w-20 pb-2 text-right text-xs text-muted-foreground">
                    {linePaise(l) > 0 ? formatINR(linePaise(l) / 100) : "—"}
                  </p>
                  <Button
                    variant="ghost" size="sm" className="mb-0.5 size-8 p-0 text-destructive hover:text-destructive"
                    aria-label="Remove line"
                    disabled={lines.length === 1}
                    onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline" size="sm"
                onClick={() => {
                  const key = lineKey.current++;
                  setLines([...lines, { key, name: "", qty: "1", price: "" }]);
                }}
              >
                <Plus /> Add manual line
              </Button>
            </div>
          </div>

          {/* ---------------- Totals & payment ---------------- */}
          <div className="space-y-3.5 rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatINR(subtotalPaise / 100)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <Label htmlFor="pos-discount" className="shrink-0 text-muted-foreground">Discount (₹)</Label>
              <Input
                id="pos-discount" type="number" min={0} step={0.01}
                className="h-8 w-24 text-right" placeholder="0.00"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total</span>
              <span className="flex items-center gap-0.5 text-xl font-semibold">
                <IndianRupee className="size-4" aria-hidden />{(totalPaise / 100).toFixed(2)}
              </span>
            </div>
            {customer && (
              <p className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                <Sparkles className="size-3.5 shrink-0" aria-hidden />
                {previewPoints > 0
                  ? `Member earns ≈ ${previewPoints} pts (₹${earn.spendPaise / 100} → ${earn.points} pts, server-authoritative)`
                  : "No points on this total yet"}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Paid via</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as LivePaymentMethod)}>
                <SelectTrigger aria-label="Payment method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Single payment of the exact total — the server rejects anything else to the paise.
                Split payments land with the redemptions slice.
              </p>
            </div>
            <Button className="w-full" onClick={submit} loading={submitting} disabled={!canSubmit}>
              <Store className="mr-1.5 size-4" aria-hidden /> Record sale
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Invoice number, points &amp; audit entries are assigned by the database.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
