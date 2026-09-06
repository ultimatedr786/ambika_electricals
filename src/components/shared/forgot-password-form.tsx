"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/auth/env";
import { authErrorMessage } from "@/lib/auth/client-flows";

const schema = z.object({
  email: z.string().email("Enter your email address"),
});
type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const supabase = React.useMemo(() => createClient(), []);
  const realAuth = isSupabaseConfigured() && supabase !== null;
  const [sent, setSent] = React.useState<string | null>(null);
  const [resendIn, setResendIn] = React.useState(0);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  React.useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearInterval(t);
  }, [resendIn]);

  const redirectTo = `${getSiteUrl()}/auth/confirm?type=recovery&next=%2Freset-password`;

  const sendReset = async (email: string) => {
    const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      toast.error("Couldn't send the reset email", {
        description: authErrorMessage(error, "Please try again shortly."),
      });
      return false;
    }
    return true;
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const email = values.email.trim().toLowerCase();
    if (realAuth) {
      const ok = await sendReset(email);
      // Non-enumerating: the same screen appears whether or not the send
      // revealed an existing account (Supabase never tells us either way).
      setSent(email);
      setResendIn(60);
      if (!ok) return;
    } else {
      setSent(email);
      setResendIn(60);
    }
  });

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="rounded-2xl border bg-card p-7 text-center shadow-sm"
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <MailCheck className="size-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-tight">Check your inbox</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground">{sent}</span>, a password-reset email
          is on its way. Open it and choose a new password.
        </p>
        <Button
          size="lg"
          className="mt-5 w-full"
          disabled={resendIn > 0}
          onClick={async () => {
            setResendIn(60);
            if (realAuth) await sendReset(sent);
            else toast.info("Demo mode — no email is actually sent.");
          }}
        >
          {resendIn > 0 ? `Resend email in ${resendIn}s` : "Resend email"}
        </Button>
        <Button asChild variant="ghost" size="lg" className="mt-2 w-full">
          <Link href="/login">Back to Login</Link>
        </Button>
        <button
          type="button"
          onClick={() => setSent(null)}
          className="mt-1 text-sm text-muted-foreground hover:text-foreground"
        >
          Use a different email
        </button>
        {!realAuth && (
          <p className="mt-4 text-[11px] text-muted-foreground">
            Prototype demo mode — no email is actually sent.
          </p>
        )}
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="identifier">Email address</Label>
        <Input
          id="identifier"
          type="email"
          autoComplete="username"
          placeholder="you@example.com"
          autoFocus
          {...form.register("email")}
        />
        {form.formState.errors.email && (
          <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
        )}
        <p className="text-[13px] text-muted-foreground">
          We&apos;ll email you a secure link to choose a new password. For your safety, changing a password requires this
          recovery link or a fresh sign-in.
        </p>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
        Send Reset Link
      </Button>
      <Button asChild variant="ghost" size="lg" className="w-full">
        <Link href="/login"><ArrowLeft className="mr-1.5 size-4" /> Back to Login</Link>
      </Button>
    </form>
  );
}
