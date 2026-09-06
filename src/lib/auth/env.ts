/**
 * Environment + mode detection shared by client and server code.
 *
 * Only NEXT_PUBLIC_* values and NODE_ENV are read here, so this module is safe
 * to import from browser bundles. Server-only secrets (service role, Resend)
 * are handled in src/lib/supabase/admin.ts and src/lib/auth/invite-mailer.ts.
 */

export interface SupabaseEnv {
  url: string;
  publishableKey: string;
}

/**
 * True when both public Supabase values are present. This is the single
 * production boundary that switches the app from Demo mode to real auth:
 * - configured   → real Supabase sessions, protected routes, demo bypass OFF
 *                  in production builds.
 * - not configured → the Phase 1 mock app keeps working (local demo mode).
 */
export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}

/** Absolute origin used to build auth redirect URLs (SSR-safe). */
export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Demo mode (mock sign-in quick fill + persona switcher) is a development /
 * preview mechanism, never a production authorization path:
 * - While Supabase is not configured the whole app is the Phase 1 demo, so the
 *   demo affordances stay visible (and clearly labelled).
 * - Once Supabase IS configured, demo affordances disappear from production
 *   builds entirely. In development builds they can be re-enabled explicitly
 *   with NEXT_PUBLIC_DEMO_AUTH=true for side-by-side testing.
 */
export function isDemoAuthEnabled(): boolean {
  if (!isSupabaseConfigured()) return true;
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEMO_AUTH === "true";
}

/**
 * Internal developer/preview tooling — the persona switcher and the
 * "reset demo data" control (MVP hotfix §"Remove visible Demo Mode").
 *
 * This is deliberately STRICTER than {@link isDemoAuthEnabled}: it is OFF by
 * default everywhere, including local demo runs, so the persona switcher never
 * appears in normal user-facing chrome (headers, account menus, sidebars,
 * mobile navigation). A developer opts in explicitly with
 * `NEXT_PUBLIC_DEMO_DEVTOOLS=true` in a non-production build.
 *
 * It must never act as an authorization path: the switcher only mutates the
 * local mock store, and every real route/data boundary is enforced by the
 * server guards in `src/lib/auth/session.ts` plus RLS.
 */
export function isDemoDevToolsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEMO_DEVTOOLS === "true";
}
