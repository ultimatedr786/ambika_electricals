"use client";

import * as React from "react";
import { customers as seedCustomers, DEMO_CUSTOMER_ID } from "@/lib/mock-data/customers";
import { products as seedProducts } from "@/lib/mock-data/products";
import { rewards as seedRewards } from "@/lib/mock-data/rewards";
import { sales as seedSales } from "@/lib/mock-data/sales";
import { transactions as seedTransactions } from "@/lib/mock-data/transactions";
import { redemptions as seedRedemptions } from "@/lib/mock-data/redemptions";
import { campaigns as seedCampaigns } from "@/lib/mock-data/campaigns";
import { challenges as seedChallenges } from "@/lib/mock-data/challenges";
import { rewardRules as seedRules } from "@/lib/mock-data/rules";
import { stores as seedStores } from "@/lib/mock-data/stores";
import { staff as seedStaff } from "@/lib/mock-data/staff";
import { customerNotifications, businessNotifications } from "@/lib/mock-data/notifications";
import { eventBus } from "@/lib/events";
import type {
  Address, AppNotification, Campaign, CartLine, Challenge, Customer, DemoRole, PointTransaction,
  Product, Redemption, Reward, RewardRule, Sale, StaffMember, Store,
} from "@/types";

export interface AppState {
  role: DemoRole;
  signedIn: boolean;
  currentCustomerId: string;
  customers: Customer[];
  products: Product[];
  rewards: Reward[];
  sales: Sale[];
  transactions: PointTransaction[];
  redemptions: Redemption[];
  campaigns: Campaign[];
  challenges: Challenge[];
  rules: RewardRule[];
  stores: Store[];
  staff: StaffMember[];
  customerNotifications: AppNotification[];
  businessNotifications: AppNotification[];
  cart: CartLine[];
  wishlist: string[];
  addresses: Address[];
  onboarded: boolean;
}

const initialState: AppState = {
  role: "customer",
  signedIn: false,
  currentCustomerId: DEMO_CUSTOMER_ID,
  customers: seedCustomers,
  products: seedProducts,
  rewards: seedRewards,
  sales: seedSales,
  transactions: seedTransactions,
  redemptions: seedRedemptions,
  campaigns: seedCampaigns,
  challenges: seedChallenges,
  rules: seedRules,
  stores: seedStores,
  staff: seedStaff,
  customerNotifications,
  businessNotifications,
  cart: [],
  wishlist: ["r-002", "r-012"],
  addresses: [],
  onboarded: false,
};

type Ctx = {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  hydrated: boolean;
  reset: () => void;
};

const StoreContext = React.createContext<Ctx | null>(null);
const KEY = "ambika-rewardly-state-v1";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AppState>(initialState);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(KEY);
      if (raw) setState({ ...initialState, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, hydrated]);

  const reset = React.useCallback(() => {
    window.sessionStorage.removeItem(KEY);
    setState(initialState);
    eventBus.emit("store.reset", undefined);
  }, []);

  const value = React.useMemo(() => ({ state, setState, hydrated, reset }), [state, hydrated, reset]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = React.useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export function useCurrentCustomer() {
  const { state } = useStore();
  return state.customers.find((c) => c.id === state.currentCustomerId) ?? state.customers[0];
}
