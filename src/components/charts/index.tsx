"use client";

/**
 * Lazy chart surface.
 *
 * Each export loads `chart-primitives` (the single recharts entry point) on
 * demand with `ssr: false`, so recharts never enters a route's first-load JS.
 * While the chunk is in flight we render a calm, correctly sized placeholder —
 * a plain tinted block, not a spinner or a fake progress animation — so the
 * card never changes height when the real chart arrives.
 */

import * as React from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

export function ChartPlaceholder({ className }: { className?: string }) {
  return (
    <div
      role="presentation"
      className={cn("size-full rounded-lg bg-muted/50 motion-safe:animate-pulse", className)}
    />
  );
}

const loading = () => <ChartPlaceholder />;

export const RevenueAreaChart = dynamic(
  () => import("./chart-primitives").then((m) => m.RevenueAreaChart),
  { ssr: false, loading }
);

export const PointsBarChart = dynamic(
  () => import("./chart-primitives").then((m) => m.PointsBarChart),
  { ssr: false, loading }
);

export const TierPieChart = dynamic(
  () => import("./chart-primitives").then((m) => m.TierPieChart),
  { ssr: false, loading: () => <ChartPlaceholder className="rounded-full" /> }
);

export const MetricAreaChart = dynamic(
  () => import("./chart-primitives").then((m) => m.MetricAreaChart),
  { ssr: false, loading }
);

export const CustomerLineChart = dynamic(
  () => import("./chart-primitives").then((m) => m.CustomerLineChart),
  { ssr: false, loading }
);

export const PointsTrendChart = dynamic(
  () => import("./chart-primitives").then((m) => m.PointsTrendChart),
  { ssr: false, loading }
);
