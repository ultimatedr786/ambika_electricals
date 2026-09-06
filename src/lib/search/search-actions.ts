"use server";

import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/auth/env";

/**
 * Server-search boundary for the global command palette (MVP hotfix
 * §"Complete Global Search").
 *
 * Rules enforced here — never in the browser:
 *  1. Identity comes from the verified Supabase session (`getViewer`), never
 *     from client input.
 *  2. Every query runs through the *user's* RLS-scoped client, so the database
 *     re-checks tenancy/role for each row. Business results additionally
 *     restrict `business_id` to the viewer's memberships, and customer results
 *     to the businesses the viewer is a member OF, so a compromised client
 *     cannot widen the scope by changing the payload.
 *  3. Results are capped (`PER_GROUP`) and the query is length-limited, so the
 *     palette never downloads a production table into the browser.
 *  4. Only display-safe columns are selected — no e-mail, no full phone, no
 *     internal ids beyond what the destination route needs.
 */

const PER_GROUP = 5;
const MAX_TERM = 64;

export type SearchScope = "business" | "customer";

export interface SearchHit {
  id: string;
  group: "customers" | "products" | "sales" | "rewards";
  title: string;
  subtitle?: string;
  href: string;
}

export interface SearchResponse {
  /** `false` when Supabase is not configured — the caller falls back to mock data. */
  server: boolean;
  hits: SearchHit[];
  truncated: boolean;
}

const EMPTY: SearchResponse = { server: false, hits: [], truncated: false };

/** Escapes a user term for a PostgREST `ilike` pattern. */
function likeTerm(raw: string): string {
  return `%${raw.replace(/[%_,()\\]/g, " ").trim()}%`;
}

function inr(paise: number | null | undefined): string {
  if (paise == null) return "";
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));

export async function searchWorkspace(rawTerm: string, scope: SearchScope): Promise<SearchResponse> {
  if (!isSupabaseConfigured()) return EMPTY;

  const term = rawTerm.trim().slice(0, MAX_TERM);
  if (term.length < 2) return { server: true, hits: [], truncated: false };

  const [viewer, supabase] = await Promise.all([getViewer(), createClient()]);
  if (!viewer || !supabase) return { server: true, hits: [], truncated: false };

  const pattern = likeTerm(term);
  const hits: SearchHit[] = [];
  let truncated = false;

  if (scope === "business") {
    const businessIds = viewer.businessMemberships.map((m) => m.businessId);
    if (businessIds.length === 0) return { server: true, hits: [], truncated: false };

    const [customers, products, sales, rewards] = await Promise.all([
      supabase
        .from("customer_memberships")
        .select("id, membership_no, display_name, phone_masked, status")
        .in("business_id", businessIds)
        .or(`display_name.ilike.${pattern},membership_no.ilike.${pattern},phone_masked.ilike.${pattern}`)
        .limit(PER_GROUP),
      supabase
        .from("products")
        .select("id, name, sku, category, price_paise, status")
        .in("business_id", businessIds)
        .or(`name.ilike.${pattern},sku.ilike.${pattern},category.ilike.${pattern}`)
        .limit(PER_GROUP),
      supabase
        .from("sales")
        .select("id, invoice_no, total_paise, sold_at, status")
        .in("business_id", businessIds)
        .ilike("invoice_no", pattern)
        .order("sold_at", { ascending: false })
        .limit(PER_GROUP),
      supabase
        .from("rewards")
        .select("id, name, points_cost, status")
        .in("business_id", businessIds)
        .ilike("name", pattern)
        .limit(PER_GROUP),
    ]);

    for (const r of (customers.data ?? []) as Row[]) {
      hits.push({
        id: `customer:${str(r.id)}`,
        group: "customers",
        title: str(r.display_name) || str(r.membership_no),
        subtitle: [str(r.membership_no), str(r.phone_masked), str(r.status)].filter(Boolean).join(" · "),
        href: `/business/customers/${str(r.id)}`,
      });
    }
    for (const r of (products.data ?? []) as Row[]) {
      hits.push({
        id: `product:${str(r.id)}`,
        group: "products",
        title: str(r.name),
        subtitle: [str(r.sku), inr(r.price_paise as number), str(r.category)].filter(Boolean).join(" · "),
        href: "/business/products",
      });
    }
    for (const r of (sales.data ?? []) as Row[]) {
      hits.push({
        id: `sale:${str(r.id)}`,
        group: "sales",
        title: str(r.invoice_no),
        subtitle: [inr(r.total_paise as number), str(r.status)].filter(Boolean).join(" · "),
        href: "/business/sales",
      });
    }
    for (const r of (rewards.data ?? []) as Row[]) {
      hits.push({
        id: `reward:${str(r.id)}`,
        group: "rewards",
        title: str(r.name),
        subtitle: [`${str(r.points_cost)} points`, str(r.status)].filter(Boolean).join(" · "),
        href: "/business/rewards",
      });
    }
    truncated = [customers, products, sales, rewards].some((r) => (r.data ?? []).length === PER_GROUP);
    return { server: true, hits, truncated };
  }

  // Customer scope — only the viewer's own memberships and the catalogue of the
  // businesses they belong to. RLS enforces the same boundary again.
  const businessIds = viewer.customerOfBusinesses;
  if (businessIds.length === 0) return { server: true, hits: [], truncated: false };

  const [rewards, redemptions] = await Promise.all([
    supabase
      .from("rewards")
      .select("id, name, points_cost, status")
      .in("business_id", businessIds)
      .eq("status", "active")
      .ilike("name", pattern)
      .limit(PER_GROUP),
    supabase
      .from("redemptions")
      .select("id, reference, status, points_used")
      .ilike("reference", pattern)
      .limit(PER_GROUP),
  ]);

  for (const r of (rewards.data ?? []) as Row[]) {
    hits.push({
      id: `reward:${str(r.id)}`,
      group: "rewards",
      title: str(r.name),
      subtitle: `${str(r.points_cost)} points`,
      href: `/customer/rewards/${str(r.id)}`,
    });
  }
  for (const r of (redemptions.data ?? []) as Row[]) {
    hits.push({
      id: `redemption:${str(r.id)}`,
      group: "sales",
      title: str(r.reference),
      subtitle: [`${str(r.points_used)} points`, str(r.status)].filter(Boolean).join(" · "),
      href: "/customer/redemptions",
    });
  }
  truncated = [rewards, redemptions].some((r) => (r.data ?? []).length === PER_GROUP);
  return { server: true, hits, truncated };
}
