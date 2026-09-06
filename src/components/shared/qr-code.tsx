"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Deterministic decorative QR-style matrix. This is a MOCK visual only —
 * it does not encode any real or sensitive data. It exists for the prototype
 * screens that show demo membership cards and demo redemption codes.
 *
 * The real, scannable code lives in `ScannableQR` at the bottom of this file
 * and is used exclusively for the short-lived opaque checkout token.
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

/* ------------------------------------------------------------------ */
/* Real, scannable QR                                                  */
/* ------------------------------------------------------------------ */

/**
 * A genuinely scannable QR code, rendered as crisp SVG.
 *
 * Used for the short-lived opaque checkout token only — never for a
 * membership number, name, phone or anything else identifying. The payload is
 * a bearer capability that dies in ~90 seconds or on first scan, so what ends
 * up in a stranger's camera roll is worthless.
 *
 * Encoding notes: the token's alphabet (uppercase Crockford base-32 plus the
 * two dots) is entirely inside QR alphanumeric mode, so a 48-character token
 * fits a version-3 symbol at error-correction level M — big modules, easy to
 * read off a phone screen at counter distance. The quiet zone is part of the
 * spec, not decoration: without it many scanners simply never lock on.
 */
export function ScannableQR({
  value,
  className,
  label = "Membership checkout QR code",
}: {
  value: string;
  className?: string;
  /** Accessible name. Must never contain the payload. */
  label?: string;
}) {
  const [matrix, setMatrix] = React.useState<boolean[][] | null>(null);
  const [failed, setFailed] = React.useState(false);

  // Encoded off the render path: the encoder is ~15 KB and only customers who
  // actually open their code should ever download or run it.
  React.useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void import("uqr")
      .then(({ encode }) => {
        if (cancelled) return;
        const result = encode(value, { ecc: "M", border: 0 });
        setMatrix(result.data.map((row) => Array.from(row, (cell) => !!cell)));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (failed) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center rounded-md bg-muted p-3 text-center text-[11px] text-muted-foreground",
          className
        )}
        role="status"
      >
        Couldn&apos;t draw the QR — read the code out instead.
      </div>
    );
  }

  if (!matrix) {
    return (
      <div
        className={cn("h-full w-full animate-pulse rounded-md bg-muted", className)}
        aria-hidden
      />
    );
  }

  const modules = matrix.length;
  const QUIET = 4; // modules — required by the spec for reliable acquisition
  const span = modules + QUIET * 2;

  return (
    <svg
      viewBox={`0 0 ${span} ${span}`}
      className={cn("h-full w-full", className)}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={span} height={span} fill="#ffffff" />
      {matrix.map((row, r) =>
        row.map((on, c) =>
          on ? (
            <rect key={`${r}-${c}`} x={c + QUIET} y={r + QUIET} width={1} height={1} fill="#0b1220" />
          ) : null
        )
      )}
    </svg>
  );
}
