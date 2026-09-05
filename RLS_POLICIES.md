# ROW LEVEL SECURITY — POLICY DOCUMENTATION (Phase 2 Step 2, Stage D)

All authorization is **fail-closed**: RLS is enabled on every application table, no table is
public, `anon` holds no grants at all, and mutations of memberships/invitations/audit happen
exclusively through `SECURITY DEFINER` RPCs that re-check the caller and write audit events.

Migrations: `supabase/migrations/20260905120200_rls_policies.sql`
Tests: `supabase/tests/rls_policy_tests.sql` (pgTAP, `supabase test db`) and
`scripts/rls-check/` (plain-SQL harness — runs on any PostgreSQL, used in CI).

## 1. Identity source

Every policy keys off `auth.uid()`, which Supabase derives from the **signed JWT** — never from
request bodies, query params or cookies the browser controls. Manipulating a `business_id` in the
URL or client store cannot widen access: the row simply does not match the policy predicate.

Role helpers (`SECURITY DEFINER`, fixed `search_path`, no policy recursion):

| Function | Purpose |
| --- | --- |
| `business_role(business_id)` | Caller's active role in one business |
| `my_businesses(min_role)` | Businesses where caller holds ≥ `min_role` |
| `role_rank` / `role_at_least` | Constrained role ordering `customer < staff < manager < owner < super_admin` |
| `is_store_assigned(store_id)` / `my_stores()` | Store scoping for staff |
| `shares_business_with(profile, min_role)` / `shares_store_with(profile)` | Peer-profile visibility |
| `is_super_admin()` | Platform-role check |

## 2. Policy matrix (who sees/does what)

| Table | customer | staff | manager | owner | Notes |
| --- | --- | --- | --- | --- | --- |
| `profiles` SELECT | own | own + same-store peers | own + business peers | own + business peers | peers via definer helpers |
| `profiles` UPDATE | own, safe columns only | ← same | ← same | ← same | column grant limited to `display_name, phone, avatar_url, avatar_meta, updated_at`; **email/status not updatable** (auth-owned / admin-owned) |
| `profiles` INSERT | — | — | — | — | only via `handle_new_user` trigger on `auth.users` |
| `businesses` SELECT | — | own business | own business | own business | |
| `businesses` UPDATE | — | — | ✗ | own business | creation only via `complete_business_signup` RPC; no DELETE anywhere (lifecycle = `status`) |
| `stores` SELECT | — | **only assigned stores** | all in business | all in business | |
| `stores` INSERT/UPDATE | — | ✗ | ✗ | own business | no DELETE (soft-close via `is_active`) |
| `business_memberships` SELECT | — | own row | whole business | whole business | writes **only** via RPCs (`accept_invitation`, `change_member_role`, `remove_member`) |
| `store_memberships` SELECT | — | own row | whole business | whole business | writes **only** via RPCs (`assign/unassign_member_to_store`, `accept_invitation`) |
| `customer_memberships` SELECT | **own row only** | whole business directory (POS lookup) | whole business | whole business | a customer never sees another customer |
| `customer_memberships` INSERT | ✗ | own business (enrollment) | own business | own business | |
| `customer_memberships` UPDATE | ✗ | ✗ | own business | own business | staff edits arrive with the POS vertical slice |
| `invitations` SELECT | ✗ | ✗ | ✗ | own business | plus: a *pending* invitation is visible to the profile whose email it targets (accept-page context). Token is hash-only — reading never enables accepting |
| `invitations` writes | — | — | — | — | RPC-only (`create/revoke/accept_invitation`) |
| `audit_logs` SELECT | ✗ | ✗ | ✗ | own business (+ `super_admin` for platform events) | INSERT/UPDATE/DELETE: no grants **and** an immutability trigger that rejects mutation even for the table owner; written only by definer RPCs / service role |
| `points_ledger` SELECT | **own memberships' entries only** | whole business | whole business | whole business | APPEND-ONLY: no INSERT/UPDATE/DELETE grants for API roles **and** an immutability trigger rejecting mutation even for postgres; written only by `award/spend/adjust_points` RPCs; insert trigger enforces membership/business/store integrity + active status |
| `customer_points_balance` SELECT | own memberships | whole business | whole business | whole business | transactional cache of the ledger (never authoritative); no DML grants — maintained inside the ledger RPC transactions only |
| `sales` SELECT | **own sales only** (via own memberships) | whole business | whole business | whole business | writes RPC-only (`create_sale`/`void_sale`); voiding flips `status` — rows are never deleted |
| `sale_items` / `sale_payments` SELECT | follows parent sale (`EXISTS` into RLS-filtered `sales`) | ← same | ← same | ← same | no DML grants; snapshot columns (`name/sku/price`) until the products slice adds server re-pricing |
| `invoice_counters` | ✗ | ✗ | ✗ | ✗ | internal per-business sequence, locked inside `create_sale`; no grants, no policies |
| `products` SELECT | ✗ (until the rewards slice adds a customer catalogue view) | whole business | whole business | whole business | writes RPC-only (`create_product`/`update_product`); archived, never deleted |
| `inventory_by_store` SELECT | ✗ | **own stores when store-scoped**, else whole business | whole business | whole business | proposal §Store-scoped: the policy inherits the `stores` RLS scoping; writes RPC-only |
| `inventory_movements` SELECT | ✗ | whole business | whole business | whole business | append-only operational history — no grants + trigger, corrections are compensating movements |

