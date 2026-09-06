"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Bell, CheckCheck, CloudOff, Gift, Megaphone, Package, RefreshCw, ShieldAlert, Users, Wifi, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationCenter as MockNotificationCenter } from "@/components/shared/notification-center";
import {
  useLiveNotifications,
  type ConnectionState,
  type LiveNotification,
  type NotificationAudience,
} from "@/lib/notifications/use-live-notifications";
import { cn, relativeTime } from "@/lib/utils";

/**
 * Live notification centre (Step 3 Slice 7).
 *
 * Renders the database-backed bell when Supabase is configured, and falls back
 * to the prototype's local one when it is not — demo mode keeps working
 * exactly as before.
 *
 * The connection state is shown as a quiet line in the header rather than a
 * toast: a flaky counter Wi-Fi should be visible, not noisy (§5 "without
 * alert spam").
 */

const ICONS: Record<LiveNotification["category"], { icon: LucideIcon; color: string; bg: string }> = {
  points: { icon: Zap, color: "text-sky-500", bg: "bg-sky-500/10" },
  reward: { icon: Gift, color: "text-amber-500", bg: "bg-amber-500/10" },
  stock: { icon: Package, color: "text-orange-500", bg: "bg-orange-500/10" },
  staff: { icon: Users, color: "text-indigo-500", bg: "bg-indigo-500/10" },
  rule: { icon: Megaphone, color: "text-purple-500", bg: "bg-purple-500/10" },
  security: { icon: ShieldAlert, color: "text-destructive", bg: "bg-destructive/10" },
  system: { icon: Package, color: "text-slate-500", bg: "bg-slate-500/10" },
};

const CONNECTION_COPY: Record<ConnectionState, { label: string; icon: LucideIcon; tone: string } | null> = {
  live: null, // the happy path says nothing
  connecting: { label: "Connecting…", icon: RefreshCw, tone: "text-muted-foreground" },
  reconnecting: { label: "Reconnecting…", icon: RefreshCw, tone: "text-amber-600 dark:text-amber-500" },
  offline: { label: "Offline — showing the last update", icon: CloudOff, tone: "text-muted-foreground" },
  disabled: null,
};

/** Where a notification takes you when tapped. */
function hrefFor(n: LiveNotification): string | null {
  if (n.audience === "customer") {
    if (n.category === "points") return "/customer/activity";
    if (n.category === "reward") return "/customer/redemptions";
    return null;
  }
  if (n.category === "reward") return "/business/rewards";
  if (n.category === "stock") return "/business/products";
  if (n.category === "staff") return "/business/staff";
  if (n.category === "rule") return "/business/settings";
  if (n.category === "points") return "/business/sales";
  return null;
}

export function LiveNotificationCenter({ audience }: { audience: NotificationAudience }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const { items, unreadCount, connection, loading, enabled, markRead, markAllRead, refresh } =
    useLiveNotifications(audience);

  // Demo mode / unconfigured deployment: the prototype bell is the whole
  // experience, unchanged.
  if (!enabled) {
    return <MockNotificationCenter scope={audience} />;
  }

  const status = CONNECTION_COPY[connection];

  const onItemClick = (n: LiveNotification) => {
    void markRead(n.id);
    const href = hrefFor(n);
    setOpen(false);
    if (href) router.push(href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          aria-label={`Notifications, ${unreadCount} unread`}
        >
          <Bell className="size-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground ring-2 ring-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[360px] p-0 shadow-xl" sideOffset={8}>
        <div className="flex items-center justify-between p-3.5 pb-2.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold tracking-tight">Notifications</p>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-medium">
                {unreadCount} new
              </Badge>
            )}
            {connection === "live" && (
              <span
                className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                title="Live updates are connected"
              >
                <Wifi className="size-3" aria-hidden /> Live
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => void markAllRead()}
            >
              <CheckCheck className="mr-1 size-3.5" /> Mark read
            </Button>
          )}
        </div>

        {status && (
          <div
            className={cn("flex items-center gap-1.5 px-3.5 pb-2 text-[11px]", status.tone)}
            role="status"
            aria-live="polite"
          >
            <status.icon
              className={cn("size-3", connection === "reconnecting" && "animate-spin")}
              aria-hidden
            />
            {status.label}
            {connection === "offline" && (
              <button type="button" className="ml-auto underline" onClick={() => void refresh()}>
                Retry
              </button>
            )}
          </div>
        )}

        <Separator />

        <div className="scroll-region max-h-[min(380px,60dvh)] space-y-1 p-1.5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
              Loading notifications…
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center">
              <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Bell className="size-5" />
              </div>
              <p className="mt-2.5 text-xs font-medium text-foreground">All caught up!</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {audience === "customer"
                  ? "Points, rewards and membership updates will appear here."
                  : "Sales, stock, team and security events will appear here."}
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {items.map((n) => {
                const conf = ICONS[n.category] ?? ICONS.system;
                const Icon = conf.icon;
                return (
                  <motion.button
                    key={n.id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => onItemClick(n)}
                    className={cn(
                      "group relative flex w-full items-start gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-accent",
                      !n.read ? "bg-accent/40" : "opacity-85"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                        conf.bg,
                        conf.color
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-1">
                        <span
                          className={cn(
                            "line-clamp-1 text-[13px]",
                            !n.read ? "font-semibold text-foreground" : "font-medium text-foreground/90"
                          )}
                        >
                          {n.title}
                        </span>
                        {!n.read && (
                          <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                        )}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-1 block text-[11px] text-muted-foreground/80">
                        {relativeTime(n.createdAt)}
                      </span>
                    </span>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {audience === "customer" && (
          <>
            <Separator />
            <div className="p-1.5 text-center">
              <Link
                href="/customer/notifications"
                onClick={() => setOpen(false)}
                className="block rounded-md py-1 text-xs font-medium text-primary hover:bg-muted"
              >
                View all notifications →
              </Link>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
