# AUTH / ROLE / INVITATION IMPLEMENTATION REPORT

Phase 2 Step 2 · deliverable 6 of 8 · Rewardly / Ambika Electricals

Companion documents: `NEXT_16_UPGRADE_REPORT.md` (deliverable 1),
`SETUP_SUPABASE_AND_RESEND.md` (2), `.env.example` (3), `supabase/migrations/`
+ `supabase/seed.sql` (4), `RLS_POLICIES.md` + `RLS_TEST_RESULTS.md` (5),
`OWNER_ACTION_CHECKLIST.md` (7), `PHASE_HANDOFF_REPORT.md` (8).

---

## 1. What was built

Real authentication and authorization on Supabase, with the Phase 1 mock app
fully preserved as a clearly-labelled Demo mode that disappears in production
once Supabase is configured.

| Capability | Where | How |
| --- | --- | --- |
| Email + password sign-in | `src/components/shared/login-form.tsx` | `supabase.auth.signInWithPassword`; generic non-enumerating errors; unconfirmed-email path offers resend |
| Email confirmation | signup forms + `/auth/confirm` | `signUp` with `emailRedirectTo`; branded GoTrue template with 6-digit code **and** link; exchange route verifies `token_hash` server-side |
| Email OTP (passwordless) | login form | `signInWithOtp` → `verifyOtp(type:'email')`; paste/keyboard-friendly 6-digit input; 60s resend cooldown with countdown; 10-minute expiry copy |
| Password reset | `forgot-password-form.tsx`, `/auth/confirm`, `/reset-password` | `resetPasswordForEmail` → recovery token exchange → session-gated `updateUser({password})`; non-enumerating copy |
| Business signup → tenant | `business-signup-form.tsx` + business layout guard | `signUp` with `signup_context:'business'` metadata; after confirmation the layout guard calls the audited, idempotent `complete_business_signup` RPC exactly once |
| Owner/staff invitations | Staff page `LiveTeamPanel`, `/auth/invite/[token]`, `team-actions.ts` | `create_invitation` RPC (hash-only single-use token) → Resend-delivered branded email → accept page with context + expiry → `accept_invitation` RPC (re-validates token/status/expiry/email match) |
| Roles + protected routes | `src/proxy.ts`, `src/lib/auth/session.ts`, layouts | Proxy gates `/customer/*` and `/business/*` (session existence + refresh); layouts enforce role/membership (business vs customer, owner-only Settings/Staff) with exact return-to |
| Membership management | `LiveTeamPanel` + `team-actions.ts` | Role change, removal, store scoping via SECURITY DEFINER RPCs; owner-only mutations |
| Denial auditing | `team-actions.ts` | Every RPC denial writes an `audit_logs` row via the service-role client **with the real client IP** (in-SQL denial audit would roll back with the raising statement) |
| Data isolation | `supabase/migrations/*120200*` | RLS on all 8 tables + fail-closed grants — see `RLS_POLICIES.md`; proven by 42-case harness (42/42 PASS) |

**Explicitly out of scope (per spec):** phone/SMS OTP (mock phone OTP UI was
replaced by Email OTP so the prototype matches the email-only phase), and any
migration of sales, inventory, points ledger, rewards, redemptions, QR,
campaigns, challenges or referrals — those remain mock-only and working.

## 2. Architecture & trust boundaries

- **Identity source of truth:** the signed Supabase JWT via `auth.getUser()`
  server-side; `auth.uid()` inside RLS. Nothing trusts client-sent identity.
- **Supabase Auth owns** credential checks, OTP generation/validation,
  confirmation/reset links, rate limits, and session refresh. The app never
  generates or validates OTPs — not in the browser, not via Resend.
