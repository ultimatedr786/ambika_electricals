/**
 * Redirect safety + role-based home routing (Stage E.4/E.5).
 * Pure functions — covered by tests/redirects.test.mjs (`npm test`).
 */

export type BusinessRole = "owner" | "manager" | "staff" | "super_admin";

/** Where a signed-in viewer lands after authentication. */
export function homeForViewer(viewer: {
  businessRoles: BusinessRole[];
}): "/business/dashboard" | "/customer/dashboard" {
  return viewer.businessRoles.length > 0 ? "/business/dashboard" : "/customer/dashboard";
}

/**
 * Validates a `next`/return-to destination coming from a URL (login redirect,
 * email link). Only same-origin relative paths are allowed — this is the
 * open-redirect defense required by Stage E.5.
 *
 * Rejected (fall back to `fallback`):
 *  - absolute URLs of any protocol (https://evil.example, javascript:…)
 *  - protocol-relative URLs (//evil.example, /\\evil.example)
 *  - backslash tricks (/\evil.example), encoded variants (%2f%2f)
 *  - non-"/" prefixes, empty strings, anything with a scheme
 *  - deep auth endpoints (avoid /auth/confirm → /auth/confirm loops)
 */
export function safeReturnTo(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;

  let value = raw.trim();
  if (!value) return fallback;

  // Decode up to two layers of percent-encoding to catch %2f%2fevil.com and
  // double-encoded variants. Malformed sequences throw → reject.
  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch {
      return fallback;
    }
  }

  // Must be a relative path.
  if (!value.startsWith("/")) return fallback;
  // Reject protocol-relative and backslash escapes anywhere in the prefix.
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Reject any embedded control characters or scheme markers.
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  if (/^[^?#]*:(?!\/\/)/.test(value.replace(/^\//, "")) && !value.startsWith("/")) return fallback;

  // Never route back into the auth exchange endpoints (loop protection).
  if (value.startsWith("/auth/confirm") || value.startsWith("/auth/invite/accept")) return fallback;

  // Normalize the path portion for a final protocol-relative check.
  const path = value.split(/[?#]/)[0];
  if (path.startsWith("//") || path.includes("\\")) return fallback;

  return value;
}
