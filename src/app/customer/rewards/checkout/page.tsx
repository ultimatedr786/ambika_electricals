"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Check, CircleAlert, Copy, Gift, PartyPopper, ShoppingBag, Store, Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductArt } from "@/components/shared/product-art";
import { QRCode } from "@/components/shared/qr-code";
import { useCurrentCustomer, useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { cn, formatDate, formatINR, formatNumber } from "@/lib/utils";
import type { Redemption } from "@/types";

const addressSchema = z.object({
  fullName: z.string().min(2, "Enter the recipient's name"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  address: z.string().min(6, "Enter the flat, building and street"),
  area: z.string().min(2, "Enter the area or locality"),
  city: z.string().min(2, "Enter the city"),
  state: z.string().min(2, "Enter the state"),
  pincode: z.string().regex(/^\d{6}$/, "Enter a valid 6-digit pincode"),
});
type AddressValues = z.infer<typeof addressSchema>;

const steps = ["Reward", "Options", "Details", "Confirm"];

export default function CheckoutPage() {
  const router = useRouter();
  const customer = useCurrentCustomer();
  const { state } = useStore();
  const { redemptionService } = useServices();

  const [fulfilment, setFulfilment] = React.useState<"pickup" | "delivery">("pickup");
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState<Redemption | null>(null);

  const form = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      fullName: customer.name,
      phone: customer.phone.replace(/\D/g, "").slice(-10),
      address: "", area: "", city: "Surat", state: "Gujarat", pincode: "",
    },
  });

  const lines = state.cart
    .map((l) => {
      const reward = state.rewards.find((r) => r.id === l.rewardId);
      const option = reward?.options.find((o) => o.type === l.optionType);
      return reward && option ? { reward, option, qty: l.qty } : null;
    })
    .filter(Boolean) as { reward: NonNullable<ReturnType<typeof state.rewards.find>>; option: { type: string; points: number; cash: number; label: string }; qty: number }[];

  const totalPoints = lines.reduce((s, l) => s + l.option.points * l.qty, 0);
  const totalCash = lines.reduce((s, l) => s + l.option.cash * l.qty, 0);
  const remaining = customer.points - totalPoints;

  const confirm = async () => {
    if (fulfilment === "delivery") {
      const ok = await form.trigger();
      if (!ok) {
        toast.error("Please complete the delivery address.");
        return;
      }
    }
    setSubmitting(true);
    const redemption = await redemptionService.redeemReward({
      lines: lines.map((l) => ({
        rewardId: l.reward.id,
        name: l.reward.name,
        image: l.reward.image,
        qty: l.qty,
        option: l.option as never,
      })),
      fulfilment,
      address: fulfilment === "delivery" ? form.getValues() : undefined,
    });
    setSubmitting(false);
    setDone(redemption);
  };

  if (done) return <SuccessScreen redemption={done} />;

  if (lines.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Nothing to check out"
        description="Your reward basket is empty."
        action={<Button asChild><Link href="/customer/rewards">Browse Rewards Store</Link></Button>}
      />
    );
  }

  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.push("/customer/rewards/cart")}>
        <ArrowLeft /> Back to basket
      </Button>

      {/* Stepper */}
      <ol className="flex items-center gap-2" aria-label="Checkout progress">
        {steps.map((s, i) => {
          const active = i <= 2;
          return (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {i < 2 ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn("hidden text-[13px] font-medium sm:block", active ? "text-foreground" : "text-muted-foreground")}>{s}</span>
              {i < steps.length - 1 && <span className={cn("h-px flex-1", i < 2 ? "bg-primary" : "bg-border")} />}
            </li>
          );
        })}
      </ol>

      <h1 className="text-2xl font-semibold tracking-tight">Redemption checkout</h1>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* Items */}
          <Card className="p-5">
            <h2 className="text-base font-semibold">Your rewards</h2>
            <div className="mt-3.5 space-y-3">
              {lines.map((l) => (
                <div key={`${l.reward.id}-${l.option.type}`} className="flex items-center gap-3.5">
                  <ProductArt art={l.reward.image} className="size-14 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.reward.name}</p>
                    <p className="text-xs text-muted-foreground">{l.option.label} · Qty {l.qty}</p>
                  </div>
                  <div className="shrink-0 text-right text-sm tabular">
                    {l.option.points > 0 && <p className="font-medium">{formatNumber(l.option.points * l.qty)} pts</p>}
                    {l.option.cash > 0 && <p className="text-xs text-muted-foreground">+ {formatINR(l.option.cash * l.qty)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Fulfilment */}
          <Card className="p-5">
            <h2 className="text-base font-semibold">Where would you like it?</h2>
            <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Fulfilment method">
              <FulfilOption
                active={fulfilment === "pickup"}
                onClick={() => setFulfilment("pickup")}
                icon={Store}
                title="Store pickup"
                body="Collect from Ambika Electricals"
                note="Ready after confirmation"
              />
              <FulfilOption
                active={fulfilment === "delivery"}
                onClick={() => setFulfilment("delivery")}
                icon={Truck}
                title="Delivery"
                body="Within Surat city limits"
                note="2–3 working days"
              />
            </div>

            <AnimatePresence initial={false}>
              {fulfilment === "pickup" ? (
                <motion.div key="pickup" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-4 rounded-xl border bg-muted/40 p-4">
                    <p className="text-sm font-medium">Ambika Electricals — Main Store</p>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      Shop 14, Sardar Complex, Ring Road, Surat, Gujarat 395002
                    </p>
                    <p className="mt-2 text-[13px] text-muted-foreground">Open Mon–Sat, 9:30 am – 8:30 pm · +91 98250 41200</p>
                  </div>
                </motion.div>
              ) : (
                <motion.form key="delivery" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
                    <Field label="Full name" error={form.formState.errors.fullName?.message} {...form.register("fullName")} />
                    <Field label="Phone" inputMode="tel" error={form.formState.errors.phone?.message} {...form.register("phone")} />
                    <div className="sm:col-span-2">
                      <Field label="Address" placeholder="Flat, building, street" error={form.formState.errors.address?.message} {...form.register("address")} />
                    </div>
                    <Field label="Area" error={form.formState.errors.area?.message} {...form.register("area")} />
                    <Field label="City" error={form.formState.errors.city?.message} {...form.register("city")} />
                    <Field label="State" error={form.formState.errors.state?.message} {...form.register("state")} />
                    <Field label="Pincode" inputMode="numeric" error={form.formState.errors.pincode?.message} {...form.register("pincode")} />
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </Card>

          {/* Customer */}
          <Card className="p-5">
            <h2 className="text-base font-semibold">Member details</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <Detail label="Name" value={customer.name} />
              <Detail label="Membership ID" value={customer.membershipId} />
              <Detail label="Phone" value={customer.phone} />
              <Detail label="Tier" value={customer.tier} />
            </dl>
          </Card>
        </div>

        {/* Summary */}
        <div className="lg:sticky lg:top-24 lg:h-fit">
          <Card className="p-5">
            <h2 className="text-base font-semibold">Redemption summary</h2>
            <div className="mt-4 space-y-2 text-sm">
              <SumRow label="Items" value={`${lines.reduce((s, l) => s + l.qty, 0)}`} />
              <SumRow label="Points used" value={`${formatNumber(totalPoints)} pts`} />
              <SumRow label="Cash payable" value={formatINR(totalCash)} />
              <SumRow label="Fulfilment" value={fulfilment === "pickup" ? "Store pickup" : "Delivery"} />
              <Separator className="my-2.5" />
              <SumRow label="Balance after" value={`${formatNumber(remaining)} pts`} strong />
            </div>
            {remaining < 0 && (
              <p className="mt-3 flex items-start gap-2 text-[13px] text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" /> Not enough points for this redemption.
              </p>
            )}
            <Button size="lg" className="mt-5 hidden w-full lg:flex" onClick={confirm} loading={submitting} disabled={remaining < 0}>
              <Gift /> Confirm Redemption
            </Button>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Prototype only — no payment is taken and no order is really placed.
            </p>
          </Card>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[62px] z-20 border-t bg-background/95 p-3 backdrop-blur-md lg:hidden">
        <div className="safe-bottom flex items-center gap-3">
          <div>
            <p className="text-[15px] font-semibold tabular">{formatNumber(totalPoints)} pts{totalCash > 0 && ` + ${formatINR(totalCash)}`}</p>
            <p className="text-[11px] text-muted-foreground">{formatNumber(remaining)} pts left after</p>
          </div>
          <Button className="ml-auto flex-1" size="lg" onClick={confirm} loading={submitting} disabled={remaining < 0}>
            Confirm Redemption
          </Button>
        </div>
      </div>
    </div>
  );
}

function SuccessScreen({ redemption }: { redemption: Redemption }) {
  const customer = useCurrentCustomer();
  const first = redemption.lines[0];
  return (
    <div className="mx-auto max-w-lg space-y-5 py-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="text-center"
      >
        <motion.div
          initial={{ scale: 0.5, rotate: -14 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 210, damping: 13 }}
          className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-success/12 text-success"
        >
          <PartyPopper className="size-7" />
        </motion.div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">You&apos;re all set! 🎉</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Your {first.name}{redemption.lines.length > 1 ? ` and ${redemption.lines.length - 1} more` : ""} has been reserved.
        </p>
      </motion.div>

      {/* Digital pass */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/60">Ambika Electricals · Reward pass</p>
            <p className="mt-1.5 text-lg font-semibold">{first.name}</p>
            <p className="text-sm text-white/70">{customer.name} · {customer.membershipId}</p>
          </div>
          <div className="flex items-center gap-5 p-5">
            <div className="size-28 shrink-0 rounded-xl border bg-white p-2">
              <QRCode value={redemption.code} />
            </div>
            <div className="min-w-0 space-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Redemption ID</p>
                <p className="font-medium tabular">{redemption.redemptionId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Code</p>
                <p className="font-semibold tabular tracking-wider">{redemption.code}</p>
              </div>
              <Badge variant={redemption.status === "Ready for Pickup" ? "default" : "success"}>{redemption.status}</Badge>
            </div>
          </div>
          <Separator />
          <div className="space-y-2 p-5 text-sm">
            <SumRow label="Points used" value={`${formatNumber(redemption.pointsUsed)} pts`} />
            {redemption.cashPaid > 0 && <SumRow label="Cash payable at pickup" value={formatINR(redemption.cashPaid)} />}
            <SumRow label={redemption.fulfilment === "pickup" ? "Pickup at" : "Delivery to"} value={redemption.fulfilment === "pickup" ? "Main Store" : redemption.address?.city ?? "Surat"} />
            <SumRow label="Valid until" value={formatDate(redemption.expiresAt, "long")} />
            <SumRow label="New balance" value={`${formatNumber(customer.points)} pts`} strong />
          </div>
          <div className="flex flex-wrap gap-2 border-t p-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                navigator.clipboard?.writeText(redemption.code);
                toast.success("Copied to clipboard");
              }}
            >
              <Copy /> Copy Code
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href="/customer/redemptions">View Redemption</Link>
            </Button>
          </div>
        </Card>
      </motion.div>

      <Button asChild size="lg" className="w-full">
        <Link href="/customer/rewards">Continue Shopping <ArrowRight /></Link>
      </Button>
    </div>
  );
}

function FulfilOption({
  active, onClick, icon: Icon, title, body, note,
}: { active: boolean; onClick: () => void; icon: React.ElementType; title: string; body: string; note: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
        active ? "border-primary bg-primary/[0.04] ring-1 ring-primary" : "hover:border-foreground/20 hover:bg-accent/40"
      )}
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
        <Icon className="size-[18px]" />
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[13px] text-muted-foreground">{body}</span>
        <span className="mt-1 block text-[11px] text-muted-foreground">{note}</span>
      </span>
    </button>
  );
}

const Field = React.forwardRef<HTMLInputElement, { label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>>(
  ({ label, error, ...props }, ref) => {
    const id = React.useId();
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} ref={ref} aria-invalid={!!error} {...props} />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }
);
Field.displayName = "Field";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function SumRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular", strong && "font-semibold")}>{value}</span>
    </div>
  );
}
