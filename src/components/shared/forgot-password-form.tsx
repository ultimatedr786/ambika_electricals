"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  identifier: z.string().min(3, "Enter your email address or mobile number"),
});
type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { identifier: "" } });

  const onSubmit = form.handleSubmit((values) => {
    setSent(values.identifier);
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
          We&apos;ve sent reset instructions to <span className="font-medium text-foreground">{sent}</span>. The link is
          valid for 30 minutes.
        </p>
        <Button asChild size="lg" className="mt-5 w-full">
          <Link href="/login">Back to Login</Link>
        </Button>
        <button
          type="button"
          onClick={() => setSent(null)}
          className="mt-3 text-sm text-muted-foreground hover:text-foreground"
        >
          Use a different email or number
        </button>
        <p className="mt-4 text-[11px] text-muted-foreground">
          Prototype only — no email or SMS is actually sent.
        </p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="identifier">Email or mobile number</Label>
        <Input id="identifier" placeholder="rahul@demo.com" autoFocus {...form.register("identifier")} />
        {form.formState.errors.identifier && (
          <p className="text-xs text-destructive">{form.formState.errors.identifier.message}</p>
        )}
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
