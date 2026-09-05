"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Filter, LayoutGrid, List, Package, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FormDialog } from "@/components/shared/form-dialog";
import { ProductImagePicker } from "@/components/shared/product-image-picker";
import { SearchInput } from "@/components/shared/search-input";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProductArt } from "@/components/shared/product-art";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { LiveInventoryPanel } from "@/components/business/live-inventory-panel";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { brands, productCategories } from "@/lib/mock-data/products";
import { cn, formatINR, formatNumber } from "@/lib/utils";
import type { ProductCategory } from "@/types";

const schema = z.object({
  name: z.string().min(3, "Enter the product name"),
  brand: z.string().min(1, "Select a brand"),
  sku: z.string().min(3, "Enter a SKU").regex(/^[A-Z0-9-]+$/i, "Use letters, numbers and dashes"),
  category: z.string().min(1, "Select a category"),
  subcategory: z.string().min(2, "Enter a subcategory"),
  price: z.coerce.number().positive("Enter a price above ₹0"),
  mrp: z.coerce.number().min(0).optional(),
  unit: z.string().min(1, "Select a unit"),
  stock: z.coerce.number().min(0, "Stock can't be negative"),
  points: z.coerce.number().min(0, "Points can't be negative"),
  image: z.string().min(1),
  status: z.string().min(1),
  description: z.string().optional(),
});
type Values = z.output<typeof schema>;
type FormValues = z.input<typeof schema>;

