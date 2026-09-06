"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  CreditCard, Gift, Heart, Home, LogOut, PanelLeftClose, PanelLeftOpen, Receipt,
  Search, Settings, ShoppingBag, Sparkles, Trophy, UserRound, Users, Wallet,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
/** Hard-gated internal dev tool — renders null in every normal build. */
import { DemoSwitcher } from "@/components/shared/demo-switcher";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useGlobalSearchHotkey } from "@/components/shared/global-search";
const GlobalSearch = dynamic(
  () => import("@/components/shared/global-search").then((m) => m.GlobalSearch),
  { ssr: false }
);
import { NotificationCenter } from "@/components/shared/notification-center";
import { useCurrentCustomer } from "@/lib/store";
import { useServices } from "@/lib/services";
import { usePrefetchOnIntent } from "@/hooks/use-prefetch";
import { useSidebarCollapsed } from "@/hooks/use-sidebar";
import { cn, formatNumber, initials } from "@/lib/utils";

const primaryNav = [
  { href: "/customer/dashboard", label: "Home", icon: Home },
  { href: "/customer/rewards", label: "Rewards", icon: Gift },
  { href: "/customer/activity", label: "Activity", icon: Receipt },
  { href: "/customer/challenges", label: "Challenges", icon: Trophy },
  { href: "/customer/profile", label: "Profile", icon: UserRound },
];

