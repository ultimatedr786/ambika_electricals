"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  BadgePercent, BarChart3, Building2, CreditCard, Gift, HelpCircle, LayoutGrid,
  LogOut, Megaphone, MoreHorizontal, Package, Plus, Search, Settings, ShoppingCart,
  Store, Trophy, UserRound, Users, Zap,
} from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DemoSwitcher } from "@/components/shared/demo-switcher";
import { CommandPalette } from "@/components/business/command-palette";
import { NotificationCenter } from "@/components/business/notification-center";
import { useServices } from "@/lib/services";
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

export function BusinessShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { authService } = useServices();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [signOutOpen, setSignOutOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="min-h-[100dvh] bg-muted/30">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r bg-card lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/business/dashboard" className="rounded-lg"><Logo /></Link>
        </div>
        <div className="px-3 pb-2">
          <Button asChild className="w-full"><Link href="/business/sales/new"><Plus /> New Sale</Link></Button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Business navigation">
          {nav.map((group) => (
            <div key={group.group} className="mb-3">
              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.group}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
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
                      <item.icon className="relative size-[18px]" aria-hidden />
                      <span className="relative">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t p-3">
          <Link href="/customer/dashboard" className="flex items-center gap-2.5 rounded-lg p-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Zap className="size-4" /> View customer app
          </Link>
        </div>
      </aside>

      {/* Topbar */}
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md lg:pl-[248px]">
        <div className="safe-top flex h-14 items-center gap-2 px-4 sm:h-16 sm:px-6">
          <Link href="/business/dashboard" className="lg:hidden"><Logo size={28} showTagline={false} /></Link>

          <button
            onClick={() => setPaletteOpen(true)}
            className="ml-auto hidden h-9 w-72 items-center gap-2 rounded-lg border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted lg:flex"
          >
            <Search className="size-4" />
            Search customers, products, sales…
            <kbd className="ml-auto rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
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

      <main className="lg:pl-[248px]">
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
              <SheetContent side="bottom">
                <SheetHeader><SheetTitle>All sections</SheetTitle></SheetHeader>
                <div className="px-5 pb-8">
                  {nav.map((g) => (
                    <div key={g.group} className="mb-4">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.group}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {g.items.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
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
                </div>
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

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Sign out of Rewardly?"
        description="You'll be returned to the sign-in screen."
        confirmLabel="Sign out"
        onConfirm={() => { authService.signOut(); router.push("/login"); }}
      />
    </div>
  );
}
