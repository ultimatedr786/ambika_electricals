# REWARDLY / AMBIKA ELECTRICALS
# MASTER DELIVERY PLAN — PHASE 1.3 QUALITY FIXES + PHASE 2 PRODUCTION BACKEND

## Agent instruction

Read PROJECT_BRIEF.md and PHASE_1_2_POLISH_PERFORMANCE_PWA.md before starting. Do not rebuild working Phase 1, 1.1, or 1.2 user journeys. First inspect the repository and diagnose the actual source of each issue. Complete Phase 1.3 fully before starting Phase 2.

The supplied screenshots are feedback references only. Never use them as product imagery or assets.

---

# PART A — PHASE 1.3: NEXT-LEVEL VISUAL POLISH, UX FIXES & PERFORMANCE

## 1. Goal

The product must stop feeling like a prototype with generic components and start feeling like a fast, high-end loyalty/POS application. Improve visual craft and solve actual usability defects:

- The login animation is still only acceptable, not exceptional.
- Native/generic scrollbars look unfinished.
- Moving between modules/routes feels slow.
- Create Sale and product/form dialogs have broken or awkward scrolling.
- Some portrait/narrow layouts are cramped or visually unbalanced.
- Product-image/icon selection looks generic and low quality.

Do not mask defects with extra animation. Fix structure, loading strategy, and visual hierarchy.

---

## 2. Authentication visual: redesign for a more premium result

### 2.1 Audit first

Inspect the current Three.js scene at multiple screen sizes and devices. Identify why it feels weak: excessive object count, unclear silhouette, weak composition, poor lighting, too much detail, slow load, or poor relationship to the auth form. Do not keep a visual merely because it uses Three.js.

### 2.2 Required new direction: “Quiet Power”

Refine the scene into a sophisticated, editorial composition rather than a literal collection of floating objects.

- Use one hero object: a minimal brushed-metal/electric-blue membership card or reward core.
- Surround it with only two or three abstract electrical cues: an LED glow, a modular-switch geometry, and a circuit line.
- Let a controlled current pulse travel from the circuit to the card, then emit a small points token. It should communicate purchase-to-reward in one glance.
- Use intentional depth, soft shadows, restrained glow, and a clean camera angle. Fewer objects, better materials, and better composition are preferred over visual noise.
- Avoid literal giant lightning bolts, ring chains, excessive golden coins, random particle fields, icons inside 3D, or toy-like 3D models.
- Use a deep navy field with a subtle radial light and one electric-blue plus one warm reward accent. Maintain good contrast with all auth copy.
- Keep a polished static SVG/CSS fallback. On lower-end and mobile devices, default to the fallback or a low-detail scene.

### 2.3 Auth page details

- Make the form the visual priority. The artwork cannot compete with heading, form labels, or CTA.
- Align form, logo, heading, role selector, inputs, demo card, and secondary actions to a clear vertical rhythm.
- Maintain clean desktop two-column balance and mobile form-first design.
- Keep Three.js dynamically imported and out of the critical form bundle.
- Honor reduced motion and pause animation when the tab is hidden.

---

## 3. Premium scrollbar system

Replace generic/native-looking scrollbars where custom styling is appropriate. Do not hide scrollability or reduce accessibility.

### 3.1 Global scrollbar

- Add a subtle brand-consistent scrollbar for desktop: slim track, rounded thumb, quiet neutral/dark colours, visible hover and drag state.
- Use CSS scrollbar-color / scrollbar-width for Firefox and WebKit scrollbar rules for Chromium/Safari.
- In dark mode, match the shell surface; in light mode, use a soft neutral track.
- The scrollbar must remain easy to grab, sufficiently visible, and not look neon or decorative.
- Do not force custom scrollbar behavior on touch devices where native scrolling is better.

### 3.2 Scroll containers, drawers and dialogs

