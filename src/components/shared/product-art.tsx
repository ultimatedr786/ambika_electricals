import { cn } from "@/lib/utils";

type ArtKey =
  | "bulb" | "smartbulb" | "tube" | "panel" | "flood" | "switch" | "socket" | "regulator"
  | "wire" | "mcb" | "db" | "fan" | "holder" | "plug" | "conduit" | "box" | "tie" | "gland"
  | "tape" | "extension" | "coupon" | "offer";

const stroke = "currentColor";

const art: Record<ArtKey, React.ReactNode> = {
  bulb: (
    <>
      <path d="M32 12a13 13 0 0 0-7.6 23.5c1.3 1 2.1 2.4 2.1 4V41h11v-1.5c0-1.6.8-3 2.1-4A13 13 0 0 0 32 12Z" fill="currentColor" fillOpacity=".1" stroke={stroke} strokeWidth="2.2" />
      <path d="M26.5 45h11M28 49.5h8" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M32 21v9m-4 4h8" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  smartbulb: (
    <>
      <path d="M32 12a13 13 0 0 0-7.6 23.5c1.3 1 2.1 2.4 2.1 4V41h11v-1.5c0-1.6.8-3 2.1-4A13 13 0 0 0 32 12Z" fill="currentColor" fillOpacity=".12" stroke={stroke} strokeWidth="2.2" />
      <path d="M26.5 45h11M28 49.5h8" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M27 27a5 5 0 0 1 10 0" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <path d="M23.5 24a9 9 0 0 1 17 0" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
    </>
  ),
  tube: (
    <>
      <rect x="8" y="26" width="48" height="12" rx="6" fill="currentColor" fillOpacity=".1" stroke={stroke} strokeWidth="2.2" />
      <path d="M8 32h4M52 32h4" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M18 32h28" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" opacity=".5" strokeDasharray="3 4" />
    </>
  ),
  panel: (
    <>
      <circle cx="32" cy="32" r="18" fill="currentColor" fillOpacity=".08" stroke={stroke} strokeWidth="2.2" />
      <circle cx="32" cy="32" r="11" stroke={stroke} strokeWidth="1.8" opacity=".6" />
      <path d="M32 14v-4M32 54v-4M50 32h4M10 32h4" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  flood: (
    <>
      <rect x="12" y="16" width="40" height="22" rx="4" fill="currentColor" fillOpacity=".1" stroke={stroke} strokeWidth="2.2" />
      <path d="M22 38v6a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4v-6" stroke={stroke} strokeWidth="2.2" />
      <path d="M20 24h24M20 30h16" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" opacity=".55" />
    </>
  ),
  switch: (
    <>
      <rect x="17" y="12" width="30" height="40" rx="5" fill="currentColor" fillOpacity=".08" stroke={stroke} strokeWidth="2.2" />
      <rect x="25" y="22" width="14" height="20" rx="3" stroke={stroke} strokeWidth="2" />
      <path d="M32 26v6" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  socket: (
    <>
      <rect x="12" y="14" width="40" height="36" rx="6" fill="currentColor" fillOpacity=".08" stroke={stroke} strokeWidth="2.2" />
      <circle cx="26" cy="36" r="2.6" fill={stroke} />
      <circle cx="38" cy="36" r="2.6" fill={stroke} />
      <circle cx="32" cy="25" r="2.6" fill={stroke} />
    </>
  ),
  regulator: (
    <>
      <rect x="17" y="12" width="30" height="40" rx="5" fill="currentColor" fillOpacity=".08" stroke={stroke} strokeWidth="2.2" />
      <circle cx="32" cy="32" r="9" stroke={stroke} strokeWidth="2.2" />
      <path d="M32 32l5-5" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  wire: (
    <>
      <circle cx="32" cy="32" r="19" fill="currentColor" fillOpacity=".07" stroke={stroke} strokeWidth="2.2" />
      <circle cx="32" cy="32" r="8" stroke={stroke} strokeWidth="2.2" />
      <path d="M32 13v6M51 32h-6M32 51v-6M13 32h6" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" opacity=".6" />
    </>
  ),
  mcb: (
    <>
      <rect x="20" y="10" width="24" height="44" rx="4" fill="currentColor" fillOpacity=".08" stroke={stroke} strokeWidth="2.2" />
      <rect x="27" y="20" width="10" height="14" rx="2" stroke={stroke} strokeWidth="2" />
      <path d="M20 44h24M32 34v10" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" opacity=".6" />
    </>
  ),
  db: (
    <>
      <rect x="10" y="14" width="44" height="36" rx="5" fill="currentColor" fillOpacity=".08" stroke={stroke} strokeWidth="2.2" />
      <path d="M32 14v36" stroke={stroke} strokeWidth="1.6" opacity=".5" />
      <rect x="16" y="22" width="5" height="12" rx="1.5" stroke={stroke} strokeWidth="1.8" />
      <rect x="24" y="22" width="5" height="12" rx="1.5" stroke={stroke} strokeWidth="1.8" />
      <rect x="38" y="22" width="5" height="12" rx="1.5" stroke={stroke} strokeWidth="1.8" />
      <rect x="46" y="22" width="5" height="12" rx="1.5" stroke={stroke} strokeWidth="1.8" />
    </>
  ),
  fan: (
    <>
      <circle cx="32" cy="32" r="5" fill="currentColor" fillOpacity=".2" stroke={stroke} strokeWidth="2.2" />
      <path d="M32 27c0-8 3-13 8-13s6 8-1 11l-7 2ZM37 32c8 0 13 3 13 8s-8 6-11-1l-2-7ZM32 37c0 8-3 13-8 13s-6-8 1-11l7-2ZM27 32c-8 0-13-3-13-8s8-6 11 1l2 7Z" fill="currentColor" fillOpacity=".08" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  holder: (
    <>
      <path d="M26 16h12v10a6 6 0 0 1-6 6 6 6 0 0 1-6-6V16Z" fill="currentColor" fillOpacity=".1" stroke={stroke} strokeWidth="2.2" />
      <path d="M28 34h8v10a4 4 0 0 1-8 0V34Z" stroke={stroke} strokeWidth="2.2" />
      <path d="M22 16h20" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  plug: (
    <>
      <path d="M22 20h20v14a10 10 0 0 1-20 0V20Z" fill="currentColor" fillOpacity=".1" stroke={stroke} strokeWidth="2.2" />
      <path d="M27 20v-7M37 20v-7M32 44v8" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  conduit: (
    <>
      <rect x="8" y="24" width="48" height="16" rx="8" fill="currentColor" fillOpacity=".08" stroke={stroke} strokeWidth="2.2" />
      <path d="M22 24v16M40 24v16" stroke={stroke} strokeWidth="1.8" opacity=".5" />
    </>
  ),
  box: (
    <>
      <rect x="14" y="14" width="36" height="36" rx="5" fill="currentColor" fillOpacity=".08" stroke={stroke} strokeWidth="2.2" />
      <path d="M14 26h36M26 14v36" stroke={stroke} strokeWidth="1.6" opacity=".5" />
    </>
  ),
  tie: (
    <>
      <path d="M18 44c10-4 14-14 10-24" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M24 46c12-5 17-17 12-29" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" opacity=".6" />
      <rect x="14" y="38" width="10" height="8" rx="2" fill="currentColor" fillOpacity=".12" stroke={stroke} strokeWidth="2" />
    </>
  ),
  gland: (
    <>
      <rect x="14" y="26" width="36" height="12" rx="3" fill="currentColor" fillOpacity=".08" stroke={stroke} strokeWidth="2.2" />
      <path d="M24 26v12M32 26v12M40 26v12" stroke={stroke} strokeWidth="1.8" opacity=".5" />
    </>
  ),
  tape: (
    <>
      <circle cx="32" cy="32" r="18" fill="currentColor" fillOpacity=".08" stroke={stroke} strokeWidth="2.2" />
      <circle cx="32" cy="32" r="7" stroke={stroke} strokeWidth="2.2" />
      <path d="M46 26c-6 2-9 6-9 12" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" opacity=".55" />
    </>
  ),
  extension: (
    <>
      <rect x="8" y="24" width="40" height="16" rx="4" fill="currentColor" fillOpacity=".08" stroke={stroke} strokeWidth="2.2" />
      <circle cx="18" cy="32" r="3" stroke={stroke} strokeWidth="1.8" />
      <circle cx="28" cy="32" r="3" stroke={stroke} strokeWidth="1.8" />
      <circle cx="38" cy="32" r="3" stroke={stroke} strokeWidth="1.8" />
      <path d="M48 32h4a4 4 0 0 1 4 4v8" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  coupon: (
    <>
      <path d="M10 22h44v8a4 4 0 0 0 0 8v8H10v-8a4 4 0 0 0 0-8v-8Z" fill="currentColor" fillOpacity=".08" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M26 30l12 8M27 30.5h.01M37 37.5h.01" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  offer: (
    <>
      <path d="M32 10l5.6 4.7 7.2-.9 2 7 6.2 3.8-3.3 6.5 3.3 6.5-6.2 3.8-2 7-7.2-.9L32 52l-5.6-4.5-7.2.9-2-7-6.2-3.8 3.3-6.5-3.3-6.5 6.2-3.8 2-7 7.2.9L32 10Z" fill="currentColor" fillOpacity=".08" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
      <path d="M26 38l12-12M27 27h.01M37 37h.01" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
};

export function ProductArt({
  art: key,
  className,
  tone = "brand",
}: {
  art: string;
  className?: string;
  tone?: "brand" | "muted";
}) {
  const node = art[(key as ArtKey) in art ? (key as ArtKey) : "box"];
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-lg",
        tone === "brand"
          ? "bg-gradient-to-br from-brand-50 to-accent text-brand-600 dark:from-slate-800/70 dark:to-slate-900 dark:text-brand-300"
          : "bg-muted text-muted-foreground",
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
          backgroundSize: "12px 12px",
        }}
        aria-hidden
      />
      <svg viewBox="0 0 64 64" className="relative h-[62%] w-[62%]" fill="none" aria-hidden>
        {node}
      </svg>
    </div>
  );
}