Cross-tenant: every predicate is `business_id ∈ my_businesses(...)` or an ownership/store
membership check — a user of business A gets **zero rows** from business B for any identifier they
supply (proven by tests A3/A6/A7).

## 3. Grant floor (belt & braces under the policies)

`authenticated` receives only: SELECT on all tables (+ the narrow `profiles` column-update grant),
INSERT/UPDATE on `stores` and `customer_memberships` — both row-gated by owner/manager(+staff)
policies. `points_ledger` and `customer_points_balance` are SELECT-only at grant level; every
write path is an RPC. No DELETE grants exist anywhere. `anon` receives nothing; new tables default to
no-grant (`ALTER DEFAULT PRIVILEGES … REVOKE`). `service_role` retains full access for trusted
server operations and **must never appear in a browser bundle** (enforced by `server-only` imports
in `src/lib/supabase/admin.ts`).

## 4. Server-authorized operations (RPC) and their audit events

| RPC | Who may call | Guards | Audit |
| --- | --- | --- | --- |
| `complete_business_signup` | any signed-in profile | idempotent; returns existing membership if present | `business.created`, `membership.created` |
| `create_invitation` | owner only | role ∈ {manager,staff}; 1–720h expiry; store must belong to business; one pending invite per email (case-insensitive) | `invitation.created` |
| `revoke_invitation` | owner only | pending only | `invitation.revoked` |
| `accept_invitation` | signed-in invitee | single-use token (SHA-256 hash lookup); explicit errors for revoked / already-used / expired; **accepting account email must equal invited email** | `invitation.accepted` |
| `change_member_role` | owner only | cannot change own role; cannot touch another owner (platform action) | `membership.role_changed` |
| `remove_member` | owner only | cannot remove self or owners; cascades store assignments | `membership.removed` |
| `assign/unassign_member_to_store` | owner only | target must be an active business member | `store_assignment.created/removed` |
| `award_points` | staff+ of the business | membership active & in-business; store in-business; **store-scoped staff confined to their stores**; positive points; `(business, idempotency_key)` replay-safe (returns original entry, race-safe via unique-violation catch) | `points.awarded` |
| `spend_points` | manager+ | same membership/store guards; stores points negative; refuses to overdraw (`insufficient_points`) | `points.redeemed` |
| `adjust_points` | owner (or platform `super_admin`) | non-zero signed points; **reason mandatory**; may not push balance negative; corrections are appended, never edits | `points.adjusted` |
| `point_balance` | anyone who may SELECT the cache | SECURITY INVOKER — RLS decides; 0 when nothing earned yet | — |
| `create_sale` | staff+ of the store's business | store-scoped staff confined to their stores; member must be active & in-business; items/payments validated and **totals computed server-side**; payments must equal total exactly; per-business sequential invoices under a locked counter; idempotency-key replay returns the stored sale; member sales post a `sale`-sourced ledger earn (launch policy ₹100→10 pts, floor on paise) | `sale.created` (+ `points.awarded` via ledger) |
| `void_sale` | manager+ | reason required; only `completed` sales; never deletes — flips status and **reverses points with a compensating `adjust` entry** (idempotent on `sale-void:<id>`) | `sale.voided` (+ `points.adjusted`) |
| `create_product` | manager+ | sku normalized (upper/trim) + unique per business; optional opening stock `[{store_id, qty}]` posted as `initial` movements (store must be in-business) | `product.created` |
| `update_product` | manager+ | partial update; price ≥ 0; status `active`/`archived` only (never deleted); price changes land in the audit | `product.updated` (price before/after) |
| `receive_stock` | manager+ | qty > 0; product must be active & in-business; replay-safe on the idempotency key (a replay never re-audits) | `stock.received` |
| `adjust_stock` | manager+ | signed non-zero delta; **reason mandatory** (stored as the movement note); never drives available stock negative | `stock.adjusted` |
| `create_sale` v2 | staff+ | Slice-2 semantics **plus**: catalogue lines are re-priced from `products.price_paise` (a differing client price is refused unless manager+ — line flagged `price_overridden`, audited); catalogue lines need whole units; stock is validated and decremented through `inventory_move` under the deterministic lock order *balance → inventory (by product_id) → invoice counter* | `sale.created` (+ `stock_lines`/`price_overrides` in metadata) |
| `void_sale` v2 | manager+ | Slice-2 semantics **plus**: catalogue lines are restocked with compensating `sale_void` movements (idempotent per sale+product) | `sale.voided` (+ `stock_lines_restored`) |
| `inventory_move` | — internal — | EXECUTE revoked from API roles (like `ledger_post_entry`); locks the stock row, enforces `on_hand ≥ reserved`, appends the movement with `balance_after`, replay-safe on the per-business key | — |