- Every scrollable surface needs a deliberate height/min-height/max-height and one clear scroll owner.
- Dialog shell, header, content, and footer must be separated correctly: header/footer stay visible; content scrolls.
- Use overscroll containment only where it prevents background scrolling without trapping normal use.
- Do not apply overflow-hidden to a parent that blocks form content.
- Ensure keyboard focus moves to an error field within a scrollable dialog and the field becomes visible.

---

## 4. Fix Create Sale, form dialog and portrait-layout defects

### 4.1 Current defect to eliminate

The product/create/edit modal shown in feedback has an inner scrollbar, but lower form content/actions are awkward or inaccessible. Create Sale also does not reliably scroll. This is a blocking usability issue.

### 4.2 Required modal/form pattern

- Use one responsive dialog/sheet component pattern across product, customer, reward, and sale forms.
- Desktop: centered dialog with practical maximum width and maximum viewport height.
- Narrow desktop/tablet: reduce width intelligently rather than clipping two-column fields.
- Mobile and portrait: switch to a full-height bottom sheet or full-screen form route/sheet; never squeeze desktop modal columns into a narrow view.
- Structure: sticky header → scrollable content area → sticky action footer.
- Modal content must scroll using mouse wheel, touch, keyboard, and trackpad. Page behind it must not move.
- Submit/cancel actions must always remain reachable.
- Restore meaningful prior scroll position on close when appropriate.

### 4.3 Product image picker redesign

The current tiny generic outlined icon grid is not premium enough. Replace it with a product-visual selection system:

- Use carefully curated, consistent electrical product illustrations or high-quality lightweight rendered thumbnails, not arbitrary icon buttons.
- Each option must communicate product category and type immediately: bulb, LED panel, switch, socket, MCB, wire coil, fan, conduit, accessory.
- Use a consistent visual art direction: real product-focused thumbnails on a neutral surface or elegant category illustrations. Do not mix random Lucide icons, emoji, stock photos, and 3D styles.
- Show selected state with clean border/check/label; include accessible text.
- Add search/category filtering only if it remains simple.
- Include an Upload/custom image path in the UI if compatible with current mock phase; use local preview only until Phase 2 storage is ready.
- On mobile use a two-column responsive image grid with readable labels.

### 4.4 Create Sale screen

- Audit all nested height/overflow CSS, especially shell, main content, cart pane, drawers, and modal portals.
- On desktop, use a responsive POS layout with independently scrollable product catalogue and cart only where necessary; the page itself must have a valid fallback scroll path.
- On mobile/portrait, use a single clear vertical flow or step-based form. Do not force side-by-side product/cart panels.
- Keep customer selector, search, category controls, cart total, live points calculation, and Complete Sale action reachable.
- Use sticky cart summary/action only if it never hides cart rows or page content.
- Test at 320/360/390/414 pixel mobile widths, typical portrait tablet, 768px, 1024px, and desktop.

---

## 5. Make every module transition genuinely fast

### 5.1 Diagnose before changing

Use browser performance tooling, route/bundle inspection, and React profiling where useful. Identify the real sources of delay: large client bundles, route-level imports, repeated data transformation, animation blocking, synchronous storage work, excessive re-renders, or unnecessary suspense boundaries.

### 5.2 Required improvements

- The navigation shell must remain mounted through normal module changes.
- Prefetch likely next routes on intentional hover/focus and high-confidence navigation paths, while respecting network/battery constraints.
- Keep route code split by module; load charts, Three.js, large product visuals, editors, and complex dialogs only on routes that use them.
- Use small contextual skeletons, not full-screen blockers or long transitions.
- Avoid importing all mock datasets into shared layouts.
- Avoid remounting stores/providers when moving between customer/business modules.
- Prevent duplicate state updates and avoid artificial timers.
- Use immediate feedback for clicks; visual transitions should not delay route readiness.
- Optimize images and use correctly sized thumbnails.

### 5.3 User-facing speed requirement

On a typical modern device, module navigation should feel near-instant after first visit. A loading state is acceptable only for genuinely unloaded route code, and it must be compact and stable. Report measured before/after findings where tooling permits.

---

