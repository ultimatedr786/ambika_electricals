"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, CreditCard, RefreshCw, WifiOff, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/shared/logo";

export default function OfflinePage() {
  const router = useRouter();
  const [checking, setChecking] = React.useState(false);

  const handleRetry = () => {
    setChecking(true);
    setTimeout(() => {
      if (typeof navigator !== "undefined" && navigator.onLine) {
        toast.success("Connection restored!");
        router.refresh();
      } else {
        toast.error("Still offline. Please check your internet connection.");
      }
      setChecking(false);
    }, 400);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex justify-center">
          <Logo />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="p-7 shadow-lg">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <WifiOff className="size-7" />
            </div>

            <h1 className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl">
              You are currently offline
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              You can still browse previously cached pages and view your local membership pass. Live sales,
              reward redemptions, and new sign-ins require an active internet connection.
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              <Button size="lg" className="w-full" onClick={handleRetry} loading={checking}>
                <RefreshCw className="mr-1.5 size-4" /> Check Connection &amp; Retry
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full">
                <Link href="/customer/membership">
                  <CreditCard className="mr-1.5 size-4" /> View Offline Membership Pass
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link href="/customer/dashboard">
                  <ArrowLeft className="mr-1.5 size-4" /> Go to Dashboard
                </Link>
              </Button>
            </div>

            <div className="mt-6 rounded-lg bg-muted/50 p-3 text-left text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Zap className="size-3.5 text-primary" />
                <span>Ambika Electricals Rewards</span>
              </div>
              <p className="mt-1">
                Your local membership and point balance are preserved in offline storage.
              </p>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
