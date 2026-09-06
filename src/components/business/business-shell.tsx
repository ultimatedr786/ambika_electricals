"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  BadgePercent, BarChart3, Building2, CreditCard, Gift, HelpCircle, LayoutGrid,
  LogOut, Megaphone, MoreHorizontal, Package, PanelLeftClose, PanelLeftOpen, Plus,
  Search, Settings, ShoppingCart, Store, Trophy, UserRound, Users, Zap,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
/**
 * Internal developer persona switcher. The component hard-gates itself
 * (`isDemoDevToolsEnabled()`), so in every normal build — demo or production —
 * it renders nothing and Demo Mode is absent from the product chrome.
 */
import { DemoSwitcher } from "@/components/shared/demo-switcher";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useGlobalSearchHotkey } from "@/components/shared/global-search";
/**
 * cmdk + the palette's icon set are only needed once the user actually opens
 * search (⌘K / the header button), so the chunk is fetched on first open
 * instead of shipping with every business route.
 */
const GlobalSearch = dynamic(
  () => import("@/components/shared/global-search").then((m) => m.GlobalSearch),
  { ssr: false }
);
import { NotificationCenter } from "@/components/business/notification-center";
import { useServices } from "@/lib/services";
import { usePrefetchOnIntent } from "@/hooks/use-prefetch";
import { useSidebarCollapsed } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";

const nav = [
  { group: "Overview", items: [
    { href: "/business/dashboard", label: "Dashboard", icon: LayoutGrid },
    { href: "/business/analytics", label: "Analytics", icon: BarChart3 },
  ]},
  { group: "Operations", items: [
    { href: "/business/sales", label: "Sales", icon: ShoppingCart },
    { href: "/business/customers", label: "Customers", icon: Users },
    { href: "/business/products", label: "Products", icon: Package },
  ]},
  { group: "Loyalty", items: [
    { href: "/business/rewards", label: "Rewards", icon: Gift },
    { href: "/business/rules", label: "Reward Rules", icon: BadgePercent },
    { href: "/business/campaigns", label: "Campaigns", icon: Megaphone },
    { href: "/business/challenges", label: "Challenges", icon: Trophy },
  ]},
  { group: "Business", items: [
    { href: "/business/stores", label: "Stores", icon: Store },
    { href: "/business/staff", label: "Staff", icon: UserRound },
    { href: "/business/settings", label: "Settings", icon: Settings },
  ]},
];

const mobileNav = [
  { href: "/business/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/business/sales", label: "Sales", icon: ShoppingCart },
  { href: "/business/customers", label: "Customers", icon: Users },
];

export type LiveBusinessRole = "owner" | "manager" | "staff" | "super_admin";

/** Owner-only sections — hidden from managers/staff in nav, palette and routes. */
const OWNER_ONLY_HREFS = ["/business/staff", "/business/settings"];

