"use client";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  hint,
  index = 0,
  className,
}: {
  label: string;
  value: string;
  delta?: number;
  icon?: React.ElementType;
  hint?: string;
  index?: number;
  className?: string;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className={cn("p-4 transition-shadow hover:shadow-md sm:p-5", className)}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          {Icon && (
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/8 text-primary">
              <Icon className="size-4" aria-hidden />
            </span>
          )}
        </div>
        <p className="mt-2 text-[22px] font-semibold tracking-tight tabular sm:text-2xl">{value}</p>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          {typeof delta === "number" && (
            <span className={cn("inline-flex items-center gap-0.5 font-medium", up ? "text-success" : "text-destructive")}>
              {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
              {Math.abs(delta)}%
            </span>
          )}
          {hint && <span className="truncate text-muted-foreground">{hint}</span>}
        </div>
      </Card>
    </motion.div>
  );
}
