import type { Store } from "@/types";

export const stores: Store[] = [
  {
    id: "st-001", name: "Ambika Electricals — Main Store",
    address: "Shop 14, Sardar Complex, Ring Road", city: "Surat, Gujarat 395002",
    phone: "+91 98250 41200", manager: "Nitin Trivedi",
    sales: 1284, customers: 1840, revenue: 3182400, pointsIssued: 284600, status: "Active",
  },
  {
    id: "st-002", name: "Ambika Electricals — City Branch",
    address: "Unit 3, Shivam Arcade, Adajan Road", city: "Surat, Gujarat 395009",
    phone: "+91 98250 41288", manager: "Ruchi Shah",
    sales: 864, customers: 1000, revenue: 1642100, pointsIssued: 148200, status: "Active",
  },
];
