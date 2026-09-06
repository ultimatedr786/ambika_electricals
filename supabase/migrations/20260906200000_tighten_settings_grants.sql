-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2 · Step 3 · Slice 9: close the last direct-write paths on settings
--
-- Found by `scripts/ci/validate-migrations.mjs`, which asserts that no API role
-- holds INSERT/UPDATE/DELETE on a table whose writes are supposed to go through
-- an RPC. Two grants predated the settings slice and were never withdrawn when
-- `update_business_profile` and `upsert_store` took over:
--
--   businesses  UPDATE          → bypassed GSTIN/email validation and the
--                                 `business.profile_updated` audit entry
--   stores      INSERT, UPDATE  → bypassed the `store.created`/`store.updated`
--                                 audit entries
--
-- The owner-only RLS policies meant neither was a privilege-escalation hole,
-- but both were a way to change tenant configuration without leaving a trace —
-- and an audit trail with a legitimate bypass is not an audit trail. No
-- application code used either path (every `from("businesses")` and
-- `from("stores")` call in `src/` is a SELECT), so this closes them outright
-- rather than deprecating them.
--
-- The policies stay exactly as they are: they still gate the RPCs' internal
-- writes, and `service_role` is unaffected.
-- ═══════════════════════════════════════════════════════════════════════════

revoke update on public.businesses from authenticated;
revoke insert, update on public.stores from authenticated;

comment on function public.update_business_profile(text, text, text, text, text) is
  'The only write path for business identity. Validates and audits; direct UPDATE was revoked in 20260906200000.';
comment on function public.upsert_store(uuid, text, text, text, text, boolean, text, text) is
  'The only write path for stores. Closing a store is is_active = false, never a delete.';
