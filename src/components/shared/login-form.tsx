"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Building2, Info, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PasswordField } from "@/components/shared/password-field";
import { useServices } from "@/lib/services";

const emailSchema = z.object({
  identifier: z.string().min(1, "Enter your email or mobile number"),
  password: z.string().min(1, "Enter your password"),
  remember: z.boolean().optional(),
});
type EmailValues = z.infer<typeof emailSchema>;

const phoneSchema = z.object({
  phone: z
    .string()
    .min(10, "Enter a valid 10-digit mobile number")
    .regex(/^[0-9+\s-]+$/, "Only digits are allowed"),
});
type PhoneValues = z.infer<typeof phoneSchema>;

const DEMO = {
  customer: { email: "rahul@demo.com", password: "Demo@123", name: "Rahul Sharma · Gold member" },
  business: { email: "owner@ambikaelectricals.in", password: "Demo@123", name: "Ambika Electricals · Store Owner" },
  staff: { email: "kiran@ambikaelectricals.in", password: "Demo@123", name: "Kiran Bhatt · Staff POS" },
};

type Mode = "customer" | "business";

export function LoginForm() {
  const router = useRouter();
  const { authService } = useServices();
  const [mode, setMode] = React.useState<Mode>("customer");
  const [method, setMethod] = React.useState<"password" | "otp">("password");
  const [otpStep, setOtpStep] = React.useState<"phone" | "code">("phone");
  const [otp, setOtp] = React.useState("");
  const [otpPhone, setOtpPhone] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { identifier: "", password: "", remember: true },
  });
  const phoneForm = useForm<PhoneValues>({ resolver: zodResolver(phoneSchema), defaultValues: { phone: "" } });

  const executeSignIn = React.useCallback(
    async (role: "customer" | "business" | "staff") => {
      setIsSubmitting(true);
      try {
        await authService.signIn(role);
        const demoInfo = DEMO[role];
        toast.success("Welcome back!", {
          description: demoInfo.name,
        });
        const target = role === "customer" ? "/customer/dashboard" : "/business/dashboard";
        router.push(target);
      } finally {
        setIsSubmitting(false);
      }
    },
    [authService, router]
  );

  const onSubmit = form.handleSubmit(async (values) => {
    const expected = mode === "customer" ? DEMO.customer : DEMO.business;
    const staffMatch = values.identifier.trim().toLowerCase() === DEMO.staff.email;
    const ok =
      values.password === expected.password &&
      (values.identifier.trim().toLowerCase() === expected.email || staffMatch);

    if (!ok) {
      form.setError("password", { message: "Email or password doesn't look right." });
      toast.error("Email or password doesn't match demo credentials.", {
        description: `Click a demo button below to quick-fill: ${expected.email}`,
      });
      return;
    }
    await executeSignIn(staffMatch ? "staff" : mode);
  });

  const onPhone = phoneForm.handleSubmit(async (values) => {
    setOtpPhone(values.phone);
    setOtpStep("code");
    toast.info("OTP sent", { description: "Demo OTP is 123456" });
  });

  const verifyOtp = async () => {
    if (otp.length !== 6) return;
    if (otp !== "123456") {
      toast.error("Invalid OTP code.", { description: "Demo code is 123456" });
      setOtp("");
      return;
    }
    await executeSignIn(mode === "customer" ? "customer" : "business");
  };

  const fillDemo = (role: "customer" | "business" | "staff") => {
    const d = DEMO[role];
    setMode(role === "customer" ? "customer" : "business");
    setMethod("password");
    form.setValue("identifier", d.email, { shouldValidate: true });
    form.setValue("password", d.password, { shouldValidate: true });
    form.clearErrors();
  };

  return (
    <div className="space-y-5">
      {/* Role switch */}
      <Tabs
        value={mode}
        onValueChange={(v) => {
          setMode(v as Mode);
          form.clearErrors();
        }}
      >
        <TabsList className="grid w-full grid-cols-2" aria-label="Account role selection">
          <TabsTrigger value="customer" className="gap-2">
            <UserRound className="size-4" /> Customer
          </TabsTrigger>
          <TabsTrigger value="business" className="gap-2">
            <Building2 className="size-4" /> Business
          </TabsTrigger>
        </TabsList>
      </Tabs>

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
              <Label htmlFor="identifier">Mobile number or email</Label>
              <Input
                id="identifier"
                autoComplete="username"
                inputMode="email"
                placeholder={mode === "customer" ? "rahul@demo.com" : "owner@ambikaelectricals.in"}
                aria-invalid={!!form.formState.errors.identifier}
                {...form.register("identifier")}
              />
              {form.formState.errors.identifier && (
                <p className="text-xs text-destructive">{form.formState.errors.identifier.message}</p>
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
                placeholder="Demo@123"
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
            {otpStep === "phone" ? (
              <form onSubmit={onPhone} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Mobile number</Label>
                  <div className="flex gap-2">
                    <span className="flex h-10 shrink-0 items-center rounded-lg border bg-muted px-3 text-sm text-muted-foreground">
                      +91
                    </span>
                    <Input
                      id="phone"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="98240 11248"
                      {...phoneForm.register("phone")}
                    />
                  </div>
                  {phoneForm.formState.errors.phone && (
                    <p className="text-xs text-destructive">{phoneForm.formState.errors.phone.message}</p>
                  )}
                </div>
                <Button type="submit" size="lg" className="w-full" loading={phoneForm.formState.isSubmitting}>
                  Continue <ArrowRight className="ml-1 size-4" />
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => {
                    setOtpStep("phone");
                    setOtp("");
                  }}
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5" /> Change number
                </button>
                <div>
                  <Label htmlFor="otp">Enter the 6-digit code</Label>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">Sent to +91 {otpPhone}</p>
                  <Input
                    id="otp"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="mt-2.5 h-14 text-center text-2xl font-semibold tracking-[0.5em]"
                    placeholder="––––––"
                    autoFocus
                  />
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-[13px] text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span>
                    Demo OTP: <strong className="text-foreground">123456</strong>
                  </span>
                </div>
                <Button
                  size="lg"
                  className="w-full"
                  onClick={verifyOtp}
                  loading={isSubmitting}
                  disabled={otp.length !== 6 || isSubmitting}
                >
                  Verify &amp; Sign In
                </Button>
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
            setOtpStep("phone");
          }}
        >
          {method === "otp" ? "Use email and password" : "Sign in with mobile OTP"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => toast.info("Google sign-in is UI only in this prototype.")}
        >
          <GoogleIcon /> Continue with Google
        </Button>
      </div>

      {/* Demo mode selector */}
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

      <p className="text-center text-sm text-muted-foreground">
        {mode === "customer" ? "New to Ambika Electricals?" : "Don't have a business account?"}{" "}
        <Link
          href={mode === "customer" ? "/signup" : "/business/signup"}
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
