/**
 * Shared error vocabulary for the live rewards/redemptions surfaces
 * (Step 3 Slice 4). Plain module — importable from "use server" action files
 * (which may only EXPORT async functions) and from client components.
 *
 * The SECURITY DEFINER reward RPCs raise `marker: detail` exceptions; these
 * helpers map the markers onto stable failure reasons + friendly copy.
 */

export type RewardsActionFailure =
  | "not_signed_in"
  | "auth_unconfigured"
  | "role_denied"
  | "business_inactive"
  | "invalid_reward"
  | "invalid_reward_type"
  | "invalid_points_cost"
  | "invalid_expiry"
  | "invalid_limit"
  | "invalid_status"
  | "nothing_to_update"
  | "reward_not_found"
  | "reward_archived"
  | "reward_has_open_redemptions"
  | "inventory_reserved_conflict"
  | "store_not_in_business"
  | "invalid_quantity"
  | "customer_not_found"
  | "redemption_limit_exceeded"
  | "insufficient_inventory"
  | "insufficient_points"
  | "code_generation_failed"
  | "code_required"
  | "redemption_not_found"
  | "redemption_code_invalid"
  | "redemption_not_collectable"
  | "redemption_not_cancellable"
  | "reason_required"
  | "unknown";

export type RewardsActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; reason: RewardsActionFailure; message: string };

export const REWARDS_FAILURE_MESSAGES: Record<RewardsActionFailure, string> = {
  not_signed_in: "Your session expired — please sign in again.",
  auth_unconfigured: "Authentication isn't configured on this deployment yet.",
  role_denied: "You don't have permission to do this.",
  business_inactive: "This business isn't active.",
  invalid_reward: "The reward needs a name.",
  invalid_reward_type: "Pick a valid reward type.",
  invalid_points_cost: "Points cost must be a positive whole number.",
  invalid_expiry: "Expiry must be between 1 and 365 days.",
  invalid_limit: "The monthly limit must be at least 1.",
  invalid_status: "Rewards are active or archived — they're never deleted.",
  nothing_to_update: "Nothing to update yet.",
  reward_not_found: "That reward wasn't found.",
  reward_archived: "That reward is archived and can't be redeemed.",
  reward_has_open_redemptions:
    "That reward still has pending redemptions — collect or cancel them before archiving.",
  inventory_reserved_conflict:
    "Some units are reserved for open redemptions — stock can't drop below the hold.",
  store_not_in_business: "That store doesn't belong to this business.",
  invalid_quantity: "Quantity must be a positive whole number.",
  customer_not_found: "No active membership found for that member.",
  redemption_limit_exceeded: "That member has hit this reward's monthly limit.",
  insufficient_inventory: "Not enough reward stock left for that redemption.",
  insufficient_points: "Not enough points on that balance.",
  code_generation_failed: "Couldn't derive a collection code — please try again.",
  code_required: "Enter the collection code.",
  redemption_not_found: "That redemption wasn't found.",
  redemption_code_invalid: "That collection code doesn't match.",
  redemption_not_collectable: "That redemption can't be collected (already collected, cancelled or expired).",
  redemption_not_cancellable: "Only pending redemptions can be cancelled.",
  reason_required: "Cancelling needs a short reason (it's kept in the audit trail).",
  unknown: "Something went wrong. Please try again.",
};

export function classifyRewardsError(error: { message?: string; code?: string } | null): RewardsActionFailure {
  if (!error) return "unknown";
  const m = (error.message ?? "").toLowerCase();
  const marker = (key: string) => m.startsWith(key) || m.includes(key);

  if (marker("authentication_required")) return "not_signed_in";
  if (marker("business_inactive")) return "business_inactive";
  if (marker("invalid_reward_type")) return "invalid_reward_type";
  if (marker("invalid_reward")) return "invalid_reward";
  if (marker("invalid_points_cost")) return "invalid_points_cost";
  if (marker("invalid_expiry")) return "invalid_expiry";
  if (marker("invalid_limit")) return "invalid_limit";
  if (marker("invalid_status")) return "invalid_status";
  if (marker("nothing_to_update")) return "nothing_to_update";
  if (marker("reward_has_open_redemptions")) return "reward_has_open_redemptions";
  if (marker("reward_archived")) return "reward_archived";
  if (marker("reward_not_found")) return "reward_not_found";
  if (marker("inventory_reserved_conflict")) return "inventory_reserved_conflict";
  if (marker("store_not_in_business")) return "store_not_in_business";
  if (marker("store_forbidden")) return "role_denied";
  if (marker("invalid_quantity")) return "invalid_quantity";
  if (marker("customer_not_found")) return "customer_not_found";
  if (marker("redemption_limit_exceeded")) return "redemption_limit_exceeded";
  if (marker("insufficient_inventory")) return "insufficient_inventory";
  if (marker("insufficient_points")) return "insufficient_points";
  if (marker("code_generation_failed")) return "code_generation_failed";
  if (marker("code_required")) return "code_required";
  if (marker("redemption_code_invalid")) return "redemption_code_invalid";
  if (marker("redemption_not_collectable")) return "redemption_not_collectable";
  if (marker("redemption_not_cancellable")) return "redemption_not_cancellable";
  if (marker("redemption_not_found")) return "redemption_not_found";
  if (marker("reason_required")) return "reason_required";
  if (marker("not_authorized") || error.code === "42501") return "role_denied";
  return "unknown";
}

export function rewardsFailure<T>(reason: RewardsActionFailure): RewardsActionResult<T> {
  return { ok: false, reason, message: REWARDS_FAILURE_MESSAGES[reason] };
}
