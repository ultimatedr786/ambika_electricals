"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/auth/session";

/**
 * Loyalty rule server actions (Step 3 Slice 6).
 *
 * The rule engine is versioned: `set_loyalty_rule` never edits the running
 * policy, it appends the next version and closes the previous one at the new
 * version's start. Sales and ledger rows keep the version that priced them, so
 * changing the rate here can never re-price yesterday.
 *
 * Authorization is the RPC's job (owner of the business, active tenant); this
 * action only shapes input, classifies failures and records denials with the
 * real client IP that SQL cannot see.
 */

export type LoyaltyRuleFailure =
  | "not_signed_in"
  | "auth_unconfigured"
  | "owner_only"
  | "business_inactive"
  | "invalid_rate"
  | "invalid_effective_date"
  | "invalid_rule"
  | "unknown";

export type LoyaltyRuleResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; reason: LoyaltyRuleFailure; message: string };

const FRIENDLY: Record<LoyaltyRuleFailure, string> = {
  not_signed_in: "Your session expired — please sign in again.",
  auth_unconfigured: "Authentication isn't configured on this deployment yet.",
  owner_only: "Only the business owner can change the loyalty rule.",
  business_inactive: "This business isn't active.",
  invalid_rate:
    "That earning rate isn't valid — the spend step must be between ₹1 and ₹1,00,000 and award at most 1000 points.",
  invalid_effective_date:
    "The start date must be now or in the future, and within the next year. Past rules can't be rewritten.",
  invalid_rule: "Those rule settings aren't valid.",
  unknown: "Something went wrong. Please try again.",
};

function fail<T>(reason: LoyaltyRuleFailure): LoyaltyRuleResult<T> {
  return { ok: false, reason, message: FRIENDLY[reason] };
}

function classify(error: { message?: string; code?: string } | null): LoyaltyRuleFailure {
  if (!error) return "unknown";
  const m = (error.message ?? "").toLowerCase();
  if (m.includes("authentication_required")) return "not_signed_in";
  if (m.includes("owner_only") || m.includes("not_authorized")) return "owner_only";
  if (m.includes("business_inactive")) return "business_inactive";
  if (m.includes("effective_from")) return "invalid_effective_date";
  if (m.includes("spend threshold") || m.includes("points per step") || m.includes("point value")) {
    return "invalid_rate";
  }
  if (m.includes("invalid_rule")) return "invalid_rule";
  if (error.code === "42501") return "owner_only";
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

async function auditDenial(reason: LoyaltyRuleFailure, metadata: Record<string, unknown>): Promise<void> {
  try {
    const admin = createAdminClient();
    const viewer = await getViewer();
    await admin.rpc("write_audit", {
      p_action: "loyalty_rule.change_denied",
      p_actor: viewer?.userId ?? null,
      p_actor_role: null,
      p_business_id: null,
      p_store_id: null,
      p_target_type: "loyalty_rule",
      p_target_id: null,
      p_metadata: { reason, ip: await clientIp(), ...metadata },
    });
  } catch {
    // Never let auditing break the owner's flow.
  }
}

export interface LoyaltyRuleVersion {
  versionId: string;
  version: number;
  earnSpendPaise: number;
  earnPoints: number;
  pointValuePaise: number;
  minSpendPaise: number;
  /** Always null at launch — no expiry sweeper exists. */
  pointsExpiryDays: number | null;
  effectiveFrom: string;
  status: "scheduled" | "active" | "superseded";
  supersededVersion: number | null;
}

export interface SetLoyaltyRuleInput {
  /** Only used to disambiguate when the owner runs more than one business. */
  businessId?: string | null;
  earnSpendPaise: number;
  earnPoints: number;
  pointValuePaise?: number;
  minSpendPaise?: number;
  /** ISO timestamp. Omitted = effective immediately. */
  effectiveFrom?: string | null;
  note?: string | null;
}

export async function setLoyaltyRuleAction(
  input: SetLoyaltyRuleInput
): Promise<LoyaltyRuleResult<LoyaltyRuleVersion>> {
  const viewer = await getViewer();
  const supabase = await createClient();
  if (!viewer || !supabase) {
    return fail<LoyaltyRuleVersion>(supabase ? "not_signed_in" : "auth_unconfigured");
  }

  // Client-side sanity so the obvious typos never reach the database. The RPC
  // re-validates everything regardless — this is a courtesy, not a guard.
  if (!Number.isSafeInteger(input.earnSpendPaise) || !Number.isSafeInteger(input.earnPoints)) {
    return fail("invalid_rate");
  }

  const { data, error } = await supabase.rpc("set_loyalty_rule", {
    p_business_id: input.businessId ?? null,
    p_earn_spend_paise: input.earnSpendPaise,
    p_earn_points: input.earnPoints,
    p_point_value_paise: input.pointValuePaise ?? 10,
    p_min_spend_paise: input.minSpendPaise ?? 0,
    p_effective_from: input.effectiveFrom ?? null,
    p_note: input.note ?? null,
  });

  if (error) {
    const reason = classify(error);
    await auditDenial(reason, {
      earn_spend_paise: input.earnSpendPaise,
      earn_points: input.earnPoints,
      viewer_id: viewer.userId,
    });
    return fail(reason);
  }

  const row = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    data: {
      versionId: String(row.version_id ?? ""),
      version: Number(row.version ?? 0),
      earnSpendPaise: Number(row.earn_spend_paise ?? 0),
      earnPoints: Number(row.earn_points ?? 0),
      pointValuePaise: Number(row.point_value_paise ?? 10),
      minSpendPaise: Number(row.min_spend_paise ?? 0),
      pointsExpiryDays: row.points_expiry_days == null ? null : Number(row.points_expiry_days),
      effectiveFrom: String(row.effective_from ?? new Date().toISOString()),
      status: (row.status as LoyaltyRuleVersion["status"]) ?? "active",
      supersededVersion: row.superseded_version == null ? null : Number(row.superseded_version),
    },
  };
}
