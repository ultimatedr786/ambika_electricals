-- ============================================================================
-- Fix: service_role could TRUNCATE the append-only tables.
--
-- points_ledger, inventory_movements, qr_verification_attempts and
-- loyalty_rule_versions were each granted `all` privileges (rather than the
-- narrower `select, insert, update, delete` already used for audit_logs, via
-- the baseline grant in 20260905120200_rls_policies.sql:79 and the matching
-- default-privileges rule at :81). `all` on a table includes TRUNCATE, TRIGGER
-- and REFERENCES — none of which the application legitimately needs at
-- runtime (TRIGGER/REFERENCES are DDL-only privileges for creating new
-- triggers/foreign keys, never required by ordinary INSERT/SELECT traffic).
--
-- The append-only triggers on these tables (points_ledger_no_mutation,
-- inventory_movements_no_mutation, qr_attempts_no_mutation,
-- lrv_content_immutable) correctly block UPDATE and DELETE regardless of
-- table-level grants — row-level BEFORE UPDATE/DELETE triggers are not
-- affected by this migration. But TRUNCATE is a statement-level operation
-- that bypasses row-level triggers entirely, and no statement-level
-- BEFORE TRUNCATE trigger exists, so a role holding table-level TRUNCATE
-- could still wipe the entire table in one statement — bypassing the
-- "append-only, immutable" guarantee documented in MVP_HANDOFF.md §3 and
-- RLS_POLICIES.md.
--
-- Revoking TRUNCATE (and the other DDL-only privileges bundled into `all`)
-- from service_role brings these four tables in line with the pattern
-- already used for audit_logs, closing the gap without touching the
-- INSERT/SELECT/UPDATE/DELETE grants the application actually relies on, and
-- without changing the existing mutation triggers at all.
--
-- `postgres` (table owner and, locally, a real superuser) is unaffected by
-- this migration and remains able to TRUNCATE or disable triggers — that is
-- an inherent property of table ownership in PostgreSQL, not something any
-- GRANT/REVOKE can change, and is the same ceiling MVP_HANDOFF.md §8 already
-- describes for the trigger-EXECUTE hardening.
-- ============================================================================

revoke truncate, trigger, references on public.points_ledger from service_role;
revoke truncate, trigger, references on public.inventory_movements from service_role;
revoke truncate, trigger, references on public.qr_verification_attempts from service_role;
revoke truncate, trigger, references on public.loyalty_rule_versions from service_role;
