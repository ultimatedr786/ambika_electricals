"use client";

import * as React from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, CircleAlert, IndianRupee, Minus, PartyPopper, Plus, QrCode, ShoppingCart, Search,
  Sparkles, Trash2, UserPlus, UserRound, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { SearchInput } from "@/components/shared/search-input";
import { CatalogueImage, useCatalogueImages } from "@/components/shared/catalogue-image";
import { createClient } from "@/lib/supabase/client";
import { LiveQRScanner, type ScannedMember } from "@/components/business/qr-scanner";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { cn, formatINR, formatNumber, initials } from "@/lib/utils";
import {
  recordSaleAction,
  type LivePaymentMethod,
  type SaleOutcome,
} from "@/app/business/(app)/sales/sales-actions";

/**
 * Live POS (Step 3 Slice 2, restyled) — real Supabase sales, same visual
 * language as the numbered-step prototype flow it replaces on the New Sale
 * page, but every figure, image and action here is real:
 *
 *   • the product grid is the business's actual catalogue (real photos via
 *     `attach_catalogue_image`, real per-store stock);
 *   • "Identify customer" scans a genuine single-use QR or searches real
 *     `customer_memberships`, RLS-scoped to this business;
 *   • the server is the only source of truth for money — `create_sale`
 *     recomputes totals, validates payments to the paise, assigns the
 *     sequential invoice and posts the immutable points-ledger entry. Every
 *     figure shown before submit is a *preview*; the receipt renders what the
 *     RPC actually stored.
 *
 * Visibility: staff/manager/owner of a configured business only; demo mode
 * and customer sessions render nothing.
 */

interface MemberHit {
  id: string;
  membershipNo: string;
  displayName: string | null;
  phoneMasked: string | null;
  /** True when the member proved identity with a single-use QR at this counter. */
  qrVerified?: boolean;
}

interface CatalogueProduct {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  pricePaise: number;
  onHand: number | null;
}

