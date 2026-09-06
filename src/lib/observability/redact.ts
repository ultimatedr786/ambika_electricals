/**
 * Redaction rules for structured logs (FINAL_MVP_LAUNCH_COMPLETION.md §7).
 *
 * Split out of `logger.ts` — which is `server-only` — so the rules themselves
 * can be unit tested (tests/logger-redaction.test.mjs). Redaction that is not
 * tested is redaction that quietly stops working the first time somebody
 * renames a field.
 *
 * Two independent mechanisms, because each misses what the other catches:
 * a key allow-list never sees `{ data: "<a jwt>" }`, and a value matcher never
 * sees `{ token: "abc" }`.
 */

/** Keys whose value is replaced wholesale, matched case-insensitively. */
const REDACT_KEYS = [
  "password", "passwd", "secret", "token", "jwt", "authorization", "auth",
  "apikey", "api_key", "service_role", "servicerolekey", "anonkey", "anon_key",
  "cookie", "session", "refresh_token", "access_token",
  "code", "code_hash", "verifier", "verifier_hash", "salt",
  "email", "phone", "mobile", "gstin", "otp",
];

/** Values that look like credentials or PII regardless of their key. */
const VALUE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /^eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}$/, label: "[REDACTED:jwt]" },
  { re: /^RWD1\.[0-9A-HJKMNP-TV-Z]{16}\.[0-9A-HJKMNP-TV-Z]{26}$/, label: "[REDACTED:qr-token]" },
  { re: /^sb_(secret|publishable)_[A-Za-z0-9_-]+$/, label: "[REDACTED:supabase-key]" },
  { re: /^re_[A-Za-z0-9]{20,}$/, label: "[REDACTED:resend-key]" },
  { re: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, label: "[REDACTED:email]" },
  // Indian mobile numbers, with or without the country code.
  { re: /^(\+?91[\s-]?)?[6-9]\d{9}$/, label: "[REDACTED:phone]" },
];

const MAX_DEPTH = 6;
const MAX_ARRAY = 50;

export function redactValue(value: string): string {
  for (const p of VALUE_PATTERNS) {
    if (p.re.test(value.trim())) return p.label;
  }
  return value;
}

export function shouldRedactKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[^a-z_]/g, "");
  return REDACT_KEYS.some((r) => k === r || k.endsWith(r) || k.startsWith(r));
}

/**
 * Deep-clean a payload. Never throws: a logger that can crash the request it
 * is describing is worse than no logger, so anything unserializable becomes a
 * short marker instead.
 */
export function redact(input: unknown, depth = 0): unknown {
  if (input == null) return input;
  if (depth > MAX_DEPTH) return "[truncated:depth]";

  if (typeof input === "string") return redactValue(input);
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (typeof input === "bigint") return input.toString();
  if (typeof input === "function") return "[function]";

  if (input instanceof Error) {
    return {
      name: input.name,
      message: redactValue(input.message),
      // Stacks can contain query strings and interpolated values.
      stack: typeof input.stack === "string" ? redactValue(input.stack.split("\n").slice(0, 5).join("\n")) : undefined,
    };
  }
  if (input instanceof Date) return input.toISOString();

  if (Array.isArray(input)) {
    const out = input.slice(0, MAX_ARRAY).map((v) => redact(v, depth + 1));
    if (input.length > MAX_ARRAY) out.push(`[truncated:${input.length - MAX_ARRAY} more]`);
    return out;
  }

  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (shouldRedactKey(k)) {
        out[k] = v == null ? v : "[REDACTED]";
        continue;
      }
      out[k] = redact(v, depth + 1);
    }
    return out;
  }

  return "[unserializable]";
}

