"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/auth/session";
import { QR_TOKEN_RE, normalizeQrToken } from "@/lib/qr/token";

/**
 * Membership QR server actions (Step 3 Slice 4).
 *
 * Contract (see supabase/migrations/20260906160000_membership_qr_tokens.sql):
 *
 *   • `issue_membership_qr_token`  — customer mints a short-lived, opaque
 *     token `RWD1.<selector>.<secret>`. Only a salted SHA-256 of the secret is
 *     stored; the payload carries no membership number, name, phone or points.
 *   • `verify_membership_qr_token` — staff redeem the token exactly once at the
 *     counter. It authorizes the scanner (business role, then store scoping)
 *     BEFORE revealing any lifecycle detail, records every attempt in
 *     `qr_verification_attempts` and audits the outcome by selector only.
 *   • `revoke_membership_qr_tokens` — "hide my QR" / lost-device control.
 *
 * These actions never trust client input for identity, tenancy or store scope:
 * the RPCs re-derive all of it from `auth.uid()`. The raw token is treated like
 * a password — it is never logged, never audited and never echoed back.
 */

/* ------------------------------------------------------------------ */
/* Shared result shape                                                 */
/* ------------------------------------------------------------------ */

export type QrActionFailure =
  | "not_signed_in"
  | "auth_unconfigured"
  | "rate_limited"
  | "membership_not_found"
  | "business_inactive"
  | "qr_invalid"
  | "qr_expired"
  | "qr_already_used"
  | "qr_revoked"
  | "membership_inactive"
  | "not_authorized"
  | "store_forbidden"
  | "store_not_in_business"
  | "unknown";

export type QrActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; reason: QrActionFailure; message: string };

/** Counter-friendly copy — deliberately vague about *why* a code is bad. */
const FRIENDLY: Record<QrActionFailure, string> = {
  not_signed_in: "Your session expired — please sign in again.",
  auth_unconfigured: "Authentication isn't configured on this deployment yet.",
  rate_limited: "Too many attempts in the last minute — wait a moment and try again.",
  membership_not_found: "No active membership is linked to your account yet.",
  business_inactive: "This business isn't active.",
  qr_invalid: "That code isn't valid. Ask the customer to refresh their QR.",
  qr_expired: "That QR expired. Ask the customer to refresh it and scan again.",
  qr_already_used: "That QR was already used. Ask the customer for a fresh one.",
  qr_revoked: "That QR was turned off by the customer. Ask for a fresh one.",
  membership_inactive: "That membership is no longer active.",
  not_authorized: "You aren't allowed to verify member QR codes here.",
  store_forbidden: "You're scoped to specific stores — pick one of yours.",
  store_not_in_business: "That store doesn't belong to this business.",
  unknown: "Something went wrong. Please try again.",
};

function fail<T>(reason: QrActionFailure): QrActionResult<T> {
  return { ok: false, reason, message: FRIENDLY[reason] };
}

const REASONS = new Set<string>(Object.keys(FRIENDLY));
function asFailure(reason: string | null | undefined): QrActionFailure {
  return reason && REASONS.has(reason) ? (reason as QrActionFailure) : "unknown";
}

/** Postgres errors from the raising RPCs (issue/revoke) → typed reasons. */
function classifyRpcError(error: { message?: string; code?: string } | null): QrActionFailure {
  if (!error) return "unknown";
  const m = (error.message ?? "").toLowerCase();
  if (m.includes("authentication_required")) return "not_signed_in";
  if (m.includes("rate_limited")) return "rate_limited";
  if (m.includes("membership_not_found")) return "membership_not_found";
  if (m.includes("business_inactive")) return "business_inactive";
  if (m.includes("not_authorized")) return "not_authorized";
  if (error.code === "42501") return "not_authorized";
  return "unknown";
}

async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return h.get("x-real-ip");
  } catch {
    return null;
  }
}

/**
 * Denial audit through the service-role client. The verify RPC already records
 * its own attempt + audit rows (it returns instead of raising precisely so they
 * survive); this only covers denials that never reached the database.
 */
async function auditDenial(opts: {
  action: string;
  reason: QrActionFailure;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const viewer = await getViewer();
    await admin.rpc("write_audit", {
      p_action: opts.action,
      p_actor: viewer?.userId ?? null,
      p_actor_role: null,
      p_business_id: null,
      p_store_id: null,
      p_target_type: "membership_qr_token",
      p_target_id: null,
      p_metadata: { reason: opts.reason, ip: await clientIp(), ...(opts.metadata ?? {}) },
    });
  } catch {
    // Audit failure must never break the counter flow (or leak details).
  }
}

