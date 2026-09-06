import "server-only";

import { redact, redactValue } from "@/lib/observability/redact";

export { redact } from "@/lib/observability/redact";

/**
 * Structured logging with redaction (FINAL_MVP_LAUNCH_COMPLETION.md §7).
 *
 * Design intent: every server-side log line is a single JSON object on one
 * line, so a hosting platform's log drain can index it without a custom
 * parser, and so a human grepping production has something better than prose.
 *
 * The redaction pass is the part that matters. Loyalty data is not especially
 * secret, but this system handles things that genuinely must never reach a log
 * aggregator:
 *
 *   • the Supabase service-role key and any JWT (they are bearer credentials);
 *   • membership QR tokens (a QR token IS the capability — §3);
 *   • redemption collection codes (same);
 *   • customer phone numbers and email addresses (PII we deliberately store
 *     masked in the database, so logging the raw value would undo that).
 *
 * Redaction is applied by KEY NAME and by VALUE SHAPE, because the two fail in
 * different ways: a key allow-list misses `{ data: "<a jwt>" }`, and a value
 * matcher misses `{ token: "abc" }`. Doing both is the only way this is
 * dependable enough to be worth having.
 *
 * This module intentionally has no transport. It writes to stdout/stderr,
 * which is what every serverless host already collects. Wiring an error
 * tracker (Sentry, Axiom, Better Stack) is one call in `emit()` and an owner
 * decision — documented in OPERATIONS.md rather than half-built here.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Below this, nothing is emitted. Production defaults to `info`. */
const MIN_LEVEL: number =
  LEVELS[(process.env.LOG_LEVEL as LogLevel) ?? (process.env.NODE_ENV === "production" ? "info" : "debug")] ??
  LEVELS.info;

export interface LogContext {
  /** Coarse area, e.g. "pos", "qr", "loyalty" — makes filtering possible. */
  scope?: string;
  /** Correlates the lines belonging to one request. */
  requestId?: string;
  /** Tenant, for multi-tenant triage. Never a customer identifier. */
  businessId?: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (LEVELS[level] < MIN_LEVEL) return;

  const line = {
    ts: new Date().toISOString(),
    level,
    msg: redactValue(message),
    ...(redact(context ?? {}) as Record<string, unknown>),
  };

  let serialized: string;
  try {
    serialized = JSON.stringify(line);
  } catch {
    serialized = JSON.stringify({ ts: line.ts, level, msg: "[unserializable log payload]" });
  }

  // stderr for warn/error so hosts that split streams classify them correctly.
  if (level === "error" || level === "warn") process.stderr.write(`${serialized}\n`);
  else process.stdout.write(`${serialized}\n`);
}

export const log = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
};
