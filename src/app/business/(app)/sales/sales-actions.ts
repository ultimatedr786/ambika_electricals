"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer, type Viewer } from "@/lib/auth/session";

/**
 * Server actions for the live POS surface (Step 3 Slice 2).
 *
 * Authorization model: every mutation runs as the signed-in viewer through the
 * SECURITY DEFINER RPCs `create_sale` / `void_sale`, which re-check role,
 * tenancy and store scoping and compute all money/points server-side — these
 * actions never trust client input for totals or permissions. Denials are
 * audited HERE (not inside the raising RPCs, whose statement rollback would
 * erase the row) using the service-role client plus the real client IP.
 */

export type SaleActionFailure =
  | "not_signed_in"
  | "auth_unconfigured"
  | "staff_only"
  | "manager_only"
  | "store_forbidden"
  | "store_not_found"
  | "business_inactive"
  | "customer_not_found"
  | "items_required"
  | "invalid_items"
  | "discount_too_large"
  | "payments_required"
  | "invalid_payment_method"
  | "invalid_payment"
  | "payment_mismatch"
  | "reason_required"
  | "sale_not_found"
  | "sale_not_voidable"
  | "unknown";

export type SaleActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; reason: SaleActionFailure; message: string };

const FRIENDLY: Record<SaleActionFailure, string> = {
  not_signed_in: "Your session expired — please sign in again.",
  auth_unconfigured: "Authentication isn't configured on this deployment yet.",
  staff_only: "Only signed-in business staff can record sales.",
  manager_only: "Only a manager or the owner can void sales.",
  store_forbidden: "You're scoped to specific stores — pick one of yours.",
  store_not_found: "That store wasn't found.",
  business_inactive: "This business isn't active.",
  customer_not_found: "That customer membership isn't active in this business.",
  items_required: "Add at least one item before recording the sale.",
  invalid_items: "One of the items is invalid — every line needs a name, quantity above 0 and a non-negative price.",
  discount_too_large: "The discount can't exceed the item subtotal.",
  payments_required: "Record how the customer paid.",
  invalid_payment_method: "That payment method isn't supported.",
  invalid_payment: "Payment amounts must be positive.",
  payment_mismatch: "The payments don't add up to the sale total.",
  reason_required: "Voiding a sale needs a short reason (it's kept in the audit trail).",
  sale_not_found: "That sale wasn't found.",
  sale_not_voidable: "This sale was already voided or refunded.",
  unknown: "Something went wrong. Please try again.",
};

function classifySaleError(error: { message?: string; code?: string } | null): SaleActionFailure {
  if (!error) return "unknown";
  const m = (error.message ?? "").toLowerCase();
  const marker = (key: string) => m.startsWith(key) || m.includes(key);

  if (marker("authentication_required")) return "not_signed_in";
  if (marker("store_forbidden")) return "store_forbidden";
  if (marker("store_not_found")) return "store_not_found";
  if (marker("business_inactive")) return "business_inactive";
  if (marker("customer_not_found")) return "customer_not_found";
  if (marker("items_required")) return "items_required";
  if (marker("invalid_item")) return "invalid_items";
  if (marker("discount_exceeds_subtotal")) return "discount_too_large";
  if (marker("payments_required")) return "payments_required";
  if (marker("invalid_payment_method")) return "invalid_payment_method";
  if (marker("invalid_payment")) return "invalid_payment";
  if (marker("payment_mismatch")) return "payment_mismatch";
  if (marker("reason_required")) return "reason_required";
  if (marker("sale_not_found")) return "sale_not_found";
  if (marker("sale_not_voidable")) return "sale_not_voidable";
  if (marker("not_authorized")) return m.includes("manager") ? "manager_only" : "staff_only";
  if (error.code === "42501") return "staff_only";
  return "unknown";
}

