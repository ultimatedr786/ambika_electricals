/**
 * Membership QR token format helpers (Step 3 Slice 4).
 *
 * The wire format is `RWD1.<selector>.<secret>` where both halves are
 * Crockford base-32 (no I, L, O or U — the characters people misread). The
 * database mints and verifies the token; these helpers only mirror the format
 * so the client can reject junk before spending a round trip and can display
 * the code in a readable way when a scanner is unavailable.
 *
 * Pure module on purpose: no React, no Next, no Supabase — it is unit-tested
 * directly (tests/qr-token.test.mjs) and shared by the server action, the
 * customer QR card and the counter scanner.
 */

/** Version prefix. Bump alongside a database-side format change. */
export const QR_TOKEN_VERSION = "RWD1";

/** Exact shape of a normalized token. */
export const QR_TOKEN_RE = /^RWD1\.[0-9A-HJKMNP-TV-Z]{16}\.[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Mirror of the database's `qr_normalize`: upper-case, drop spaces/hyphens and
 * fold the visually ambiguous characters (O→0, I/L→1) so a code read aloud or
 * keyed in by hand still verifies. Dots are preserved — they separate the
 * public selector from the secret.
 */
export function normalizeQrToken(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]+/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

/** True when `raw` could be a token at all (cheap client-side pre-check). */
export function isQrTokenShape(raw: string): boolean {
  return QR_TOKEN_RE.test(normalizeQrToken(raw));
}

/**
 * The public half of the token. Safe to log or audit — it identifies the row,
 * not the bearer, and is useless without the secret.
 */
export function qrTokenSelector(raw: string): string | null {
  const token = normalizeQrToken(raw);
  if (!QR_TOKEN_RE.test(token)) return null;
  return token.split(".")[1];
}

/** Group into 4-character blocks so a human can read the code out at a counter. */
export function groupQrToken(raw: string): string {
  const token = normalizeQrToken(raw);
  const [, selector = "", secret = ""] = token.split(".");
  const chunk = (s: string) => (s.match(/.{1,4}/g) ?? []).join(" ");
  return `${chunk(selector)}  ·  ${chunk(secret)}`;
}
