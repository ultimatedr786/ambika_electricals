"use client";

/**
 * Prefetch on intent.
 *
 * `next/link` already prefetches links that scroll into view in production, but
 * the app-router prefetch for a *hovered* item is what removes the last stall
 * before a module swap: by the time the pointer travels from the sidebar item
 * to the click, the RSC payload for that route is usually already cached.
 *
 * `router.prefetch` is a no-op in dev, cheap and de-duplicated in production,
 * so we simply mark each route as prefetched once per mount and forward the
 * handlers to whatever element uses the hook.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

export function usePrefetchOnIntent() {
  const router = useRouter();
  const done = React.useRef<Set<string>>(new Set());

  return React.useCallback(
    (href: string) => {
      if (!href || href.startsWith("http") || done.current.has(href)) return;
      done.current.add(href);
      try {
        router.prefetch(href);
      } catch {
        /* prefetch is an optimisation only */
      }
    },
    [router]
  );
}

/** Spread onto a link/button to warm a route on hover, touch or keyboard focus. */
export function useIntentHandlers(href: string) {
  const prefetch = usePrefetchOnIntent();
  return React.useMemo(
    () => ({
      onMouseEnter: () => prefetch(href),
      onFocus: () => prefetch(href),
      onTouchStart: () => prefetch(href),
    }),
    [href, prefetch]
  );
}
