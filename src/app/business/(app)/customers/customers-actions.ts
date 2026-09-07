"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer, type Viewer } from "@/lib/auth/session";

/**
 * Server action for manual points adjustments (business Customers detail page).
 *
 * Mirrors the sales-actions.ts pattern: the mutation runs entirely inside the
 * SECURITY DEFINER `adjust_points` RPC, which re-checks that the caller is the
 * business owner and that the membership belongs to this business before
 * posting an immutable ledger entry. This action never computes a balance
 * itself — it only relays what the RPC returns.
 */

export type CustomerActionFailure =
  | "not_signed_in"
  | "auth_unconfigured"
  | "owner_only"
  | "membership_not_found"
  | "invalid_points"
  | "reason_required"
  | "unknown";

export type CustomerActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; reason: CustomerActionFailure; message: string };

const FRIENDLY: Record<CustomerActionFailure, string> = {
  not_signed_in: "Your session expired — please sign in again.",
  auth_unconfigured: "Authentication isn't configured on this deployment yet.",
  owner_only: "Only the business owner can adjust points manually.",
  membership_not_found: "That membership isn't active in this business.",
  invalid_points: "Enter a non-zero number of points.",
  reason_required: "Add a short reason — it's kept in the audit trail.",
  unknown: "Something went wrong. Please try again.",
};

function classify(error: { message?: string; code?: string } | null): CustomerActionFailure {
  if (!error) return "unknown";
  const m = (error.message ?? "").toLowerCase();
  const marker = (key: string) => m.includes(key);
  if (marker("authentication_required")) return "not_signed_in";
  if (marker("membership_not_found")) return "membership_not_found";
  if (marker("invalid_points")) return "invalid_points";
  if (marker("reason_required")) return "reason_required";
  if (marker("not_authorized")) return "owner_only";
  if (error.code === "42501") return "owner_only";
  return "unknown";
}

function fail<T>(reason: CustomerActionFailure): CustomerActionResult<T> {
  return { ok: false, reason, message: FRIENDLY[reason] };
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

async function auditDenial(opts: {
  action: string;
  reason: CustomerActionFailure;
  businessId?: string | null;
  targetId?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const viewer = await getViewer();
    await admin.rpc("write_audit", {
      p_action: opts.action,
      p_actor: viewer?.userId ?? null,
      p_actor_role: null,
      p_business_id: opts.businessId ?? null,
      p_store_id: null,
      p_target_type: "customer_membership",
      p_target_id: opts.targetId ?? null,
      p_metadata: { reason: opts.reason, ip: await clientIp() },
    });
  } catch {
    // Audit failure must never break the user-facing flow.
  }
}

async function requireAuthedClient<T = undefined>(): Promise<
  | { ok: true; viewer: Viewer; supabase: NonNullable<Awaited<ReturnType<typeof createClient>>> }
  | { ok: false; result: CustomerActionResult<T> }
> {
  const viewer = await getViewer();
  const supabase = await createClient();
  if (!viewer || !supabase) {
    return { ok: false, result: fail<T>(supabase ? "not_signed_in" : "auth_unconfigured") };
  }
  return { ok: true, viewer, supabase };
}

export interface AdjustPointsOutcome {
  entryId: number;
  balanceAfter: number;
  replayed: boolean;
}

export async function adjustPointsAction(
  businessId: string,
  membershipId: string,
  points: number,
  reason: string,
  idempotencyKey: string
): Promise<CustomerActionResult<AdjustPointsOutcome>> {
  const authed = await requireAuthedClient<AdjustPointsOutcome>();
  if (!authed.ok) return authed.result;
  const { supabase } = authed;

  const { data, error } = await supabase.rpc("adjust_points", {
    p_business_id: businessId,
    p_membership_id: membershipId,
    p_points: points,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    const reasonCode = classify(error);
    await auditDenial({ action: "points.adjust_denied", reason: reasonCode, businessId, targetId: membershipId });
    return fail(reasonCode);
  }

  const row = (data ?? {}) as { entry_id?: number; balance_after?: number; replayed?: boolean };
  return {
    ok: true,
    data: {
      entryId: Number(row.entry_id ?? 0),
      balanceAfter: Number(row.balance_after ?? 0),
      replayed: Boolean(row.replayed),
    },
  };
}