interface ManualLine {
  key: number;
  name: string;
  qty: string;
  price: string; // rupees, free text
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

export function LivePosPanel({ headerAction }: { headerAction?: React.ReactNode } = {}) {
  const supabase = React.useMemo(() => createClient(), []);
  const configured = isSupabaseConfigured();

  const [loading, setLoading] = React.useState(true);
  const [businessId, setBusinessId] = React.useState<string | null>(null);
  const [role, setRole] = React.useState<"owner" | "manager" | "staff" | null>(null);
  const [stores, setStores] = React.useState<{ id: string; name: string }[]>([]);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const [earn, setEarn] = React.useState({ spendPaise: 10000, points: 10, minSpendPaise: 0, version: 1 });

  // Customer
  const [customerPickerOpen, setCustomerPickerOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<MemberHit[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [customer, setCustomer] = React.useState<MemberHit | null>(null);
  const [enrolling, setEnrolling] = React.useState(false);
  const [enrollForm, setEnrollForm] = React.useState({ name: "", phone: "", referralCode: "" });
  const [enrollBusy, setEnrollBusy] = React.useState(false);
  const [scannerOpen, setScannerOpen] = React.useState(false);

  // Catalogue — loaded once per store, filtered client-side (instant, like the
  // prototype's grid) rather than re-queried on every keystroke.
  const [catalogueLoading, setCatalogueLoading] = React.useState(true);
  const [catalogue, setCatalogue] = React.useState<CatalogueProduct[]>([]);
  const [catQuery, setCatQuery] = React.useState("");
  const [category, setCategory] = React.useState("All");
  const catalogueIds = React.useMemo(() => catalogue.map((p) => p.id), [catalogue]);
  const catalogueImages = useCatalogueImages("product", catalogueIds);

  // Cart — catalogue lines keyed by product id (qty map, like the prototype),
  // plus a secondary free-text list for items not yet in the catalogue.
  const [catalogueQty, setCatalogueQty] = React.useState<Record<string, number>>({});
  const [manualLines, setManualLines] = React.useState<ManualLine[]>([]);
  const [manualOpen, setManualOpen] = React.useState(false);
  const manualKey = React.useRef(1);

  const [discount, setDiscount] = React.useState("");
  const [method, setMethod] = React.useState<LivePaymentMethod>("cash");
  const [submitting, setSubmitting] = React.useState(false);
  const [receipt, setReceipt] = React.useState<SaleOutcome | null>(null);

  // Idempotency: one key per cart submission, reused on retry after a network
  // error (a failed validation never consumes it server-side), dropped when
  // the next sale starts. A committed-but-lost response replays the winner.
  const idemRef = React.useRef<string | null>(null);

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
        // Versioned rule engine (Slice 6): the *preview* rate. The points that
        // actually post come from the version create_sale resolves server-side.
        supabase.rpc("current_loyalty_rule", { p_business_id: bid }),
        supabase.from("stores").select("id, name").eq("business_id", bid).order("name"),
        rows[0].role === "staff"
          ? supabase.from("store_memberships").select("store_id").eq("profile_id", user.id)
          : Promise.resolve({ data: [] }),
      ]);
      const rule = businessRes.data as {
        earn_spend_paise?: number; earn_points?: number; min_spend_paise?: number; version?: number;
      } | null;
      if (rule?.earn_spend_paise) {
        setEarn({
          spendPaise: Number(rule.earn_spend_paise),
          points: Number(rule.earn_points ?? 0),
          minSpendPaise: Number(rule.min_spend_paise ?? 0),
          version: Number(rule.version ?? 1),
        });
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

  // Load the real catalogue once the business/store are known, and again
  // whenever the store changes (stock is per-store).
  React.useEffect(() => {
    if (!configured || !supabase || !businessId) return;
    let cancelled = false;
    setCatalogueLoading(true);
    void (async () => {
      const { data } = await supabase
        .from("products")
        .select("id, sku, name, category, price_paise")
        .eq("business_id", businessId)
        .eq("status", "active")
        .order("name");
      const prods = (data ?? []) as { id: string; sku: string; name: string; category: string | null; price_paise: number }[];
      const ids = prods.map((p) => p.id);
      const { data: inv } = ids.length && storeId
        ? await supabase.from("inventory_by_store").select("product_id, on_hand").in("product_id", ids).eq("store_id", storeId)
        : { data: [] };
      if (cancelled) return;
      const stock = new Map(((inv ?? []) as { product_id: string; on_hand: number }[]).map((i) => [i.product_id, Number(i.on_hand)]));
      setCatalogue(
        prods.map((p) => ({
          id: p.id, sku: p.sku, name: p.name, category: p.category,
          pricePaise: Number(p.price_paise),
          onHand: stock.has(p.id) ? stock.get(p.id)! : null,
        }))
      );
      setCatalogueLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, supabase, businessId, storeId]);

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

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of catalogue) if (p.category) set.add(p.category);
    return ["All", ...Array.from(set).sort()];
  }, [catalogue]);

  const filteredCatalogue = React.useMemo(() => {
    const t = catQuery.trim().toLowerCase();
    return catalogue
      .filter((p) => category === "All" || p.category === category)
      .filter((p) => !t || `${p.name} ${p.sku}`.toLowerCase().includes(t));
  }, [catalogue, category, catQuery]);

  const addToCart = (productId: string) => {
    setCatalogueQty((c) => ({ ...c, [productId]: (c[productId] ?? 0) + 1 }));
  };
  const setCartQty = (productId: string, qty: number) => {
    setCatalogueQty((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[productId];
      else next[productId] = qty;
      return next;
    });
  };

  const cartEntries = React.useMemo(
    () =>
      Object.entries(catalogueQty)
        .map(([id, qty]) => {
          const product = catalogue.find((p) => p.id === id);
          return product ? { product, qty } : null;
        })
        .filter((x): x is { product: CatalogueProduct; qty: number } => x !== null),
    [catalogueQty, catalogue]
  );
  const filledManualLines = manualLines.filter((l) => l.name.trim().length > 0 && toPaise(l.price) > 0);

  /* ---- cart math (previews only — the RPC is authoritative) ---- */
  const catalogueSubtotalPaise = cartEntries.reduce((s, e) => s + e.product.pricePaise * e.qty, 0);
  const manualSubtotalPaise = filledManualLines.reduce(
    (s, l) => s + (Number.parseInt(l.qty, 10) || 0) * toPaise(l.price),
    0
  );
  const subtotalPaise = catalogueSubtotalPaise + manualSubtotalPaise;
  const discountPaise = Math.min(toPaise(discount), subtotalPaise);
  const totalPaise = Math.max(subtotalPaise - discountPaise, 0);
  // Preview only — mirrors public.loyalty_points_for(), including the minimum
  // spend gate. The server response is what gets stored and shown on the receipt.
  const previewPoints =
    customer && totalPaise > 0 && totalPaise >= earn.minSpendPaise
      ? Math.floor((totalPaise * earn.points) / earn.spendPaise)
      : 0;

  const cartCount = cartEntries.reduce((s, e) => s + e.qty, 0) + filledManualLines.length;
  const canSubmit = !!businessId && !!storeId && !submitting && cartCount > 0 && totalPaise > 0;

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
      const code = enrollForm.referralCode.trim();
      let referralWarning = false;
      if (code) {
        const { error: refError } = await supabase.rpc("record_referral", {
          p_business_id: businessId,
          p_referred_membership_id: row.id,
          p_referral_code: code,
        });
        referralWarning = !!refError;
      }
      setCustomer({ id: row.id, membershipNo: row.membership_no, displayName: row.display_name, phoneMasked: row.phone_masked });
      setEnrolling(false);
      setEnrollForm({ name: "", phone: "", referralCode: "" });
      setCustomerPickerOpen(false);
      if (referralWarning) {
        toast.warning(`Member ${row.membership_no} enrolled.`, { description: "That referral code wasn't valid — not linked." });
      } else {
        toast.success(`Member ${row.membership_no} enrolled.`);
      }
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
        lines: [
          ...cartEntries.map((e) => ({
            productId: e.product.id,
            name: e.product.name,
            qty: e.qty,
            unitPricePaise: e.product.pricePaise,
          })),
          ...filledManualLines.map((l) => ({
            productId: null,
            name: l.name.trim(),
            qty: Number.parseInt(l.qty, 10) || 1,
            unitPricePaise: toPaise(l.price),
          })),
        ],
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
    setCustomerPickerOpen(false);
    setCatalogueQty({});
    setManualLines([]);
    setManualOpen(false);
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

  if (receipt) {
    return (
      <div className="mx-auto max-w-md py-2">
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
              <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sale recorded</h1>
              {receipt.pointsTotal > 0 ? (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="mt-1.5 flex items-center justify-center gap-1.5 text-[15px] font-medium text-success"
                >
                  <Sparkles className="size-4" /> {formatNumber(receipt.pointsTotal)} points added
                </motion.p>
              ) : (
                <p className="mt-1.5 text-[15px] text-muted-foreground">
                  {customer ? "No points on this sale." : "Walk-in sale — no points earned."}
                </p>
              )}
            </div>
            <div className="space-y-2 p-5 text-left text-sm">
              <Row label="Invoice" value={receipt.invoiceNo} strong />
              <Row label="Amount" value={formatINR(receipt.totalPaise / 100)} strong />
              {receipt.discountPaise > 0 && <Row label="Discount" value={formatINR(receipt.discountPaise / 100)} />}
              {receipt.balanceAfter != null && <Row label="New balance" value={`${formatNumber(receipt.balanceAfter)} pts`} />}
              {receipt.stockLines > 0 && (
                <Row
                  label="Stock updated"
                  value={`${receipt.stockLines} line${receipt.stockLines > 1 ? "s" : ""}${receipt.priceOverrides > 0 ? ` · ${receipt.priceOverrides} override${receipt.priceOverrides > 1 ? "s" : ""}` : ""}`}
                />
              )}
              {receipt.replayed && (
                <p className="pt-1 text-xs text-muted-foreground">
                  This sale was already recorded (idempotent replay) — nothing was double-charged.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 border-t p-4 sm:flex-row">
              <Button className="flex-1" onClick={startNextSale}><Plus /> New sale</Button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  const cartLines = (
    <div className="space-y-2.5">
      {cartEntries.length === 0 && filledManualLines.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="Cart is empty" description="Add electrical products to build the sale." className="py-8" />
      ) : (
        <AnimatePresence initial={false}>
          {cartEntries.map((e) => (
            <motion.div
              key={e.product.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="flex items-center gap-3 rounded-lg border p-2.5"
            >
              <div className="size-11 shrink-0 overflow-hidden rounded-lg">
                <CatalogueImage image={catalogueImages.get(e.product.id) ?? null} name={e.product.name} artKey="box" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{e.product.name}</p>
                <p className="text-xs tabular text-muted-foreground">
                  {formatINR(e.product.pricePaise / 100)} × {e.qty} = {formatINR((e.product.pricePaise * e.qty) / 100)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="outline" size="icon-sm" onClick={() => setCartQty(e.product.id, e.qty - 1)} aria-label={`Reduce ${e.product.name}`}>
                  {e.qty === 1 ? <Trash2 /> : <Minus />}
                </Button>
                <span className="w-7 text-center text-sm font-semibold tabular">{e.qty}</span>
                <Button
                  variant="outline" size="icon-sm"
                  disabled={e.product.onHand != null && e.qty >= e.product.onHand}
                  onClick={() => setCartQty(e.product.id, e.qty + 1)}
                  aria-label={`Add ${e.product.name}`}
                >
                  <Plus />
                </Button>
              </div>
            </motion.div>
          ))}
          {filledManualLines.map((l) => (
            <motion.div
              key={l.key}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="flex items-center gap-3 rounded-lg border border-dashed p-2.5"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <IndianRupee className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{l.name}</p>
                <p className="text-xs tabular text-muted-foreground">
                  Manual line · {formatINR(toPaise(l.price) / 100)} × {l.qty || 1}
                </p>
              </div>
              <Button
                variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive"
                onClick={() => setManualLines(manualLines.filter((x) => x.key !== l.key))}
                aria-label={`Remove ${l.name}`}
              >
                <Trash2 />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  );

  const cartTotals = cartCount > 0 && (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="pos-discount" className="text-sm text-muted-foreground">Discount</Label>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground">₹</span>
          <Input
            id="pos-discount" type="number" min={0} step={0.01}
            value={discount} placeholder="0"
            onChange={(e) => setDiscount(e.target.value)}
            className="h-9 w-24 text-right"
          />
        </div>
      </div>
      <Separator />
      <Row label="Subtotal" value={formatINR(subtotalPaise / 100)} />
      {discountPaise > 0 && <Row label="Discount" value={`− ${formatINR(discountPaise / 100)}`} />}
      <Row label="Amount payable" value={formatINR(totalPaise / 100)} strong />

      {customer && (
        <div className="rounded-xl border bg-accent/40 p-3.5">
          <p className="flex items-center gap-1.5 text-[13px] font-medium">
            <Sparkles className="size-3.5 text-primary" aria-hidden /> Reward points (preview)
          </p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {previewPoints > 0
              ? `Member earns ≈ ${previewPoints} pts — rule v${earn.version}, server-authoritative`
              : earn.minSpendPaise > 0 && totalPaise > 0 && totalPaise < earn.minSpendPaise
                ? `Below the ₹${earn.minSpendPaise / 100} minimum spend — no points on this sale`
                : "No points on this total yet"}
          </p>
        </div>
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
      </div>

      <Button size="lg" className="w-full" onClick={submit} loading={submitting} disabled={!canSubmit}>
        <Check /> Record sale
      </Button>
      {!storeId && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <CircleAlert className="size-3.5" aria-hidden /> Choose a store to record this sale
        </p>
      )}
    </div>
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <IndianRupee className="size-4.5" />
          </span>
          <p className="text-xs text-muted-foreground">
            Server-computed totals — figures below are previews until the sale is recorded
          </p>
          {stores.length > 1 && (
            <Select value={storeId ?? ""} onValueChange={setStoreId}>
              <SelectTrigger className="ml-2 h-8 w-40" aria-label="Store"><SelectValue placeholder="Store" /></SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {headerAction}
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {/* Step 1 — customer */}
          <Card className="p-4 sm:p-5">
            <StepHeader n={1} title="Identify customer" done={!!customer} />
            <AnimatePresence mode="wait">
              {customer ? (
                <motion.div key="picked" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-success/30 bg-success/[0.05] p-3.5">
                  <Avatar className="size-10"><AvatarFallback>{initials(customer.displayName ?? "Member")}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{customer.displayName ?? "Member"}</p>
                    <p className="truncate text-xs tabular text-muted-foreground">
                      {customer.membershipNo}{customer.phoneMasked ? ` · ${customer.phoneMasked}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {customer.qrVerified && (
                      <Badge variant="outline" className="gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                        <Check className="size-2.5" aria-hidden /> QR verified
                      </Badge>
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => { setCustomer(null); setQuery(""); }} aria-label="Change customer"><X /></Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-3">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <Button size="lg" className="h-auto flex-col gap-1.5 py-4" onClick={() => setScannerOpen(true)}>
                      <QrCode className="!size-5" aria-hidden />
                      <span>Scan Customer QR</span>
                      <span className="text-[11px] font-normal opacity-95">Fastest way at the counter</span>
                    </Button>
                    <Button
                      size="lg" variant="outline" className="h-auto flex-col gap-1.5 py-4"
                      onClick={() => setCustomerPickerOpen((v) => !v)}
                    >
                      <Search className="!size-5" aria-hidden />
                      <span>Select Customer</span>
                      <span className="text-[11px] font-normal text-muted-foreground">Name, phone or member ID</span>
                    </Button>
                  </div>

                  {customerPickerOpen && (
                    <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input
                          className="pl-8"
                          placeholder="Search name, AE-… no or phone — or walk-in"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          aria-label="Search members"
                          autoFocus
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
                                onClick={() => { setCustomer(h); setHits([]); setQuery(""); setCustomerPickerOpen(false); }}
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
                        <div className="space-y-2 rounded-lg border bg-background p-2.5">
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
                          <Input
                            placeholder="Referral code (optional)"
                            value={enrollForm.referralCode}
                            onChange={(e) => setEnrollForm({ ...enrollForm, referralCode: e.target.value })}
                            aria-label="Referral code"
                          />
                          <Button size="sm" onClick={enrollMember} loading={enrollBusy}
                            disabled={enrollForm.name.trim().length < 2}>
                            <UserPlus /> Enrol member
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          {/* Step 2 — products */}
          <Card className="p-4 sm:p-5">
            <StepHeader n={2} title="Add electrical products" done={cartCount > 0} />
            <div className="mt-4 space-y-3">
              <SearchInput value={catQuery} onChange={setCatQuery} placeholder="Search product, brand or SKU" />
              {categories.length > 1 && (
                <div className="scroll-region-x -mx-1 px-1 no-scrollbar">
                  <div className="flex w-max gap-2 pb-1">
                    {categories.map((c) => (
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
              )}

              {catalogueLoading ? (
                <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                  <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
                  Loading catalogue…
                </div>
              ) : catalogue.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="No products yet"
                  description="Add products on the Products page — they'll appear here automatically."
                  className="py-10"
                />
              ) : filteredCatalogue.length === 0 ? (
                <EmptyState icon={Search} title="No products found" description="Try another product name, brand or SKU." className="py-10" />
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:scroll-region lg:max-h-[540px] lg:pr-1 xl:grid-cols-4">
                  {filteredCatalogue.map((p) => {
                    const qty = catalogueQty[p.id] ?? 0;
                    const outOfStock = p.onHand != null && p.onHand <= 0;
                    return (
                      <button
                        key={p.id}
                        onClick={() => addToCart(p.id)}
                        disabled={outOfStock}
                        aria-label={`Add ${p.name}, ${formatINR(p.pricePaise / 100)}`}
                        className={cn(
                          "flex flex-col overflow-hidden rounded-xl border text-left transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0",
                          qty > 0 && "border-primary ring-1 ring-primary"
                        )}
                      >
                        <div className="relative aspect-[5/3] w-full">
                          <CatalogueImage image={catalogueImages.get(p.id) ?? null} name={p.name} artKey="box" className="rounded-none" />
                          {qty > 0 && (
                            <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                              {qty}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col p-2.5">
                          {p.category && <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.category}</p>}
                          <p className="line-clamp-2 text-[12px] font-medium leading-snug">{p.name}</p>
                          <div className="mt-auto flex items-end justify-between pt-2">
                            <span className="text-[13px] font-semibold tabular">{formatINR(p.pricePaise / 100)}</span>
                          </div>
                          <p className={cn("mt-0.5 text-[10px]", outOfStock ? "text-destructive" : "text-muted-foreground")}>
                            {p.onHand != null ? `${p.onHand} in stock` : "Stock not tracked"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="pt-1">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                  onClick={() => setManualOpen((v) => !v)}
                >
                  <Plus className="size-3" aria-hidden /> {manualOpen ? "Hide manual line entry" : "Add an item not in the catalogue"}
                </button>
                {manualOpen && (
                  <div className="mt-2 space-y-2 rounded-lg border bg-muted/20 p-2.5">
                    {manualLines.map((l) => (
                      <div key={l.key} className="flex items-end gap-2">
                        <Input
                          placeholder="Item name"
                          value={l.name}
                          onChange={(e) => setManualLines(manualLines.map((x) => (x.key === l.key ? { ...x, name: e.target.value } : x)))}
                          className="flex-1"
                          aria-label="Manual line item name"
                        />
                        <Input
                          type="number" min={1} step={1} value={l.qty}
                          onChange={(e) => setManualLines(manualLines.map((x) => (x.key === l.key ? { ...x, qty: e.target.value } : x)))}
                          className="w-16" aria-label="Manual line quantity"
                        />
                        <Input
                          type="number" min={0} step={0.01} placeholder="₹0.00" value={l.price}
                          onChange={(e) => setManualLines(manualLines.map((x) => (x.key === l.key ? { ...x, price: e.target.value } : x)))}
                          className="w-24" aria-label="Manual line price"
                        />
                        <Button
                          variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive"
                          onClick={() => setManualLines(manualLines.filter((x) => x.key !== l.key))}
                          aria-label="Remove manual line"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline" size="sm"
                      onClick={() => setManualLines([...manualLines, { key: manualKey.current++, name: "", qty: "1", price: "" }])}
                    >
                      <Plus /> Add line
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Step 3 — cart, inline on mobile / portrait so the whole sale is one flow */}
          <Card className="p-4 sm:p-5 lg:hidden">
            <StepHeader n={3} title="Cart & rewards" done={cartCount > 0 && !!customer} />
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
              <StepHeader n={3} title="Cart & rewards" done={cartCount > 0 && !!customer} />
            </div>
            <div className="scroll-region mt-4 min-h-0 flex-1">{cartLines}</div>
            {cartTotals && <div className="mt-4 shrink-0">{cartTotals}</div>}
          </Card>
        </aside>
      </div>

      <LiveQRScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        storeId={storeId}
        businessId={businessId}
        onVerified={(m: ScannedMember) => {
          setCustomer({
            id: m.customerMembershipId,
            membershipNo: m.membershipNo,
            displayName: m.displayName,
            phoneMasked: m.phoneMasked,
            qrVerified: !m.manual,
          });
          setHits([]);
          setQuery("");
          setCustomerPickerOpen(false);
        }}
      />
    </Card>
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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm tabular", strong && "font-semibold")}>{value}</span>
    </div>
  );
}