async function authedClient<T>(): Promise<
  | { ok: true; supabase: NonNullable<Awaited<ReturnType<typeof createClient>>> }
  | { ok: false; result: QrActionResult<T> }
> {
  const viewer = await getViewer();
  const supabase = await createClient();
  if (!viewer || !supabase) {
    return { ok: false, result: fail<T>(supabase ? "not_signed_in" : "auth_unconfigured") };
  }
  return { ok: true, supabase };
}

/* ------------------------------------------------------------------ */
/* Customer: issue / revoke                                            */
/* ------------------------------------------------------------------ */

export interface IssuedQrToken {
  /** Opaque payload to render as a QR — never persist or log this. */
  token: string;
  /** ISO timestamp; the client refreshes shortly before this. */
  expiresAt: string;
  ttlSeconds: number;
}

/** Default counter TTL. The RPC clamps to 30–300 s regardless of what we ask. */
const DEFAULT_TTL_SECONDS = 90;

export async function issueMembershipQrAction(
  input: { businessId?: string | null; ttlSeconds?: number } = {}
): Promise<QrActionResult<IssuedQrToken>> {
  const authed = await authedClient<IssuedQrToken>();
  if (!authed.ok) return authed.result;

  const { data, error } = await authed.supabase.rpc("issue_membership_qr_token", {
    p_business_id: input.businessId ?? null,
    p_ttl_seconds: input.ttlSeconds ?? DEFAULT_TTL_SECONDS,
  });

  if (error) {
    const reason = classifyRpcError(error);
    if (reason !== "membership_not_found") {
      await auditDenial({ action: "membership_qr.issue_denied", reason });
    }
    return fail(reason);
  }

  const row = (data ?? {}) as { token?: string; expires_at?: string; ttl_seconds?: number };
  if (!row.token) return fail("unknown");
  return {
    ok: true,
    data: {
      token: row.token,
      expiresAt: row.expires_at ?? new Date(Date.now() + DEFAULT_TTL_SECONDS * 1000).toISOString(),
      ttlSeconds: Number(row.ttl_seconds ?? DEFAULT_TTL_SECONDS),
    },
  };
}

/** "Hide my QR" — revokes every live token of the signed-in customer. */
export async function revokeMembershipQrAction(
  reason: string = "customer_revoked"
): Promise<QrActionResult<{ revoked: number }>> {
  const authed = await authedClient<{ revoked: number }>();
  if (!authed.ok) return authed.result;

  const { data, error } = await authed.supabase.rpc("revoke_membership_qr_tokens", {
    p_reason: reason.slice(0, 120),
  });
  if (error) return fail(classifyRpcError(error));
  return { ok: true, data: { revoked: Number(data ?? 0) } };
}

/* ------------------------------------------------------------------ */
/* Staff: verify                                                       */
/* ------------------------------------------------------------------ */

export interface VerifiedMember {
  customerMembershipId: string;
  membershipNo: string;
  displayName: string | null;
  phoneMasked: string | null;
  pointsBalance: number;
  businessId: string;
  verifiedAt: string;
}

export async function verifyMembershipQrAction(input: {
  token: string;
  storeId?: string | null;
}): Promise<QrActionResult<VerifiedMember>> {
  const authed = await authedClient<VerifiedMember>();
  if (!authed.ok) return authed.result;

  // Normalize the way the RPC does, then reject obvious junk before spending a
  // database round trip (the RPC re-validates regardless).
  const token = normalizeQrToken(input.token);
  if (!QR_TOKEN_RE.test(token)) return fail("qr_invalid");

  const { data, error } = await authed.supabase.rpc("verify_membership_qr_token", {
    p_token: token,
    p_store_id: input.storeId ?? null,
  });

  if (error) {
    const reason = classifyRpcError(error);
    await auditDenial({ action: "membership_qr.verify_denied", reason });
    return fail(reason);
  }

  const row = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    customer_membership_id?: string;
    membership_no?: string;
    display_name?: string | null;
    phone_masked?: string | null;
    points_balance?: number;
    business_id?: string;
    verified_at?: string;
  };

  // The RPC already recorded the attempt and the audit row for this branch.
  if (!row.ok) return fail(asFailure(row.reason));

  return {
    ok: true,
    data: {
      customerMembershipId: row.customer_membership_id ?? "",
      membershipNo: row.membership_no ?? "",
      displayName: row.display_name ?? null,
      phoneMasked: row.phone_masked ?? null,
      pointsBalance: Number(row.points_balance ?? 0),
      businessId: row.business_id ?? "",
      verifiedAt: row.verified_at ?? new Date().toISOString(),
    },
  };
}
