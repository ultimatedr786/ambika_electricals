"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, BadgeCheck, Bell, CalendarClock, Check, CircleAlert, Coins, CreditCard,
  Gift, Heart, Lock, Minus, Package, Plus, ShoppingBag, Store, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ProductArt } from "@/components/shared/product-art";
import { TierBadge } from "@/components/shared/tier-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { WaysToEarnSheet } from "@/components/customer/ways-to-earn";
import { RewardCard } from "@/components/customer/reward-card";
import { useCurrentCustomer, useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { meetsTier } from "@/lib/points";
import { cn, formatINR, formatNumber } from "@/lib/utils";
import type { RewardRedemptionOption } from "@/types";

const optionIcon: Record<string, React.ElementType> = {
  points: Coins,
  points_cash: CreditCard,
  member_price: BadgeCheck,
  coupon: Tag,
};

export default function RewardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const customer = useCurrentCustomer();
  const { state } = useStore();
  const { rewardService, cartService } = useServices();

  const reward = state.rewards.find((r) => r.id === id);
  const [qty, setQty] = React.useState(1);
  const [selected, setSelected] = React.useState<string>("");

  React.useEffect(() => {
    if (!reward) return;
    const affordable = reward.options.find((o) => o.points <= customer.points);
    setSelected((affordable ?? reward.options[0]).type);
  }, [reward, customer.points]);

  if (!reward) {
    return (
      <EmptyState
        icon={Gift}
        title="Reward not found"
        description="This reward may have been removed from the store."
        action={<Button asChild><Link href="/customer/rewards">Back to Rewards Store</Link></Button>}
      />
    );
  }

  const option = reward.options.find((o) => o.type === selected) ?? reward.options[0];
  const eligible = meetsTier(customer.tier, reward.minTier);
  const inStock = reward.stockStatus !== "Out of Stock";
  const wished = state.wishlist.includes(reward.id);

  const totalPoints = option.points * qty;
  const totalCash = option.cash * qty;
  const shortBy = Math.max(0, totalPoints - customer.points);
  const canRedeem = eligible && inStock && shortBy === 0;
  const remaining = customer.points - totalPoints;

  const savings = (o: RewardRedemptionOption) =>
    reward.regularPrice ? Math.max(0, reward.regularPrice - o.cash) : 0;

  const related = state.rewards
    .filter((r) => r.id !== reward.id && r.storeCategory === reward.storeCategory && r.status === "Active")
    .slice(0, 4);

  const addToBasket = () => {
    cartService.add(reward.id, qty, option.type);
    toast.success("Added to your reward basket", {
      description: `${qty} × ${reward.name}`,
      action: { label: "View basket", onClick: () => router.push("/customer/rewards/cart") },
    });
  };

  const redeemNow = () => {
    cartService.add(reward.id, qty, option.type);
    router.push("/customer/rewards/checkout");
  };

  return (
    <div className="space-y-8 pb-24 lg:pb-0">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.back()}>
        <ArrowLeft /> Back
      </Button>

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
        {/* Visual */}
        <div>
          <div className="relative">
            <ProductArt art={reward.image} className="aspect-[4/3] w-full rounded-2xl border" />
            <button
              type="button"
              onClick={() => toast.success(rewardService.toggleWishlist(reward.id) ? "Saved to wishlist" : "Removed from wishlist")}
              aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
              aria-pressed={wished}
              className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-background/90 shadow-sm backdrop-blur transition-transform active:scale-90"
            >
              <Heart className={cn("size-[18px]", wished ? "fill-destructive text-destructive" : "text-muted-foreground")} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {reward.labels?.map((l) => <Badge key={l}>{l}</Badge>)}
            <Badge variant={reward.stockStatus === "In Stock" ? "success" : reward.stockStatus === "Low Stock" ? "warning" : "destructive"}>
              {reward.stockStatus}
            </Badge>
            {reward.minTier !== "Bronze" && <Badge variant="secondary"><Lock className="size-3" /> {reward.minTier}+</Badge>}
          </div>
        </div>

        {/* Detail */}
        <div>
          {reward.brand && (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {reward.brand} · {reward.storeCategory}
            </p>
          )}
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">{reward.name}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{reward.description}</p>

          <div className="mt-5 space-y-1.5 text-sm">
            <Feature ok>{eligible ? `${customer.tier} members eligible` : `Unlocks at ${reward.minTier}`}</Feature>
            <Feature ok={inStock}>{inStock ? "In stock at Ambika Electricals" : "Currently out of stock"}</Feature>
            <Feature ok>{reward.expiryDays}-day redemption validity</Feature>
            {reward.maxPerMonth && <Feature ok>Maximum {reward.maxPerMonth} redemptions per month</Feature>}
          </div>

          <Separator className="my-6" />

          {/* Redemption options */}
          <h2 className="text-base font-semibold">How would you like to use your points?</h2>
          <div className="mt-3 space-y-2.5" role="radiogroup" aria-label="Redemption options">
            {reward.options.map((o) => {
              const Icon = optionIcon[o.type] ?? Coins;
              const active = o.type === selected;
              const affordable = o.points <= customer.points;
              const save = savings(o);
              return (
                <button
                  key={o.type}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelected(o.type)}
                  className={cn(
                    "flex w-full items-start gap-3.5 rounded-xl border p-4 text-left transition-all",
                    active ? "border-primary bg-primary/[0.04] ring-1 ring-primary" : "hover:border-foreground/20 hover:bg-accent/40"
                  )}
                >
                  <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{o.label}</span>
                      {!affordable && o.points > 0 && (
                        <Badge variant="warning">{formatNumber(o.points - customer.points)} more needed</Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-muted-foreground">{o.description}</span>
                    <span className="mt-2 flex flex-wrap items-baseline gap-2">
                      <span className="text-[15px] font-semibold tabular">
                        {o.points > 0 && `${formatNumber(o.points)} points`}
                        {o.points > 0 && o.cash > 0 && " + "}
                        {o.cash > 0 && formatINR(o.cash)}
                        {o.points > 0 && o.cash === 0 && " · Pay ₹0"}
                      </span>
                      {save > 0 && <span className="text-[13px] font-medium text-success">Save {formatINR(save)}</span>}
                    </span>
                  </span>
                  <span className={cn("mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border", active ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                    {active && <Check className="size-3" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quantity */}
          {reward.type === "Free Electrical Product" && (
            <div className="mt-5 flex items-center justify-between rounded-xl border p-3.5">
              <div>
                <p className="text-sm font-medium">Quantity</p>
                {reward.maxPerMonth && <p className="text-xs text-muted-foreground">Max {reward.maxPerMonth} per month</p>}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-sm" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity">
                  <Minus />
                </Button>
                <span className="w-10 text-center text-sm font-semibold tabular" aria-live="polite">{qty}</span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setQty((q) => Math.min(reward.maxPerMonth ?? 5, q + 1))}
                  disabled={qty >= (reward.maxPerMonth ?? 5)}
                  aria-label="Increase quantity"
                >
                  <Plus />
                </Button>
              </div>
            </div>
          )}

          {/* Summary */}
          <Card className="mt-5 p-4">
            <Row label="Regular price" value={reward.regularPrice ? formatINR(reward.regularPrice * qty) : "—"} muted />
            <Row label="Points used" value={totalPoints ? `${formatNumber(totalPoints)} pts` : "0 pts"} />
            <Row label="Cash payable" value={formatINR(totalCash)} />
            <Separator className="my-2.5" />
            <Row
              label="Balance after redemption"
              value={`${formatNumber(Math.max(0, remaining))} pts`}
              strong
              tone={remaining < 0 ? "warn" : undefined}
            />
          </Card>

          <AnimatePresence>
            {shortBy > 0 && eligible && inStock && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 rounded-xl border border-warning/40 bg-warning/8 p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <CircleAlert className="size-4 text-warning" />
                    You&apos;re only {formatNumber(shortBy)} points away.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <WaysToEarnSheet trigger={<Button size="sm" variant="outline">See Ways to Earn</Button>} />
                    {reward.options.some((o) => o.type === "points_cash" && o.points <= customer.points) && (
                      <Button size="sm" variant="secondary" onClick={() => setSelected("points_cash")}>
                        Use Points + Cash
                      </Button>
                    )}
                    {reward.options.some((o) => o.type === "member_price") && (
                      <Button size="sm" variant="secondary" onClick={() => setSelected("member_price")}>
                        Use Member Price
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Desktop CTAs */}
          <div className="mt-5 hidden gap-2.5 lg:flex">
            {inStock ? (
              <>
                <Button size="lg" className="flex-1" onClick={redeemNow} disabled={!canRedeem}>
                  <Gift /> {canRedeem ? `Redeem for ${formatNumber(totalPoints)} points` : eligible ? "Not enough points" : `Unlock at ${reward.minTier}`}
                </Button>
                <Button size="lg" variant="outline" onClick={addToBasket} disabled={!eligible}>
                  <ShoppingBag /> Add to basket
                </Button>
              </>
            ) : (
              <Button size="lg" variant="outline" className="flex-1" onClick={() => toast.success("You're on the notification list.")}>
                <Bell /> Notify me
              </Button>
            )}
          </div>

          {!eligible && (
            <div className="mt-4 flex items-center justify-between rounded-xl border p-3.5">
              <div className="flex items-center gap-2.5 text-sm">
                <Lock className="size-4 text-muted-foreground" />
                Available from <TierBadge tier={reward.minTier} className="ml-0.5" />
              </div>
              <Button asChild variant="link" size="sm"><Link href="/customer/membership">View Tier Benefits</Link></Button>
            </div>
          )}

          {/* Terms */}
          <Accordion type="single" collapsible className="mt-6 rounded-xl border px-4">
            <AccordionItem value="terms" className="border-b-0">
              <AccordionTrigger>Terms &amp; conditions</AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-1.5">
                  {reward.terms.map((t) => (
                    <li key={t} className="flex gap-2 text-[13px]"><span aria-hidden>•</span>{t}</li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="fulfil">
              <AccordionTrigger>Pickup &amp; delivery</AccordionTrigger>
              <AccordionContent>
                <p className="flex items-start gap-2 text-[13px]">
                  <Store className="mt-0.5 size-3.5 shrink-0" />
                  Collect from Ambika Electricals — Main Store, Shop 14, Sardar Complex, Ring Road, Surat. Delivery is
                  available within Surat city.
                </p>
                <p className="mt-2 flex items-start gap-2 text-[13px]">
                  <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
                  Ready for pickup right after you confirm the redemption.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      {related.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight">More in {reward.storeCategory}</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {related.map((r, i) => (
              <RewardCard key={r.id} reward={r} points={customer.points} tier={customer.tier} index={i} compact />
            ))}
          </div>
        </section>
      )}

      {/* Mobile sticky CTA */}
      <div className="fixed inset-x-0 bottom-[62px] z-20 border-t bg-background/95 p-3 backdrop-blur-md lg:hidden">
        <div className="safe-bottom flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold tabular">
              {totalPoints > 0 && `${formatNumber(totalPoints)} pts`}
              {totalPoints > 0 && totalCash > 0 && " + "}
              {totalCash > 0 && formatINR(totalCash)}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {canRedeem ? `${formatNumber(Math.max(0, remaining))} pts left after` : shortBy > 0 ? `${formatNumber(shortBy)} pts short` : "Unavailable"}
            </p>
          </div>
          {inStock ? (
            <Button className="ml-auto flex-1" size="lg" onClick={redeemNow} disabled={!canRedeem}>
              <Gift /> Redeem
            </Button>
          ) : (
            <Button className="ml-auto flex-1" size="lg" variant="outline" onClick={() => toast.success("You're on the notification list.")}>
              <Bell /> Notify me
            </Button>
          )}
          <Button size="lg" variant="outline" onClick={addToBasket} disabled={!eligible} aria-label="Add to basket">
            <ShoppingBag />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Feature({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className={cn("flex items-center gap-2", ok ? "text-foreground" : "text-muted-foreground")}>
      {ok ? <Check className="size-4 text-success" /> : <Package className="size-4" />}
      {children}
    </p>
  );
}

function Row({ label, value, muted, strong, tone }: { label: string; value: string; muted?: boolean; strong?: boolean; tone?: "warn" }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={cn("text-sm", muted ? "text-muted-foreground" : "text-muted-foreground")}>{label}</span>
      <span className={cn("text-sm tabular", strong && "font-semibold", tone === "warn" && "text-destructive", muted && "line-through")}>
        {value}
      </span>
    </div>
  );
}
