"use client";

import * as React from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Minus, Package, PackagePlus, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormDialog } from "@/components/shared/form-dialog";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { formatINR } from "@/lib/utils";
import {
  adjustStockAction,
  createProductAction,
  receiveStockAction,
  updateProductAction,
} from "@/app/business/(app)/products/inventory-actions";

/**
 * Live catalogue & inventory (Step 3 Slice 3) — real Supabase products and
 * per-store stock, rendered above the prototype catalogue on the Products
 * page.
 *
 * Reads obey RLS: staff+ see the business catalogue; store-scoped staff see
 * stock only for their own stores. Writes are manager+ and RPC-only — every
 * movement appends to the immutable `inventory_movements` history (receive,
 * adjust with mandatory reason, sale decrement, void restock). Products are
 * archived, never deleted.
 */

interface LiveProduct {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  pricePaise: number;
  mrpPaise: number | null;
  status: "active" | "archived";
  stock: Map<string, { onHand: number; reorderLevel: number }>;
}

interface StockDialogState {
  product: LiveProduct;
  mode: "receive" | "adjust";
  storeId: string;
  qty: string;
  note: string;
}

export function LiveInventoryPanel() {
  const supabase = React.useMemo(() => createClient(), []);
  const configured = isSupabaseConfigured();

  const [loading, setLoading] = React.useState(true);
  const [businessId, setBusinessId] = React.useState<string | null>(null);
  const [role, setRole] = React.useState<"owner" | "manager" | "staff" | null>(null);
  const [products, setProducts] = React.useState<LiveProduct[]>([]);
  const [stores, setStores] = React.useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = React.useState("");
  const [showArchived, setShowArchived] = React.useState(false);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createBusy, setCreateBusy] = React.useState(false);
  const [createForm, setCreateForm] = React.useState({ name: "", sku: "", price: "", mrp: "", category: "" });
  const [openingStock, setOpeningStock] = React.useState<Record<string, string>>({});

  const [stockDialog, setStockDialog] = React.useState<StockDialogState | null>(null);
  const [stockBusy, setStockBusy] = React.useState(false);
  const [busyProductId, setBusyProductId] = React.useState<string | null>(null);

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

      const [prodRes, storeRes, invRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, sku, name, category, unit, price_paise, mrp_paise, status")
          .eq("business_id", bid)
          .order("name"),
        supabase.from("stores").select("id, name").eq("business_id", bid).order("name"),
        // RLS already scopes this: store-scoped staff only get their stores' rows.
        supabase.from("inventory_by_store").select("product_id, store_id, on_hand, reorder_level"),
      ]);

      const storeRows = (storeRes.data ?? []) as { id: string; name: string }[];
      const visibleStoreIds = new Set(storeRows.map((s) => s.id));
      const stockByProduct = new Map<string, Map<string, { onHand: number; reorderLevel: number }>>();
      for (const inv of (invRes.data ?? []) as {
        product_id: string; store_id: string; on_hand: number; reorder_level: number;
      }[]) {
        if (!visibleStoreIds.has(inv.store_id)) continue;
        let m = stockByProduct.get(inv.product_id);
        if (!m) {
          m = new Map();
          stockByProduct.set(inv.product_id, m);
        }
        m.set(inv.store_id, { onHand: Number(inv.on_hand), reorderLevel: Number(inv.reorder_level) });
      }

      setStores(storeRows);
      setProducts(
        ((prodRes.data ?? []) as {
          id: string; sku: string; name: string; category: string | null; unit: string;
          price_paise: number; mrp_paise: number | null; status: "active" | "archived";
        }[]).map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          category: p.category,
          unit: p.unit,
          pricePaise: Number(p.price_paise),
          mrpPaise: p.mrp_paise == null ? null : Number(p.mrp_paise),
          status: p.status,
          stock: stockByProduct.get(p.id) ?? new Map(),
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [configured, supabase]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  if (!configured) return null;
  if (loading) {
    return (
      <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        Loading live catalogue…
      </Card>
    );
  }
  if (!businessId || !role) return null;

  const isManager = role === "owner" || role === "manager";
  const t = query.trim().toLowerCase();
  const results = products.filter((p) => (showArchived ? true : p.status === "active"))
    .filter((p) => !t || `${p.name} ${p.sku} ${p.category ?? ""}`.toLowerCase().includes(t));

  const submitCreate = async () => {
    const pricePaise = Math.round(Number.parseFloat(createForm.price) * 100);
    if (createForm.name.trim().length < 2 || !Number.isFinite(pricePaise) || pricePaise < 0) return;
    setCreateBusy(true);
    try {
      const result = await createProductAction({
        businessId,
        name: createForm.name.trim(),
        sku: createForm.sku.trim(),
        pricePaise,
        category: createForm.category.trim() || null,
        mrpPaise: createForm.mrp ? Math.round(Number.parseFloat(createForm.mrp) * 100) : null,
        openingStock: Object.entries(openingStock)
          .map(([storeId, qty]) => ({ storeId, qty: Number.parseInt(qty, 10) }))
          .filter((s) => Number.isFinite(s.qty) && s.qty > 0),
      });
      if (!result.ok) {
        toast.error("Couldn't create the product", { description: result.message });
        return;
      }
      toast.success(`${result.data.sku} added to the catalogue.`, {
        description: result.data.storesStocked > 0
          ? `Opening stock posted to ${result.data.storesStocked} store(s) as immutable movements.`
          : "No opening stock — receive some from the row actions.",
      });
      setCreateOpen(false);
      setCreateForm({ name: "", sku: "", price: "", mrp: "", category: "" });
      setOpeningStock({});
      await reload();
    } finally {
      setCreateBusy(false);
    }
  };

  const submitStock = async () => {
    if (!stockDialog) return;
    const qty = Number.parseInt(stockDialog.qty, 10);
    if (!Number.isFinite(qty) || qty === 0) return;
    if (stockDialog.mode === "receive" && qty <= 0) return;
    if (stockDialog.mode === "adjust" && stockDialog.note.trim().length < 3) return;
    setStockBusy(true);
    try {
      // Fresh key per dialog submission — retries after a network error reuse
      // it, so a receipt/adjustment never double-posts.
      const key = crypto.randomUUID();
      const result = stockDialog.mode === "receive"
        ? await receiveStockAction(stockDialog.storeId, stockDialog.product.id, qty, stockDialog.note.trim() || null, key)
        : await adjustStockAction(stockDialog.storeId, stockDialog.product.id, qty, stockDialog.note.trim(), key);
      if (!result.ok) {
        toast.error(stockDialog.mode === "receive" ? "Couldn't receive the stock" : "Couldn't adjust the stock", {
          description: result.message,
        });
        return;
      }
      toast.success(
        stockDialog.mode === "receive"
          ? `Received ${qty} × ${stockDialog.product.name}.`
          : `Stock adjusted by ${qty > 0 ? `+${qty}` : qty} × ${stockDialog.product.name}.`,
        { description: `New balance at this store: ${result.data.balanceAfter}.` }
      );
      setStockDialog(null);
      await reload();
    } finally {
      setStockBusy(false);
    }
  };

  const toggleArchive = async (p: LiveProduct) => {
    const next = p.status === "active" ? "archived" : "active";
    if (next === "archived" && !window.confirm(`Archive ${p.name}? It can't be sold or restocked until unarchived.`)) return;
    setBusyProductId(p.id);
    try {
      const res = await updateProductAction({ productId: p.id, status: next });
      if (res.ok) {
        toast.success(next === "archived" ? `${p.sku} archived.` : `${p.sku} is active again.`);
        await reload();
      } else {
        toast.error("Couldn't update the product", { description: res.message });
      }
    } finally {
      setBusyProductId(null);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Package className="size-4.5" />
          </span>
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              Live catalogue &amp; stock
              <Badge variant="outline" className="gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> Supabase
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">
              RPC-only writes, append-only movement history{role === "staff" ? " · read-only for staff" : " · products are archived, never deleted"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              className="h-8 w-44 pl-8 text-xs"
              placeholder="Search live catalogue"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search live products"
            />
          </div>
          {isManager && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <PackagePlus /> Add product
            </Button>
          )}
        </div>
      </div>

      {results.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">
          {products.length === 0
            ? "No live products yet — add your first one and it becomes available in the live POS."
            : "No products match this search."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="hidden sm:table-cell">Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              {stores.map((s) => (
                <TableHead key={s.id} className="text-right">{s.name}</TableHead>
              ))}
              <TableHead>Status</TableHead>
              {isManager && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((p) => (
              <TableRow key={p.id} className={p.status === "archived" ? "opacity-60" : undefined}>
                <TableCell>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{p.sku} · per {p.unit}</p>
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                  {p.category ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <p className="text-sm font-medium">{formatINR(p.pricePaise / 100)}</p>
                  {p.mrpPaise != null && p.mrpPaise > p.pricePaise && (
                    <p className="text-[11px] text-muted-foreground line-through">{formatINR(p.mrpPaise / 100)}</p>
                  )}
                </TableCell>
                {stores.map((s) => {
                  const inv = p.stock.get(s.id);
                  if (!inv) {
                    return (
                      <TableCell key={s.id} className="text-right text-xs text-muted-foreground">
                        {role === "staff" ? "—" : "no stock row"}
                      </TableCell>
                    );
                  }
                  const low = inv.reorderLevel > 0 && inv.onHand <= inv.reorderLevel;
                  return (
                    <TableCell key={s.id} className="text-right">
                      <span className={`inline-flex items-center gap-1 text-sm font-medium ${low ? "text-amber-600 dark:text-amber-400" : ""}`}>
                        {low && <TriangleAlert className="size-3.5" aria-hidden />}
                        {inv.onHand}
                      </span>
                      {low && <span className="block text-[10px] text-muted-foreground">reorder ≤ {inv.reorderLevel}</span>}
                    </TableCell>
                  );
                })}
                <TableCell>
                  <Badge variant={p.status === "active" ? "secondary" : "outline"}>{p.status}</Badge>
                </TableCell>
                {isManager && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost" size="sm" className="h-7 px-2 text-[11px]"
                        disabled={p.status !== "active"}
                        onClick={() => setStockDialog({ product: p, mode: "receive", storeId: stores[0]?.id ?? "", qty: "", note: "" })}
                      >
                        <PackagePlus className="mr-1 size-3" /> Receive
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-7 px-2 text-[11px]"
                        disabled={p.status !== "active"}
                        onClick={() => setStockDialog({ product: p, mode: "adjust", storeId: stores[0]?.id ?? "", qty: "", note: "" })}
                      >
                        <Minus className="mr-1 size-3" /> Adjust
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-7 px-2 text-[11px]"
                        disabled={busyProductId === p.id}
                        onClick={() => toggleArchive(p)}
                        title={p.status === "active" ? "Archive" : "Unarchive"}
                      >
                        {p.status === "active" ? <Archive className="size-3.5" /> : <ArchiveRestore className="size-3.5" />}
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {isManager && (
        <div className="border-t px-5 py-2.5">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="size-3.5 rounded border-input"
            />
            Show archived products
          </label>
        </div>
      )}

      {/* Add product dialog */}
      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add a catalogue product"
        description="The SKU is normalized and unique per business. Opening stock is posted as immutable 'initial' movements — the history can never be rewritten."
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={submitCreate}
              loading={createBusy}
              disabled={createForm.name.trim().length < 2 || createForm.sku.trim().length < 3 || !Number.isFinite(Number.parseFloat(createForm.price))}
            >
              Create product
            </Button>
          </>
        }
      >
        <div className="space-y-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Name</Label>
              <Input id="inv-name" value={createForm.name} placeholder="e.g. Philips 9W LED Bulb"
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-sku">SKU</Label>
              <Input id="inv-sku" value={createForm.sku} placeholder="e.g. AMB-LGT-009"
                onChange={(e) => setCreateForm({ ...createForm, sku: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-price">Selling price (₹)</Label>
              <Input id="inv-price" type="number" min={0} step={0.01} value={createForm.price} placeholder="120.00"
                onChange={(e) => setCreateForm({ ...createForm, price: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-mrp">MRP (₹, optional)</Label>
              <Input id="inv-mrp" type="number" min={0} step={0.01} value={createForm.mrp} placeholder="165.00"
                onChange={(e) => setCreateForm({ ...createForm, mrp: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-category">Category (optional)</Label>
            <Input id="inv-category" value={createForm.category} placeholder="e.g. Lighting"
              onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Opening stock (optional)</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {stores.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <span className="flex-1 truncate text-xs text-muted-foreground">{s.name}</span>
                  <Input
                    type="number" min={0} step={1} className="h-8 w-20 text-right" placeholder="0"
                    aria-label={`Opening stock at ${s.name}`}
                    value={openingStock[s.id] ?? ""}
                    onChange={(e) => setOpeningStock({ ...openingStock, [s.id]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </FormDialog>

      {/* Receive / adjust dialog */}
      <FormDialog
        open={stockDialog !== null}
        onOpenChange={(o) => { if (!o) setStockDialog(null); }}
        title={stockDialog?.mode === "receive" ? `Receive stock — ${stockDialog?.product.name ?? ""}` : `Adjust stock — ${stockDialog?.product.name ?? ""}`}
        description={
          stockDialog?.mode === "receive"
            ? "A 'receipt' movement is appended to the immutable history and the store balance increases."
            : "Adjustments need a reason (stock take, damage, shrinkage). The signed change is appended to the immutable history — balances can never go negative."
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setStockDialog(null)}>Cancel</Button>
            <Button
              onClick={submitStock}
              loading={stockBusy}
              disabled={
                !stockDialog ||
                !stockDialog.storeId ||
                !Number.isFinite(Number.parseInt(stockDialog.qty, 10)) ||
                Number.parseInt(stockDialog.qty, 10) === 0 ||
                (stockDialog.mode === "receive" && Number.parseInt(stockDialog.qty, 10) < 0) ||
                (stockDialog.mode === "adjust" && stockDialog.note.trim().length < 3)
              }
            >
              {stockDialog?.mode === "receive" ? "Receive stock" : "Post adjustment"}
            </Button>
          </>
        }
      >
        {stockDialog && (
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Store</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={stockDialog.storeId}
                  aria-label="Stock store"
                  onChange={(e) => setStockDialog({ ...stockDialog, storeId: e.target.value })}
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-qty">{stockDialog.mode === "receive" ? "Quantity received" : "Change (+/−)"}</Label>
                <Input
                  id="inv-qty" type="number" step={1}
                  min={stockDialog.mode === "receive" ? 1 : undefined}
                  value={stockDialog.qty}
                  onChange={(e) => setStockDialog({ ...stockDialog, qty: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-note">
                {stockDialog.mode === "receive" ? "Note (optional)" : "Reason (required — kept in the movement history)"}
              </Label>
              <Input
                id="inv-note"
                value={stockDialog.note}
                placeholder={stockDialog.mode === "receive" ? "e.g. Supplier delivery #42" : "e.g. Stock take — 2 damaged units"}
                onChange={(e) => setStockDialog({ ...stockDialog, note: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Current balance at this store:{" "}
              <strong className="text-foreground">
                {stockDialog.product.stock.get(stockDialog.storeId)?.onHand ?? 0}
              </strong>{" "}
              × {stockDialog.product.name}
            </p>
          </div>
        )}
      </FormDialog>
    </Card>
  );
}
