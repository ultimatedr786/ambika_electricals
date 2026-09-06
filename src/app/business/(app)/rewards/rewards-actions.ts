"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer, type Viewer } from "@/lib/auth/session";
import {
  classifyRewardsError,
  rewardsFailure,
  type RewardsActionFailure,
  type RewardsActionResult,
} from "@/lib/rewards-errors";

/**
 * Server actions for the live rewards & redemptions surface (Step 3 Slice 4).
 *
 * Authorization model: every mutation runs as the signed-in viewer through the
 * SECURITY DEFINER RPCs (`create_reward`, `update_reward`,
 * `set_reward_inventory`, `redeem_reward`, `collect_redemption`,
 * `cancel_redemption`), which re-check role and tenancy. Points move only via
 * the append-only ledger inside those RPCs; collection codes are stored as
 * sha256 + last4 and returned to the caller exactly once (§8.4).
 *
 * Denials are audited HERE (a raising RPC rolls its own statement back, so it
 * can never persist its own denial audit) using the service-role client plus
 * the real client IP — same pattern as team/sales/inventory actions. This
 * includes invalid-code collection attempts (`redemption.collect_denied`).
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

/** Denial audit via the service-role client (bypasses RLS; write_audit is service-only). */
async function auditDenial(opts: {
  action: string;
  reason: RewardsActionFailure;
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
      p_metadata: {
        reason: opts.reason,
        ip: await clientIp(),
        ...(opts.metadata ?? {}),
      },
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

/* ------------------------------------------------------------------ */
/* Reward catalogue (manager+)                                         */
/* ------------------------------------------------------------------ */

export interface CreateRewardInput {
  businessId: string;
  name: string;
  /** DB enum: discount | coupon | free_product | gift | special_offer. */
  rewardType: string;
  pointsCost: number;
  description?: string | null;
  category?: string | null;
  regularPricePaise?: number | null;
  artKey?: string | null;
  expiryDays?: number | null;
  maxPerCustomerPerMonth?: number | null;
  terms?: string[];
}

export async function createRewardAction(
  input: CreateRewardInput
): Promise<RewardsActionResult<{ rewardId: string; name: string }>> {
  const authed = await requireAuthedClient<{ rewardId: string; name: string }>();
  if (!authed.ok) return authed.result;
  const { viewer, supabase } = authed;

  const { data, error } = await supabase.rpc("create_reward", {
    p_business_id: input.businessId,
    p_name: input.name,
    p_reward_type: input.rewardType,
    p_points_cost: input.pointsCost,
    p_description: input.description ?? null,
    p_category: input.category ?? null,
    p_regular_price_paise: input.regularPricePaise ?? null,
    p_art_key: input.artKey ?? null,
    p_expiry_days: input.expiryDays ?? 30,
    p_max_per_customer_per_month: input.maxPerCustomerPerMonth ?? null,
    p_terms: input.terms ?? [],
  });

  if (error) {
    const reason = classifyRewardsError(error);
    await auditDenial({
      action: "reward.create_denied",
      reason,
      businessId: input.businessId,
      targetType: "reward_name",
      targetId: input.name,
      metadata: { reward_type: input.rewardType, points_cost: input.pointsCost, viewer_id: viewer.userId },
    });
    return rewardsFailure(reason);
  }

  const row = (Array.isArray(data) ? data[0] : data ?? {}) as { reward_id?: string; name?: string };
  return { ok: true, data: { rewardId: row.reward_id ?? "", name: row.name ?? input.name } };
}

export interface UpdateRewardInput {
  rewardId: string;
  name?: string | null;
  description?: string | null;
  pointsCost?: number | null;
  category?: string | null;
  regularPricePaise?: number | null;
  artKey?: string | null;
  expiryDays?: number | null;
  maxPerCustomerPerMonth?: number | null;
  status?: "active" | "archived" | null;
}

export async function updateRewardAction(input: UpdateRewardInput): Promise<RewardsActionResult> {
  const authed = await requireAuthedClient();
  if (!authed.ok) return authed.result;
  const { supabase } = authed;

  const { error } = await supabase.rpc("update_reward", {
    p_reward_id: input.rewardId,
    p_name: input.name ?? null,
    p_description: input.description ?? null,
    p_points_cost: input.pointsCost ?? null,
    p_category: input.category ?? null,
    p_regular_price_paise: input.regularPricePaise ?? null,
    p_art_key: input.artKey ?? null,
    p_expiry_days: input.expiryDays ?? null,
    p_max_per_customer_per_month: input.maxPerCustomerPerMonth ?? null,
    p_status: input.status ?? null,
  });
  if (error) {
    const reason = classifyRewardsError(error);
    await auditDenial({
      action: "reward.update_denied",
      reason,
      targetType: "reward",
      targetId: input.rewardId,
      metadata: { requested_status: input.status ?? null, requested_points: input.pointsCost ?? null },
    });
    return rewardsFailure(reason);
  }
  return { ok: true, data: undefined };
}

/** storeId = null sets the business-wide pool row (no rows at all = unlimited). */
export async function setRewardInventoryAction(
  rewardId: string,
  storeId: string | null,
  onHand: number
): Promise<RewardsActionResult<{ onHandBefore: number | null; onHandAfter: number }>> {
  const authed = await requireAuthedClient<{ onHandBefore: number | null; onHandAfter: number }>();
  if (!authed.ok) return authed.result;
  const { supabase } = authed;

  const { data, error } = await supabase.rpc("set_reward_inventory", {
    p_reward_id: rewardId,
    p_store_id: storeId,
    p_on_hand: onHand,
  });
  if (error) {
    const reason = classifyRewardsError(error);
    await auditDenial({
      action: "reward.inventory_denied",
      reason,
      targetType: "reward",
      targetId: rewardId,
      metadata: { store_id: storeId, requested_on_hand: onHand },
    });
    return rewardsFailure(reason);
  }
  const row = (Array.isArray(data) ? data[0] : data ?? {}) as {
    on_hand_before?: number | null; on_hand_after?: number;
  };
  return {
    ok: true,
    data: {
      onHandBefore: row.on_hand_before ?? null,
      onHandAfter: Number(row.on_hand_after ?? onHand),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Redemptions (staff+ at the counter)                                 */
/* ------------------------------------------------------------------ */

export interface RedeemOutcome {
  redemptionId: string;
  reference: string;
  /** Plaintext code — returned ONLY on the first call (never on replays). */
  code: string | null;
  pointsUsed: number;
  balanceAfter: number | null;
  expiresAt: string | null;
  status: string;
  replayed: boolean;
}

function parseRedeem(data: unknown): RedeemOutcome {
  const row = (Array.isArray(data) ? data[0] : data ?? {}) as Record<string, unknown>;
  return {
    redemptionId: String(row.redemption_id ?? ""),
    reference: String(row.reference ?? ""),
    code: row.code == null ? null : String(row.code),
    pointsUsed: Number(row.points_used ?? 0),
    balanceAfter: row.balance_after == null ? null : Number(row.balance_after),
    expiresAt: row.expires_at == null ? null : String(row.expires_at),
    status: String(row.status ?? "pending"),
    replayed: Boolean(row.replayed),
  };
}

/**
 * Staff redeems on behalf of a member at the counter. The member is looked up
 * by membership number (staff can read the business directory under RLS).
 */
export async function redeemOnBehalfAction(opts: {
  businessId: string;
  rewardId: string;
  membershipNo: string;
  storeId?: string | null;
  qty?: number;
  idempotencyKey?: string | null;
}): Promise<RewardsActionResult<RedeemOutcome>> {
  const authed = await requireAuthedClient<RedeemOutcome>();
  if (!authed.ok) return authed.result;
  const { supabase } = authed;

  const { data: memRows, error: memError } = await supabase
    .from("customer_memberships")
    .select("id")
    .eq("business_id", opts.businessId)
    .eq("membership_no", opts.membershipNo.trim().toUpperCase())
    .eq("status", "active")
    .limit(1);
  const membershipId = (memRows?.[0] as { id?: string } | undefined)?.id;
  if (memError || !membershipId) {
    await auditDenial({
      action: "redemption.redeem_denied",
      reason: "customer_not_found",
      businessId: opts.businessId,
      targetType: "reward",
      targetId: opts.rewardId,
      metadata: { membership_no: opts.membershipNo.trim().toUpperCase() },
    });
    return rewardsFailure("customer_not_found");
  }

  const { data, error } = await supabase.rpc("redeem_reward", {
    p_reward_id: opts.rewardId,
    p_customer_membership_id: membershipId,
    p_store_id: opts.storeId ?? null,
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
      metadata: { membership_id: membershipId, store_id: opts.storeId ?? null, qty: opts.qty ?? 1 },
    });
    return rewardsFailure(reason);
  }
  return { ok: true, data: parseRedeem(data) };
}

export interface CollectOutcome {
  redemptionId: string;
  reference: string;
  status: "collected" | "expired";
  /** True when this very call lazily marked the redemption expired. */
  expiredNow: boolean;
}

export async function collectRedemptionAction(
  redemptionId: string,
  code: string
): Promise<RewardsActionResult<CollectOutcome>> {
  const authed = await requireAuthedClient<CollectOutcome>();
  if (!authed.ok) return authed.result;
  const { supabase } = authed;

  const { data, error } = await supabase.rpc("collect_redemption", {
    p_redemption_id: redemptionId,
    p_code: code,
  });
  if (error) {
    const reason = classifyRewardsError(error);
    // Invalid-code attempts are denial-audited here — the raising RPC rolls
    // back and can never persist its own audit row (RLS_POLICIES §6).
    await auditDenial({
      action: "redemption.collect_denied",
      reason,
      targetType: "redemption",
      targetId: redemptionId,
    });
    return rewardsFailure(reason);
  }
  const row = (Array.isArray(data) ? data[0] : data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    data: {
      redemptionId: String(row.redemption_id ?? redemptionId),
      reference: String(row.reference ?? ""),
      status: row.status === "expired" ? "expired" : "collected",
      expiredNow: Boolean(row.expired_now),
    },
  };
}

export interface CancelOutcome {
  redemptionId: string;
  reference: string;
  status: "cancelled" | "expired";
  pointsRefunded: number;
  balanceAfter: number | null;
  expiredNow: boolean;
}

export async function cancelRedemptionAction(
  redemptionId: string,
  reason: string
): Promise<RewardsActionResult<CancelOutcome>> {
  const authed = await requireAuthedClient<CancelOutcome>();
  if (!authed.ok) return authed.result;
  const { supabase } = authed;

  const { data, error } = await supabase.rpc("cancel_redemption", {
    p_redemption_id: redemptionId,
    p_reason: reason,
  });
  if (error) {
    const reasonCode = classifyRewardsError(error);
    await auditDenial({
      action: "redemption.cancel_denied",
      reason: reasonCode,
      targetType: "redemption",
      targetId: redemptionId,
      metadata: { provided_reason: reason.slice(0, 120) },
    });
    return rewardsFailure(reasonCode);
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
