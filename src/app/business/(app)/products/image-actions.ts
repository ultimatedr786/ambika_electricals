"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/auth/session";

/**
 * Catalogue image upload (Step 3 Slice 8).
 *
 * The browser never talks to Storage directly. It posts the file here, and the
 * server:
 *
 *   1. re-derives the caller's identity and role (never trusts the form);
 *   2. validates the declared MIME type **against the file's actual magic
 *      bytes** — a `.png` extension and a `Content-Type` header are both
 *      attacker-controlled, the first eight bytes are the only honest signal;
 *   3. enforces the size cap before anything is written;
 *   4. builds the object path itself, so `<business_id>/…` — the tenancy
 *      boundary that the Storage policies check — can never be forged;
 *   5. uploads, then records the metadata through `attach_catalogue_image`,
 *      which repeats every check on the database side.
 *
 * If step 5 fails the uploaded object is removed again: an object with no
 * metadata row is invisible to the app, and leaving it would be litter.
 */

export type ImageActionFailure =
  | "not_signed_in"
  | "auth_unconfigured"
  | "manager_only"
  | "no_file"
  | "file_too_large"
  | "unsupported_type"
  | "content_mismatch"
  | "owner_not_found"
  | "upload_failed"
  | "unknown";

export type ImageActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; reason: ImageActionFailure; message: string };

const FRIENDLY: Record<ImageActionFailure, string> = {
  not_signed_in: "Your session expired — please sign in again.",
  auth_unconfigured: "Image uploads need Supabase Storage, which isn't configured here.",
  manager_only: "Only a manager or the owner can change catalogue images.",
  no_file: "Choose an image first.",
  file_too_large: "That image is over 5 MB — please use a smaller one.",
  unsupported_type: "Use a JPEG, PNG, WebP or AVIF image.",
  content_mismatch: "That file isn't the image type it claims to be.",
  owner_not_found: "That product or reward wasn't found in your business.",
  upload_failed: "The upload didn't complete. Please try again.",
  unknown: "Something went wrong. Please try again.",
};

function fail<T>(reason: ImageActionFailure): ImageActionResult<T> {
  return { ok: false, reason, message: FRIENDLY[reason] };
}

/** Mirrors the database CHECK and the bucket configuration. */
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

/**
 * Sniff the real type from the file header.
 *
 * Returns null when the bytes match no format we accept — which is the case we
 * care about, because it means the declared type was a lie.
 */
function sniffMime(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length < 12) return null;
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "image/png";
  }
  const ascii = (from: number, len: number) =>
    String.fromCharCode(...b.subarray(from, from + len));
  // RIFF....WEBP
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  // ....ftyp{avif|avis}
  if (ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip");
  } catch {
    return null;
  }
}

async function auditDenial(reason: ImageActionFailure, metadata: Record<string, unknown>) {
  try {
    const admin = createAdminClient();
    const viewer = await getViewer();
    await admin.rpc("write_audit", {
      p_action: "catalogue_image.upload_denied",
      p_actor: viewer?.userId ?? null,
      p_actor_role: null,
      p_business_id: null,
      p_store_id: null,
      p_target_type: "catalogue_image",
      p_target_id: null,
      p_metadata: { reason, ip: await clientIp(), ...metadata },
    });
  } catch {
    /* auditing must never break the upload flow */
  }
}

export interface UploadedImage {
  imageId: string;
  bucket: string;
  path: string;
  isPrimary: boolean;
}

export async function uploadCatalogueImageAction(
  formData: FormData
): Promise<ImageActionResult<UploadedImage>> {
  const viewer = await getViewer();
  const supabase = await createClient();
  if (!viewer || !supabase) {
    return fail<UploadedImage>(supabase ? "not_signed_in" : "auth_unconfigured");
  }

  const productId = (formData.get("productId") as string | null) || null;
  const rewardId = (formData.get("rewardId") as string | null) || null;
  const altText = ((formData.get("altText") as string | null) ?? "").slice(0, 200);
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) return fail("no_file");
  if (!productId === !rewardId) return fail("owner_not_found");
  if (file.size > MAX_BYTES) {
    await auditDenial("file_too_large", { size: file.size });
    return fail("file_too_large");
  }
  if (!ALLOWED.has(file.type)) {
    await auditDenial("unsupported_type", { declared: file.type });
    return fail("unsupported_type");
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffMime(buffer);
  if (!sniffed || sniffed !== file.type) {
    // The declared type and the bytes disagree — refuse rather than guess.
    await auditDenial("content_mismatch", { declared: file.type, sniffed });
    return fail("content_mismatch");
  }

  // Resolve the owning business server-side. This is also the authorization
  // check: RLS only returns rows from businesses the viewer belongs to.
  const ownerTable = productId ? "products" : "rewards";
  const ownerId = (productId ?? rewardId)!;
  const { data: owner } = await supabase
    .from(ownerTable)
    .select("id, business_id")
    .eq("id", ownerId)
    .maybeSingle();
  const businessId = (owner as { business_id?: string } | null)?.business_id;
  if (!businessId) return fail("owner_not_found");

  const bucket = productId ? "product-images" : "reward-images";
  // The path is built here, never accepted from the client: its first segment
  // is what the Storage policies use as the tenancy check.
  const path = `${businessId}/${ownerId}/${crypto.randomUUID()}.${EXT[sniffed]}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType: sniffed, upsert: false, cacheControl: "31536000" });
  if (uploadError) {
    await auditDenial("upload_failed", { bucket, message: uploadError.message });
    return fail("upload_failed");
  }

  const { data, error } = await supabase.rpc("attach_catalogue_image", {
    p_product_id: productId,
    p_reward_id: rewardId,
    p_bucket: bucket,
    p_path: path,
    p_mime_type: sniffed,
    p_size_bytes: file.size,
    p_width: null,
    p_height: null,
    p_alt_text: altText || null,
    p_make_primary: formData.get("makePrimary") === "true",
  });

  if (error) {
    // Roll the object back so Storage never holds something the app cannot see.
    await supabase.storage.from(bucket).remove([path]);
    const reason: ImageActionFailure = (error.message ?? "").includes("not_authorized")
      ? "manager_only"
      : "unknown";
    await auditDenial(reason, { bucket, path });
    return fail(reason);
  }

  const row = (data ?? {}) as { image_id?: string; is_primary?: boolean };
  return {
    ok: true,
    data: {
      imageId: String(row.image_id ?? ""),
      bucket,
      path,
      isPrimary: Boolean(row.is_primary),
    },
  };
}

/** Detach the metadata row and delete the object it pointed at. */
export async function deleteCatalogueImageAction(
  imageId: string
): Promise<ImageActionResult<{ removed: boolean }>> {
  const viewer = await getViewer();
  const supabase = await createClient();
  if (!viewer || !supabase) {
    return fail<{ removed: boolean }>(supabase ? "not_signed_in" : "auth_unconfigured");
  }

  const { data, error } = await supabase.rpc("detach_catalogue_image", { p_image_id: imageId });
  if (error) {
    const reason: ImageActionFailure = (error.message ?? "").includes("not_authorized")
      ? "manager_only"
      : "unknown";
    return fail(reason);
  }

  const row = (data ?? {}) as { bucket?: string; path?: string };
  if (row.bucket && row.path) {
    // Best effort: the row is the source of truth, so a failed object delete
    // leaves litter but never a dangling image in the UI.
    await supabase.storage.from(row.bucket).remove([row.path]);
  }
  return { ok: true, data: { removed: true } };
}
