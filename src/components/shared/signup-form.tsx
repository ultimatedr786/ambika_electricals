"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowRight, MailCheck, PartyPopper, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordField, PasswordStrength, passwordScore } from "@/components/shared/password-field";
import { useServices } from "@/lib/services";
import { formatNumber } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/auth/env";
import { safeReturnTo } from "@/lib/auth/redirects";
import { authErrorMessage } from "@/lib/auth/client-flows";

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

export function SignupForm({ next }: { next?: string | null }) {
  const router = useRouter();
  const { authService } = useServices();
  const supabase = React.useMemo(() => createClient(), []);
  const realAuth = isSupabaseConfigured() && supabase !== null;
  const returnTo = React.useMemo(() => safeReturnTo(next, "/customer/dashboard"), [next]);

  const [created, setCreated] = React.useState<{ name: string; membershipId: string } | null>(null);
  const [pendingEmail, setPendingEmail] = React.useState<string | null>(null);
  const [resendIn, setResendIn] = React.useState(0);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: { name: "", phone: "", email: "", birthday: "", password: "", confirm: "", terms: false },
  });

  const password = form.watch("password") ?? "";

  React.useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearInterval(t);
  }, [resendIn]);

  const redirectTo = `${getSiteUrl()}/auth/confirm?type=signup&next=${encodeURIComponent(returnTo)}`;

  const onSubmit = form.handleSubmit(async (values) => {
    if (!realAuth) {
      // Demo mode — the Phase 1 mock membership journey.
      const customer = await authService.signUp({
        name: values.name,
        phone: `+91 ${values.phone}`,
        email: values.email,
        birthday: values.birthday || undefined,
      });
      setCreated({ name: customer.name, membershipId: customer.membershipId });
      toast.success("Account created", { description: "100 welcome points added to your balance." });
      return;
    }

    const { data, error: signUpError } = await supabase!.auth.signUp({
      email: values.email.trim().toLowerCase(),
      password: values.password,
      options: {
        data: {
          full_name: values.name.trim(),
          phone: `+91${values.phone.trim()}`,
          birthday: values.birthday || null,
          signup_context: "customer",
        },
        emailRedirectTo: redirectTo,
      },
    });

    if (signUpError) {
      toast.error("Couldn't create your account", {
        description: authErrorMessage(signUpError, "Please check your details and try again."),
      });
      return;
    }

    if (data.session) {
      // Email confirmation disabled for this project — already signed in.
      toast.success("Account created", { description: "Welcome to Ambika Electricals Rewards." });
      router.push(returnTo);
      router.refresh();
      return;
    }

    // Confirmation required. Supabase intentionally does not reveal whether
    // the address already existed — our copy stays non-enumerating too.
    setPendingEmail(values.email.trim().toLowerCase());
    setResendIn(60);
  });

  const resendConfirmation = async () => {
    if (!supabase || !pendingEmail || resendIn > 0) return;
    setResendIn(60);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      toast.error("Couldn't resend the email", { description: authErrorMessage(error, "Please try again shortly.") });
    } else {
      toast.success("Confirmation email resent", { description: `Check ${pendingEmail} — the code lasts 10 minutes.` });
    }
  };

  /* ---------------------------------------------- real mode: check your email */
  if (pendingEmail) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border bg-card p-7 text-center shadow-sm"
      >
        <motion.div
          initial={{ scale: 0.6, rotate: -8 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 14 }}
          className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"
        >
          <MailCheck className="size-6" />
        </motion.div>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">Check your email</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground">{pendingEmail}</span>, a confirmation
          email is on its way. Open it and enter the 6-digit code (or tap the link) to activate your membership.
        </p>

        <div className="mt-5 rounded-xl border bg-muted/40 p-3.5 text-left text-[13px] text-muted-foreground">
          <p className="font-medium text-foreground">What happens next</p>
          <ul className="mt-1.5 space-y-1">
            <li>1. Confirm your email — codes expire after 10 minutes.</li>
            <li>2. Sign in with your password, or use email OTP.</li>
            <li>3. Show your membership QR at the counter to start earning.</li>
          </ul>
        </div>

        <Button size="lg" className="mt-5 w-full" onClick={resendConfirmation} disabled={resendIn > 0}>
          {resendIn > 0 ? `Resend confirmation email in ${resendIn}s` : "Resend confirmation email"}
        </Button>
        <Button asChild variant="ghost" size="sm" className="mt-2 w-full">
          <Link href="/login">Already confirmed? Sign in</Link>
        </Button>
      </motion.div>
    );
  }

  /* ---------------------------------------------- demo mode: celebration */
  if (created) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
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
            <p className="mt-0.5 text-lg font-semibold tabular text-primary">{formatNumber(100)}</p>
          </div>
          <div className="rounded-xl border bg-muted/40 p-3.5">
            <p className="text-xs text-muted-foreground">Membership ID</p>
            <p className="mt-0.5 text-lg font-semibold tabular">{created.membershipId}</p>
          </div>
        </div>

        <Button size="lg" className="mt-5 w-full" onClick={() => router.push("/onboarding")}>
          <Sparkles className="mr-1.5 size-4" /> Explore Rewards
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
        Create Account <ArrowRight className="ml-1 size-4" />
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already a member?{" "}
        <Link href={`/login${returnTo !== "/customer/dashboard" ? `?next=${encodeURIComponent(returnTo)}` : ""}`} className="font-medium text-primary hover:underline">Sign in</Link>
      </p>
    </form>
  );
}
