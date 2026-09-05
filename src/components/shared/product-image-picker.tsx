"use client";

import * as React from "react";
import { Check, ImageUp, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ProductArt, productArtCatalogue, productArtLabel, type ProductArtCategory,
} from "@/components/shared/product-art";
import { cn } from "@/lib/utils";

const filters: ("All" | ProductArtCategory)[] = [
  "All", "Lighting", "Switches & Sockets", "Wires & Cables",
  "Protection", "Distribution", "Fans", "Accessories",
];

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/**
 * Product visual selector.
 *
 * Replaces the previous grid of tiny outlined Lucide icons with the curated
 * Ambika product-visual catalogue: one art direction, a readable label under
 * every option, category filtering, search, and an optional local upload.
 *
 * Uploads are held as an in-browser object URL preview only — real storage
 * arrives with Phase 2.
 */
export function ProductImagePicker({
  value,
  onChange,
  allowUpload = true,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  allowUpload?: boolean;
  id?: string;
}) {
  const [category, setCategory] = React.useState<(typeof filters)[number]>("All");
  const [query, setQuery] = React.useState("");
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const objectUrl = React.useRef<string | null>(null);

  React.useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    []
  );

  const isCustom = /^(data:|blob:|https?:)/.test(value);

  const options = React.useMemo(() => {
    const t = query.trim().toLowerCase();
    return productArtCatalogue
      .filter((o) => o.category !== "Rewards")
      .filter((o) => category === "All" || o.category === category)
      .filter((o) => !t || `${o.label} ${o.category}`.toLowerCase().includes(t));
  }, [category, query]);

  const handleFile = (file: File | undefined) => {
    setUploadError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Choose a PNG, JPG or WebP image.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError("Image must be under 2 MB.");
      return;
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    onChange(url);
  };

  return (
    <div className="space-y-3" id={id}>
      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-52">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search visuals"
            aria-label="Search product visuals"
            className="h-9 pl-8"
          />
        </div>
        <div className="scroll-region-x -mx-1 flex-1 px-1 no-scrollbar">
          <div className="flex w-max gap-1.5 py-0.5" role="tablist" aria-label="Visual category">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={category === f}
                onClick={() => setCategory(f)}
                className={cn(
                  "min-h-[32px] whitespace-nowrap rounded-full border px-2.5 text-xs font-medium transition-colors",
                  category === f
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Selected custom upload */}
      {isCustom && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/[0.04] p-2.5">
          <ProductArt art={value} className="size-14 shrink-0" alt="Uploaded product image preview" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Custom image selected</p>
            <p className="text-xs text-muted-foreground">Local preview only until image storage is connected.</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange("bulb")}
            aria-label="Remove custom image"
          >
            <Trash2 />
          </Button>
        </div>
      )}

      {/* Grid */}
      <div
        role="radiogroup"
        aria-label="Product visual"
        className="scroll-region grid max-h-[268px] grid-cols-2 gap-2 rounded-xl border bg-muted/25 p-2 sm:grid-cols-3 lg:grid-cols-4"
      >
        {options.map((o) => {
          const selected = value === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(o.key)}
              className={cn(
                "group relative flex flex-col gap-1.5 rounded-lg border bg-card p-1.5 text-left transition-all",
                "hover:border-primary/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "border-primary ring-1 ring-primary" : "border-border"
              )}
            >
              <ProductArt art={o.key} className="aspect-[4/3] w-full" />
              <span className="line-clamp-2 px-0.5 pb-0.5 text-[11px] font-medium leading-tight text-muted-foreground group-hover:text-foreground">
                {o.label}
              </span>
              {selected && (
                <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                  <span className="sr-only">Selected</span>
                </span>
              )}
            </button>
          );
        })}
        {options.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
            No visuals match “{query}”.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Selected: <span className="font-medium text-foreground">{isCustom ? "Custom image" : productArtLabel(value)}</span>
        </p>
        {allowUpload && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <ImageUp /> Upload image
            </Button>
          </>
        )}
      </div>
      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
    </div>
  );
}
