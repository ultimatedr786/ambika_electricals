"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { ProductArt } from "@/components/shared/product-art";
import { cn } from "@/lib/utils";

/**
 * Catalogue image with a guaranteed visual (Step 3 Slice 8).
 *
 * The illustration system built in Phase 1.3 is not replaced by uploads — it
 * becomes the fallback. Precedence:
 *
 *   uploaded photo → `ProductArt` illustration → neutral plinth
 *
 * so a product always renders something, whether Storage is unconfigured, the
 * business has not uploaded anything yet, or a single URL fails to load. That
 * last case matters most: a broken <img> is the one state users actually hit,
 * and `onError` demotes it to the illustration rather than a torn icon.
 *
 * Alt text comes from the database (`catalogue_images.alt_text`) so it travels
 * with the image; when there is none we fall back to the product name, never
 * to an empty string — these images are content, not decoration.
 */

export interface CatalogueImageRef {
  bucket: string;
  path: string;
  altText: string | null;
}

export function CatalogueImage({
  image,
  name,
  artKey,
  className,
  sizes = "(max-width: 640px) 50vw, 200px",
}: {
  /** Null when nothing has been uploaded — the illustration is then used. */
  image: CatalogueImageRef | null;
  /** Used for alt text when the image carries none. */
  name: string;
  /** Phase 1.3 illustration key, used whenever there is no usable photo. */
  artKey?: string | null;
  className?: string;
  sizes?: string;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [failed, setFailed] = React.useState(false);

  // Public bucket → a stable, cacheable URL. Computed lazily so the illustration
  // path costs nothing when there is no image.
  const url = React.useMemo(() => {
    if (!image || !supabase) return null;
    const { data } = supabase.storage.from(image.bucket).getPublicUrl(image.path);
    return data?.publicUrl ?? null;
  }, [image, supabase]);

  React.useEffect(() => {
    setFailed(false);
  }, [url]);

  if (!url || failed) {
    return <ProductArt art={artKey || "box"} alt={name} className={className} />;
  }

  return (
    // Plain <img>: Supabase Storage serves these from a project-specific host,
    // and next/image would need it in `remotePatterns` — owner configuration
    // rather than something this repository can know at build time.
    <img
      src={url}
      alt={image?.altText?.trim() || `${name} product photo`}
      sizes={sizes}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("h-full w-full rounded-[inherit] object-cover", className)}
    />
  );
}

/**
 * Fetch the primary image for a set of products or rewards in one round trip.
 * Returns a map keyed by owner id so callers can render a grid without an
 * N+1 query.
 */
export function useCatalogueImages(
  owner: "product" | "reward",
  ids: string[]
): Map<string, CatalogueImageRef> {
  const supabase = React.useMemo(() => createClient(), []);
  const [map, setMap] = React.useState<Map<string, CatalogueImageRef>>(new Map());

  // Stable dependency: the identity of the array changes on every render.
  const key = ids.slice().sort().join(",");

  React.useEffect(() => {
    if (!supabase || key.length === 0) {
      setMap(new Map());
      return;
    }
    let cancelled = false;
    const column = owner === "product" ? "product_id" : "reward_id";

    void supabase
      .from("catalogue_images")
      .select(`id, ${column}, bucket, path, alt_text`)
      .in(column, key.split(","))
      .eq("is_primary", true)
      .then(({ data }) => {
        if (cancelled) return;
        const next = new Map<string, CatalogueImageRef>();
        for (const row of (data ?? []) as Record<string, unknown>[]) {
          const ownerId = row[column];
          if (typeof ownerId !== "string") continue;
          next.set(ownerId, {
            bucket: String(row.bucket),
            path: String(row.path),
            altText: row.alt_text == null ? null : String(row.alt_text),
          });
        }
        setMap(next);
      });

    return () => {
      cancelled = true;
    };
  }, [supabase, owner, key]);

  return map;
}