const desktopNav = [
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

export function CustomerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const customer = useCurrentCustomer();
  const { authService, cartService } = useServices();
  const prefetch = usePrefetchOnIntent();
  const [signOutOpen, setSignOutOpen] = React.useState(false);
  const supabase = React.useMemo(() => createBrowserSupabaseClient(), []);
  const { collapsed, ready: sidebarReady, toggle: toggleSidebar } = useSidebarCollapsed();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const paletteMounted = React.useRef(false);
  if (paletteOpen) paletteMounted.current = true;
  useGlobalSearchHotkey(setPaletteOpen);

  const cartCount = cartService.count;

  const isActive = (href: string) =>
    pathname === href || (href !== "/customer/dashboard" && pathname.startsWith(href));

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] flex-col border-r bg-card lg:flex",
          sidebarReady && "motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out"
        )}
        data-collapsed={collapsed ? "true" : "false"}
      >
        <div className={cn("flex h-16 items-center", collapsed ? "justify-center px-2" : "px-5")}>
          <Link href="/customer/dashboard" className="rounded-lg" aria-label="Ambika Electricals Rewards — home">
            {collapsed ? <LogoMark size={30} /> : <Logo />}
          </Link>
        </div>
        <nav
          id="customer-sidebar-nav"
          className={cn("scroll-region flex-1 space-y-0.5 py-2", collapsed ? "px-2" : "px-3")}
          aria-label="Customer navigation"
        >
          {desktopNav.map((item) => {
            const active = isActive(item.href);
            const link = (
              <Link
                key={item.href}
                href={item.href}
                onMouseEnter={() => prefetch(item.href)}
                onFocus={() => prefetch(item.href)}
                onTouchStart={() => prefetch(item.href)}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? item.label : undefined}
                className={cn(
                  "relative flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors",
                  collapsed ? "justify-center px-0" : "gap-3 px-3",
                  active ? "text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="customer-nav-active"
                    className="absolute inset-0 rounded-lg bg-primary/8"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                {active && collapsed && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary" aria-hidden />
                )}
                <item.icon className="relative size-[18px]" aria-hidden />
                {!collapsed && <span className="relative">{item.label}</span>}
                {item.href === "/customer/rewards" && cartCount > 0 && (
                  collapsed ? (
                    <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" aria-hidden />
                  ) : (
                    <Badge className="relative ml-auto">{cartCount}</Badge>
                  )
                )}
              </Link>
            );
            return collapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              link
            );
          })}
        </nav>
        <div className={cn("space-y-1 border-t", collapsed ? "p-2" : "p-3")}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/customer/membership"
                  aria-label={`Points balance: ${formatNumber(customer.points)} points, ${customer.tier} member`}
                  className="flex flex-col items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 px-1 py-2 text-white"
                >
                  <span className="text-xs font-semibold tabular">{formatNumber(customer.points)}</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">
                {formatNumber(customer.points)} points · {customer.tier}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Link
              href="/customer/membership"
              className="block rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 p-3.5 text-white transition-transform hover:scale-[1.01]"
            >
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/60">Points balance</p>
              <p className="mt-0.5 text-2xl font-semibold tabular">{formatNumber(customer.points)}</p>
              <p className="text-[13px] text-white/70">{customer.tier} member</p>
            </Link>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-expanded={!collapsed}
                aria-controls="customer-sidebar-nav"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className={cn(
                  "flex w-full items-center rounded-lg p-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  collapsed ? "justify-center" : "gap-2.5"
                )}
              >
                {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
                {!collapsed && <span>Collapse sidebar</span>}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</TooltipContent>
          </Tooltip>
        </div>
      </aside>

      {/* Topbar */}
      <header
        className={cn(
          "sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md lg:pl-[var(--sidebar-w)]",
          sidebarReady && "motion-safe:transition-[padding] motion-safe:duration-200 motion-safe:ease-out"
        )}
      >
        <div className="safe-top flex h-14 items-center gap-2 px-4 sm:h-16 sm:px-6">
          <Link href="/customer/dashboard" className="lg:hidden"><Logo size={28} showTagline={false} /></Link>
          <button
            onClick={() => setPaletteOpen(true)}
            className="ml-auto hidden h-9 w-72 items-center gap-2 rounded-lg border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted lg:flex"
          >
            <Search className="size-4" />
            Search rewards, redemptions, pages…
            <kbd className="ml-auto rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium">
              <span className="sr-only">Keyboard shortcut: </span>
              <span aria-hidden>⌘K</span>
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-1 lg:ml-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
            >
              <Search className="size-[18px]" />
            </Button>
            <DemoSwitcher />
            <Button asChild variant="ghost" size="icon-sm" className="relative" aria-label={`Rewards basket, ${cartCount} items`}>
              <Link href="/customer/rewards/cart">
                <ShoppingBag className="size-[18px]" />
                {cartCount > 0 && (
                  <motion.span
                    key={cartCount}
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
                  >
                    {cartCount}
                  </motion.span>
                )}
              </Link>
            </Button>
            <NotificationCenter scope="customer" />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-1 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" aria-label="Account menu">
                  <Avatar className="size-8">
                    <AvatarFallback>{initials(customer.name)}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="normal-case">
                  <span className="block text-sm font-semibold text-foreground">{customer.name}</span>
                  <span className="block text-xs font-normal text-muted-foreground">{customer.membershipId}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/customer/profile"><UserRound /> Profile</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/customer/membership"><CreditCard /> Membership</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/customer/activity"><Wallet /> Points</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/customer/redemptions"><ShoppingBag /> Redemptions</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/customer/notifications"><Receipt /> Notifications</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/customer/profile"><Settings /> Settings</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/business/dashboard"><Sparkles /> Switch to business</Link></DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSignOutOpen(true)}><LogOut /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main
        className={cn(
          "lg:pl-[var(--sidebar-w)]",
          sidebarReady && "motion-safe:transition-[padding] motion-safe:duration-200 motion-safe:ease-out"
        )}
      >
        <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:pb-12">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-md lg:hidden"
        aria-label="Primary"
      >
        <ul className="safe-bottom grid grid-cols-5 pt-1.5">
          {primaryNav.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onMouseEnter={() => prefetch(item.href)}
                  onFocus={() => prefetch(item.href)}
                  onTouchStart={() => prefetch(item.href)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[52px] flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <span className="relative flex h-6 w-12 items-center justify-center">
                    {active && (
                      <motion.span
                        layoutId="customer-tab-active"
                        className="absolute inset-0 rounded-full bg-primary/10"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    )}
                    <item.icon className="relative size-[19px]" aria-hidden />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {paletteMounted.current && (
        <GlobalSearch open={paletteOpen} onOpenChange={setPaletteOpen} scope="customer" />
      )}
      <ConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Sign out of Rewardly?"
        description="You'll need to sign in again to view your points and rewards."
        confirmLabel="Sign out"
        onConfirm={() => {
          // Real session first (server-side revocation via Supabase), then the
          // mock/demo state so the prototype journey resets identically.
          void (async () => {
            try {
              if (supabase) await supabase.auth.signOut();
            } finally {
              authService.signOut();
              router.push("/login");
              router.refresh();
            }
          })();
        }}
      />
    </div>
  );
}
