# REWARDLY / AMBIKA ELECTRICALS
# FINAL MVP LAUNCH COMPLETION — REMAINING ESSENTIAL WORK

## 1. New-chat briefing and current status

This is an existing Next.js 16 premium loyalty/POS application for Ambika Electricals. Do not rebuild working features. Read the repository, current branch, migrations, reports, tests and these documents before changing anything:

- PROJECT_BRIEF.md
- PHASE_2_ARCHITECTURE_PROPOSAL.md
- PHASE_2_STEP_2_AUTH_FOUNDATION.md
- RLS_POLICIES.md
- RLS_TEST_RESULTS.md
- OWNER_ACTION_CHECKLIST.md
- all handoff addenda and current Supabase migrations

### Already delivered and merged

- Complete Phase 1 frontend/customer/business/PWA experience.
- Phase 1.2 and 1.3 visual, performance, dialog, POS, scrollbar and responsive improvements.
- Next.js upgraded to 16.
- Supabase Email OTP/password auth foundation, roles, invitations, protected routes, RLS and audit trail.
- Immutable points ledger with idempotent award/spend/adjust operations.
- Server-authoritative sale creation, server totals, sequential Rewardly sale references, void/reversal workflow.
- Per-store inventory and stock movements.
- Server-authoritative rewards/redemptions, holds, points spend/refund, collection code, expiry/limits and live customer/business panels.
- Existing quality checks: test harness, pgTAP mirror, typecheck, lint, unit tests, build and route smoke tests.

### Important boundaries

- Do not use Prisma. Continue using Supabase PostgreSQL, Auth, RLS, Realtime, Storage and SQL migrations as the single source of truth.
- Rewardly is not the GST invoice of record. Existing billing/POS remains authoritative.
- Phone/SMS OTP and DLT integration are not part of this MVP unless the owner later explicitly approves them.
- Do not print, commit, or request secrets in code/reports. Real Supabase/Resend setup is an owner action.

---

## Mandatory UI hotfixes — complete before MVP backend completion work

These visible issues remain open and are mandatory. Do not claim final MVP sign-off until they pass real-browser desktop and mobile verification.

### Remove visible Demo Mode

- Remove the visible Demo Mode persona switcher/dropdown from headers, account menus, sidebars, mobile navigation and all normal user-facing screens.
- Keep mock/demo support only as an internal development/preview mechanism if needed.
- It must never act as a production authorization bypass. Reset-demo-data controls must be development/preview-only.

### Complete Global Search

- Support Cmd+K on macOS and Ctrl+K on Windows/Linux.
- Search Pages, Customers, Products, Sales/Invoices and Rewards.
- Group results; show useful icons/metadata; provide keyboard navigation, Enter-to-open, Escape-to-close, focus management, pointer support, short debounce and clean loading/empty states.
- Enforce role/business/store permissions. Never show unauthorized results.
- Search mock data only in demo fallback. In Supabase mode use a clean server-search boundary; never download all production records to the browser.
- Lazy-load the palette if consistent with the existing performance strategy.

### Fix PWA install prompt persistence

- Not now and close X persist across module/route changes and browser refresh.
- Not now has a 30-day cooldown; close X has a 90-day cooldown; no reshow in the same session.
- Suppress after successful installation and when standalone/installed, unsupported or no install event is available.
- Ensure one provider/listener controls prompt state; no duplicate banners.
- Keep install available later through a subtle Settings/Help action, not a repeated popup. Online/offline state stays separate.

### Premium scrollbars and collapsible sidebar

- Audit actual scroll owners. Apply theme-aware refined desktop scrollbars to sidebar, pages, tables, forms, dialogs, sheets, image picker and custom lists; support light/dark theme, Firefox/WebKit, hover/drag state and native touch scrolling.
- Do not hide scrolling or create nested scroll traps. Dialog/sheet header/footer remain pinned; body is the one clear scroll owner.
- Add an explicit desktop sidebar collapse/expand control. Collapsed state is an accessible icon rail with tooltips and active-route indicator; preference persists locally.
- Expanded/collapsed main layout transition is restrained and reduced-motion aware. Sidebar scrolling/bottom actions remain usable.
- Preserve current drawer/bottom-navigation behavior on mobile/tablet; do not force icon-rail collapse on touch layouts.

### UI acceptance gate

Verify in a real browser before QR/backend work:

1. Demo Mode is absent from normal UI.
2. Cmd/Ctrl+K finds/opens authorized pages, customers, products, invoices and rewards.
3. PWA prompt remains dismissed through navigation and refresh.
4. Scrollbars are refined on desktop in light/dark and native on touch.
5. Sidebar collapse persists and has no mobile/layout/accessibility regression.
6. Typecheck, lint, tests, production build and critical flows pass.

