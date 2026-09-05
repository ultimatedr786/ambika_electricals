"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowUpRight, Filter, Plus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { TierBadge } from "@/components/shared/tier-badge";
import { StatCard } from "@/components/shared/stat-card";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { formatDate, formatINR, formatNumber, initials } from "@/lib/utils";
import type { Customer, Tier } from "@/types";

const tiers: Tier[] = ["Bronze", "Silver", "Gold", "Platinum"];

const schema = z.object({
  name: z.string().min(3, "Enter the customer's full name"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  email: z.string().email("Enter a valid email"),
  birthday: z.string().optional(),
});
type Values = z.infer<typeof schema>;

type SortKey = "recent" | "points" | "spend" | "name";

export default function CustomersPage() {
  const { state } = useStore();
  const { customerService } = useServices();
  const [query, setQuery] = React.useState("");
  const [tier, setTier] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [store, setStore] = React.useState("all");
  const [sort, setSort] = React.useState<SortKey>("recent");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const activeFilters = [tier, status, store].filter((v) => v !== "all").length;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", email: "", birthday: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    const c = await customerService.createCustomer(values);
    setOpen(false);
    form.reset();
    toast.success(`${c.name} enrolled`, { description: `Membership ID ${c.membershipId} · 100 welcome points added.` });
  });

  const results = React.useMemo(() => {
    const t = query.trim().toLowerCase();
    const list = state.customers
      .filter((c) => tier === "all" || c.tier === tier)
      .filter((c) => status === "all" || c.status === status)
      .filter((c) => store === "all" || c.store === store)
      .filter(
        (c) =>
          !t ||
          c.name.toLowerCase().includes(t) ||
          c.membershipId.toLowerCase().includes(t) ||
          c.phone.replace(/\s/g, "").includes(t.replace(/\s/g, ""))
      );
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "points") return b.points - a.points;
      if (sort === "spend") return b.lifetimeSpend - a.lifetimeSpend;
      if (sort === "name") return a.name.localeCompare(b.name);
      return new Date(b.lastPurchase).getTime() - new Date(a.lastPurchase).getTime();
    });
    return sorted;
  }, [state.customers, query, tier, status, store, sort]);

  const totals = React.useMemo(() => {
    const c = state.customers;
    return {
      total: c.length,
      active: c.filter((x) => x.status === "Active").length,
      points: c.reduce((s, x) => s + x.points, 0),
      spend: c.reduce((s, x) => s + x.lifetimeSpend, 0),
    };
  }, [state.customers]);

  const filterControls = (
    <div className="flex flex-wrap gap-2.5">
      <Select value={tier} onValueChange={setTier}>
        <SelectTrigger className="w-[140px]" aria-label="Tier"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All tiers</SelectItem>
          {tiers.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={store} onValueChange={setStore}>
        <SelectTrigger className="w-[160px]" aria-label="Store"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All stores</SelectItem>
          {state.stores.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
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
      <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
        <SelectTrigger className="w-[170px]" aria-label="Sort by"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="recent">Recent purchase</SelectItem>
          <SelectItem value="points">Highest points</SelectItem>
          <SelectItem value="spend">Highest spend</SelectItem>
          <SelectItem value="name">Name (A–Z)</SelectItem>
        </SelectContent>
      </Select>
      {activeFilters > 0 && (
        <Button variant="ghost" onClick={() => { setTier("all"); setStatus("all"); setStore("all"); }}><X /> Clear all</Button>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        description="Every member enrolled in the Ambika Electricals rewards programme."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus /> Add Customer</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Enrol a new member</DialogTitle>
                <DialogDescription>New members start at Bronze with 100 welcome points.</DialogDescription>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="cname">Full name</Label>
                  <Input id="cname" placeholder="Rakesh Patel" {...form.register("name")} aria-invalid={!!form.formState.errors.name} />
                  {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="cphone">Mobile number</Label>
                    <Input id="cphone" inputMode="numeric" placeholder="9825041200" {...form.register("phone")} aria-invalid={!!form.formState.errors.phone} />
                    {form.formState.errors.phone && <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cbday">Birthday (optional)</Label>
                    <Input id="cbday" type="date" {...form.register("birthday")} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cemail">Email</Label>
                  <Input id="cemail" type="email" placeholder="rakesh@example.com" {...form.register("email")} aria-invalid={!!form.formState.errors.email} />
                  {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" loading={form.formState.isSubmitting}>Enrol member</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total members" value={formatNumber(totals.total)} icon={Users} />
        <StatCard label="Active members" value={formatNumber(totals.active)} />
        <StatCard label="Points outstanding" value={formatNumber(totals.points)} />
        <StatCard label="Lifetime spend" value={formatINR(totals.spend)} />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, phone or membership ID" className="min-w-[220px] flex-1" />
        <div className="hidden xl:block">{filterControls}</div>
        <Button variant="outline" className="xl:hidden" onClick={() => setFiltersOpen(true)}>
          <Filter /> Filters{activeFilters > 0 && <Badge className="ml-1">{activeFilters}</Badge>}
        </Button>
      </div>

      {results.length === 0 ? (
        <EmptyState icon={Users} title="No customers found." description="Try a different search or clear your filters." />
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="text-right">Lifetime spend</TableHead>
                  <TableHead className="text-right">Purchases</TableHead>
                  <TableHead>Last purchase</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/business/customers/${c.id}`} className="flex items-center gap-3">
                        <Avatar className="size-9"><AvatarFallback>{initials(c.name)}</AvatarFallback></Avatar>
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs tabular text-muted-foreground">{c.membershipId} · {c.phone}</p>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell><TierBadge tier={c.tier} /></TableCell>
                    <TableCell className="text-right font-medium tabular">{formatNumber(c.points)}</TableCell>
                    <TableCell className="text-right tabular">{formatINR(c.lifetimeSpend)}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{c.purchases}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(c.lastPurchase)}</TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="icon-sm" aria-label={`Open ${c.name}`}>
                        <Link href={`/business/customers/${c.id}`}><ArrowUpRight /></Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="space-y-2.5 md:hidden">
            {results.map((c) => <MobileRow key={c.id} customer={c} />)}
          </div>
        </>
      )}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom">
          <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
          <div className="px-5 pb-8">
            <div className="[&_button]:w-full [&>div]:flex-col">{filterControls}</div>
            <Button className="mt-4 w-full" onClick={() => setFiltersOpen(false)}>Show {results.length} customers</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MobileRow({ customer: c }: { customer: Customer }) {
  return (
    <Link href={`/business/customers/${c.id}`} className="block">
      <Card className="flex items-center gap-3 p-3.5">
        <Avatar className="size-11"><AvatarFallback>{initials(c.name)}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{c.name}</p>
            <TierBadge tier={c.tier} />
          </div>
          <p className="text-xs tabular text-muted-foreground">{c.membershipId} · {c.phone}</p>
          <div className="mt-1.5 flex items-center gap-3 text-xs tabular">
            <span className="font-medium">{formatNumber(c.points)} pts</span>
            <span className="text-muted-foreground">{formatINR(c.lifetimeSpend)} lifetime</span>
          </div>
        </div>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Card>
    </Link>
  );
}
