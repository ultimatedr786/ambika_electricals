import { NextResponse } from "next/server";

/**
 * Liveness probe (FINAL_MVP_LAUNCH_COMPLETION.md §7).
 *
 * "Is this process running and able to serve HTTP?" — nothing more. It must
 * never touch the database or any third party: a liveness check that depends
 * on a downstream service will tell the platform to restart a perfectly
 * healthy container during someone else's outage.
 *
 * Deliberately leaks nothing: no version of Node, no environment name, no
 * configuration. An unauthenticated endpoint is a reconnaissance surface.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    { status: "ok", ts: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } }
  );
}
