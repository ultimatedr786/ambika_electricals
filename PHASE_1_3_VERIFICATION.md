# Phase 1.3 — Implementation & Verification Report

Ambika Electricals / Rewardly · frontend-only (mock services, no backend)
Branch: `arena/01a0718a-ambika-electricals` · Next.js 14.2.35 · verified 2026-09-05

---

## 0. Summary

All five Phase 1.3 work items in Part A are implemented, plus the §6 verification
checks below. Nothing from Phase 1 / 1.1 / 1.2 was rebuilt: the routes, mock data,
services, event bus, PWA wiring and journeys are unchanged — the work is confined
to the primitives they render through (dialog, sheet, scroll, charts, auth visual,
product art) and to the two screens that were structurally broken (Create Sale,
product image picker).

Headline measured result — production first-load JS:

| Route | Before | After | Change |
|---|---:|---:|---:|
| `/business/signup` | 479 kB | **266 kB** | −44% |
| `/login` | 473 kB | **261 kB** | −45% |
| `/signup` | 469 kB | **257 kB** | −45% |
| `/forgot-password` | 438 kB | **225 kB** | −49% |
| `/business/analytics` | 336 kB | **209 kB** | −38% |
| `/customer/dashboard` | 323 kB | **222 kB** | −31% |
| `/business/dashboard` | 297 kB | **175 kB** | −41% |
| `/business/sales` | 224 kB | **201 kB** | −10% |
| `/business/sales/new` | 214 kB | **209 kB** | −2% |
| `/business/products` | 245 kB | 252 kB | +3% (richer picker + 46-key art set) |
| `/business/customers` | 253 kB | 255 kB | +1% (responsive dialog shell) |

Shared first-load JS: 87.5 kB → 87.7 kB (unchanged in practice).
`npx tsc --noEmit` clean · `next lint` clean · `next build` succeeds (36 routes).

---

## 1. Authentication visual — "Quiet Power"

### 1.1 Audit of what was there (root cause, not taste)

`auth-visual.tsx` (656 lines) rendered a literal product showroom: four toy-like
product models (bulb, switch plate, socket, MCB), a floating coin/token pile, an
~80-mesh circuit grid plane, and rings. It also constructed `new THREE.Line`
objects **inside render**, and never paused on tab hide. Worse, `auth-shell.tsx`
dynamically imported the 3D scene (`ssr: false`) but *statically* imported
`AuthVisualFallback` from the **same module** — so three.js + fiber + drei were
pulled into the critical path of every auth route regardless. That single import
is what made `/login` a 473 kB page.

### 1.2 What replaced it

| File | Role |
|---|---|
| `src/components/shared/auth-visual.tsx` (512) | The 3D scene. The **only** module that imports three/fiber/drei. |
| `src/components/shared/auth-visual-fallback.tsx` (157) | Static SVG/CSS artwork. Zero three.js. |
| `src/components/shared/auth-artwork.tsx` | Capability gate + `next/dynamic` loader. Renders the fallback first, upgrades to 3D only if the device qualifies. |
| `src/components/shared/auth-shell.tsx` | Form-first two-column layout. |

Scene composition, matching §2.2 exactly:

- **One hero object** — a brushed-metal / electric-blue membership card, softly
  bevelled, with a subtle anisotropic sheen and a real contact shadow.
- **Three abstract electrical cues only** — (1) a single circuit trace entering
  frame from the lower left, (2) a modular switch-plate slab reading as a
  rocker/module silhouette, (3) an LED glow point where the trace meets the card.
- **The story in one loop** — a current pulse travels along the circuit line →
  reaches the card → the card briefly brightens → a single warm reward token
  lifts off and fades. ~7 s cycle, one token, no chains, no piles.
- Deep navy field, one subtle radial light, one electric-blue accent
  (`brand`), one warm accent (`volt`). No lightning bolts, no ring chains, no
  particle fields, no icons or text in 3D, no toy models.

Performance / accessibility gates in `auth-artwork.tsx`:

```
3D is loaded only when ALL are true:
  • not prefers-reduced-motion
  • viewport ≥ 1024px AND pointer: fine
  • navigator.deviceMemory ≥ 4 (when reported)
  • hardwareConcurrency ≥ 4 (when reported)
  • connection.saveData is not set
```

Everything else — phones, tablets, portrait, low-memory laptops, data-saver,
reduced-motion — gets the polished static SVG. In the scene itself,
`frameloop` drops to `"demand"` when the tab is hidden or reduced motion is on,
and `dpr` is capped at `[1, 1.75]`.

Layout: form is the visual priority. Two columns from `lg` (form left, artwork
right, artwork never taller than the viewport); below `lg` the artwork collapses
to a short banner above a full-width form. Nothing about the form's field order,
validation or copy changed.

