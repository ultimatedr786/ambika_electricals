-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2 · Step 3 · Slice 10: revoke EXECUTE on trigger functions
--
-- PostgreSQL grants EXECUTE to PUBLIC on every new function, so all of our
-- trigger functions — `notify_on_*`, `lrv_content_immutable`,
-- `points_ledger_no_mutation`, `install_default_loyalty_rule`, the
-- `*_insert_check` guards — were callable by `anon` and `authenticated`.
--
-- This was never exploitable: invoking a trigger function directly raises
-- `trigger functions can only be called as triggers` (SQLSTATE 0A000) before
-- a single line of its body runs. But it is inconsistent with the revoke
-- discipline applied to every other internal function (`ledger_post_entry`,
-- `inventory_move`, `notify_emit`, `active_loyalty_rule_version`), and
-- "harmless surface" is how surface accumulates.
--
-- Triggers themselves are unaffected. EXECUTE on a trigger function is checked
-- when the trigger is CREATED, not each time it fires, so revoking it from the
-- API roles cannot stop a trigger firing for those users. The RLS harness —
-- which exercises every one of these triggers as `authenticated` — is the
-- proof, not this comment.
--
-- `scripts/ci/validate-migrations.mjs` now fails the build if any function
-- returning `trigger` is executable by an API role, so a trigger function
-- added in a future migration cannot silently reintroduce this.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  fn record;
  n integer := 0;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prorettype = 'pg_catalog.trigger'::regtype
     order by p.proname
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
    n := n + 1;
  end loop;
  raise notice 'revoked API-role EXECUTE on % trigger function(s)', n;
end $$;