function fail<T>(reason: SaleActionFailure): SaleActionResult<T> {
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
  reason: SaleActionFailure;
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
  | { ok: false; result: SaleActionResult<T> }
> {
  const viewer = await getViewer();
  const supabase = await createClient();
  if (!viewer || !supabase) {
    return { ok: false, result: fail<T>(supabase ? "not_signed_in" : "auth_unconfigured") };
  }
  return { ok: true, viewer, supabase };
}

/* ------------------------------------------------------------------ */
/* Recording sales                                                     */
/* ------------------------------------------------------------------ */

export type LivePaymentMethod = "cash" | "upi" | "card" | "credit" | "other";

export interface SaleLineInput {
  name: string;
  sku?: string | null;
  qty: number;
  /** Whole paise only — the RPC recomputes and never trusts these. */
  unitPricePaise: number;
  lineDiscountPaise?: number;
}

export interface SalePaymentInput {
  method: LivePaymentMethod;
  amountPaise: number;
  reference?: string | null;
}

export interface RecordSaleInput {
  storeId: string;
  customerMembershipId?: string | null;
  lines: SaleLineInput[];
  discountPaise?: number;
  payments: SalePaymentInput[];
  /** Client-generated UUID; replay returns the stored sale instead of duplicating. */
  idempotencyKey: string;
}

export interface SaleOutcome {
  saleId: string;
  invoiceNo: string;
  subtotalPaise: number;
  discountPaise: number;
  totalPaise: number;
  pointsBase: number;
  pointsTotal: number;
  /** Null for walk-ins and replays. */
  balanceAfter: number | null;
  replayed: boolean;
}

export async function recordSaleAction(input: RecordSaleInput): Promise<SaleActionResult<SaleOutcome>> {
  const authed = await requireAuthedClient<SaleOutcome>();
  if (!authed.ok) return authed.result;
  const { viewer, supabase } = authed;

  const { data, error } = await supabase.rpc("create_sale", {
    p_store_id: input.storeId,
    p_items: input.lines.map((l) => ({
      name: l.name,
      sku: l.sku ?? null,
      qty: l.qty,
      unit_price_paise: l.unitPricePaise,
      line_discount_paise: l.lineDiscountPaise ?? 0,
    })),
    p_payments: input.payments.map((p) => ({
      method: p.method,
      amount_paise: p.amountPaise,
      reference: p.reference ?? null,
    })),
    p_customer_membership_id: input.customerMembershipId ?? null,
    p_discount_paise: input.discountPaise ?? 0,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) {
    const reason = classifySaleError(error);
    await auditDenial({
      action: "sale.create_denied",
      reason,
      targetType: "store",
      targetId: input.storeId,
      metadata: {
        lines: input.lines.length,
        membership: input.customerMembershipId ?? null,
        viewer_id: viewer.userId,
      },
    });
    return fail(reason);
  }

  const row = (Array.isArray(data) ? data[0] : data ?? {}) as {
    sale_id?: string;
    invoice_no?: string;
    subtotal_paise?: number;
    discount_paise?: number;
    total_paise?: number;
    points?: { base?: number; total?: number };
    balance_after?: number | null;
    replayed?: boolean;
  };
  return {
    ok: true,
    data: {
      saleId: row.sale_id ?? "",
      invoiceNo: row.invoice_no ?? "",
      subtotalPaise: Number(row.subtotal_paise ?? 0),
      discountPaise: Number(row.discount_paise ?? 0),
      totalPaise: Number(row.total_paise ?? 0),
      pointsBase: Number(row.points?.base ?? 0),
      pointsTotal: Number(row.points?.total ?? 0),
      balanceAfter: row.balance_after == null ? null : Number(row.balance_after),
      replayed: Boolean(row.replayed),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Voiding sales (manager+, reason required, points auto-reversed)     */
/* ------------------------------------------------------------------ */

export interface VoidSaleOutcome {
  saleId: string;
  invoiceNo: string;
  pointsReversed: number;
  balanceAfter: number | null;
}

export async function voidSaleAction(saleId: string, reason: string): Promise<SaleActionResult<VoidSaleOutcome>> {
  const authed = await requireAuthedClient<VoidSaleOutcome>();
  if (!authed.ok) return authed.result;
  const { supabase } = authed;

  const { data, error } = await supabase.rpc("void_sale", { p_sale_id: saleId, p_reason: reason });
  if (error) {
    const reasonCode = classifySaleError(error);
    await auditDenial({
      action: "sale.void_denied",
      reason: reasonCode,
      targetType: "sale",
      targetId: saleId,
      metadata: { provided_reason: reason.slice(0, 120) },
    });
    return fail(reasonCode);
  }

  const row = (Array.isArray(data) ? data[0] : data ?? {}) as {
    sale_id?: string;
    invoice_no?: string;
    points_reversed?: number;
    balance_after?: number | null;
  };
  return {
    ok: true,
    data: {
      saleId: row.sale_id ?? saleId,
      invoiceNo: row.invoice_no ?? "",
      pointsReversed: Number(row.points_reversed ?? 0),
      balanceAfter: row.balance_after == null ? null : Number(row.balance_after),
    },
  };
}
