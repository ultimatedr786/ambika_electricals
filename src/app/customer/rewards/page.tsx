"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Filter, Gift, Info, ShoppingBag, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { CardGridSkeleton } from "@/components/shared/loading-skeleton";
import { RewardCard } from "@/components/customer/reward-card";
import { WaysToEarnSheet } from "@/components/customer/ways-to-earn";
import { useCurrentCustomer, useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { meetsTier, pointsToRupees } from "@/lib/points";
import { cn, formatNumber } from "@/lib/utils";

const categories = [
  "All", "Electrical Products", "Lighting", "Switches & Sockets", "Wires & Cables",
  "Fans", "Protection", "Accessories", "Discounts", "Coupons", "Special Offers",
] as const;

const sorts = [
  { value: "recommended", label: "Recommended" },
  { value: "low", label: "Lowest points" },
  { value: "high", label: "Highest points" },
  { value: "new", label: "Newest" },
  { value: "popular", label: "Popular" },
];

const productCats = ["Lighting", "Switches & Sockets", "Wires & Cables", "Fans", "Protection", "Accessories", "Distribution"];

export default function RewardsStorePage() {
  const customer = useCurrentCustomer();
  const { state, hydrated } = useStore();
  const { cartService } = useServices();

  const [category, setCategory] = React.useState<(typeof categories)[number]>("All");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState("recommended");
  const [maxPoints, setMaxPoints] = React.useState(10000);
  const [inStockOnly, setInStockOnly] = React.useState(false);
  const [eligibleOnly, setEligibleOnly] = React.useState(false);
  const [types, setTypes] = React.useState<string[]>([]);

  const activeFilterCount =
    (maxPoints < 10000 ? 1 : 0) + (inStockOnly ? 1 : 0) + (eligibleOnly ? 1 : 0) + types.length;

  const results = React.useMemo(() => {
    let list = state.rewards.filter((r) => r.status === "Active");

    if (category === "Electrical Products") list = list.filter((r) => productCats.includes(r.storeCategory as string));
    else if (category !== "All") list = list.filter((r) => r.storeCategory === category);

    const q = query.trim().toLowerCase();
    if (q) list = list.filter((r) => `${r.name} ${r.brand ?? ""} ${r.description}`.toLowerCase().includes(q));

    list = list.filter((r) => Math.min(...r.options.map((o) => o.points)) <= maxPoints);
    if (inStockOnly) list = list.filter((r) => r.stockStatus !== "Out of Stock");
    if (eligibleOnly) list = list.filter((r) => meetsTier(customer.tier, r.minTier));
    if (types.length) list = list.filter((r) => types.includes(r.type));

    const cheap = (r: (typeof list)[number]) => Math.min(...r.options.map((o) => o.points));
    switch (sort) {
      case "low": return [...list].sort((a, b) => cheap(a) - cheap(b));
      case "high": return [...list].sort((a, b) => cheap(b) - cheap(a));
      case "new": return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      case "popular": return [...list].sort((a, b) => b.redemptions - a.redemptions);
      default:
        return [...list].sort((a, b) => {
          const aAfford = cheap(a) <= customer.points ? 0 : 1;
          const bAfford = cheap(b) <= customer.points ? 0 : 1;
          return aAfford - bAfford || b.redemptions - a.redemptions;
        });
    }
  }, [state.rewards, category, query, maxPoints, inStockOnly, eligibleOnly, types, sort, customer.tier, customer.points]);

  const clearFilters = () => {
    setMaxPoints(10000);
    setInStockOnly(false);
    setEligibleOnly(false);
    setTypes([]);
  };

  const filterPanel = (
    <div className="space-y-6">
      <div>
        <Label className="text-[13px]">Maximum points</Label>
        <p className="mt-1 text-sm font-semibold tabular">
          {maxPoints >= 10000 ? "Any" : `up to ${formatNumber(maxPoints)} pts`}
        </p>
        <Slider
          className="mt-3"
          value={[maxPoints]}
          min={250}
          max={10000}
          step={250}
          onValueChange={([v]) => setMaxPoints(v)}
          aria-label="Maximum points"
        />
      </div>
      <Separator />
      <div className="space-y-2.5">
        <Label className="text-[13px]">Reward type</Label>
        {["Free Electrical Product", "Discount", "Coupon", "Special Offer"].map((t) => (
          <label key={t} className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox
              checked={types.includes(t)}
              onCheckedChange={(c) => setTypes((prev) => (c ? [...prev, t] : prev.filter((x) => x !== t)))}
            />
            {t}
          </label>
        ))}
      </div>
      <Separator />
      <div className="space-y-2.5">
        <Label className="text-[13px]">Availability &amp; eligibility</Label>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <Checkbox checked={inStockOnly} onCheckedChange={(c) => setInStockOnly(!!c)} /> In stock only
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <Checkbox checked={eligibleOnly} onCheckedChange={(c) => setEligibleOnly(!!c)} /> Available to {customer.tier} members
        </label>
      </div>
      {activeFilterCount > 0 && (
        <Button variant="ghost" size="sm" className="w-full" onClick={clearFilters}>
          <X /> Clear all filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Rewards Store</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use your points on products, discounts and exclusive member offers.
          </p>
        </div>
        <Button asChild variant="outline" className="relative">
          <Link href="/customer/rewards/cart">
            <ShoppingBag /> Basket
            {cartService.count > 0 && <Badge className="ml-1">{cartService.count}</Badge>}
          </Link>
        </Button>
      </header>

      {/* Points banner */}
      <Card className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-accent/70 to-accent/20 p-4 sm:p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Your balance</p>
          <p className="mt-1 text-2xl font-semibold tabular sm:text-3xl">
            {formatNumber(customer.points)} <span className="text-base font-normal text-muted-foreground">points</span>
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            Worth approximately ₹{formatNumber(pointsToRupees(customer.points))}
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="How point value works"><Info className="size-3.5" /></button>
              </TooltipTrigger>
              <TooltipContent>Reward value depends on the offer.</TooltipContent>
            </Tooltip>
          </p>
        </div>
        <WaysToEarnSheet
          trigger={<Button variant="secondary" size="sm">See ways to earn</Button>}
        />
      </Card>

      {/* Search + sort */}
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search LED, switch, socket, MCB, wire…"
          className="min-w-[200px] flex-1"
          aria-label="Search rewards"
        />
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-[160px]" aria-label="Sort rewards">
            <SlidersHorizontal className="size-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sorts.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="lg:hidden">
              <Filter /> Filters
              {activeFilterCount > 0 && <Badge className="ml-1">{activeFilterCount}</Badge>}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85dvh]">
            <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
            <SheetBody className="pb-8">{filterPanel}</SheetBody>
          </SheetContent>
        </Sheet>
      </div>

      {/* Category tabs */}
      <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2 pb-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                "relative min-h-[36px] whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                category === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Desktop filter sidebar */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-24 rounded-xl border bg-card p-4">
            <p className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Filter className="size-4" /> Filters
              {activeFilterCount > 0 && <Badge className="ml-auto">{activeFilterCount}</Badge>}
            </p>
            {filterPanel}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <p className="mb-3 text-sm text-muted-foreground">
            {results.length} {results.length === 1 ? "reward" : "rewards"}
            {category !== "All" && <> in <span className="font-medium text-foreground">{category}</span></>}
          </p>

          {!hydrated ? (
            <CardGridSkeleton count={8} />
          ) : results.length === 0 ? (
            <EmptyState
              icon={Gift}
              title="No electrical rewards found."
              description="Try LED, switch or socket — or clear your filters to see everything."
              action={
                <Button variant="outline" onClick={() => { setQuery(""); setCategory("All"); clearFilters(); }}>
                  Clear search &amp; filters
                </Button>
              }
            />
          ) : (
            <motion.div layout className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {results.map((r, i) => (
                <RewardCard key={r.id} reward={r} points={customer.points} tier={customer.tier} index={i} />
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
