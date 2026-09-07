"use client";

import * as React from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CatalogueImage, type CatalogueImageWithId } from "@/components/shared/catalogue-image";
import {
  deleteCatalogueImageAction,
  uploadCatalogueImageAction,
} from "@/app/business/(app)/products/image-actions";

/**
 * Manager-facing upload/replace/remove control for a single product or
 * reward photo (Step 3 Slice 8 UI). One photo per item is the MVP shape —
 * `attach_catalogue_image`/`detach_catalogue_image` support a gallery
 * (`sort_order`, multiple non-primary rows) for later, but no UI here
 * builds on that yet.
 *
 * The server re-derives identity, role and the object path on every call
 * (see image-actions.ts) — nothing here is a trust boundary, only UX.
 */
export type { CatalogueImageWithId };

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

export function CatalogueImageUploader({
  owner,
  ownerId,
  name,
  artKey,
  image,
  onChanged,
  size = "h-20 w-20",
}: {
  owner: "product" | "reward";
  ownerId: string;
  name: string;
  artKey?: string | null;
  image: CatalogueImageWithId | null;
  onChanged: () => void | Promise<void>;
  size?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = React.useCallback(
    async (file: File) => {
      if (file.size > MAX_BYTES) {
        toast.error("That image is over 5 MB — please use a smaller one.");
        return;
      }
      setBusy(true);
      try {
        // Replace = detach the current photo first, then upload the new one
        // as primary. Keeps exactly one photo per item and avoids leaving the
        // old object around once nothing in the UI can reach it.
        if (image) {
          const removed = await deleteCatalogueImageAction(image.imageId);
          if (!removed.ok) {
            toast.error("Couldn't replace the photo", { description: removed.message });
            return;
          }
        }
        const formData = new FormData();
        formData.set(owner === "product" ? "productId" : "rewardId", ownerId);
        formData.set("file", file);
        formData.set("makePrimary", "true");
        const uploaded = await uploadCatalogueImageAction(formData);
        if (!uploaded.ok) {
          toast.error("Couldn't upload the photo", { description: uploaded.message });
          return;
        }
        toast.success("Photo updated.");
        await onChanged();
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [image, owner, ownerId, onChanged]
  );

  const handleRemove = React.useCallback(async () => {
    if (!image) return;
    setBusy(true);
    try {
      const removed = await deleteCatalogueImageAction(image.imageId);
      if (!removed.ok) {
        toast.error("Couldn't remove the photo", { description: removed.message });
        return;
      }
      toast.success("Photo removed.");
      await onChanged();
    } finally {
      setBusy(false);
    }
  }, [image, onChanged]);

  return (
    <div className="flex items-center gap-3">
      <div className={`relative ${size} shrink-0 overflow-hidden rounded-lg border bg-muted`}>
        <CatalogueImage image={image} name={name} artKey={artKey} />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[11px]"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="mr-1 size-3.5" /> {image ? "Replace photo" : "Upload photo"}
        </Button>
        {image && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
            disabled={busy}
            onClick={handleRemove}
          >
            <Trash2 className="mr-1 size-3.5" /> Remove
          </Button>
        )}
        <p className="text-[10px] text-muted-foreground">JPEG, PNG, WebP or AVIF · up to 5 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        aria-label={image ? "Replace photo" : "Upload photo"}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
