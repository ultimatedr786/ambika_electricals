"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Heart, Lock } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductArt } from "@/components/shared/product-art";
import { useServices } from "@/lib/services";
import { useStore } from "@/lib/store";
import { meetsTier } from "@/lib/points";
import { cn, formatNumber, formatINR } from "@/lib/utils";
import type { Reward, Tier } from "@/types";

export function rewardCTA(reward: Reward, points: number, tier: Tier) {
  if (!meetsTier(tier, reward.minTier)) return { label: `Unlock at ${reward.minTier}`, tone: "locked" as const };
  if (reward.stockStatus === "Out of Stock") return { label: "Notify me", tone: "oos" as const };
  const cheapest = Math.min(...reward.options.map((o) => o.points));
  if (points >= cheapest) return { label: "Redeem", tone: "ready" as const };
  const pointsCash = reward.options.find((o) => o.type === "points_cash");
  const member = reward.options.find((o) => o.type === "member_price");
  if (pointsCash && points >= pointsCash.points) return { label: "Use Points + Cash", tone: "ready" as const };
  if (member) return { label: "Member Price", tone: "member" as const };
  return { label: "Almost There", tone: "short" as const };
}

export function RewardCard({
  reward,
  points,
  tier,
  index = 0,
  compact,
}: {
  reward: Reward;
  points: number;
  tier: Tier;
  index?: number;
  compact?: boolean;
}) {
  const { rewardService } = useServices();
  const { state } = useStore();
  const wished = state.wishlist.includes(reward.id);
  const cta = rewardCTA(reward, points, tier);
  const eligible = meetsTier(tier, reward.minTier);
  const cheapest = Math.min(...reward.options.map((o) => o.points));
  const pointsCash = reward.options.find((o) => o.type === "points_cash");
  const shortBy = Math.max(0, cheapest - points);

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index, 8) * 0.03, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative">
        <Link href={`/customer/rewards/${reward.id}`} className="block" aria-label={`View ${reward.name}`}>
          <ProductArt art={reward.image} className="aspect-[4/3] w-full rounded-none" />
        </Link>
        <button
          type="button"
          onClick={() => {
            const added = rewardService.toggleWishlist(reward.id);
            toast.success(added ? "Saved to wishlist" : "Removed from wishlist");
          }}
          aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={wished}
          className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-background/85 shadow-sm backdrop-blur transition-transform active:scale-90"
        >
          <Heart className={cn("size-4 transition-colors", wished ? "fill-destructive text-destructive" : "text-muted-foreground")} />
        </button>
        {reward.labels?.[0] && (
          <Badge className="absolute left-2 top-2 bg-background/90 backdrop-blur" variant="default">
            {reward.labels[0]}
          </Badge>
        )}
        {!eligible && (
          <span className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1.5 rounded-md bg-background/90 py-1 text-[11px] font-medium backdrop-blur">
            <Lock className="size-3" /> {reward.minTier} exclusive
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-3.5">
        {reward.brand && <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{reward.brand}</p>}
        <h3 className="mt-0.5 line-clamp-2 text-[13px] font-medium leading-snug sm:text-sm">
          <Link href={`/customer/rewards/${reward.id}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {reward.name}
          </Link>
        </h3>

        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-[15px] font-semibold tabular text-primary">{formatNumber(cheapest)}</span>
          <span className="text-[11px] text-muted-foreground">points</span>
          {reward.regularPrice && (
            <span className="ml-auto text-[11px] text-muted-foreground line-through">{formatINR(reward.regularPrice)}</span>
          )}
        </div>

        {!compact && pointsCash && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            or {formatNumber(pointsCash.points)} pts + {formatINR(pointsCash.cash)}
          </p>
        )}

        {shortBy > 0 && eligible && reward.stockStatus !== "Out of Stock" && (
          <p className="mt-1 text-[11px] font-medium text-warning">{formatNumber(shortBy)} more points needed</p>
        )}
        {reward.stockStatus === "Low Stock" && (
          <p className="mt-1 text-[11px] font-medium text-warning">Only {reward.inventory} left</p>
        )}

        <Button
          asChild
          size="sm"
          variant={cta.tone === "ready" ? "default" : "outline"}
          className="relative z-[1] mt-3 w-full"
        >
          <Link href={`/customer/rewards/${reward.id}`}>{cta.label}</Link>
        </Button>
      </div>
    </motion.article>
  );
}
