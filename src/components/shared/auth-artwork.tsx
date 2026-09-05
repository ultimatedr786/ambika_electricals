"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { AuthVisualFallback } from "@/components/shared/auth-visual-fallback";

/**
 * Chooses between the static "Quiet Power" artwork and the animated 3D scene.
 *
 * The 3D scene is only requested when the device can comfortably run it, and
 * it is always loaded through `next/dynamic` so three.js never enters the auth
 * form's critical bundle. Until it resolves — and forever, on constrained
 * devices — the static SVG is shown, so the panel never flashes empty.
 */
const AuthVisual3D = dynamic(() => import("@/components/shared/auth-visual").then((m) => m.AuthVisual), {
  ssr: false,
  loading: () => null,
});

function isCapableDevice(): boolean {
  if (typeof window === "undefined") return false;

  // Honour reduced motion and small/coarse-pointer devices: static artwork.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (!window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches) return false;

  // Low-end hardware hints.
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return false;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory > 0 && nav.deviceMemory < 4) return false;
  if (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency < 4) {
    return false;
  }

  // WebGL support probe.
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return false;
  } catch {
    return false;
  }

  return true;
}

export function AuthArtwork({ className }: { className?: string }) {
  const [enable3D, setEnable3D] = React.useState(false);

  React.useEffect(() => {
    // Defer the capability check and the chunk request until the form is
    // interactive, so the artwork never competes for the first paint.
    const schedule =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback
        : (cb: () => void) => window.setTimeout(cb, 200);
    const handle = schedule(() => setEnable3D(isCapableDevice()));
    return () => {
      if (typeof window.cancelIdleCallback === "function" && typeof handle === "number") {
        window.cancelIdleCallback(handle);
      }
    };
  }, []);

  return (
    <div className={className} aria-hidden="true">
      <AuthVisualFallback className="absolute inset-0" />
      {enable3D && <AuthVisual3D />}
    </div>
  );
}
