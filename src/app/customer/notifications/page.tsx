"use client";

import type { LucideIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CheckCheck, Gift, Megaphone, Package, ShieldAlert, Trash2, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { cn, relativeTime } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { useLiveNotifications, type LiveNotification } from "@/lib/notifications/use-live-notifications";

const icons: Record<string, LucideIcon> = {
  points: Zap,
  reward: Gift,
  tier: Package,
  campaign: Megaphone,
  system: Bell,
};

const liveIcons: Record<LiveNotification["category"], LucideIcon> = {
  points: Zap,
  reward: Gift,
  stock: Package,
  staff: Users,
  rule: Megaphone,
  security: ShieldAlert,
  system: Bell,
};

interface Row {
  id: string;
  icon: LucideIcon;
  title: string;
  body: string;
  date: string;
  read: boolean;
}

export default function NotificationsPage() {
  const configured = isSupabaseConfigured();
  const { state } = useStore();
  const { notificationService } = useServices();
  const live = useLiveNotifications("customer");

  const items: Row[] = configured
    ? live.items.map((n) => ({
        id: n.id,
        icon: liveIcons[n.category] ?? Bell,
        title: n.title,
        body: n.body ?? "",
        date: n.createdAt,
        read: n.read,
      }))
    : state.customerNotifications.map((n) => ({
        id: n.id,
        icon: icons[n.kind] ?? Bell,
        title: n.title,
        body: n.body,
        date: n.date,
        read: n.read,
      }));
  const unread = items.filter((n) => !n.read).length;

  const markRead = (id: string) => (configured ? live.markRead(id) : notificationService.markRead(id));
  const markAllRead = () => (configured ? live.markAllRead() : notificationService.markAllRead());

  return (
    <div className="space-y-4 flex-1 min-h-0 flex flex-col">
      <div className="shrink-0">
        <PageHeader
          title="Notifications"
          description={unread ? `${unread} unread` : "You're all caught up."}
          actions={
            items.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={() => void markAllRead()}>
                  <CheckCheck /> Mark all as read
                </Button>
                {!configured && (
                  <Button variant="ghost" size="sm" onClick={() => notificationService.clear()}>
                    <Trash2 /> Clear
                  </Button>
                )}
              </>
            )
          }
        />
      </div>

      {configured && live.loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          Loading notifications…
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Bell} title="Nothing here yet" description="Updates about your points and rewards will appear here." />
      ) : (
        <div className="space-y-2 flex-1 min-h-0 overflow-y-auto scroll-region p-1">
          <AnimatePresence initial={false}>
            {items.map((n) => {
              const Icon = n.icon;
              return (
                <motion.div key={n.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -16 }}>
                  <Card
                    role="button"
                    tabIndex={0}
                    onClick={() => void markRead(n.id)}
                    onKeyDown={(e) => e.key === "Enter" && markRead(n.id)}
                    className={cn(
                      "flex cursor-pointer gap-3.5 p-4 transition-colors hover:bg-accent/40",
                      !n.read && "border-primary/25 bg-accent/30"
                    )}
                  >
                    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", !n.read ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground")}>
                      <Icon className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="mt-0.5 text-[13px] text-muted-foreground">{n.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{relativeTime(n.date)}</p>
                    </div>
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
