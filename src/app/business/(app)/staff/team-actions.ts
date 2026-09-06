"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer, type Viewer } from "@/lib/auth/session";
import { getSiteUrl } from "@/lib/auth/env";
import { hashInvitationToken, sendInvitationEmail } from "@/lib/auth/invite-mailer";

/**
 * Server actions for the live team & invitations surface (Stage F).
 *
 * Authorization model: every mutation runs as the signed-in viewer through a
 * SECURITY DEFINER RPC that re-checks role and tenancy — these actions never
 * trust client input for permission decisions. Denials are audited HERE (not
 * inside the raising RPCs, whose statement rollback would erase the row) using
 * the service-role client plus the real client IP.
 */

export type TeamActionFailure =
  | "not_signed_in"
  | "auth_unconfigured"
  | "owner_only"
  | "manager_only"
  | "already_pending"
  | "invitation_revoked"
  | "invitation_already_used"
  | "invitation_expired"
  | "invitation_email_mismatch"
  | "invitation_not_found"
  | "invalid_role"
  | "invalid_expiry"
  | "store_not_in_business"
  | "business_inactive"
  | "cannot_change_own_role"
  | "owner_role_protected"
  | "cannot_remove_self"
  | "owner_protected"
  | "membership_not_found"
  | "store_not_found"
  | "not_a_business_member"
  | "profile_missing"
  | "unknown";

export type TeamActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; reason: TeamActionFailure; message: string };

const FRIENDLY: Record<TeamActionFailure, string> = {
  not_signed_in: "Your session expired — please sign in again.",
  auth_unconfigured: "Authentication isn't configured on this deployment yet.",
  owner_only: "Only the business owner can do this.",
  manager_only: "Only a manager or the owner can do this.",
  already_pending: "That person already has a pending invitation — revoke it first to send a new one.",
  invitation_revoked: "This invitation is no longer valid (it was revoked).",
  invitation_already_used: "This invitation has already been accepted.",
  invitation_expired: "This invitation has expired — ask the business owner to send a new one.",
  invitation_email_mismatch: "This invitation was sent to a different email address. Sign in with the invited address to accept it.",
  invitation_not_found: "We couldn't find that invitation. The link may be broken.",
  invalid_role: "Choose either Manager or Staff.",
  invalid_expiry: "Invitation expiry must be between 1 hour and 30 days.",
  store_not_in_business: "That store doesn't belong to this business.",
  business_inactive: "This business isn't active.",
  cannot_change_own_role: "You can't change your own role.",
  owner_role_protected: "Owner roles can't be changed here — ownership transfer is a platform action.",
  cannot_remove_self: "You can't remove yourself.",
  owner_protected: "The owner can't be removed.",
  membership_not_found: "That team member wasn't found.",
  store_not_found: "That store wasn't found.",
  not_a_business_member: "That person isn't a member of this business.",
  profile_missing: "Your profile is still being created — wait a few seconds and try again.",
  unknown: "Something went wrong. Please try again.",
};

function classifyError(error: { message?: string; code?: string } | null): TeamActionFailure {
  if (!error) return "unknown";
  const m = (error.message ?? "").toLowerCase();
  const marker = (key: string) => m.startsWith(key) || m.includes(key);

  if (marker("authentication_required")) return "not_signed_in";
  if (marker("invitation_already_pending")) return "already_pending";
  if (marker("invitation_revoked")) return "invitation_revoked";
  if (marker("invitation_already_used")) return "invitation_already_used";
  if (marker("invitation_expired")) return "invitation_expired";
  if (marker("invitation_email_mismatch")) return "invitation_email_mismatch";
  if (marker("invitation_not_found")) return "invitation_not_found";
  if (marker("invalid_role")) return "invalid_role";
  if (marker("invalid_expiry")) return "invalid_expiry";
  if (marker("store_not_in_business")) return "store_not_in_business";
  if (marker("business_inactive")) return "business_inactive";
  if (marker("cannot_change_own_role")) return "cannot_change_own_role";
  if (marker("owner_role_protected")) return "owner_role_protected";
  if (marker("cannot_remove_self")) return "cannot_remove_self";
  if (marker("owner_protected")) return "owner_protected";
  if (marker("membership_not_found")) return "membership_not_found";
  if (marker("store_not_found")) return "store_not_found";
  if (marker("not_a_business_member")) return "not_a_business_member";
  if (marker("profile_missing")) return "profile_missing";
  if (error.code === "42501" || marker("not_authorized")) return "owner_only";
  return "unknown";
}

