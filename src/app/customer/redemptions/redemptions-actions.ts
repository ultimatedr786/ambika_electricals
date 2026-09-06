"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer, type Viewer } from "@/lib/auth/session";
import {
  classifyRewardsError,
  rewardsFailure,
  type RewardsActionResult,
} from "@/lib/rewards-errors";

/**
 * Customer-side redemption actions (Step 3 Slice 4).
 *
 * Self-service only: the viewer must hold an ACTIVE membership in the
 * reward's business (resolved server-side from their own profile id — the
 * client never supplies a membership id). `redeem_reward` and
 * `cancel_redemption` re-check "own membership or staff/manager" inside the
 * SECURITY DEFINER RPCs; denials are audited here (a raising RPC rolls its
 * statement back and cannot persist its own audit row).
 */

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
  reason: string;
  businessId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
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
      p_target_type: opts.targetType ?? null,
      p_target_id: opts.targetId ?? null,
      p_metadata: { reason: opts.reason, ip: await clientIp(), ...(opts.metadata ?? {}) },
    });
  } catch {
    // Audit failure must never break the user-facing flow (or leak details).
  }
}

async function requireAuthedClient<T = undefined>(): Promise<
  | { ok: true; viewer: Viewer; supabase: NonNullable<Awaited<ReturnType<typeof createClient>>> }
  | { ok: false; result: RewardsActionResult<T> }
> {
  const viewer = await getViewer();
  const supabase = await createClient();
  if (!viewer || !supabase) {
    return { ok: false, result: rewardsFailure<T>(supabase ? "not_signed_in" : "auth_unconfigured") };
  }
  return { ok: true, viewer, supabase };
}

export interface CustomerRedeemOutcome {
  redemptionId: string;
  reference: string;
  /** Plaintext code — shown exactly once, never retrievable again (§8.4). */
  code: string | null;
  pointsUsed: number;
  balanceAfter: number | null;
  expiresAt: string | null;
  status: string;
  replayed: boolean;
}

/**
 * Self-redemption: resolves the viewer's OWN active membership in the
 * reward's business, then calls the same RPC the counter uses.
 */
export async function redeemMyRewardAction(opts: {
  businessId: string;
  rewardId: string;
  qty?: number;
  idempotencyKey?: string | null;
}): Promise<RewardsActionResult<CustomerRedeemOutcome>> {
  const authed = await requireAuthedClient<CustomerRedeemOutcome>();
  if (!authed.ok) return authed.result;
  const { viewer, supabase } = authed;

  // Only rows linked to THIS profile — never a client-supplied membership id.
  const { data: memRows } = await supabase
    .from("customer_memberships")
    .select("id")
    .eq("profile_id", viewer.userId)
    .eq("business_id", opts.businessId)
    .eq("status", "active")
    .limit(1);
  const membershipId = (memRows?.[0] as { id?: string } | undefined)?.id;
  if (!membershipId) {
    await auditDenial({
      action: "redemption.redeem_denied",
      reason: "customer_not_found",
      businessId: opts.businessId,
      targetType: "reward",
      targetId: opts.rewardId,
    });
    return rewardsFailure("customer_not_found");
  }

  const { data, error } = await supabase.rpc("redeem_reward", {
    p_reward_id: opts.rewardId,
    p_customer_membership_id: membershipId,
    p_store_id: null,
    p_qty: opts.qty ?? 1,
    p_idempotency_key: opts.idempotencyKey ?? null,
  });
  if (error) {
    const reason = classifyRewardsError(error);
    await auditDenial({
      action: "redemption.redeem_denied",
      reason,
      businessId: opts.businessId,
      targetType: "reward",
      targetId: opts.rewardId,
      metadata: { membership_id: membershipId, qty: opts.qty ?? 1 },
    });
    return rewardsFailure(reason);
  }
  const row = (Array.isArray(data) ? data[0] : data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    data: {
      redemptionId: String(row.redemption_id ?? ""),
      reference: String(row.reference ?? ""),
      code: row.code == null ? null : String(row.code),
      pointsUsed: Number(row.points_used ?? 0),
      balanceAfter: row.balance_after == null ? null : Number(row.balance_after),
      expiresAt: row.expires_at == null ? null : String(row.expires_at),
      status: String(row.status ?? "pending"),
      replayed: Boolean(row.replayed),
    },
  };
}

export interface CustomerCancelOutcome {
  redemptionId: string;
  reference: string;
  status: "cancelled" | "expired";
  pointsRefunded: number;
  balanceAfter: number | null;
  expiredNow: boolean;
}

export async function cancelMyRedemptionAction(
  redemptionId: string,
  reason: string
): Promise<RewardsActionResult<CustomerCancelOutcome>> {
  const authed = await requireAuthedClient<CustomerCancelOutcome>();
  if (!authed.ok) return authed.result;
  const { supabase } = authed;

  const { data, error } = await supabase.rpc("cancel_redemption", {
    p_redemption_id: redemptionId,
    p_reason: reason,
  });
  if (error) {
    const failure = classifyRewardsError(error);
    await auditDenial({
      action: "redemption.cancel_denied",
      reason: failure,
      targetType: "redemption",
      targetId: redemptionId,
      metadata: { provided_reason: reason.slice(0, 120) },
    });
    return rewardsFailure(failure);
  }
  const row = (Array.isArray(data) ? data[0] : data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    data: {
      redemptionId: String(row.redemption_id ?? redemptionId),
      reference: String(row.reference ?? ""),
      status: row.status === "expired" ? "expired" : "cancelled",
      pointsRefunded: Number(row.points_refunded ?? 0),
      balanceAfter: row.balance_after == null ? null : Number(row.balance_after),
      expiredNow: Boolean(row.expired_now),
    },
  };
}
