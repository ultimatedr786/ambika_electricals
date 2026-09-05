"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Download, Share, WifiOff, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const STORAGE_KEY = "ambika_pwa_install_dismissed";

export function PwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = React.useState(false);
  const [isIos, setIsIos] = React.useState(false);
  const [showIosGuide, setShowIosGuide] = React.useState(false);
  const [isOffline, setIsOffline] = React.useState(false);

  // Register Service Worker & Listen for Install Event
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Service Worker registration
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          reg.addEventListener("updatefound", () => {
            const installing = reg.installing;
            if (installing) {
              installing.addEventListener("statechange", () => {
                if (installing.state === "installed" && navigator.serviceWorker.controller) {
                  toast.info("A new version of Rewardly is ready.", {
                    action: {
                      label: "Refresh",
                      onClick: () => window.location.reload(),
                    },
                  });
                }
              });
            }
          });
        })
        .catch((err) => console.warn("[PWA] Service worker registration failed:", err));
    }

    // 2. Check if already dismissed or already standalone
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    const dismissed = localStorage.getItem(STORAGE_KEY) === "true";

    // Detect iOS
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua) && !/crios|fxios/.test(ua);
    setIsIos(isIosDevice);

    // 3. Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!dismissed && !isStandalone) {
        setShowPrompt(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 4. Online/Offline status listeners
    const handleOnline = () => {
      setIsOffline(false);
      toast.success("Back online", { description: "Your connection has been restored." });
    };

    const handleOffline = () => {
      setIsOffline(true);
      toast.warning("You are currently offline", {
        description: "Saved cards and balance are still available locally.",
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (!navigator.onLine) {
      setIsOffline(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      setShowPrompt(false);
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        toast.success("Rewardly installed successfully!");
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowIosGuide(true);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIosGuide(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      {/* Offline banner at the top if disconnected */}
      {isOffline && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-md transition-transform"
        >
          <WifiOff className="size-3.5" />
          <span>Offline mode — Working with saved local session</span>
        </div>
      )}

      {/* Non-intrusive Install Banner (Bottom-right on desktop / bottom on mobile) */}
      <AnimatePresence>
        {showPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.25 }}
            className="fixed bottom-20 right-4 z-40 max-w-sm rounded-xl border bg-card/95 p-3.5 shadow-xl backdrop-blur-md sm:bottom-6 sm:right-6"
            role="region"
            aria-label="Install application prompt"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Zap className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">Install Ambika Rewards</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                  Install the app for instant counter access and offline membership QR.
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <Button size="sm" className="h-7 text-xs px-2.5" onClick={handleInstallClick}>
                    <Download className="mr-1 size-3" /> Install
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-muted-foreground" onClick={handleDismiss}>
                    Not now
                  </Button>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground rounded p-1"
                aria-label="Close install prompt"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Add to Home Screen Instructions modal */}
      <AnimatePresence>
        {showIosGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
          >
            <motion.div
              initial={{ y: 50 }}
              animate={{ y: 0 }}
              exit={{ y: 50 }}
              className="w-full max-w-sm rounded-2xl border bg-card p-5 text-center shadow-2xl"
            >
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Share className="size-6" />
              </div>
              <h3 className="mt-3 text-base font-semibold">Install on iOS</h3>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                1. Tap the <strong className="text-foreground">Share</strong> icon in your Safari toolbar.
                <br />
                2. Scroll down and select <strong className="text-foreground">Add to Home Screen</strong>.
              </p>
              <Button size="sm" className="mt-4 w-full" onClick={() => setShowIosGuide(false)}>
                Got it
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
