"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Building2, Info, MailWarning, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordField } from "@/components/shared/password-field";
import { useServices } from "@/lib/services";
import { createClient } from "@/lib/supabase/client";
import { getSiteUrl, isDemoAuthEnabled, isSupabaseConfigured } from "@/lib/auth/env";
import { safeReturnTo } from "@/lib/auth/redirects";
import { authErrorMessage, resolveRoleHome } from "@/lib/auth/client-flows";

const emailSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  remember: z.boolean().optional(),
});
type EmailValues = z.infer<typeof emailSchema>;

const otpEmailSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});
type OtpEmailValues = z.infer<typeof otpEmailSchema>;

const DEMO = {
  customer: { email: "rahul@demo.com", password: "Demo@123", name: "Rahul Sharma · Gold member" },
  business: { email: "owner@ambikaelectricals.in", password: "Demo@123", name: "Ambika Electricals · Store Owner" },
  staff: { email: "kiran@ambikaelectricals.in", password: "Demo@123", name: "Kiran Bhatt · Staff POS" },
};

const RESEND_COOLDOWN_SECONDS = 60;

type Mode = "customer" | "business";

const ERROR_COPY: Record<string, string> = {
  invalid_link: "That sign-in link isn't valid or was already used. Request a fresh one below.",
  code_expired: "That code or link has expired (codes last 10 minutes). Request a new one below.",
  auth_unconfigured: "Authentication isn't configured on this deployment yet.",
};

