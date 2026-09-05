# RLS TEST RESULTS — scripts/rls-check (plain-SQL harness)

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
