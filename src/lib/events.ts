"use client";

import type { AppNotification, Challenge, Customer, Product, Redemption, Sale } from "@/types";

export type AppEventMap = {
  "sale.completed": { sale: Sale; points: number; customer: Customer };
  "reward.redeemed": { redemption: Redemption; pointsUsed: number; customer: Customer };
  "notification.created": { notification: AppNotification; scope: "customer" | "business" };
  "notification.read": { id: string; scope: "customer" | "business" };
  "notification.allRead": { scope: "customer" | "business" };
  "notification.cleared": { scope: "customer" | "business" };
  "customer.created": { customer: Customer };
  "customer.updated": { customer: Customer };
  "product.created": { product: Product };
  "product.updated": { product: Product };
  "challenge.completed": { challenge: Challenge };
  "store.reset": void;
};

export type AppEventName = keyof AppEventMap;
export type AppEventHandler<K extends AppEventName> = (payload: AppEventMap[K]) => void;

class EventBus {
  private listeners: Map<AppEventName, Set<AppEventHandler<AppEventName>>> = new Map();

  on<K extends AppEventName>(event: K, handler: AppEventHandler<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(handler as AppEventHandler<AppEventName>);
    return () => this.off(event, handler);
  }

  off<K extends AppEventName>(event: K, handler: AppEventHandler<K>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(handler as AppEventHandler<AppEventName>);
    }
  }

  emit<K extends AppEventName>(event: K, payload: AppEventMap[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((handler) => {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[EventBus] Error in handler for event "${event}":`, err);
        }
      });
    }
  }
}

export const eventBus = new EventBus();
