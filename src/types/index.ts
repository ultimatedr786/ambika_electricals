export type Tier = "Bronze" | "Silver" | "Gold" | "Platinum";

export type ProductCategory =
  | "Lighting"
  | "Switches & Sockets"
  | "Wires & Cables"
  | "Protection"
  | "Distribution"
  | "Fans"
  | "Accessories";

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: ProductCategory;
  subcategory: string;
  brand: string;
  price: number;
  mrp?: number;
  unit: string;
  stock: number;
  points: number;
  image: string;
  status: "Active" | "Inactive";
  description?: string;
}

export type RedemptionOptionType = "points" | "points_cash" | "member_price" | "coupon";

export interface RewardRedemptionOption {
  type: RedemptionOptionType;
  points: number;
  cash: number;
  label: string;
  description: string;
}

export type RewardType = "Discount" | "Coupon" | "Free Electrical Product" | "Gift" | "Special Offer";

export interface Reward {
  id: string;
  name: string;
  description: string;
  type: RewardType;
  storeCategory: ProductCategory | "Discounts" | "Coupons" | "Special Offers";
  points: number;
  regularPrice?: number;
  brand?: string;
  image: string;
  stockStatus: "In Stock" | "Low Stock" | "Out of Stock";
  inventory: number;
  minTier: Tier;
  expiryDays: number;
  minPurchase?: number;
  status: "Active" | "Paused";
  options: RewardRedemptionOption[];
  terms: string[];
  labels?: ("Best for you" | "Popular" | "Almost unlocked" | "Limited" | "New" | "Member Exclusive")[];
  redemptions: number;
  createdAt: string;
  maxPerMonth?: number;
}

export interface Customer {
  id: string;
  name: string;
  membershipId: string;
  phone: string;
  email: string;
  birthday?: string;
  tier: Tier;
  points: number;
  lifetimePoints: number;
  redeemedPoints: number;
  lifetimeSpend: number;
  purchases: number;
  lastPurchase: string;
  referrals: number;
  referralCode: string;
  memberSince: string;
  status: "Active" | "Inactive";
  store: string;
  notes?: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  brand: string;
  qty: number;
  price: number;
  points: number;
}

export interface Sale {
  id: string;
  invoice: string;
  customerId: string;
  customerName: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  amount: number;
  basePoints: number;
  bonusPoints: number;
  points: number;
  store: string;
  date: string;
  status: "Completed" | "Refunded" | "Pending";
  staff: string;
}

export type TransactionType = "earned" | "redeemed" | "bonus";

export interface PointTransaction {
  id: string;
  customerId: string;
  title: string;
  subtitle?: string;
  type: TransactionType;
  points: number;
  date: string;
  reference?: string;
}

export type RedemptionStatus =
  | "Pending"
  | "Confirmed"
  | "Ready for Pickup"
  | "Completed"
  | "Expired"
  | "Cancelled";

export interface RedemptionLine {
  rewardId: string;
  name: string;
  image: string;
  qty: number;
  option: RewardRedemptionOption;
}

export interface Redemption {
  id: string;
  redemptionId: string;
  customerId: string;
  customerName: string;
  lines: RedemptionLine[];
  pointsUsed: number;
  cashPaid: number;
  code: string;
  status: RedemptionStatus;
  fulfilment: "pickup" | "delivery";
  store: string;
  address?: Address;
  createdAt: string;
  expiresAt: string;
}

export interface Address {
  fullName: string;
  phone: string;
  address: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
}

export interface CartLine {
  rewardId: string;
  qty: number;
  optionType: RedemptionOptionType;
}

export interface Challenge {
  id: string;
  name: string;
  description: string;
  target: number;
  progress: number;
  unit: string;
  rewardPoints: number;
  endsOn: string;
  status: "Active" | "Completed" | "Scheduled";
  participants: number;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  status: "Active" | "Scheduled" | "Draft" | "Ended";
  audience: string;
  reward: string;
  startDate: string;
  endDate: string;
  reach: number;
  redemptions: number;
  revenue: number;
}

export interface RewardRule {
  id: string;
  name: string;
  type: "spend" | "product" | "category" | "multiplier" | "signup" | "first_purchase" | "referral" | "birthday" | "campaign";
  when: string;
  then: string;
  value: number;
  enabled: boolean;
}

export interface Store {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  manager: string;
  sales: number;
  customers: number;
  revenue: number;
  pointsIssued: number;
  status: "Active" | "Inactive";
}

export interface StaffMember {
  id: string;
  name: string;
  role: "Owner" | "Manager" | "Cashier" | "Marketing";
  store: string;
  email: string;
  status: "Active" | "Invited" | "Disabled";
  lastActive: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  date: string;
  read: boolean;
  kind: "points" | "reward" | "tier" | "campaign" | "system";
}

export interface TierConfig {
  name: Tier;
  min: number;
  max: number | null;
  multiplier: number;
  benefits: string[];
  color: string;
}

export type DemoRole = "customer" | "business" | "staff";