export function LoginForm({ next, error }: { next?: string | null; error?: string | null }) {
  const router = useRouter();
  const { authService } = useServices();
  const supabase = React.useMemo(() => createClient(), []);
  const realAuth = isSupabaseConfigured() && supabase !== null;
  const demoEnabled = isDemoAuthEnabled();

  const [mode, setMode] = React.useState<Mode>("customer");
  const [method, setMethod] = React.useState<"password" | "otp">("password");
  const [otpStep, setOtpStep] = React.useState<"email" | "code">("email");
  const [otp, setOtp] = React.useState("");
  const [otpEmail, setOtpEmail] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [resendIn, setResendIn] = React.useState(0);
  const returnTo = React.useMemo(() => safeReturnTo(next, "/"), [next]);

  const form = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "", password: "", remember: true },
  });
  const otpForm = useForm<OtpEmailValues>({ resolver: zodResolver(otpEmailSchema), defaultValues: { email: "" } });

  React.useEffect(() => {
    if (error && ERROR_COPY[error]) toast.error("Couldn't sign you in", { description: ERROR_COPY[error] });
  }, [error]);

  React.useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearInterval(t);
  }, [resendIn]);

  const finishSignIn = React.useCallback(
    async (demoRole: "customer" | "business" | "staff" | null) => {
      setIsSubmitting(true);
      try {
        if (demoRole) {
          // Demo mode mock sign-in (Phase 1 journey, clearly labelled).
          await authService.signIn(demoRole);
          toast.success("Welcome back!", { description: DEMO[demoRole].name });
        }
        if (returnTo && returnTo !== "/") {
          router.push(returnTo);
        } else if (demoRole) {
          router.push(demoRole === "customer" ? "/customer/dashboard" : "/business/dashboard");
        } else if (supabase) {
          router.push(await resolveRoleHome(supabase));
        } else {
          router.push("/customer/dashboard");
        }
        router.refresh();
      } finally {
        setIsSubmitting(false);
      }
    },
    [authService, returnTo, router, supabase]
  );

  /* ---------------------------------------------------- password sign-in */
  const onSubmit = form.handleSubmit(async (values) => {
    const email = values.email.trim().toLowerCase();

    if (!realAuth) {
      const expected = mode === "customer" ? DEMO.customer : DEMO.business;
      const staffMatch = email === DEMO.staff.email;
      const ok = values.password === expected.password && (email === expected.email || staffMatch);
      if (!ok) {
        form.setError("password", { message: "Email or password doesn't look right." });
        toast.error("Email or password doesn't match demo credentials.", {
          description: `Click a demo button below to quick-fill: ${expected.email}`,
        });
        return;
      }
      await finishSignIn(staffMatch ? "staff" : mode);
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: signInError } = await supabase!.auth.signInWithPassword({ email, password: values.password });
      if (signInError) {
        const friendly = authErrorMessage(signInError, "Couldn't sign you in. Please try again.");
        if (/not confirmed/i.test(friendly) && signInError.message.toLowerCase().includes("email not confirmed")) {
          toast.error("Email not confirmed", {
            description: friendly,
            action: {
              label: "Resend email",
              onClick: async () => {
                const { error: resendError } = await supabase!.auth.resend({
                  type: "signup",
                  email,
                  options: { emailRedirectTo: `${getSiteUrl()}/auth/confirm?type=signup&next=${encodeURIComponent(returnTo)}` },
                });
                if (resendError) toast.error("Couldn't resend the confirmation email.", { description: authErrorMessage(resendError, "Try again shortly.") });
                else toast.success("Confirmation email resent.", { description: `Check ${email} — the code lasts 10 minutes.` });
              },
            },
          });
        } else {
          form.setError("password", { message: friendly });
        }
        return;
      }
      await finishSignIn(null);
    } finally {
      setIsSubmitting(false);
    }
  });

  /* ------------------------------------------------------- email OTP */
  const onOtpEmail = otpForm.handleSubmit(async (values) => {
    const email = values.email.trim().toLowerCase();
    setOtpEmail(email);
    setOtpStep("code");
    setOtp("");
    setResendIn(RESEND_COOLDOWN_SECONDS);

    if (!realAuth) {
      toast.info("OTP sent", { description: "Demo OTP is 123456" });
      return;
    }
    const { error: otpError } = await supabase!.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${getSiteUrl()}/auth/confirm?type=email&next=${encodeURIComponent(returnTo)}` },
    });
    if (otpError) {
      toast.error("Couldn't send the code", { description: authErrorMessage(otpError, "Please try again shortly.") });
      setOtpStep("email");
      setResendIn(0);
      return;
    }
    toast.success("Check your inbox", { description: `We emailed a 6-digit code to ${email}. It expires in 10 minutes.` });
  });

  const sendOtpAgain = async () => {
    if (resendIn > 0 || !realAuth || !supabase) return;
    setResendIn(RESEND_COOLDOWN_SECONDS);
    const { error: resendError } = await supabase.auth.signInWithOtp({
      email: otpEmail,
      options: { emailRedirectTo: `${getSiteUrl()}/auth/confirm?type=email&next=${encodeURIComponent(returnTo)}` },
    });
    if (resendError) toast.error("Couldn't resend the code", { description: authErrorMessage(resendError, "Please try again shortly.") });
    else toast.success("New code sent", { description: `Check ${otpEmail} — the code expires in 10 minutes.` });
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) return;

    if (!realAuth) {
      if (otp !== "123456") {
        toast.error("Invalid OTP code.", { description: "Demo code is 123456" });
        setOtp("");
        return;
      }
      await finishSignIn(mode === "customer" ? "customer" : "business");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: verifyError } = await supabase!.auth.verifyOtp({ type: "email", email: otpEmail, token: otp });
      if (verifyError) {
        toast.error("Couldn't verify the code", { description: authErrorMessage(verifyError, "Check the code and try again.") });
        setOtp("");
        return;
      }
      await finishSignIn(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillDemo = (role: "customer" | "business" | "staff") => {
    const d = DEMO[role];
    setMode(role === "customer" ? "customer" : "business");
    setMethod("password");
    form.setValue("email", d.email, { shouldValidate: true });
    form.setValue("password", d.password, { shouldValidate: true });
    form.clearErrors();
  };

  return (
    <div className="space-y-5">
      {/* Role switch */}
      {/*
        A segmented choice, not a tablist: these controls switch the sign-in
        mode, they do not reveal tab panels. Rendering them as tabs made
        `aria-controls` point at panels that do not exist (axe
        `aria-valid-attr-value`), and told screen-reader users to look for
        content that was never there. A radiogroup is what this actually is,
        and arrow-key behaviour comes free from the native radios.
      */}
      <div
        role="radiogroup"
        aria-label="Account role"
        className="grid w-full grid-cols-2 gap-1 rounded-lg bg-muted p-1"
      >
        {([
          { value: "customer", label: "Customer", Icon: UserRound },
          { value: "business", label: "Business", Icon: Building2 },
        ] as const).map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => {
              setMode(value);
              form.clearErrors();
            }}
            className={
              "inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
              (mode === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {mode === "business" && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl border bg-accent/40 p-3"
        >
          <p className="text-sm font-medium text-accent-foreground">Run your loyalty program smarter.</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Manage customers, sales, rewards and staff POS.
          </p>
        </motion.div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {method === "password" ? (
          <motion.form
            key="password"
            onSubmit={onSubmit}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="identifier">Email address</Label>
              <Input
                id="identifier"
                autoComplete="username"
                inputMode="email"
                placeholder={mode === "customer" ? "you@example.com" : "owner@yourbusiness.in"}
                aria-invalid={!!form.formState.errors.email}
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/forgot-password" className="text-[13px] font-medium text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <PasswordField
                id="password"
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={!!form.formState.errors.password}
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 py-1 text-sm text-muted-foreground">
              <Checkbox
                checked={form.watch("remember")}
                onCheckedChange={(c) => form.setValue("remember", !!c)}
                aria-label="Keep me signed in"
              />
              Keep me signed in
            </label>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={isSubmitting || form.formState.isSubmitting}
              disabled={isSubmitting}
            >
              Sign In
            </Button>
          </motion.form>
        ) : (
          <motion.div
            key="otp"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            {otpStep === "email" ? (
              <form onSubmit={onOtpEmail} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="otp-email">Email address</Label>
                  <Input
                    id="otp-email"
                    inputMode="email"
                    autoComplete="username"
                    placeholder="you@example.com"
                    aria-invalid={!!otpForm.formState.errors.email}
                    {...otpForm.register("email")}
                  />
                  {otpForm.formState.errors.email && (
                    <p className="text-xs text-destructive">{otpForm.formState.errors.email.message}</p>
                  )}
                  <p className="text-[13px] text-muted-foreground">
                    We&apos;ll email you a 6-digit code — no password needed.
                  </p>
                </div>
                <Button type="submit" size="lg" className="w-full" loading={otpForm.formState.isSubmitting}>
                  Email my code <ArrowRight className="ml-1 size-4" />
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => {
                    setOtpStep("email");
                    setOtp("");
                  }}
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5" /> Change email
                </button>
                <div>
                  <Label htmlFor="otp">Enter the 6-digit code</Label>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">Sent to {otpEmail}</p>
                  <Input
                    id="otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="mt-2.5 h-14 text-center text-2xl font-semibold tracking-[0.5em]"
                    placeholder="––––––"
                    autoFocus
                  />
                </div>

                {!realAuth && (
                  <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-[13px] text-muted-foreground">
                    <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span>
                      Demo OTP: <strong className="text-foreground">123456</strong>
                    </span>
                  </div>
                )}

                <Button
                  size="lg"
                  className="w-full"
                  onClick={verifyOtp}
                  loading={isSubmitting}
                  disabled={otp.length !== 6 || isSubmitting}
                >
                  Verify &amp; Sign In
                </Button>

                {realAuth && (
                  <div className="text-center text-[13px]">
                    {resendIn > 0 ? (
                      <span className="text-muted-foreground">
                        Didn&apos;t get it? Resend available in <strong className="tabular">{resendIn}s</strong>
                      </span>
                    ) : (
                      <button type="button" onClick={sendOtpAgain} className="font-medium text-primary hover:underline">
                        Resend code
                      </button>
                    )}
                    <span className="text-muted-foreground"> · Codes expire after 10 minutes</span>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-xs uppercase tracking-wide text-muted-foreground">or</span>
        </div>
      </div>

      <div className="grid gap-2.5">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => {
            setMethod(method === "otp" ? "password" : "otp");
            setOtpStep("email");
            setOtp("");
          }}
        >
          {method === "otp" ? <><MailWarning className="mr-1.5 size-4" /> Use email and password</> : "Sign in with email OTP"}
        </Button>
        {demoEnabled && !realAuth && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => toast.info("Google sign-in is UI only in this prototype.")}
          >
            <GoogleIcon /> Continue with Google
          </Button>
        )}
      </div>

      {/* Demo mode selector — never rendered when real auth is configured in production */}
      {demoEnabled && (
        <div className="rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] p-3.5">
          <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="size-3.5" />
            <span>Demo mode quick fill</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-xs"
              onClick={() => fillDemo("customer")}
            >
              Customer (Rahul)
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-xs"
              onClick={() => fillDemo("business")}
            >
              Business owner
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-xs"
              onClick={() => fillDemo("staff")}
            >
              Staff POS
            </Button>
          </div>
          <p className="mt-2.5 text-[11px] text-muted-foreground">
            Frontend prototype only — click any role above to pre-fill credentials.
          </p>
        </div>
      )}

      <p className="text-center text-sm text-muted-foreground">
        {mode === "customer" ? "New to Ambika Electricals?" : "Don't have a business account?"}{" "}
        <Link
          href={mode === "customer" ? `/signup${returnTo && returnTo !== "/" ? `?next=${encodeURIComponent(returnTo)}` : ""}` : "/business/signup"}
          className="font-medium text-primary hover:underline"
        >
          {mode === "customer" ? "Create account" : "Create business account"}
        </Link>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mr-1.5 size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5a11 11 0 0 0-9.82 6.05l3.66 2.84c.87-2.6 3.3-4.64 6.16-4.64Z"
      />
    </svg>
  );
}
