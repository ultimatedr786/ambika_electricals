import { business, tiers } from "@/lib/mock-data/business";
import type { Product, Tier } from "@/types";

export interface CartEntry {
  product: Product;
  qty: number;
}

export interface PointsBreakdown {
  subtotal: number;
  discount: number;
  total: number;
  basePoints: number;
  bonuses: { label: string; points: number }[];
  bonusPoints: number;
  totalPoints: number;
  tierMultiplier: number;
}

export const isWeekend = (d = new Date()) => [0, 6].includes(d.getDay());

export function multiplierFor(tier: Tier) {
  return tiers.find((t) => t.name === tier)?.multiplier ?? 1;
}

/**
 * Mock reward engine: base earn rate + electrical-retail specific bonus rules.
 * Mirrors the rules shown on /business/rules.
 */
export function calculatePoints(
  entries: CartEntry[],
  opts: { tier?: Tier; discount?: number; weekend?: boolean } = {}
): PointsBreakdown {
  const subtotal = entries.reduce((s, e) => s + e.product.price * e.qty, 0);
  const discount = opts.discount ?? 0;
  const total = Math.max(0, subtotal - discount);
  const basePoints = Math.floor((total / business.earnRate.spend) * business.earnRate.points);

  const bonuses: { label: string; points: number }[] = [];

  const ledUnits = entries
    .filter((e) => /led/i.test(e.product.name))
    .reduce((s, e) => s + e.qty, 0);
  if (ledUnits > 0) bonuses.push({ label: "LED product bonus", points: 20 });
  if (ledUnits >= 5) bonuses.push({ label: "5+ LED bulbs bonus", points: 100 });

  const wireSpend = entries
    .filter((e) => e.product.category === "Wires & Cables")
    .reduce((s, e) => s + e.product.price * e.qty, 0);
  if (wireSpend > 0) {
    bonuses.push({
      label: "Wires & Cables 2X",
      points: Math.floor((wireSpend / business.earnRate.spend) * business.earnRate.points),
    });
  }

  const weekend = opts.weekend ?? isWeekend();
  if (weekend && basePoints > 0) bonuses.push({ label: "Weekend Power Bonus 2X", points: basePoints });

  const tierMultiplier = multiplierFor(opts.tier ?? "Bronze");
  if (tierMultiplier > 1 && basePoints > 0) {
    bonuses.push({
      label: `${opts.tier} tier ${tierMultiplier}x`,
      points: Math.round(basePoints * (tierMultiplier - 1)),
    });
  }

  const bonusPoints = bonuses.reduce((s, b) => s + b.points, 0);
  return { subtotal, discount, total, basePoints, bonuses, bonusPoints, totalPoints: basePoints + bonusPoints, tierMultiplier };
}

export const pointsToRupees = (points: number) => Math.round(points * business.pointValue);

export function tierProgress(lifetimePoints: number) {
  const idx = tiers.findIndex((t) => t.max === null || lifetimePoints <= t.max);
  const current = tiers[idx === -1 ? tiers.length - 1 : idx];
  const next = tiers[tiers.indexOf(current) + 1];
  if (!next) return { current, next: null, pointsToNext: 0, percent: 100 };
  const span = next.min - current.min;
  const done = lifetimePoints - current.min;
  return {
    current,
    next,
    pointsToNext: Math.max(0, next.min - lifetimePoints),
    percent: Math.min(100, Math.round((done / span) * 100)),
  };
}

const tierOrder: Tier[] = ["Bronze", "Silver", "Gold", "Platinum"];
export const tierRank = (t: Tier) => tierOrder.indexOf(t);
export const meetsTier = (customerTier: Tier, minTier: Tier) => tierRank(customerTier) >= tierRank(minTier);
