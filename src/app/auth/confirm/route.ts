import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { homeForViewer, safeReturnTo, type BusinessRole } from "@/lib/auth/redirects";

/**
 * GET /auth/confirm?token_hash=…&type=…&next=…
 *
 * Server-side exchange of the emailed token for a session (Stage E.5):
 *  - type=signup | magiclink | email → session established, then routed to the
 *    validated `next` path or the viewer's role home.
 *  - type=recovery → routed to /reset-password to choose a new password.
 *  - Anything failing lands on /login with a non-enumerating error flag.
 *
 * The `next` value always passes safeReturnTo() so a crafted email link can
 * never redirect off this origin.
 */

const OTP_TYPES: EmailOtpType[] = ["signup", "magiclink", "recovery", "email", "email_change", "invite"];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type") as EmailOtpType | null;
  const explicitNext = searchParams.get("next");
  const fallbackNext = safeReturnTo(explicitNext, "/");

  const toLogin = (code: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(code)}`);

  if (!tokenHash || !rawType || !OTP_TYPES.includes(rawType)) {
    return toLogin("invalid_link");
  }

  const supabase = await createClient();
  if (!supabase) return toLogin("auth_unconfigured");

  const { error } = await supabase.auth.verifyOtp({ type: rawType, token_hash: tokenHash });
  if (error) {
    // Distinguish only enough to help UX; never leak account details.
    const message = /expired/i.test(error.message) ? "code_expired" : "invalid_link";
    return toLogin(message);
  }

  if (rawType === "recovery") {
    return NextResponse.redirect(
      `${origin}/reset-password?next=${encodeURIComponent(fallbackNext)}`
    );
  }

  // Route by explicit `next` when present, otherwise by role.
  if (explicitNext && fallbackNext !== "/") {
    return NextResponse.redirect(`${origin}${fallbackNext}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  let businessRoles: BusinessRole[] = [];
  if (user) {
    const { data } = await supabase
      .from("business_memberships")
      .select("role")
      .eq("profile_id", user.id)
      .eq("status", "active");
    businessRoles = ((data ?? []) as { role: BusinessRole }[]).map((r) => r.role);
    // A business-intent signup without a membership yet gets sent to the
    // business area so its layout completes onboarding via the audited RPC.
    const md = (user.user_metadata ?? {}) as Record<string, unknown>;
    if (businessRoles.length === 0 && md.signup_context === "business") {
      return NextResponse.redirect(`${origin}/business/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}${homeForViewer({ businessRoles })}`);
}