## 6. Phase 1.3 verification

Complete and report:

1. Login/signup visual review at desktop, tablet, and mobile; static/reduced-motion fallback works.
2. Global and contained-scrollbar review in light/dark modes.
3. Product modal: every field and footer action can be reached with mouse, keyboard, touch, and trackpad.
4. Create Sale: customer scan/select, product selection, cart updates, points, and completion work and scroll correctly at all target widths.
5. Route/module transition review with no artificial delays or blank screens.
6. Product image picker review with consistent premium electrical product visuals.
7. No regressions in Phase 1, 1.1, and 1.2 flows.

---

# PART B — PHASE 2: REAL BACKEND, AUTHENTICATION, REALTIME & OPERATIONS

## 7. Phase 2 goal

Turn the approved frontend prototype into a secure, multi-user application while preserving the established UX. Phase 2 introduces real identity, durable data, tenant/business isolation, server-enforced loyalty rules, verified sale/redemption workflows, realtime updates, and production operations.

Do not begin Phase 2 by replacing the visual design. Establish a stable data/security foundation first, then connect existing UI incrementally.

## 8. Recommended architecture

- Next.js application with TypeScript.
- Supabase for PostgreSQL database, Auth, Storage, Realtime, Row Level Security, and server-side/Edge functions where appropriate.
- Next.js server-side route handlers/server actions only for validated, authorized operations; never expose privileged credentials in the browser.
- Zod schemas shared where practical for client/server validation.
- A typed repository/service layer that replaces Phase 1 mock services without forcing wholesale UI rewrites.
- Separate development, staging, and production environments with correctly scoped environment variables.

Before adopting exact libraries/versions, verify the current official documentation and compatibility with the existing Next.js version.

## 9. Identity, roles and tenant isolation

### Roles

Support Customer, Business Owner, Manager, Staff/Cashier, and future Super Admin roles.

### Requirements

- Real email/password and phone OTP authentication through the chosen provider.
- Secure session handling, password reset, email/phone verification where required, account recovery, sign-out from device/session, and rate limiting/abuse safeguards.
- Connect customer profile to membership identity; connect owner/staff to a business and permitted stores.
- One user can only access data allowed by their role and business/store membership.
- Business owner can manage roles and invitations; staff has least-privilege access.
- Row Level Security is mandatory on every business/customer data table. Never trust a role from browser state alone.

## 10. Core data model

Design migrations, constraints, indexes, timestamps, audit fields, and soft-delete/archive policies for:

- businesses, stores, business_settings
- user_profiles, customer_profiles, staff_profiles, memberships, tiers
- products, product_categories, product_images, inventory_by_store
- sales, sale_items, sale_payments, invoices
- loyalty_rules, loyalty_rule_versions, points_ledger
- rewards, reward_inventory, reward_eligibility, redemptions, redemption_items
- campaigns, challenges, challenge_progress
- referrals, referral_rewards
- notifications, notification_preferences, device_tokens
- addresses, fulfilment/pickup locations
- audit_logs and idempotency_keys

Use immutable points-ledger entries rather than directly editing a balance. Customer balance must be derived safely or maintained transactionally from ledger entries.

## 11. Secure sales and loyalty engine

### Sale creation

1. Staff identifies customer through approved membership lookup or QR token.
2. Server validates staff/store permission, product availability, prices, discounts and idempotency key.
3. Server creates sale and sale items in one transaction.
4. Server applies current, versioned loyalty rules and writes earned/bonus/adjustment entries to the points ledger.
5. Server updates inventory safely.
6. Server writes audit log and emits relevant realtime/notification event.

Never calculate final production points only in the browser. Display client estimates, then show server-confirmed final values.

### QR verification

- Membership QR must hold an opaque, signed or short-lived token—not PII or a raw predictable membership ID.
- Scan endpoint validates token, expiry/revocation, business/store access, and rate limits.
- Provide manual lookup fallback.

### Redemptions

