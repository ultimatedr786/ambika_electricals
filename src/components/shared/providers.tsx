"use client";
import * as React from "react";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StoreProvider } from "@/lib/store";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <StoreProvider>
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster
            position="top-center"
            richColors
            closeButton
            toastOptions={{ className: "rounded-xl border shadow-lg" }}
          />
        </TooltipProvider>
      </StoreProvider>
    </ThemeProvider>
  );
}
