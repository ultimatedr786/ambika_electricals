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
| `rewards` SELECT | **active rewards** of businesses where they hold an active membership | whole business | whole business | whole business | writes RPC-only (`create_reward`/`update_reward`); archived, never deleted |
| `reward_inventory` SELECT | ✗ | whole business | whole business | whole business | no rows = unlimited; store row preferred over the `store_id`-null pool row; holds change only inside the redemption RPCs; no DML grants |
| `redemptions` SELECT | **own redemptions only** | whole business | whole business | whole business | writes RPC-only (`redeem_reward`/`collect_redemption`/`cancel_redemption`); lifecycle status flips — never deleted; collection codes stored **sha256 + last4 only** (§8.4) |
| `redemption_items` SELECT | follows parent redemption (`EXISTS` into RLS-filtered `redemptions`) | ← same | ← same | ← same | reward name/points snapshot at redeem time |
| `redemption_counters` | ✗ | ✗ | ✗ | ✗ | internal per-business `RDM-####` sequence, locked inside `redeem_reward`; no grants, no policies |
| `membership_qr_tokens` | ✗ | ✗ | ✗ | ✗ | **no SELECT for anyone but `service_role`** — the row holds the salted sha256 verifier of a live checkout code; issue/verify/revoke happen entirely inside the definer RPCs |
| `qr_verification_attempts` SELECT | ✗ | ✗ | whole business | whole business | security trail of every scan (success and failure). Append-only: no DML grants **and** a trigger that rejects UPDATE/DELETE even for postgres. Deliberately invisible to cashiers so the trail cannot be shoulder-audited at the counter |
| `loyalty_rules` SELECT | own businesses (active membership) | whole business | whole business | whole business | the rule *series*; writes RPC-only (`set_loyalty_rule`) |
| `loyalty_rule_versions` SELECT | **only the version in force right now** | whole history | whole history | whole history | immutable economics + effective window. A trigger rejects any UPDATE touching `earn_*`, `point_value_paise`, `min_spend_paise`, `points_expiry_days`, `effective_from` or `version`, and refuses to reopen a closed window; only `effective_to`/`status`/`notes` move. Deletion is blocked by grants (it must still cascade with its business) |

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
| `create_reward` | manager+ | name/type/points/expiry validated; `max_per_customer_per_month` ≥ 1 when set | `reward.created` |
| `update_reward` | manager+ | partial update; archived never deleted; **archiving refused while pending redemptions exist** | `reward.updated` |
| `set_reward_inventory` | manager+ | on_hand ≥ 0; cannot drop below the current reserved hold (`inventory_reserved_conflict`) | `reward.inventory_set` |
| `redeem_reward` | the member themself **or** staff+ | store-scoped staff confined to their stores; rolling-30-day limit; reserves the exact inventory row (store → pool → unlimited) and records `inventory_scope`; points spent through a `redeem` ledger entry (idempotent on `redemption:<id>`); the plaintext code is returned **once** (replays carry `code: null`); lock order *balance → inventory → counter* | `redemption.created` |
| `collect_redemption` | staff+ | Crockford-normalizes the code (I/L/O → 1/1/0) then sha256-matches; lazy expiry marks + releases + audits and then **returns** `expired` (a raise would roll the marking back); debits exactly the reserved row | `redemption.collected` (+ `redemption.expired`) |
| `cancel_redemption` | manager+ **or** the member themself | **reason required**; pending only; refunds with a compensating `adjust` entry (idempotent on `redemption-cancel:<id>`); releases the hold from exactly the reserved row; lazy expiry as in collect | `redemption.cancelled` (+ `redemption.expired`) |
| `issue_membership_qr_token` | the signed-in customer | resolves the caller's own active membership (never a client-supplied one); TTL clamped 30–300 s (default 90); **10 issues per minute per membership** (`rate_limited`); minting revokes the previous live token (`revoke_reason = superseded`); only `sha256(salt‖secret)` is stored — the secret exists once, in the response | `membership_qr.issued` (selector + TTL only) |
| `verify_membership_qr_token` | staff+ of the token's business | **authorization first**: business role, then store scoping (`store_not_in_business` / `store_forbidden`) — lifecycle detail is never revealed to someone who may not scan. Then constant-shape checks: malformed / unknown selector / wrong secret all return the same `qr_invalid`. Single use via a conditional `UPDATE … where consumed_at is null and revoked_at is null`, so concurrent scans cannot both win. **40 verifies per minute per staff profile.** Returns `{ok:false, reason}` instead of raising — see note below | `membership_qr.verified` / `membership_qr.verify_denied` / `membership_qr.verify_failed` / `membership_qr.rate_limited` + a `qr_verification_attempts` row on **every** branch |
| `revoke_membership_qr_tokens` | the signed-in customer | "hide my QR" / lost device: revokes every live token of the caller's memberships, returns the count | `membership_qr.revoked` (one row per affected business, token count + reason, no selector) |
| `set_loyalty_rule` | **owner only** | business resolved from the caller's own memberships (a supplied id can only disambiguate between businesses they already own); validates spend ₹1–₹1,00,000, points 0–1000, point value ≤ ₹100, non-negative minimum spend; **backdating refused** (it would re-price settled history) and no start beyond 365 days; locks the series, closes the open version at the new start and appends version N+1 — never rewrites | `loyalty_rule.version_created` (new economics + the previous version's under `from`) |
| `current_loyalty_rule` | any authenticated reader | SECURITY INVOKER — RLS decides; returns the version in force now | — |
| `active_loyalty_rule_version` | — internal — | EXECUTE revoked from every API role (like `ledger_post_entry`/`inventory_move`); resolves `effective_from <= at < coalesce(effective_to, infinity)` for the business's `default` series | — |
| `loyalty_points_for` | any authenticated reader | pure evaluation of one version against an eligible amount: floors on exact paise, honours the minimum spend, returns 0 for an unknown version | — |
| `create_sale` v3 | staff+ | Slice-3 semantics **plus**: the rate comes from `active_loyalty_rule_version(business, now())` instead of the dropped `businesses.earn_*` columns, and that version id is stamped on `sales.loyalty_rule_version_id`. A business with no rule fails closed (`loyalty_rule_missing`) | `sale.created` (+ `loyalty_rule_version` in metadata) |
| `ledger_post_entry` v2 | — internal — | unchanged contract; every entry whose `source_id` is a sale inherits that sale's pinned rule version, so the void reversal is stamped too | — |

