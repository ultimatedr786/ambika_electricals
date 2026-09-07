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
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FormDialog } from "@/components/shared/form-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { TierBadge } from "@/components/shared/tier-badge";
import { StatCard } from "@/components/shared/stat-card";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { formatDate, formatINR, formatNumber, initials } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { createClient } from "@/lib/supabase/client";
import { tierProgress } from "@/lib/points";
import type { Customer, Tier } from "@/types";

const tiers: Tier[] = ["Bronze", "Silver", "Gold", "Platinum"];

const schema = z.object({
  name: z.string().min(3, "Enter the customer's full name"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  email: z.string().email("Enter a valid email"),
  birthday: z.string().optional(),
});
type Values = z.infer<typeof schema>;

const liveSchema = z.object({
  name: z.string().min(2, "Enter the customer's full name"),
  phone: z
    .string()
    .optional()
    .refine((v) => !v || /^[6-9]\d{9}$/.test(v), "Enter a valid 10-digit mobile number"),
  referralCode: z.string().optional(),
});
type LiveValues = z.infer<typeof liveSchema>;

type SortKey = "recent" | "points" | "spend" | "name";

const MEMBERSHIP_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  pending: "Pending",
  blocked: "Disabled",
  closed: "Inactive",
};

interface LiveCustomerRow {
  id: string;
  name: string;
  phone: string;
  membershipId: string;
  status: string;
  points: number;
  lifetimePoints: number;
  lifetimeSpendPaise: number;
  purchases: number;
  lastPurchase: string | null;
  storeName: string;
}

function useLiveCustomers() {
  const configured = isSupabaseConfigured();
  const supabase = React.useMemo(() => createClient(), []);
  const [rows, setRows] = React.useState<LiveCustomerRow[]>([]);
  const [stores, setStores] = React.useState<{ id: string; name: string }[]>([]);
  const [businessId, setBusinessId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(configured);

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
        .select("business_id")
        .eq("profile_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      const bid = (me as { business_id: string } | null)?.business_id ?? null;
      if (!bid) return;
      setBusinessId(bid);

      const [memRes, storesRes, balRes, salesRes] = await Promise.all([
        supabase
          .from("customer_memberships")
          .select("id, membership_no, display_name, phone_masked, status, enrolled_store_id, enrolled_at")
          .eq("business_id", bid)
          .order("enrolled_at", { ascending: false })
          .limit(1000),
        supabase.from("stores").select("id, name").eq("business_id", bid),
        supabase
          .from("customer_points_balance")
          .select("customer_membership_id, current_points, lifetime_earned")
          .eq("business_id", bid),
        supabase
          .from("sales")
          .select("customer_membership_id, total_paise, sold_at")
          .eq("business_id", bid)
          .eq("status", "completed")
          .not("customer_membership_id", "is", null)
          .limit(5000),
      ]);

      const storeRows = (storesRes.data ?? []) as { id: string; name: string }[];
      setStores(storeRows);
      const storeNames = new Map(storeRows.map((s) => [s.id, s.name]));

      const balances = new Map(
        ((balRes.data ?? []) as { customer_membership_id: string; current_points: number; lifetime_earned: number }[]).map((b) => [
          b.customer_membership_id,
          { current: Number(b.current_points), lifetime: Number(b.lifetime_earned) },
        ])
      );

      const salesByMember = new Map<string, { spendPaise: number; purchases: number; last: string | null }>();
      for (const s of (salesRes.data ?? []) as { customer_membership_id: string; total_paise: number; sold_at: string }[]) {
        const agg = salesByMember.get(s.customer_membership_id) ?? { spendPaise: 0, purchases: 0, last: null };
        agg.spendPaise += Number(s.total_paise);
        agg.purchases += 1;
        if (!agg.last || s.sold_at > agg.last) agg.last = s.sold_at;
        salesByMember.set(s.customer_membership_id, agg);
      }

      setRows(
        ((memRes.data ?? []) as {
          id: string; membership_no: string; display_name: string | null; phone_masked: string | null;
          status: string; enrolled_store_id: string | null; enrolled_at: string;
        }[]).map((m) => {
          const agg = salesByMember.get(m.id);
          return {
            id: m.id,
            name: m.display_name ?? "Member",
            phone: m.phone_masked ?? "",
            membershipId: m.membership_no,
            status: MEMBERSHIP_STATUS_LABEL[m.status] ?? m.status,
            points: balances.get(m.id)?.current ?? 0,
            lifetimePoints: balances.get(m.id)?.lifetime ?? 0,
            lifetimeSpendPaise: agg?.spendPaise ?? 0,
            purchases: agg?.purchases ?? 0,
            lastPurchase: agg?.last ?? null,
            storeName: m.enrolled_store_id ? storeNames.get(m.enrolled_store_id) ?? "—" : "—",
          };
        })
      );
    } finally {
      setLoading(false);
    }
  }, [configured, supabase]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const enroll = React.useCallback(
    async (values: LiveValues) => {
      if (!businessId || !supabase) return;
      const phone = (values.phone ?? "").replace(/\D/g, "");
      const { data, error } = await supabase
        .from("customer_memberships")
        .insert({
          business_id: businessId,
          display_name: values.name.trim(),
          phone_masked: phone.length >= 4 ? `XXXXX${phone.slice(-4)}` : null,
          enrollment_data: { source: "customers-page" },
        })
        .select("id, membership_no")
        .maybeSingle();
      if (error) throw error;
      const row = data as { id: string; membership_no: string } | null;
      const code = values.referralCode?.trim();
      let referralWarning: string | null = null;
      if (row && code) {
        const { error: refError } = await supabase.rpc("record_referral", {
          p_business_id: businessId,
          p_referred_membership_id: row.id,
          p_referral_code: code,
        });
        if (refError) referralWarning = "Member enrolled, but that referral code wasn't valid.";
      }
      await reload();
      return { membershipNo: row?.membership_no ?? null, referralWarning };
    },
    [businessId, supabase, reload]
  );

  return { configured, rows, stores, loading, enroll };
}