export function BusinessShell({
  children,
  liveRole = null,
}: {
  children: React.ReactNode;
  /** Real Supabase membership role (null in Demo mode → full prototype nav). */
  liveRole?: LiveBusinessRole | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { authService } = useServices();
  const prefetch = usePrefetchOnIntent();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  // Keep the palette mounted after its first open so re-opening is instant.
  const paletteMounted = React.useRef(false);
  if (paletteOpen) paletteMounted.current = true;
  const [signOutOpen, setSignOutOpen] = React.useState(false);
  const supabase = React.useMemo(() => createBrowserSupabaseClient(), []);
  const { collapsed, ready: sidebarReady, toggle: toggleSidebar } = useSidebarCollapsed();
  const ownerRestricted = liveRole !== null && liveRole !== "owner" && liveRole !== "super_admin";
  const visibleNav = React.useMemo(() => {
    if (!ownerRestricted) return nav;
    return nav
      .map((g) => ({ ...g, items: g.items.filter((i) => !OWNER_ONLY_HREFS.includes(i.href)) }))
      .filter((g) => g.items.length > 0);
  }, [ownerRestricted]);
  const [moreOpen, setMoreOpen] = React.useState(false);

  useGlobalSearchHotkey(setPaletteOpen);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="min-h-[100dvh] bg-muted/30">
      {/* Sidebar — width is driven by the --sidebar-w CSS variable so the
          persisted collapse preference applies on the first paint. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] flex-col border-r bg-card lg:flex",
          sidebarReady && "motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out"
        )}
        data-collapsed={collapsed ? "true" : "false"}
      >
        <div className={cn("flex h-16 items-center", collapsed ? "justify-center px-2" : "px-5")}>
          <Link href="/business/dashboard" className="rounded-lg" aria-label="Ambika Electricals Rewards — dashboard">
            {collapsed ? <LogoMark size={30} /> : <Logo />}
          </Link>
        </div>
        <div className={cn("pb-2", collapsed ? "px-2" : "px-3")}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild size="icon" className="w-full">
                  <Link href="/business/sales/new" aria-label="New sale"><Plus /></Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">New sale</TooltipContent>
            </Tooltip>
          ) : (
            <Button asChild className="w-full"><Link href="/business/sales/new"><Plus /> New Sale</Link></Button>
          )}
        </div>
        <nav className={cn("scroll-region flex-1 py-2", collapsed ? "px-2" : "px-3")} aria-label="Business navigation" id="business-sidebar-nav">
          {visibleNav.map((group) => (
            <div key={group.group} className="mb-3">
              {collapsed ? (
                <div className="mx-2 mb-1.5 h-px bg-border" role="presentation" />
              ) : (
                <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.group}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
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
                        "relative flex items-center rounded-lg py-2 text-sm font-medium transition-colors",
                        collapsed ? "justify-center px-0" : "gap-3 px-3",
                        active ? "text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="biz-nav-active"
                          className="absolute inset-0 rounded-lg bg-primary/8"
                          transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        />
                      )}
                      {/* Collapsed rail keeps an unmistakable active-route marker. */}
                      {active && collapsed && (
                        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary" aria-hidden />
                      )}
                      <item.icon className="relative size-[18px]" aria-hidden />
                      {!collapsed && <span className="relative">{item.label}</span>}
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
              </div>
            </div>
          ))}
        </nav>
        <div className={cn("space-y-1 border-t", collapsed ? "p-2" : "p-3")}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/customer/dashboard"
                  aria-label="View customer app"
                  className="flex items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Zap className="size-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">View customer app</TooltipContent>
            </Tooltip>
          ) : (
            <Link href="/customer/dashboard" className="flex items-center gap-2.5 rounded-lg p-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Zap className="size-4" /> View customer app
            </Link>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-expanded={!collapsed}
                aria-controls="business-sidebar-nav"
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
          <Link href="/business/dashboard" className="lg:hidden"><Logo size={28} showTagline={false} /></Link>

          <button
            onClick={() => setPaletteOpen(true)}
            className="ml-auto hidden h-9 w-72 items-center gap-2 rounded-lg border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted lg:flex"
          >
            <Search className="size-4" />
            Search customers, products, sales…
            <kbd className="ml-auto rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium">
              <span className="sr-only">Keyboard shortcut: </span>
              <span aria-hidden>⌘K</span>
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1 lg:ml-2">
            <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setPaletteOpen(true)} aria-label="Search">
              <Search className="size-[18px]" />
            </Button>
            <DemoSwitcher />
            <NotificationCenter />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Help" onClick={() => toast("Need a hand?", { description: "Call Ambika Electricals support on +91 98250 41200, Mon–Sat 9:30am–8:30pm." })}>
                  <HelpCircle className="size-[18px]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Call support: +91 98250 41200</TooltipContent>
            </Tooltip>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-1 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" aria-label="Account menu">
                  <Avatar className="size-8"><AvatarFallback>NT</AvatarFallback></Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="normal-case">
                  <span className="block text-sm font-semibold text-foreground">Nitin Trivedi</span>
                  <span className="block text-xs font-normal text-muted-foreground">Owner · Ambika Electricals</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/business/settings"><UserRound /> Profile</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/business/settings"><Building2 /> Business settings</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/business/staff"><Users /> Staff</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/business/stores"><Store /> Stores</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/customer/dashboard"><CreditCard /> Customer app</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
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
        <div className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:pb-10">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-md lg:hidden" aria-label="Primary">
        <ul className="safe-bottom grid grid-cols-4 pt-1.5">
          {mobileNav.map((item) => {
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
                    "flex min-h-[52px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <span className="relative flex h-6 w-12 items-center justify-center">
                    {active && (
                      <motion.span layoutId="biz-tab-active" className="absolute inset-0 rounded-full bg-primary/10" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                    )}
                    <item.icon className="relative size-[19px]" aria-hidden />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <button className="flex min-h-[52px] w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <span className="flex h-6 w-12 items-center justify-center"><MoreHorizontal className="size-[19px]" /></span>
                  More
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[86dvh]">
                <SheetHeader><SheetTitle>All sections</SheetTitle></SheetHeader>
                <SheetBody className="pb-8">
                  {visibleNav.map((g) => (
                    <div key={g.group} className="mb-4">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.group}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {g.items.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onMouseEnter={() => prefetch(item.href)}
                            onFocus={() => prefetch(item.href)}
                            onTouchStart={() => prefetch(item.href)}
                            onClick={() => setMoreOpen(false)}
                            className="flex min-h-[48px] items-center gap-2.5 rounded-lg border px-3 text-sm font-medium"
                          >
                            <item.icon className="size-4 text-muted-foreground" /> {item.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                  <Separator className="my-3" />
                  <Link href="/customer/dashboard" onClick={() => setMoreOpen(false)} className="flex min-h-[48px] items-center gap-2.5 rounded-lg border px-3 text-sm font-medium">
                    <Zap className="size-4 text-muted-foreground" /> View customer app
                  </Link>
                </SheetBody>
              </SheetContent>
            </Sheet>
          </li>
        </ul>
      </nav>

      {/* Mobile primary action */}
      {!pathname.startsWith("/business/sales/new") && (
        <Button
          asChild
          size="icon"
          className="fixed bottom-[74px] right-4 z-30 size-14 rounded-full shadow-lg lg:hidden"
        >
          <Link href="/business/sales/new" aria-label="New sale"><Plus className="!size-6" /></Link>
        </Button>
      )}

      {paletteMounted.current && (
        <GlobalSearch
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          scope="business"
          hiddenHrefs={ownerRestricted ? OWNER_ONLY_HREFS : []}
        />
      )}
      <ConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Sign out of Rewardly?"
        description="You'll be returned to the sign-in screen."
        confirmLabel="Sign out"
        onConfirm={() => {
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
