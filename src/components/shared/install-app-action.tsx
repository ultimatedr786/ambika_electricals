"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallApp } from "@/components/shared/pwa-provider";

/**
 * The subtle, always-available install entry point (MVP hotfix §"Fix PWA
 * install prompt persistence": "Keep install available later through a subtle
 * Settings/Help action, not a repeated popup").
 *
 * Renders a quiet, honest state in every case: installed, installable, or
 * not supported by this browser.
 */
export function InstallAppAction({ className }: { className?: string }) {
  const { canInstall, isInstalled, promptInstall, isIos } = useInstallApp();

  if (isInstalled) {
    return (
      <div className={className}>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Check className="size-4 text-success" aria-hidden /> App installed
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Rewardly is installed on this device. Launch it from your home screen or app list.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="flex items-center gap-2 text-sm font-medium">
        <Smartphone className="size-4 text-muted-foreground" aria-hidden /> Install the app
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {canInstall
          ? isIos
            ? "Add Rewardly to your iOS home screen for instant counter access and the offline membership QR."
            : "Install Rewardly for instant counter access and the offline membership QR."
          : "This browser can't install the app right now. Open Rewardly in Chrome, Edge or Safari on your device to install it."}
      </p>
      <Button
        size="sm"
        variant="outline"
        className="mt-2.5"
        disabled={!canInstall}
        onClick={async () => {
          const outcome = await promptInstall();
          if (outcome === "accepted") toast.success("Rewardly installed successfully!");
          if (outcome === "unavailable") toast.info("Install isn't available in this browser.");
        }}
      >
        <Download className="mr-1.5 size-3.5" /> Install app
      </Button>
    </div>
  );
}
