import type { PointTransaction } from "@/types";

const iso = (daysAgo: number, hour = 12) => {
  const d = new Date("2026-09-05T00:00:00.000Z");
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 5, 0, 0);
  return d.toISOString();
};

export const transactions: PointTransaction[] = [
  { id: "t-001", customerId: "c-001", title: "Purchase at Ambika Electricals", subtitle: "LED bulbs, modular switches, MCB", type: "earned", points: 248, date: iso(2, 11), reference: "AE-INV-10482" },
  { id: "t-002", customerId: "c-001", title: "Weekend Power Bonus", subtitle: "2X points campaign", type: "bonus", points: 250, date: iso(3, 19) },
  { id: "t-003", customerId: "c-001", title: "Redeemed ₹100 OFF Coupon", subtitle: "Coupon AE-RW-8K4P2", type: "redeemed", points: -900, date: iso(8, 16) },
  { id: "t-004", customerId: "c-001", title: "Purchase — Exhaust Fan & Glands", subtitle: "Main Store", type: "earned", points: 215, date: iso(16, 12), reference: "AE-INV-10472" },
  { id: "t-005", customerId: "c-001", title: "Lighting Upgrade Challenge", subtitle: "Milestone reached", type: "bonus", points: 300, date: iso(19, 10) },
  { id: "t-006", customerId: "c-001", title: "Purchase — LED Tube Lights", subtitle: "Main Store", type: "earned", points: 136, date: iso(27, 14), reference: "AE-INV-10455" },
  { id: "t-007", customerId: "c-001", title: "Referral Bonus — Kunal Shah", type: "bonus", points: 200, date: iso(34, 11) },
  { id: "t-008", customerId: "c-001", title: "Redeemed Free 9W LED Bulb", subtitle: "Redemption AE-RWD-10784", type: "redeemed", points: -750, date: iso(38, 17) },
  { id: "t-009", customerId: "c-001", title: "Purchase — House Wire Coil", subtitle: "Main Store", type: "earned", points: 290, date: iso(45, 12), reference: "AE-INV-10431" },
  { id: "t-010", customerId: "c-001", title: "Birthday Bonus", type: "bonus", points: 500, date: iso(58, 9) },
  { id: "t-011", customerId: "c-001", title: "Purchase — Modular Switches", subtitle: "City Branch", type: "earned", points: 48, date: iso(66, 15), reference: "AE-INV-10402" },
  { id: "t-012", customerId: "c-001", title: "First Purchase Bonus", type: "bonus", points: 250, date: iso(88, 11) },
];