export default function ProductsPage() {
  const { state } = useStore();
  const { productService } = useServices();
  const [view, setView] = React.useState<"grid" | "table">("table");
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [brand, setBrand] = React.useState("all");
  const [stock, setStock] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [open, setOpen] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const activeFilters = [category, brand, stock, status].filter((v) => v !== "all").length;

  const form = useForm<FormValues, unknown, Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", brand: "", sku: "", category: "", subcategory: "", price: 0, mrp: 0,
      unit: "piece", stock: 0, points: 0, image: "bulb", status: "Active", description: "",
    },
  });

  const price = Number(form.watch("price")) || 0;
  React.useEffect(() => {
    if (price > 0) form.setValue("points", Math.round(price / 10));
  }, [price, form]);

  const results = React.useMemo(() => {
    const t = query.trim().toLowerCase();
    return state.products
      .filter((p) => category === "all" || p.category === category)
      .filter((p) => brand === "all" || p.brand === brand)
      .filter((p) => status === "all" || p.status === status)
      .filter((p) => stock === "all" || (stock === "low" ? p.stock < 50 : stock === "out" ? p.stock === 0 : p.stock >= 50))
      .filter((p) => !t || `${p.name} ${p.brand} ${p.sku}`.toLowerCase().includes(t));
  }, [state.products, query, category, brand, stock, status]);

  const submit = form.handleSubmit(
    async (values) => {
      await productService.createProduct({
        name: values.name,
        brand: values.brand,
        sku: values.sku.toUpperCase(),
        subcategory: values.subcategory,
        category: values.category as ProductCategory,
        price: values.price,
        mrp: values.mrp || undefined,
        unit: values.unit,
        stock: values.stock,
        points: values.points,
        image: values.image,
        description: values.description || "",
        status: values.status as "Active" | "Inactive",
      });
      setOpen(false);
      form.reset();
      toast.success("Product added successfully.");
    },
    (errors) => {
      // Make sure the first invalid field is visible inside the scrolling body.
      const first = Object.keys(errors)[0];
      const el = document.querySelector<HTMLElement>(`[name="${first}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
    }
  );


  const filterControls = (
    <div className="flex flex-wrap gap-2.5">
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="w-[170px]" aria-label="Category"><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {productCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={brand} onValueChange={setBrand}>
        <SelectTrigger className="w-[150px]" aria-label="Brand"><SelectValue placeholder="Brand" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All brands</SelectItem>
          {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={stock} onValueChange={setStock}>
        <SelectTrigger className="w-[140px]" aria-label="Stock"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any stock</SelectItem>
          <SelectItem value="in">In stock (50+)</SelectItem>
          <SelectItem value="low">Low stock</SelectItem>
          <SelectItem value="out">Out of stock</SelectItem>
        </SelectContent>
      </Select>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-[130px]" aria-label="Status"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any status</SelectItem>
          <SelectItem value="Active">Active</SelectItem>
          <SelectItem value="Inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
      {activeFilters > 0 && (
        <Button variant="ghost" onClick={() => { setCategory("all"); setBrand("all"); setStock("all"); setStatus("all"); }}>
          <X /> Clear all
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Products"
        description={`${state.products.length} electrical products in your catalogue.`}
        actions={
          <>
            <div className="hidden rounded-lg border p-0.5 sm:flex">
              <Button variant={view === "table" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setView("table")} aria-label="Table view"><List /></Button>
              <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setView("grid")} aria-label="Grid view"><LayoutGrid /></Button>
            </div>
            <Button onClick={() => setOpen(true)}><Plus /> Add Product</Button>
          </>
        }
      />

      {/* Live Supabase catalogue & stock — renders only when auth is configured */}
      <LiveInventoryPanel />

      {isSupabaseConfigured() && (
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Prototype catalogue</h2>
          <span className="rounded-md border border-dashed px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Demo data — migrates in a later slice
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, brand or SKU" className="min-w-[220px] flex-1" />
        <div className="hidden lg:block">{filterControls}</div>
        <Button variant="outline" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
          <Filter /> Filters{activeFilters > 0 && <Badge className="ml-1">{activeFilters}</Badge>}
        </Button>
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Add your first electrical product."
          description="No products match your search or filters."
          action={<Button onClick={() => setOpen(true)}><Plus /> Add product</Button>}
        />
      ) : view === "table" ? (
        <>
          <Card className="hidden overflow-hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <ProductArt art={p.image} className="size-10 shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.brand}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.category}</TableCell>
                    <TableCell className="tabular text-muted-foreground">{p.sku}</TableCell>
                    <TableCell className="text-right font-medium tabular">{formatINR(p.price)}</TableCell>
                    <TableCell className={cn("text-right tabular", p.stock < 50 && "text-warning")}>{formatNumber(p.stock)}</TableCell>
                    <TableCell className="text-right tabular text-success">+{p.points}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <div className="space-y-2.5 sm:hidden">
            {results.map((p) => <MobileProduct key={p.id} product={p} />)}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {results.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.02 }}>
              <Card className="overflow-hidden">
                <ProductArt art={p.image} className="aspect-[4/3] w-full rounded-none" />
                <div className="p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.brand}</p>
                  <p className="line-clamp-2 text-[13px] font-medium leading-snug">{p.name}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-semibold tabular">{formatINR(p.price)}</span>
                    <span className="text-[11px] tabular text-success">+{p.points} pts</span>
                  </div>
                  <p className="mt-1 text-[11px] tabular text-muted-foreground">{formatNumber(p.stock)} in stock</p>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
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

      {/* Add product — one responsive dialog/sheet pattern:
          sticky header → scrollable fields → sticky actions. */}
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Add electrical product"
        description="Add a new item to the Ambika Electricals catalogue."
        size="lg"
        onSubmit={submit}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>Add product</Button>
          </>
        }
      >
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Product name" placeholder="Philips 9W LED Bulb" error={form.formState.errors.name?.message} {...form.register("name")} />
          </div>
          <SelectField
            label="Brand" value={form.watch("brand")} onChange={(v) => form.setValue("brand", v, { shouldValidate: true })}
            options={brands} placeholder="Select brand" error={form.formState.errors.brand?.message}
          />
          <Field label="SKU" placeholder="AMB-LGT-009" error={form.formState.errors.sku?.message} {...form.register("sku")} />
          <SelectField
            label="Category" value={form.watch("category")} onChange={(v) => form.setValue("category", v, { shouldValidate: true })}
            options={productCategories as unknown as string[]} placeholder="Select category" error={form.formState.errors.category?.message}
          />
          <Field label="Subcategory" placeholder="LED Bulbs" error={form.formState.errors.subcategory?.message} {...form.register("subcategory")} />
          <Field label="Price (₹)" inputMode="numeric" error={form.formState.errors.price?.message} {...form.register("price")} />
          <Field label="MRP (₹)" inputMode="numeric" error={form.formState.errors.mrp?.message} {...form.register("mrp")} />
          <SelectField
            label="Unit" value={form.watch("unit")} onChange={(v) => form.setValue("unit", v)}
            options={["piece", "coil", "metre", "pack", "set", "length"]}
          />
          <Field label="Stock" inputMode="numeric" error={form.formState.errors.stock?.message} {...form.register("stock")} />
          <Field label="Reward points" inputMode="numeric" error={form.formState.errors.points?.message} {...form.register("points")} />
          <SelectField label="Status" value={form.watch("status")} onChange={(v) => form.setValue("status", v)} options={["Active", "Inactive"]} />

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="product-visual">Product visual</Label>
            <ProductImagePicker
              id="product-visual"
              value={form.watch("image")}
              onChange={(v) => form.setValue("image", v, { shouldValidate: true })}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" placeholder="Short product description" {...form.register("description")} />
          </div>
        </div>
      </FormDialog>
    </div>
  );
}

function MobileProduct({ product: p }: { product: ReturnType<typeof useStore>["state"]["products"][number] }) {
  return (
    <Card className="flex gap-3 p-3">
      <ProductArt art={p.image} className="size-16 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.brand}</p>
            <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
          </div>
          <StatusBadge status={p.status} />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs tabular">
          <span className="font-semibold text-foreground">{formatINR(p.price)}</span>
          <span className="text-muted-foreground">{formatNumber(p.stock)} in stock</span>
          <span className="text-success">+{p.points} pts</span>
        </div>
      </div>
    </Card>
  );
}

const Field = React.forwardRef<HTMLInputElement, { label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>>(
  ({ label, error, ...props }, ref) => {
    const id = React.useId();
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} ref={ref} aria-invalid={!!error} {...props} />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }
);
Field.displayName = "Field";

function SelectField({
  label, value, onChange, options, placeholder, error,
}: { label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
