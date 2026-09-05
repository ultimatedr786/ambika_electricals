import type { Customer } from "@/types";

const iso = (daysAgo: number) => {
  const d = new Date("2026-09-05T10:00:00.000Z");
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};

export const customers: Customer[] = [
  {
    id: "c-001", name: "Rahul Sharma", membershipId: "AE-10248", phone: "+91 98240 11248",
    email: "rahul@demo.com", birthday: "1991-04-18", tier: "Gold", points: 2450, lifetimePoints: 7820,
    redeemedPoints: 5370, lifetimeSpend: 68450, purchases: 24, lastPurchase: iso(2), referrals: 3,
    referralCode: "RAHUL25", memberSince: "2023-06-12", status: "Active", store: "Main Store",
    notes: "Contractor — buys wiring material in bulk before festival season.",
  },
  {
    id: "c-002", name: "Priya Patel", membershipId: "AE-10312", phone: "+91 99048 23112",
    email: "priya.patel@demo.in", birthday: "1994-11-02", tier: "Silver", points: 1840, lifetimePoints: 3120,
    redeemedPoints: 1280, lifetimeSpend: 28640, purchases: 14, lastPurchase: iso(5), referrals: 1,
    referralCode: "PRIYA10", memberSince: "2024-01-08", status: "Active", store: "City Branch",
  },
  {
    id: "c-003", name: "Amit Shah", membershipId: "AE-10388", phone: "+91 97250 66421",
    email: "amit.shah@demo.in", birthday: "1986-02-24", tier: "Platinum", points: 6120, lifetimePoints: 18240,
    redeemedPoints: 12120, lifetimeSpend: 186400, purchases: 52, lastPurchase: iso(1), referrals: 7,
    referralCode: "AMIT50", memberSince: "2022-09-19", status: "Active", store: "Main Store",
    notes: "Runs an electrical contracting firm. Prefers Polycab and Schneider.",
  },
  {
    id: "c-004", name: "Neha Mehta", membershipId: "AE-10425", phone: "+91 90990 71204",
    email: "neha.mehta@demo.in", tier: "Bronze", points: 640, lifetimePoints: 640, redeemedPoints: 0,
    lifetimeSpend: 6420, purchases: 4, lastPurchase: iso(12), referrals: 0, referralCode: "NEHA05",
    memberSince: "2025-03-02", status: "Active", store: "City Branch",
  },
  {
    id: "c-005", name: "Rakesh Patel", membershipId: "AE-10466", phone: "+91 98795 30188",
    email: "rakesh.patel@demo.in", tier: "Gold", points: 3980, lifetimePoints: 8940, redeemedPoints: 4960,
    lifetimeSpend: 92150, purchases: 31, lastPurchase: iso(4), referrals: 2, referralCode: "RAKESH20",
    memberSince: "2023-02-11", status: "Active", store: "Main Store",
  },
  {
    id: "c-006", name: "Kunal Shah", membershipId: "AE-10502", phone: "+91 97129 84402",
    email: "kunal.shah@demo.in", tier: "Silver", points: 1120, lifetimePoints: 2260, redeemedPoints: 1140,
    lifetimeSpend: 21800, purchases: 11, lastPurchase: iso(21), referrals: 0, referralCode: "KUNAL15",
    memberSince: "2024-05-27", status: "Active", store: "City Branch",
  },
  {
    id: "c-007", name: "Mehul Desai", membershipId: "AE-10534", phone: "+91 99257 12006",
    email: "mehul.desai@demo.in", tier: "Bronze", points: 320, lifetimePoints: 980, redeemedPoints: 660,
    lifetimeSpend: 9180, purchases: 6, lastPurchase: iso(68), referrals: 0, referralCode: "MEHUL08",
    memberSince: "2024-08-14", status: "Inactive", store: "Main Store",
  },
  {
    id: "c-008", name: "Pooja Joshi", membershipId: "AE-10571", phone: "+91 90163 44720",
    email: "pooja.joshi@demo.in", tier: "Silver", points: 2210, lifetimePoints: 4310, redeemedPoints: 2100,
    lifetimeSpend: 38900, purchases: 18, lastPurchase: iso(7), referrals: 4, referralCode: "POOJA30",
    memberSince: "2023-11-05", status: "Active", store: "City Branch",
  },
  {
    id: "c-009", name: "Vishal Patel", membershipId: "AE-10603", phone: "+91 98252 90014",
    email: "vishal.patel@demo.in", tier: "Gold", points: 5210, lifetimePoints: 9860, redeemedPoints: 4650,
    lifetimeSpend: 104200, purchases: 37, lastPurchase: iso(3), referrals: 5, referralCode: "VISHAL40",
    memberSince: "2022-12-01", status: "Active", store: "Main Store",
  },
  {
    id: "c-010", name: "Sneha Shah", membershipId: "AE-10648", phone: "+91 96876 20931",
    email: "sneha.shah@demo.in", tier: "Bronze", points: 480, lifetimePoints: 720, redeemedPoints: 240,
    lifetimeSpend: 7240, purchases: 5, lastPurchase: iso(41), referrals: 1, referralCode: "SNEHA06",
    memberSince: "2025-01-22", status: "Inactive", store: "City Branch",
  },
  {
    id: "c-011", name: "Jay Mehta", membershipId: "AE-10690", phone: "+91 94284 55130",
    email: "jay.mehta@demo.in", tier: "Silver", points: 1560, lifetimePoints: 2980, redeemedPoints: 1420,
    lifetimeSpend: 26350, purchases: 13, lastPurchase: iso(9), referrals: 2, referralCode: "JAY18",
    memberSince: "2024-03-16", status: "Active", store: "Main Store",
  },
  {
    id: "c-012", name: "Hiral Trivedi", membershipId: "AE-10722", phone: "+91 90337 61845",
    email: "hiral.trivedi@demo.in", tier: "Platinum", points: 8420, lifetimePoints: 21400, redeemedPoints: 12980,
    lifetimeSpend: 214800, purchases: 61, lastPurchase: iso(1), referrals: 9, referralCode: "HIRAL60",
    memberSince: "2022-04-30", status: "Active", store: "City Branch",
  },
];

export const DEMO_CUSTOMER_ID = "c-001";
