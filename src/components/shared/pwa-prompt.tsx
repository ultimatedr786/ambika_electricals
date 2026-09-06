"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Download, Share, WifiOff, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwa } from "@/components/shared/pwa-provider";

/**
 * The single install banner + offline indicator + iOS guide.
 *
 * All state lives in `PwaProvider`; this component is pure presentation, which
 * is what guarantees there is exactly one banner and one listener set no matter
 * how the app is routed. Mounted once, in `Providers`.
 *
 * Service-worker registration also lives here (production only) so the update
 * toast is not duplicated per route.
 */
export function PwaPrompt() {
  const {
    bannerVisible, isOffline, isIos, showIosGuide, setShowIosGuide,
    promptInstall, snoozeLater, dismissLong,
  } = usePwa();
  const wasOffline = React.useRef(false);

  /* --------------------------------------------- service worker lifecycle */
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              toast.info("A new version of Rewardly is ready.", {
                action: { label: "Refresh", onClick: () => window.location.reload() },
              });
            }
          });
        });
      })
      .catch((err) => console.warn("[PWA] Service worker registration failed:", err));
  }, []);

  /* ------------------------------------------------ connectivity feedback */
  React.useEffect(() => {
    if (isOffline) {
      wasOffline.current = true;
      toast.warning("You are currently offline", {
        id: "pwa-offline",
        description: "Saved cards and balance are still available locally.",
      });
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      toast.success("Back online", { id: "pwa-online", description: "Your connection has been restored." });
    }
  }, [isOffline]);

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") toast.success("Rewardly installed successfully!");
  };

  return (
    <>
      {isOffline && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-md"
        >
          <WifiOff className="size-3.5" />
          <span>Offline mode — Working with saved local session</span>
        </div>
      )}

      <AnimatePresence>
        {bannerVisible && (
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
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  Install the app for instant counter access and offline membership QR.
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <Button size="sm" className="h-7 px-2.5 text-xs" onClick={handleInstall}>
                    <Download className="mr-1 size-3" /> Install
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={snoozeLater}
                  >
                    Not now
                  </Button>
                </div>
              </div>
              <button
                onClick={dismissLong}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close install prompt"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showIosGuide && isIos && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
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
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
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