**Denial auditing:** a SQL statement that raises rolls back everything it wrote, so *denied*
attempts (`invitation.create_denied`, `invitation.accept_denied`, …) are recorded by the calling
**server action**, which catches the typed error and writes the audit row through the admin client
— with the real client IP, which SQL never sees. Accepted/succeeded operations are audited in-SQL.

Invitation expiry is enforced at every accept attempt (`expires_at < now()` ⇒ reject); the stored
`status` stays `pending` and UIs derive “expired” from `expires_at` — no background sweeper needed
for correctness.

## 5. Test coverage & results

`scripts/rls-check/10_assertions.sql` — **69 cases, 69 passed** (Step 2 suite executed 2026-09-05;
ledger + sales + inventory suites 2026-09-06, against PostgreSQL 18.4 with the real migrations +
seed; see `RLS_TEST_RESULTS.md` for all logs):

- **S1–S9** schema: profile bootstrap trigger, email-sync trigger, membership-no generation/format,
  cross-tenant FK-consistency trigger, uniqueness constraints, one-pending-invite rule, invitation
  role check, audit immutability (UPDATE **and** DELETE rejected even as owner).
- **A1–A11** reads: anon denied everywhere; owner/manager/staff/customer visibility per matrix;
  store scoping (staff sees only assigned store); cross-tenant probes return nothing; customers see
  only their own membership/profile; audit + invitations owner-only.
- **W1–W7** writes: own-profile safe-column update (email/status denied by grant); manager cannot
  edit business settings; staff/manager cannot create stores; staff cannot flip membership status;
  customers cannot self-enroll; direct membership/invitation/audit writes denied even for owners.
- **R1–R14** RPCs: anonymous calls rejected; owner invite flow (raw token returned once, hash-only
  storage, duplicate rejection); accept binds exactly the intended business/store/role; tokens
  single-use; email-mismatch rejection; expired & revoked rejection; owner-only role change /
  member removal / store assignment with audit rows; `complete_business_signup` creates a tenant
  once and is idempotent.