**Denial auditing:** a SQL statement that raises rolls back everything it wrote, so *denied*
attempts (`invitation.create_denied`, `invitation.accept_denied`, …) are recorded by the calling
**server action**, which catches the typed error and writes the audit row through the admin client
— with the real client IP, which SQL never sees. Accepted/succeeded operations are audited in-SQL.

The QR slice takes the *other* branch of that same rule: `verify_membership_qr_token` must leave a
security trail **and** feed a rate limiter, and both live in the rows it writes. A raise would roll
them back, so verification failures **return** `{ok:false, reason}` and only a missing session
raises (`authentication_required`, 28000). Every branch — invalid, expired, already-used, revoked,
business mismatch, not authorized, rate limited — inserts a `qr_verification_attempts` row and an
audit event **keyed by the selector only**; the secret half of the token is never logged, never
audited and never stored in plaintext.

Invitation expiry is enforced at every accept attempt (`expires_at < now()` ⇒ reject); the stored
`status` stays `pending` and UIs derive “expired” from `expires_at` — no background sweeper needed
for correctness.

## 5. Test coverage & results

`scripts/rls-check/10_assertions.sql` — **94 cases, 94 passed** (Step 2 suite executed 2026-09-05;
ledger + sales + inventory + rewards/redemptions + membership-QR + loyalty-rule suites 2026-09-06, against PostgreSQL 18.4 with
the real migrations + seed; see `RLS_TEST_RESULTS.md` for all logs):

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
- **RE1–RE9** rewards/redemptions: manager-only reward create/update/inventory-set (staff,
  customers and other tenants 42501; negative inventory, archiving with pending redemptions and
  inventory below the reserved hold refused 22023); customer self-redemption spends the exact
  points, mints an `RDM-####` reference and a one-time 8-char Crockford code (only sha256 + last4
  stored), posts the `redeem` ledger entry and reserves the exact inventory row (`inventory_scope`
  recorded); insufficient balance persists nothing at all; staff may redeem on behalf but
  store-scoped staff only at their own stores; cross-member, cross-tenant and cross-business
  redemptions refused; counter collection is staff-only and code-gated (lowercase normalized,
  wrong code refused, double-collect refused) and debits the reserved row (on_hand −qty, hold
  cleared); lazy expiry marks + releases + audits and RETURNS `expired`; cancel is manager+/own,
  reason-required, refunds via the idempotent `adjust` entry and frees the hold; monthly limits
  count pending/collected only, so a cancellation frees the slot; idempotency replays return the
  stored redemption with `code: null`; customers see active rewards + their own redemptions while
  inventory/counters stay staff-internal; no DML grants — even owners write through RPCs only.
