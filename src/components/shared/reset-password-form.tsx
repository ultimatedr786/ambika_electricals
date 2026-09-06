"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, KeyRound, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordField, PasswordStrength, passwordScore } from "@/components/shared/password-field";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { safeReturnTo } from "@/lib/auth/redirects";
import { authErrorMessage, resolveRoleHome } from "@/lib/auth/client-flows";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .regex(/[A-Z]/, "Add an uppercase letter")
      .regex(/\d/, "Add a number")
      .regex(/[^A-Za-z0-9]/, "Add a special character"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

type Values = z.infer<typeof schema>;

/** Reached from the recovery email via /auth/confirm?type=recovery. */
export function ResetPasswordForm({ next }: { next?: string | null }) {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const realAuth = isSupabaseConfigured() && supabase !== null;
  const returnTo = React.useMemo(() => safeReturnTo(next, "/"), [next]);
  const [state, setState] = React.useState<"checking" | "ready" | "no-session">("checking");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: { password: "", confirm: "" },
  });
  const password = form.watch("password") ?? "";

  React.useEffect(() => {
    if (!realAuth) {
      setState("no-session");
      return;
    }
    supabase!.auth.getUser().then(({ data }) => setState(data.user ? "ready" : "no-session"));
  }, [realAuth, supabase]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!realAuth || !supabase) return;
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      toast.error("Couldn't update your password", {
        description: authErrorMessage(error, "Please try again — the reset link may have expired."),
      });
      return;
    }
    toast.success("Password updated", { description: "Use your new password the next time you sign in." });
    router.push(returnTo !== "/" ? returnTo : await resolveRoleHome(supabase));
    router.refresh();
  });

  if (state === "checking") {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        Checking your reset session…
      </div>
    );
  }

  if (state === "no-session") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="rounded-2xl border bg-card p-7 text-center shadow-sm"
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
          <ShieldAlert className="size-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-tight">No active reset session</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {realAuth
            ? "Password resets start from the email link, which expires after an hour. Request a fresh one to continue."
            : "This is the demo prototype — passwords are fixed (Demo@123). In the real deployment this page is reached from the reset email."}
        </p>
        <Button asChild size="lg" className="mt-5 w-full">
          <Link href="/forgot-password"><KeyRound className="mr-1.5 size-4" /> Request a reset email</Link>
        </Button>
        <Button asChild variant="ghost" size="lg" className="mt-2 w-full">
          <Link href="/login"><ArrowLeft className="mr-1.5 size-4" /> Back to Login</Link>
        </Button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="new-password">New password</Label>
        <PasswordField
          id="new-password"
          autoComplete="new-password"
          placeholder="Choose a strong password"
          autoFocus
          {...form.register("password")}
        />
        <PasswordStrength value={password} />
        {form.formState.errors.password && (
          <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <PasswordField
          id="confirm-password"
          autoComplete="new-password"
          placeholder="Re-enter your new password"
          {...form.register("confirm")}
        />
        {form.formState.errors.confirm && (
          <p className="text-xs text-destructive">{form.formState.errors.confirm.message}</p>
        )}
      </div>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={form.formState.isSubmitting}
        disabled={passwordScore(password) < 4}
      >
        Update Password
      </Button>
      <p className="text-center text-[13px] text-muted-foreground">
        For your safety this page only works from the recovery email (or a fresh sign-in).
      </p>
    </form>
  );
}
