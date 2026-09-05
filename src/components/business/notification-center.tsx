"use client";

import { Bell, CheckCheck, Megaphone, Package, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { cn, relativeTime } from "@/lib/utils";

const icons: Record<string, React.ElementType> = {
  system: Package,
  campaign: Megaphone,
  tier: TrendingUp,
  points: TrendingUp,
  reward: Megaphone,
};

export function NotificationCenter() {
  const { state } = useStore();
  const { notificationService } = useServices();
  const items = state.businessNotifications;
  const unread = items.filter((n) => !n.read).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={`Notifications, ${unread} unread`}>
          <Bell className="size-[18px]" />
          {unread > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-destructive ring-2 ring-background" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between p-3.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={() => notificationService.markAllRead("business")}>
              <CheckCheck /> Mark all read
            </Button>
          )}
        </div>
        <Separator />
        <div className="max-h-80 overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nothing here yet</p>
          ) : (
            items.map((n) => {
              const Icon = icons[n.kind] ?? Bell;
              return (
                <button
                  key={n.id}
                  onClick={() => notificationService.markRead(n.id, "business")}
                  className={cn("flex w-full gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-accent", !n.read && "bg-accent/40")}
                >
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", !n.read ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground")}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">{n.title}</span>
                    <span className="block text-xs text-muted-foreground">{n.body}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">{relativeTime(n.date)}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
