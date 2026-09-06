# RLS TEST RESULTS — scripts/rls-check (plain-SQL harness)

## Run 1 — Step 2 auth foundation (42 cases)

Executed 2026-09-05 against PostgreSQL 18.4 (embedded, throwaway database `rewardly_test`).
Pipeline: 00_stubs.sql → supabase/migrations/* (3 files) → supabase/seed.sql → 42 assertion cases.

```
RLS check · server postgres://postgres:***@127.0.0.1:54329/postgres · throwaway db "rewardly_test"
APPLIED stubs (11ms)
APPLIED 20260905120000_auth_foundation_schema.sql (25ms)
APPLIED 20260905120100_invitations_and_rpcs.sql (15ms)
APPLIED 20260905120200_rls_policies.sql (15ms)
APPLIED seed.sql (13ms)
PASS  S1 trigger — profile auto-created from auth.users
PASS  S2 trigger — profile email follows auth email change
PASS  S3 constraint — membership_no auto-generates in AE- format when omitted
PASS  S4 constraint — membership_no format check rejects garbage
PASS  S5 constraint — store_membership with mismatched business rejected
PASS  S6 constraint — duplicate business membership rejected
PASS  S7 constraint — one pending invitation per email per business
PASS  S8 constraint — invitation role limited to manager/staff
PASS  S9 audit — audit_logs immutable even for the table owner
PASS  A1 anon — denied on every application table
PASS  A2 tenant — owner sees only their own business
PASS  A3 tenant — foreign identifiers resolve to nothing across tables
PASS  A4 stores — manager sees all business stores; staff only assigned store
PASS  A5 customer — no business-side rows visible
PASS  A6 customer — sees only their own customer membership
PASS  A7 staff — sees own business customer directory, never foreign tenant
PASS  A8 memberships — staff sees only own; manager sees whole business
PASS  A9 profiles — self, management peers, store peers boundaries
PASS  A10 invitations — owner sees business invitations; staff/manager do not
PASS  A11 audit — readable by owner only
PASS  W1 profiles — own safe fields OK; email/status columns denied; peers untouched
PASS  W2 businesses — owner update OK; manager/staff/foreign-tenant denied
PASS  W3 businesses — direct INSERT denied for every signed-in role
PASS  W4 stores — owner insert/update OK; staff+manager insert denied; staff update denied
PASS  W5 customer_memberships — staff enrolls own business only; customers denied
PASS  W6 customer_memberships — UPDATE limited to manager+
PASS  W7 memberships / invitations / audit — direct writes denied (RPC-only paths)
PASS  R1 rpc — unauthenticated callers are rejected
PASS  R2 rpc — owner creates invitation: raw token returned once, hash stored, audited
PASS  R3 rpc — manager/staff cannot invite; denials are audited
PASS  R4 rpc — invalid role and expiry rejected
PASS  R5 rpc — duplicate pending invitation rejected
PASS  R6 rpc — accept binds the invited profile to exactly the intended business/store/role
PASS  R7 rpc — invitation tokens are single-use
PASS  R8 rpc — acceptance bound to the invited email address
PASS  R9 rpc — expired invitations rejected and marked expired
PASS  R10 rpc — revoked invitations rejected; revoke is owner-only
PASS  R11 rpc — change_member_role: owner-only, audited, self/owner guards
PASS  R12 rpc — remove_member: owner-only, cascades store assignments, audited
PASS  R13 rpc — store assignment owner-only and audited
PASS  R14 rpc — complete_business_signup creates a tenant once and is idempotent
PASS  V1 service_role — bypasses RLS for trusted server operations

42/42 RLS cases passed.
```

---

## Run 2 — Step 3 Slice 1: points ledger (52 cases)

Executed 2026-09-06 against PostgreSQL 18.4 (embedded, throwaway database `rewardly_test`).
Pipeline: 00_stubs.sql → supabase/migrations/* (**4 files**, incl. `20260906120000_points_ledger.sql`)
→ supabase/seed.sql (incl. ledger history for Rahul/Priya) → **52 assertion cases** (S/A/W/R/V +
new **L1–L10** ledger series).

```
RLS check · server postgres://postgres:***@127.0.0.1:54329/postgres · throwaway db "rewardly_test"
APPLIED stubs (10ms)
APPLIED 20260905120000_auth_foundation_schema.sql (30ms)
APPLIED 20260905120100_invitations_and_rpcs.sql (14ms)
APPLIED 20260905120200_rls_policies.sql (16ms)
APPLIED 20260906120000_points_ledger.sql (18ms)
APPLIED seed.sql (17ms)
PASS  S1 trigger — profile auto-created from auth.users
PASS  S2 trigger — profile email follows auth email change
PASS  S3 constraint — membership_no auto-generates in AE- format when omitted
PASS  S4 constraint — membership_no format check rejects garbage
PASS  S5 constraint — store_membership with mismatched business rejected
PASS  S6 constraint — duplicate business membership rejected
PASS  S7 constraint — one pending invitation per email per business
PASS  S8 constraint — invitation role limited to manager/staff
PASS  S9 audit — audit_logs immutable even for the table owner
PASS  A1 anon — denied on every application table
PASS  A2 tenant — owner sees only their own business
PASS  A3 tenant — foreign identifiers resolve to nothing across tables
PASS  A4 stores — manager sees all business stores; staff only assigned store
PASS  A5 customer — no business-side rows visible
PASS  A6 customer — sees only their own customer membership
PASS  A7 staff — sees own business customer directory, never foreign tenant
PASS  A8 memberships — staff sees only own; manager sees whole business
PASS  A9 profiles — self, management peers, store peers boundaries
PASS  A10 invitations — owner sees business invitations; staff/manager do not
PASS  A11 audit — readable by owner only
PASS  W1 profiles — own safe fields OK; email/status columns denied; peers untouched
PASS  W2 businesses — owner update OK; manager/staff/foreign-tenant denied
PASS  W3 businesses — direct INSERT denied for every signed-in role
PASS  W4 stores — owner insert/update OK; staff+manager insert denied; staff update denied
PASS  W5 customer_memberships — staff enrolls own business only; customers denied
PASS  W6 customer_memberships — UPDATE limited to manager+
PASS  W7 memberships / invitations / audit — direct writes denied (RPC-only paths)
PASS  R1 rpc — unauthenticated callers are rejected
PASS  R2 rpc — owner creates invitation: raw token returned once, hash stored, audited
PASS  R3 rpc — manager/staff cannot invite; denials are audited
PASS  R4 rpc — invalid role and expiry rejected
PASS  R5 rpc — duplicate pending invitation rejected
PASS  R6 rpc — accept binds the invited profile to exactly the intended business/store/role
PASS  R7 rpc — invitation tokens are single-use
PASS  R8 rpc — acceptance bound to the invited email address
PASS  R9 rpc — expired invitations rejected and marked expired
PASS  R10 rpc — revoked invitations rejected; revoke is owner-only
PASS  R11 rpc — change_member_role: owner-only, audited, self/owner guards
PASS  R12 rpc — remove_member: owner-only, cascades store assignments, audited
PASS  R13 rpc — store assignment owner-only and audited
PASS  R14 rpc — complete_business_signup creates a tenant once and is idempotent
PASS  V1 service_role — bypasses RLS for trusted server operations
PASS  L1 ledger — store-scoped staff awards points; cache, balance_after and audit stay in sync
PASS  L2 ledger — customers and other-tenant owners cannot award points (42501)
PASS  L3 ledger — store-scoped staff are confined to their stores; managers are not
PASS  L4 ledger — idempotency key makes awards replay-safe (no double earn)
PASS  L5 ledger — manager spends points (negative entry, cache + audit updated); staff may not spend
PASS  L6 ledger — overspending is refused with insufficient_points
PASS  L7 ledger — owner-only adjustments require a reason and cannot overdraw
PASS  L8 ledger — append-only: no DML grants for API roles; trigger blocks mutation even for postgres
PASS  L9 ledger — RLS visibility: own history for customers, business-wide for staff+, never cross-tenant
PASS  L10 ledger — integrity guards: membership must exist, be active and belong to the entry's business

52/52 RLS cases passed.
```

Notes on the L series (see `RLS_POLICIES.md` §5 for the full map):
- Cases COMMIT and ledger rows are immutable by design, so each L case creates its own fresh
  membership and uses unique idempotency keys — no cleanup of append-only data is ever attempted.
- L8 proves the double lock: API roles get `42501` (no DML grants) while even postgres gets
  `22023` from the immutability trigger.
- The pgTAP mirror (`supabase/tests/rls_policy_tests.sql`) grew from 48 to **69 assertions**
  (plan updated); it runs inside a single rolled-back transaction on `supabase test db`.

---

## Run 3 — Step 3 Slice 2: server-authoritative sales (61 cases)

Executed 2026-09-06 against PostgreSQL 18.4 (embedded, throwaway database `rewardly_test`).
Pipeline: 00_stubs.sql → supabase/migrations/* (**5 files**, incl. `20260906130000_sales.sql`)
→ supabase/seed.sql → **61 assertion cases** (S/A/W/R/V + L1–L10 + new **SA1–SA9**).

```
RLS check · server postgres://postgres:***@127.0.0.1:54329/postgres · throwaway db "rewardly_test"
APPLIED stubs (16ms)
APPLIED 20260905120000_auth_foundation_schema.sql (28ms)
APPLIED 20260905120100_invitations_and_rpcs.sql (15ms)
APPLIED 20260905120200_rls_policies.sql (22ms)
APPLIED 20260906120000_points_ledger.sql (18ms)
APPLIED 20260906130000_sales.sql (21ms)
APPLIED seed.sql (19ms)
PASS  S1 trigger — profile auto-created from auth.users
PASS  S2 trigger — profile email follows auth email change
PASS  S3 constraint — membership_no auto-generates in AE- format when omitted
PASS  S4 constraint — membership_no format check rejects garbage
PASS  S5 constraint — store_membership with mismatched business rejected
PASS  S6 constraint — duplicate business membership rejected
PASS  S7 constraint — one pending invitation per email per business
PASS  S8 constraint — invitation role limited to manager/staff
PASS  S9 audit — audit_logs immutable even for the table owner
PASS  A1 anon — denied on every application table
PASS  A2 tenant — owner sees only their own business
PASS  A3 tenant — foreign identifiers resolve to nothing across tables
PASS  A4 stores — manager sees all business stores; staff only assigned store
PASS  A5 customer — no business-side rows visible
PASS  A6 customer — sees only their own customer membership
PASS  A7 staff — sees own business customer directory, never foreign tenant
PASS  A8 memberships — staff sees only own; manager sees whole business
PASS  A9 profiles — self, management peers, store peers boundaries
PASS  A10 invitations — owner sees business invitations; staff/manager do not
PASS  A11 audit — readable by owner only
PASS  W1 profiles — own safe fields OK; email/status columns denied; peers untouched
PASS  W2 businesses — owner update OK; manager/staff/foreign-tenant denied
PASS  W3 businesses — direct INSERT denied for every signed-in role
PASS  W4 stores — owner insert/update OK; staff+manager insert denied; staff update denied
PASS  W5 customer_memberships — staff enrolls own business only; customers denied
PASS  W6 customer_memberships — UPDATE limited to manager+
PASS  W7 memberships / invitations / audit — direct writes denied (RPC-only paths)
PASS  R1 rpc — unauthenticated callers are rejected
PASS  R2 rpc — owner creates invitation: raw token returned once, hash stored, audited
PASS  R3 rpc — manager/staff cannot invite; denials are audited
PASS  R4 rpc — invalid role and expiry rejected
PASS  R5 rpc — duplicate pending invitation rejected
PASS  R6 rpc — accept binds the invited profile to exactly the intended business/store/role
PASS  R7 rpc — invitation tokens are single-use
PASS  R8 rpc — acceptance bound to the invited email address
PASS  R9 rpc — expired invitations rejected and marked expired
PASS  R10 rpc — revoked invitations rejected; revoke is owner-only
PASS  R11 rpc — change_member_role: owner-only, audited, self/owner guards
PASS  R12 rpc — remove_member: owner-only, cascades store assignments, audited
PASS  R13 rpc — store assignment owner-only and audited
PASS  R14 rpc — complete_business_signup creates a tenant once and is idempotent
PASS  V1 service_role — bypasses RLS for trusted server operations
PASS  L1 ledger — store-scoped staff awards points; cache, balance_after and audit stay in sync
PASS  L2 ledger — customers and other-tenant owners cannot award points (42501)
PASS  L3 ledger — store-scoped staff are confined to their stores; managers are not
PASS  L4 ledger — idempotency key makes awards replay-safe (no double earn)
PASS  L5 ledger — manager spends points (negative entry, cache + audit updated); staff may not spend
PASS  L6 ledger — overspending is refused with insufficient_points
PASS  L7 ledger — owner-only adjustments require a reason and cannot overdraw
PASS  L8 ledger — append-only: no DML grants for API roles; trigger blocks mutation even for postgres
PASS  L9 ledger — RLS visibility: own history for customers, business-wide for staff+, never cross-tenant
PASS  L10 ledger — integrity guards: membership must exist, be active and belong to the entry's business
PASS  SA1 sales — staff records a member sale: totals, points, invoice, payment, ledger and audit all in sync
PASS  SA2 sales — walk-in sale earns no points and writes no ledger entry
PASS  SA3 sales — authorization: customers, other tenants and store-scoped staff are refused (42501)
PASS  SA4 sales — idempotency key replay returns the stored sale without double-posting
PASS  SA5 sales — money validation: payment mismatch, bad method, bad qty/price, discount over subtotal
PASS  SA6 sales — invoice numbers are sequential per business and independent across tenants
PASS  SA7 sales — void is manager+, reason-required, reverses points with a compensating entry, and is final
PASS  SA8 sales — RLS visibility: customers see only their own sales; staff whole business; never cross-tenant
PASS  SA9 sales — no DML grants: API roles cannot insert/update sales, items, payments or counters

61/61 RLS cases passed.
```

The pgTAP mirror grew from 69 to **87 assertions** (sales series included; plan updated).

---

## Run 4 — Step 3 Slice 3: catalogue + inventory (69 cases)

Executed 2026-09-06 against PostgreSQL 18.4 (embedded, throwaway database `rewardly_test`).
Pipeline: 00_stubs.sql → supabase/migrations/* (**6 files**, incl. `20260906140000_inventory.sql`)
→ supabase/seed.sql (now with the seeded catalogue + opening stock) → **69 assertion cases**
(S/A/W/R/V + L1–L10 + SA1–SA9 + new **INV1–INV8**).

```
RLS check · server postgres://postgres:***@127.0.0.1:54329/postgres · throwaway db "rewardly_test"
APPLIED stubs (11ms)
APPLIED 20260905120000_auth_foundation_schema.sql (23ms)
APPLIED 20260905120100_invitations_and_rpcs.sql (13ms)
APPLIED 20260905120200_rls_policies.sql (15ms)
APPLIED 20260906120000_points_ledger.sql (17ms)
APPLIED 20260906130000_sales.sql (19ms)
APPLIED 20260906140000_inventory.sql (20ms)
APPLIED seed.sql (20ms)
PASS  S1 trigger — profile auto-created from auth.users
PASS  S2 trigger — profile email follows auth email change
PASS  S3 constraint — membership_no auto-generates in AE- format when omitted
PASS  S4 constraint — membership_no format check rejects garbage
PASS  S5 constraint — store_membership with mismatched business rejected
PASS  S6 constraint — duplicate business membership rejected
PASS  S7 constraint — one pending invitation per email per business
PASS  S8 constraint — invitation role limited to manager/staff
PASS  S9 audit — audit_logs immutable even for the table owner
PASS  A1 anon — denied on every application table
PASS  A2 tenant — owner sees only their own business
PASS  A3 tenant — foreign identifiers resolve to nothing across tables
PASS  A4 stores — manager sees all business stores; staff only assigned store
PASS  A5 customer — no business-side rows visible
PASS  A6 customer — sees only their own customer membership
PASS  A7 staff — sees own business customer directory, never foreign tenant
PASS  A8 memberships — staff sees only own; manager sees whole business
PASS  A9 profiles — self, management peers, store peers boundaries
PASS  A10 invitations — owner sees business invitations; staff/manager do not
PASS  A11 audit — readable by owner only
PASS  W1 profiles — own safe fields OK; email/status columns denied; peers untouched
PASS  W2 businesses — owner update OK; manager/staff/foreign-tenant denied
PASS  W3 businesses — direct INSERT denied for every signed-in role
PASS  W4 stores — owner insert/update OK; staff+manager insert denied; staff update denied
PASS  W5 customer_memberships — staff enrolls own business only; customers denied
PASS  W6 customer_memberships — UPDATE limited to manager+
PASS  W7 memberships / invitations / audit — direct writes denied (RPC-only paths)
PASS  R1 rpc — unauthenticated callers are rejected
PASS  R2 rpc — owner creates invitation: raw token returned once, hash stored, audited
PASS  R3 rpc — manager/staff cannot invite; denials are audited
PASS  R4 rpc — invalid role and expiry rejected
PASS  R5 rpc — duplicate pending invitation rejected
PASS  R6 rpc — accept binds the invited profile to exactly the intended business/store/role
PASS  R7 rpc — invitation tokens are single-use
PASS  R8 rpc — acceptance bound to the invited email address
PASS  R9 rpc — expired invitations rejected and marked expired
PASS  R10 rpc — revoked invitations rejected; revoke is owner-only
PASS  R11 rpc — change_member_role: owner-only, audited, self/owner guards
PASS  R12 rpc — remove_member: owner-only, cascades store assignments, audited
PASS  R13 rpc — store assignment owner-only and audited
PASS  R14 rpc — complete_business_signup creates a tenant once and is idempotent
PASS  V1 service_role — bypasses RLS for trusted server operations
PASS  L1 ledger — store-scoped staff awards points; cache, balance_after and audit stay in sync
PASS  L2 ledger — customers and other-tenant owners cannot award points (42501)
PASS  L3 ledger — store-scoped staff are confined to their stores; managers are not
PASS  L4 ledger — idempotency key makes awards replay-safe (no double earn)
PASS  L5 ledger — manager spends points (negative entry, cache + audit updated); staff may not spend
PASS  L6 ledger — overspending is refused with insufficient_points
PASS  L7 ledger — owner-only adjustments require a reason and cannot overdraw
PASS  L8 ledger — append-only: no DML grants for API roles; trigger blocks mutation even for postgres
PASS  L9 ledger — RLS visibility: own history for customers, business-wide for staff+, never cross-tenant
PASS  L10 ledger — integrity guards: membership must exist, be active and belong to the entry's business
PASS  SA1 sales — staff records a member sale: totals, points, invoice, payment, ledger and audit all in sync
PASS  SA2 sales — walk-in sale earns no points and writes no ledger entry
PASS  SA3 sales — authorization: customers, other tenants and store-scoped staff are refused (42501)
PASS  SA4 sales — idempotency key replay returns the stored sale without double-posting
PASS  SA5 sales — money validation: payment mismatch, bad method, bad qty/price, discount over subtotal
PASS  SA6 sales — invoice numbers are sequential per business and independent across tenants
PASS  SA7 sales — void is manager+, reason-required, reverses points with a compensating entry, and is final
PASS  SA8 sales — RLS visibility: customers see only their own sales; staff whole business; never cross-tenant
PASS  SA9 sales — no DML grants: API roles cannot insert/update sales, items, payments or counters
PASS  INV1 products — manager creates with opening stock; staff/customers/other tenants refused; duplicate sku refused
PASS  INV2 sales re-price from the catalogue; staff overrides refused, manager overrides flagged; stock decrements
PASS  INV3 sales — insufficient stock and fractional catalogue quantities are refused with nothing persisted
PASS  INV4 stock ops — receive/adjust are manager+, reason-guarded, replay-safe, and cross-tenant-safe; update_product flow
PASS  INV5 void restocks catalogue lines with compensating sale_void movements
PASS  INV6 inventory_movements are immutable — triggers refuse postgres, grants refuse API roles
PASS  INV7 RLS visibility — staff+ see the business catalogue & stock; customers and other tenants see none
PASS  INV8 no DML grants — even owners cannot write products or stock directly (RPC-only)

69/69 RLS cases passed.
```

The pgTAP mirror grew from 87 to **107 assertions** (inventory series included; the SA-series
lives_ok calls were also hardened to explicit `sqlstate_as` identities so no assertion depends on
leftover claim GUCs).

Note on INV7: store-scoped staff see stock only for their assigned stores — the
`inventory_by_store` policy deliberately inherits the `stores` RLS scoping (proposal
§Store-scoped), which the case now asserts explicitly (scoped staff: exactly their 6 Satellite
rows; manager: business-wide ≥ 12; Volt rows never visible to Ambika roles).

## Run 5 — Step 3 Slice 4: rewards + redemptions (78 cases)

Executed 2026-09-06 against PostgreSQL 18.4 (embedded, throwaway database `rewardly_test`).
Pipeline: 00_stubs.sql → supabase/migrations/* (**7 files**, incl.
`20260906150000_rewards_redemptions.sql`) → supabase/seed.sql (now with the seeded rewards
catalogue + per-store/pool inventory) → **78 assertion cases** (S/A/W/R/V + L + SA + INV + new
**RE1–RE9**).

```
RLS check · server postgres://postgres:***@127.0.0.1:54329/postgres · throwaway db "rewardly_test"
APPLIED stubs (13ms)
APPLIED 20260905120000_auth_foundation_schema.sql (34ms)
APPLIED 20260905120100_invitations_and_rpcs.sql (16ms)
APPLIED 20260905120200_rls_policies.sql (17ms)
APPLIED 20260906120000_points_ledger.sql (17ms)
APPLIED 20260906130000_sales.sql (25ms)
APPLIED 20260906140000_inventory.sql (24ms)
APPLIED 20260906150000_rewards_redemptions.sql (26ms)
APPLIED seed.sql (25ms)
PASS  S1 trigger — profile auto-created from auth.users
PASS  S2 trigger — profile email follows auth email change
PASS  S3 constraint — membership_no auto-generates in AE- format when omitted
PASS  S4 constraint — membership_no format check rejects garbage
PASS  S5 constraint — store_membership with mismatched business rejected
PASS  S6 constraint — duplicate business membership rejected
PASS  S7 constraint — one pending invitation per email per business
PASS  S8 constraint — invitation role limited to manager/staff
PASS  S9 audit — audit_logs immutable even for the table owner
PASS  A1 anon — denied on every application table
PASS  A2 tenant — owner sees only their own business
PASS  A3 tenant — foreign identifiers resolve to nothing across tables
PASS  A4 stores — manager sees all business stores; staff only assigned store
PASS  A5 customer — no business-side rows visible
PASS  A6 customer — sees only their own customer membership
PASS  A7 staff — sees own business customer directory, never foreign tenant
PASS  A8 memberships — staff sees only own; manager sees whole business
PASS  A9 profiles — self, management peers, store peers boundaries
PASS  A10 invitations — owner sees business invitations; staff/manager do not
PASS  A11 audit — readable by owner only
PASS  W1 profiles — own safe fields OK; email/status columns denied; peers untouched
PASS  W2 businesses — owner update OK; manager/staff/foreign-tenant denied
PASS  W3 businesses — direct INSERT denied for every signed-in role
PASS  W4 stores — owner insert/update OK; staff+manager insert denied; staff update denied
PASS  W5 customer_memberships — staff enrolls own business only; customers denied
PASS  W6 customer_memberships — UPDATE limited to manager+
PASS  W7 memberships / invitations / audit — direct writes denied (RPC-only paths)
PASS  R1 rpc — unauthenticated callers are rejected
PASS  R2 rpc — owner creates invitation: raw token returned once, hash stored, audited
PASS  R3 rpc — manager/staff cannot invite; denials are audited
PASS  R4 rpc — invalid role and expiry rejected
PASS  R5 rpc — duplicate pending invitation rejected
PASS  R6 rpc — accept binds the invited profile to exactly the intended business/store/role
PASS  R7 rpc — invitation tokens are single-use
PASS  R8 rpc — acceptance bound to the invited email address
PASS  R9 rpc — expired invitations rejected and marked expired
PASS  R10 rpc — revoked invitations rejected; revoke is owner-only
PASS  R11 rpc — change_member_role: owner-only, audited, self/owner guards
PASS  R12 rpc — remove_member: owner-only, cascades store assignments, audited
PASS  R13 rpc — store assignment owner-only and audited
PASS  R14 rpc — complete_business_signup creates a tenant once and is idempotent
PASS  V1 service_role — bypasses RLS for trusted server operations
PASS  L1 ledger — store-scoped staff awards points; cache, balance_after and audit stay in sync
PASS  L2 ledger — customers and other-tenant owners cannot award points (42501)
PASS  L3 ledger — store-scoped staff are confined to their stores; managers are not
PASS  L4 ledger — idempotency key makes awards replay-safe (no double earn)
PASS  L5 ledger — manager spends points (negative entry, cache + audit updated); staff may not spend
PASS  L6 ledger — overspending is refused with insufficient_points
PASS  L7 ledger — owner-only adjustments require a reason and cannot overdraw
PASS  L8 ledger — append-only: no DML grants for API roles; trigger blocks mutation even for postgres
PASS  L9 ledger — RLS visibility: own history for customers, business-wide for staff+, never cross-tenant
PASS  L10 ledger — integrity guards: membership must exist, be active and belong to the entry's business
PASS  SA1 sales — staff records a member sale: totals, points, invoice, payment, ledger and audit all in sync
PASS  SA2 sales — walk-in sale earns no points and writes no ledger entry
PASS  SA3 sales — authorization: customers, other tenants and store-scoped staff are refused (42501)
PASS  SA4 sales — idempotency key replay returns the stored sale without double-posting
PASS  SA5 sales — money validation: payment mismatch, bad method, bad qty/price, discount over subtotal
PASS  SA6 sales — invoice numbers are sequential per business and independent across tenants
PASS  SA7 sales — void is manager+, reason-required, reverses points with a compensating entry, and is final
PASS  SA8 sales — RLS visibility: customers see only their own sales; staff whole business; never cross-tenant
PASS  SA9 sales — no DML grants: API roles cannot insert/update sales, items, payments or counters
PASS  INV1 products — manager creates with opening stock; staff/customers/other tenants refused; duplicate sku refused
PASS  INV2 sales re-price from the catalogue; staff overrides refused, manager overrides flagged; stock decrements
PASS  INV3 sales — insufficient stock and fractional catalogue quantities are refused with nothing persisted
PASS  INV4 stock ops — receive/adjust are manager+, reason-guarded, replay-safe, and cross-tenant-safe; update_product flow
PASS  INV5 void restocks catalogue lines with compensating sale_void movements
PASS  INV6 inventory_movements are immutable — triggers refuse postgres, grants refuse API roles
PASS  INV7 RLS visibility — staff+ see the business catalogue & stock; customers and other tenants see none
PASS  INV8 no DML grants — even owners cannot write products or stock directly (RPC-only)
PASS  RE1 rewards — manager-only lifecycle: create with validation, update, archive; inventory rows manager-only
PASS  RE2 redemptions — customer self-redeem: points spent via ledger, one-time code hashed, reference counter, replay
PASS  RE3 redemptions — insufficient points refused with nothing persisted; staff counter redemption works
PASS  RE4 reward inventory — reservations, last-unit races, pool fallback, unlimited rewards
PASS  RE5 redemption authorization — other customers, scoped staff and cross-tenant are refused
PASS  RE6 collect — hashed code verified (lowercase tolerated), stock debited, transitions final, staff-only
PASS  RE7 cancel — manager+ or the member themself, reason required, points refunded via compensating entry
PASS  RE8 monthly limits — pending/collected count, cancelled do not
PASS  RE9 RLS visibility + no DML grants on the redemption tables

78/78 RLS cases passed.
```

The pgTAP mirror grew from 107 (declared) to **155 assertions** (RE series included). Because
Docker is unavailable in the sandbox, the mirror was executed for the first time through
`scripts/rls-check/pgtap-run.mjs` — the same test file against the harness database with minimal
stubs for the pgTAP subset used (plan/is/ok/lives_ok/throws_ok/finish): **155/155 passed**. That
run surfaced a pre-existing off-by-two: the Step-2/ledger/sales/inventory series actually execute
**109** assertions, not the declared 107 — `plan()` is now corrected (109 + 46 RE = 155).

Two slice-4 behaviours were re-designed while the RE cases were written, both documented in
RLS_POLICIES §6:

- `collect_redemption`/`cancel_redemption` lazy expiry **marks, releases, audits and RETURNS
  `status: expired`** instead of raising — a raise rolls the whole statement back, so the expiry
  marking (and its audit row) would never persist. RE6 asserts the persisted row, the released
  hold and the `redemption.expired` audit.
- The invalid-code branch of `collect_redemption` no longer writes an audit before its raise (it
  could never persist for the same reason). Denial auditing for wrong-code attempts belongs to the
  calling server action, matching the R3/R-series precedent. RE6 keeps the success-path
  `redemption.collected` audit assertion.

Note on RE4/RE6: reservations are pinned — `redemptions.inventory_scope` records which
`reward_inventory` row was held at redeem time (`store`, `pool`, or null = unlimited), so
collect/cancel debit or release exactly that row. RE4 proves the last-unit race, the pool
fallback and the unlimited path; RE6 proves the debit (on_hand 2 → 1, reserved 1 → 0) and the
expired-hold release.

## Run 6 — Step 3 Slice 5: secure membership QR + POS verification (86 cases)

Executed 2026-09-06 against PostgreSQL 18.4 (embedded, throwaway database `rewardly_test`).
Pipeline: 00_stubs.sql → supabase/migrations/* (**8 files**, incl.
`20260906160000_membership_qr_tokens.sql`) → supabase/seed.sql → **86 assertion cases**
(S/A/W/R/V + L + SA + INV + RE + new **QR1–QR8**).

```
RLS check · server postgres://postgres:***@127.0.0.1:54329/postgres · throwaway db "rewardly_test"
APPLIED stubs (13ms)
APPLIED 20260905120000_auth_foundation_schema.sql (31ms)
APPLIED 20260905120100_invitations_and_rpcs.sql (15ms)
APPLIED 20260905120200_rls_policies.sql (19ms)
APPLIED 20260906120000_points_ledger.sql (20ms)
APPLIED 20260906130000_sales.sql (27ms)
APPLIED 20260906140000_inventory.sql (27ms)
APPLIED 20260906150000_rewards_redemptions.sql (32ms)
APPLIED 20260906160000_membership_qr_tokens.sql (19ms)
APPLIED seed.sql (27ms)
… (78 earlier cases unchanged — see Runs 1–5) …
PASS  QR1 issue — customer mints an opaque token; no PII/membership id encoded; previous token revoked
PASS  QR2 verify — authorized staff scan succeeds, returns minimum data, is single-use and audited
PASS  QR3 verify — malformed, unknown and tampered tokens all fail identically and are recorded
PASS  QR4 verify — expiry is enforced
PASS  QR5 verify — cross-business staff and customers cannot verify; store scoping enforced
PASS  QR6 revocation + rate limits
PASS  QR7 no DML grants and no SELECT on the token table; scan RPC is authenticated-only
PASS  QR8 attempts are append-only, manager-visible and staff-invisible

86/86 RLS cases passed.
```

pgTAP mirror grew from 155 to **185 assertions** (30 QR assertions). Docker is still unavailable in
the sandbox, so it ran through `scripts/rls-check/pgtap-run.mjs`:

```
APPLIED stubs + migrations + seed

pgTAP stub run: 185 ok, 0 not ok — PASSED
```

The stub runner gained a `matches(text, regex, descr)` implementation (the QR series asserts the
token's wire format with a regular expression); the real pgTAP extension has provided `matches()`
since forever, so nothing changes for `supabase test db`.

### What the QR series actually proves

| Case | Property under test |
| --- | --- |
| QR1 | Payload shape `RWD1.<16>.<26>`; no membership number / name / points anywhere in it; TTL clamped to the 5-minute cap; only `sha256(salt‖secret)` persisted (recomputed from the issued secret in the test); the token table is unreadable even to the issuing customer's session; re-issuing marks the previous row `superseded`. |
| QR2 | An authorized, store-assigned cashier resolves the right member; the response carries counter-safe fields only (no email/phone/enrolment payload); the scan is audited **by selector**; the secret provably appears nowhere in `audit_logs`; replaying the same code returns `qr_already_used`. |
| QR3 | Malformed input, an unknown selector and a tampered secret all return the identical `qr_invalid`; all three land in `qr_verification_attempts`; the genuine token still verifies afterwards — failures never burn it. |
| QR4 | An aged row is refused with `qr_expired`. |
| QR5 | Authorization precedes lifecycle: a foreign tenant's owner and a plain customer both get `not_authorized` (with no customer fields in the reply); a store-scoped cashier gets `store_forbidden` at an unassigned store and `store_not_in_business` for another tenant's store; **no denial consumes the token**. |
| QR6 | "Hide my QR" revokes the live token (`qr_revoked` at the counter) and writes a per-business audit row carrying the token count and reason but no selector; the 10-issues-per-minute limit trips. |
| QR7 | Grants: `authenticated` has no SELECT/INSERT/UPDATE/DELETE on `membership_qr_tokens`, no INSERT/UPDATE on `qr_verification_attempts`, `anon` has neither SELECT nor EXECUTE on issue/verify. |
| QR8 | Attempts are append-only (the trigger refuses even `postgres`), managers can review their business's trail, cashiers see zero rows. |

### Design change forced by the tests

`verify_membership_qr_token` originally raised on every failure. QR3/QR8 failed with "attempts not
recorded": a `raise` rolls back the statement, taking the `qr_verification_attempts` row and the
`write_audit` row with it — which would have defeated both the security trail **and** the scanner
rate limit that reads from it. The function now **returns** `{ok:false, reason:'<code>'}` for every
verification failure and raises only `authentication_required` (28000). This is the same lesson the
rewards slice learned with lazy expiry, now stated as a rule in RLS_POLICIES §4: *an RPC that must
leave evidence cannot raise.*

## Run 7 — Step 3 Slice 6: versioned loyalty rule engine (94 cases)

Executed 2026-09-06 against PostgreSQL 18.4 (embedded, throwaway database `rewardly_test`).
Pipeline: 00_stubs.sql → supabase/migrations/* (**9 files**, incl.
`20260906170000_loyalty_rules.sql`) → supabase/seed.sql → **94 assertion cases**
(S/A/W/R/V + L + SA + INV + RE + QR + new **LR1–LR8**).

```
RLS check · server postgres://postgres:***@127.0.0.1:54329/postgres · throwaway db "rewardly_test"
APPLIED stubs (14ms)
APPLIED 20260905120000_auth_foundation_schema.sql (31ms)
APPLIED 20260905120100_invitations_and_rpcs.sql (16ms)
APPLIED 20260905120200_rls_policies.sql (19ms)
APPLIED 20260906120000_points_ledger.sql (20ms)
APPLIED 20260906130000_sales.sql (28ms)
APPLIED 20260906140000_inventory.sql (28ms)
APPLIED 20260906150000_rewards_redemptions.sql (33ms)
APPLIED 20260906160000_membership_qr_tokens.sql (20ms)
APPLIED 20260906170000_loyalty_rules.sql (27ms)
APPLIED seed.sql (32ms)
… (86 earlier cases unchanged — see Runs 1–6) …
PASS  LR1 rule engine — every business starts on the launch policy, and history is stamped
PASS  LR2 rule changes are owner-only
PASS  LR3 invalid rate / effective-date configuration fails safely
PASS  LR4 owner edit appends a version and closes the previous one (never rewrites)
PASS  LR5 history keeps its version; new sales use the currently effective one
PASS  LR6 versions are immutable and cannot be resurrected
PASS  LR7 tenancy + visibility + no direct DML for API roles
PASS  LR8 a scheduled future version does not price today's sales

94/94 RLS cases passed.
```

pgTAP mirror grew from 185 to **222 assertions** (37 LR assertions):

```
APPLIED stubs + migrations + seed

pgTAP stub run: 222 ok, 0 not ok — PASSED
```

### The five behaviours §4 asks for, and where they are proven

| §4 requirement | Case |
| --- | --- |
| Only the owner can create/change a rule | LR2 — manager, cashier, customer and a foreign tenant's owner all get 42501, and the version count is unchanged afterwards |
| Cross-business rules cannot be used | LR7 — the resolver never returns another tenant's version, staff/owners see nothing across the boundary, and the internal resolver is not callable by clients at all |
| Existing sale history retains its old rule version | LR5 — the SA1 sale is still pinned to v1 with its original 125 points after v2 goes live, and its ledger entry keeps v1 too |
| A new sale uses the currently effective rule | LR5 (₹1,250 earns 250 pts under v2 instead of 125) and LR8 (a version scheduled for next week does not price today's sale, but does resolve on its date) |
| Invalid rate/effective-date configuration fails safely | LR3 — seven invalid shapes each raise 22023 and the version count is byte-identical before and after |

### Notes from writing the suite

- **The rule engine has to be self-installing.** The first run failed every sales case with
  `loyalty_rule_missing`: the migration backfills businesses that exist *at migration time*, but
  the seed (and `complete_business_signup` in production) creates them afterwards. An AFTER INSERT
  trigger on `businesses` now installs the launch policy as version 1, so a tenant can never exist
  without a rule and `create_sale` never has to guess.
- **`create_sale` v3 is v2 with one step changed.** The first attempt reimplemented the function
  from scratch and broke four inventory cases on error-message and code differences. It is now the
  Slice-3 body with exactly four edits: resolve the version, use `loyalty_points_for`, stamp
  `sales.loyalty_rule_version_id`, and add the version to the audit/response.
- **The ledger stamp lives in `ledger_post_entry`, not `create_sale`.** `points_ledger` is
  append-only (a trigger rejects UPDATE even for the owner), so stamping after the fact is
  impossible by design. Deriving the version inside the shared helper — any entry whose `source_id`
  is a sale inherits that sale's version — also stamps the void reversal for free.
- **Immutability is a trigger, not a convention.** LR6 shows `postgres` itself cannot rewrite
  economics, move `effective_from`, or reopen a closed window. Deletion is deliberately *not*
  blocked by the trigger: a version must cascade away with its business, and grants already stop
  every API role from deleting one.

## Run 8 — Step 3 Slice 7: persistent in-app notifications + Realtime (101 cases)

Executed 2026-09-06 against PostgreSQL 18.4 (embedded, throwaway database `rewardly_test`).
Pipeline: 00_stubs.sql → supabase/migrations/* (**10 files**, incl.
`20260906180000_notifications.sql`) → supabase/seed.sql → **101 assertion cases**
(S/A/W/R/V + L + SA + INV + RE + QR + LR + new **NT1–NT7**).

```
… (94 earlier cases unchanged — see Runs 1–7) …
PASS  NT1 notifications — events are emitted by the facts that cause them
PASS  NT2 notifications — recipients see only what they are authorized to see
PASS  NT3 notifications — cross-tenant and cross-store access is denied
PASS  NT4 notifications — read state is per profile and persists
PASS  NT5 notifications — duplicate and replayed events never duplicate rows
PASS  NT6 notifications — low stock alerts only where configured, only on crossing
PASS  NT7 notifications — Realtime exposure is limited to the event table

101/101 RLS cases passed.
```

pgTAP mirror grew from 222 to **264 assertions** (42 NT assertions):

```
APPLIED stubs + migrations + seed

pgTAP stub run: 264 ok, 0 not ok — PASSED
```

### The five §5 required tests, and where they are proven

| §5 requirement | Case |
| --- | --- |
| Customer/business user receives only authorized notifications | NT2 — customer sees own membership only and zero business rows; cashier sees neither customer rows nor owner-scoped ones; owner sees the owner-scoped ones |
| Cross-tenant/store access is denied | NT3 — the other tenant reads nothing and cannot mark read (42501); a satellite-store alert is invisible to the main-store cashier but visible to the assigned one |
| Read/mark-all state persists | NT4 — read rows survive, are personal (the owner cannot see or forge the cashier's), mark-all is audience-scoped and returns 0 on a second run, and the business mark-all leaves the customer bell alone |
| Duplicate/reconnect events do not duplicate activity or points | NT5 — an idempotency-key sale replay emits nothing new, a duplicate `dedupe_key` is a unique violation, and `notify_emit` returns null instead of aborting its caller. Client-side: `tests/notification-merge.test.mjs` proves the list merge is replay-safe and that read state is monotonic |
| UI works with Realtime unavailable | The hook treats Realtime as an accelerator, not a dependency: the initial state comes from an ordinary RLS-filtered fetch, `SUBSCRIBED` triggers a catch-up resync, and `CHANNEL_ERROR`/`TIMED_OUT`/`offline` degrade to a visible "Reconnecting…/Offline" line with a Retry that refetches. With Supabase unconfigured the component renders the prototype bell unchanged (verified in a real browser) |

### Notes from writing the suite

- **Two flaky assertions were my fault, not the code's.** NT1 first selected "the customer's points
  notification" without pinning it to the sale under test — the seeded member has earned points in
  earlier cases, so `select … into` picked an arbitrary row and the case passed or failed depending
  on plan order. Pinning on `source_id` made it deterministic across three consecutive runs. NT6
  had the same shape (`order by created_at desc limit 1` with same-transaction timestamps) and now
  matches on the `low-stock:` dedupe prefix.
- **`qr_verification_attempts` timestamps are `attempted_at`, not `created_at`.** The invalid-scan
  burst detector failed closed on the first run, which is the right direction for a trigger to fail
  but still a bug; caught by QR3/QR8 rather than by a notification case.
- **Emitting from triggers keeps the blast radius at zero.** Ten prior migrations' RPC bodies are
  untouched by this slice; the whole notification surface is additive.

## Run 9 — Step 3 Slice 8: catalogue images (Storage) + essential settings (109 cases)

Executed 2026-09-06 against PostgreSQL 18.4 (embedded, throwaway database `rewardly_test`).
Pipeline: 00_stubs.sql → supabase/migrations/* (**11 files**, incl.
`20260906190000_storage_and_settings.sql`) → supabase/seed.sql → **109 assertion cases**
(previous 101 + new **ST1–ST4**, **SET1–SET4**).

```
… (101 earlier cases unchanged — see Runs 1–8) …
PASS  ST1 catalogue images — manager+ can attach; validation rejects everything else
PASS  ST2 catalogue images — authorization and tenancy
PASS  ST3 catalogue images — thumbnail, alt text and detach behaviour
PASS  ST4 reward images are visible to members of that business only
PASS  SET1 business identity — owner only, validated, audited
PASS  SET2 stores — owner-only upsert, close instead of delete, tenant-safe
PASS  SET3 notification preferences — per profile, security never mutable
PASS  SET4 settings surface — grants and anonymous denial

109/109 RLS cases passed.
```

pgTAP mirror grew from 264 to **303 assertions** (39 ST/SET assertions):

```
APPLIED stubs + migrations + seed

pgTAP stub run: 303 ok, 0 not ok — PASSED
```

### Two real bugs the tests caught

Both were in code I had just written and believed correct:

1. **`attach_catalogue_image` violated its own unique index.** It inserted the new image with
   `is_primary = true` and demoted the previous thumbnail *afterwards*, so
   `catalogue_images_one_primary_product` fired mid-statement and the whole attach failed — but
   only on the **second** upload for a product, which a happy-path smoke test would never reach.
   ST3 hit it immediately. The demotion now happens before the insert.
2. **`upsert_store` referenced a column that does not exist.** I wrote `address`; the table has
   `address_line` (plus `city`/`region`). SET2 failed with `column "address" of relation "stores"
   does not exist`. The RPC now matches the real schema and exposes `city`/`region` too.

Neither would have been visible from the UI until an owner tried the exact second action.

### Storage note for the harness

The `storage` schema exists on Supabase but not on the bare PostgreSQL the local harness uses, so
the bucket and policy block is wrapped in a guarded `DO` that emits a notice and returns. The
migration therefore applies identically to both, and the bucket policies are exercised on staging
rather than here — called out in the owner checklist rather than silently assumed.
