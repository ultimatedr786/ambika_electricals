# PHASE HANDOFF REPORT → NEXT VERTICAL SLICE

Phase 2 Step 2 → Step 3 (server-authoritative sales, inventory, immutable
points ledger) · deliverable 8 of 8

---

## ADDENDUM (2026-09-06) — Slice 1 delivered: immutable points ledger

Item 1 of §4 below is **implemented and proven**:
`supabase/migrations/20260906120000_points_ledger.sql` adds append-only
`points_ledger` (+ `customer_points_balance` transactional cache per
architecture proposal §A4), the RPCs `award_points` (staff+, store-scope
aware), `spend_points` (manager+, no overdraw), `adjust_points` (owner-only,
reason mandatory), `point_balance`, idempotency-key replay safety, full audit
events (`points.awarded/redeemed/adjusted`) and RLS (own-memberships for
customers, business-wide for staff+, SELECT-only grants, double-locked
immutability). Seed now carries ledger history (Rahul 420 pts, Priya 150 pts).

## ADDENDUM 2 (2026-09-06) — Slice 2 delivered: server-authoritative sales

Item 2 of §4 is **implemented and proven**:
`supabase/migrations/20260906130000_sales.sql` adds `sales` + `sale_items`
(snapshot lines) + `sale_payments` (split-ready, `points` method reserved for
redemptions) + locked per-business `invoice_counters`, launch-policy earn
columns on `businesses` (₹100 → 10 pts), and the RPCs `create_sale`
(staff+, store-scope aware, server-computed totals, exact-payment validation,
idempotent replay, atomic ledger earn + `sale.created` audit) and `void_sale`
(manager+, reason required, status flip + compensating adjust entry — never a
delete). Documented deviations from proposal §8.1 (snapshot pricing until the
products slice, policy columns until rule sets, row-level idempotency) are in
`RLS_POLICIES.md` §6 and the migration header.

UI landed with the slice (real-mode sections, prototype flows kept and
labeled): `sales-actions.ts` server actions (denial-audited like
`team-actions.ts`), **Live POS** on `/business/sales/new` (store picker with
scope filtering, member search + inline RLS-guarded enrollment, cart with
server-authoritative totals preview, exact-total payment, points preview,
receipt from the RPC), **Live sales** on `/business/sales` (recent rows,
manager+ void with mandatory reason) and a **Live points** card on the
customer dashboard (own-membership balance, lifetime stats, last ledger
entries).

Proof: harness **61/61** (new SA1–SA9, `RLS_TEST_RESULTS.md` Runs 2–3);
pgTAP mirror at **87 assertions**; tsc/lint clean (warnings match
pre-existing app-wide idioms), unit tests 8/8, build + 39/39 route smoke.

## ADDENDUM 3 (2026-09-06) — Slice 3 delivered: catalogue + inventory

Item 3 of §4 is **implemented and proven**:
`supabase/migrations/20260906140000_inventory.sql` adds `products`
(RPC-only writes, archived-never-deleted, GIN search), `inventory_by_store`
(the current picture; store-scoped staff see only their stores) and
append-only `inventory_movements` (double-locked immutability, per-business
idempotency keys, `balance_after` reconciliation), the internal
`inventory_move` mover (EXECUTE revoked, like `ledger_post_entry`) and the
RPCs `create_product` / `update_product` / `receive_stock` / `adjust_stock`
(all manager+, reason-guarded adjustments, replay-safe). `create_sale` v2
re-prices catalogue lines server-side (staff overrides refused, manager
overrides flagged `price_overridden` + audited), validates and decrements
stock under the proposal's deterministic lock order (balance → inventory by
product_id → invoice counter), and `void_sale` v2 restocks via compensating
`sale_void` movements. Seed carries the launch catalogue (6 Ambika products
mirroring the mock data + 1 Volt product) with opening stock and `initial`
movements.

Proof: harness **69/69** (new INV1–INV8, `RLS_TEST_RESULTS.md` Run 4); pgTAP
mirror at **107 assertions** (SA-series identities hardened — no assertion
depends on leftover claim GUCs). UI landed with the slice: inventory
management panel on `/business/products` (manager+ create/receive/adjust,
staff read-only) and the live POS now picks catalogue products (server
re-prices; manual snapshot lines remain for non-catalogue items).

Next: redemptions + rewards catalogue (`rewards`, `reward_inventory` holds,
`redeem_reward` spending points through the ledger, collection codes), then
production QR (signed membership codes) per §4, and the rule engine replacing
the launch-policy columns. (Correction 2026-09-06: this line originally said
"then GST/tax" — proposal decision D12 keeps GST invoicing in the existing
billing software unless separately scoped; it is not a §4 slice.)

## ADDENDUM 4 (2026-09-06) — Slice 4 delivered: rewards + redemptions

Item 4 of §4 is **implemented and proven**:
`supabase/migrations/20260906150000_rewards_redemptions.sql` adds `rewards`
(manager-curated catalogue, archived never deleted), `reward_inventory`
(store rows preferred over the business-wide pool; no rows = unlimited;
`on_hand ≥ reserved`), `redemptions` + `redemption_items` snapshots and the
internal `redemption_counters` sequence behind `RDM-####` references, and
the RPCs `create_reward` / `update_reward` / `set_reward_inventory`
(manager+), `redeem_reward` (self or staff+; store-scoped staff confined to
their stores; rolling-30-day limit; spends points through an idempotent
`redeem` ledger entry; reserves the exact inventory row — pinned on the
redemption as `inventory_scope`), `collect_redemption` (staff+; §8.4 codes —
8 Crockford base-32 chars from 40 random bits, only sha256 + last4 stored,
I/L/O normalized to 1/1/0, plaintext returned exactly once) and
`cancel_redemption` (manager+ or the member themself; reason required;
refund through an idempotent compensating `adjust` entry). Expiry is lazy:
the next collect/cancel touch marks the redemption expired, releases the
hold, audits — and RETURNS `expired` instead of raising (a raise would roll
the marking back); invalid-code denial audits live in the server actions for
the same reason. Seed carries the launch reward catalogue (5 Ambika +
1 Volt reward with per-store/pool inventory).

UI landed with the slice: the business Rewards page gains a live panel
(create/edit/archive, per-store + pool stock, counter redemption with the
one-time-code dialog, collection queue with code entry, manager cancel) and
customers gain a live rewards store (self-redemption against the real
balance) plus a live redemption history (reference + ••••last4 — the full
code is deliberately never re-readable — and self-cancel with refund). All
behind `isSupabaseConfigured()`; prototype surfaces stay and are labeled.

Proof: harness **78/78** (new RE1–RE9, `RLS_TEST_RESULTS.md` Run 5); pgTAP
mirror at **155 assertions**, executed locally for the first time through
the new `scripts/rls-check/pgtap-run.mjs` stub runner (which also fixed a
pre-existing plan(107) undercount — the series really execute 109); tsc/lint
clean (warnings match pre-existing app-wide idioms), unit tests 8/8, build +
39/39 route smoke.

Next per §4: production QR (signed membership codes), then the
realtime/storage slices. The loyalty rule engine
(`loyalty_rules`/`rule_versions`/`rule_sets`) replacing the launch-policy
columns is the designed follow-up on the loyalty track. GST invoicing is
**not** a slice here: proposal decision D12 keeps billing (and GST
invoice-of-record) in the business's existing software unless it is
separately scoped as its own workstream.

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