- **QR1–QR8** membership QR: issuance returns an opaque `RWD1.<selector>.<secret>` payload that
  contains no membership number, name, phone or points, is clamped to the 5-minute hard cap and is
  stored only as `sha256(salt‖secret)` (verified against the issued secret in the test); the token
  table is unreadable even to its owner's session (42501) and re-issuing supersedes the previous
  code. An authorized cashier's scan resolves the right member, returns counter-safe fields only
  (no email/phone/enrolment payload), is audited by selector with the secret provably absent from
  `audit_logs`, and the same code is refused on replay (`qr_already_used`). Malformed, unknown and
  tampered payloads all return the identical `qr_invalid` and are recorded as failed attempts —
  while the genuine token still works afterwards, so failures never burn it. Expiry is enforced;
  foreign-tenant owners and customers get `not_authorized`, store-scoped cashiers get
  `store_forbidden` at an unassigned store and `store_not_in_business` for another tenant's store,
  and **no denial consumes the token**. Customer revocation kills the live code
  (`qr_revoked`) and the 10-per-minute issue limit trips. Grants: no SELECT/INSERT/UPDATE/DELETE
  for API roles on either table, no `anon` EXECUTE on issue/verify. Attempts are append-only
  (trigger refuses even postgres), visible to managers and invisible to cashiers.
- **LR1–LR8** loyalty rule engine: every business (existing ones by backfill, new ones by an
  AFTER INSERT trigger) starts on the launch policy — ₹100 → 10 pts, 1 pt = ₹0.10, no expiry — and
  every sale plus every sale-linked ledger entry carries the version that priced it; the hard-coded
  `businesses.earn_*` columns are gone. Rule changes are owner-only (manager, cashier, customer and
  a foreign tenant's owner all get 42501, and a denied attempt writes no version). Invalid
  configuration fails safely with nothing persisted: sub-₹1 or ₹1,00,000+ spend steps, >1000 or
  negative points, missing rates, backdated starts and starts beyond a year are all refused (22023).
  A valid edit appends v2, closes v1 at the new start (`superseded`, economics untouched), leaves
  exactly one open window and audits before/after. History is frozen: the pre-change sale keeps v1
  and its 125 points while the next sale earns 250 under v2, ledger entries inherit their sale's
  version on both sides of the change, and a below-minimum sale earns nothing. Versions are
  immutable even for `postgres` (economics, `effective_from` and reopening a closed window all
  42501) and points expiry cannot be configured while no sweeper exists (23514). Tenancy holds: the
  resolver never crosses businesses, staff read their own history, customers see only the version
  in force, and even the owner cannot INSERT a rule directly or call the internal resolver. A
  version scheduled for next week does not price today's sale — but does resolve on its date.

`supabase/tests/rls_policy_tests.sql` (pgTAP, 222 assertions) mirrors the same matrix for
`supabase test db` on the CLI stack. Docker is unavailable in the build sandbox, so the file was
additionally executed via `node scripts/rls-check/pgtap-run.mjs` — the same test file against the
harness database with stubs for the pgTAP subset it uses (plan/is/ok/matches/lives_ok/throws_ok/finish):
**222/222 passed** (2026-09-06). An earlier run also surfaced a pre-existing off-by-two `plan()` count
(the earlier series actually execute 109 assertions, not the declared 107) — now corrected.

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
  category/subcategory + `art_key` cover the launch UI); movements carry `balance_after` +
  per-business idempotency keys (points_ledger pattern) and FK-free `created_by`;
  catalogue-backed sale lines need whole units (integer movement deltas) — fractional units
  (wire per metre) stay snapshot-only until a units slice. `inventory_by_store.reserved` stays 0
  for sales (stock is decremented synchronously); holds live on `reward_inventory.reserved`
  instead — the rewards slice shipped them.
