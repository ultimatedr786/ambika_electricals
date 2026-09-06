import type { Metadata } from "next";
import { AuthShell } from "@/components/shared/auth-shell";
import { AcceptInvitationCard, type InvitationState } from "@/components/auth/accept-invitation-card";
import { getViewer } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashInvitationToken } from "@/lib/auth/invite-mailer";

export const metadata: Metadata = {
  title: "Your invitation",
  description: "Accept your team invitation on Rewardly.",
  robots: { index: false },
};

type InviteRow = {
  id: string;
  business_id: string;
  store_id: string | null;
  email: string;
  role: "manager" | "staff";
  status: "pending" | "accepted" | "revoked";
  expires_at: string;
};

/**
 * Public invitation landing page (Stage F).
 *
 * The token is single-use and stored only as a SHA-256 hash, so this page
 * resolves the invitation with the service-role client (documented exception —
 * a signed-in lookup would leak nothing, but an anonymous invitee must see
 * context BEFORE creating an account). Acceptance itself always runs as the
 * signed-in invitee through the RLS-scoped `accept_invitation` RPC, which
 * re-validates token, status, expiry and email match, and audits the result.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const configured = isSupabaseConfigured();
  const viewer = configured ? await getViewer() : null;

  const base = {
    token,
    businessName: null as string | null,
    storeName: null as string | null,
    role: null as "manager" | "staff" | null,
    invitedEmail: null as string | null,
    expiresAt: null as string | null,
    signedIn: !!viewer,
    viewerEmail: viewer?.email ?? null,
    demoMode: !configured,
  };

  let state: InvitationState = "not_found";

  if (!configured) {
    state = "pending";
  } else if (!/^[a-f0-9]{64}$/i.test(token)) {
    state = "not_found";
  } else {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("invitations")
        .select("id, business_id, store_id, email, role, status, expires_at")
        .eq("token_hash", hashInvitationToken(token))
        .maybeSingle();

      const row = data as InviteRow | null;
      if (!row) {
        state = "not_found";
      } else {
        const [businessRes, storeRes] = await Promise.all([
          admin.from("businesses").select("name").eq("id", row.business_id).maybeSingle(),
          row.store_id ? admin.from("stores").select("name").eq("id", row.store_id).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        Object.assign(base, {
          businessName: ((businessRes.data as { name?: string } | null)?.name ?? null) as string | null,
          storeName: ((storeRes.data as { name?: string } | null)?.name ?? null) as string | null,
          role: row.role,
          invitedEmail: row.email,
          expiresAt: row.expires_at,
        });
        if (row.status === "revoked") state = "revoked";
        else if (row.status === "accepted") state = "accepted";
        else if (new Date(row.expires_at).getTime() < Date.now()) state = "expired";
        else state = "pending";
      }
    } catch {
      // Service-role key missing on this deployment — acceptance still works
      // through the RPC; we just can't preview the business context.
      state = "lookup_unavailable";
    }
  }

  return (
    <AuthShell
      headline="Team invitation"
      subheadline="One link, one use — bound to the invited email address."
    >
      <AcceptInvitationCard {...base} state={state} />
    </AuthShell>
  );
}
