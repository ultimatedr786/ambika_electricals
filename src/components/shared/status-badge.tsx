import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tone: Record<string, "default" | "success" | "warning" | "destructive" | "muted" | "secondary"> = {
  Active: "success",
  Completed: "success",
  "In Stock": "success",
  Confirmed: "default",
  "Ready for Pickup": "default",
  Pending: "warning",
  "Low Stock": "warning",
  Scheduled: "warning",
  Invited: "warning",
  Draft: "muted",
  Inactive: "muted",
  Paused: "muted",
  Ended: "muted",
  Expired: "destructive",
  Cancelled: "destructive",
  Refunded: "destructive",
  "Out of Stock": "destructive",
  Disabled: "destructive",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={tone[status] ?? "secondary"} className={cn("gap-1.5", className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {status}
    </Badge>
  );
}
