"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BadgePercent, BarChart3, CreditCard, Gift, Heart, Home, LayoutGrid, Loader2, Megaphone,
  Package, Plus, Receipt, Settings, ShoppingBag, ShoppingCart, Store, Trophy, UserRound,
  Users, type LucideIcon,
} from "lucide-react";
import {
  CommandDialog, CommandGroup, CommandInput, CommandItem, CommandList,
  CommandSeparator, CommandShortcut,
} from "@/components/ui/command";
import { useStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { searchWorkspace, type SearchHit, type SearchScope } from "@/lib/search/search-actions";
import { formatINR, formatNumber } from "@/lib/utils";

/**
 * Global search (MVP hotfix §"Complete Global Search").
 *
 * One palette serves both the business and customer applications:
 *   • ⌘K on macOS / Ctrl+K elsewhere (wired by `useGlobalSearchHotkey`).
 *   • Groups: Pages · Customers · Products · Sales/Invoices · Rewards.
 *   • Keyboard navigation, Enter-to-open, Escape-to-close and focus restore all
 *     come from cmdk + the Radix dialog underneath it; pointer use works too.
 *   • 180 ms debounce, explicit loading / empty / no-permission states.
 *
 * Authorization: pages are filtered by `hiddenHrefs` (owner-only sections are
 * hidden for managers/staff, mirroring the nav and the server guards). Record
 * results NEVER come from a client-side copy of production data — with
 * Supabase configured the palette calls the `searchWorkspace` server action,
 * which re-derives identity from the session and re-scopes every query. Mock
 * data is searched only in the demo fallback (Supabase unconfigured).
 */

const DEBOUNCE_MS = 180;

const businessPages: { href: string; label: string; icon: LucideIcon }[] = [
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

const customerPages: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/customer/dashboard", label: "Home", icon: Home },
  { href: "/customer/rewards", label: "Rewards Store", icon: Gift },
  { href: "/customer/redemptions", label: "My Redemptions", icon: ShoppingBag },
  { href: "/customer/activity", label: "Activity", icon: Receipt },
  { href: "/customer/challenges", label: "Challenges", icon: Trophy },
  { href: "/customer/wishlist", label: "Wishlist", icon: Heart },
  { href: "/customer/referrals", label: "Referrals", icon: Users },
  { href: "/customer/membership", label: "Membership", icon: CreditCard },
  { href: "/customer/profile", label: "Profile", icon: UserRound },
];

const GROUP_META: Record<SearchHit["group"], { heading: string; icon: LucideIcon }> = {
  customers: { heading: "Customers", icon: Users },
  products: { heading: "Products", icon: Package },
  sales: { heading: "Sales & invoices", icon: ShoppingCart },
  rewards: { heading: "Rewards", icon: Gift },
};

const GROUP_ORDER: SearchHit["group"][] = ["customers", "products", "sales", "rewards"];

export function GlobalSearch({
  open,
  onOpenChange,
  scope = "business",
  hiddenHrefs = [],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scope?: SearchScope;
  /** Role-restricted destinations (owner-only sections) hidden for managers/staff. */
  hiddenHrefs?: string[];
}) {
  const router = useRouter();
  const { state } = useStore();
  const [q, setQ] = React.useState("");
  const [term, setTerm] = React.useState("");
  const [serverHits, setServerHits] = React.useState<SearchHit[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const serverMode = isSupabaseConfigured();

  const pages = React.useMemo(
    () => (scope === "business" ? businessPages : customerPages).filter((p) => !hiddenHrefs.includes(p.href)),
    [scope, hiddenHrefs]
  );

  /* ------------------------------------------------------------ debounce */
  React.useEffect(() => {
    const handle = window.setTimeout(() => setTerm(q.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [q]);

  /* ------------------------------------------- server search (real mode) */
  React.useEffect(() => {
    if (!serverMode || !open) return;
    if (term.length < 2) {
      setServerHits(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    searchWorkspace(term, scope)
      .then((res) => {
        if (cancelled) return;
        setServerHits(res.hits);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [term, scope, serverMode, open]);

  /* ------------------------------------------------- mock search (demo) */
  const mockHits = React.useMemo<SearchHit[]>(() => {
    if (serverMode || term.length < 1) return [];
    const t = term.toLowerCase();
    const hits: SearchHit[] = [];

    if (scope === "business") {
      for (const c of state.customers
        .filter((c) => `${c.name} ${c.membershipId} ${c.phone}`.toLowerCase().includes(t))
        .slice(0, 5)) {
        hits.push({
          id: `customer:${c.id}`,
          group: "customers",
          title: c.name,
          subtitle: `${c.membershipId} · ${c.tier} · ${formatNumber(c.points)} pts`,
          href: `/business/customers/${c.id}`,
        });
      }
      for (const p of state.products
        .filter((p) => `${p.name} ${p.brand} ${p.sku}`.toLowerCase().includes(t))
        .slice(0, 5)) {
        hits.push({
          id: `product:${p.id}`,
          group: "products",
          title: p.name,
          subtitle: `${p.brand} · ${formatINR(p.price)} · ${p.sku}`,
          href: "/business/products",
        });
      }
      for (const s of state.sales
        .filter((s) => `${s.invoice} ${s.customerName}`.toLowerCase().includes(t))
        .slice(0, 4)) {
        hits.push({
          id: `sale:${s.id}`,
          group: "sales",
          title: s.invoice,
          subtitle: `${s.customerName} · ${formatINR(s.amount)}`,
          href: "/business/sales",
        });
      }
      for (const r of state.rewards.filter((r) => r.name.toLowerCase().includes(t)).slice(0, 4)) {
        hits.push({
          id: `reward:${r.id}`,
          group: "rewards",
          title: r.name,
          subtitle: `${formatNumber(r.points)} points`,
          href: "/business/rewards",
        });
      }
      return hits;
    }

    // Customer scope: the member's own rewards, redemptions and purchases.
    const me = state.currentCustomerId;
    for (const r of state.rewards.filter((r) => r.name.toLowerCase().includes(t)).slice(0, 5)) {
      hits.push({
        id: `reward:${r.id}`,
        group: "rewards",
        title: r.name,
        subtitle: `${formatNumber(r.points)} points`,
        href: `/customer/rewards/${r.id}`,
      });
    }
    for (const rd of state.redemptions
      .filter((rd) => rd.customerId === me && `${rd.redemptionId} ${rd.code}`.toLowerCase().includes(t))
      .slice(0, 4)) {
      hits.push({
        id: `redemption:${rd.id}`,
        group: "sales",
        title: rd.redemptionId,
        subtitle: `${formatNumber(rd.pointsUsed)} points · ${rd.status}`,
        href: "/customer/redemptions",
      });
    }
    for (const s of state.sales
      .filter((s) => s.customerId === me && s.invoice.toLowerCase().includes(t))
      .slice(0, 4)) {
      hits.push({
        id: `sale:${s.id}`,
        group: "sales",
        title: s.invoice,
        subtitle: `${formatINR(s.amount)} · ${formatNumber(s.points)} pts`,
        href: "/customer/activity",
      });
    }
    return hits;
  }, [serverMode, term, scope, state]);

  const hits = serverMode ? serverHits ?? [] : mockHits;
  const grouped = React.useMemo(() => {
    const map = new Map<SearchHit["group"], SearchHit[]>();
    for (const hit of hits) {
      const list = map.get(hit.group);
      if (list) list.push(hit);
      else map.set(hit.group, [hit]);
    }
    return map;
  }, [hits]);

  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    setTerm("");
    setServerHits(null);
    router.push(href);
  };

  const searching = term.length >= 2;
  const showEmpty = searching && !loading && !failed && hits.length === 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setQ("");
          setTerm("");
          setServerHits(null);
          setFailed(false);
        }
      }}
      // cmdk filters by `value`; our results are already ranked server-side.
      shouldFilter={false}
    >
      <CommandInput
        placeholder={
          scope === "business"
            ? "Search pages, customers, products, invoices, rewards…"
            : "Search pages, rewards, redemptions, purchases…"
        }
        value={q}
        onValueChange={setQ}
        aria-label="Global search"
      />
      <CommandList>
        {loading && (
          <div
            className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden /> Searching…
          </div>
        )}

        {failed && (
          <div className="px-4 py-6 text-sm text-muted-foreground" role="status">
            Search is unavailable right now. Pages below still work.
          </div>
        )}

        {showEmpty && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
            No matches for &ldquo;{term}&rdquo;. Try a name, SKU, invoice number or membership ID.
          </div>
        )}

        {GROUP_ORDER.map((group) => {
          const items = grouped.get(group);
          if (!items || items.length === 0) return null;
          const Meta = GROUP_META[group];
          return (
            <CommandGroup key={group} heading={Meta.heading}>
              {items.map((hit) => (
                <CommandItem key={hit.id} value={hit.id} onSelect={() => go(hit.href)}>
                  <Meta.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{hit.title}</span>
                    {hit.subtitle && (
                      <span className="truncate text-xs text-muted-foreground">{hit.subtitle}</span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}

        {hits.length > 0 && <CommandSeparator />}

        <CommandGroup heading="Pages">
          {pages
            .filter((p) => !searching || p.label.toLowerCase().includes(term.toLowerCase()))
            .map((p) => (
              <CommandItem key={p.href} value={`page:${p.href}`} onSelect={() => go(p.href)}>
                <p.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                {p.label}
                {p.href === "/business/sales/new" && <CommandShortcut>Primary</CommandShortcut>}
              </CommandItem>
            ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/**
 * ⌘K (macOS) / Ctrl+K (Windows, Linux) toggle. Ignores the shortcut while the
 * user is typing in another dialog's field only when that field opts out with
 * `data-no-palette`, so normal inputs still surrender the shortcut.
 */
export function useGlobalSearchHotkey(setOpen: React.Dispatch<React.SetStateAction<boolean>>) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey) || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-no-palette]")) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setOpen]);
}
