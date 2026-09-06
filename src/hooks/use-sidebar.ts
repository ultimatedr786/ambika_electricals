"use client";

import * as React from "react";

/**
 * Desktop sidebar collapse preference (MVP hotfix §"Premium scrollbars and
 * collapsible sidebar").
 *
 * Persistence contract
 * --------------------
 * The preference is written to `localStorage` under {@link SIDEBAR_STORAGE_KEY}
 * and *also* mirrored onto `<html class="sidebar-collapsed">` by the blocking
 * inline script in the root layout. The layout widths are driven purely by the
 * `--sidebar-w` CSS variable that class flips, so a collapsed user gets the
 * collapsed rail on the very first paint after a refresh — no flash, and no
 * hydration mismatch (the server HTML never contains the class; the script
 * adds it to <html> before React hydrates).
 *
 * Touch layouts are untouched: the rail only exists at `lg` and above, and the
 * mobile drawer / bottom navigation never read this preference.
 */
export const SIDEBAR_STORAGE_KEY = "rewardly:sidebar-collapsed";
const COLLAPSED_CLASS = "sidebar-collapsed";

/** Inline, render-blocking snippet injected in <head> to avoid a layout flash. */
export const SIDEBAR_BOOT_SCRIPT = `(function(){try{if(localStorage.getItem('${SIDEBAR_STORAGE_KEY}')==='1'){document.documentElement.classList.add('${COLLAPSED_CLASS}')}}catch(e){}})();`;

export interface SidebarState {
  /** True when the desktop rail is collapsed to icons. */
  collapsed: boolean;
  /** True once the client has read the persisted preference (enables transitions). */
  ready: boolean;
  toggle: () => void;
  setCollapsed: (next: boolean) => void;
}

export function useSidebarCollapsed(): SidebarState {
  const [collapsed, setCollapsedState] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setCollapsedState(document.documentElement.classList.contains(COLLAPSED_CLASS));
    setReady(true);

    // Keep every open tab/window in sync with the stored preference.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SIDEBAR_STORAGE_KEY) return;
      const next = e.newValue === "1";
      document.documentElement.classList.toggle(COLLAPSED_CLASS, next);
      setCollapsedState(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setCollapsed = React.useCallback((next: boolean) => {
    setCollapsedState(next);
    document.documentElement.classList.toggle(COLLAPSED_CLASS, next);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* private mode — the preference is best-effort */
    }
  }, []);

  const toggle = React.useCallback(() => {
    setCollapsed(!document.documentElement.classList.contains(COLLAPSED_CLASS));
  }, [setCollapsed]);

  return { collapsed, ready, toggle, setCollapsed };
}
