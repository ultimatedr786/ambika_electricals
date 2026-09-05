"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

/**
 * Development/demo persona switcher — NOT authentication.
 */
export function DemoSwitcher() {
  const router = useRouter();
  const { setState, reset } = useStore();

  const pick = (role: "customer" | "business" | "staff", href: string, label: string) => {
    setState((s) => ({ ...s, role, signedIn: true }));
    router.push(href);
    toast.success(`Demo mode: ${label}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Demo mode switcher">
          <FlaskConical className="size-[18px]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Demo mode</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => pick("customer", "/customer/dashboard", "Rahul Sharma")}>
          <span className="flex flex-col">
            <span className="text-sm">Customer</span>
            <span className="text-xs text-muted-foreground">Rahul Sharma · Gold · 2,450 pts</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => pick("business", "/business/dashboard", "Ambika Electricals owner")}>
          <span className="flex flex-col">
            <span className="text-sm">Business Owner</span>
            <span className="text-xs text-muted-foreground">Ambika Electricals</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => pick("staff", "/business/sales/new", "Cashier demo")}>
          <span className="flex flex-col">
            <span className="text-sm">Staff</span>
            <span className="text-xs text-muted-foreground">Cashier · New sale</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            reset();
            toast.success("Demo data reset");
          }}
        >
          <RotateCcw /> Reset demo data
        </DropdownMenuItem>
        <p className="px-2.5 pb-1 pt-2 text-[11px] leading-snug text-muted-foreground">
          Prototype persona switcher — not production authentication.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
