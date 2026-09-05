import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/auth/env";

/**
 * Server Supabase client for the recommended SSR cookie integration.
 *
 * Reads/writes the auth session through Next's cookie store, so server
 * components, server actions and route handlers all see the same session as
 * the browser. Cookie writes are wrapped in try/catch because Next forbids
 * setting cookies while a Server Component is rendering — the session-refresh
 * proxy (src/proxy.ts) owns that write path.
 *
 * Returns null when Supabase is not configured (Demo mode fallback).
 */
export async function createClient() {
  const env = getSupabaseEnv();
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component render — safe to ignore because the
          // proxy refreshes the session on every request.
        }
      },
    },
  });
}

export type ServerSupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;
