"use client";

import type { LucideIcon } from "lucide-react";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  CheckCheck,
  Gift,
  Megaphone,
  Package,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { cn, relativeTime } from "@/lib/utils";
import type { AppNotification } from "@/types";

const icons: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  points: { icon: Zap, color: "text-sky-500", bg: "bg-sky-500/10" },
  reward: { icon: Gift, color: "text-amber-500", bg: "bg-amber-500/10" },
  tier: { icon: TrendingUp, color: "text-purple-500", bg: "bg-purple-500/10" },
  campaign: { icon: Megaphone, color: "text-indigo-500", bg: "bg-indigo-500/10" },
  system: { icon: Package, color: "text-slate-500", bg: "bg-slate-500/10" },
};

export function NotificationCenter({ scope = "customer" }: { scope?: "customer" | "business" }) {
  const router = useRouter();
  const { state } = useStore();
  const { notificationService } = useServices();
  const [open, setOpen] = React.useState(false);

  const items = scope === "customer" ? state.customerNotifications : state.businessNotifications;
  const unreadCount = items.filter((n) => !n.read).length;

  const handleItemClick = (n: AppNotification) => {
    notificationService.markRead(n.id, scope);
    setOpen(false);

    // Optional navigation based on notification kind and scope
    if (scope === "customer") {
      if (n.kind === "points") router.push("/customer/activity");
      else if (n.kind === "reward") router.push("/customer/redemptions");
      else if (n.kind === "tier") router.push("/customer/membership");
      else if (n.kind === "campaign") router.push("/customer/rewards");
    } else {
      if (n.kind === "points") router.push("/business/sales");
      else if (n.kind === "reward") router.push("/business/rewards");
      else if (n.kind === "campaign") router.push("/business/campaigns");
      else if (n.kind === "tier") router.push("/business/customers");
    }
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
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 pb-2.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold tracking-tight">Notifications</p>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-medium">
                {unreadCount} new
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => notificationService.markAllRead(scope)}
              >
                <CheckCheck className="mr-1 size-3.5" /> Mark read
              </Button>
            )}
            {items.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => notificationService.clear(scope)}
                aria-label="Clear all notifications"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
        <Separator />

        {/* List */}
        <div className="scroll-region max-h-[min(380px,60dvh)] space-y-1 p-1.5">
          {items.length === 0 ? (
            <div className="py-10 text-center">
              <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Bell className="size-5" />
              </div>
              <p className="mt-2.5 text-xs font-medium text-foreground">All caught up!</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                New points, sales, and reward updates will appear here.
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {items.map((n) => {
                const conf = icons[n.kind] || icons.system;
                const IconComponent = conf.icon;
                return (
                  <motion.button
                    key={n.id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => handleItemClick(n)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-accent group relative",
                      !n.read ? "bg-accent/40 font-normal" : "opacity-85"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg mt-0.5",
                        conf.bg,
                        conf.color
                      )}
                    >
                      <IconComponent className="size-4" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-1">
                        <span className={cn("text-[13px] line-clamp-1", !n.read ? "font-semibold text-foreground" : "font-medium text-foreground/90")}>
                          {n.title}
                        </span>
                        {!n.read && (
                          <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                        {n.body}
                      </span>
                      <span className="mt-1 block text-[11px] text-muted-foreground/80">
                        {relativeTime(n.date)}
                      </span>
                    </span>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Footer link to full customer notifications page if customer */}
        {scope === "customer" && (
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
