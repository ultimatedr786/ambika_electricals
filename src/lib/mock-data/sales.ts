import type { Sale } from "@/types";

const iso = (daysAgo: number, hour = 12) => {
  const d = new Date("2026-09-05T00:00:00.000Z");
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 20, 0, 0);
  return d.toISOString();
};

export const sales: Sale[] = [
  {
    id: "s-001", invoice: "AE-INV-10482", customerId: "c-001", customerName: "Rahul Sharma",
    items: [
      { productId: "p-001", name: "Philips 9W LED Bulb", brand: "Philips", qty: 10, price: 120, points: 120 },
      { productId: "p-010", name: "Anchor Modular Switch 6A", brand: "Anchor", qty: 4, price: 85, points: 34 },
      { productId: "p-024", name: "Schneider 32A MCB", brand: "Schneider Electric", qty: 1, price: 380, points: 38 },
    ],
    subtotal: 1920, discount: 0, amount: 1920, basePoints: 192, bonusPoints: 56, points: 248,
    store: "Main Store", date: iso(2, 11), status: "Completed", staff: "Kiran Bhatt",
  },
  {
    id: "s-002", invoice: "AE-INV-10481", customerId: "c-003", customerName: "Amit Shah",
    items: [
      { productId: "p-019", name: "Finolex 2.5 sq mm FRLS Wire (90m)", brand: "Finolex", qty: 3, price: 2250, points: 675 },
      { productId: "p-029", name: "Havells 8-Way SPN Distribution Box", brand: "Havells", qty: 1, price: 1680, points: 168 },
    ],
    subtotal: 8430, discount: 250, amount: 8180, basePoints: 818, bonusPoints: 818, points: 1636,
    store: "Main Store", date: iso(1, 10), status: "Completed", staff: "Nitin Trivedi",
  },
  {
    id: "s-003", invoice: "AE-INV-10480", customerId: "c-012", customerName: "Hiral Trivedi",
    items: [
      { productId: "p-034", name: "Havells BLDC Ceiling Fan 1200mm", brand: "Havells", qty: 2, price: 3980, points: 796 },
      { productId: "p-015", name: "Anchor Fan Regulator Step Type", brand: "Anchor", qty: 2, price: 310, points: 62 },
    ],
    subtotal: 8580, discount: 0, amount: 8580, basePoints: 858, bonusPoints: 200, points: 1058,
    store: "City Branch", date: iso(1, 17), status: "Completed", staff: "Ruchi Shah",
  },
  {
    id: "s-004", invoice: "AE-INV-10479", customerId: "c-005", customerName: "Rakesh Patel",
    items: [
      { productId: "p-018", name: "Polycab 1.5 sq mm FR Wire (90m)", brand: "Polycab", qty: 2, price: 1450, points: 290 },
      { productId: "p-041", name: "PVC Conduit Pipe 20mm (3m)", brand: "Polycab", qty: 25, price: 45, points: 125 },
      { productId: "p-043", name: "Junction Box 4x4", brand: "Anchor", qty: 10, price: 65, points: 70 },
    ],
    subtotal: 4675, discount: 100, amount: 4575, basePoints: 457, bonusPoints: 457, points: 914,
    store: "Main Store", date: iso(4, 13), status: "Completed", staff: "Kiran Bhatt",
  },
  {
    id: "s-005", invoice: "AE-INV-10478", customerId: "c-002", customerName: "Priya Patel",
    items: [
      { productId: "p-005", name: "Havells 18W LED Panel Light", brand: "Havells", qty: 6, price: 520, points: 312 },
    ],
    subtotal: 3120, discount: 0, amount: 3120, basePoints: 312, bonusPoints: 50, points: 362,
    store: "City Branch", date: iso(5, 16), status: "Completed", staff: "Ruchi Shah",
  },
  {
    id: "s-006", invoice: "AE-INV-10477", customerId: "c-009", customerName: "Vishal Patel",
    items: [
      { productId: "p-026", name: "Havells 40A RCCB 30mA", brand: "Havells", qty: 1, price: 2450, points: 245 },
      { productId: "p-025", name: "Havells 32A MCB Single Pole", brand: "Havells", qty: 6, price: 420, points: 252 },
    ],
    subtotal: 4970, discount: 0, amount: 4970, basePoints: 497, bonusPoints: 248, points: 745,
    store: "Main Store", date: iso(3, 12), status: "Completed", staff: "Nitin Trivedi",
  },
  {
    id: "s-007", invoice: "AE-INV-10476", customerId: "c-008", customerName: "Pooja Joshi",
    items: [
      { productId: "p-004", name: "Wipro 20W LED Tube Light", brand: "Wipro", qty: 4, price: 340, points: 136 },
      { productId: "p-038", name: "Anchor Bulb Holder Batten", brand: "Anchor", qty: 8, price: 35, points: 32 },
      { productId: "p-047", name: "Electrical Insulation Tape (Pack of 5)", brand: "Anchor", qty: 2, price: 130, points: 26 },
    ],
    subtotal: 1900, discount: 0, amount: 1900, basePoints: 190, bonusPoints: 20, points: 210,
    store: "City Branch", date: iso(7, 15), status: "Completed", staff: "Ruchi Shah",
  },
  {
    id: "s-008", invoice: "AE-INV-10475", customerId: "c-011", customerName: "Jay Mehta",
    items: [
      { productId: "p-033", name: "Crompton Ceiling Fan 1200mm", brand: "Crompton", qty: 1, price: 2450, points: 245 },
      { productId: "p-012", name: "Anchor 16A Socket", brand: "Anchor", qty: 4, price: 145, points: 58 },
    ],
    subtotal: 3030, discount: 0, amount: 3030, basePoints: 303, bonusPoints: 0, points: 303,
    store: "Main Store", date: iso(9, 11), status: "Completed", staff: "Kiran Bhatt",
  },
  {
    id: "s-009", invoice: "AE-INV-10474", customerId: "c-006", customerName: "Kunal Shah",
    items: [
      { productId: "p-048", name: "Havells 4 Socket Extension Board", brand: "Havells", qty: 2, price: 690, points: 138 },
      { productId: "p-040", name: "Anchor 6A Plug Top", brand: "Anchor", qty: 6, price: 55, points: 36 },
    ],
    subtotal: 1710, discount: 0, amount: 1710, basePoints: 171, bonusPoints: 0, points: 171,
    store: "City Branch", date: iso(21, 18), status: "Completed", staff: "Ruchi Shah",
  },
  {
    id: "s-010", invoice: "AE-INV-10473", customerId: "c-004", customerName: "Neha Mehta",
    items: [
      { productId: "p-002", name: "Philips 12W LED Bulb", brand: "Philips", qty: 6, price: 165, points: 102 },
      { productId: "p-011", name: "Anchor 2-Way Switch 6A", brand: "Anchor", qty: 2, price: 110, points: 22 },
    ],
    subtotal: 1210, discount: 0, amount: 1210, basePoints: 121, bonusPoints: 250, points: 371,
    store: "City Branch", date: iso(12, 14), status: "Completed", staff: "Ruchi Shah",
  },
  {
    id: "s-011", invoice: "AE-INV-10472", customerId: "c-001", customerName: "Rahul Sharma",
    items: [
      { productId: "p-035", name: "Orient Exhaust Fan 250mm", brand: "Orient", qty: 1, price: 1850, points: 185 },
      { productId: "p-045", name: "Brass Cable Gland 20mm", brand: "Havells", qty: 12, price: 25, points: 36 },
    ],
    subtotal: 2150, discount: 0, amount: 2150, basePoints: 215, bonusPoints: 0, points: 215,
    store: "Main Store", date: iso(16, 12), status: "Completed", staff: "Kiran Bhatt",
  },
  {
    id: "s-012", invoice: "AE-INV-10471", customerId: "c-003", customerName: "Amit Shah",
    items: [
      { productId: "p-030", name: "Schneider 12-Way TPN Distribution Box", brand: "Schneider Electric", qty: 1, price: 4250, points: 425 },
      { productId: "p-031", name: "Copper Busbar Set 100A", brand: "Havells", qty: 2, price: 720, points: 144 },
    ],
    subtotal: 5690, discount: 190, amount: 5500, basePoints: 550, bonusPoints: 550, points: 1100,
    store: "Main Store", date: iso(11, 10), status: "Completed", staff: "Nitin Trivedi",
  },
  {
    id: "s-013", invoice: "AE-INV-10470", customerId: "c-010", customerName: "Sneha Shah",
    items: [
      { productId: "p-001", name: "Philips 9W LED Bulb", brand: "Philips", qty: 4, price: 120, points: 48 },
      { productId: "p-047", name: "Electrical Insulation Tape (Pack of 5)", brand: "Anchor", qty: 1, price: 130, points: 13 },
    ],
    subtotal: 610, discount: 0, amount: 610, basePoints: 61, bonusPoints: 20, points: 81,
    store: "City Branch", date: iso(41, 17), status: "Completed", staff: "Ruchi Shah",
  },
  {
    id: "s-014", invoice: "AE-INV-10469", customerId: "c-009", customerName: "Vishal Patel",
    items: [
      { productId: "p-007", name: "Bajaj 50W LED Flood Light", brand: "Bajaj", qty: 4, price: 1180, points: 472 },
    ],
    subtotal: 4720, discount: 0, amount: 4720, basePoints: 472, bonusPoints: 100, points: 572,
    store: "Main Store", date: iso(24, 13), status: "Completed", staff: "Kiran Bhatt",
  },
  {
    id: "s-015", invoice: "AE-INV-10468", customerId: "c-012", customerName: "Hiral Trivedi",
    items: [
      { productId: "p-020", name: "RR Kabel 4 sq mm Copper Cable (90m)", brand: "RR Kabel", qty: 2, price: 3480, points: 696 },
      { productId: "p-027", name: "Schneider 63A Isolator", brand: "Schneider Electric", qty: 2, price: 890, points: 178 },
    ],
    subtotal: 8740, discount: 240, amount: 8500, basePoints: 850, bonusPoints: 850, points: 1700,
    store: "City Branch", date: iso(6, 11), status: "Completed", staff: "Ruchi Shah",
  },
  {
    id: "s-016", invoice: "AE-INV-10467", customerId: "c-007", customerName: "Mehul Desai",
    items: [
      { productId: "p-039", name: "Ceiling Rose 3 Plate", brand: "Anchor", qty: 10, price: 48, points: 50 },
      { productId: "p-042", name: "PVC Conduit Bend 20mm", brand: "Polycab", qty: 30, price: 18, points: 60 },
    ],
    subtotal: 1020, discount: 0, amount: 1020, basePoints: 102, bonusPoints: 0, points: 102,
    store: "Main Store", date: iso(68, 15), status: "Completed", staff: "Kiran Bhatt",
  },
];