- `actor_profile_id` on the ledger is FK-free on purpose (audit_logs precedent): deleting a staff
  auth user must never be blocked by — or silently rewrite — financial history.
- Rewards slice decisions: the rewards catalogue is **standalone** — `rewards` has no FK to
  `products`; launch rewards reference catalogue items by name/`art_key` only, so a product can be
  archived without stranding a reward (and `redemption_items` snapshot the reward, never a live
  catalogue row). `cash_due_paise` exists but stays 0 until the options slice; tier-gating
  (`reward_eligibility`) and a `redemption_status_events` table are deferred — every transition is
  an `audit_logs` row with from/to in metadata. Expiry is **lazy** (marked on the next
  collect/cancel touch, which RETURNS `expired` instead of raising — a raise would roll the
  marking back) until a cron exists. Invalid-code attempts are denial-audited by the calling
  server action for the same reason. `redemptions.inventory_scope` pins the exact
  `reward_inventory` row reserved at redeem time so collect/cancel never guess candidate rows.
  Monthly limits are a rolling-30-day window counting pending/collected only. The customer-facing
  *products* catalogue view is still deferred (customers see rewards, not stock).
- Membership QR decisions: the payload is a **capability, not an identifier** — a bearer token with
  a 90-second life and a single use, so a screenshot, a shoulder-surfed photo or a shared chat
  message is worthless within seconds. Selector/secret split (rather than a signed JWT) keeps the
  verification a single indexed lookup, keeps the secret out of the database entirely and makes
  revocation instant; there is no signing key to rotate or leak. Both halves use Crockford base-32
  and the RPC normalizes I/L/O the way `collect_redemption` already does, so a code read aloud at
  the counter still verifies. Deliberately **not** in this slice: real QR image encoding and camera
  decoding (capture stays simulated per the MVP scope — staff paste or key the code, and manual
  member lookup remains the fallback), offline/queued verification, and a sweeper for consumed
  rows (they are small, indexed by `expires_at` and useful evidence; retention lands with the
  backup/retention document).
- Loyalty rule engine decisions: the versions table is the **only** source of truth — the
  `businesses.earn_spend_paise` / `earn_points` columns were backfilled into version 1 and then
  dropped in the same migration, so there is no second place a rate can hide. Supersession is
  modelled as a closed `[effective_from, effective_to)` window rather than a boolean `is_active`
  flag: a flag cannot answer "what rate applied on 14 August?", and answering that question is the
  entire reason sales carry a version id. Backdating is refused rather than supported — a
  retroactive rate would contradict points that have already been paid out and possibly spent;
  corrections belong in `adjust_points`, where they are visible in the ledger. Only `spend_earn`
  is evaluated: the enum names the future models (`tier_multiplier`, `category_bonus`,
  `campaign_bonus`) so the UI can show them as explicitly future, and a CHECK constraint stops one
  being configured before any code evaluates it. `points_expiry_days` exists but is CHECKed to null
  for the whole launch — no expiry sweeper exists, and a configurable expiry with no process behind
  it is a promise the system would silently break. Deferred: per-store and per-category rule
  series (the tables are already keyed for them), rule simulation/preview against past sales, and
  bonus-points stacking (`sales.bonus_points` stays 0).

