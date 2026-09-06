"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer, type Viewer } from "@/lib/auth/session";

/**
 * Server actions for the live catalogue & inventory surface (Step 3 Slice 3).
 *
 * Authorization model: every mutation runs as the signed-in viewer through the
 * SECURITY DEFINER RPCs (`create_product`, `update_product`, `receive_stock`,
 * `adjust_stock`), which re-check role and tenancy; all stock changes append
 * to the immutable `inventory_movements` history. Denials are audited HERE
 * (the raising RPCs roll their statement back) using the service-role client
 * plus the real client IP — same pattern as team-actions/sales-actions.
 */

export type InventoryActionFailure =
  | "not_signed_in"
  | "auth_unconfigured"
  | "manager_only"
  | "business_inactive"
  | "invalid_product"
  | "invalid_sku"
  | "sku_exists"
  | "invalid_price"
  | "invalid_status"
  | "nothing_to_update"
  | "store_not_found"
  | "store_not_in_business"
  | "product_not_found"
  | "product_not_in_business"
  | "product_archived"
  | "invalid_quantity"
  | "reason_required"
  | "insufficient_stock"
  | "unknown";

export type InventoryActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; reason: InventoryActionFailure; message: string };

const FRIENDLY: Record<InventoryActionFailure, string> = {
  not_signed_in: "Your session expired — please sign in again.",
  auth_unconfigured: "Authentication isn't configured on this deployment yet.",
  manager_only: "Only a manager or the owner can do this.",
  business_inactive: "This business isn't active.",
  invalid_product: "The product needs a name.",
  invalid_sku: "SKU must be 3–32 letters/digits/._- and start with a letter or number.",
  sku_exists: "That SKU is already in your catalogue.",
  invalid_price: "Price must be ₹0 or more.",
  invalid_status: "Products are active or archived — they're never deleted.",
  nothing_to_update: "Nothing to update yet.",
  store_not_found: "That store wasn't found.",
  store_not_in_business: "That store doesn't belong to this business.",
  product_not_found: "That product wasn't found.",
  product_not_in_business: "That product isn't in this business's catalogue.",
  product_archived: "Archived products can't take stock changes — unarchive first.",
  invalid_quantity: "Quantity must be a positive whole number.",
  reason_required: "Stock adjustments need a short reason (it's kept in the movement history).",
  insufficient_stock: "Not enough stock on hand for that movement.",
  unknown: "Something went wrong. Please try again.",
};

function classifyInventoryError(error: { message?: string; code?: string } | null): InventoryActionFailure {
  if (!error) return "unknown";
  const m = (error.message ?? "").toLowerCase();
  const marker = (key: string) => m.startsWith(key) || m.includes(key);

  if (marker("authentication_required")) return "not_signed_in";
  if (marker("business_inactive")) return "business_inactive";
  if (marker("invalid_product")) return "invalid_product";
  if (marker("invalid_sku")) return "invalid_sku";
  if (marker("sku_exists")) return "sku_exists";
  if (marker("invalid_price")) return "invalid_price";
  if (marker("invalid_status")) return "invalid_status";
  if (marker("nothing_to_update")) return "nothing_to_update";
  if (marker("store_not_found")) return "store_not_found";
  if (marker("store_not_in_business")) return "store_not_in_business";
  if (marker("product_not_found")) return "product_not_found";
  if (marker("product_not_in_business")) return "product_not_in_business";
  if (marker("product_archived")) return "product_archived";
  if (marker("invalid_quantity")) return "invalid_quantity";
  if (marker("reason_required")) return "reason_required";
  if (marker("insufficient_stock")) return "insufficient_stock";
  if (marker("not_authorized") || error.code === "42501") return "manager_only";
  return "unknown";
}

