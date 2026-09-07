"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { RewardCard } from "@/components/customer/reward-card";
import { ProductArt, type ProductArtKey } from "@/components/shared/product-art";
import { useCurrentCustomer, useStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { createClient } from "@/lib/supabase/client";
import { formatINR, formatNumber } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  discount: "Discount",
  coupon: "Coupon",
  free_product: "Free Product",
  gift: "Gift",
  special_offer: "Special Offer",
};

interface LiveWishlistItem {
  id: string;
  rewardId: string;
  businessName: string;
  name: string;
  rewardType: string;
  category: string | null;
  artKey: string | null;
  pointsCost: number;
  regularPricePaise: number | null;
}

function useLiveWishlist() {
  const configured = isSupabaseConfigured();
  const supabase = React.useMemo(() => createClient(), []);
  const [items, setItems] = React.useState<LiveWishlistItem[]>([]);
  const [loading, setLoading] = React.useState(configured);

  const reload = React.useCallback(async () => {
    if (!configured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("wishlist_items")
      .select("id, reward_id, rewards(name, reward_type, category, art_key, points_cost, regular_price_paise, businesses(name))")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false });
    setItems(
      ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
        const r = (row.rewards ?? {}) as Record<string, unknown>;
        const biz = (r.businesses ?? {}) as { name?: string };
        return {
          id: String(row.id),
          rewardId: String(row.reward_id),
          businessName: biz.name ?? "Business",
          name: String(r.name ?? "Reward"),
          rewardType: String(r.reward_type ?? "gift"),
          category: (r.category as string | null) ?? null,
          artKey: (r.art_key as string | null) ?? null,
          pointsCost: Number(r.points_cost ?? 0),
          regularPricePaise: r.regular_price_paise == null ? null : Number(r.regular_price_paise),
        };
      })
    );
    setLoading(false);
  }, [configured, supabase]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const remove = React.useCallback(
    async (rewardId: string) => {
      if (!supabase) return;
      await supabase.rpc("remove_from_wishlist", { p_reward_id: rewardId });
      await reload();
    },
    [supabase, reload]
  );

  return { configured, items, loading, remove };
}

export default function WishlistPage() {
  const customer = useCurrentCustomer();
  const { state } = useStore();
  const live = useLiveWishlist();
  const configured = live.configured;
  const items = state.rewards.filter((r) => state.wishlist.includes(r.id));

  return (
    <div className="space-y-4 flex-1 min-h-0 flex flex-col">
      <div className="shrink-0">
        <PageHeader title="Wishlist" description="Save products you want to redeem later." />
      </div>
      {configured ? (
        live.loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
            Loading wishlist…
          </div>
        ) : live.items.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="Nothing saved yet"
            description="Tap the heart on any reward to keep it here for later."
            action={<Button asChild><Link href="/customer/rewards">Browse Rewards Store</Link></Button>}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 flex-1 min-h-0 overflow-y-auto scroll-region p-1">
            {live.items.map((r) => (
              <Card key={r.id} className="relative flex h-full flex-col p-3.5">
                <button
                  type="button"
                  onClick={() => {
                    void live.remove(r.rewardId);
                    toast.success("Removed from wishlist");
                  }}
                  aria-label="Remove from wishlist"
                  className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-background/85 shadow-sm backdrop-blur transition-transform active:scale-90"
                >
                  <Heart className="size-3.5 fill-destructive text-destructive" />
                </button>
                <div className="flex items-start gap-2.5 pr-7">
                  <ProductArt art={(r.artKey ?? "gift") as ProductArtKey} className="size-12 shrink-0" tone="muted" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.businessName} · {TYPE_LABEL[r.rewardType] ?? r.rewardType}
                      {r.category ? ` · ${r.category}` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="tabular">{formatNumber(r.pointsCost)} pts</Badge>
                  {r.regularPricePaise != null && r.regularPricePaise > 0 && (
                    <Badge variant="outline" className="tabular">Worth {formatINR(r.regularPricePaise / 100)}</Badge>
                  )}
                </div>
                <div className="mt-auto pt-3">
                  <Button asChild size="sm" className="w-full">
                    <Link href="/customer/rewards">Redeem in Rewards Store</Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Nothing saved yet"
          description="Tap the heart on any reward to keep it here for later."
          action={<Button asChild><Link href="/customer/rewards">Browse Rewards Store</Link></Button>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 flex-1 min-h-0 overflow-y-auto scroll-region p-1">
          {items.map((r, i) => (
            <RewardCard key={r.id} reward={r} points={customer.points} tier={customer.tier} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
