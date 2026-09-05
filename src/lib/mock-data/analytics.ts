export type RangeKey = "today" | "7d" | "30d" | "90d" | "year";

export const rangeLabels: Record<RangeKey, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  year: "This year",
};

export interface SeriesPoint {
  label: string;
  revenue: number;
  customers: number;
  issued: number;
  redeemed: number;
  orders: number;
}

function build(labels: string[], base: number, spread: number, seed: number): SeriesPoint[] {
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  return labels.map((label, i) => {
    const wave = 1 + Math.sin((i / labels.length) * Math.PI * 2) * 0.18;
    const revenue = Math.round((base + rnd() * spread) * wave);
    return {
      label,
      revenue,
      customers: Math.round(revenue / (900 + rnd() * 300)),
      issued: Math.round(revenue * 0.1),
      redeemed: Math.round(revenue * 0.042 * (0.7 + rnd() * 0.7)),
      orders: Math.round(revenue / (2400 + rnd() * 900)),
    };
  });
}

const hours = ["9a", "10a", "11a", "12p", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p"];
const days7 = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
const days30 = Array.from({ length: 30 }, (_, i) => `${i + 1}`);
const weeks13 = Array.from({ length: 13 }, (_, i) => `W${i + 1}`);
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const seriesByRange: Record<RangeKey, SeriesPoint[]> = {
  today: build(hours, 2200, 2600, 7),
  "7d": build(days7, 34000, 22000, 11),
  "30d": build(days30, 14500, 12000, 23),
  "90d": build(weeks13, 96000, 52000, 41),
  year: build(months, 402000, 180000, 67),
};

export const topProducts = [
  { name: "Philips 9W LED Bulb", units: 1482, revenue: 177840, points: 17784, sales: 312 },
  { name: "Anchor Modular Switch 6A", units: 1264, revenue: 107440, points: 10744, sales: 286 },
  { name: "Anchor 16A Socket", units: 842, revenue: 122090, points: 12209, sales: 214 },
  { name: "Crompton Ceiling Fan 1200mm", units: 186, revenue: 455700, points: 45570, sales: 168 },
  { name: "Schneider 32A MCB", units: 412, revenue: 156560, points: 15656, sales: 149 },
  { name: "Polycab 1.5 sq mm FR Wire", units: 248, revenue: 359600, points: 35960, sales: 132 },
  { name: "Wipro 20W LED Tube Light", units: 596, revenue: 202640, points: 20264, sales: 128 },
];

export const topRewards = [
  { name: "₹100 OFF Electrical Purchase", redemptions: 486, customers: 361, points: 437400 },
  { name: "Free 9W LED Bulb", redemptions: 312, customers: 268, points: 234000 },
  { name: "10% OFF Electrical Accessories", redemptions: 264, customers: 209, points: 396000 },
  { name: "Free Modular Switch", redemptions: 148, customers: 131, points: 125800 },
  { name: "₹250 OFF Electrical Purchase", redemptions: 231, customers: 198, points: 462000 },
];

export const categoryMix = [
  { category: "Lighting", revenue: 1284000, share: 27 },
  { category: "Wires & Cables", revenue: 1148000, share: 24 },
  { category: "Fans", revenue: 764000, share: 16 },
  { category: "Switches & Sockets", revenue: 622000, share: 13 },
  { category: "Protection", revenue: 486000, share: 10 },
  { category: "Distribution", revenue: 292000, share: 6 },
  { category: "Accessories", revenue: 188000, share: 4 },
];

export const tierDistribution = [
  { tier: "Bronze", customers: 1284 },
  { tier: "Silver", customers: 926 },
  { tier: "Gold", customers: 484 },
  { tier: "Platinum", customers: 146 },
];
