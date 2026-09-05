import { cn } from "@/lib/utils";

/**
 * Ambika Electricals product visual system.
 *
 * Art direction (one direction, applied to every thumbnail):
 *  - Studio surface: neutral gradient plinth with a soft top-left key light
 *    and a grounded contact shadow, so every product sits in the same "scene".
 *  - Product body: monochrome layered silhouette built from `currentColor`
 *    (light face / dark side / thin edge) — never a flat outlined icon.
 *  - Exactly one live accent per product: electric blue for energised parts,
 *    warm amber for reward/value items. No third hue, no emoji, no mixed sets.
 *
 * Values are lightweight inline SVG — no network requests, no layout shift,
 * crisp at every size from a 32px table cell to a 400px hero.
 */

export type ProductArtKey =
  | "bulb" | "smartbulb" | "tube" | "panel" | "downlight" | "flood" | "emergency" | "street"
  | "switch" | "twoway" | "socket" | "usbsocket" | "bellpush" | "regulator" | "dimmer"
  | "wire" | "frwire" | "cable" | "coax" | "ethernet"
  | "mcb" | "rccb" | "isolator" | "surge" | "fuse"
  | "db" | "busbar" | "earthbar"
  | "fan" | "exhaust" | "wallfan" | "tablefan"
  | "holder" | "rose" | "plug" | "conduit" | "bend" | "box" | "tie" | "gland" | "terminal"
  | "tape" | "extension"
  | "coupon" | "offer" | "gift";

export type ProductArtCategory =
  | "Lighting" | "Switches & Sockets" | "Wires & Cables" | "Protection"
  | "Distribution" | "Fans" | "Accessories" | "Rewards";

const BLUE = "#38bdf8";
const BLUE_DEEP = "#0ea5e9";
const AMBER = "#f59e0b";

