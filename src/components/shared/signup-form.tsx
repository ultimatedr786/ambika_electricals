"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowRight, PartyPopper, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordField, PasswordStrength, passwordScore } from "@/components/shared/password-field";
import { useServices } from "@/lib/services";
import { formatNumber } from "@/lib/utils";

const schema = z
  .object({
    name: z.string().min(2, "Please enter your full name"),
    phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
    email: z.string().email("Enter a valid email address"),
    birthday: z.string().optional(),
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .regex(/[A-Z]/, "Add an uppercase letter")
      .regex(/\d/, "Add a number")
      .regex(/[^A-Za-z0-9]/, "Add a special character"),
    confirm: z.string(),
    terms: z.boolean().refine((v) => v === true, { message: "Please accept the terms to continue" }),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

type Values = z.infer<typeof schema>;

export function SignupForm() {
  const router = useRouter();
  const { authService } = useServices();
  const [created, setCreated] = React.useState<{ name: string; membershipId: string } | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: { name: "", phone: "", email: "", birthday: "", password: "", confirm: "", terms: false },
  });

  const password = form.watch("password") ?? "";

  const onSubmit = form.handleSubmit(async (values) => {
    const customer = await authService.signUp({
      name: values.name,
      phone: `+91 ${values.phone}`,
      email: values.email,
      birthday: values.birthday || undefined,
    });
    setCreated({ name: customer.name, membershipId: customer.membershipId });
    toast.success("Account created", { description: "100 welcome points added to your balance." });
  });

  if (created) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border bg-card p-7 text-center shadow-sm"
      >
        <motion.div
          initial={{ scale: 0.6, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 14 }}
          className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-success/12 text-success"
        >
          <PartyPopper className="size-6" />
        </motion.div>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">Welcome to Ambika Electricals 🎉</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">Your rewards journey starts now.</p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-muted/40 p-3.5">
            <p className="text-xs text-muted-foreground">Welcome points</p>
            <p className="mt-0.5 text-lg font-semibold tabular">{formatNumber(100)}</p>
          </div>
          <div className="rounded-xl border bg-muted/40 p-3.5">
            <p className="text-xs text-muted-foreground">Membership ID</p>
            <p className="mt-0.5 text-lg font-semibold tabular">{created.membershipId}</p>
          </div>
        </div>

        <Button size="lg" className="mt-5 w-full" onClick={() => router.push("/onboarding")}>
          <Sparkles /> Explore Rewards
        </Button>
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => router.push("/customer/dashboard")}>
          Skip to dashboard
        </Button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" autoComplete="name" placeholder="Rahul Sharma" {...form.register("name")} />
        {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">Mobile number</Label>
        <div className="flex gap-2">
          <span className="flex h-10 shrink-0 items-center rounded-lg border bg-muted px-3 text-sm text-muted-foreground">+91</span>
          <Input id="phone" inputMode="tel" autoComplete="tel" placeholder="9824011248" {...form.register("phone")} />
        </div>
        {form.formState.errors.phone && <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...form.register("email")} />
        {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="birthday">
          Birthday <span className="font-normal text-muted-foreground">(optional — unlock a 500-point bonus)</span>
        </Label>
        <Input id="birthday" type="date" {...form.register("birthday")} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <PasswordField id="password" autoComplete="new-password" placeholder="Create a password" {...form.register("password")} />
        <PasswordStrength value={password} />
        {form.formState.errors.password && <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <PasswordField id="confirm" autoComplete="new-password" placeholder="Re-enter your password" {...form.register("confirm")} />
        {form.formState.errors.confirm && <p className="text-xs text-destructive">{form.formState.errors.confirm.message}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted-foreground">
          <Checkbox
            className="mt-0.5"
            checked={!!form.watch("terms")}
            onCheckedChange={(c) => form.setValue("terms", c === true, { shouldValidate: true })}
          />
          <span>
            I agree to the <span className="font-medium text-foreground underline underline-offset-2">Terms</span> &amp;{" "}
            <span className="font-medium text-foreground underline underline-offset-2">Privacy Policy</span>.
          </span>
        </label>
        {form.formState.errors.terms && <p className="text-xs text-destructive">{form.formState.errors.terms.message}</p>}
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={form.formState.isSubmitting}
        disabled={passwordScore(password) < 4 || !form.watch("terms")}
      >
        Create Account <ArrowRight />
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already a member?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
      </p>
    </form>
  );
}
