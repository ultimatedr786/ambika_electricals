/**
 * Static "Quiet Power" artwork.
 *
 * This module deliberately contains **no** Three.js / R3F imports so it can be
 * part of the auth route's critical bundle: it renders instantly while the 3D
 * scene loads, and is the permanent artwork for reduced-motion users, devices
 * without WebGL, and low-powered hardware.
 *
 * Composition mirrors the 3D scene one-for-one: one hero membership card, an
 * LED glow, a modular-switch geometry, a circuit line and a single reward token.
 */
export function AuthVisualFallback({ className }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none relative overflow-hidden bg-[#070d18] ${className || ""}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 720 900"
        preserveAspectRatio="xMidYMid slice"
        className="size-full"
        role="presentation"
      >
        <defs>
          <radialGradient id="qpField" cx="38%" cy="34%" r="72%">
            <stop offset="0%" stopColor="#16294a" />
            <stop offset="46%" stopColor="#0c1730" />
            <stop offset="100%" stopColor="#060b16" />
          </radialGradient>
          <radialGradient id="qpKey" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="qpWarm" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f5b409" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#f5b409" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="qpShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#020509" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#020509" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="qpCard" x1="0.08" y1="0" x2="0.92" y2="1">
            <stop offset="0%" stopColor="#9db4d2" />
            <stop offset="26%" stopColor="#5b73a0" />
            <stop offset="55%" stopColor="#2b3d63" />
            <stop offset="78%" stopColor="#425a86" />
            <stop offset="100%" stopColor="#1b2740" />
          </linearGradient>
          <linearGradient id="qpCardEdge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#bcd9f5" stopOpacity="0.85" />
            <stop offset="52%" stopColor="#38bdf8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0b1220" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="qpChip" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffe27a" />
            <stop offset="100%" stopColor="#c98a08" />
          </linearGradient>
          <linearGradient id="qpTrace" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.05" />
            <stop offset="55%" stopColor="#38bdf8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="qpSwitch" x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#243147" />
            <stop offset="100%" stopColor="#121b2c" />
          </linearGradient>
        </defs>

        {/* Deep navy field with one radial light */}
        <rect width="720" height="900" fill="url(#qpField)" />
        <circle cx="250" cy="270" r="330" fill="url(#qpKey)" />
        <circle cx="520" cy="620" r="230" fill="url(#qpWarm)" />

        {/* Circuit line: enters from the left, right-angled, ends at the card */}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M-20 626 H150 Q166 626 166 610 V520 Q166 504 182 504 H290"
            stroke="#1e3a8a"
            strokeOpacity="0.55"
            strokeWidth="3"
          />
          <path
            d="M60 626 H150 Q166 626 166 610 V520 Q166 504 182 504 H290"
            stroke="url(#qpTrace)"
            strokeWidth="3"
          />
          <circle cx="166" cy="562" r="4.5" fill="#38bdf8" fillOpacity="0.8" />
          <circle cx="60" cy="626" r="3.5" fill="#38bdf8" fillOpacity="0.35" />
        </g>

        {/* Modular-switch geometry — quiet supporting cue */}
        <g transform="translate(452 300) rotate(-8)">
          <rect x="-46" y="-58" width="92" height="116" rx="16" fill="url(#qpSwitch)" stroke="#40567c" strokeOpacity="0.5" strokeWidth="1.5" />
          <rect x="-27" y="-38" width="54" height="76" rx="9" fill="#0d1524" stroke="#3a4d70" strokeOpacity="0.45" strokeWidth="1.2" />
          <rect x="-16" y="-26" width="32" height="52" rx="6" fill="#1d2942" />
          <circle cx="0" cy="34" r="3.6" fill="#38bdf8" />
          <circle cx="0" cy="34" r="12" fill="url(#qpKey)" />
        </g>

        {/* LED glow — single point of light */}
        <g transform="translate(214 336)">
          <circle r="74" fill="url(#qpKey)" />
          <circle r="17" fill="#0d1b30" stroke="#3f6ea8" strokeOpacity="0.55" strokeWidth="1.5" />
          <circle r="9" fill="#7dd3fc" fillOpacity="0.92" />
          <circle r="3.5" fill="#ffffff" fillOpacity="0.9" />
        </g>

        {/* Contact shadow */}
        <ellipse cx="352" cy="640" rx="220" ry="42" fill="url(#qpShadow)" />

        {/* Hero: brushed-metal membership card */}
        <g transform="translate(352 500) rotate(-9)">
          <rect x="-176" y="-112" width="352" height="224" rx="26" fill="url(#qpCard)" />
          <rect
            x="-176" y="-112" width="352" height="224" rx="26"
            fill="none" stroke="url(#qpCardEdge)" strokeWidth="2"
          />
          {/* brushed highlight sweep */}
          <path
            d="M-176 -12 L176 -112 V-46 L-176 54 Z"
            fill="#ffffff"
            fillOpacity="0.055"
          />
          <path d="M-176 60 L176 -40" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="14" />
          {/* chip */}
          <rect x="-134" y="-58" width="56" height="42" rx="8" fill="url(#qpChip)" />
          <path d="M-134 -37 h56 M-106 -58 v42" stroke="#8a5f05" strokeOpacity="0.45" strokeWidth="1.6" />
          {/* spark mark */}
          <path d="M126 -66 l-24 40 h17 l-9 32 32-46h-18 l14-26 z" fill="#7dd3fc" fillOpacity="0.9" />
          {/* member stripe */}
          <rect x="-134" y="44" width="150" height="9" rx="4.5" fill="#c9dcf5" fillOpacity="0.28" />
          <rect x="-134" y="66" width="92" height="9" rx="4.5" fill="#c9dcf5" fillOpacity="0.16" />
        </g>

        {/* Reward token emitted by the card */}
        <g transform="translate(524 404)">
          <circle r="58" fill="url(#qpWarm)" />
          <circle r="23" fill="#f5b409" fillOpacity="0.16" />
          <circle r="16" fill="#f8c53a" />
          <circle r="16" fill="none" stroke="#fff0bf" strokeOpacity="0.75" strokeWidth="1.6" />
          <circle r="6" fill="#fffaf0" fillOpacity="0.85" />
        </g>

        {/* Grounding vignette keeps auth copy legible */}
        <rect width="720" height="900" fill="url(#qpVignette)" />
        <defs>
          <radialGradient id="qpVignette" cx="50%" cy="45%" r="72%">
            <stop offset="55%" stopColor="#060b16" stopOpacity="0" />
            <stop offset="100%" stopColor="#060b16" stopOpacity="0.62" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}

export default AuthVisualFallback;
