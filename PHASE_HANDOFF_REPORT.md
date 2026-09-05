# PHASE HANDOFF REPORT → NEXT VERTICAL SLICE

Phase 2 Step 2 → Step 3 (server-authoritative sales, inventory, immutable
points ledger) · deliverable 8 of 8

---

## 1. State at handoff

- **Branch:** `arena/01a07266-ambika-electricals` (from `main` @ `04de463`).
- **Commits:** Stage A (Next 16.3.4/React 19 upgrade) → Stages B–D (Supabase
  structure, migrations, RLS + proofs) → Stages E–F (proxy protection, real
  auth UI, invitations/member management). Working tree clean.
- **Stack:** Next 16.3.4 (App Router, `src/proxy.ts`), React 19.2.8, TS 5.9.3,
  ESLint 9 flat config, Tailwind, @supabase/ssr 0.12.6, supabase-js 2.115,
  Supabase CLI 2.116 (devDep). No ORM — SQL migrations only.
- **Verification (all green in this sandbox):** tsc 0 errors · lint 0 errors
  (27 pinned warnings) · `npm test` 8/8 · RLS harness **42/42** on PostgreSQL
  18.4 · `next build` 39 routes + Proxy · smoke 39/39 in Demo mode.
- **Awaiting owner:** Supabase/Resend accounts, keys, DNS, dashboard settings
  (`OWNER_ACTION_CHECKLIST.md`), then the staging test checklist
  (`SETUP_SUPABASE_AND_RESEND.md` §7) and `npx supabase test db` on a Docker
  machine.

## 2. What the next slice can build on (ready-made)

1. **Trusted identity everywhere.** Server components/actions call
   `getViewer()` / `requireViewer()` (`src/lib/auth/session.ts`) — per-request
   cached; returns profile, business memberships + roles, customer
   memberships. The proxy already refreshes sessions on every request.
2. **Tenant model.** `businesses → stores → business_memberships /
   store_memberships / customer_memberships` exist with per-business random
   membership numbers, status lifecycles (no deletes), and RLS. The loyalty
   slice plugs the points ledger onto `customer_memberships` exactly as
   designed (see `RLS_POLICIES.md` §"deliberate decisions").
3. **The RPC pattern to copy.** All mutations run as SECURITY DEFINER functions
   that re-check `auth.uid()`, role (`business_role`, `role_at_least`),
   tenancy, and write `write_audit` rows on success. Copy
   `create_invitation`/`accept_invitation` as the template for
   `record_sale`/`redeem_reward`. Denials raise typed markers
   (`not_authorized`, `*_not_found`, …) and are audited by the calling server
   action with the client IP (`team-actions.ts` shows the whole pattern:
   classify → friendly message → `auditDenial`).
4. **Audit infrastructure.** `audit_logs` (FK-free, immutable, owner-readable,
   service-role writable) already records invitation/membership events. Sales
   and ledger events append to the same table with new `action` names.
5. **Test infrastructure.** `scripts/rls-check/` (stubs + assertions + runner)
   and `supabase/tests/rls_policy_tests.sql` (pgTAP) — add new cases per new
   table/RPC in the same commit; both suites run against any PostgreSQL.
6. **Money/points semantics decided:** ₹100 → 10 points, 1 point = ₹0.10, no
   expiry. UI copy now matches (points-card, settings). Ledger design should
   store integer points; derive ₹ at display time.
7. **Demo-mode preservation pattern.** Every new real feature must degrade to
   the mock: `isSupabaseConfigured()` gates data access, `isDemoAuthEnabled()`
   gates demo affordances, and the mock services (`src/lib/services`) keep the
   Phase 1 journey intact until its slice migrates.

## 3. What must NOT change / regress

- Mock sales, inventory, points, rewards, redemptions, QR demo, campaigns,
  challenges, referrals keep working (spec: Phase 1 flows preserved until
  their own slice migrates them).
- No Prisma/ORM; migrations stay the single source of truth.
- No phone/SMS OTP.
- RLS invariants: fail-closed grants, no DELETE policies, `audit_logs` stays
  FK-free and immutable, `profiles` rows only via the auth trigger, membership
  mutation only via RPCs.
- Secrets never in Git/browser bundles; service-role only via
  `src/lib/supabase/admin.ts`.
- The pinned ESLint warnings (react-hooks v7 rules) are deliberate — see
  `NEXT_16_UPGRADE_REPORT.md`; don't "fix" them silently in a data slice.

## 4. Recommended sequence for Step 3

1. **Points ledger first** (immutable `point_entries`: earn/burn/adjust with
   idempotency keys, `customer_memberships` FK, balance view; RPCs
   `award_points`/`spend_points` — staff+ can award, spend needs manager+ or
   POS scope). It unblocks sales and redemptions and is the spec's named next
   slice.
2. **Server-authoritative sales** (`sales` + `sale_items` tied to stores,
   staff attribution, customer membership; RPC computes points via the ledger
   — never client-computed).
3. **Inventory** (`products` with per-store stock; movements table; sales
   decrement inside the same RPC transaction).
4. Then reward redemption against real balances, production QR (signed
   membership codes), and only then realtime/storage slices.

Each step: migration + RLS + rls-check cases + pgTAP cases + UI swap behind
`isSupabaseConfigured()` + smoke re-run + docs update.

## 5. Known gaps / watch items for the next agent

- `LiveTeamPanel` assumes one business per viewer (first membership); multi-
  business UI selector is future work (RPCs are already multi-tenant safe).
- The pgTAP suite has never executed (no Docker in the sandbox) — run it first
  thing on a Docker machine and fix any environment-only issues before
  extending it.
- Business/customer profile *display* data in shells is still mock (e.g. owner
  name in the business header) — swap to `getViewer().profile` when the
  business-profile slice lands.
- Rate-limit values are Supabase defaults; re-check after launch traffic.
- `/auth/confirm` accepts a `next` param but always validates through
  `safeReturnTo` — keep every new redirect surface on that helper.
- Seed data (`supabase/seed.sql`) is dev-only by construction (aborts on
  non-empty DB, `.local` emails, invalid password hashes) — never link `db
  reset` at staging/production.

## 6. Reproduction quick reference

```bash
npm ci
npm run lint && npx tsc --noEmit && npm test      # static checks
npm run build && npm start                        # 39 routes, Proxy active
BASE_URL=http://localhost:3000 node scripts/smoke-routes.mjs   # demo-mode smoke

# RLS harness (any PostgreSQL ≥15 with pgcrypto; env overrides in run.mjs):
PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres PGPASSWORD=postgres \
  node scripts/rls-check/run.mjs                  # expect 42/42 PASS

# With Docker (owner machine):
npx supabase start && npx supabase db reset && npx supabase test db
```

**Stop condition honored:** all 8 deliverables are complete; the agent stops
here for owner approval before beginning the next Phase 2 slice.
