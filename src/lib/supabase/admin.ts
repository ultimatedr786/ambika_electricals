import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin Supabase client — SERVICE ROLE. Server-only by construction:
 * the "server-only" package makes any browser import a build-time error, and
 * the key itself is read from a non-NEXT_PUBLIC environment variable, so it
 * can never be inlined into a client bundle.
 *
 * Reserve for trusted server operations only (Stage D principle):
 * - verifying email-confirmation / recovery token hashes in /auth/confirm
 * - looking up invitation records while sending invitation emails
 * - maintenance scripts
 *
 * RLS is bypassed by this key — every use must be justified in code review.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Admin Supabase client unavailable: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the server."
    );
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