function fail<T>(reason: InventoryActionFailure): InventoryActionResult<T> {
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
  reason: InventoryActionFailure;
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
  | { ok: false; result: InventoryActionResult<T> }
> {
  const viewer = await getViewer();
  const supabase = await createClient();
  if (!viewer || !supabase) {
    return { ok: false, result: fail<T>(supabase ? "not_signed_in" : "auth_unconfigured") };
  }
  return { ok: true, viewer, supabase };
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

export interface CreateProductInput {
  businessId: string;
  name: string;
  sku: string;
  /** Whole paise. */
  pricePaise: number;
  category?: string | null;
  subcategory?: string | null;
  mrpPaise?: number | null;
  unit?: string;
  artKey?: string | null;
  /** [{ storeId, qty }] posted as immutable 'initial' movements. */
  openingStock?: { storeId: string; qty: number }[];
}

export interface CreateProductOutcome {
  productId: string;
  sku: string;
  name: string;
  pricePaise: number;
  storesStocked: number;
}

export async function createProductAction(
  input: CreateProductInput
): Promise<InventoryActionResult<CreateProductOutcome>> {
  const authed = await requireAuthedClient<CreateProductOutcome>();
  if (!authed.ok) return authed.result;
  const { viewer, supabase } = authed;

  const { data, error } = await supabase.rpc("create_product", {
    p_business_id: input.businessId,
    p_name: input.name,
    p_sku: input.sku,
    p_price_paise: input.pricePaise,
    p_category: input.category ?? null,
    p_subcategory: input.subcategory ?? null,
    p_mrp_paise: input.mrpPaise ?? null,
    p_unit: input.unit ?? "piece",
    p_art_key: input.artKey ?? null,
    p_opening_stock: (input.openingStock ?? []).map((s) => ({ store_id: s.storeId, qty: s.qty })),
  });

  if (error) {
    const reason = classifyInventoryError(error);
    await auditDenial({
      action: "product.create_denied",
      reason,
      businessId: input.businessId,
      targetType: "product_sku",
      targetId: input.sku,
      metadata: { name: input.name, price_paise: input.pricePaise, viewer_id: viewer.userId },
    });
    return fail(reason);
  }

  const row = (Array.isArray(data) ? data[0] : data ?? {}) as {
    product_id?: string; sku?: string; name?: string; price_paise?: number; stores_stocked?: number;
  };
  return {
    ok: true,
    data: {
      productId: row.product_id ?? "",
      sku: row.sku ?? "",
      name: row.name ?? "",
      pricePaise: Number(row.price_paise ?? 0),
      storesStocked: Number(row.stores_stocked ?? 0),
    },
  };
}

export interface UpdateProductInput {
  productId: string;
  name?: string | null;
  pricePaise?: number | null;
  category?: string | null;
  subcategory?: string | null;
  mrpPaise?: number | null;
  unit?: string | null;
  artKey?: string | null;
  status?: "active" | "archived" | null;
}

export async function updateProductAction(input: UpdateProductInput): Promise<InventoryActionResult> {
  const authed = await requireAuthedClient();
  if (!authed.ok) return authed.result;
  const { supabase } = authed;

  const { error } = await supabase.rpc("update_product", {
    p_product_id: input.productId,
    p_name: input.name ?? null,
    p_price_paise: input.pricePaise ?? null,
    p_category: input.category ?? null,
    p_subcategory: input.subcategory ?? null,
    p_mrp_paise: input.mrpPaise ?? null,
    p_unit: input.unit ?? null,
    p_art_key: input.artKey ?? null,
    p_status: input.status ?? null,
  });
  if (error) {
    const reason = classifyInventoryError(error);
    await auditDenial({
      action: "product.update_denied",
      reason,
      targetType: "product",
      targetId: input.productId,
      metadata: { requested_status: input.status ?? null, requested_price: input.pricePaise ?? null },
    });
    return fail(reason);
  }
  return { ok: true, data: undefined };
}

/* ------------------------------------------------------------------ */
/* Stock movements (manager+, append-only history)                     */
/* ------------------------------------------------------------------ */

export interface StockMovementOutcome {
  productId: string;
  storeId: string;
  quantity: number;
  balanceAfter: number;
  replayed: boolean;
}

export async function receiveStockAction(
  storeId: string,
  productId: string,
  quantity: number,
  note?: string | null,
  idempotencyKey?: string
): Promise<InventoryActionResult<StockMovementOutcome>> {
  const authed = await requireAuthedClient<StockMovementOutcome>();
  if (!authed.ok) return authed.result;
  const { supabase } = authed;

  const { data, error } = await supabase.rpc("receive_stock", {
    p_store_id: storeId,
    p_product_id: productId,
    p_quantity: quantity,
    p_note: note ?? null,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) {
    const reason = classifyInventoryError(error);
    await auditDenial({
      action: "stock.receive_denied",
      reason,
      targetType: "product",
      targetId: productId,
      metadata: { store_id: storeId, quantity },
    });
    return fail(reason);
  }
  const row = (Array.isArray(data) ? data[0] : data ?? {}) as {
    product_id?: string; store_id?: string; quantity?: number; balance_after?: number; replayed?: boolean;
  };
  return {
    ok: true,
    data: {
      productId: row.product_id ?? productId,
      storeId: row.store_id ?? storeId,
      quantity: Number(row.quantity ?? quantity),
      balanceAfter: Number(row.balance_after ?? 0),
      replayed: Boolean(row.replayed),
    },
  };
}

export async function adjustStockAction(
  storeId: string,
  productId: string,
  delta: number,
  reason: string,
  idempotencyKey?: string
): Promise<InventoryActionResult<StockMovementOutcome>> {
  const authed = await requireAuthedClient<StockMovementOutcome>();
  if (!authed.ok) return authed.result;
  const { supabase } = authed;

  const { data, error } = await supabase.rpc("adjust_stock", {
    p_store_id: storeId,
    p_product_id: productId,
    p_delta: delta,
    p_reason: reason,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) {
    const code = classifyInventoryError(error);
    await auditDenial({
      action: "stock.adjust_denied",
      reason: code,
      targetType: "product",
      targetId: productId,
      metadata: { store_id: storeId, delta, provided_reason: reason.slice(0, 120) },
    });
    return fail(code);
  }
  const row = (Array.isArray(data) ? data[0] : data ?? {}) as {
    product_id?: string; store_id?: string; delta?: number; balance_after?: number; replayed?: boolean;
  };
  return {
    ok: true,
    data: {
      productId: row.product_id ?? productId,
      storeId: row.store_id ?? storeId,
      quantity: Number(row.delta ?? delta),
      balanceAfter: Number(row.balance_after ?? 0),
      replayed: Boolean(row.replayed),
    },
  };
}
