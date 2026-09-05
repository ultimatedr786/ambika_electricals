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

**Denial auditing:** a SQL statement that raises rolls back everything it wrote, so *denied*
attempts (`invitation.create_denied`, `invitation.accept_denied`, …) are recorded by the calling
**server action**, which catches the typed error and writes the audit row through the admin client
— with the real client IP, which SQL never sees. Accepted/succeeded operations are audited in-SQL.

Invitation expiry is enforced at every accept attempt (`expires_at < now()` ⇒ reject); the stored
`status` stays `pending` and UIs derive “expired” from `expires_at` — no background sweeper needed
for correctness.

## 5. Test coverage & results

`scripts/rls-check/10_assertions.sql` — **52 cases, 52 passed** (Step 2 suite executed 2026-09-05;
ledger suite 2026-09-06, against PostgreSQL 18.4 with the real migrations + seed; see
`RLS_TEST_RESULTS.md` for both logs):

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
- **L1–L10** points ledger: staff award with cache/balance/audit in sync; customers and
  other-tenant owners denied (42501); store-scoped staff confined to their stores; idempotency-key
  replay never double-posts; manager-only spends stored negative with lifetimes updated; overspend
  refused (`insufficient_points`, 22023); owner-only adjustments require a reason and cannot
  overdraw; append-only enforced twice (no DML grants → 42501, immutability trigger → 22023 even
  for postgres); RLS visibility own-memberships / whole-business / never cross-tenant; insert
  guards reject business-mismatched, foreign-store and blocked-membership entries.

`supabase/tests/rls_policy_tests.sql` (pgTAP, 69 assertions) mirrors the same matrix for
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
- `actor_profile_id` on the ledger is FK-free on purpose (audit_logs precedent): deleting a staff
  auth user must never be blocked by — or silently rewrite — financial history.
