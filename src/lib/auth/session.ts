import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { homeForViewer, safeReturnTo, type BusinessRole } from "@/lib/auth/redirects";

/**
 * Trusted server-side current-user & authorization helpers (Stage E.2/E.3).
 *
 * Everything here derives identity from the verified Supabase session (signed
 * JWT via auth.getUser()) — never from client-supplied values. Route layouts
 * call the guards; RLS enforces the same boundaries again at the data layer.
 */

export interface ViewerProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
}

export interface Viewer {
  userId: string;
  email: string;
  profile: ViewerProfile | null;
  businessMemberships: { businessId: string; role: BusinessRole }[];
  businessRoles: BusinessRole[];
  customerOfBusinesses: string[];
}

type Row = Record<string, unknown>;

async function fetchMemberships(supabase: ServerSupabaseClient, userId: string) {
  const { data } = await supabase
    .from("business_memberships")
    .select("business_id, role")
    .eq("profile_id", userId)
    .eq("status", "active");
  return ((data ?? []) as Row[]).map((r) => ({
    businessId: String(r.business_id),
    role: String(r.role) as BusinessRole,
  }));
}

/**
 * Per-request memoized viewer resolution. Returns null when Supabase is not
 * configured (Demo mode) or nobody is signed in.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileRes, memberships, customerRes] = await Promise.all([
    supabase.from("profiles").select("id, email, display_name, avatar_url, status").eq("id", user.id).maybeSingle(),
    fetchMemberships(supabase, user.id),
    supabase.from("customer_memberships").select("business_id").eq("profile_id", user.id),
  ]);

  const profileRow = (profileRes.data ?? null) as Row | null;

  return {
    userId: user.id,
    email: user.email ?? profileRow?.email?.toString() ?? "",
    profile: profileRow
      ? {
          id: String(profileRow.id),
          email: String(profileRow.email ?? ""),
          display_name: (profileRow.display_name as string | null) ?? null,
          avatar_url: (profileRow.avatar_url as string | null) ?? null,
          status: String(profileRow.status ?? "active"),
        }
      : null,
    businessMemberships: memberships,
    businessRoles: memberships.map((m) => m.role),
    customerOfBusinesses: ((customerRes.data ?? []) as Row[]).map((r) => String(r.business_id)),
  };
});

function loginUrlWithReturn(sectionPath: string) {
  return `/login?next=${encodeURIComponent(safeReturnTo(sectionPath, "/"))}`;
}

const ROLE_RANK: Record<string, number> = { owner: 3, manager: 2, staff: 1, super_admin: 4 };

/** Highest-ranked business role across memberships (null = no business role). */
export function primaryBusinessRole(viewer: Viewer | null): BusinessRole | null {
  if (!viewer || viewer.businessRoles.length === 0) return null;
  return [...viewer.businessRoles].sort((a, b) => (ROLE_RANK[b] ?? 0) - (ROLE_RANK[a] ?? 0))[0];
}

/**
 * Customer area guard (Stage E.3). Demo mode (Supabase unconfigured) passes
 * through so the Phase 1 mock journey is untouched; with Supabase configured
 * an anonymous visitor is redirected to /login preserving the destination.
 */
export async function guardCustomerArea(sectionPath = "/customer/dashboard"): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const viewer = await getViewer();
  if (!viewer) redirect(loginUrlWithReturn(sectionPath));
}

/**
 * Business area guard (Stage E.3/E.4): owner/manager/staff only.
 *
 * A freshly confirmed business signup has no membership yet — its user
 * metadata carries the onboarding intent, so the guard completes the signup
 * exactly once through the audited, idempotent `complete_business_signup`
 * RPC. Anyone else without a business membership is routed to their own
 * (customer) experience — never into the business area.
 *
 * Section restriction (mirrors the role permission matrix): /business/staff
 * and /business/settings are owner-only — managers and staff are redirected
 * to the dashboard. RLS enforces the data boundary; this stops the UI dead.
 */
const OWNER_ONLY_SECTIONS = ["/business/settings", "/business/staff"];

export async function guardBusinessArea(sectionPath = "/business/dashboard"): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = await createClient();
  if (!supabase) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginUrlWithReturn(sectionPath));

  let memberships = await fetchMemberships(supabase, user.id);

  if (memberships.length === 0) {
    const md = (user.user_metadata ?? {}) as Record<string, unknown>;
    const businessName = typeof md.business_name === "string" ? md.business_name.trim() : "";
    if (md.signup_context === "business" && businessName) {
      const { error } = await supabase.rpc("complete_business_signup", {
        p_business_name: businessName,
        p_legal_name: businessName,
        p_gstin: typeof md.gstin === "string" && md.gstin.trim() ? md.gstin.trim() : null,
        p_support_phone: typeof md.phone === "string" && md.phone.trim() ? md.phone.trim() : null,
        p_support_email: null,
      });
      if (!error) memberships = await fetchMemberships(supabase, user.id);
    }
    if (memberships.length === 0) {
      redirect(homeForViewer({ businessRoles: [] }));
    }
  }

  const topRole = [...memberships.map((m) => m.role)].sort(
    (a, b) => (ROLE_RANK[b] ?? 0) - (ROLE_RANK[a] ?? 0)
  )[0];
  const cleanPath = safeReturnTo(sectionPath, "/business/dashboard").split("?")[0];
  if (
    topRole !== "owner" &&
    topRole !== "super_admin" &&
    OWNER_ONLY_SECTIONS.some((s) => cleanPath.startsWith(s))
  ) {
    redirect("/business/dashboard");
  }
}

/** Server-side helper for pages/actions that need the signed-in viewer or a redirect. */
export async function requireViewer(returnTo = "/"): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(loginUrlWithReturn(returnTo));
  return viewer;
}
