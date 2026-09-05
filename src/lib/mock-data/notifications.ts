import type { AppNotification } from "@/types";

const iso = (h: number) => new Date(Date.parse("2026-09-05T09:00:00.000Z") - h * 3600_000).toISOString();

export const customerNotifications: AppNotification[] = [
  { id: "n-001", title: "Your purchase earned 248 points", body: "Invoice AE-INV-10482 at Ambika Electricals — Main Store.", date: iso(4), read: false, kind: "points" },
  { id: "n-002", title: "You're only 550 points away from Platinum", body: "Reach Platinum for 2X points and free home delivery.", date: iso(20), read: false, kind: "tier" },
  { id: "n-003", title: "Your ₹100 electrical discount reward is ready", body: "Use code AE-RW-8K4P2 on your next purchase over ₹800.", date: iso(30), read: false, kind: "reward" },
  { id: "n-004", title: "Weekend 2X Points is active", body: "Earn double points on every electrical purchase this weekend.", date: iso(54), read: true, kind: "campaign" },
  { id: "n-005", title: "Your reward expires in 3 days", body: "Free 9W LED Bulb pickup expires on 8 Sep at the Main Store.", date: iso(72), read: true, kind: "reward" },
];

export const businessNotifications: AppNotification[] = [
  { id: "bn-001", title: "Today's sales crossed ₹38,000", body: "12 invoices generated across both stores.", date: iso(2), read: false, kind: "system" },
  { id: "bn-002", title: "LED Upgrade Week is performing well", body: "248 redemptions and ₹1,42,800 in attributed revenue.", date: iso(8), read: false, kind: "campaign" },
  { id: "bn-003", title: "Low stock — Wipro 20W LED Tube Light", body: "Only 9 reward units remaining.", date: iso(26), read: true, kind: "system" },
  { id: "bn-004", title: "New Gold member", body: "Vishal Patel moved from Silver to Gold.", date: iso(50), read: true, kind: "tier" },
];
