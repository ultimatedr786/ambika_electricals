"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/auth/env";

/**
 * Browser Supabase client — publishable/anon key ONLY.
 *
 * Security rule (Stage B.4): this module must never reference the service-role
 * key. All privileged operations go through server actions / route handlers
 * that use src/lib/supabase/admin.ts, which imports "server-only".
 *
 * Returns null when Supabase is not configured so callers can fall back to
 * Demo mode instead of crashing.
 */
export function createClient() {
  const env = getSupabaseEnv();
  if (!env) return null;
  return createBrowserClient(env.url, env.publishableKey);
}

export type BrowserSupabaseClient = NonNullable<ReturnType<typeof createClient>>;
