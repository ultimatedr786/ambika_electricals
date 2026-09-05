"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Check, ChevronLeft, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PasswordField, PasswordStrength } from "@/components/shared/password-field";
import { useServices } from "@/lib/services";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/auth/env";
import { authErrorMessage } from "@/lib/auth/client-flows";

const schema = z.object({
  businessName: z.string().min(3, "Enter your business name"),
  category: z.string().min(1, "Select a category"),
  ownerName: z.string().min(3, "Enter the owner's name"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  email: z.string().email("Enter a valid work email"),
  city: z.string().min(2, "Enter your city"),
  gst: z.string().optional(),
  password: z.string().min(8, "Use at least 8 characters"),
  terms: z.boolean().refine((v) => v === true, { message: "Please accept the terms to continue" }),
});
type Values = z.infer<typeof schema>;

const categories = ["Electrical Retail", "Hardware & Tools", "Lighting Showroom", "Electrical Contractor", "Wholesale Distributor"];
const stepFields: (keyof Values)[][] = [
  ["businessName", "category", "city"],
  ["ownerName", "phone", "email"],
  ["password", "terms"],
];
const stepTitles = ["Your business", "Your details", "Secure your account"];

export function BusinessSignupForm() {
  const router = useRouter();
  const { authService } = useServices();
  const supabase = React.useMemo(() => createClient(), []);
  const realAuth = isSupabaseConfigured() && supabase !== null;
  const [step, setStep] = React.useState(0);
  const [pendingEmail, setPendingEmail] = React.useState<string | null>(null);
  const [resendIn, setResendIn] = React.useState(0);
  const existingSession = React.useRef(false);

  React.useEffect(() => {
    if (!realAuth || !supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      existingSession.current = !!data.user;
    });
  }, [realAuth, supabase]);

  React.useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearInterval(t);
  }, [resendIn]);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      businessName: "", category: "Electrical Retail", ownerName: "", phone: "",
      email: "", city: "", gst: "", password: "", terms: false,
    },
  });

  const next = async () => {
    const ok = await form.trigger(stepFields[step]);
    if (ok) setStep((s) => s + 1);
  };

  const redirectTo = `${getSiteUrl()}/auth/confirm?type=signup&next=%2Fbusiness%2Fdashboard`;

  const onSubmit = form.handleSubmit(async (values) => {
    if (!realAuth || !supabase) {
      await authService.signIn("business");
      toast.success("Business account created", { description: "Welcome to Rewardly — your dashboard is ready." });
      router.push("/business/dashboard");
      return;
    }

    // Already signed in (e.g. routed here from the login page): complete the
    // business onboarding through the audited, idempotent RPC.
    if (existingSession.current) {
      const { error } = await supabase.rpc("complete_business_signup", {
        p_business_name: values.businessName.trim(),
        p_legal_name: values.businessName.trim(),
        p_gstin: values.gst?.trim() || null,
        p_support_phone: values.phone ? `+91${values.phone.trim()}` : null,
        p_support_email: values.email.trim().toLowerCase(),
      });
      if (error) {
        toast.error("Couldn't set up your business", { description: authErrorMessage(error, "Please try again.") });
        return;
      }
      toast.success("Business account ready", { description: "Welcome to Rewardly — your dashboard is ready." });
      router.push("/business/dashboard");
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: values.email.trim().toLowerCase(),
      password: values.password,
      options: {
        data: {
          full_name: values.ownerName.trim(),
          phone: `+91${values.phone.trim()}`,
          signup_context: "business",
          business_name: values.businessName.trim(),
          business_city: values.city.trim(),
          gstin: values.gst?.trim() || null,
        },
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      toast.error("Couldn't create your account", {
        description: authErrorMessage(error, "Please check your details and try again."),
      });
      return;
    }

    if (data.session) {
      // Confirmation disabled — the business layout guard completes onboarding.
      toast.success("Business account created", { description: "Welcome to Rewardly — your dashboard is ready." });
      router.push("/business/dashboard");
      router.refresh();
      return;
    }

    setPendingEmail(values.email.trim().toLowerCase());
    setResendIn(60);
  });

  const resendConfirmation = async () => {
    if (!supabase || !pendingEmail || resendIn > 0) return;
    setResendIn(60);
    const { error } = await supabase.auth.resend({ type: "signup", email: pendingEmail, options: { emailRedirectTo: redirectTo } });
    if (error) toast.error("Couldn't resend the email", { description: authErrorMessage(error, "Please try again shortly.") });
    else toast.success("Confirmation email resent", { description: `Check ${pendingEmail} — the code lasts 10 minutes.` });
  };

  if (pendingEmail) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border bg-card p-7 text-center shadow-sm"
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <MailCheck className="size-6" />
        </div>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">Confirm your email</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground">{pendingEmail}</span>, a confirmation
          email is on its way. Confirm it and your business workspace is provisioned automatically — business profile,
          main store and your owner access.
        </p>
        <Button size="lg" className="mt-5 w-full" onClick={resendConfirmation} disabled={resendIn > 0}>
          {resendIn > 0 ? `Resend confirmation email in ${resendIn}s` : "Resend confirmation email"}
        </Button>
        <Button asChild variant="ghost" size="sm" className="mt-2 w-full">
          <Link href="/login">Already confirmed? Sign in</Link>
        </Button>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5" aria-label="Signup progress">
        {stepTitles.map((t, i) => (
          <div key={t} className="flex flex-1 items-center gap-1.5">
            <div
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition-colors",
                i < step && "border-primary bg-primary text-primary-foreground",
                i === step && "border-primary text-primary",
                i > step && "text-muted-foreground"
              )}
              aria-current={i === step ? "step" : undefined}
            >
              {i < step ? <Check className="size-3" aria-hidden /> : i + 1}
            </div>
            {i < stepTitles.length - 1 && <div className={cn("h-px flex-1 bg-border", i < step && "bg-primary")} />}
          </div>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            <p className="text-sm font-medium text-muted-foreground">Step {step + 1} of 3 · {stepTitles[step]}</p>

            {step === 0 && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="bname">Business name</Label>
                  <Input id="bname" placeholder="Ambika Electricals" {...form.register("businessName")} aria-invalid={!!form.formState.errors.businessName} />
                  <FieldError message={form.formState.errors.businessName?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label>Business category</Label>
                  <Select value={form.watch("category")} onValueChange={(v) => form.setValue("category", v, { shouldValidate: true })}>
                    <SelectTrigger aria-label="Business category"><SelectValue /></SelectTrigger>
                    <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                  <FieldError message={form.formState.errors.category?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bcity">City</Label>
                  <Input id="bcity" placeholder="Surat, Gujarat" {...form.register("city")} aria-invalid={!!form.formState.errors.city} />
                  <FieldError message={form.formState.errors.city?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bgst">GST number (optional)</Label>
                  <Input id="bgst" placeholder="24ABKPE1234K1Z9" {...form.register("gst")} />
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="bowner">Owner name</Label>
                  <Input id="bowner" placeholder="Nitin Trivedi" {...form.register("ownerName")} aria-invalid={!!form.formState.errors.ownerName} />
                  <FieldError message={form.formState.errors.ownerName?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bphone">Mobile number</Label>
                  <Input id="bphone" inputMode="numeric" placeholder="9825041200" {...form.register("phone")} aria-invalid={!!form.formState.errors.phone} />
                  <FieldError message={form.formState.errors.phone?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bemail">Work email</Label>
                  <Input id="bemail" type="email" placeholder="owner@ambikaelectricals.in" {...form.register("email")} aria-invalid={!!form.formState.errors.email} />
                  <FieldError message={form.formState.errors.email?.message} />
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="bpassword">Create password</Label>
                  <PasswordField id="bpassword" autoComplete="new-password" {...form.register("password")} aria-invalid={!!form.formState.errors.password} />
                  <PasswordStrength value={form.watch("password") ?? ""} />
                  <FieldError message={form.formState.errors.password?.message} />
                </div>
                <label className="flex items-start gap-2.5 text-sm">
                  <Checkbox
                    checked={form.watch("terms") === true}
                    onCheckedChange={(c) => form.setValue("terms", c === true, { shouldValidate: true })}
                    aria-label="Accept terms"
                    className="mt-0.5"
                  />
                  <span className="text-muted-foreground">
                    I agree to the <span className="text-foreground underline underline-offset-2">Terms of Service</span> and{" "}
                    <span className="text-foreground underline underline-offset-2">Privacy Policy</span>.
                  </span>
                </label>
                <FieldError message={form.formState.errors.terms?.message} />
              </>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center gap-2">
          {step > 0 && (
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}><ChevronLeft /> Back</Button>
          )}
          {step < 2 ? (
            <Button type="button" className="flex-1" onClick={next}>Continue</Button>
          ) : (
            <Button type="submit" className="flex-1" loading={form.formState.isSubmitting}>Create business account</Button>
          )}
        </div>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">Sign in</Link>
      </p>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}
