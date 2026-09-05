import type { Campaign } from "@/types";

export const campaigns: Campaign[] = [
  {
    id: "cm-001", name: "Weekend Power Bonus",
    description: "2X reward points on every electrical purchase made Friday to Sunday.",
    status: "Active", audience: "All customers", reward: "2X points",
    startDate: "2026-08-01", endDate: "2026-09-30", reach: 2840, redemptions: 612, revenue: 486200,
  },
  {
    id: "cm-002", name: "LED Upgrade Week",
    description: "+50 bonus points on every LED lighting product purchased this week.",
    status: "Active", audience: "Customers who bought lighting products", reward: "+50 bonus points",
    startDate: "2026-09-01", endDate: "2026-09-08", reach: 1120, redemptions: 248, revenue: 142800,
  },
  {
    id: "cm-003", name: "Festival Electrical Savings",
    description: "Diwali wiring and lighting bonanza — 3X points on wires, cables and lighting.",
    status: "Scheduled", audience: "All customers", reward: "3X points",
    startDate: "2026-10-14", endDate: "2026-11-05", reach: 0, redemptions: 0, revenue: 0,
  },
  {
    id: "cm-004", name: "Customer Comeback",
    description: "Win back customers who haven't purchased electrical products in 60 days.",
    status: "Draft", audience: "Inactive customers (60+ days)", reward: "2X points + ₹100 coupon",
    startDate: "2026-09-19", endDate: "2026-09-21", reach: 0, redemptions: 0, revenue: 0,
  },
  {
    id: "cm-005", name: "Fan Season Bonus",
    description: "Bonus points on ceiling, exhaust and wall fans through summer.",
    status: "Scheduled", audience: "All customers", reward: "+200 points per fan",
    startDate: "2027-03-01", endDate: "2027-05-31", reach: 0, redemptions: 0, revenue: 0,
  },
  {
    id: "cm-006", name: "Home Wiring Bonus",
    description: "Double points for customers buying wires, cables and distribution boards.",
    status: "Ended", audience: "Customers who bought wires/cables", reward: "2X points",
    startDate: "2026-06-01", endDate: "2026-07-15", reach: 940, redemptions: 186, revenue: 318400,
  },
];
