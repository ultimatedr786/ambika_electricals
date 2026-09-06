import type { TierConfig } from "@/types";

export const business = {
  name: "Ambika Electricals",
  tagline: "Powered by Rewardly",
  category: "Electrical Retail",
  ownerName: "Nitin Trivedi",
  gst: "24ABKPE1234K1Z9",
  phone: "+91 98250 41200",
  email: "care@ambikaelectricals.in",
  address: "Shop 14, Sardar Complex, Ring Road, Surat, Gujarat 395002",
  currency: "INR",
  pointValue: 0.1, // 1 point ≈ ₹0.10
  earnRate: { spend: 100, points: 10 },
  /**
   * Demo mirror of the live rule engine's `points_expiry_days`.
   * null = points never expire. Live deployments read this from
   * `loyalty_rule_versions`, never from here.
   */
  pointsExpiryDays: null as number | null,
};

export const tiers: TierConfig[] = [
  {
    name: "Bronze",
    min: 0,
    max: 999,
    multiplier: 1,
    color: "#b07a4b",
    benefits: ["1x reward points", "Member-only offers", "Birthday bonus"],
  },
  {
    name: "Silver",
    min: 1000,
    max: 4999,
    multiplier: 1.25,
    color: "#8e9bab",
    benefits: ["1.25x reward points", "Early access to campaigns", "Free cable cutting service"],
  },
  {
    name: "Gold",
    min: 5000,
    max: 14999,
    multiplier: 1.5,
    color: "#d3a029",
    benefits: ["1.5x reward points", "Gold member pricing", "Priority store pickup", "Extended reward validity"],
  },
  {
    name: "Platinum",
    min: 15000,
    max: null,
    multiplier: 2,
    color: "#5b6b7c",
    benefits: ["2x reward points", "Platinum-exclusive rewards", "Free home delivery", "Dedicated support line"],
  },
];

export function tierFor(lifetimePoints: number) {
  return (
    [...tiers].reverse().find((t) => lifetimePoints >= t.min) ?? tiers[0]
  );
}
