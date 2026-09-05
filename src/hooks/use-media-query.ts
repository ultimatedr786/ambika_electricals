"use client";

import * as React from "react";

/**
 * SSR-safe media query hook. Returns `false` on the server and during the
 * first client render, then settles synchronously after mount so we never
 * emit a hydration mismatch.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** True for viewports wide enough for a centred desktop dialog. */
export function useIsDesktopDialog(): boolean {
  return useMediaQuery("(min-width: 640px) and (min-height: 560px)");
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
