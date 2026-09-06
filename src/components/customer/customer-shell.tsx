"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CreditCard, Gift, Heart, Home, LogOut, Receipt, Settings, ShoppingBag,
  Sparkles, Trophy, UserRound, Users, Wallet,
} from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DemoSwitcher } from "@/components/shared/demo-switcher";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isDemoAuthEnabled } from "@/lib/auth/env";
import { NotificationCenter } from "@/components/shared/notification-center";
import { useCurrentCustomer } from "@/lib/store";
import { useServices } from "@/lib/services";
import { usePrefetchOnIntent } from "@/hooks/use-prefetch";
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
  const demoEnabled = isDemoAuthEnabled();

  const cartCount = cartService.count;

  const isActive = (href: string) =>
    pathname === href || (href !== "/customer/dashboard" && pathname.startsWith(href));

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r bg-card lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/customer/dashboard" className="rounded-lg"><Logo /></Link>
        </div>
        <nav className="scroll-region flex-1 space-y-0.5 px-3 py-2" aria-label="Customer navigation">
          {desktopNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onMouseEnter={() => prefetch(item.href)}
                onFocus={() => prefetch(item.href)}
                onTouchStart={() => prefetch(item.href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
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
                <item.icon className="relative size-[18px]" aria-hidden />
                <span className="relative">{item.label}</span>
                {item.href === "/customer/rewards" && cartCount > 0 && (
                  <Badge className="relative ml-auto">{cartCount}</Badge>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <Link
            href="/customer/membership"
            className="block rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 p-3.5 text-white transition-transform hover:scale-[1.01]"
          >
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/60">Points balance</p>
            <p className="mt-0.5 text-2xl font-semibold tabular">{formatNumber(customer.points)}</p>
            <p className="text-[13px] text-white/70">{customer.tier} member</p>
          </Link>
        </div>
      </aside>

      {/* Topbar */}
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md lg:pl-[248px]">
        <div className="safe-top flex h-14 items-center gap-2 px-4 sm:h-16 sm:px-6">
          <Link href="/customer/dashboard" className="lg:hidden"><Logo size={28} showTagline={false} /></Link>
          <div className="ml-auto flex items-center gap-1">
            {demoEnabled && <DemoSwitcher />}
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

      <main className="lg:pl-[248px]">
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
