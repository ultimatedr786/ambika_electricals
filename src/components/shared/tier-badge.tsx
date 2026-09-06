import type { LucideIcon } from "lucide-react";
import { Crown, Gem, Medal, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tier } from "@/types";

/**
 * Tier tones. The light-mode text shades are deliberately two steps darker
 * than the obvious choice: amber-600 on an amber tint measured 2.93:1, well
 * under WCAG AA for 12px semibold text, and the tier badge appears on almost
 * every customer-facing screen. Verified by scripts/audit/a11y-perf.mjs.
 */
const map: Record<Tier, { icon: LucideIcon; className: string }> = {
  Bronze: { icon: Shield, className: "bg-amber-700/10 text-amber-900 dark:text-amber-500" },
  Silver: { icon: Medal, className: "bg-slate-400/15 text-slate-700 dark:text-slate-300" },
  Gold: { icon: Crown, className: "bg-amber-400/15 text-amber-800 dark:text-amber-400" },
  Platinum: { icon: Gem, className: "bg-indigo-400/15 text-indigo-700 dark:text-indigo-300" },
};

export function TierBadge({ tier, className, showIcon = true }: { tier: Tier; className?: string; showIcon?: boolean }) {
  const { icon: Icon, className: tone } = map[tier];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
        tone,
        className
      )}
    >
      {showIcon && <Icon className="size-3.5" aria-hidden />}
      {tier}
    </span>
  );
}
