"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BadgePercent, BarChart3, Gift, LayoutGrid, Megaphone, Package, Plus, Settings,
  ShoppingCart, Store, Trophy, UserRound, Users,
} from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut,
} from "@/components/ui/command";
import { useStore } from "@/lib/store";
import { formatINR, formatNumber } from "@/lib/utils";

const pages = [
  { href: "/business/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/business/sales", label: "Sales", icon: ShoppingCart },
  { href: "/business/sales/new", label: "New Sale", icon: Plus },
  { href: "/business/customers", label: "Customers", icon: Users },
  { href: "/business/products", label: "Products", icon: Package },
  { href: "/business/rewards", label: "Rewards", icon: Gift },
  { href: "/business/rules", label: "Reward Rules", icon: BadgePercent },
  { href: "/business/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/business/challenges", label: "Challenges", icon: Trophy },
  { href: "/business/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/business/stores", label: "Stores", icon: Store },
  { href: "/business/staff", label: "Staff", icon: UserRound },
  { href: "/business/settings", label: "Settings", icon: Settings },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { state } = useStore();
  const [q, setQ] = React.useState("");

  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };

  const term = q.trim().toLowerCase();
  const customers = term ? state.customers.filter((c) => `${c.name} ${c.membershipId} ${c.phone}`.toLowerCase().includes(term)).slice(0, 5) : [];
  const products = term ? state.products.filter((p) => `${p.name} ${p.brand} ${p.sku}`.toLowerCase().includes(term)).slice(0, 5) : [];
  const sales = term ? state.sales.filter((s) => `${s.invoice} ${s.customerName}`.toLowerCase().includes(term)).slice(0, 4) : [];
  const rewards = term ? state.rewards.filter((r) => r.name.toLowerCase().includes(term)).slice(0, 4) : [];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search customers, products, sales, rewards…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>No results found. Try &ldquo;LED&rdquo;, &ldquo;Rahul&rdquo; or &ldquo;MCB&rdquo;.</CommandEmpty>

        {customers.length > 0 && (
          <CommandGroup heading="Customers">
            {customers.map((c) => (
              <CommandItem key={c.id} value={`cust-${c.name}-${c.membershipId}`} onSelect={() => go(`/business/customers/${c.id}`)}>
                <Users className="size-4 text-muted-foreground" />
                <span className="flex flex-col">
                  <span>{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.membershipId} · {c.tier} · {formatNumber(c.points)} pts</span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {products.length > 0 && (
          <CommandGroup heading="Products">
            {products.map((p) => (
              <CommandItem key={p.id} value={`prod-${p.name}-${p.sku}`} onSelect={() => go("/business/products")}>
                <Package className="size-4 text-muted-foreground" />
                <span className="flex flex-col">
                  <span>{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.brand} · {formatINR(p.price)} · {p.sku}</span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {sales.length > 0 && (
          <CommandGroup heading="Sales">
            {sales.map((s) => (
              <CommandItem key={s.id} value={`sale-${s.invoice}-${s.customerName}`} onSelect={() => go("/business/sales")}>
                <ShoppingCart className="size-4 text-muted-foreground" />
                <span className="flex flex-col">
                  <span>{s.invoice}</span>
                  <span className="text-xs text-muted-foreground">{s.customerName} · {formatINR(s.amount)}</span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {rewards.length > 0 && (
          <CommandGroup heading="Rewards">
            {rewards.map((r) => (
              <CommandItem key={r.id} value={`rew-${r.name}`} onSelect={() => go("/business/rewards")}>
                <Gift className="size-4 text-muted-foreground" />
                <span className="flex flex-col">
                  <span>{r.name}</span>
                  <span className="text-xs text-muted-foreground">{formatNumber(r.points)} points</span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Pages">
          {pages.map((p) => (
            <CommandItem key={p.href} value={`page-${p.label}`} onSelect={() => go(p.href)}>
              <p.icon className="size-4 text-muted-foreground" />
              {p.label}
              {p.href === "/business/sales/new" && <CommandShortcut>Primary</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
