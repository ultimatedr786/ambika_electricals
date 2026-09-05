"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { RewardCard } from "@/components/customer/reward-card";
import { useCurrentCustomer, useStore } from "@/lib/store";

export default function WishlistPage() {
  const customer = useCurrentCustomer();
  const { state } = useStore();
  const items = state.rewards.filter((r) => state.wishlist.includes(r.id));

  return (
    <div className="space-y-5">
      <PageHeader title="Wishlist" description="Save products you want to redeem later." />
      {items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Nothing saved yet"
          description="Tap the heart on any reward to keep it here for later."
          action={<Button asChild><Link href="/customer/rewards">Browse Rewards Store</Link></Button>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {items.map((r, i) => (
            <RewardCard key={r.id} reward={r} points={customer.points} tier={customer.tier} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