function fail<T>(reason: TeamActionFailure): TeamActionResult<T> {
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

/** Denial audit via the service-role client (bypasses RLS; write_audit is service-only). */
async function auditDenial(opts: {
  action: string;
  reason: TeamActionFailure;
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
  | { ok: false; result: TeamActionResult<T> }
> {
  const viewer = await getViewer();
  const supabase = await createClient();
  if (!viewer || !supabase) {
    return { ok: false, result: fail<T>(supabase ? "not_signed_in" : "auth_unconfigured") };
  }
  return { ok: true, viewer, supabase };
}

/* ------------------------------------------------------------------ */
/* Invitations                                                         */
/* ------------------------------------------------------------------ */

export interface CreateInvitationInput {
  businessId: string;
  email: string;
  role: "manager" | "staff";
  storeId: string | null;
  expiresInHours: number;
}

export interface CreateInvitationOutcome {
  invitationId: string;
  emailSent: boolean;
  /** Present when email delivery is unavailable so the owner can copy it manually. */
  acceptUrl: string | null;
  expiresAt: string;
}

export async function createInvitationAction(
  input: CreateInvitationInput
): Promise<TeamActionResult<CreateInvitationOutcome>> {
  const authed = await requireAuthedClient<CreateInvitationOutcome>();
  if (!authed.ok) return authed.result;
  const { viewer, supabase } = authed;

  const email = input.email.trim().toLowerCase();
  const { data, error } = await supabase.rpc("create_invitation", {
    p_business_id: input.businessId,
    p_email: email,
    p_role: input.role,
    p_store_id: input.storeId,
    p_expires_in_hours: input.expiresInHours,
  });

  if (error) {
    const reason = classifyError(error);
    await auditDenial({
      action: "invitation.create_denied",
      reason,
      businessId: input.businessId,
      targetType: "invitation_email",
      targetId: email,
      metadata: { requested_role: input.role, store_id: input.storeId, viewer_id: viewer.userId },
    });
    return fail(reason);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const token = (row?.token ?? "") as string;
  const invitationId = (row?.invitation_id ?? "") as string;
  const acceptUrl = `${getSiteUrl()}/auth/invite/${token}`;

  // Fetch display context for the email (RLS-scoped reads as the owner).
  const [businessRes, storeRes] = await Promise.all([
    supabase.from("businesses").select("name").eq("id", input.businessId).maybeSingle(),
    input.storeId
      ? supabase.from("stores").select("name").eq("id", input.storeId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const businessName = ((businessRes.data as { name?: string } | null)?.name ?? "your business") as string;
  const storeName = ((storeRes.data as { name?: string } | null)?.name ?? null) as string | null;

  const roleLabel = input.role === "manager" ? "Manager" : "Staff";
  const hours = input.expiresInHours;
  const expiresText =
    hours >= 48
      ? `expires in ${Math.round(hours / 24)} days`
      : `expires in ${hours} hours`;

  const mailer = await sendInvitationEmail({
    to: email,
    businessName,
    roleLabel,
    storeName,
    inviterName: viewer.profile?.display_name ?? viewer.email ?? null,
    expiresText,
    acceptUrl,
  }).catch(() => ({ sent: false as const, reason: "provider_error" as const }));

  return {
    ok: true,
    data: {
      invitationId,
      emailSent: mailer.sent,
      // Only surface the raw link when the email didn't go out.
      acceptUrl: mailer.sent ? null : acceptUrl,
      expiresAt: new Date(Date.now() + hours * 3_600_000).toISOString(),
    },
  };
}

export async function revokeInvitationAction(
  businessId: string,
  invitationId: string
): Promise<TeamActionResult> {
  const authed = await requireAuthedClient();
  if (!authed.ok) return authed.result;
  const { supabase } = authed;

  const { error } = await supabase.rpc("revoke_invitation", { p_invitation_id: invitationId });
  if (error) {
    const reason = classifyError(error);
    await auditDenial({
      action: "invitation.revoke_denied",
      reason,
      businessId,
      targetType: "invitation",
      targetId: invitationId,
    });
    return fail(reason);
  }
  return { ok: true, data: undefined };
}

export interface AcceptInvitationOutcome {
  redirectTo: string;
  businessName: string;
  role: string;
}

export async function acceptInvitationAction(token: string): Promise<TeamActionResult<AcceptInvitationOutcome>> {
  const authed = await requireAuthedClient<AcceptInvitationOutcome>();
  if (!authed.ok) return authed.result;
  const { supabase } = authed;

  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) {
    const reason = classifyError(error);
    // Denial audit — the token is hashed so a leaked URL never lands in logs.
    await auditDenial({
      action: "invitation.accept_denied",
      reason,
      targetType: "invitation_token",
      targetId: hashInvitationToken(token).slice(0, 16),
      metadata: { token_hash_prefix: hashInvitationToken(token).slice(0, 16) },
    });
    return fail(reason);
  }

  const payload = (data ?? {}) as { business_id?: string; business_name?: string; role?: string };
  let businessName = payload.business_name ?? "your business";
  if (!payload.business_name && payload.business_id) {
    const { data: b } = await supabase.from("businesses").select("name").eq("id", payload.business_id).maybeSingle();
    businessName = ((b as { name?: string } | null)?.name ?? businessName) as string;
  }

  return {
    ok: true,
    data: { redirectTo: "/business/dashboard", businessName, role: payload.role ?? "staff" },
  };
}

/* ------------------------------------------------------------------ */
/* Member management (owner-only role changes; manager+ reads)         */
/* ------------------------------------------------------------------ */

export async function changeMemberRoleAction(
  businessId: string,
  profileId: string,
  newRole: "manager" | "staff"
): Promise<TeamActionResult> {
  const authed = await requireAuthedClient();
  if (!authed.ok) return authed.result;
  const { supabase } = authed;

  const { error } = await supabase.rpc("change_member_role", {
    p_business_id: businessId,
    p_profile_id: profileId,
    p_new_role: newRole,
  });
  if (error) {
    const reason = classifyError(error);
    await auditDenial({
      action: "member.role_change_denied",
      reason,
      businessId,
      targetType: "profile",
      targetId: profileId,
      metadata: { requested_role: newRole },
    });
    return fail(reason === "owner_only" ? "owner_only" : reason);
  }
  return { ok: true, data: undefined };
}

export async function removeMemberAction(businessId: string, profileId: string): Promise<TeamActionResult> {
  const authed = await requireAuthedClient();
  if (!authed.ok) return authed.result;
  const { supabase } = authed;

  const { error } = await supabase.rpc("remove_member", { p_business_id: businessId, p_profile_id: profileId });
  if (error) {
    const reason = classifyError(error);
    await auditDenial({
      action: "member.remove_denied",
      reason,
      businessId,
      targetType: "profile",
      targetId: profileId,
    });
    return fail(reason);
  }
  return { ok: true, data: undefined };
}

export async function setMemberStoreAction(
  action: "assign" | "unassign",
  storeId: string,
  profileId: string
): Promise<TeamActionResult> {
  const authed = await requireAuthedClient();
  if (!authed.ok) return authed.result;
  const { supabase } = authed;

  const rpc = action === "assign" ? "assign_member_to_store" : "unassign_member_to_store";
  const { error } = await supabase.rpc(rpc, { p_store_id: storeId, p_profile_id: profileId });
  if (error) {
    const reason = classifyError(error);
    await auditDenial({
      action: `member.store_${action}_denied`,
      reason,
      targetType: "store_membership",
      targetId: `${storeId}:${profileId}`,
    });
    return fail(reason);
  }
  return { ok: true, data: undefined };
}
