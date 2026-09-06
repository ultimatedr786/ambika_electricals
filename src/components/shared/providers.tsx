"use client";

import * as React from "react";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StoreProvider } from "@/lib/store";
import { PwaProvider } from "@/components/shared/pwa-provider";
import { PwaPrompt } from "@/components/shared/pwa-prompt";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <StoreProvider>
        {/* Exactly one PWA provider + one banner for the whole application. */}
        <PwaProvider>
          <TooltipProvider delayDuration={200}>
            {children}
            <PwaPrompt />
            <Toaster
              position="top-center"
              richColors
              closeButton
              toastOptions={{ className: "rounded-xl border shadow-lg" }}
            />
          </TooltipProvider>
        </PwaProvider>
      </StoreProvider>
    </ThemeProvider>
  );
}
