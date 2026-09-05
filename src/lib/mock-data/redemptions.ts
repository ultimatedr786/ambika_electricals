import type { Redemption } from "@/types";

export const redemptions: Redemption[] = [
  {
    id: "rd-001", redemptionId: "AE-RWD-10784", customerId: "c-001", customerName: "Rahul Sharma",
    lines: [{ rewardId: "r-001", name: "Philips 9W LED Bulb", image: "bulb", qty: 1, option: { type: "points", points: 750, cash: 0, label: "Redeem with Points", description: "Use only your reward points." } }],
    pointsUsed: 750, cashPaid: 0, code: "AE-8K4P2", status: "Completed", fulfilment: "pickup",
    store: "Ambika Electricals — Main Store", createdAt: "2026-07-29T11:20:00.000Z", expiresAt: "2026-08-05T11:20:00.000Z",
  },
  {
    id: "rd-002", redemptionId: "AE-RWD-10812", customerId: "c-001", customerName: "Rahul Sharma",
    lines: [{ rewardId: "r-101", name: "₹100 OFF Electrical Purchase", image: "coupon", qty: 1, option: { type: "coupon", points: 900, cash: 0, label: "Redeem Coupon", description: "Get a coupon code to use at checkout." } }],
    pointsUsed: 900, cashPaid: 0, code: "AE-RW-8K4P2", status: "Ready for Pickup", fulfilment: "pickup",
    store: "Ambika Electricals — Main Store", createdAt: "2026-08-28T16:05:00.000Z", expiresAt: "2026-09-27T16:05:00.000Z",
  },
  {
    id: "rd-003", redemptionId: "AE-RWD-10740", customerId: "c-001", customerName: "Rahul Sharma",
    lines: [{ rewardId: "r-008", name: "Electrical Insulation Tape (Pack of 5)", image: "tape", qty: 1, option: { type: "points", points: 250, cash: 0, label: "Redeem with Points", description: "Use only your reward points." } }],
    pointsUsed: 250, cashPaid: 0, code: "AE-3M7Q9", status: "Expired", fulfilment: "pickup",
    store: "Ambika Electricals — Main Store", createdAt: "2026-06-14T10:00:00.000Z", expiresAt: "2026-06-21T10:00:00.000Z",
  },
];
