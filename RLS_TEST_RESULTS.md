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
