"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { calculatePoints, type CartEntry, tierProgress } from "@/lib/points";
import { randomCode } from "@/lib/utils";
import { business, tierFor } from "@/lib/mock-data/business";
import { seriesByRange, type RangeKey } from "@/lib/mock-data/analytics";
import { eventBus } from "@/lib/events";
import type {
  Address, Campaign, Customer, Product, Redemption, RedemptionLine, Reward,
  RewardRedemptionOption, Sale, SaleItem, RewardRule, Challenge, Store, StaffMember, AppNotification,
} from "@/types";

let seq = 10483;
const nextInvoice = () => `AE-INV-${seq++}`;
let rseq = 10842;
const nextRedemptionId = () => `AE-RWD-${rseq++}`;

/**
 * Frontend-only mock service layer with immediate in-memory mutations
 * and typed event emission.
 */
export function useServices() {
  const { state, setState } = useStore();

  const productService = React.useMemo(
    () => ({
      getProducts: () => state.products,
      getProduct: (id: string) => state.products.find((p) => p.id === id),
      createProduct: async (input: Omit<Product, "id">) => {
        const product: Product = { ...input, id: `p-${Date.now()}` };
        setState((s) => ({ ...s, products: [product, ...s.products] }));
        eventBus.emit("product.created", { product });
        return product;
      },
      updateProduct: async (id: string, patch: Partial<Product>) => {
        let updated: Product | undefined;
        setState((s) => {
          const products = s.products.map((p) => {
            if (p.id === id) {
              updated = { ...p, ...patch };
              return updated;
            }
            return p;
          });
          return { ...s, products };
        });
        if (updated) eventBus.emit("product.updated", { product: updated });
      },
      deleteProduct: async (id: string) => {
        setState((s) => ({ ...s, products: s.products.filter((p) => p.id !== id) }));
      },
    }),
    [state.products, setState]
  );

  const customerService = React.useMemo(
    () => ({
      getCustomers: () => state.customers,
      getCustomer: (id: string) => state.customers.find((c) => c.id === id),
      getProfile: () => state.customers.find((c) => c.id === state.currentCustomerId) ?? state.customers[0],
      getPoints: () => (state.customers.find((c) => c.id === state.currentCustomerId) ?? state.customers[0]).points,
      findByQuery: (q: string) => {
        const t = q.trim().toLowerCase();
        if (!t) return state.customers;
        return state.customers.filter(
          (c) =>
            c.name.toLowerCase().includes(t) ||
            c.phone.replace(/\s/g, "").includes(t.replace(/\s/g, "")) ||
            c.membershipId.toLowerCase().includes(t)
        );
      },
      createCustomer: async (input: Partial<Customer> & { name: string; phone: string; email: string }) => {
        const customer: Customer = {
          id: `c-${Date.now()}`,
          name: input.name,
          membershipId: `AE-${10800 + Math.floor(Math.random() * 900)}`,
          phone: input.phone,
          email: input.email,
          birthday: input.birthday,
          tier: "Bronze",
          points: 100,
          lifetimePoints: 100,
          redeemedPoints: 0,
          lifetimeSpend: 0,
          purchases: 0,
          lastPurchase: new Date().toISOString(),
          referrals: 0,
          referralCode: input.name.split(" ")[0].toUpperCase().slice(0, 6) + "10",
          memberSince: new Date().toISOString().slice(0, 10),
          status: "Active",
          store: "Main Store",
        };
        setState((s) => ({ ...s, customers: [customer, ...s.customers] }));
        eventBus.emit("customer.created", { customer });
        return customer;
      },
      updateCustomer: async (id: string, patch: Partial<Customer>) => {
        let updated: Customer | undefined;
        setState((s) => {
          const customers = s.customers.map((c) => {
            if (c.id === id) {
              updated = { ...c, ...patch };
              return updated;
            }
            return c;
          });
          return { ...s, customers };
        });
        if (updated) eventBus.emit("customer.updated", { customer: updated });
      },
    }),
    [state.customers, state.currentCustomerId, setState]
  );

  const rewardService = React.useMemo(
    () => ({
      getRewards: () => state.rewards,
      getReward: (id: string) => state.rewards.find((r) => r.id === id),
      createReward: async (input: Omit<Reward, "id" | "redemptions" | "createdAt">) => {
        const reward: Reward = {
          ...input,
          id: `r-${Date.now()}`,
          redemptions: 0,
          createdAt: new Date().toISOString().slice(0, 10),
        };
        setState((s) => ({ ...s, rewards: [reward, ...s.rewards] }));
        return reward;
      },
      updateReward: async (id: string, patch: Partial<Reward>) => {
        setState((s) => ({ ...s, rewards: s.rewards.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
      },
      toggleWishlist: (rewardId: string) => {
        let added = false;
        setState((s) => {
          added = !s.wishlist.includes(rewardId);
          return {
            ...s,
            wishlist: added ? [...s.wishlist, rewardId] : s.wishlist.filter((w) => w !== rewardId),
          };
        });
        return added;
      },
    }),
    [state.rewards, setState]
  );

  const cartService = React.useMemo(
    () => ({
      lines: state.cart,
      count: state.cart.reduce((s, l) => s + l.qty, 0),
      add: (rewardId: string, qty: number, optionType: RewardRedemptionOption["type"]) => {
        setState((s) => {
          const existing = s.cart.find((l) => l.rewardId === rewardId && l.optionType === optionType);
          return {
            ...s,
            cart: existing
              ? s.cart.map((l) => (l === existing ? { ...l, qty: l.qty + qty } : l))
              : [...s.cart, { rewardId, qty, optionType }],
          };
        });
      },
      setQty: (rewardId: string, optionType: string, qty: number) =>
        setState((s) => ({
          ...s,
          cart: s.cart
            .map((l) => (l.rewardId === rewardId && l.optionType === optionType ? { ...l, qty } : l))
            .filter((l) => l.qty > 0),
        })),
      remove: (rewardId: string, optionType: string) =>
        setState((s) => ({ ...s, cart: s.cart.filter((l) => !(l.rewardId === rewardId && l.optionType === optionType)) })),
      clear: () => setState((s) => ({ ...s, cart: [] })),
    }),
    [state.cart, setState]
  );

  const salesService = React.useMemo(
    () => ({
      getSales: () => state.sales,
      getSale: (id: string) => state.sales.find((s) => s.id === id),
      previewPoints: (entries: CartEntry[], customerId?: string) => {
        const customer = state.customers.find((c) => c.id === customerId);
        return calculatePoints(entries, { tier: customer?.tier });
      },
      createSale: async (params: { customerId: string; entries: CartEntry[]; discount?: number; store?: string; staff?: string }) => {
        const customer = state.customers.find((c) => c.id === params.customerId) || state.customers[0];
        const breakdown = calculatePoints(params.entries, { tier: customer.tier, discount: params.discount });
        const items: SaleItem[] = params.entries.map((e) => ({
          productId: e.product.id,
          name: e.product.name,
          brand: e.product.brand,
          qty: e.qty,
          price: e.product.price,
          points: e.product.points * e.qty,
        }));
        const saleDate = new Date().toISOString();
        const sale: Sale = {
          id: `s-${Date.now()}`,
          invoice: nextInvoice(),
          customerId: customer.id,
          customerName: customer.name,
          items,
          subtotal: breakdown.subtotal,
          discount: breakdown.discount,
          amount: breakdown.total,
          basePoints: breakdown.basePoints,
          bonusPoints: breakdown.bonusPoints,
          points: breakdown.totalPoints,
          store: params.store ?? "Main Store",
          date: saleDate,
          status: "Completed",
          staff: params.staff ?? "Kiran Bhatt",
        };

        const custNotification: AppNotification = {
          id: `n-${Date.now()}`,
          title: `Your purchase earned ${sale.points} points`,
          body: `Invoice ${sale.invoice} at Ambika Electricals — ${sale.store}.`,
          date: saleDate,
          read: false,
          kind: "points",
        };

        const bizNotification: AppNotification = {
          id: `n-biz-${Date.now()}`,
          title: `Sale completed · ₹${sale.amount.toLocaleString("en-IN")}`,
          body: `${customer.name} earned ${sale.points} points (${sale.invoice}).`,
          date: saleDate,
          read: false,
          kind: "points",
        };

        let updatedCustomer = customer;

        setState((s) => {
          const nextCustomers = s.customers.map((c) => {
            if (c.id === customer.id) {
              const newLifetime = c.lifetimePoints + sale.points;
              updatedCustomer = {
                ...c,
                points: c.points + sale.points,
                lifetimePoints: newLifetime,
                lifetimeSpend: c.lifetimeSpend + sale.amount,
                purchases: c.purchases + 1,
                lastPurchase: sale.date,
                tier: tierFor(newLifetime).name,
              };
              return updatedCustomer;
            }
            return c;
          });

          return {
            ...s,
            sales: [sale, ...s.sales],
            products: s.products.map((p) => {
              const line = params.entries.find((e) => e.product.id === p.id);
              return line ? { ...p, stock: Math.max(0, p.stock - line.qty) } : p;
            }),
            customers: nextCustomers,
            transactions: [
              {
                id: `t-${Date.now()}`,
                customerId: customer.id,
                title: "Purchase at Ambika Electricals",
                subtitle: items.map((i) => `${i.qty} × ${i.name}`).join(", ").slice(0, 90),
                type: "earned" as const,
                points: sale.points,
                date: sale.date,
                reference: sale.invoice,
              },
              ...s.transactions,
            ],
            customerNotifications: [custNotification, ...s.customerNotifications],
            businessNotifications: [bizNotification, ...s.businessNotifications],
          };
        });

        eventBus.emit("sale.completed", { sale, points: sale.points, customer: updatedCustomer });
        eventBus.emit("notification.created", { notification: custNotification, scope: "customer" });
        eventBus.emit("notification.created", { notification: bizNotification, scope: "business" });

        return { sale, breakdown };
      },
    }),
    [state.sales, state.customers, setState]
  );

  const redemptionService = React.useMemo(
    () => ({
      getRedemptions: (customerId?: string) =>
        state.redemptions.filter((r) => !customerId || r.customerId === customerId),
      redeemReward: async (params: {
        lines: RedemptionLine[];
        fulfilment: "pickup" | "delivery";
        address?: Address;
        store?: string;
      }) => {
        const customer = state.customers.find((c) => c.id === state.currentCustomerId) || state.customers[0];
        const pointsUsed = params.lines.reduce((s, l) => s + l.option.points * l.qty, 0);
        const cashPaid = params.lines.reduce((s, l) => s + l.option.cash * l.qty, 0);
        const now = new Date();
        const expiry = new Date(now.getTime() + 7 * 86400000);
        const redemption: Redemption = {
          id: `rd-${Date.now()}`,
          redemptionId: nextRedemptionId(),
          customerId: customer.id,
          customerName: customer.name,
          lines: params.lines,
          pointsUsed,
          cashPaid,
          code: randomCode("AE-", 5),
          status: params.fulfilment === "pickup" ? "Ready for Pickup" : "Confirmed",
          fulfilment: params.fulfilment,
          store: params.store ?? "Ambika Electricals — Main Store",
          address: params.address,
          createdAt: now.toISOString(),
          expiresAt: expiry.toISOString(),
        };

        const custNotification: AppNotification = {
          id: `n-${Date.now()}`,
          title: "Reward unlocked 🎉",
          body: `${params.lines[0].name} — code ${redemption.code}. ${params.fulfilment === "pickup" ? "Ready for pickup at the Main Store." : "Out for delivery soon."}`,
          date: now.toISOString(),
          read: false,
          kind: "reward",
        };

        const bizNotification: AppNotification = {
          id: `n-biz-${Date.now()}`,
          title: `Reward redeemed · ${customer.name}`,
          body: `${params.lines[0].name} (${redemption.pointsUsed} pts) — code ${redemption.code}.`,
          date: now.toISOString(),
          read: false,
          kind: "reward",
        };

        let updatedCustomer = customer;

        setState((s) => {
          const nextCustomers = s.customers.map((c) => {
            if (c.id === customer.id) {
              updatedCustomer = {
                ...c,
                points: Math.max(0, c.points - pointsUsed),
                redeemedPoints: c.redeemedPoints + pointsUsed,
              };
              return updatedCustomer;
            }
            return c;
          });

          return {
            ...s,
            redemptions: [redemption, ...s.redemptions],
            cart: [],
            addresses: params.address
              ? [params.address, ...s.addresses.filter((a) => a.pincode !== params.address!.pincode)]
              : s.addresses,
            customers: nextCustomers,
            rewards: s.rewards.map((r) => {
              const line = params.lines.find((l) => l.rewardId === r.id);
              return line
                ? { ...r, inventory: Math.max(0, r.inventory - line.qty), redemptions: r.redemptions + line.qty }
                : r;
            }),
            transactions: pointsUsed
              ? [
                  {
                    id: `t-${Date.now()}`,
                    customerId: customer.id,
                    title: `Redeemed ${params.lines[0].name}${params.lines.length > 1 ? ` +${params.lines.length - 1} more` : ""}`,
                    subtitle: `Redemption ${redemption.redemptionId}`,
                    type: "redeemed" as const,
                    points: -pointsUsed,
                    date: now.toISOString(),
                    reference: redemption.redemptionId,
                  },
                  ...s.transactions,
                ]
              : s.transactions,
            customerNotifications: [custNotification, ...s.customerNotifications],
            businessNotifications: [bizNotification, ...s.businessNotifications],
          };
        });

        eventBus.emit("reward.redeemed", { redemption, pointsUsed, customer: updatedCustomer });
        eventBus.emit("notification.created", { notification: custNotification, scope: "customer" });
        eventBus.emit("notification.created", { notification: bizNotification, scope: "business" });

        return redemption;
      },
      cancelRedemption: async (id: string) => {
        setState((s) => ({
          ...s,
          redemptions: s.redemptions.map((r) => (r.id === id ? { ...r, status: "Cancelled" as const } : r)),
        }));
      },
    }),
    [state.redemptions, state.customers, state.currentCustomerId, setState]
  );

  const campaignService = React.useMemo(
    () => ({
      getCampaigns: () => state.campaigns,
      createCampaign: async (input: Omit<Campaign, "id" | "reach" | "redemptions" | "revenue">) => {
        const campaign: Campaign = { ...input, id: `cm-${Date.now()}`, reach: 0, redemptions: 0, revenue: 0 };
        setState((s) => ({ ...s, campaigns: [campaign, ...s.campaigns] }));
        return campaign;
      },
      updateCampaign: async (id: string, patch: Partial<Campaign>) => {
        setState((s) => ({ ...s, campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
      },
    }),
    [state.campaigns, setState]
  );

  const analyticsService = React.useMemo(
    () => ({
      getSeries: (range: RangeKey) => seriesByRange[range],
      getDashboard: () => {
        const today = new Date().toDateString();
        const todaysSales = state.sales.filter((s) => new Date(s.date).toDateString() === today);
        const todayRevenue = todaysSales.reduce((s, x) => s + x.amount, 0) || 38450;
        const monthly = seriesByRange["30d"].reduce((s, d) => s + d.revenue, 0);
        const pointsIssued = state.sales.reduce((s, x) => s + x.points, 0) + 32800;
        const pointsRedeemed = state.redemptions.reduce((s, r) => s + r.pointsUsed, 0) + 16340;
        return {
          todayRevenue,
          todayOrders: todaysSales.length || 12,
          monthlyRevenue: monthly,
          customers: 2840 + Math.max(0, state.customers.length - 12),
          repeatRate: 68.4,
          pointsIssued,
          pointsRedeemed,
          avgOrder: Math.round(monthly / 168),
          redemptionRate: Math.round((pointsRedeemed / pointsIssued) * 1000) / 10,
        };
      },
    }),
    [state.sales, state.redemptions, state.customers]
  );

  const authService = React.useMemo(
    () => ({
      signIn: async (role: "customer" | "business" | "staff") => {
        setState((s) => ({ ...s, signedIn: true, role }));
      },
      signOut: () => setState((s) => ({ ...s, signedIn: false })),
      signUp: async (input: { name: string; phone: string; email: string; birthday?: string }) => {
        const customer = await customerService.createCustomer(input);
        setState((s) => ({ ...s, signedIn: true, role: "customer", currentCustomerId: customer.id, onboarded: false }));
        return customer;
      },
      completeOnboarding: () => setState((s) => ({ ...s, onboarded: true })),
    }),
    [setState, customerService]
  );

  const notificationService = React.useMemo(
    () => ({
      markRead: (id: string, scope: "customer" | "business" = "customer") => {
        setState((s) => {
          const key = scope === "customer" ? "customerNotifications" : "businessNotifications";
          return {
            ...s,
            [key]: s[key].map((n) => (n.id === id ? { ...n, read: true } : n)),
          };
        });
        eventBus.emit("notification.read", { id, scope });
      },
      markAllRead: (scope: "customer" | "business" = "customer") => {
        setState((s) => {
          const key = scope === "customer" ? "customerNotifications" : "businessNotifications";
          return {
            ...s,
            [key]: s[key].map((n) => ({ ...n, read: true })),
          };
        });
        eventBus.emit("notification.allRead", { scope });
      },
      clear: (scope: "customer" | "business" = "customer") => {
        setState((s) => ({
          ...s,
          [scope === "customer" ? "customerNotifications" : "businessNotifications"]: [],
        }));
        eventBus.emit("notification.cleared", { scope });
      },
    }),
    [setState]
  );

  const ruleService = React.useMemo(
    () => ({
      getRules: () => state.rules,
      createRule: async (input: Omit<RewardRule, "id">) => {
        const rule: RewardRule = { ...input, id: `rl-${Date.now()}` };
        setState((s) => ({ ...s, rules: [...s.rules, rule] }));
        return rule;
      },
      updateRule: async (id: string, patch: Partial<RewardRule>) => {
        setState((s) => ({ ...s, rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
      },
      toggleRule: (id: string) =>
        setState((s) => ({ ...s, rules: s.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)) })),
      deleteRule: (id: string) => setState((s) => ({ ...s, rules: s.rules.filter((r) => r.id !== id) })),
    }),
    [state.rules, setState]
  );

  const challengeService = React.useMemo(
    () => ({
      getChallenges: () => state.challenges,
      updateChallenge: async (id: string, patch: Partial<Challenge>) => {
        setState((s) => ({ ...s, challenges: s.challenges.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
      },
      createChallenge: async (input: Omit<Challenge, "id">) => {
        const challenge = { ...input, id: `ch-${Date.now()}` } as Challenge;
        setState((s) => ({ ...s, challenges: [...s.challenges, challenge] }));
        return challenge;
      },
    }),
    [state.challenges, setState]
  );

  const storeService = React.useMemo(
    () => ({
      getStores: () => state.stores,
      updateStore: async (id: string, patch: Partial<Store>) => {
        setState((s) => ({ ...s, stores: s.stores.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
      },
      createStore: async (input: Omit<Store, "id">) => {
        const store = { ...input, id: `st-${Date.now()}` } as Store;
        setState((s) => ({ ...s, stores: [...s.stores, store] }));
        return store;
      },
    }),
    [state.stores, setState]
  );

  const staffService = React.useMemo(
    () => ({
      getStaff: () => state.staff,
      updateStaff: async (id: string, patch: Partial<StaffMember>) => {
        setState((s) => ({ ...s, staff: s.staff.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
      },
      createStaff: async (input: Omit<StaffMember, "id">) => {
        const member = { ...input, id: `sf-${Date.now()}` } as StaffMember;
        setState((s) => ({ ...s, staff: [...s.staff, member] }));
        return member;
      },
    }),
    [state.staff, setState]
  );

  return {
    productService, customerService, rewardService, cartService, salesService,
    redemptionService, campaignService, analyticsService, authService, notificationService,
    ruleService, challengeService, storeService, staffService,
    business, tierProgress,
  };
}