---

## 2. Objective

Bring the product to a clean, safe **MVP launch-ready state**. Finish only the remaining capabilities that are necessary for secure daily counter use and a credible customer loyalty experience.

Do not expand into unbounded enterprise work. Complete the essentials below, document explicit deferrals, and stop for owner setup/UAT before production launch.

---

# PART A — MUST COMPLETE BEFORE MVP SIGN-OFF

## 3. Secure production membership QR and POS verification

This is the highest-priority outstanding security gap. The existing customer QR must not encode a raw, predictable membership ID or customer data.

### Required design

- Replace raw membership-ID QR payload with an opaque, signed, short-lived token.
- Token must not contain readable PII, direct membership ID, points balance, business secrets, or predictable identifiers.
- Customer QR display obtains/refreshes a token through an authorized, rate-limited server operation.
- Token has a short expiry and includes enough server-verified context to prevent cross-business use.
- QR scanner/verification is a secure staff POS flow: server validates signature, expiry, revocation/session status, staff role, business and assigned store.
- Verification returns only the minimum customer membership lookup data necessary for the sale flow.
- Invalid, expired, malformed, replayed/excessively scanned and unauthorized attempts produce safe customer-facing error UI and server audit events.
- Keep authorized manual customer lookup as fallback.
- Do not use camera hardware integration if current UX only has a mock scanner; implement the token contract/verification endpoint and integrate it into the existing scanner simulation first.

### Required tests

- Valid authorized scan succeeds.
- Expired/malformed/tampered token fails.
- Customer/staff cannot verify across tenant/business/store boundaries.
- No raw membership ID or PII is encoded in QR.
- Unauthorized scanner operation fails.
- Verification audit events exist without logging token secrets.

## 4. Versioned loyalty-rule engine

Replace hard-coded launch-policy columns/logic with versioned, server-authoritative configuration. Existing launch policy remains the active default:

- ₹100 eligible spend = 10 points.
- One point = ₹0.10 reward value.
- No points expiry at launch.

### Required design

- Add versioned loyalty rule/rule-set tables, effective dates and business-scoped active rule selection.
- Sales/ledger entries store the rule/version used, so history is never recalculated incorrectly after future rule changes.
- Server-side sales transaction uses the active rule version. Browser displays estimate only; server response remains final.
- Owner can view and edit current rule in business settings through a simple, validated UI. Changes create a new version, never rewrite old one.
- Start with spend-based rule only; show unsupported advanced models as future/disabled, not partially functioning controls.
- Remove all remaining hard-coded point-expiry statements from UI/mock seed data. No expiry process runs at launch.

### Required tests

- Only owner can create/change a rule.
- Cross-business rules cannot be used.
- Existing sale history retains old rule version.
- New sale uses currently effective active rule.
- Invalid rate/effective-date configuration fails safely.

## 5. Realtime state and persistent in-app notifications

The UI already has a local notification experience. Make real-mode behavior durable and multi-session aware.

### Required design

- Persist in-app notifications in database with business/customer/store scope, category, actor/source, payload reference, read state and timestamps.
- Generate notifications for at least: successful sale points award, redemption status/change, low-stock alert where configured, staff invitation, rule change, and QR verification failure/security event where appropriate.
- Use secure tenant-scoped Supabase Realtime subscriptions only for authorized data.
- Update narrow cache/store slices; never refetch the entire application for one event.
- Reconnect safely, de-duplicate events, reconcile optimistic local state and show offline/reconnecting state without alert spam.
- Unread badge/read/mark-all actions persist and sync across the user’s authorized sessions.
- Keep web push separate; do not implement browser push yet.

### Required tests

- Customer/business user receives only authorized notifications.
- Cross-tenant/store access is denied.
- Read/mark-all state persists.
- Duplicate/reconnect events do not duplicate activity or points.
- UI still works with Realtime unavailable, using a safe refresh/fallback path.

## 6. Product images, Storage and essential business settings

### Storage

- Add secure Supabase Storage buckets/policies for product/reward images.
- Server validates authorization, MIME type, file size and ownership/business scope.
- Store durable image metadata and optimized/display-ready URLs.
- Migrate existing local mock image picker/preview progressively without breaking fallback visuals.
- Preserve accessible alt text and image fallback state.

### Business settings

Build only essential real settings:

- Business identity/display details.
- Store details and active status.
- Current loyalty rule view/change entry point.
- Notification preferences needed by the in-app notification MVP.
- Staff/store membership management entry point if existing UI supports it.

