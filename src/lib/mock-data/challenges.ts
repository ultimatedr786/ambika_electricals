import type { Challenge } from "@/types";

export const challenges: Challenge[] = [
  {
    id: "ch-001", name: "Lighting Upgrade",
    description: "Purchase 5 lighting products this month and earn bonus points.",
    target: 5, progress: 3, unit: "products", rewardPoints: 300,
    endsOn: "2026-09-30", status: "Active", participants: 412,
  },
  {
    id: "ch-002", name: "Smart Electrical Shopper",
    description: "Purchase from 3 different electrical categories this month.",
    target: 3, progress: 2, unit: "categories", rewardPoints: 500,
    endsOn: "2026-09-30", status: "Active", participants: 286,
  },
  {
    id: "ch-003", name: "Monthly Electrical Buyer",
    description: "Make 3 purchases at Ambika Electricals this month.",
    target: 3, progress: 2, unit: "purchases", rewardPoints: 600,
    endsOn: "2026-09-30", status: "Active", participants: 524,
  },
  {
    id: "ch-004", name: "Power Saver",
    description: "Purchase any 3 qualifying LED products and save on your energy bill.",
    target: 3, progress: 3, unit: "LED products", rewardPoints: 250,
    endsOn: "2026-09-15", status: "Completed", participants: 338,
  },
  {
    id: "ch-005", name: "Weekend Power Shopper",
    description: "Shop on any two weekends this month for a bonus.",
    target: 2, progress: 1, unit: "weekend visits", rewardPoints: 400,
    endsOn: "2026-09-30", status: "Active", participants: 196,
  },
];