/** Shared gradient/blur definitions. Ids are stable and identical everywhere. */
function ArtDefs() {
  return (
    <defs>
      <linearGradient id="aeFace" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
        <stop offset="100%" stopColor="currentColor" stopOpacity="0.08" />
      </linearGradient>
      <linearGradient id="aeSide" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="currentColor" stopOpacity="0.34" />
        <stop offset="100%" stopColor="currentColor" stopOpacity="0.14" />
      </linearGradient>
      <linearGradient id="aeGlass" x1="0.2" y1="0" x2="0.8" y2="1">
        <stop offset="0%" stopColor={BLUE} stopOpacity="0.55" />
        <stop offset="100%" stopColor={BLUE_DEEP} stopOpacity="0.12" />
      </linearGradient>
      <linearGradient id="aeCopper" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={AMBER} stopOpacity="0.85" />
        <stop offset="100%" stopColor={AMBER} stopOpacity="0.35" />
      </linearGradient>
      <radialGradient id="aeGround" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
        <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="aeHalo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={BLUE} stopOpacity="0.42" />
        <stop offset="100%" stopColor={BLUE} stopOpacity="0" />
      </radialGradient>
      <radialGradient id="aeHaloWarm" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={AMBER} stopOpacity="0.4" />
        <stop offset="100%" stopColor={AMBER} stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

const face = "url(#aeFace)";
const side = "url(#aeSide)";
const edge = { stroke: "currentColor", strokeOpacity: 0.55, strokeWidth: 1.4 } as const;
const thinEdge = { stroke: "currentColor", strokeOpacity: 0.4, strokeWidth: 1.1 } as const;

/** Soft contact shadow under the product. */
function Ground({ cx = 32, cy = 53, rx = 17, ry = 3.4 }: { cx?: number; cy?: number; rx?: number; ry?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#aeGround)" />;
}

const art: Record<ProductArtKey, React.ReactNode> = {
  /* ---------------------------------------------------------------- Lighting */
  bulb: (
    <>
      <Ground ry={3} />
      <circle cx="32" cy="26" r="17" fill="url(#aeHalo)" />
      <path d="M32 10a13 13 0 0 0-7.4 23.7c1.3.9 2 2.3 2 3.8V39h10.8v-1.5c0-1.5.7-2.9 2-3.8A13 13 0 0 0 32 10Z" fill="url(#aeGlass)" {...edge} />
      <path d="M27.4 22.5a5.2 5.2 0 0 1 9.2 0" stroke={BLUE} strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M26.6 39h10.8l-.7 4.4H27.3L26.6 39Z" fill={side} {...thinEdge} />
      <path d="M27.6 44.6h8.8M28.4 48h7.2" stroke="currentColor" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  smartbulb: (
    <>
      <Ground ry={3} />
      <circle cx="32" cy="26" r="18" fill="url(#aeHalo)" />
      <path d="M32 10a13 13 0 0 0-7.4 23.7c1.3.9 2 2.3 2 3.8V39h10.8v-1.5c0-1.5.7-2.9 2-3.8A13 13 0 0 0 32 10Z" fill="url(#aeGlass)" {...edge} />
      <path d="M26.6 39h10.8l-.7 4.4H27.3L26.6 39Z" fill={side} {...thinEdge} />
      <path d="M27.6 44.6h8.8M28.4 48h7.2" stroke="currentColor" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" />
      <path d="M28 27a4.4 4.4 0 0 1 8 0" stroke={BLUE} strokeWidth="1.7" strokeLinecap="round" fill="none" />
      <path d="M24.6 23.6a8.6 8.6 0 0 1 14.8 0" stroke={BLUE} strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M21.4 20.4a13 13 0 0 1 21.2 0" stroke={BLUE} strokeOpacity="0.28" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </>
  ),
  tube: (
    <>
      <Ground rx={21} />
      <rect x="7" y="24" width="50" height="14" rx="7" fill="url(#aeGlass)" {...edge} />
      <rect x="7" y="24" width="50" height="6" rx="3" fill="currentColor" fillOpacity="0.1" />
      <rect x="4.5" y="26.5" width="4.5" height="9" rx="1.6" fill={side} {...thinEdge} />
      <rect x="55" y="26.5" width="4.5" height="9" rx="1.6" fill={side} {...thinEdge} />
      <path d="M14 31h36" stroke={BLUE} strokeOpacity="0.65" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="1 5" />
    </>
  ),
  panel: (
    <>
      <Ground rx={19} />
      <circle cx="32" cy="30" r="21" fill="url(#aeHalo)" />
      <circle cx="32" cy="30" r="17" fill={face} {...edge} />
      <circle cx="32" cy="30" r="12.5" fill="url(#aeGlass)" stroke={BLUE} strokeOpacity="0.45" strokeWidth="1.1" />
      <circle cx="32" cy="30" r="6.5" fill={BLUE} fillOpacity="0.18" />
      <path d="M32 13v-3M32 50v-3M49 30h3M12 30h3" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  downlight: (
    <>
      <Ground rx={15} />
      <path d="M18 20h28l-5 15H23l-5-15Z" fill={side} {...edge} />
      <ellipse cx="32" cy="20" rx="14" ry="4" fill={face} {...thinEdge} />
      <ellipse cx="32" cy="35" rx="9" ry="2.8" fill="url(#aeGlass)" stroke={BLUE} strokeOpacity="0.5" strokeWidth="1" />
      <path d="M24 38l-4 10M40 38l4 10M32 39v10" stroke={BLUE} strokeOpacity="0.3" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  flood: (
    <>
      <Ground rx={16} />
      <path d="M11 17h42l-4 20H15l-4-20Z" fill={face} {...edge} />
      <path d="M15 21h34l-2.6 12H17.6L15 21Z" fill="url(#aeGlass)" stroke={BLUE} strokeOpacity="0.35" strokeWidth="1" />
      <path d="M22 25h20M22 29h13" stroke={BLUE} strokeOpacity="0.5" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M24 37v5a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-5" fill={side} {...thinEdge} />
      <path d="M22 48h20" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  emergency: (
    <>
      <Ground rx={15} />
      <rect x="14" y="18" width="36" height="20" rx="4" fill={face} {...edge} />
      <rect x="18" y="22" width="28" height="7" rx="2" fill="url(#aeGlass)" stroke={BLUE} strokeOpacity="0.35" strokeWidth="1" />
      <circle cx="21" cy="34" r="1.7" fill={BLUE} />
      <circle cx="27" cy="34" r="1.7" fill="currentColor" fillOpacity="0.35" />
      <path d="M22 41v6M42 41v6" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />
      <path d="M36 30l-3 5h3l-1 4 4-6h-3l1-3Z" fill={AMBER} />
    </>
  ),
  street: (
    <>
      <Ground rx={12} cx={40} />
      <path d="M40 50V22" stroke="currentColor" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" />
      <path d="M40 22c0-5 4-8 9-8" stroke="currentColor" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M8 20h30l-3 8H11l-3-8Z" fill={face} {...edge} />
      <path d="M11 28h24" stroke={BLUE} strokeOpacity="0.6" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 30l-3 10h28l-3-10" fill="url(#aeHalo)" />
    </>
  ),

  /* ------------------------------------------------- Switches & Sockets */
  switch: (
    <>
      <Ground rx={13} />
      <rect x="18" y="10" width="28" height="40" rx="5" fill={face} {...edge} />
      <rect x="21.5" y="13.5" width="21" height="33" rx="3" fill="currentColor" fillOpacity="0.06" {...thinEdge} />
      <rect x="26" y="19" width="12" height="16" rx="2.5" fill={side} {...thinEdge} />
      <path d="M26 27h12" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
      <circle cx="32" cy="41" r="2" fill={BLUE} />
      <circle cx="32" cy="41" r="5" fill="url(#aeHalo)" />
    </>
  ),
  twoway: (
    <>
      <Ground rx={13} />
      <rect x="14" y="10" width="36" height="40" rx="5" fill={face} {...edge} />
      <rect x="19" y="16" width="11" height="20" rx="2.5" fill={side} {...thinEdge} />
      <rect x="34" y="16" width="11" height="20" rx="2.5" fill={side} {...thinEdge} />
      <path d="M19 26h11M34 26h11" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
      <circle cx="24.5" cy="43" r="1.8" fill={BLUE} />
      <circle cx="39.5" cy="43" r="1.8" fill="currentColor" fillOpacity="0.3" />
    </>
  ),
  socket: (
    <>
      <Ground rx={14} />
      <rect x="13" y="13" width="38" height="34" rx="6" fill={face} {...edge} />
      <circle cx="32" cy="30" r="12.5" fill="currentColor" fillOpacity="0.07" {...thinEdge} />
      <rect x="30.4" y="20.5" width="3.2" height="6" rx="1.6" fill="currentColor" fillOpacity="0.65" />
      <rect x="23.4" y="30.5" width="3.2" height="6" rx="1.6" fill="currentColor" fillOpacity="0.65" />
      <rect x="37.4" y="30.5" width="3.2" height="6" rx="1.6" fill="currentColor" fillOpacity="0.65" />
      <circle cx="32" cy="30" r="15" fill="url(#aeHalo)" opacity="0.5" />
    </>
  ),
  usbsocket: (
    <>
      <Ground rx={14} />
      <rect x="13" y="13" width="38" height="34" rx="6" fill={face} {...edge} />
      <rect x="19" y="20" width="12" height="8" rx="2" fill={side} {...thinEdge} />
      <rect x="19" y="33" width="12" height="8" rx="2" fill={side} {...thinEdge} />
      <rect x="36" y="20" width="9" height="21" rx="2.5" fill="currentColor" fillOpacity="0.08" {...thinEdge} />
      <circle cx="40.5" cy="37" r="1.6" fill={BLUE} />
      <path d="M22 24h6M22 37h6" stroke={BLUE} strokeOpacity="0.6" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  bellpush: (
    <>
      <Ground rx={13} />
      <rect x="18" y="10" width="28" height="40" rx="5" fill={face} {...edge} />
      <circle cx="32" cy="27" r="8.5" fill={side} {...thinEdge} />
      <circle cx="32" cy="27" r="4" fill={AMBER} fillOpacity="0.75" />
      <circle cx="32" cy="27" r="11" fill="url(#aeHaloWarm)" />
      <path d="M25 40h14" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  regulator: (
    <>
      <Ground rx={13} />
      <rect x="18" y="10" width="28" height="40" rx="5" fill={face} {...edge} />
      <circle cx="32" cy="28" r="10" fill={side} {...edge} />
      <circle cx="32" cy="28" r="6.5" fill="currentColor" fillOpacity="0.08" />
      <path d="M32 28l4.6-4.6" stroke={BLUE} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M22.6 34.6A11 11 0 0 1 32 17" stroke={BLUE} strokeOpacity="0.4" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path d="M27 44h10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  dimmer: (
    <>
      <Ground rx={13} />
      <rect x="18" y="10" width="28" height="40" rx="5" fill={face} {...edge} />
      <rect x="29.5" y="16" width="5" height="28" rx="2.5" fill="currentColor" fillOpacity="0.1" {...thinEdge} />
      <rect x="26.5" y="24" width="11" height="6" rx="2" fill={side} {...edge} />
      <path d="M32 31v11" stroke={BLUE} strokeOpacity="0.5" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="32" cy="27" r="9" fill="url(#aeHalo)" opacity="0.6" />
    </>
  ),

  /* ---------------------------------------------------- Wires & Cables */
  wire: (
    <>
      <Ground rx={17} />
      <circle cx="32" cy="30" r="19" fill={face} {...edge} />
      <circle cx="32" cy="30" r="14.5" fill="url(#aeCopper)" opacity="0.55" />
      <circle cx="32" cy="30" r="11" fill="currentColor" fillOpacity="0.1" />
      <circle cx="32" cy="30" r="7" fill={face} {...thinEdge} />
      <path d="M22 22.5c6-3 14-3 20 0M21 30c7-3 15-3 22 0M22 37.5c6-3 14-3 20 0" stroke={AMBER} strokeOpacity="0.5" strokeWidth="1.1" fill="none" />
      <path d="M46 25c5 1 8 4 8 8" stroke={AMBER} strokeOpacity="0.8" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </>
  ),
  frwire: (
    <>
      <Ground rx={17} />
      <circle cx="32" cy="30" r="19" fill={face} {...edge} />
      <circle cx="32" cy="30" r="14" fill={BLUE} fillOpacity="0.16" />
      <circle cx="32" cy="30" r="7" fill={face} {...thinEdge} />
      <path d="M21 30c7-3 15-3 22 0M22 22.5c6-3 14-3 20 0M22 37.5c6-3 14-3 20 0" stroke={BLUE} strokeOpacity="0.5" strokeWidth="1.1" fill="none" />
      <path d="M46 25c5 1 8 4 8 8" stroke={BLUE} strokeOpacity="0.8" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </>
  ),
  cable: (
    <>
      <Ground rx={18} />
      <path d="M9 38c6-14 16-14 22 0s16 14 22 0" stroke="currentColor" strokeOpacity="0.5" strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M9 38c6-14 16-14 22 0s16 14 22 0" stroke={BLUE} strokeOpacity="0.55" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <circle cx="9" cy="38" r="3.4" fill={side} {...thinEdge} />
      <circle cx="53" cy="38" r="3.4" fill={side} {...thinEdge} />
    </>
  ),
  coax: (
    <>
      <Ground rx={16} />
      <path d="M12 40c8-16 24-16 32-2" stroke="currentColor" strokeOpacity="0.45" strokeWidth="5.5" strokeLinecap="round" fill="none" />
      <rect x="40" y="30" width="14" height="9" rx="2" fill={side} {...edge} transform="rotate(28 47 34.5)" />
      <circle cx="52" cy="27" r="2.4" fill={AMBER} fillOpacity="0.8" />
      <circle cx="12" cy="40" r="3.2" fill={face} {...thinEdge} />
    </>
  ),
  ethernet: (
    <>
      <Ground rx={16} />
      <path d="M10 42c6-14 18-18 26-12" stroke="currentColor" strokeOpacity="0.45" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M36 30h13v11h-4.5l-2 3h-4.5l-2-3H36V30Z" fill={face} {...edge} />
      <path d="M39 33h1.6M42 33h1.6M45 33h1.6" stroke={BLUE} strokeOpacity="0.8" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),

  /* -------------------------------------------------------- Protection */
  mcb: (
    <>
      <Ground rx={11} />
      <rect x="21" y="8" width="22" height="44" rx="3.5" fill={face} {...edge} />
      <rect x="21" y="8" width="7" height="44" rx="3.5" fill={side} />
      <rect x="26.5" y="16" width="11" height="13" rx="2" fill="currentColor" fillOpacity="0.14" {...thinEdge} />
      <rect x="29" y="19" width="6" height="7" rx="1.5" fill={BLUE} fillOpacity="0.75" />
      <path d="M21 34h22" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.1" />
      <path d="M26 39h12M26 43h8" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M32 8v-3M32 55v-3" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  rccb: (
    <>
      <Ground rx={14} />
      <rect x="15" y="8" width="34" height="44" rx="3.5" fill={face} {...edge} />
      <rect x="15" y="8" width="8" height="44" rx="3.5" fill={side} />
      <rect x="26" y="15" width="10" height="13" rx="2" fill="currentColor" fillOpacity="0.14" {...thinEdge} />
      <rect x="28.5" y="18" width="5" height="7" rx="1.4" fill={BLUE} fillOpacity="0.75" />
      <circle cx="42" cy="21" r="3.2" fill={AMBER} fillOpacity="0.7" />
      <path d="M15 34h34" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.1" />
      <path d="M22 40h20M22 44h13" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  isolator: (
    <>
      <Ground rx={12} />
      <rect x="19" y="9" width="26" height="42" rx="4" fill={face} {...edge} />
      <circle cx="32" cy="26" r="9" fill={side} {...edge} />
      <path d="M32 26V19" stroke={BLUE} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M25.6 30.4a9 9 0 1 1 12.8 0" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.3" fill="none" />
      <path d="M25 41h14" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  surge: (
    <>
      <Ground rx={13} />
      <rect x="19" y="9" width="26" height="42" rx="4" fill={face} {...edge} />
      <rect x="19" y="9" width="7" height="42" rx="4" fill={side} />
      <path d="M34 17l-6 11h5l-2.5 9 8-12h-5l2.5-8Z" fill={BLUE} fillOpacity="0.85" />
      <circle cx="32" cy="27" r="13" fill="url(#aeHalo)" opacity="0.6" />
      <path d="M24 43h16" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  fuse: (
    <>
      <Ground rx={16} />
      <rect x="18" y="25" width="28" height="14" rx="3" fill="url(#aeGlass)" {...edge} />
      <rect x="10" y="27" width="9" height="10" rx="2" fill={side} {...thinEdge} />
      <rect x="45" y="27" width="9" height="10" rx="2" fill={side} {...thinEdge} />
      <path d="M20 32h24" stroke={AMBER} strokeOpacity="0.9" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),

  /* ------------------------------------------------------ Distribution */
  db: (
    <>
      <Ground rx={19} />
      <rect x="8" y="14" width="48" height="34" rx="4" fill={face} {...edge} />
      <rect x="12" y="18" width="40" height="26" rx="2.5" fill="currentColor" fillOpacity="0.06" {...thinEdge} />
      <rect x="15" y="22" width="5" height="14" rx="1.4" fill={side} {...thinEdge} />
      <rect x="22" y="22" width="5" height="14" rx="1.4" fill={side} {...thinEdge} />
      <rect x="29" y="22" width="5" height="14" rx="1.4" fill={side} {...thinEdge} />
      <rect x="36" y="22" width="5" height="14" rx="1.4" fill={side} {...thinEdge} />
      <rect x="43" y="22" width="5" height="14" rx="1.4" fill={side} {...thinEdge} />
      <path d="M16.2 25h2.6M23.2 25h2.6M30.2 25h2.6M37.2 25h2.6M44.2 25h2.6" stroke={BLUE} strokeOpacity="0.75" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  busbar: (
    <>
      <Ground rx={19} />
      <rect x="8" y="26" width="48" height="9" rx="2" fill="url(#aeCopper)" opacity="0.6" {...edge} />
      <path d="M16 26v-7M28 26v-7M40 26v-7M50 26v-7" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 35v7M28 35v7M40 35v7M50 35v7" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  earthbar: (
    <>
      <Ground rx={17} />
      <rect x="12" y="27" width="40" height="10" rx="2" fill={face} {...edge} />
      <circle cx="19" cy="32" r="2.2" fill="currentColor" fillOpacity="0.55" />
      <circle cx="27" cy="32" r="2.2" fill="currentColor" fillOpacity="0.55" />
      <circle cx="35" cy="32" r="2.2" fill="currentColor" fillOpacity="0.55" />
      <circle cx="43" cy="32" r="2.2" fill="currentColor" fillOpacity="0.55" />
      <path d="M32 37v6M25 45h14M28 49h8" stroke={BLUE} strokeOpacity="0.8" strokeWidth="2" strokeLinecap="round" />
    </>
  ),

  /* -------------------------------------------------------------- Fans */
  fan: (
    <>
      <Ground rx={16} />
      <path d="M32 15V9" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M31 26c0-8 2.6-12.4 7.4-12.4 4 0 4.6 6.6-1.6 9.6L31 26Z" fill={face} {...edge} />
      <path d="M38 33c8 0 12.4 2.6 12.4 7.4 0 4-6.6 4.6-9.6-1.6L38 33Z" fill={face} {...edge} />
      <path d="M33 38c0 8-2.6 12.4-7.4 12.4-4 0-4.6-6.6 1.6-9.6L33 38Z" fill={face} {...edge} />
      <path d="M26 31c-8 0-12.4-2.6-12.4-7.4 0-4 6.6-4.6 9.6 1.6L26 31Z" fill={face} {...edge} />
      <circle cx="32" cy="32" r="5.4" fill={side} {...edge} />
      <circle cx="32" cy="32" r="2" fill={BLUE} fillOpacity="0.8" />
    </>
  ),
  exhaust: (
    <>
      <Ground rx={17} />
      <rect x="11" y="11" width="42" height="42" rx="6" fill={face} {...edge} />
      <circle cx="32" cy="32" r="15" fill="currentColor" fillOpacity="0.06" {...thinEdge} />
      <path d="M32 20c5 2 6 6 3 10l-3 2V20ZM44 32c-2 5-6 6-10 3l-2-3h12ZM32 44c-5-2-6-6-3-10l3-2v12ZM20 32c2-5 6-6 10-3l2 3H20Z" fill={side} {...thinEdge} />
      <circle cx="32" cy="32" r="3.2" fill={BLUE} fillOpacity="0.7" />
    </>
  ),
  wallfan: (
    <>
      <Ground rx={13} />
      <circle cx="32" cy="26" r="16" fill="currentColor" fillOpacity="0.05" {...edge} />
      <circle cx="32" cy="26" r="11" fill="currentColor" fillOpacity="0.05" {...thinEdge} />
      <path d="M32 17c4 1.6 5 4.8 2.4 8L32 26v-9ZM41 26c-1.6 4-4.8 5-8 2.4L32 26h9ZM32 35c-4-1.6-5-4.8-2.4-8L32 26v9ZM23 26c1.6-4 4.8-5 8-2.4L32 26h-9Z" fill={side} {...thinEdge} />
      <circle cx="32" cy="26" r="2.6" fill={BLUE} fillOpacity="0.75" />
      <path d="M32 42v8M25 52h14" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  tablefan: (
    <>
      <Ground rx={13} />
      <circle cx="32" cy="24" r="14" fill="currentColor" fillOpacity="0.05" {...edge} />
      <path d="M32 15c3.6 1.5 4.5 4.4 2.2 7.3L32 24v-9ZM41 24c-1.5 3.6-4.4 4.5-7.3 2.2L32 24h9ZM32 33c-3.6-1.5-4.5-4.4-2.2-7.3L32 24v9ZM23 24c1.5-3.6 4.4-4.5 7.3-2.2L32 24h-9Z" fill={side} {...thinEdge} />
      <circle cx="32" cy="24" r="2.4" fill={BLUE} fillOpacity="0.75" />
      <path d="M32 38v8" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M22 50c0-2.5 4.5-4 10-4s10 1.5 10 4" fill={side} {...thinEdge} />
    </>
  ),

  /* ------------------------------------------------------- Accessories */
  holder: (
    <>
      <Ground rx={11} />
      <path d="M22 14h20v9a10 10 0 0 1-20 0v-9Z" fill={face} {...edge} />
      <path d="M18 14h28" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M27 33h10v9a5 5 0 0 1-10 0v-9Z" fill={side} {...edge} />
      <path d="M27 36h10M27 39.5h10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
      <circle cx="32" cy="49" r="2.2" fill={AMBER} fillOpacity="0.7" />
    </>
  ),
  rose: (
    <>
      <Ground rx={14} />
      <circle cx="32" cy="27" r="16" fill={face} {...edge} />
      <circle cx="32" cy="27" r="10" fill="currentColor" fillOpacity="0.06" {...thinEdge} />
      <circle cx="27" cy="27" r="1.9" fill="currentColor" fillOpacity="0.6" />
      <circle cx="37" cy="27" r="1.9" fill="currentColor" fillOpacity="0.6" />
      <path d="M32 37v10" stroke={BLUE} strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  plug: (
    <>
      <Ground rx={12} />
      <path d="M22 20h20v13a10 10 0 0 1-20 0V20Z" fill={face} {...edge} />
      <rect x="25.4" y="9" width="3.6" height="12" rx="1.6" fill="currentColor" fillOpacity="0.6" />
      <rect x="35" y="9" width="3.6" height="12" rx="1.6" fill="currentColor" fillOpacity="0.6" />
      <path d="M32 43v9" stroke="currentColor" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" />
      <path d="M27 27h10" stroke={BLUE} strokeOpacity="0.55" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  conduit: (
    <>
      <Ground rx={20} />
      <rect x="6" y="24" width="52" height="15" rx="7.5" fill={face} {...edge} />
      <rect x="6" y="24" width="52" height="6" rx="3" fill="currentColor" fillOpacity="0.08" />
      <ellipse cx="57" cy="31.5" rx="3.4" ry="7.5" fill="currentColor" fillOpacity="0.16" {...thinEdge} />
      <path d="M20 24v15M36 24v15" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.1" />
    </>
  ),
  bend: (
    <>
      <Ground rx={16} />
      <path d="M14 47V32a15 15 0 0 1 15-15h17" stroke="currentColor" strokeOpacity="0.5" strokeWidth="11" strokeLinecap="round" fill="none" />
      <path d="M14 47V32a15 15 0 0 1 15-15h17" stroke="currentColor" strokeOpacity="0.28" strokeWidth="4" strokeLinecap="round" fill="none" />
    </>
  ),
  box: (
    <>
      <Ground rx={16} />
      <rect x="13" y="13" width="38" height="38" rx="5" fill={face} {...edge} />
      <rect x="18" y="18" width="28" height="28" rx="3" fill="currentColor" fillOpacity="0.05" {...thinEdge} />
      <circle cx="21.5" cy="21.5" r="1.5" fill="currentColor" fillOpacity="0.4" />
      <circle cx="42.5" cy="21.5" r="1.5" fill="currentColor" fillOpacity="0.4" />
      <circle cx="21.5" cy="42.5" r="1.5" fill="currentColor" fillOpacity="0.4" />
      <circle cx="42.5" cy="42.5" r="1.5" fill="currentColor" fillOpacity="0.4" />
      <path d="M26 32h12" stroke={BLUE} strokeOpacity="0.6" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  tie: (
    <>
      <Ground rx={14} />
      <path d="M20 45c13-4 18-16 12-30" stroke="currentColor" strokeOpacity="0.5" strokeWidth="3.4" strokeLinecap="round" fill="none" />
      <path d="M26 47c14-5 19-18 13-32" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3.4" strokeLinecap="round" fill="none" />
      <rect x="14" y="38" width="11" height="9" rx="2.4" fill={side} {...edge} />
      <path d="M17 42.5h5" stroke={BLUE} strokeOpacity="0.6" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  gland: (
    <>
      <Ground rx={17} />
      <rect x="14" y="25" width="36" height="14" rx="3" fill={face} {...edge} />
      <path d="M23 25v14M31 25v14M39 25v14" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.2" />
      <rect x="10" y="28" width="5" height="8" rx="1.6" fill={side} {...thinEdge} />
      <rect x="49" y="28" width="5" height="8" rx="1.6" fill={side} {...thinEdge} />
      <circle cx="32" cy="32" r="3.2" fill={BLUE} fillOpacity="0.25" />
    </>
  ),
  terminal: (
    <>
      <Ground rx={18} />
      <rect x="9" y="24" width="46" height="16" rx="2.5" fill={face} {...edge} />
      <path d="M17 24v16M25 24v16M33 24v16M41 24v16M49 24v16" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.2" />
      <circle cx="13" cy="32" r="1.7" fill={AMBER} fillOpacity="0.7" />
      <circle cx="21" cy="32" r="1.7" fill={AMBER} fillOpacity="0.7" />
      <circle cx="29" cy="32" r="1.7" fill={AMBER} fillOpacity="0.7" />
      <circle cx="37" cy="32" r="1.7" fill={AMBER} fillOpacity="0.7" />
      <circle cx="45" cy="32" r="1.7" fill={AMBER} fillOpacity="0.7" />
    </>
  ),
  tape: (
    <>
      <Ground rx={16} />
      <circle cx="30" cy="31" r="18" fill={face} {...edge} />
      <circle cx="30" cy="31" r="12" fill="currentColor" fillOpacity="0.1" {...thinEdge} />
      <circle cx="30" cy="31" r="6.5" fill="currentColor" fillOpacity="0.04" {...thinEdge} />
      <path d="M45 24c-5 2.4-7.4 6-7.4 11" stroke={BLUE} strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" fill="none" />
    </>
  ),
  extension: (
    <>
      <Ground rx={19} />
      <rect x="7" y="24" width="40" height="16" rx="4" fill={face} {...edge} />
      <circle cx="16" cy="32" r="4" fill="currentColor" fillOpacity="0.09" {...thinEdge} />
      <circle cx="26" cy="32" r="4" fill="currentColor" fillOpacity="0.09" {...thinEdge} />
      <circle cx="36" cy="32" r="4" fill="currentColor" fillOpacity="0.09" {...thinEdge} />
      <rect x="43.4" y="27" width="2.6" height="4" rx="1.3" fill={BLUE} fillOpacity="0.8" />
      <path d="M47 32h4a5 5 0 0 1 5 5v8" stroke="currentColor" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" fill="none" />
    </>
  ),

  /* ----------------------------------------------------------- Rewards */
  coupon: (
    <>
      <Ground rx={19} />
      <path d="M8 21h48v7.5a3.5 3.5 0 0 0 0 7V43H8v-7.5a3.5 3.5 0 0 0 0-7V21Z" fill={face} {...edge} />
      <path d="M24 40V24" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.3" strokeDasharray="3 4" />
      <path d="M32 28l10 8" stroke={AMBER} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="32.6" cy="28.6" r="1.6" fill={AMBER} />
      <circle cx="41.4" cy="35.4" r="1.6" fill={AMBER} />
      <path d="M14 27l-2 5h3l-1.4 4.5 4.4-6h-3l1.4-3.5Z" fill={BLUE} fillOpacity="0.85" />
    </>
  ),
  offer: (
    <>
      <Ground rx={16} />
      <path d="M32 9l5.2 4.4 6.8-.8 1.8 6.6 5.8 3.5-3 6.1 3 6.1-5.8 3.5-1.8 6.6-6.8-.8L32 48.6l-5.2-4.4-6.8.8-1.8-6.6-5.8-3.5 3-6.1-3-6.1 5.8-3.5 1.8-6.6 6.8.8L32 9Z" fill={face} {...edge} />
      <path d="M26.5 36.5l11-11" stroke={AMBER} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="27" cy="26" r="2" fill={AMBER} />
      <circle cx="37" cy="36" r="2" fill={AMBER} />
    </>
  ),
  gift: (
    <>
      <Ground rx={16} />
      <rect x="12" y="26" width="40" height="22" rx="3" fill={face} {...edge} />
      <rect x="10" y="19" width="44" height="9" rx="2.5" fill={side} {...edge} />
      <path d="M32 19v29" stroke={AMBER} strokeOpacity="0.8" strokeWidth="3" />
      <path d="M32 19c-6-8-13-3-8 0h8Zm0 0c6-8 13-3 8 0h-8Z" fill={AMBER} fillOpacity="0.55" stroke={AMBER} strokeOpacity="0.6" strokeWidth="1.2" />
    </>
  ),
};

export interface ProductArtOption {
  key: ProductArtKey;
  label: string;
  category: ProductArtCategory;
}

/** Curated, labelled catalogue used by the product image picker. */
export const productArtCatalogue: ProductArtOption[] = [
  { key: "bulb", label: "LED Bulb", category: "Lighting" },
  { key: "smartbulb", label: "Smart LED Bulb", category: "Lighting" },
  { key: "tube", label: "LED Tube Light", category: "Lighting" },
  { key: "panel", label: "LED Panel Light", category: "Lighting" },
  { key: "downlight", label: "LED Downlight", category: "Lighting" },
  { key: "flood", label: "Flood Light", category: "Lighting" },
  { key: "emergency", label: "Emergency Light", category: "Lighting" },
  { key: "street", label: "Street Light", category: "Lighting" },

  { key: "switch", label: "Modular Switch", category: "Switches & Sockets" },
  { key: "twoway", label: "2-Way Switch Plate", category: "Switches & Sockets" },
  { key: "socket", label: "Socket", category: "Switches & Sockets" },
  { key: "usbsocket", label: "USB Socket", category: "Switches & Sockets" },
  { key: "bellpush", label: "Bell Push", category: "Switches & Sockets" },
  { key: "regulator", label: "Fan Regulator", category: "Switches & Sockets" },
  { key: "dimmer", label: "Dimmer", category: "Switches & Sockets" },

  { key: "wire", label: "Copper Wire Coil", category: "Wires & Cables" },
  { key: "frwire", label: "FR / FRLS Wire Coil", category: "Wires & Cables" },
  { key: "cable", label: "Flexible Cable", category: "Wires & Cables" },
  { key: "coax", label: "Coaxial Cable", category: "Wires & Cables" },
  { key: "ethernet", label: "Ethernet Cable", category: "Wires & Cables" },

  { key: "mcb", label: "MCB", category: "Protection" },
  { key: "rccb", label: "RCCB / RCBO", category: "Protection" },
  { key: "isolator", label: "Isolator", category: "Protection" },
  { key: "surge", label: "Surge Protector", category: "Protection" },
  { key: "fuse", label: "Fuse", category: "Protection" },

  { key: "db", label: "Distribution Box", category: "Distribution" },
  { key: "busbar", label: "Busbar", category: "Distribution" },
  { key: "earthbar", label: "Earth Bar", category: "Distribution" },

  { key: "fan", label: "Ceiling Fan", category: "Fans" },
  { key: "exhaust", label: "Exhaust Fan", category: "Fans" },
  { key: "wallfan", label: "Wall Fan", category: "Fans" },
  { key: "tablefan", label: "Table Fan", category: "Fans" },

  { key: "holder", label: "Bulb Holder", category: "Accessories" },
  { key: "rose", label: "Ceiling Rose", category: "Accessories" },
  { key: "plug", label: "Plug Top", category: "Accessories" },
  { key: "conduit", label: "PVC Conduit", category: "Accessories" },
  { key: "bend", label: "Conduit Bend", category: "Accessories" },
  { key: "box", label: "Junction Box", category: "Accessories" },
  { key: "tie", label: "Cable Tie", category: "Accessories" },
  { key: "gland", label: "Cable Gland", category: "Accessories" },
  { key: "terminal", label: "Terminal Block", category: "Accessories" },
  { key: "tape", label: "Insulation Tape", category: "Accessories" },
  { key: "extension", label: "Extension Board", category: "Accessories" },

  { key: "coupon", label: "Discount Coupon", category: "Rewards" },
  { key: "offer", label: "Special Offer", category: "Rewards" },
  { key: "gift", label: "Gift", category: "Rewards" },
];

export const productArtCategories = [
  "Lighting", "Switches & Sockets", "Wires & Cables", "Protection",
  "Distribution", "Fans", "Accessories", "Rewards",
] as const;

const labelByKey = new Map(productArtCatalogue.map((o) => [o.key, o.label] as const));

export function productArtLabel(key: string): string {
  return labelByKey.get(key as ProductArtKey) ?? "Electrical product";
}

export function isProductArtKey(key: string): key is ProductArtKey {
  return key in art;
}

export function ProductArt({
  art: key,
  className,
  tone = "brand",
  alt,
}: {
  /** A catalogue key, or a data:/http(s): URL for a custom uploaded image. */
  art: string;
  className?: string;
  tone?: "brand" | "muted";
  /** Provide when the image carries meaning; otherwise it is decorative. */
  alt?: string;
}) {
  const isCustom = /^(data:|https?:|blob:|\/)/.test(key);

  if (isCustom) {
    return (
      <div className={cn("relative overflow-hidden rounded-lg bg-muted", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={key} alt={alt ?? ""} className="size-full object-cover" loading="lazy" decoding="async" />
      </div>
    );
  }

  const node = art[(key as ProductArtKey) in art ? (key as ProductArtKey) : "box"];

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-lg",
        // Studio surface — same light direction and depth for every product.
        tone === "brand"
          ? "bg-[radial-gradient(120%_100%_at_20%_0%,#ffffff_0%,#eef2f8_55%,#e3e9f2_100%)] text-slate-600 dark:bg-[radial-gradient(120%_100%_at_20%_0%,#1b2536_0%,#111a2b_55%,#0b1220_100%)] dark:text-slate-300"
          : "bg-muted text-muted-foreground",
        className
      )}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/50 to-transparent dark:from-white/[0.045]"
        aria-hidden
      />
      <svg viewBox="0 0 64 64" className="relative h-[78%] w-[78%]" fill="none" aria-hidden>
        <ArtDefs />
        {node}
      </svg>
    </div>
  );
}
