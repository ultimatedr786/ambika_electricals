"use client";

import type { LucideIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CheckCheck, Gift, Sparkles, Trash2, TrendingUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { cn, relativeTime } from "@/lib/utils";

const icons: Record<string, LucideIcon> = {
  points: Zap,
  reward: Gift,
  tier: TrendingUp,
  campaign: Sparkles,
  system: Bell,
};

export default function NotificationsPage() {
  const { state } = useStore();
  const { notificationService } = useServices();
  const items = state.customerNotifications;
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up."}
        actions={
          items.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={() => notificationService.markAllRead()}>
                <CheckCheck /> Mark all as read
              </Button>
              <Button variant="ghost" size="sm" onClick={() => notificationService.clear()}>
                <Trash2 /> Clear
              </Button>
            </>
          )
        }
      />

      {items.length === 0 ? (
        <EmptyState icon={Bell} title="Nothing here yet" description="Updates about your points and rewards will appear here." />
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {items.map((n) => {
              const Icon = icons[n.kind] ?? Bell;
              return (
                <motion.div key={n.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -16 }}>
                  <Card
                    role="button"
                    tabIndex={0}
                    onClick={() => notificationService.markRead(n.id)}
                    onKeyDown={(e) => e.key === "Enter" && notificationService.markRead(n.id)}
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
