"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Deterministic decorative QR-style matrix. This is a MOCK visual only —
 * it does not encode any real or sensitive data.
 */
function matrix(seed: string, size = 25) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rnd = () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const inFinder = (r: number, c: number) =>
    (r < 8 && c < 8) || (r < 8 && c >= size - 8) || (r >= size - 8 && c < 8);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (inFinder(r, c)) continue;
      grid[r][c] = rnd() > 0.52;
    }
  }
  const finder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 7; c++) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[r0 + r][c0 + c] = edge || core;
      }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  return grid;
}

export function QRCode({ value, className, size = 25 }: { value: string; className?: string; size?: number }) {
  const grid = React.useMemo(() => matrix(value, size), [value, size]);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={cn("h-full w-full", className)}
      role="img"
      aria-label="Mock membership QR code"
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="white" />
      {grid.map((row, r) =>
        row.map((on, c) =>
          on ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#0b1220" /> : null
        )
      )}
    </svg>
  );
}