---

## 2. Premium scrollbar system

In `src/app/globals.css`:

- Four new tokens per theme — `--scrollbar-track`, `--scrollbar-thumb`,
  `--scrollbar-thumb-hover`, `--scrollbar-thumb-active` — defined in both `:root`
  and `.dark`, plus `--scrollbar-size: 11px`.
- Standards path: `scrollbar-width: thin` + `scrollbar-color` (guarded by
  `@supports`), so Firefox and modern Chromium get the same restraint.
- WebKit path: 11px rail, transparent track, `border: 3px solid transparent` +
  `background-clip: padding-box` so the thumb reads as a slim 5px pill with
  breathing room; `999px` radius; hover and `:active` (drag) states.
- Colours are muted slate that shifts to a desaturated brand blue **only while
  dragging**. Nothing neon, nothing hidden, nothing that disappears.
- The whole block is inside `@media (pointer: fine)` — touch devices keep native
  overlay scrollbars and native momentum. `.no-scrollbar` remains for the
  deliberate chip rails.
- The document keeps a faint visible track (`html::-webkit-scrollbar-track`) so
  page position stays legible; nested regions use a transparent track.

Two new utilities express intent at call sites:
`.scroll-region` (`overflow-y:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch`)
and `.scroll-region-x`. Applied to: both shell navs, the notification list,
dialog/sheet bodies, the POS catalogue and cart, and the image-picker grid — so
every scroll owner in the app is declared, not accidental.

Keyboard-focus rule (§3.2 last bullet):

```css
.scroll-region :is(input, textarea, select, button, [tabindex]) {
  scroll-margin-block: 2rem;
}
```

so a field focused by validation lands clear of the sticky header/footer instead
of tucked underneath.

---

## 3. Scroll containers, dialogs and the responsive form pattern

### 3.1 Primitives rebuilt

`src/components/ui/dialog.tsx` — was `grid … max-h-[90vh] overflow-y-auto`: the
*whole* dialog scrolled, so the footer (and therefore Save) scrolled out of
reach. Now:

```
DialogContent  flex flex-col, max-h bounded, overflow-hidden
  DialogHeader shrink-0            (sticky by structure)
  DialogBody   min-h-0 flex-1 .scroll-region   ← the single scroll owner
  DialogFooter shrink-0 border-t bg-background safe-bottom
```

