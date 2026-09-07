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
 *
 * A third case neither of those catches on its own: a secret embedded inside
 * a larger string (a JWT in a redirect URL, a QR token in a log sentence, a
 * whole JSON blob captured as text before it was ever parsed into an object).
 * `EMBEDDED_PATTERNS` below handles that by replacing just the matched
 * substring rather than requiring the whole value to be the secret.
 */

/** Keys whose value is replaced wholesale, matched case-insensitively. */
const REDACT_KEYS = [
  "password", "passwd", "secret", "token", "jwt", "authorization", "auth",
  "apikey", "api_key", "service_role", "servicerolekey", "anonkey", "anon_key",
  "cookie", "session", "refresh_token", "access_token",
  "code", "code_hash", "verifier", "verifier_hash", "salt",
  "email", "phone", "mobile", "gstin", "otp",
];

/**
 * Values that look like credentials or PII regardless of their key, matched
 * against the *entire* trimmed string. Kept as a fast, exact check for the
 * overwhelmingly common case (the field's whole value is the secret) —
 * EMBEDDED_PATTERNS below is the fallback for a secret inside a larger string.
 */
const VALUE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /^eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}$/, label: "[REDACTED:jwt]" },
  { re: /^RWD1\.[0-9A-HJKMNP-TV-Z]{16}\.[0-9A-HJKMNP-TV-Z]{26}$/, label: "[REDACTED:qr-token]" },
  { re: /^sb_(secret|publishable)_[A-Za-z0-9_-]+$/, label: "[REDACTED:supabase-key]" },
  { re: /^re_[A-Za-z0-9]{20,}$/, label: "[REDACTED:resend-key]" },
  { re: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, label: "[REDACTED:email]" },
  // Indian mobile numbers, with or without the country code.
  { re: /^(\+?91[\s-]?)?[6-9]\d{9}$/, label: "[REDACTED:phone]" },
  // GSTIN: 2-digit state code, 10-char PAN, entity code, 'Z', checksum.
  { re: /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/, label: "[REDACTED:gstin]" },
];

/**
 * The same secret shapes, but matched as a substring of a larger string (a
 * URL, a sentence, a curl command) and replaced in place rather than
 * requiring the whole value to be the secret. Each pattern is global and
 * bounded (word/digit boundaries, distinctive prefixes) to keep ordinary IDs,
 * invoice numbers and UUIDs from being caught by accident — see
 * "avoid over-redacting ordinary IDs" in the test suite.
 */
const EMBEDDED_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, label: "[REDACTED:jwt]" },
  { re: /RWD1\.[0-9A-HJKMNP-TV-Z]{16}\.[0-9A-HJKMNP-TV-Z]{26}/g, label: "[REDACTED:qr-token]" },
  { re: /sb_(secret|publishable)_[A-Za-z0-9_-]+/g, label: "[REDACTED:supabase-key]" },
  { re: /re_[A-Za-z0-9]{20,}/g, label: "[REDACTED:resend-key]" },
  { re: /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g, label: "[REDACTED:email]" },
  // Indian mobile numbers — not part of a longer run of digits either side,
  // so a 10-digit substring of an unrelated longer ID is left alone.
  { re: /(?<!\d)(\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g, label: "[REDACTED:phone]" },
  // GSTIN — not part of a longer alphanumeric run either side.
  { re: /(?<![A-Z0-9])\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9](?![A-Z0-9])/g, label: "[REDACTED:gstin]" },
];

const MAX_DEPTH = 6;
const MAX_ARRAY = 50;

/** True for a string that looks like it might be a JSON object/array. */
function looksLikeJson(value: string): boolean {
  return (
    (value.startsWith("{") && value.endsWith("}")) ||
    (value.startsWith("[") && value.endsWith("]"))
  );
}

export function redactValue(value: string, depth = 0): string {
  const trimmed = value.trim();

  // A pre-serialized JSON blob (a captured request/response body, a
  // JSON.stringify'd context object) bypasses every other check below unless
  // it is parsed first — redact its contents, then re-serialize so the log
  // line stays readable.
  if (depth <= MAX_DEPTH && looksLikeJson(trimmed)) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === "object") {
        return JSON.stringify(redact(parsed, depth + 1));
      }
    } catch {
      // Not actually JSON — fall through to the string checks below.
    }
  }

  for (const p of VALUE_PATTERNS) {
    if (p.re.test(trimmed)) return p.label;
  }

  let out = value;
  for (const p of EMBEDDED_PATTERNS) {
    out = out.replace(p.re, p.label);
  }
  return out;
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

  if (typeof input === "string") return redactValue(input, depth);
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (typeof input === "bigint") return input.toString();
  if (typeof input === "function") return "[function]";

  if (input instanceof Error) {
    return {
      name: input.name,
      message: redactValue(input.message, depth),
      // Stacks can contain query strings and interpolated values.
      stack: typeof input.stack === "string" ? redactValue(input.stack.split("\n").slice(0, 5).join("\n"), depth) : undefined,
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