Do not create broad untested settings pages. Every setting must be role-authorized, validated, audited where sensitive and tenant-scoped.

## 7. CI, database verification and release safety

The project does not yet have a GitHub Actions workflow. Add release-quality CI:

- Run install, TypeScript check, lint, unit tests, production build and route/smoke checks on pull requests.
- Run migration/schema validation and real pgTAP/Supabase database tests in a reproducible Docker-capable CI runner.
- Add secret scanning/dependency security checks appropriate to the repository.
- Do not rely only on a local pgTAP stub runner for launch confidence.
- Document how to run local/CI checks and how migrations deploy to staging then production.

Add operational essentials:

- Error tracking/structured logging integration design with secret/PII redaction.
- Health/readiness checks appropriate to hosting.
- Backups/restore and migration rollback plan.
- Staging/UAT checklist and production deployment checklist.
- Basic performance/accessibility audit for critical login, QR scan, Create Sale, redemption and mobile PWA flows.

---

# PART B — OWNER ACTIONS AND REQUIRED CONFIRMATIONS

## 8. Do not treat code completion as production launch

The application remains in demo/mock fallback until the owner completes external configuration. The agent cannot perform these owner-owned actions:

1. Create Supabase staging and production projects.
2. Create Resend account and verify sending domain.
3. Add SPF, DKIM and DMARC DNS records.
4. Add Supabase/Resend secrets to hosting environment and local environment; never paste these into chat, source files or Git.
5. Configure Supabase Auth redirect URLs, email templates and custom SMTP as documented.
6. Choose a hosting provider/domain and connect production domain.
7. Run staging UAT with real owner/staff/customer test accounts.

### Owner decisions still required

Use these recommended defaults unless the owner chooses otherwise:

- Points policy: confirm ₹100 = 10 points, ₹0.10 per point, no expiry at launch.
- Void policy: confirm a voided sale automatically posts an audited compensating points reversal and stock restock.
- Session security: owner accounts should use MFA before production; staff session timeout should be set conservatively.
- Data import: decide whether existing customer/member/points data must be imported before launch.
- Data residency/privacy: choose Supabase region appropriate to business/privacy needs; publish privacy/consent contact information.
- Budget: approve Supabase paid production plan and Resend plan before launch.
- Payments: points-plus-cash should remain in-store/counter-settled for this MVP. Do not add an online payment gateway yet.

---

# PART C — EXPLICITLY DEFERRED AFTER MVP

## 9. Do not delay MVP for these items

Document these as a later phase unless the owner explicitly prioritizes them:

- SMS OTP, WhatsApp, DLT registration and communication provider integration.
- Browser/web push notifications.
- Full external billing/POS integration and GST/e-invoice support.
- Complex points-plus-cash combinations and online payment gateway.
- Fractional quantity units (wire per metre), product variant/options matrix, advanced categories/brand hierarchy.
- Tier-gated reward eligibility and advanced scoped manager permissions.
- Full campaign/challenge/referral server migration and advanced analytics.
- Multi-business selector interface for users who manage multiple businesses.
- Expiry background cron (launch has no points expiry).

---

## 10. Required delivery order

1. Mandatory UI hotfixes and real-browser verification.
2. Secure QR token/verification slice.
3. Versioned loyalty-rule engine.
4. Realtime persistent notifications.
5. Secure Storage/product images and essential business settings.
6. GitHub Actions CI, real database testing and hardening/release documents.
7. Stop and provide final MVP handoff. Do not silently expand to deferred scope.

After each item, run relevant migrations/tests plus TypeScript, lint, unit tests, production build and smoke checks. Preserve demo fallback behavior where Supabase is not configured.

## 11. Final MVP definition of done

The MVP is ready for owner staging/UAT only when:

- Mandatory UI hotfixes pass the explicit real-browser acceptance gate.
- Customer QR is opaque, signed/short-lived, securely verified and audited.
- Sales, inventory, immutable ledger and redemptions remain server-authoritative and idempotent.
- Rules are versioned and owner-configurable; historical transactions retain their applied rule version.
- Real-mode notifications persist, are RLS-protected and sync safely across authorized sessions.
- Product images/storage and required business settings are secured by tenant/role policies.
- CI performs real database/RLS verification in a reproducible runner.
- Staging/production environment setup, backups, monitoring, deployment and UAT checklists are documented.
- All external owner actions are clearly listed; real production credentials remain outside Git.
- Deferred scope is explicitly recorded rather than partially implemented.

## 12. Final agent handoff instruction

Complete this document in order. Report changed files, migrations, policies, service/RPC contracts, exact test results, setup tasks and deferred items. Then stop for owner staging configuration and UAT approval before any production deployment.