`src/components/ui/sheet.tsx` — same treatment; the bottom variant is
`max-h-[92dvh]` (dvh, so mobile browser chrome can't clip it) with `SheetBody`
as the only scroller and `SheetFooter` pinned. The close button and drag handle
now sit **outside** the scroller, so they never drift away.

`src/components/ui/alert-dialog.tsx` — bounded to `max-h-[calc(100dvh-2rem)]`
with contained overscroll, so a long confirm body can never overflow the screen.

### 3.2 One `FormDialog` for all forms

`src/components/shared/form-dialog.tsx` picks the shell from the viewport
(`useIsDesktopDialog`, in `src/hooks/use-media-query.ts` — SSR-safe):

- roomy viewport → centred dialog, width from `size` (`sm|md|lg|xl|2xl`), so a
  narrow desktop/tablet **reduces width** rather than clipping columns;
- narrow **or short** viewport (mobile, portrait tablet, mobile landscape) →
  full-height bottom sheet.

Either way the structure is header → scrolling body → sticky footer, and the
optional `onSubmit` wraps all three in one `<form>` so a footer submit button
stays wired to the fields above it (Enter-to-submit works too).

### 3.3 Migrated call sites (all 26 audited)

`FormDialog`: products (create/edit), customers (enrol), customer detail (adjust
points), rewards (create/edit), rules (create), challenges (create), staff
(invite), stores (add), customer profile (edit).

`DialogBody` / `SheetBody` + `SheetFooter`: sales list (detail dialog + filters
sheet), products filters, customers filters, customer rewards filters,
redemptions pass, campaign wizard (5-step body scrolls, progress rail and
Back/Continue stay put), AI assistant, customer selector (search pinned, results
scroll), QR scanner, business shell "More" sheet, membership QR, points card,
ways-to-earn. `ConfirmDialog` uses the bounded AlertDialog primitive.

---

## 4. Create Sale (POS)

### 4.1 Root cause

Not animation — competing scroll owners. The page had `pb-32` while a `sticky`
cart card contained its own `overflow-y-auto`, the catalogue grid was pinned to
`max-h-[540px]` **at every width** (so on a phone the product list was a tiny
inner scroller inside a page that also scrolled), a mobile cart Sheet added a
third scroll context on top of a Radix scroll-lock, and the fixed summary bar at
`bottom-[62px]` collided with the shell's own fixed tab bar. Wheel/touch events
landed in whichever container was under the cursor, and on portrait phones the
Complete Sale action could end up under the tab bar.

### 4.2 Rewrite (`src/app/business/(app)/sales/new/page.tsx`)

The file now opens with a comment stating the contract; the code enforces it:

- **The page is always the fallback scroll path.** Exactly two nested scroll
  owners exist and both are `lg:`-only:
  - catalogue grid — `lg:max-h-[540px] lg:overflow-y-auto lg:overscroll-contain`
  - desktop cart lines — `.scroll-region min-h-0 flex-1` inside a
    `sticky top-24 flex max-h-[calc(100dvh-8rem)] flex-col` card whose header and
    totals are `shrink-0`.
- **Below `lg` there is one single vertical flow** — Step 1 customer → Step 2
  products → Step 3 cart + totals rendered inline (`id="sale-cart"`). No
  side-by-side panes, no nested scrollers, and **the mobile cart bottom-sheet is
  gone** (it was the main touch-scroll trap).
- The sticky mobile summary bar sits at `bottom-[62px]` — deliberately above the
  shell tab bar — and the page reserves `pb-[186px] lg:pb-0`, so it never covers
  the last cart row or the Complete Sale button. Tapping the total smooth-scrolls
  to the cart section.
- Cart rows and totals are shared fragments (`cartLines`, `cartTotals`) rendered
  by both layouts, so mobile and desktop cannot drift apart.
- Everything required stays reachable: QR scan, customer selector, search,
  category chips (`.scroll-region-x`), qty ±, discount, live points preview,
  totals, Complete Sale, and the confirm dialog (now `DialogBody`-based).

---

## 5. Product image picker

`src/components/shared/product-art.tsx` was rewritten (201 → 697 lines) as one
art direction: flat-plus-depth vector renders on a soft tinted plate, shared
palette (slate body, brand-blue accents, one warm filament/LED highlight),
identical light direction, identical corner radii. 46 keys across Lighting,
Switches & sockets, Protection, Wiring, Fans & appliances, Conduit & accessories,
plus reward-only art. All 22 keys used by the existing mock data are preserved —
no mock record needed editing.

`src/components/shared/product-image-picker.tsx` replaces the old 40 px outlined
icon swatches with:

- two-column responsive grid (2 → 3 → 4) with readable labels on mobile;
- large tap targets, clear selected state (brand ring + tick badge + label),
  `role="radiogroup"` / `aria-checked`, full keyboard operation;
- search over label + category, and category chips;
- Upload path with **local preview only** (object URL, type + 2 MB validation,
  remove button) — no network, matching the Phase 1 mock boundary;
- `aria-live` confirmation of the current selection.

No Lucide icons, emoji, stock photography or 3D anywhere in the set.

---

## 6. Module transition speed

### 6.1 Diagnosis (measured, before changing anything)

| Finding | Evidence |
|---|---|
| three.js in the auth critical path | static `AuthVisualFallback` import from the three-bearing module → 438–479 kB auth routes |
| recharts in three route bundles | top-level `recharts` import in business dashboard, analytics, and `points-card` (which renders on customer dashboard) → 297–336 kB |
| Sync `sessionStorage` write on every state change | `JSON.stringify(entire AppState)` (~2,000 mock records) on each mutation, unthrottled |
| cmdk palette shipped to every business route | eager `CommandPalette` import in the shell |
| Barrel imports | `lucide-react`, recharts, framer-motion resolved as full barrels |
| Shell remounts | **none** — both shells are mounted by server layouts and survive intra-module navigation. Providers/store are mounted once in `app/layout.tsx`. Confirmed by reading the layout tree; no fix needed. |
| Artificial delays | **none** in the service layer. The only timers are two intentional UX simulations (`campaign-wizard` AI drafting 1600 ms, `qr-scanner` 1900 ms) that stand in for future real work. No fake route/loading timers were added anywhere. |

### 6.2 Fixes

1. **Auth 3D split** — fallback moved to its own module, 3D behind
   `next/dynamic` + a capability gate (§1).
2. **Charts code-split** — `src/components/charts/chart-primitives.tsx` is now
   the *only* file that imports recharts; `src/components/charts/index.tsx`
   exposes each chart via `next/dynamic({ ssr: false })` with a correctly sized,
   non-shifting placeholder. Whole charts are split (not individual primitives),
   because recharts inspects child element types.
3. **Store persistence off the interaction path** (`src/lib/store.tsx`) — state
   is held in a ref and flushed on `requestIdleCallback` (250 ms `setTimeout`
   fallback), plus a guaranteed flush on `visibilitychange: hidden` and
   `pagehide`. No data loss, no main-thread stall on a cart tap.
4. **Command palette lazy** — loaded on first ⌘K/click, then kept mounted so
   re-opening is instant.
5. **Prefetch on intent** — `src/hooks/use-prefetch.ts`; every sidebar item,
   bottom-tab and "More" sheet link in both shells warms its route on
   `mouseenter`, `focus` and `touchstart`, de-duplicated per mount.
6. **Contextual route skeletons** — 14 `loading.tsx` files (9 business, 5
   customer) built from small, shape-accurate skeletons
   (`PageHeaderSkeleton`, `TableSkeleton`, `ChartsSkeleton`, existing card/list
   ones). Silhouettes only — no full-page shimmer, no spinners, no timers.
7. **`next.config.mjs`** — `experimental.optimizePackageImports` for
   `lucide-react`, `recharts`, `framer-motion`, `@react-three/*`, `date-fns`,
   `cmdk`, plus `reactStrictMode: true`.

No mock dataset is imported by a shared layout; the seed data stays inside the
store provider, which is mounted once for the whole app.

---

## 7. §6 verification checks

| # | Check | Result |
|---|---|---|
| 1 | Login/signup visual at desktop/tablet/mobile; static + reduced-motion fallback | **Pass.** Two-column ≥ `lg`, form-first below. Fallback is the default render everywhere and the permanent render for reduced-motion, touch, < 1024 px, low-memory and data-saver. 3D pauses on tab hide. |
| 2 | Global and contained scrollbars, light + dark | **Pass.** Tokenised for both themes, hover/drag states, `pointer: fine` only. Verified by reading computed rules; both theme blocks define all four tokens. |
| 3 | Product modal reachable by mouse/keyboard/touch/trackpad | **Pass.** Single scroll owner (`DialogBody`/`SheetBody`), footer pinned outside it, `<form>` wrapping so Enter submits, focus-error scroll margin, bottom sheet on portrait. |
| 4 | Create Sale at all target widths | **Pass by construction** — see §4. Two `lg:`-only scroll owners, single-column step flow below `lg`, page always scrollable, all controls clear of the fixed bars. |
| 5 | Route/module transitions, no artificial delays or blank screens | **Pass.** Bundles down 31–49% on the worst routes; `loading.tsx` on every heavy module; prefetch on intent; zero artificial timers added or retained in navigation. |
| 6 | Image picker with consistent premium electrical visuals | **Pass.** 46-key single-art-direction set, labelled two-column grid, search/category, accessible selected state, local-preview upload. |
| 7 | No regressions in Phase 1 / 1.1 / 1.2 | **Pass** at the level tooling allows — `tsc` clean, `next lint` clean, `next build` builds all 36 routes, and every route returns 200 from the dev server. No route, service, mock-data, event or PWA file was removed or repurposed. |

### Verification method — and its limit

Chromium could not be installed in this sandbox (`playwright install` fails on
missing font packages and a download error, and no system Chrome exists), so
**automated screenshot/viewport testing was not possible**. Checks were done by
(a) reading every changed structure, (b) production build metrics, (c) `tsc` +
ESLint, (d) HTTP checks on all routes, and (e) reasoning about the CSS
containment rules. The remaining item for you is a visual pass in the live
preview at 320 / 360 / 390 / 414, portrait tablet, 768, 1024 and desktop — the
structure is written for those widths but I could not photograph it.

---

## 8. Files changed

**New:** `components/charts/chart-primitives.tsx`, `components/charts/index.tsx`,
`components/shared/form-dialog.tsx`, `components/shared/product-image-picker.tsx`,
`components/shared/auth-visual-fallback.tsx`, `components/shared/auth-artwork.tsx`,
`hooks/use-media-query.ts`, `hooks/use-prefetch.ts`, 14 × `loading.tsx`.

**Rewritten:** `components/shared/auth-visual.tsx`, `auth-shell.tsx`,
`product-art.tsx`, `ui/dialog.tsx`, `ui/sheet.tsx`,
`app/business/(app)/sales/new/page.tsx`.

**Modified:** `app/globals.css`, `next.config.mjs`, `lib/store.tsx`,
`ui/alert-dialog.tsx`, `components/shared/loading-skeleton.tsx`,
`components/shared/notification-center.tsx`, both shells, `campaign-wizard.tsx`,
`customer-selector.tsx`, `qr-scanner.tsx`, `membership-qr.tsx`, `points-card.tsx`,
`ways-to-earn.tsx`, and the business/customer pages listed in §3.3.

---

## 9. Next

Phase 1.3 is code-complete. Per your instruction, Phase 2 does not begin until
you have signed off this QA. When you do, Step 1 of Part B §15 is a **proposal
only** — Supabase data model, migrations, RLS/security policy design, seed
strategy, environments and CI checks — delivered for your approval before any
mock service is replaced.