export default function CustomersPage() {
  const { state } = useStore();
  const { customerService } = useServices();
  const live = useLiveCustomers();
  const configured = live.configured;
  const [query, setQuery] = React.useState("");
  const [tier, setTier] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [store, setStore] = React.useState("all");
  const [sort, setSort] = React.useState<SortKey>("recent");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const activeFilters = [tier, status, store].filter((v) => v && v !== "all").length;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", email: "", birthday: "" },
  });
  const liveForm = useForm<LiveValues>({
    resolver: zodResolver(liveSchema),
    defaultValues: { name: "", phone: "" },
  });

  const submit = configured
    ? liveForm.handleSubmit(async (values) => {
        try {
          const result = await live.enroll(values);
          setOpen(false);
          liveForm.reset();
          if (result?.referralWarning) {
            toast.warning(`${values.name} enrolled`, { description: result.referralWarning });
          } else {
            toast.success(`${values.name} enrolled`, {
              description: result?.membershipNo ? `Membership ID ${result.membershipNo}.` : "Membership created.",
            });
          }
        } catch (err) {
          toast.error("Couldn't enrol this member", {
            description: err instanceof Error ? err.message : "Please try again.",
          });
        }
      })
    : form.handleSubmit(async (values) => {
        const c = await customerService.createCustomer(values);
        setOpen(false);
        form.reset();
        toast.success(`${c.name} enrolled`, { description: `Membership ID ${c.membershipId} · 100 welcome points added.` });
      });

  const results = React.useMemo(() => {
    const t = query.trim().toLowerCase();
    if (configured) {
      const list = live.rows
        .filter((c) => tier === "all" || tierProgress(c.lifetimePoints).current.name === tier)
        .filter((c) => status === "all" || c.status === status)
        .filter((c) => store === "all" || c.storeName === store)
        .filter((c) => !t || c.name.toLowerCase().includes(t) || c.membershipId.toLowerCase().includes(t) || c.phone.toLowerCase().includes(t));
      const sorted = [...list];
      sorted.sort((a, b) => {
        if (sort === "points") return b.points - a.points;
        if (sort === "spend") return b.lifetimeSpendPaise - a.lifetimeSpendPaise;
        if (sort === "name") return a.name.localeCompare(b.name);
        return (b.lastPurchase ?? "").localeCompare(a.lastPurchase ?? "");
      });
      return sorted;
    }
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
  }, [configured, live.rows, state.customers, query, tier, status, store, sort]);

  const totals = React.useMemo(() => {
    if (configured) {
      return {
        total: live.rows.length,
        active: live.rows.filter((x) => x.status === "Active").length,
        points: live.rows.reduce((s, x) => s + x.points, 0),
        spend: live.rows.reduce((s, x) => s + x.lifetimeSpendPaise, 0) / 100,
      };
    }
    const c = state.customers;
    return {
      total: c.length,
      active: c.filter((x) => x.status === "Active").length,
      points: c.reduce((s, x) => s + x.points, 0),
      spend: c.reduce((s, x) => s + x.lifetimeSpend, 0),
    };
  }, [configured, live.rows, state.customers]);

  const storeOptions = configured ? live.stores.map((s) => s.name) : state.stores.map((s) => s.name);

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
          {storeOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-[130px]" aria-label="Status"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any status</SelectItem>
          {configured ? (
            <>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Disabled">Disabled</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </>
          ) : (
            <>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </>
          )}
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
    <div className="space-y-4 flex-1 min-h-0 flex flex-col">
      <div className="space-y-4 shrink-0">
        <PageHeader
          title="Customers"
          description="Every member enrolled in the Ambika Electricals rewards programme."
          actions={
            <Button onClick={() => setOpen(true)}><Plus /> Add Customer</Button>
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
      </div>

      {configured ? (
        <FormDialog
          open={open}
          onOpenChange={setOpen}
          title="Enrol a new member"
          description="Add a walk-in member — they can link their own login later."
          onSubmit={submit}
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" loading={liveForm.formState.isSubmitting}>Enrol member</Button>
            </>
          }
        >
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="lcname">Full name</Label>
              <Input id="lcname" placeholder="Rakesh Patel" {...liveForm.register("name")} aria-invalid={!!liveForm.formState.errors.name} />
              {liveForm.formState.errors.name && <p className="text-xs text-destructive">{liveForm.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lcphone">Mobile number (optional)</Label>
              <Input id="lcphone" inputMode="numeric" placeholder="9825041200" {...liveForm.register("phone")} aria-invalid={!!liveForm.formState.errors.phone} />
              {liveForm.formState.errors.phone && <p className="text-xs text-destructive">{liveForm.formState.errors.phone.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lcref">Referral code (optional)</Label>
              <Input id="lcref" placeholder="AE-ABCD1234" {...liveForm.register("referralCode")} />
            </div>
          </div>
        </FormDialog>
      ) : (
        <FormDialog
          open={open}
          onOpenChange={setOpen}
          title="Enrol a new member"
          description="New members start at Bronze with 100 welcome points."
          onSubmit={submit}
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" loading={form.formState.isSubmitting}>Enrol member</Button>
            </>
          }
        >
                <div className="space-y-4 py-2">
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
                </div>
        </FormDialog>
      )}

      {live.loading && configured ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          Loading customers…
        </div>
      ) : results.length === 0 ? (
        <EmptyState icon={Users} title="No customers found." description="Try a different search or clear your filters." />
      ) : (
        <>
          <Card className="hidden overflow-hidden md:flex flex-1 min-h-0 flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto scroll-region">
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
                  {configured
                    ? (results as LiveCustomerRow[]).map((c) => (
                        <TableRow key={c.id} className="cursor-pointer">
                          <TableCell>
                            <Link href={`/business/customers/${c.id}`} className="flex items-center gap-3">
                              <Avatar className="size-9"><AvatarFallback>{initials(c.name)}</AvatarFallback></Avatar>
                              <div>
                                <p className="text-sm font-medium">{c.name}</p>
                                <p className="text-xs tabular text-muted-foreground">{c.membershipId}{c.phone && ` · ${c.phone}`}</p>
                              </div>
                            </Link>
                          </TableCell>
                          <TableCell><TierBadge tier={tierProgress(c.lifetimePoints).current.name} /></TableCell>
                          <TableCell className="text-right font-medium tabular">{formatNumber(c.points)}</TableCell>
                          <TableCell className="text-right tabular">{formatINR(c.lifetimeSpendPaise / 100)}</TableCell>
                          <TableCell className="text-right tabular text-muted-foreground">{c.purchases}</TableCell>
                          <TableCell className="text-muted-foreground">{c.lastPurchase ? formatDate(c.lastPurchase) : "—"}</TableCell>
                          <TableCell>
                            <Button asChild variant="ghost" size="icon-sm" aria-label={`Open ${c.name}`}>
                              <Link href={`/business/customers/${c.id}`}><ArrowUpRight /></Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    : (results as Customer[]).map((c) => (
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
            </div>
          </Card>

          <div className="space-y-2.5 md:hidden overflow-y-auto scroll-region flex-1 min-h-0">
            {configured
              ? (results as LiveCustomerRow[]).map((c) => <LiveMobileRow key={c.id} customer={c} />)
              : (results as Customer[]).map((c) => <MobileRow key={c.id} customer={c} />)}
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
            <Button className="w-full" onClick={() => setFiltersOpen(false)}>Show {results.length} customers</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MobileRow({ customer: c }: { customer: Customer }) {
  return (
    <Link href={`/business/customers/${c.id}`} className="group block">
      <Card className="relative flex items-center gap-3 overflow-hidden border-white/5 bg-gradient-to-br from-slate-900 via-slate-950 to-black p-3.5 text-white shadow-md transition-shadow duration-300 group-hover:shadow-lg group-hover:shadow-amber-500/10">
        <div
          className="pointer-events-none absolute -bottom-10 -left-10 size-36 rounded-full bg-amber-400/0 blur-2xl transition-colors duration-500 group-hover:bg-amber-400/25"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
          aria-hidden
        />
        <Avatar className="relative size-11"><AvatarFallback className="bg-white/10 text-white">{initials(c.name)}</AvatarFallback></Avatar>
        <div className="relative min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{c.name}</p>
            <TierBadge tier={c.tier} />
          </div>
          <p className="text-xs tabular text-white/60">{c.membershipId} · {c.phone}</p>
          <div className="mt-1.5 flex items-center gap-3 text-xs tabular">
            <span className="font-medium">{formatNumber(c.points)} pts</span>
            <span className="text-white/60">{formatINR(c.lifetimeSpend)} lifetime</span>
          </div>
        </div>
        <ArrowUpRight className="relative size-4 shrink-0 text-white/50" aria-hidden />
      </Card>
    </Link>
  );
}

function LiveMobileRow({ customer: c }: { customer: LiveCustomerRow }) {
  return (
    <Link href={`/business/customers/${c.id}`} className="group block">
      <Card className="relative flex items-center gap-3 overflow-hidden border-white/5 bg-gradient-to-br from-slate-900 via-slate-950 to-black p-3.5 text-white shadow-md transition-shadow duration-300 group-hover:shadow-lg group-hover:shadow-amber-500/10">
        <div
          className="pointer-events-none absolute -bottom-10 -left-10 size-36 rounded-full bg-amber-400/0 blur-2xl transition-colors duration-500 group-hover:bg-amber-400/25"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
          aria-hidden
        />
        <Avatar className="relative size-11"><AvatarFallback className="bg-white/10 text-white">{initials(c.name)}</AvatarFallback></Avatar>
        <div className="relative min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{c.name}</p>
            <TierBadge tier={tierProgress(c.lifetimePoints).current.name} />
          </div>
          <p className="text-xs tabular text-white/60">{c.membershipId}{c.phone && ` · ${c.phone}`}</p>
          <div className="mt-1.5 flex items-center gap-3 text-xs tabular">
            <span className="font-medium">{formatNumber(c.points)} pts</span>
            <span className="text-white/60">{formatINR(c.lifetimeSpendPaise / 100)} lifetime</span>
          </div>
        </div>
        <ArrowUpRight className="relative size-4 shrink-0 text-white/50" aria-hidden />
      </Card>
    </Link>
  );
}
