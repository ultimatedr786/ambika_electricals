"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Barcode, Camera, ChevronDown, Layers, Sparkles, Tag, Wallet, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { BarcodeScannerDialog } from "@/components/business/barcode-scanner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const units = ["piece", "box", "meter", "kg", "litre", "dozen", "pair", "roll", "set"];

const schema = z.object({
  name: z.string().min(2, "Enter a product name"),
  sku: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/, "3–32 letters/digits/._- , starting alphanumeric"),
  category: z.string().optional(),
  unit: z.string().min(1),
  barcode: z.string().optional(),
  openingStock: z.string().optional(),
  price: z.string().min(1, "Enter a selling price"),
  mrp: z.string().optional(),
});
type Values = z.infer<typeof schema>;

/** A valid-checksum EAN-13, so a "generated" barcode always scans back cleanly. */
function generateEan13(): string {
  let digits = "890"; // India's GS1 prefix
  for (let i = 0; i < 9; i++) digits += Math.floor(Math.random() * 10);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return digits + check;
}

function nextSkuSuggestion(count: number) {
  return `PRD-${String(count + 1).padStart(4, "0")}`;
}

export function AddProductDrawer({
  open,
  onOpenChange,
  businessId,
  storeId,
  productCount,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  businessId: string;
  storeId: string | null;
  productCount: number;
  onCreated: () => void | Promise<void>;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [saving, setSaving] = React.useState(false);
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [openSections, setOpenSections] = React.useState<string[]>(["stock", "pricing"]);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", sku: "", category: "", unit: "piece", barcode: "", openingStock: "", price: "", mrp: "" },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({ name: "", sku: nextSkuSuggestion(productCount), category: "", unit: "piece", barcode: "", openingStock: "", price: "", mrp: "" });
      setOpenSections(["stock", "pricing"]);
    }
  }, [open, productCount, form]);

  const submit = form.handleSubmit(async (values) => {
    if (!supabase) return;
    setSaving(true);
    try {
      const openingStock =
        storeId && values.openingStock && Number(values.openingStock) > 0
          ? [{ store_id: storeId, qty: Math.round(Number(values.openingStock)) }]
          : [];
      const { data, error } = await supabase.rpc("create_product", {
        p_business_id: businessId,
        p_name: values.name.trim(),
        p_sku: values.sku.trim(),
        p_price_paise: Math.round(Number(values.price) * 100),
        p_category: values.category?.trim() || null,
        p_subcategory: null,
        p_mrp_paise: values.mrp ? Math.round(Number(values.mrp) * 100) : null,
        p_unit: values.unit,
        p_art_key: null,
        p_opening_stock: openingStock,
        p_barcode: values.barcode?.trim() || null,
      });
      if (error) throw error;
      onOpenChange(false);
      await onCreated();
      toast.success(`${values.name} added`, { description: `SKU ${data.sku}${data.barcode ? ` · Barcode ${data.barcode}` : ""}` });
    } catch (err) {
      toast.error("Couldn't add the product", { description: err instanceof Error ? err.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" hideClose className="flex w-full flex-col p-0 sm:max-w-lg">
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between gap-3 border-b p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Tag className="size-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Add Product</h2>
                  <p className="text-sm text-muted-foreground">Manage product details, pricing and inventory.</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product Code</span>
                  <span className="rounded-md border bg-muted/50 px-2 py-1 font-mono text-xs font-semibold">{form.watch("sku") || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked disabled aria-label="Active" />
                  <span className="text-xs font-medium text-primary">Active</span>
                </div>
              </div>
              <button type="button" onClick={() => onOpenChange(false)} className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>

            <div className="scroll-region min-h-0 flex-1 space-y-5 p-5">
              {/* Basic information */}
              <section className="space-y-4">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary"><Tag className="size-3.5" /></span>
                  Basic Information
                </h3>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="pname">Product Name <span className="text-destructive">*</span></Label>
                    <Input id="pname" placeholder="Philips 9W LED Bulb" {...form.register("name")} aria-invalid={!!form.formState.errors.name} />
                    {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pcategory">Category</Label>
                    <Input id="pcategory" placeholder="Lighting" {...form.register("category")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Unit</Label>
                    <Select value={form.watch("unit")} onValueChange={(v) => form.setValue("unit", v)}>
                      <SelectTrigger aria-label="Unit"><SelectValue /></SelectTrigger>
                      <SelectContent>{units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="psku">SKU <span className="text-destructive">*</span></Label>
                    <Input id="psku" placeholder="PRD-0001" {...form.register("sku")} aria-invalid={!!form.formState.errors.sku} />
                    {form.formState.errors.sku && <p className="text-xs text-destructive">{form.formState.errors.sku.message}</p>}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pbarcode">Barcode</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input id="pbarcode" placeholder="Scan, type, or generate" className="pr-10" {...form.register("barcode")} />
                      <button
                        type="button"
                        onClick={() => setScannerOpen(true)}
                        className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Scan barcode with camera"
                      >
                        <Camera className="size-4" />
                      </button>
                    </div>
                    <Button type="button" variant="outline" onClick={() => form.setValue("barcode", generateEan13())}>
                      <Sparkles className="size-3.5" /> Generate
                    </Button>
                  </div>
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Barcode className="size-3" aria-hidden /> Scan with your camera, type it in, or generate a real EAN-13 code.
                  </p>
                </div>
              </section>

              <Separator />

              {/* Collapsible sections */}
              <AccordionPrimitive.Root type="multiple" value={openSections} onValueChange={setOpenSections} className="space-y-4">
                <AccordionPrimitive.Item value="stock" className="overflow-hidden rounded-xl border">
                  <AccordionPrimitive.Header>
                    <AccordionPrimitive.Trigger className="flex w-full items-center justify-between gap-2 bg-muted/40 px-4 py-3 text-left">
                      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <span className="flex size-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><Layers className="size-3.5" /></span>
                        Stock &amp; Inventory
                      </span>
                      <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", openSections.includes("stock") && "rotate-180")} />
                    </AccordionPrimitive.Trigger>
                  </AccordionPrimitive.Header>
                  <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <div className="p-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="pstock">Opening Stock</Label>
                        <Input id="pstock" inputMode="numeric" placeholder="0" {...form.register("openingStock")} disabled={!storeId} />
                        <p className="text-[11px] text-muted-foreground">
                          {storeId ? "Added to your current store on creation." : "Select a store to record opening stock."}
                        </p>
                      </div>
                    </div>
                  </AccordionPrimitive.Content>
                </AccordionPrimitive.Item>

                <AccordionPrimitive.Item value="pricing" className="overflow-hidden rounded-xl border">
                  <AccordionPrimitive.Header>
                    <AccordionPrimitive.Trigger className="flex w-full items-center justify-between gap-2 bg-muted/40 px-4 py-3 text-left">
                      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <span className="flex size-6 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400"><Wallet className="size-3.5" /></span>
                        Pricing
                      </span>
                      <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", openSections.includes("pricing") && "rotate-180")} />
                    </AccordionPrimitive.Trigger>
                  </AccordionPrimitive.Header>
                  <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <div className="grid gap-4 p-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="pprice">Selling Price (₹) <span className="text-destructive">*</span></Label>
                        <Input id="pprice" inputMode="decimal" placeholder="0.00" {...form.register("price")} aria-invalid={!!form.formState.errors.price} />
                        {form.formState.errors.price && <p className="text-xs text-destructive">{form.formState.errors.price.message}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pmrp">MRP (₹)</Label>
                        <Input id="pmrp" inputMode="decimal" placeholder="0.00" {...form.register("mrp")} />
                      </div>
                    </div>
                  </AccordionPrimitive.Content>
                </AccordionPrimitive.Item>
              </AccordionPrimitive.Root>
            </div>

            <div className="safe-bottom flex shrink-0 justify-end gap-2 border-t bg-background p-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" loading={saving}>Save Product</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={(code) => {
          form.setValue("barcode", code);
          toast.success("Barcode captured");
        }}
      />
    </>
  );
}
