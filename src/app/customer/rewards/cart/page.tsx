"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, CircleAlert, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductArt } from "@/components/shared/product-art";
import { PageHeader } from "@/components/shared/page-header";
import { useCurrentCustomer, useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { formatINR, formatNumber } from "@/lib/utils";

export default function RewardsCartPage() {
  const router = useRouter();
  const customer = useCurrentCustomer();
  const { state } = useStore();
  const { cartService } = useServices();

  const lines = state.cart
    .map((l) => {
      const reward = state.rewards.find((r) => r.id === l.rewardId);
      const option = reward?.options.find((o) => o.type === l.optionType);
      return reward && option ? { ...l, reward, option } : null;
    })
    .filter(Boolean) as { rewardId: string; qty: number; optionType: string; reward: NonNullable<ReturnType<typeof state.rewards.find>>; option: { type: string; points: number; cash: number; label: string } }[];

  const totalPoints = lines.reduce((s, l) => s + l.option.points * l.qty, 0);
  const totalCash = lines.reduce((s, l) => s + l.option.cash * l.qty, 0);
  const remaining = customer.points - totalPoints;
  const insufficient = remaining < 0;

  if (lines.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader title="Reward basket" description="Products and offers you're ready to redeem." />
        <EmptyState
          icon={ShoppingBag}
          title="Your basket is empty"
          description="Add electrical products, discounts or member offers from the Rewards Store."
          action={<Button asChild><Link href="/customer/rewards">Browse Rewards Store</Link></Button>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-28 lg:pb-0">
      <PageHeader
        title="Reward basket"
        description={`${lines.length} ${lines.length === 1 ? "item" : "items"} ready to redeem.`}
        actions={<Button variant="ghost" size="sm" onClick={cartService.clear}>Clear basket</Button>}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {lines.map((l) => (
              <motion.div
                key={`${l.rewardId}-${l.optionType}`}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.22 }}
              >
                <Card className="flex gap-3.5 p-3.5">
                  <ProductArt art={l.reward.image} className="size-20 shrink-0 sm:size-24" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {l.reward.brand && <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{l.reward.brand}</p>}
                        <Link href={`/customer/rewards/${l.reward.id}`} className="line-clamp-2 text-sm font-medium hover:underline">
                          {l.reward.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">{l.option.label}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => cartService.remove(l.rewardId, l.optionType)}
                        aria-label={`Remove ${l.reward.name}`}
                      >
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    </div>
                    <div className="mt-auto flex items-end justify-between pt-2">
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon-sm" onClick={() => cartService.setQty(l.rewardId, l.optionType, l.qty - 1)} aria-label="Decrease quantity">
                          <Minus />
                        </Button>
                        <span className="w-8 text-center text-sm font-semibold tabular">{l.qty}</span>
                        <Button variant="outline" size="icon-sm" onClick={() => cartService.setQty(l.rewardId, l.optionType, l.qty + 1)} aria-label="Increase quantity">
                          <Plus />
                        </Button>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular">
                          {l.option.points > 0 && `${formatNumber(l.option.points * l.qty)} pts`}
                        </p>
                        {l.option.cash > 0 && <p className="text-xs text-muted-foreground tabular">+ {formatINR(l.option.cash * l.qty)}</p>}
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>

          <Button asChild variant="outline" className="w-full">
            <Link href="/customer/rewards">Continue shopping</Link>
          </Button>
        </div>

        {/* Summary */}
        <div className="lg:sticky lg:top-24 lg:h-fit">
          <Card className="p-5">
            <h2 className="text-base font-semibold">Redemption summary</h2>
            <div className="mt-4 space-y-2 text-sm">
              <Row label="Current points" value={`${formatNumber(customer.points)} pts`} />
              <Row label="Points required" value={`${formatNumber(totalPoints)} pts`} />
              {totalCash > 0 && <Row label="Cash payable" value={formatINR(totalCash)} />}
              <Separator className="my-2.5" />
              <Row
                label="Balance after redemption"
                value={`${formatNumber(remaining)} pts`}
                strong
                tone={insufficient ? "warn" : undefined}
              />
            </div>

            {insufficient && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[13px]">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                <span>
                  You need {formatNumber(Math.abs(remaining))} more points. Remove an item or switch one to a
                  points + cash option.
                </span>
              </div>
            )}

            <Button
              size="lg"
              className="mt-5 hidden w-full lg:flex"
              disabled={insufficient}
              onClick={() => router.push("/customer/rewards/checkout")}
            >
              Checkout <ArrowRight />
            </Button>
          </Card>
        </div>
      </div>

      {/* Mobile sticky bar */}
      <div className="fixed inset-x-0 bottom-[62px] z-20 border-t bg-background/95 p-3 backdrop-blur-md lg:hidden">
        <div className="safe-bottom flex items-center gap-3">
          <div>
            <p className="text-[15px] font-semibold tabular">{formatNumber(totalPoints)} pts{totalCash > 0 && ` + ${formatINR(totalCash)}`}</p>
            <p className="text-[11px] text-muted-foreground">{insufficient ? `${formatNumber(Math.abs(remaining))} pts short` : `${formatNumber(remaining)} pts left after`}</p>
          </div>
          <Button className="ml-auto flex-1" size="lg" disabled={insufficient} onClick={() => router.push("/customer/rewards/checkout")}>
            Checkout <ArrowRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "warn" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular ${strong ? "font-semibold" : ""} ${tone === "warn" ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );
}