- **Resend is mail delivery only:** GoTrue sends auth emails through Resend
  SMTP (dashboard config); the app sends only *business invitation* emails
  through the Resend API (`src/lib/auth/invite-mailer.ts`, server-only, with a
  copy-link fallback when email isn't configured).
- **Service-role key** is confined to `src/lib/supabase/admin.ts`
  (`server-only` import fails any browser bundling) and used for exactly two
  things: the anonymous invitation-token lookup on `/auth/invite/[token]`
  (hash-only read) and denial audit writes.
- **Demo/real boundary** lives in `src/lib/auth/env.ts`: absent
  `NEXT_PUBLIC_SUPABASE_*` → Demo mode (proxy no-ops, guards no-op, demo
  affordances visible and labelled). Configured production build → demo
  affordances removed; `NEXT_PUBLIC_DEMO_AUTH=true` can only re-enable them in
  non-production builds.
- **Open-redirect defense:** every user-supplied `next` passes
  `safeReturnTo()` (`src/lib/auth/redirects.ts`) — rejects absolute URLs,
  protocol-relative `//`, backslash escapes, single/double percent-encoded
  variants, control characters, and auth-exchange endpoints (loop protection).
  Unit-tested (8 cases, `npm test`).

## 3. Changed/added files

### Stage A (committed separately — see NEXT_16_UPGRADE_REPORT.md)
Next 16.3.4 / React 19.2.8 / R3F 9 upgrade, flat ESLint config, icon typing
fixes in 12 files, `scripts/smoke-routes.mjs`.

### Stage B — environment & structure
`supabase/config.toml`, `supabase/.gitignore`, `.env.example`, `.gitignore`,
`src/lib/auth/env.ts`, `src/lib/supabase/{client,server,admin}.ts`,
`supabase/templates/{confirmation,magic_link,recovery,invite}.html`,
`SETUP_SUPABASE_AND_RESEND.md`.

### Stage C — database (single source of truth; no ORM)
`supabase/migrations/20260905120000_auth_foundation_schema.sql` (enums,
profiles, businesses, stores, 3 membership tables, FK-free immutable
audit_logs, triggers, auth-sync),
`supabase/migrations/20260905120100_invitations_and_rpcs.sql` (invitations
table + 8 SECURITY DEFINER RPCs),
`supabase/migrations/20260905120200_rls_policies.sql` (RLS + grants),
`supabase/seed.sql` (dev-only demo tenant; aborts on non-empty DB).

### Stage D — proof
`scripts/rls-check/{00_stubs.sql,10_assertions.sql,run.mjs}`,
`supabase/tests/rls_policy_tests.sql` (pgTAP, 48 assertions),
`RLS_POLICIES.md`, `RLS_TEST_RESULTS.md`.

### Stage E — auth integration
`src/proxy.ts`; `src/lib/auth/{session,redirects,client-flows}.ts`;
`src/app/auth/confirm/route.ts`; `src/app/reset-password/page.tsx`;
`src/components/shared/reset-password-form.tsx`;
layouts `src/app/customer/layout.tsx`, `src/app/business/(app)/layout.tsx`;
pages `login`, `signup` (searchParams → next/error);
forms `login-form.tsx`, `signup-form.tsx`, `forgot-password-form.tsx`,
`business-signup-form.tsx`; shells `customer-shell.tsx`, `business-shell.tsx`
(real sign-out, DemoSwitcher gate, `liveRole` nav filtering);
`command-palette.tsx` (`hiddenHrefs`).

### Stage F — invitations & member management
`src/lib/auth/invite-mailer.ts`;
`src/app/business/(app)/staff/team-actions.ts`;
`src/app/auth/invite/[token]/page.tsx`;
`src/components/auth/accept-invitation-card.tsx`;
`src/components/business/live-team-panel.tsx`;
`src/app/business/(app)/staff/page.tsx` (live panel + prototype label);
loyalty-copy fixes: `points-card.tsx`, `settings/page.tsx` (points never
expire — spec §2.5; voucher pickup windows intentionally kept);
`tests/redirects.test.mjs`.

## 4. Tested flows & results (this environment)

| Check | Command | Result |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | 0 errors |
| Lint | `npm run lint` | 0 errors (27 warnings — six react-hooks v7 rules deliberately pinned to warn, documented in NEXT_16_UPGRADE_REPORT.md) |
| Unit tests (redirect safety, role home) | `npm test` | 8/8 pass |
| RLS harness (triggers, select boundaries, write denials, all 8 RPCs, service-role bypass) | `node scripts/rls-check/run.mjs` | **42/42 PASS** on PostgreSQL 18.4 (`RLS_TEST_RESULTS.md`) |
| pgTAP mirror for `supabase test db` | written, needs Docker | not executable in this sandbox — owner runs it (SETUP §2) |
| Production build | `npm run build` | PASS — 39 routes + `ƒ Proxy (Middleware)` detected |
| Phase 1 preservation smoke (all customer/business/auth routes render in Demo mode) | `node scripts/smoke-routes.mjs` | 39/39 PASS |

**Requires the owner's Supabase/Resend credentials (staging checklist in
SETUP §7):** real email delivery, confirmation/OTP/reset round-trips,
invitation email + accept journey, cross-tenant URL probing, PWA signed-in
behaviour. No live Supabase project existed in this sandbox; everything above
was proven against a real PostgreSQL with the exact migrations, plus build/
type/lint/smoke of the app layer.

## 5. Known limitations & deliberate decisions

1. **Mock data remains the app's content** — real auth now decides *who is in*,
   but dashboards still show Phase 1 mock sales/points/rewards until the next
   slices migrate them (spec instruction).
2. **Section-level role enforcement** currently covers Settings/Staff
   (owner-only) in the business area; finer per-section restrictions arrive
   with the data slices that own each section. RLS already enforces the data
   boundary regardless of UI.
3. **Invitation tokens** are 32 random bytes, stored as SHA-256 hashes,
   single-use, bound to the invited email, expiring 1–720h (UI offers 24h/72h/7d).
4. **Expiry is enforced at accept time**; DB status stays `pending` and the UI
   derives "expired" — a raising RPC's side effects would roll back, so this
   avoids phantom state (documented in `RLS_POLICIES.md`).
5. **One business per viewer is assumed in UI** (`LiveTeamPanel` uses the
   first membership); guards/RPCs are multi-tenancy-safe already.
6. **Phone/SMS OTP removed from the prototype UI** (replaced by Email OTP)
   per spec; no SMS provider is configured anywhere.
7. **Realtime & storage** untouched (no publication, no buckets) — next slices
   design those with their own authorization stories.
