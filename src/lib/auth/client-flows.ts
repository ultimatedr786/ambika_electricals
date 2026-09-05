"use client";

/**
 * Client-side auth flow helpers (Stage E/F).
 *
 * Supabase owns every real credential check; these helpers only translate
 * results/errors into safe, non-enumerating UX and decide where a freshly
 * signed-in viewer belongs (role home vs. preserved return-to).
 */

import type { BrowserSupabaseClient } from "@/lib/supabase/client";
import { homeForViewer, type BusinessRole } from "@/lib/auth/redirects";

/** Ask Supabase (RLS-scoped to the viewer) where they belong after sign-in. */
export async function resolveRoleHome(
  supabase: BrowserSupabaseClient
): Promise<"/business/dashboard" | "/customer/dashboard"> {
  const { data } = await supabase
    .from("business_memberships")
    .select("role")
    .eq("status", "active");
  const roles = ((data ?? []) as { role: BusinessRole }[]).map((r) => r.role);
  return homeForViewer({ businessRoles: roles });
}

type AuthError = { message?: string; status?: number; code?: string } | null | undefined;

/**
 * Maps Supabase Auth errors to calm, non-enumerating copy. Never reveals
 * whether an account exists; rate limits get a retry-later message.
 */
export function authErrorMessage(error: AuthError, fallback: string): string {
  if (!error) return fallback;
  const message = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";

  if (error.status === 429 || message.includes("rate limit") || message.includes("too many")) {
    return "Too many attempts just now. Please wait a minute and try again.";
  }
  if (message.includes("invalid login credentials") || code === "invalid_credentials") {
    return "Email or password doesn't look right.";
  }
  if (message.includes("email not confirmed") || code === "email_not_confirmed") {
    return "Your email isn't confirmed yet — check your inbox for the 6-digit code or confirmation link.";
  }
  if (message.includes("expired") || code === "otp_expired") {
    return "That code has expired. Request a new one — they're only valid for 10 minutes.";
  }
  if (message.includes("token") && message.includes("invalid")) {
    return "That code isn't valid. Check the email for the latest code and try again.";
  }
  if (message.includes("password") && (message.includes("short") || message.includes("weak"))) {
    return "Please choose a stronger password (8+ characters, upper, lower, number, symbol).";
  }
  return fallback;
}

export function isRateLimited(error: AuthError): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return error.status === 429 || message.includes("rate limit") || message.includes("too many");
}
