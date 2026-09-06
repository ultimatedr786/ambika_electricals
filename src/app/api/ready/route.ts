import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { log } from "@/lib/observability/logger";

/**
 * Readiness probe (FINAL_MVP_LAUNCH_COMPLETION.md §7).
 *
 * "Should this instance receive traffic?" — which, unlike liveness, does
 * depend on the database being reachable.
 *
 * Three deliberate decisions:
 *
 *   1. **Demo mode is READY.** With Supabase unconfigured the app runs its
 *      mock fallback, which is a valid, serviceable state. Reporting "not
 *      ready" would make a preview deployment un-routable for no reason.
 *   2. **The check is cheap and unauthenticated-safe.** It asks PostgREST for
 *      nothing but a HEAD count on a table every signed-out visitor could
 *      already fail to read; it never uses the service-role key, so a probe
 *      cannot become a data-exfiltration path.
 *   3. **The body says almost nothing.** `degraded` tells an operator to look
 *      at the logs; the reason goes to the log line, not to the response.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIMEOUT_MS = 3000;

export async function GET() {
  const started = Date.now();

  if (!isSupabaseConfigured()) {
    // Mock fallback: serviceable by design.
    return NextResponse.json(
      { status: "ready", mode: "demo", ts: new Date().toISOString() },
      { headers: { "cache-control": "no-store" } }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${url}/rest/v1/`, {
      method: "GET",
      headers: { apikey: key ?? "", accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);

    if (!res.ok) {
      log.error("readiness: PostgREST responded unhealthily", {
        scope: "health",
        status: res.status,
        elapsedMs: Date.now() - started,
      });
      return NextResponse.json(
        { status: "degraded", ts: new Date().toISOString() },
        { status: 503, headers: { "cache-control": "no-store" } }
      );
    }

    return NextResponse.json(
      { status: "ready", mode: "live", elapsedMs: Date.now() - started, ts: new Date().toISOString() },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    log.error("readiness: could not reach Supabase", {
      scope: "health",
      error,
      elapsedMs: Date.now() - started,
    });
    return NextResponse.json(
      { status: "degraded", ts: new Date().toISOString() },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}
