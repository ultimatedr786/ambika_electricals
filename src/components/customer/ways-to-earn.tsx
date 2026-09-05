"use client";

import * as React from "react";
import Link from "next/link";
import { Gift, Lightbulb, Target, TrendingUp, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetClose,
} from "@/components/ui/sheet";

const ways = [
  { icon: Zap, title: "Purchase electrical products", detail: "+10 points for every ₹100 spent", href: "/customer/dashboard" },
  { icon: TrendingUp, title: "Weekend Power Bonus", detail: "2X points every Saturday and Sunday", href: "/customer/dashboard" },
  { icon: Users, title: "Refer a friend", detail: "+200 points when they make their first purchase", href: "/customer/referrals" },
  { icon: Lightbulb, title: "Buy LED products", detail: "+50 bonus points on qualifying LED items", href: "/customer/rewards" },
  { icon: Target, title: "Complete a challenge", detail: "Up to +600 points per challenge", href: "/customer/challenges" },
];

export function WaysToEarnSheet({ trigger }: { trigger: React.ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="lg:mx-auto lg:max-w-lg lg:rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Earn more points</SheetTitle>
          <SheetDescription>Simple ways to build your balance at Ambika Electricals.</SheetDescription>
        </SheetHeader>
        <div className="space-y-2 px-5 pb-8">
          {ways.map((w) => (
            <div key={w.title} className="flex items-center gap-3.5 rounded-xl border p-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <w.icon className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{w.title}</p>
                <p className="text-[13px] text-muted-foreground">{w.detail}</p>
              </div>
            </div>
          ))}
          <SheetClose asChild>
            <Button asChild size="lg" className="mt-3 w-full">
              <Link href="/customer/challenges"><Gift /> Start Earning</Link>
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
