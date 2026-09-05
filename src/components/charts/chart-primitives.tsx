"use client";

/**
 * Every recharts import in the app lives in THIS module and nowhere else.
 *
 * Why: recharts pulls in d3-scale/d3-shape/victory-vendor and weighs ~180 kB
 * gzipped. When pages imported it at the top level it landed in the route's
 * critical JS, so `/business/dashboard`, `/business/analytics` and every route
 * rendering the customer points card paid for it before first paint.
 *
 * Consumers import the wrappers from `@/components/charts`, which `next/dynamic`
 * this file with `ssr: false`. Charts are decorative-on-arrival (the numbers
 * next to them are plain text), so deferring them costs nothing perceptually.
 *
 * Chart children must stay inside this module: recharts inspects child element
 * types (e.g. `<Area>` inside `<AreaChart>`), so wrapping individual primitives
 * in dynamic() would break rendering. We split whole charts instead.
 */

import * as React from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { SeriesPoint } from "@/lib/mock-data/analytics";
import { formatINR, formatNumber } from "@/lib/utils";

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
  fontSize: 12,
} as const;

const axis = {
  tickLine: false,
  axisLine: false,
  fontSize: 11,
  stroke: "hsl(var(--muted-foreground))",
} as const;

function Frame({ children }: { children: React.ReactElement }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      {children}
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ revenue */

export function RevenueAreaChart({ data }: { data: SeriesPoint[] }) {
  return (
    <Frame>
      <AreaChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" {...axis} interval={4} />
        <YAxis {...axis} tickFormatter={(v) => `₹${Math.round(Number(v) / 1000)}k`} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatINR(Number(v)), "Revenue"]} />
        <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#rev)" />
      </AreaChart>
    </Frame>
  );
}

/* ------------------------------------------------- points issued vs redeemed */

export function PointsBarChart({
  data,
  compact,
}: {
  data: Array<{ label: string; issued: number; redeemed: number }>;
  compact?: boolean;
}) {
  return (
    <Frame>
      <BarChart data={data} margin={{ top: 6, right: 8, left: compact ? -18 : -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} width={compact ? undefined : 50} tickFormatter={(v) => formatNumber(Number(v))} />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))" }}
          contentStyle={tooltipStyle}
          formatter={(v, n) => [formatNumber(Number(v)), String(n)]}
        />
        <Legend wrapperStyle={{ fontSize: compact ? 11 : 12 }} />
        <Bar dataKey="issued" name="Issued" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        <Bar dataKey="redeemed" name="Redeemed" fill="#f5b409" radius={[4, 4, 0, 0]} />
      </BarChart>
    </Frame>
  );
}

/* -------------------------------------------------------------- tier donut */

export function TierPieChart({
  data,
  palette,
  innerRadius = 48,
  outerRadius = 72,
}: {
  data: Array<{ tier: string; customers: number }>;
  palette: string[];
  innerRadius?: number;
  outerRadius?: number;
}) {
  return (
    <Frame>
      <PieChart>
        <Pie
          data={data}
          dataKey="customers"
          nameKey="tier"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={palette[i % palette.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, n) => [`${formatNumber(Number(v))} members`, String(n)]}
        />
      </PieChart>
    </Frame>
  );
}

/* ------------------------------------------------------- analytics metric */

export function MetricAreaChart({
  data,
  metric,
}: {
  data: SeriesPoint[];
  metric: "revenue" | "orders" | "customers";
}) {
  return (
    <Frame>
      <AreaChart data={data} margin={{ left: -12, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="an-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3182f6" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#3182f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="label" {...axis} />
        <YAxis
          {...axis}
          width={60}
          tickFormatter={(v) => (metric === "revenue" ? `₹${Math.round(Number(v) / 1000)}k` : formatNumber(Number(v)))}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => [metric === "revenue" ? formatINR(Number(v)) : formatNumber(Number(v)), metric]}
        />
        <Area type="monotone" dataKey={metric} stroke="#3182f6" strokeWidth={2} fill="url(#an-grad)" />
      </AreaChart>
    </Frame>
  );
}

/* --------------------------------------------------------- customer growth */

export function CustomerLineChart({ data }: { data: SeriesPoint[] }) {
  return (
    <Frame>
      <LineChart data={data} margin={{ left: -18, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} width={44} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => [`${formatNumber(Number(v))} customers`, "Customers"]}
        />
        <Line type="monotone" dataKey="customers" stroke="#3182f6" strokeWidth={2} dot={false} />
      </LineChart>
    </Frame>
  );
}

/* ------------------------------------------------------- points balance mini */

export function PointsTrendChart({ data }: { data: Array<{ month: string; points: number }> }) {
  return (
    <Frame>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="pts" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="month" {...axis} />
        <Tooltip
          cursor={{ stroke: "hsl(var(--border))" }}
          contentStyle={tooltipStyle}
          formatter={(v) => [`${formatNumber(Number(v))} pts`, "Balance"]}
        />
        <Area type="monotone" dataKey="points" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#pts)" />
      </AreaChart>
    </Frame>
  );
}