- Server validates member tier, sufficient available points, reward inventory, redemption limits, reward terms, expiry and chosen fulfilment.
- Use an idempotent transaction that reserves inventory, creates redemption record, writes negative ledger entry, and returns redemption code/QR pass.
- Support Pending, Confirmed, Ready for Pickup, Completed, Expired and Cancelled states with explicit allowed transitions.
- Cancellation/expiry must restore points/inventory only through audited compensating ledger events.

## 12. Realtime and notifications

- Use secure, tenant-scoped realtime subscriptions for business dashboards, customer points/activity, sales, redemption status and notification inbox.
- Design subscriptions to update narrow query caches/store slices rather than refetching the entire application.
- Add resilient reconnection, duplicate-event protection, ordering strategy, optimistic UI reconciliation and clear connection state.
- Persist in-app notifications in database; realtime delivers them quickly but does not become the source of truth.
- Add web push only after permission UX, device-token storage, VAPID/provider security, preferences, unsubscribe, delivery failures, and legal/compliance considerations are implemented.
- Keep email/SMS/WhatsApp transactional integrations behind server-side providers and queues; do not call them directly from the client.

## 13. Files, product imagery and PWA evolution

- Store product/reward images in protected/object storage with server-validated upload policies, type/size limits, image processing, alt text, and safe public delivery URLs where appropriate.
- Replace mock local uploads gradually; retain optimized thumbnails.
- Evolve PWA to offline-read support, queued drafts and background sync only after conflict strategy/security have been designed.
- Never allow offline sale/redemption confirmation unless secure sync, inventory/points conflict resolution, and user messaging are fully designed.

## 14. Admin, analytics, compliance and reliability

- Add business settings for points value, tier rules, reward rules, stores, staff, tax/display preferences and notification preferences.
- Build server-backed analytics with indexed queries/materialized aggregates where needed; avoid loading all sales on client.
- Implement search/filter/pagination on server.
- Audit sensitive events: price/rule changes, points adjustments, sale/redemption cancellation, role changes, QR failures, and exports.
- Add data export/deletion policies, privacy notices/consent where applicable, backup/restore plan, monitoring, error tracking, structured logs, health checks and rate limits.
- Test authorization/RLS separately from UI tests.

## 15. Phase 2 delivery sequence

1. Architecture decision, data model, migrations, RLS policy design, seed strategy, environments and CI checks.
2. Real authentication, roles, business/store membership, protected routes and session UX.
3. Replace mock customer/product/store reads with typed server-backed repositories.
4. Build server-authoritative sales, inventory and immutable points ledger transaction.
5. Build server-authoritative rewards/redemptions, codes, QR token validation and status lifecycle.
6. Add realtime database events and in-app notification persistence.
7. Migrate image upload/storage and business management controls.
8. Connect analytics, campaign/challenge/referral operations.
9. Add web push and external communication only after core flows/security are stable.
10. Performance, accessibility, load/security testing, staging UAT, monitoring, backup and production deployment.

## 16. Phase 2 acceptance criteria

Phase 2 is complete only when:

- A real user can securely sign up/sign in and see only authorized data.
- Every business/store/customer boundary is enforced in database policies and server operations.
- Sales, inventory, points ledger and rewards redemption are atomic, idempotent and auditable.
- Points cannot be forged, double-spent or changed directly from browser state.
- QR membership verification does not reveal insecure customer data.
- Points, activity, sales and notifications update across authorized sessions/devices through realtime.
- Notification persistence and preferences work; delivery integrations fail safely.
- Product image uploads are validated and securely stored.
- PWA remains installable and has safe offline behavior.
- Mobile and desktop critical flows pass accessibility, performance and end-to-end testing.
- Staging/UAT succeeds before production release.

## Final instruction

Deliver Phase 1.3 first, with a focused QA report and visual evidence where appropriate. Then begin Phase 2 in the stated sequence. Do not convert every mock service at once; migrate a vertical slice at a time while keeping the app stable. Report backend schema/policy decisions, implemented flows, tests, and anything that requires a business decision before proceeding.