- **V1** service_role bypass for trusted server operations.
- **INV1–INV8** inventory: manager-only product creation with opening stock posted as `initial`
  movements (staff/customers/other tenants 42501, duplicate sku refused); catalogue lines are
  re-priced server-side (client name/price ignored — staff overrides refused 22023, manager
  overrides flagged + audited) and decrement stock; oversell and fractional catalogue quantities
  refused with nothing persisted; receive/adjust are manager+, reason-guarded, replay-safe
  (one movement per key) and cross-tenant-safe; archived products reject receipts; voiding a sale
  restocks via `sale_void` movements; `inventory_movements` immutable (trigger refuses postgres,
  grants refuse API roles); store-scoped staff see only their stores' stock while managers see the
  business; customers/other tenants see no catalogue at all; no DML grants — even owners can't
  write products or stock directly.
- **SA1–SA9** sales: member sale keeps totals/points/invoice/payment/ledger/cache/audit in sync
  (₹1,250 → 125 pts); walk-ins earn nothing; customers, other tenants and store-scoped staff
  refused (42501) while scoped staff may sell at their own store; payment mismatch / bad method /
  zero qty / over-subtotal discount / empty cart refused (22023) with nothing persisted;
  idempotency-key replay returns the stored sale without double-posting; invoice counters are
  sequential per business and independent per tenant; void is manager+, reason-required, reverses
  points via a compensating adjust entry and is final; customers see only their own sales (items
  follow the parent), never cross-tenant; no DML grants — even owners cannot insert sales directly.
- **L1–L10** points ledger: staff award with cache/balance/audit in sync; customers and
  other-tenant owners denied (42501); store-scoped staff confined to their stores; idempotency-key
  replay never double-posts; manager-only spends stored negative with lifetimes updated; overspend
  refused (`insufficient_points`, 22023); owner-only adjustments require a reason and cannot
  overdraw; append-only enforced twice (no DML grants → 42501, immutability trigger → 22023 even
  for postgres); RLS visibility own-memberships / whole-business / never cross-tenant; insert
  guards reject business-mismatched, foreign-store and blocked-membership entries.

`supabase/tests/rls_policy_tests.sql` (pgTAP, 107 assertions) mirrors the same matrix for
`supabase test db` on the CLI stack. It could not be executed in the build sandbox (no Docker);
the plain-SQL harness proves identical boundaries on stock PostgreSQL.

## 6. Deliberate decisions / future slices

- No Realtime publication entries for these tables — nothing broadcasts auth/tenancy data yet;
  realtime authorization is designed with its own slice.
- No Storage buckets yet (product image migration is a later slice).
- Manager scoped permissions (e.g. managing staff for assigned stores) are **not** granted by
  default — “never owner-only controls unless explicitly granted” (spec 2.x). Extending managers
  means adding an explicit policy/RPC guard in a reviewed migration.
- Customer loyalty records: the **points ledger slice is implemented** (`points_ledger` +
  `customer_points_balance`, RPC-only writes) exactly on the `customer_memberships` pattern —
  own-rows-only for customers, business-scoped for staff+. Redemptions, sales-driven awarding and
  the loyalty rule engine (`loyalty_rules`/`rule_versions`/`rule_sets`) arrive with their own
  slices; `rule_set_id` and reward tables were deliberately not pre-created here.
- Ledger `expires_on` exists but is unused: the launch policy is **no points expiry** (spec §2.5).
- Sales slice deviations from proposal §8.1 (documented in the migration header): line prices are
  POS-supplied **snapshots** until the products/inventory slice adds server re-pricing and stock
  validation; points come from `businesses.earn_spend_paise/earn_points` (launch policy) instead
  of published `loyalty_rule_sets`; idempotency lives on the sale row (unique business+key)
  instead of a generic `idempotency_keys` table — same replay guarantee, less machinery.
  `sale_items.points_awarded` stays 0 until per-line rule pricing exists.
- Inventory slice deviations: `product_categories`/`product_images`/`brand` deferred (free-text
  category/subcategory + `art_key` cover the launch UI); `reserved` stays 0 until redemptions add
  holds; movements carry `balance_after` + per-business idempotency keys (points_ledger pattern)
  and FK-free `created_by`; the customer-facing catalogue view arrives with the rewards slice;
  catalogue-backed sale lines need whole units (integer movement deltas) — fractional units
  (wire per metre) stay snapshot-only until a units slice.
- `actor_profile_id` on the ledger is FK-free on purpose (audit_logs precedent): deleting a staff
  auth user must never be blocked by — or silently rewrite — financial history.
