"use client";

import * as React from "react";

/**
 * PWA install/offline provider (MVP hotfix §"Fix PWA install prompt persistence").
 *
 * ONE provider owns all install state for the whole app: a single
 * `beforeinstallprompt` listener, a single `appinstalled` listener and a single
 * banner. Nothing else in the tree may listen for those events, which is what
 * previously allowed duplicate banners.
 *
 * Dismissal contract
 * ------------------
 *   • "Not now"  → 30-day cooldown  (localStorage, survives refresh + routing)
 *   • close "X"  → 90-day cooldown  (localStorage, survives refresh + routing)
 *   • either one → suppressed for the rest of the session (sessionStorage), so
 *     it can never reappear during the same visit even if the browser re-fires
 *     `beforeinstallprompt` on a new navigation.
 *   • installed / running standalone / unsupported / no install event
 *     → never shown at all.
 *
 * Because Next.js App Router keeps this provider mounted across route changes
 * and the cooldown is read from storage on mount, the dismissal also survives a
 * full browser refresh and module/route switches.
 *
 * Install stays reachable afterwards through {@link useInstallApp} — a subtle
 * Settings/Help action — instead of a repeating popup.
 *
 * Online/offline state is tracked here too but kept deliberately SEPARATE from
 * install state: going offline never resurrects the install banner.
 */

const SNOOZE_KEY = "rewardly:pwa:snooze-until";
const INSTALLED_KEY = "rewardly:pwa:installed";
const SESSION_KEY = "rewardly:pwa:session-dismissed";

export const SNOOZE_DAYS = { later: 30, close: 90 } as const;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Let the user look around before offering anything. */
const FIRST_SHOW_DELAY_MS = 6000;

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable" | "ios-guide";

interface PwaContextValue {
  /** A real install prompt is held, or iOS manual install is possible. */
  canInstall: boolean;
  /** Already installed (or launched standalone). */
  isInstalled: boolean;
  isStandalone: boolean;
  isIos: boolean;
  isOffline: boolean;
  /** True while the one-and-only banner should be on screen. */
  bannerVisible: boolean;
  /** Triggers the native prompt (or the iOS guide). Safe to call from Settings. */
  promptInstall: () => Promise<InstallOutcome>;
  /** "Not now" → 30 days. */
  snoozeLater: () => void;
  /** Close X → 90 days. */
  dismissLong: () => void;
  showIosGuide: boolean;
  setShowIosGuide: (v: boolean) => void;
}

const PwaContext = React.createContext<PwaContextValue | null>(null);

function readSnoozedUntil(): number {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY);
    if (!raw) return 0;
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeSnooze(days: number) {
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + days * DAY_MS));
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* private mode — session state below still suppresses the banner */
  }
}

function isSuppressed(): boolean {
  try {
    if (window.sessionStorage.getItem(SESSION_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return readSnoozedUntil() > Date.now();
}

function detectStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const deferredRef = React.useRef<BeforeInstallPromptEvent | null>(null);
  const [hasPrompt, setHasPrompt] = React.useState(false);
  const [isInstalled, setIsInstalled] = React.useState(false);
  const [isStandalone, setIsStandalone] = React.useState(false);
  const [isIos, setIsIos] = React.useState(false);
  const [isOffline, setIsOffline] = React.useState(false);
  const [suppressed, setSuppressed] = React.useState(true);
  const [delayElapsed, setDelayElapsed] = React.useState(false);
  const [showIosGuide, setShowIosGuide] = React.useState(false);

  React.useEffect(() => {
    const standalone = detectStandalone();
    setIsStandalone(standalone);

    let installedFlag = false;
    try {
      installedFlag = window.localStorage.getItem(INSTALLED_KEY) === "1";
    } catch {
      /* ignore */
    }
    setIsInstalled(standalone || installedFlag);
    setSuppressed(isSuppressed());

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIos(/iphone|ipad|ipod/.test(ua) && !/crios|fxios/.test(ua));

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
      setHasPrompt(true);
    };
    const onInstalled = () => {
      deferredRef.current = null;
      setHasPrompt(false);
      setIsInstalled(true);
      try {
        window.localStorage.setItem(INSTALLED_KEY, "1");
      } catch {
        /* ignore */
      }
    };
    const onDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) onInstalled();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const standaloneMql = window.matchMedia("(display-mode: standalone)");
    standaloneMql.addEventListener("change", onDisplayModeChange);

    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    setIsOffline(!navigator.onLine);

    const timer = window.setTimeout(() => setDelayElapsed(true), FIRST_SHOW_DELAY_MS);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      standaloneMql.removeEventListener("change", onDisplayModeChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearTimeout(timer);
    };
  }, []);

  // iOS Safari never fires `beforeinstallprompt`; the manual Add-to-Home-Screen
  // route is the only install path there.
  const canInstall = (hasPrompt || (isIos && !isStandalone)) && !isInstalled;
  const bannerVisible = canInstall && !suppressed && delayElapsed;

  const promptInstall = React.useCallback(async (): Promise<InstallOutcome> => {
    const deferred = deferredRef.current;
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      deferredRef.current = null;
      setHasPrompt(false);
      if (choice.outcome === "accepted") {
        setIsInstalled(true);
        try {
          window.localStorage.setItem(INSTALLED_KEY, "1");
        } catch {
          /* ignore */
        }
      } else {
        // A declined native prompt counts as "not now".
        writeSnooze(SNOOZE_DAYS.later);
        setSuppressed(true);
      }
      return choice.outcome;
    }
    if (isIos && !isStandalone) {
      setShowIosGuide(true);
      return "ios-guide";
    }
    return "unavailable";
  }, [isIos, isStandalone]);

  const snoozeLater = React.useCallback(() => {
    writeSnooze(SNOOZE_DAYS.later);
    setSuppressed(true);
    setShowIosGuide(false);
  }, []);

  const dismissLong = React.useCallback(() => {
    writeSnooze(SNOOZE_DAYS.close);
    setSuppressed(true);
    setShowIosGuide(false);
  }, []);

  const value = React.useMemo<PwaContextValue>(
    () => ({
      canInstall,
      isInstalled,
      isStandalone,
      isIos,
      isOffline,
      bannerVisible,
      promptInstall,
      snoozeLater,
      dismissLong,
      showIosGuide,
      setShowIosGuide,
    }),
    [
      canInstall, isInstalled, isStandalone, isIos, isOffline, bannerVisible,
      promptInstall, snoozeLater, dismissLong, showIosGuide,
    ]
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa(): PwaContextValue {
  const ctx = React.useContext(PwaContext);
  if (!ctx) throw new Error("usePwa must be used inside PwaProvider");
  return ctx;
}

/** Convenience hook for the Settings/Help "Install app" action. */
export function useInstallApp() {
  const { canInstall, isInstalled, promptInstall, isIos } = usePwa();
  return { canInstall, isInstalled, promptInstall, isIos };
}
