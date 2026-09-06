-- ============================================================================
-- pgTAP RLS policy tests — canonical runner: `supabase test db` (local CLI).
-- Mirrors scripts/rls-check/10_assertions.sql (plain-SQL harness used in CI
-- and anywhere PostgreSQL is available without Docker/Supabase CLI). Where
-- Docker is unavailable, `node scripts/rls-check/pgtap-run.mjs` executes this
-- same file against the harness database with stubs for the pgTAP subset used
-- here (plan/is/ok/matches/lives_ok/throws_ok/finish).
--
-- Design note: every pgTAP assertion runs as the postgres role. Identity
-- switching happens inside helper functions (SET LOCAL role + JWT claims),
-- so the suite never depends on the anon/authenticated roles being able to
-- execute pgTAP itself.
--
-- Fixed UUIDs come from supabase/seed.sql.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;

-- ---------------------------------------------------------------------------
-- Identity helpers (test-scoped)
-- ---------------------------------------------------------------------------
create or replace function extensions.apply_identity(p_role text, p_sub uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    coalesce(jsonb_build_object('sub', p_sub, 'role', 'authenticated')::text, ''), true);
  execute format('set local role %I', p_role);
end $$;

create or replace function extensions.count_as(p_role text, p_sub uuid, p_query text)
returns bigint language plpgsql as $$
declare v_n bigint;
begin
  perform extensions.apply_identity(p_role, p_sub);
  execute p_query into v_n;
  execute 'reset role';
  return v_n;
end $$;

create or replace function extensions.text_as(p_role text, p_sub uuid, p_query text)
returns text language plpgsql as $$
declare v_t text;
begin
  perform extensions.apply_identity(p_role, p_sub);
  execute p_query into v_t;
  execute 'reset role';
  return v_t;
end $$;

create or replace function extensions.perform_as(p_role text, p_sub uuid, p_stmt text)
returns void language plpgsql as $$
begin
  perform extensions.apply_identity(p_role, p_sub);
  execute p_stmt;
  execute 'reset role';
end $$;

-- Returns the SQLSTATE raised for the statement under the given identity,
-- or 'NO_ERROR' when it (unexpectedly) succeeded.
create or replace function extensions.sqlstate_as(p_role text, p_sub uuid, p_stmt text)
returns text language plpgsql as $$
begin
  perform extensions.apply_identity(p_role, p_sub);
  begin
    execute p_stmt;
  exception when others then
    execute 'reset role';
    return sqlstate;
  end;
  execute 'reset role';
  return 'NO_ERROR';
end $$;

select plan(303);

-- ---------------------------------------------------------------------------
-- Tenant isolation & role-scoped reads
-- ---------------------------------------------------------------------------
select is(
  extensions.count_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select count(*) from public.businesses'), 1::bigint,
  'A2: owner sees exactly their own business'
);
select is(
  extensions.count_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select count(*) from public.businesses where id = ''aaaaaaaa-0000-4000-8000-000000000002'''), 0::bigint,
  'A3: owner cannot see the foreign tenant by id'
);
select is(
  extensions.count_as('authenticated', '99999999-9999-4999-8999-999999999999',
    'select count(*) from public.stores where business_id = ''aaaaaaaa-0000-4000-8000-000000000001'''), 0::bigint,
  'A3: volt owner cannot probe Ambika stores'
);
select is(
  extensions.count_as('authenticated', '99999999-9999-4999-8999-999999999999',
    'select count(*) from public.customer_memberships where business_id = ''aaaaaaaa-0000-4000-8000-000000000001'''), 0::bigint,
  'A3: volt owner cannot probe Ambika customers'
);
select is(
  extensions.count_as('authenticated', '99999999-9999-4999-8999-999999999999',
    'select count(*) from public.audit_logs where business_id = ''aaaaaaaa-0000-4000-8000-000000000001'''), 0::bigint,
  'A3: volt owner cannot probe Ambika audit trail'
);

select is(
  extensions.count_as('authenticated', '22222222-2222-4222-8222-222222222222',
    'select count(*) from public.stores'), 2::bigint,
  'A4: manager sees every store of the business'
);
select is(
  extensions.count_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select count(*) from public.stores'), 1::bigint,
  'A4: main-store staff sees exactly one store'
);
select is(
  extensions.count_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select count(*) from public.stores where id = ''bbbbbbbb-0000-4000-8000-000000000002'''), 0::bigint,
  'A4: staff cannot see the unassigned satellite store'
);

select is(
  extensions.count_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select (select count(*) from public.businesses)
          + (select count(*) from public.stores)
          + (select count(*) from public.business_memberships)
          + (select count(*) from public.audit_logs)
          + (select count(*) from public.invitations)'), 0::bigint,
  'A5: customer sees no business-side rows'
);
select is(
  extensions.count_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select count(*) from public.customer_memberships'), 1::bigint,
  'A6: customer sees only their own membership'
);
select is(
  extensions.count_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select count(*) from public.profiles'), 1::bigint,
  'A9: customer sees only their own profile'
);
select is(
  extensions.count_as('authenticated', '66666666-6666-4666-8666-666666666666',
    'select count(*) from public.customer_memberships where profile_id = ''55555555-5555-4555-8555-555555555555'''), 0::bigint,
  'A6: Priya cannot see Rahul''s membership'
);

select is(
  extensions.count_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select count(*) from public.customer_memberships'), 3::bigint,
  'A7: staff sees the business customer directory (POS lookup)'
);
select is(
  extensions.count_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select count(*) from public.business_memberships'), 1::bigint,
  'A8: staff sees only their own business membership'
);
select is(
  extensions.count_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select count(*) from public.profiles where id = ''22222222-2222-4222-8222-222222222222'''), 0::bigint,
  'A9: staff cannot see profiles outside their store'
);

select is(
  extensions.count_as('authenticated', '22222222-2222-4222-8222-222222222222',
    'select count(*) from public.business_memberships'), 4::bigint,
  'A8: manager sees all memberships of the business'
);
select is(
  extensions.count_as('authenticated', '22222222-2222-4222-8222-222222222222',
    'select count(*) from public.profiles'), 4::bigint,
  'A9: manager sees business-side profiles only (not customers)'
);
select is(
  extensions.count_as('authenticated', '22222222-2222-4222-8222-222222222222',
    'select count(*) from public.invitations'), 0::bigint,
  'A10: manager cannot see invitations (owner-only)'
);
select is(
  extensions.count_as('authenticated', '22222222-2222-4222-8222-222222222222',
    'select count(*) from public.audit_logs'), 0::bigint,
  'A11: manager cannot read the audit trail (owner-only)'
);

select ok(
  extensions.count_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select count(*) from public.invitations') >= 1,
  'A10: owner sees invitations of the business'
);
select ok(
  extensions.count_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select count(*) from public.audit_logs') >= 1,
  'A11: owner reads the business audit trail'
);

-- ---------------------------------------------------------------------------
-- Write boundaries
-- ---------------------------------------------------------------------------
select perform_as('authenticated', '55555555-5555-4555-8555-555555555555',
  'update public.profiles set display_name = ''Rahul S.'' where id = ''55555555-5555-4555-8555-555555555555''');
select is(
  (select display_name from public.profiles where id = '55555555-5555-4555-8555-555555555555'),
  'Rahul S.',
  'W1: own safe-field update works'
);
select perform_as('authenticated', '55555555-5555-4555-8555-555555555555',
  'update public.profiles set display_name = ''Hacked'' where id = ''66666666-6666-4666-8666-666666666666'''
);
select is(
  (select display_name from public.profiles where id = '66666666-6666-4666-8666-666666666666'),
  'Priya Patel',
  'W1: peer rows are untouched (policy filters them out)'
);
select is(
  extensions.sqlstate_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'update public.profiles set email = ''hijack@evil.example'' where id = ''55555555-5555-4555-8555-555555555555'''),
  '42501',
  'W1: email column is not user-updatable'
);
select is(
  extensions.sqlstate_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'update public.profiles set status = ''suspended'' where id = ''55555555-5555-4555-8555-555555555555'''),
  '42501',
  'W1: status column is not user-updatable'
);

select perform_as('authenticated', '22222222-2222-4222-8222-222222222222',
  'update public.businesses set name = ''Manager Takeover'' where id = ''aaaaaaaa-0000-4000-8000-000000000001'''
);
select is(
  (select name from public.businesses where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'Ambika Electricals',
  'W2: manager cannot change business settings'
);

select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'insert into public.stores (business_id, name) values (''aaaaaaaa-0000-4000-8000-000000000001'', ''Rogue Store'')'),
  '42501',
  'W4: staff cannot create stores'
);

select perform_as('authenticated', '33333333-3333-4333-8333-333333333333',
  'update public.customer_memberships set status = ''blocked'' where business_id = ''aaaaaaaa-0000-4000-8000-000000000001'''
);
select is(
  (select count(*)::int from public.customer_memberships where status = 'blocked'), 0,
  'W6: staff cannot change membership status'
);

select is(
  extensions.sqlstate_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'insert into public.customer_memberships (business_id, display_name) values (''aaaaaaaa-0000-4000-8000-000000000001'', ''Self Enroll'')'),
  '42501',
  'W5: customers cannot create memberships'
);

select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'insert into public.business_memberships (business_id, profile_id, role) values (''aaaaaaaa-0000-4000-8000-000000000001'', ''55555555-5555-4555-8555-555555555555'', ''staff'')'),
  '42501',
  'W7: direct business_membership INSERT denied for everyone (RPC-only)'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'insert into public.audit_logs (action) values (''forged.entry'')'),
  '42501',
  'W7: direct audit INSERT denied'
);

select perform_as('authenticated', '88888888-8888-4888-8888-888888888888',
  'update public.businesses set name = ''Owner Edit'' where id = ''aaaaaaaa-0000-4000-8000-000000000001'''
);
select is(
  (select name from public.businesses where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'Owner Edit',
  'W2: owner updates their own business'
);
update public.businesses set name = 'Ambika Electricals' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
update public.profiles set display_name = 'Rahul Sharma' where id = '55555555-5555-4555-8555-555555555555';

-- Audit immutability — enforced even against the table owner (postgres)
select throws_ok(
  $$ update public.audit_logs set action = 'tampered.hack' where action = 'business.created' $$,
  '42501', null,
  'S9: audit_logs UPDATE rejected'
);
select throws_ok(
  $$ delete from public.audit_logs where action = 'business.created' $$,
  '42501', null,
  'S9: audit_logs DELETE rejected'
);

-- ---------------------------------------------------------------------------
-- RPC boundaries
-- ---------------------------------------------------------------------------
select is(
  extensions.sqlstate_as('authenticated', null,
    'select * from public.create_invitation(''aaaaaaaa-0000-4000-8000-000000000001'', ''x@ambika.local'', ''staff'')'),
  '28000',
  'R1: unauthenticated invitation RPC rejected'
);
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    'select * from public.create_invitation(''aaaaaaaa-0000-4000-8000-000000000001'', ''r3@ambika.local'', ''staff'')'),
  '42501',
  'R3: manager cannot create invitations (owner-only)'
);

-- Owner creates an invitation; raw token captured into a test GUC (once).
select perform_as('authenticated', '88888888-8888-4888-8888-888888888888',
  'select set_config(''app.test_token'', token, true) from public.create_invitation('
  || '''aaaaaaaa-0000-4000-8000-000000000001'', ''pgtap-invitee@ambika.local'', ''staff'')'
);

select is(
  length(current_setting('app.test_token', true)), 64,
  'R2: raw invitation token returned once (64 hex chars)'
);
select ok(
  exists (
    select 1 from public.invitations i
    where i.token_hash = encode(extensions.digest(current_setting('app.test_token', true), 'sha256'), 'hex')
      and i.token_hash <> current_setting('app.test_token', true)
      and i.status = 'pending'
  ),
  'R2: only the SHA-256 hash is stored'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select * from public.create_invitation(''aaaaaaaa-0000-4000-8000-000000000001'', ''PGTAP-INVITEE@ambika.local'', ''staff'')'),
  '23505',
  'R5: duplicate pending invitation rejected (case-insensitive)'
);

-- Invitee accepts → membership bound to intended business/role; token single-use
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', '71000000-1111-4000-8000-000000000001', 'authenticated', 'authenticated',
        'pgtap-invitee@ambika.local', '!', now(), '{"full_name":"PgTap Invitee"}'::jsonb);

select is(
  extensions.text_as('authenticated', '71000000-1111-4000-8000-000000000001',
    'select public.accept_invitation(current_setting(''app.test_token'', true)) ->> ''role'''),
  'staff',
  'R6: accept binds the invited role exactly'
);
select is(
  (select role::text from public.business_memberships where profile_id = '71000000-1111-4000-8000-000000000001'),
  'staff',
  'R6: business membership created for the invitee'
);
select is(
  extensions.sqlstate_as('authenticated', '71000000-1111-4000-8000-000000000001',
    'select public.accept_invitation(current_setting(''app.test_token'', true))'),
  '22023',
  'R7: invitation token is single-use'
);

-- Cleanup temporary invitee
delete from public.store_memberships where profile_id = '71000000-1111-4000-8000-000000000001';
delete from public.business_memberships where profile_id = '71000000-1111-4000-8000-000000000001';
delete from public.invitations where email = 'pgtap-invitee@ambika.local';
delete from auth.users where id = '71000000-1111-4000-8000-000000000001';

select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    'select public.remove_member(''aaaaaaaa-0000-4000-8000-000000000001'', ''33333333-3333-4333-8333-333333333333'')'),
  '42501',
  'R12: manager cannot remove members (owner-only)'
);
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    'select public.change_member_role(''aaaaaaaa-0000-4000-8000-000000000001'', ''33333333-3333-4333-8333-333333333333'', ''manager'')'),
  '42501',
  'R11: manager cannot change roles (owner-only)'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select public.remove_member(''aaaaaaaa-0000-4000-8000-000000000001'', ''88888888-8888-4888-8888-888888888888'')'),
  '22023',
  'R12: owner cannot remove themselves'
);
select perform_as('authenticated', '88888888-8888-4888-8888-888888888888',
  'select public.change_member_role(''aaaaaaaa-0000-4000-8000-000000000001'', ''33333333-3333-4333-8333-333333333333'', ''manager'')'
);
select is(
  (select role::text from public.business_memberships
    where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and profile_id = '33333333-3333-4333-8333-333333333333'),
  'manager',
  'R11: owner role change persists'
);
select perform_as('authenticated', '88888888-8888-4888-8888-888888888888',
  'select public.change_member_role(''aaaaaaaa-0000-4000-8000-000000000001'', ''33333333-3333-4333-8333-333333333333'', ''staff'')'
);

-- ---------------------------------------------------------------------------
-- anon role: nothing at all
-- ---------------------------------------------------------------------------
select is(
  extensions.sqlstate_as('anon', null, 'select count(*) from public.profiles'),
  '42501',
  'A1: anon cannot read profiles'
);
select is(
  extensions.sqlstate_as('anon', null, 'select count(*) from public.businesses'),
  '42501',
  'A1: anon cannot read businesses'
);


-- ---------------------------------------------------------------------------
-- L series — points ledger (Slice 1): append-only, RPC-only writes, cache in
-- sync, staff+/manager+/owner boundaries, tenant isolation. The whole suite
-- runs inside one rolled-back transaction, so the fixture membership and its
-- immutable rows disappear on rollback.
-- ---------------------------------------------------------------------------
insert into public.customer_memberships (business_id, profile_id, display_name, status)
values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'PGTAP Ledger Member', 'active');
select set_config('app.ledger_mem', id::text, true)
  from public.customer_memberships where display_name = 'PGTAP Ledger Member';

select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.award_points(''aaaaaaaa-0000-4000-8000-000000000001'', %L::uuid, 120, ''sale'', null, ''bbbbbbbb-0000-4000-8000-000000000001'', ''pgtap-l1'', null)',
           current_setting('app.ledger_mem', true))),
  'NO_ERROR',
  'L1: store-scoped staff can award points into their store'
);
select is(
  (select current_points from public.customer_points_balance
    where customer_membership_id = current_setting('app.ledger_mem', true)::uuid),
  120,
  'L1: balance cache reflects the award'
);
select ok(
  exists (select 1 from public.audit_logs where action = 'points.awarded'),
  'L1: the award is audited'
);
select is(
  extensions.sqlstate_as('authenticated', '55555555-5555-4555-8555-555555555555',
    format('select public.award_points(''aaaaaaaa-0000-4000-8000-000000000001'', %L::uuid, 500, ''manual'')',
           current_setting('app.ledger_mem', true))),
  '42501',
  'L2: customers cannot award points'
);
select is(
  extensions.sqlstate_as('authenticated', '99999999-9999-4999-8999-999999999999',
    format('select public.award_points(''aaaaaaaa-0000-4000-8000-000000000001'', %L::uuid, 500, ''manual'')',
           current_setting('app.ledger_mem', true))),
  '42501',
  'L2: other-tenant owners cannot award points'
);
select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.award_points(''aaaaaaaa-0000-4000-8000-000000000001'', %L::uuid, 40, ''sale'', null, ''bbbbbbbb-0000-4000-8000-000000000002'', ''pgtap-l3'', null)',
           current_setting('app.ledger_mem', true))),
  '42501',
  'L3: store-scoped staff cannot award outside their stores'
);
select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.award_points(''aaaaaaaa-0000-4000-8000-000000000001'', %L::uuid, 120, ''sale'', null, ''bbbbbbbb-0000-4000-8000-000000000001'', ''pgtap-l1'', null)',
           current_setting('app.ledger_mem', true))),
  'NO_ERROR',
  'L4: replaying an idempotency key succeeds without error'
);
select is(
  (select count(*)::int from public.points_ledger where idempotency_key = 'pgtap-l1'),
  1,
  'L4: a replayed award does not double-post'
);
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    format('select public.spend_points(''aaaaaaaa-0000-4000-8000-000000000001'', %L::uuid, 50, ''redemption'', null, null, ''pgtap-l5-spend'', null)',
           current_setting('app.ledger_mem', true))),
  'NO_ERROR',
  'L5: managers can spend member points'
);
select is(
  (select points from public.points_ledger where idempotency_key = 'pgtap-l5-spend'),
  -50,
  'L5: spends are stored as negative entries'
);
select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.spend_points(''aaaaaaaa-0000-4000-8000-000000000001'', %L::uuid, 10, ''redemption'', null, null, ''pgtap-l5-staff'', null)',
           current_setting('app.ledger_mem', true))),
  '42501',
  'L5: staff cannot spend member points'
);
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    format('select public.spend_points(''aaaaaaaa-0000-4000-8000-000000000001'', %L::uuid, 100000, ''redemption'', null, null, ''pgtap-l6'', null)',
           current_setting('app.ledger_mem', true))),
  '22023',
  'L6: overspending is refused (insufficient_points)'
);
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    format('select public.adjust_points(''aaaaaaaa-0000-4000-8000-000000000001'', %L::uuid, -30, ''manager correction'')',
           current_setting('app.ledger_mem', true))),
  '42501',
  'L7: managers cannot adjust points'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    format('select public.adjust_points(''aaaaaaaa-0000-4000-8000-000000000001'', %L::uuid, -30, ''   '')',
           current_setting('app.ledger_mem', true))),
  '22023',
  'L7: adjustments require a real reason'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    format('select public.adjust_points(''aaaaaaaa-0000-4000-8000-000000000001'', %L::uuid, -20, ''Goodwill correction'', ''pgtap-l7'')',
           current_setting('app.ledger_mem', true))),
  'NO_ERROR',
  'L7: the owner can adjust points with a reason'
);
select is(
  (select current_points from public.customer_points_balance
    where customer_membership_id = current_setting('app.ledger_mem', true)::uuid),
  50,
  'L7: earn/spend/adjust keep the cache exact (120-50-20)'
);
select is(
  extensions.sqlstate_as('postgres', null,
    format('update public.points_ledger set points = 1 where customer_membership_id = %L::uuid',
           current_setting('app.ledger_mem', true))),
  '22023',
  'L8: the ledger is immutable even for postgres'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    format('delete from public.points_ledger where customer_membership_id = %L::uuid',
           current_setting('app.ledger_mem', true))),
  '42501',
  'L8: API roles have no ledger DML grants at all'
);
select is(
  extensions.count_as('authenticated', '55555555-5555-4555-8555-555555555555',
    format('select count(*) from public.points_ledger where customer_membership_id = %L::uuid',
           current_setting('app.ledger_mem', true)))::int,
  0,
  'L9: customers cannot read ledger rows of memberships that are not theirs'
);
select is(
  extensions.count_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select count(*) from public.points_ledger where customer_membership_id = %L::uuid',
           current_setting('app.ledger_mem', true)))::int,
  3,
  'L9: staff see their whole business ledger (earn+spend+adjust)'
);
select is(
  extensions.count_as('authenticated', '99999999-9999-4999-8999-999999999999',
    format('select count(*) from public.points_ledger where customer_membership_id = %L::uuid',
           current_setting('app.ledger_mem', true)))::int,
  0,
  'L9: other tenants never see the ledger'
);

-- ---------------------------------------------------------------------------
-- SA series — server-authoritative sales (Slice 2). The suite transaction is
-- rolled back, so fixture sales/members vanish cleanly.
-- pgtap-sa1 sells into Rahul's SEEDED membership (deterministic 420-point
-- balance from seed.sql), so post-sale cache assertions are absolute.
-- ---------------------------------------------------------------------------
select set_config('app.sale_mem', id::text, true)
  from public.customer_memberships
 where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and membership_no = 'AE-DEVRAHUL1';

select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.create_sale(''bbbbbbbb-0000-4000-8000-000000000001'',
      ''[{"name":"Wiring kit","qty":1,"unit_price_paise":100000},{"name":"LED bulb 9W","qty":5,"unit_price_paise":5000}]''::jsonb,
      ''[{"method":"upi","amount_paise":125000}]''::jsonb, %L::uuid, 0, ''pgtap-sa1'')',
      current_setting('app.sale_mem', true))),
  'NO_ERROR',
  'SA1: staff records a member sale'
);
select is(
  (select total_paise from public.sales where idempotency_key = 'pgtap-sa1'),
  125000::bigint,
  'SA1: totals are computed server-side'
);
select is(
  (select base_points from public.sales where idempotency_key = 'pgtap-sa1'),
  125,
  'SA1: launch policy points (Rs100 -> 10 pts) on Rs1,250'
);
select is(
  (select current_points from public.customer_points_balance
    where customer_membership_id = current_setting('app.sale_mem', true)::uuid),
  545,
  'SA1: balance cache = seed 420 + 125'
);
select ok(
  exists (select 1 from public.audit_logs al
           join public.sales s on s.id::text = al.target_id
          where al.action = 'sale.created' and s.idempotency_key = 'pgtap-sa1'),
  'SA1: sale creation is audited'
);

select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select public.create_sale(''bbbbbbbb-0000-4000-8000-000000000001'',
      ''[{"name":"MCB 32A","qty":2,"unit_price_paise":45000}]''::jsonb,
      ''[{"method":"cash","amount_paise":90000}]''::jsonb, null, 0, ''pgtap-sa2'')'),
  'NO_ERROR',
  'SA2: walk-in sale succeeds'
);
select is(
  (select total_points from public.sales where idempotency_key = 'pgtap-sa2'),
  0,
  'SA2: walk-ins earn no points'
);

select is(
  extensions.sqlstate_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select public.create_sale(''bbbbbbbb-0000-4000-8000-000000000001'',
      ''[{"name":"x","qty":1,"unit_price_paise":100}]''::jsonb,
      ''[{"method":"cash","amount_paise":100}]''::jsonb, null, 0, ''pgtap-sa3-cust'')'),
  '42501',
  'SA3: customers cannot record sales'
);
select is(
  extensions.sqlstate_as('authenticated', '99999999-9999-4999-8999-999999999999',
    'select public.create_sale(''bbbbbbbb-0000-4000-8000-000000000001'',
      ''[{"name":"x","qty":1,"unit_price_paise":100}]''::jsonb,
      ''[{"method":"cash","amount_paise":100}]''::jsonb, null, 0, ''pgtap-sa3-volt'')'),
  '42501',
  'SA3: other tenants cannot record sales'
);
select is(
  extensions.sqlstate_as('authenticated', '44444444-4444-4444-8444-444444444444',
    'select public.create_sale(''bbbbbbbb-0000-4000-8000-000000000001'',
      ''[{"name":"x","qty":1,"unit_price_paise":100}]''::jsonb,
      ''[{"method":"cash","amount_paise":100}]''::jsonb, null, 0, ''pgtap-sa3-scope'')'),
  '42501',
  'SA3: store-scoped staff cannot sell outside their stores'
);

select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select public.create_sale(''bbbbbbbb-0000-4000-8000-000000000001'',
      ''[{"name":"x","qty":1,"unit_price_paise":10000}]''::jsonb,
      ''[{"method":"cash","amount_paise":9999}]''::jsonb, null, 0, ''pgtap-sa5'')'),
  '22023',
  'SA5: payments must equal the server-computed total'
);

select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.create_sale(''bbbbbbbb-0000-4000-8000-000000000001'',
      ''[{"name":"Cable","qty":1,"unit_price_paise":50000}]''::jsonb,
      ''[{"method":"cash","amount_paise":50000}]''::jsonb, %L::uuid, 0, ''pgtap-sa7'')',
      current_setting('app.sale_mem', true))),
  'NO_ERROR',
  'SA7: fixture sale for voiding'
);
select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.void_sale((select id from public.sales where idempotency_key = ''pgtap-sa7''), ''staff attempt'')')),
  '42501',
  'SA7: staff cannot void sales'
);
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    format('select public.void_sale((select id from public.sales where idempotency_key = ''pgtap-sa7''), ''Billing mistake'')')),
  'NO_ERROR',
  'SA7: managers can void with a reason'
);
select is(
  (select status::text from public.sales where idempotency_key = 'pgtap-sa7'),
  'voided',
  'SA7: voided status is set (row never deleted)'
);
select ok(
  exists (select 1 from public.points_ledger l
           join public.sales s on s.id = l.source_id
          where s.idempotency_key = 'pgtap-sa7' and l.entry_type = 'adjust' and l.points < 0),
  'SA7: points are reversed via a compensating adjust entry'
);

select is(
  extensions.count_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select count(*) from public.sales where idempotency_key = ''pgtap-sa1''')::int,
  1,
  'SA8: customers see their own sales'
);
select is(
  extensions.count_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select count(*) from public.sales where idempotency_key = ''pgtap-sa2''')::int,
  0,
  'SA8: customers never see walk-in or other members'' sales'
);
select is(
  extensions.count_as('authenticated', '99999999-9999-4999-8999-999999999999',
    'select count(*) from public.sales where business_id = ''aaaaaaaa-0000-4000-8000-000000000001''')::int,
  0,
  'SA8: other tenants never see the sales'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'insert into public.sales (business_id, store_id, invoice_no, subtotal_paise, total_paise)
     values (''aaaaaaaa-0000-4000-8000-000000000001'', ''bbbbbbbb-0000-4000-8000-000000000001'', ''INV-999999'', 100, 100)'),
  '42501',
  'SA9: even owners cannot insert sales directly (RPC-only)'
);

-- ---------------------------------------------------------------------------
-- INV series — catalogue + per-store stock + append-only inventory movements
-- (Slice 3). Fixture product ₹100.00 (10000 paise), opening stock 10 at the
-- Main Store; walked 10 → 8 (sale) → 13 (receipt, replayed once) → 10 (adjust).
-- ---------------------------------------------------------------------------
select lives_ok(
  format('select extensions.perform_as(''authenticated'', ''22222222-2222-4222-8222-222222222222'', %L)',
    'select public.create_product(''aaaaaaaa-0000-4000-8000-000000000001'',
      ''pgTAP Inventory Fixture'', ''pgtap-inv-1'', 10000, null, null, null, ''piece'', null,
      ''[{"store_id":"bbbbbbbb-0000-4000-8000-000000000001","qty":10}]''::jsonb)'),
  'INV1: manager creates a catalogue product with opening stock'
);
select set_config('app.inv_prod', id::text, true)
  from public.products where sku = 'PGTAP-INV-1';

select is(
  (select on_hand from public.inventory_by_store
    where product_id = current_setting('app.inv_prod', true)::uuid
      and store_id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  10,
  'INV1: opening stock lands in inventory_by_store'
);
select ok(
  exists (select 1 from public.inventory_movements
           where product_id = current_setting('app.inv_prod', true)::uuid
             and reason = 'initial' and delta = 10 and balance_after = 10),
  'INV1: opening stock is backed by an initial movement'
);
select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select public.create_product(''aaaaaaaa-0000-4000-8000-000000000001'',
      ''Staff attempt'', ''pgtap-inv-staff'', 100)'),
  '42501',
  'INV1: staff cannot create products'
);
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    'select public.create_product(''aaaaaaaa-0000-4000-8000-000000000001'',
      ''Dup attempt'', ''PGTAP-INV-1'', 100)'),
  '22023',
  'INV1: duplicate sku is refused'
);

select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.create_sale(''bbbbbbbb-0000-4000-8000-000000000001'',
      ''[{"product_id":"%s","qty":1,"unit_price_paise":9000}]''::jsonb,
      ''[{"method":"cash","amount_paise":9000}]''::jsonb, null, 0, ''pgtap-inv-price'')',
      current_setting('app.inv_prod', true))),
  '22023',
  'INV2: staff cannot override the catalogue price'
);
select lives_ok(
  format('select extensions.perform_as(''authenticated'', ''33333333-3333-4333-8333-333333333333'', %L)',
    format('select public.create_sale(''bbbbbbbb-0000-4000-8000-000000000001'',
      ''[{"product_id":"%s","qty":2}]''::jsonb,
      ''[{"method":"cash","amount_paise":20000}]''::jsonb, null, 0, ''pgtap-inv-sale'')',
      current_setting('app.inv_prod', true))),
  'INV2: staff sells two units at the catalogue price'
);
select is(
  (select on_hand from public.inventory_by_store
    where product_id = current_setting('app.inv_prod', true)::uuid
      and store_id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  8,
  'INV2: the sale decremented stock'
);
select is(
  (select si.unit_price_paise from public.sale_items si
     join public.sales s on s.id = si.sale_id
    where s.idempotency_key = 'pgtap-inv-sale'),
  10000::bigint,
  'INV2: the line was re-priced from the catalogue server-side'
);
select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.create_sale(''bbbbbbbb-0000-4000-8000-000000000001'',
      ''[{"product_id":"%s","qty":999}]''::jsonb,
      ''[{"method":"cash","amount_paise":9990000}]''::jsonb, null, 0, ''pgtap-inv-stock'')',
      current_setting('app.inv_prod', true))),
  '22023',
  'INV3: overselling stock is refused'
);

select lives_ok(
  format('select extensions.perform_as(''authenticated'', ''22222222-2222-4222-8222-222222222222'', %L)',
    format('select public.receive_stock(''bbbbbbbb-0000-4000-8000-000000000001'',
      ''%s'', 5, ''Supplier delivery'', ''pgtap-inv-receive'')',
      current_setting('app.inv_prod', true))),
  'INV4: manager receives stock'
);
select lives_ok(
  format('select extensions.perform_as(''authenticated'', ''22222222-2222-4222-8222-222222222222'', %L)',
    format('select public.receive_stock(''bbbbbbbb-0000-4000-8000-000000000001'',
      ''%s'', 5, ''Supplier delivery'', ''pgtap-inv-receive'')',
      current_setting('app.inv_prod', true))),
  'INV4: the same receipt replays without double-posting'
);
select is(
  (select count(*) from public.inventory_movements
    where idempotency_key = 'pgtap-inv-receive'),
  1::bigint,
  'INV4: one receipt movement despite two calls'
);
select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.receive_stock(''bbbbbbbb-0000-4000-8000-000000000001'',
      ''%s'', 5, null, ''pgtap-inv-staff-receive'')',
      current_setting('app.inv_prod', true))),
  '42501',
  'INV4: staff cannot receive stock'
);
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    format('select public.adjust_stock(''bbbbbbbb-0000-4000-8000-000000000001'',
      ''%s'', -1, ''   '', ''pgtap-inv-noreason'')',
      current_setting('app.inv_prod', true))),
  '22023',
  'INV4: adjustments require a reason'
);
select lives_ok(
  format('select extensions.perform_as(''authenticated'', ''22222222-2222-4222-8222-222222222222'', %L)',
    format('select public.adjust_stock(''bbbbbbbb-0000-4000-8000-000000000001'',
      ''%s'', -3, ''Damaged in transit'', ''pgtap-inv-adjust'')',
      current_setting('app.inv_prod', true))),
  'INV4: manager adjusts stock down with a reason'
);
select is(
  (select on_hand from public.inventory_by_store
    where product_id = current_setting('app.inv_prod', true)::uuid
      and store_id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  10,
  'INV4: receipt (+5) and adjustment (−3) reconcile to 10'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    format('insert into public.inventory_movements
      (business_id, store_id, product_id, delta, balance_after, reason)
     values (''aaaaaaaa-0000-4000-8000-000000000001'', ''bbbbbbbb-0000-4000-8000-000000000001'',
             ''%s'', 1, 999, ''receipt'')',
      current_setting('app.inv_prod', true))),
  '42501',
  'INV6: even owners cannot insert movements directly (RPC-only)'
);

select is(
  extensions.count_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select count(*) from public.products
      where business_id = ''aaaaaaaa-0000-4000-8000-000000000001''')::int,
  0,
  'INV7: customers never see the catalogue (until the rewards slice)'
);
select is(
  extensions.count_as('authenticated', '99999999-9999-4999-8999-999999999999',
    'select count(*) from public.products
      where business_id = ''aaaaaaaa-0000-4000-8000-000000000001''')::int,
  0,
  'INV7: other tenants never see the catalogue'
);

-- ---------------------------------------------------------------------------
-- RE series — rewards catalogue, inventory holds, redemption lifecycle,
-- collection codes (§8.4), monthly limits and customer visibility
-- ---------------------------------------------------------------------------

-- Fixtures: an archive-target gift + an inventory-bound coupon + a
-- monthly-limited gift, all created through the manager-facing RPC.
select set_config('app.re_rahul',
  (select id::text from public.customer_memberships where membership_no = 'AE-DEVRAHUL1'), true);
select set_config('app.re_priya',
  (select id::text from public.customer_memberships where membership_no = 'AE-DEVPRIYA1'), true);

select set_config('app.re_fid',
  extensions.text_as('authenticated', '22222222-2222-4222-8222-222222222222',
    'select public.create_reward(''aaaaaaaa-0000-4000-8000-000000000001'',
       ''PGTAP Test Gift'', ''gift'', 30, ''Archive fixture'', null, null, null,
       30, null, ''[]''::jsonb)::text')::jsonb ->> 'reward_id', true);
select set_config('app.re_fid2',
  extensions.text_as('authenticated', '22222222-2222-4222-8222-222222222222',
    'select public.create_reward(''aaaaaaaa-0000-4000-8000-000000000001'',
       ''PGTAP Stock Coupon'', ''coupon'', 30, ''Inventory fixture'', null, null,
       null, 30, null, ''[]''::jsonb)::text')::jsonb ->> 'reward_id', true);
select set_config('app.re_fid3',
  extensions.text_as('authenticated', '22222222-2222-4222-8222-222222222222',
    'select public.create_reward(''aaaaaaaa-0000-4000-8000-000000000001'',
       ''PGTAP Monthly Gift'', ''gift'', 30, ''Limit fixture'', null, null, null,
       30, 1, ''[]''::jsonb)::text')::jsonb ->> 'reward_id', true);

select is(
  (select name from public.rewards where id = current_setting('app.re_fid', true)::uuid),
  'PGTAP Test Gift',
  'RE1: manager creates a reward through the RPC'
);
select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select public.create_reward(''aaaaaaaa-0000-4000-8000-000000000001'',
       ''Nope'', ''gift'', 30)'),
  '42501',
  'RE1: staff cannot create rewards'
);
select is(
  extensions.sqlstate_as('authenticated', '99999999-9999-4999-8999-999999999999',
    'select public.create_reward(''aaaaaaaa-0000-4000-8000-000000000001'',
       ''Nope'', ''gift'', 30)'),
  '42501',
  'RE1: other tenants cannot create rewards here'
);
select is(
  extensions.text_as('authenticated', '22222222-2222-4222-8222-222222222222',
    format('select public.update_reward(''%s''::uuid, p_status := ''archived'')::text',
      current_setting('app.re_fid', true)))::jsonb ->> 'status',
  'archived',
  'RE1: manager archives a reward (never deleted)'
);
select is(
  extensions.sqlstate_as('authenticated', '55555555-5555-4555-8555-555555555555',
    format('select public.redeem_reward(''%s''::uuid,
       (select id from public.customer_memberships
         where membership_no = ''AE-DEVRAHUL1''), null, 1, ''pgtap-re-archived'')',
      current_setting('app.re_fid', true))),
  '22023',
  'RE1: archived rewards are not redeemable'
);
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    format('select public.set_reward_inventory(''%s''::uuid,
       ''bbbbbbbb-0000-4000-8000-000000000001'', -5)',
      current_setting('app.re_fid2', true))),
  '22023',
  'RE1: negative inventory refused'
);
select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.set_reward_inventory(''%s''::uuid,
       ''bbbbbbbb-0000-4000-8000-000000000001'', 5)',
      current_setting('app.re_fid2', true))),
  '42501',
  'RE1: staff cannot set reward inventory'
);

-- RE2: a customer redeems the seeded unlimited ₹100 coupon end to end.
select is(
  extensions.text_as('authenticated', '22222222-2222-4222-8222-222222222222',
    format('select public.set_reward_inventory(''%s''::uuid,
       ''bbbbbbbb-0000-4000-8000-000000000001'', 2)::text',
      current_setting('app.re_fid2', true)))::jsonb ->> 'on_hand_after',
  '2',
  'RE2: manager sets Main Store stock for the fixture coupon'
);
select extensions.perform_as('authenticated', '22222222-2222-4222-8222-222222222222',
  format('select public.set_reward_inventory(''%s''::uuid,
     ''bbbbbbbb-0000-4000-8000-000000000002'', 0)',
    current_setting('app.re_fid2', true)));
select set_config('app.re_bal_r2',
  coalesce((select current_points from public.customer_points_balance
             where customer_membership_id = (select id from public.customer_memberships
                                              where membership_no = 'AE-DEVRAHUL1')), 0)::text, true);
select set_config('app.re_res1',
  extensions.text_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select public.redeem_reward(''dddddddd-0000-4000-8000-000000000003'',
       (select id from public.customer_memberships
         where membership_no = ''AE-DEVRAHUL1''), null, 1, ''pgtap-re-redeem-1'')::text'), true);
select is(
  current_setting('app.re_res1', true)::jsonb ->> 'status', 'pending',
  'RE2: customer redeems — pending with a one-time code'
);
select ok(
  current_setting('app.re_res1', true)::jsonb ->> 'code' ~ '^[0-9A-HJKMNP-TV-Z]{8}$',
  'RE2: collection code is 8 Crockford base-32 characters'
);
select ok(
  current_setting('app.re_res1', true)::jsonb ->> 'reference' ~ '^RDM-[0-9]{4}$',
  'RE2: reference is RDM-####'
);
select is(
  (select current_points from public.customer_points_balance
    where customer_membership_id = (select id from public.customer_memberships
                                     where membership_no = 'AE-DEVRAHUL1'))
    - current_setting('app.re_bal_r2', true)::int,
  -100,
  'RE2: exactly 100 points spent'
);
select is(
  (select count(*) from public.points_ledger
    where idempotency_key = 'redemption:' || (current_setting('app.re_res1', true)::jsonb ->> 'redemption_id'))::int,
  1,
  'RE2: one redeem ledger entry, idempotency-keyed'
);
select is(
  (select count(*) from public.audit_logs where action = 'redemption.created')::int,
  1,
  'RE2: redemption creation audited'
);

-- RE3: insufficient balance persists nothing.
select is(
  extensions.sqlstate_as('authenticated', '66666666-6666-4666-8666-666666666666',
    'select public.redeem_reward(''dddddddd-0000-4000-8000-000000000005'',
       (select id from public.customer_memberships
         where membership_no = ''AE-DEVPRIYA1''), null, 1, ''pgtap-re-poor'')'),
  '22023',
  'RE3: insufficient points refused (Priya holds 150 < 890)'
);
select is(
  (select count(*) from public.redemptions)::int, 1,
  'RE3: failed redeem persisted nothing'
);

-- RE5: cross-member / cross-store / cross-tenant denials.
select is(
  extensions.sqlstate_as('authenticated', '66666666-6666-4666-8666-666666666666',
    format('select public.redeem_reward(''dddddddd-0000-4000-8000-000000000003'',
       ''%s''::uuid, null, 1, ''pgtap-re-other'')',
      current_setting('app.re_rahul', true))),
  '42501',
  'RE5: customer cannot redeem for another member'
);
select is(
  extensions.sqlstate_as('authenticated', '55555555-5555-4555-8555-555555555555',
    format('select public.redeem_reward(''%s''::uuid,
       (select id from public.customer_memberships
         where membership_no = ''AE-DEVRAHUL1''),
       ''bbbbbbbb-0000-4000-8000-000000000002'', 1, ''pgtap-re-sat'')',
      current_setting('app.re_fid2', true))),
  '22023',
  'RE5: satellite store has zero stock — refused'
);
select is(
  extensions.sqlstate_as('authenticated', '99999999-9999-4999-8999-999999999999',
    format('select public.redeem_reward(''%s''::uuid, ''%s''::uuid,
       ''bbbbbbbb-0000-4000-8000-000000000001'', 1, ''pgtap-re-volt'')',
      current_setting('app.re_fid2', true),
      current_setting('app.re_rahul', true))),
  '42501',
  'RE5: other tenants cannot redeem Ambika rewards'
);

-- RE2b: staff redeem on behalf of a member; the hold lands on the exact row.
select set_config('app.re_res2',
  extensions.text_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.redeem_reward(''%s''::uuid,
       (select id from public.customer_memberships
         where membership_no = ''AE-DEVRAHUL1''),
       ''bbbbbbbb-0000-4000-8000-000000000001'', 1, ''pgtap-re-staff-1'')::text',
      current_setting('app.re_fid2', true))), true);
select is(
  current_setting('app.re_res2', true)::jsonb ->> 'status', 'pending',
  'RE2: staff redeems on behalf of a member'
);
select is(
  (select reserved from public.reward_inventory
    where reward_id = current_setting('app.re_fid2', true)::uuid
      and store_id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  1,
  'RE2: reservation recorded on the Main Store row'
);

-- RE6: counter collection — staff-only, code-gated, stock-debiting.
select is(
  extensions.sqlstate_as('authenticated', '55555555-5555-4555-8555-555555555555',
    format('select public.collect_redemption(''%s''::uuid, ''AAAAAAAA'')',
      current_setting('app.re_res2', true)::jsonb ->> 'redemption_id')),
  '42501',
  'RE6: customers cannot collect'
);
select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.collect_redemption(''%s''::uuid, ''ZZZZZZZZ'')',
      current_setting('app.re_res2', true)::jsonb ->> 'redemption_id')),
  '22023',
  'RE6: wrong code refused'
);
select set_config('app.re_col',
  extensions.text_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.collect_redemption(''%s''::uuid, %L)::text',
      current_setting('app.re_res2', true)::jsonb ->> 'redemption_id',
      lower(current_setting('app.re_res2', true)::jsonb ->> 'code'))), true);
select is(
  current_setting('app.re_col', true)::jsonb ->> 'status', 'collected',
  'RE6: lowercase code normalized and accepted'
);
select is(
  (select on_hand from public.reward_inventory
    where reward_id = current_setting('app.re_fid2', true)::uuid
      and store_id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  1,
  'RE6: stock debited on collection (2 → 1)'
);
select is(
  (select reserved from public.reward_inventory
    where reward_id = current_setting('app.re_fid2', true)::uuid
      and store_id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  0,
  'RE6: reservation cleared on collection'
);
select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.collect_redemption(''%s''::uuid, %L)',
      current_setting('app.re_res2', true)::jsonb ->> 'redemption_id',
      current_setting('app.re_res2', true)::jsonb ->> 'code')),
  '22023',
  'RE6: double collect refused'
);
select is(
  (select count(*) from public.audit_logs where action = 'redemption.collected')::int,
  1,
  'RE6: collection audited once'
);

-- RE6b: lazy expiry — marking, releasing and auditing survive because the
-- RPC RETURNS the expired status instead of raising.
select set_config('app.re_res3',
  extensions.text_as('authenticated', '55555555-5555-4555-8555-555555555555',
    format('select public.redeem_reward(''%s''::uuid,
       (select id from public.customer_memberships
         where membership_no = ''AE-DEVRAHUL1''),
       ''bbbbbbbb-0000-4000-8000-000000000001'', 1, ''pgtap-re-expiry'')::text',
      current_setting('app.re_fid2', true))), true);
update public.redemptions
   set expires_at = now() - interval '1 hour'
 where id = (current_setting('app.re_res3', true)::jsonb ->> 'redemption_id')::uuid;
select set_config('app.re_exp',
  extensions.text_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.collect_redemption(''%s''::uuid, %L)::text',
      current_setting('app.re_res3', true)::jsonb ->> 'redemption_id',
      current_setting('app.re_res3', true)::jsonb ->> 'code')), true);
select is(
  current_setting('app.re_exp', true)::jsonb ->> 'status', 'expired',
  'RE6b: lazy expiry returns expired instead of raising'
);
select is(
  (select status::text from public.redemptions
    where id = (current_setting('app.re_res3', true)::jsonb ->> 'redemption_id')::uuid),
  'expired',
  'RE6b: expiry persisted on the row'
);
select is(
  (select reserved from public.reward_inventory
    where reward_id = current_setting('app.re_fid2', true)::uuid
      and store_id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  0,
  'RE6b: expired hold released'
);
select is(
  (select count(*) from public.audit_logs where action = 'redemption.expired')::int,
  1,
  'RE6b: expiry audited'
);

-- RE7 + RE8: cancellation refunds through the ledger; limits count only
-- pending/collected, so a cancelled redemption frees the monthly slot.
select set_config('app.re_res4',
  extensions.text_as('authenticated', '55555555-5555-4555-8555-555555555555',
    format('select public.redeem_reward(''%s''::uuid,
       (select id from public.customer_memberships
         where membership_no = ''AE-DEVRAHUL1''), null, 1, ''pgtap-re-limit-1'')::text',
      current_setting('app.re_fid3', true))), true);
select is(
  extensions.sqlstate_as('authenticated', '55555555-5555-4555-8555-555555555555',
    format('select public.redeem_reward(''%s''::uuid,
       (select id from public.customer_memberships
         where membership_no = ''AE-DEVRAHUL1''), null, 1, ''pgtap-re-limit-2'')',
      current_setting('app.re_fid3', true))),
  '22023',
  'RE8: monthly limit enforced while one is pending'
);
select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.cancel_redemption(''%s''::uuid, ''staff should not cancel'')',
      current_setting('app.re_res4', true)::jsonb ->> 'redemption_id')),
  '42501',
  'RE7: staff cannot cancel redemptions'
);
select is(
  extensions.sqlstate_as('authenticated', '55555555-5555-4555-8555-555555555555',
    format('select public.cancel_redemption(''%s''::uuid, ''   '')',
      current_setting('app.re_res4', true)::jsonb ->> 'redemption_id')),
  '22023',
  'RE7: cancellation requires a reason'
);
select set_config('app.re_bal_r7',
  (select current_points from public.customer_points_balance
    where customer_membership_id = (select id from public.customer_memberships
                                     where membership_no = 'AE-DEVRAHUL1'))::text, true);
select set_config('app.re_can',
  extensions.text_as('authenticated', '55555555-5555-4555-8555-555555555555',
    format('select public.cancel_redemption(''%s''::uuid, ''Changed my mind'')::text',
      current_setting('app.re_res4', true)::jsonb ->> 'redemption_id')), true);
select is(
  current_setting('app.re_can', true)::jsonb ->> 'points_refunded', '30',
  'RE7: customer cancels own pending redemption'
);
select is(
  (select current_points from public.customer_points_balance
    where customer_membership_id = (select id from public.customer_memberships
                                     where membership_no = 'AE-DEVRAHUL1'))
    - current_setting('app.re_bal_r7', true)::int,
  30,
  'RE7: points refunded to the balance'
);
select is(
  (select count(*) from public.points_ledger
    where idempotency_key like 'redemption-cancel:%')::int,
  1,
  'RE7: refund is one idempotency-keyed adjust entry'
);
select is(
  extensions.sqlstate_as('authenticated', '55555555-5555-4555-8555-555555555555',
    format('select public.cancel_redemption(''%s''::uuid, ''again'')',
      current_setting('app.re_res4', true)::jsonb ->> 'redemption_id')),
  '22023',
  'RE7: already-cancelled refused'
);
select is(
  (select count(*) from public.audit_logs where action = 'redemption.cancelled')::int,
  1,
  'RE7: cancellation audited'
);
select set_config('app.re_res5',
  extensions.text_as('authenticated', '55555555-5555-4555-8555-555555555555',
    format('select public.redeem_reward(''%s''::uuid,
       (select id from public.customer_memberships
         where membership_no = ''AE-DEVRAHUL1''), null, 1, ''pgtap-re-limit-3'')::text',
      current_setting('app.re_fid3', true))), true);
select is(
  current_setting('app.re_res5', true)::jsonb ->> 'status', 'pending',
  'RE8: cancellation frees the monthly slot'
);

-- RE9: visibility + RPC-only writes.
select is(
  extensions.count_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select count(*) from public.rewards
      where business_id = ''aaaaaaaa-0000-4000-8000-000000000001''')::int,
  7,
  'RE9: customer sees 5 seeded + 2 active fixture rewards (archived hidden)'
);
select is(
  extensions.count_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select count(*) from public.redemptions')::int,
  5,
  'RE9: customer sees only their own 5 redemptions'
);
select is(
  extensions.count_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select count(*) from public.reward_inventory')::int,
  0,
  'RE9: reward inventory is staff-only'
);
select is(
  extensions.sqlstate_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select count(*) from public.redemption_counters'),
  '42501',
  'RE9: reference counters unreadable by customers'
);
select is(
  extensions.sqlstate_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'insert into public.redemptions (business_id)
     values (''aaaaaaaa-0000-4000-8000-000000000001'')'),
  '42501',
  'RE9: no direct DML on redemptions (RPC-only)'
);


-- ---------------------------------------------------------------------------
-- Membership QR tokens (20260906160000_membership_qr_tokens.sql)
-- Mirrors cases QR1-QR8 of scripts/rls-check/10_assertions.sql.
-- ---------------------------------------------------------------------------

-- QR1: issuance shape, opacity and hashed-at-rest storage.
select set_config('app.qr_tok1',
  extensions.text_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select public.issue_membership_qr_token() ->> ''token'''), true);
select matches(
  current_setting('app.qr_tok1', true),
  '^RWD1[.][0-9A-HJKMNP-TV-Z]{16}[.][0-9A-HJKMNP-TV-Z]{26}$',
  'QR1: token is an opaque versioned selector.secret payload'
);
select is(
  (select count(*) from (select current_setting('app.qr_tok1', true) as t) x
    where x.t like '%AE-DEVRAHUL1%' or upper(x.t) like '%RAHUL%')::int,
  0,
  'QR1: payload carries no membership number or customer name'
);
select is(
  (select count(*) from public.membership_qr_tokens
    where selector = split_part(current_setting('app.qr_tok1', true), '.', 2)
      and verifier_hash = extensions.digest(
            salt || convert_to(split_part(current_setting('app.qr_tok1', true), '.', 3), 'UTF8'),
            'sha256'))::int,
  1,
  'QR1: only a salted sha256 verifier is persisted'
);
select ok(
  (select expires_at <= now() + interval '5 minutes'
     from public.membership_qr_tokens
    where selector = split_part(current_setting('app.qr_tok1', true), '.', 2)),
  'QR1: TTL is clamped to the 5 minute hard cap'
);
select is(
  extensions.sqlstate_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select count(*) from public.membership_qr_tokens'),
  '42501',
  'QR1: customers cannot read the token table'
);

-- Re-issuing supersedes the previous live token.
select set_config('app.qr_tok2',
  extensions.text_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select public.issue_membership_qr_token() ->> ''token'''), true);
select is(
  (select revoke_reason from public.membership_qr_tokens
    where selector = split_part(current_setting('app.qr_tok1', true), '.', 2)),
  'superseded',
  'QR1: issuing a new QR revokes the previous one'
);

-- QR2: authorized staff scan.
select set_config('app.qr_res1',
  extensions.text_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.verify_membership_qr_token(%L, ''bbbbbbbb-0000-4000-8000-000000000001'')::text',
      current_setting('app.qr_tok2', true))), true);
select is(
  current_setting('app.qr_res1', true)::jsonb ->> 'ok', 'true',
  'QR2: store-assigned cashier verifies successfully'
);
select is(
  current_setting('app.qr_res1', true)::jsonb ->> 'membership_no', 'AE-DEVRAHUL1',
  'QR2: verification resolves the right membership'
);
select is(
  (select count(*) from jsonb_object_keys(current_setting('app.qr_res1', true)::jsonb) k
    where k in ('email', 'phone', 'enrollment_data'))::int,
  0,
  'QR2: response is limited to counter-safe fields'
);
select is(
  (select count(*) from public.audit_logs
    where action = 'membership_qr.verified'
      and metadata ->> 'selector' = split_part(current_setting('app.qr_tok2', true), '.', 2))::int,
  1,
  'QR2: successful scan is audited by selector'
);
select is(
  (select count(*) from public.audit_logs
    where action like 'membership_qr%'
      and metadata::text like '%' || split_part(current_setting('app.qr_tok2', true), '.', 3) || '%')::int,
  0,
  'QR2: audit metadata never contains the token secret'
);
select is(
  extensions.text_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.verify_membership_qr_token(%L, ''bbbbbbbb-0000-4000-8000-000000000001'') ->> ''reason''',
      current_setting('app.qr_tok2', true))),
  'qr_already_used',
  'QR2: tokens are single use'
);

-- QR3: malformed / unknown / tampered payloads fail identically.
select is(
  extensions.text_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select public.verify_membership_qr_token(''not-a-token'', null) ->> ''reason'''),
  'qr_invalid',
  'QR3: malformed payload rejected'
);
select is(
  extensions.text_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select public.verify_membership_qr_token(
       ''RWD1.ZZZZZZZZZZZZZZZZ.ZZZZZZZZZZZZZZZZZZZZZZZZZZ'', null) ->> ''reason'''),
  'qr_invalid',
  'QR3: unknown selector rejected with the same opaque reason'
);
select ok(
  (select count(*) from public.qr_verification_attempts
    where actor_id = '33333333-3333-4333-8333-333333333333'
      and outcome = 'invalid') >= 2,
  'QR3: failed scans are recorded for the security trail'
);

-- QR4: expiry.
select set_config('app.qr_tok3',
  extensions.text_as('authenticated', '66666666-6666-4666-8666-666666666666',
    'select public.issue_membership_qr_token(null, 30) ->> ''token'''), true);
select lives_ok(
  format('update public.membership_qr_tokens
             set issued_at = now() - interval ''4 minutes'',
                 expires_at = now() - interval ''1 second''
           where selector = %L', split_part(current_setting('app.qr_tok3', true), '.', 2)),
  'QR4: age the token as the maintenance role'
);
select is(
  extensions.text_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.verify_membership_qr_token(%L, ''bbbbbbbb-0000-4000-8000-000000000001'') ->> ''reason''',
      current_setting('app.qr_tok3', true))),
  'qr_expired',
  'QR4: expired tokens are refused'
);

-- QR5: authorization before lifecycle; store scoping.
select set_config('app.qr_tok4',
  extensions.text_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select public.issue_membership_qr_token() ->> ''token'''), true);
select is(
  extensions.text_as('authenticated', '99999999-9999-4999-8999-999999999999',
    format('select public.verify_membership_qr_token(%L, null) ->> ''reason''',
      current_setting('app.qr_tok4', true))),
  'not_authorized',
  'QR5: foreign tenant owner cannot verify'
);
select is(
  extensions.text_as('authenticated', '66666666-6666-4666-8666-666666666666',
    format('select public.verify_membership_qr_token(%L, null) ->> ''reason''',
      current_setting('app.qr_tok4', true))),
  'not_authorized',
  'QR5: customers cannot act as scanners'
);
select is(
  extensions.text_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.verify_membership_qr_token(%L, ''bbbbbbbb-0000-4000-8000-000000000002'') ->> ''reason''',
      current_setting('app.qr_tok4', true))),
  'store_forbidden',
  'QR5: cashier cannot scan for an unassigned store'
);
select is(
  extensions.text_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.verify_membership_qr_token(%L, ''bbbbbbbb-0000-4000-8000-000000000009'') ->> ''reason''',
      current_setting('app.qr_tok4', true))),
  'store_not_in_business',
  'QR5: a store from another tenant is rejected'
);
select is(
  (select consumed_at from public.membership_qr_tokens
    where selector = split_part(current_setting('app.qr_tok4', true), '.', 2)),
  null::timestamptz,
  'QR5: denied attempts never consume the token'
);

-- QR6: customer revocation ("hide my QR").
select is(
  extensions.text_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select public.revoke_membership_qr_tokens(''lost_device'')::text'),
  '1',
  'QR6: revoke clears the live token'
);
select is(
  extensions.text_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.verify_membership_qr_token(%L, ''bbbbbbbb-0000-4000-8000-000000000001'') ->> ''reason''',
      current_setting('app.qr_tok4', true))),
  'qr_revoked',
  'QR6: revoked tokens are refused at the counter'
);
select is(
  (select count(*) from public.audit_logs
    where action = 'membership_qr.revoked'
      and business_id = 'aaaaaaaa-0000-4000-8000-000000000001'
      and metadata ->> 'reason' = 'lost_device')::int,
  1,
  'QR6: revocation is audited per business, without a selector'
);

-- QR7: grants.
select ok(
  not has_table_privilege('authenticated', 'public.membership_qr_tokens', 'INSERT')
  and not has_table_privilege('authenticated', 'public.membership_qr_tokens', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.qr_verification_attempts', 'INSERT'),
  'QR7: QR tables are RPC-only for API roles'
);
select ok(
  not has_function_privilege('anon', 'public.verify_membership_qr_token(text, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.issue_membership_qr_token(uuid, integer)', 'EXECUTE'),
  'QR7: anonymous callers cannot issue or verify'
);

-- QR8: attempts are append-only and manager-scoped.
select is(
  extensions.sqlstate_as('postgres', null,
    'update public.qr_verification_attempts set outcome = ''verified'''),
  '42501',
  'QR8: verification attempts are append-only'
);
select ok(
  extensions.count_as('authenticated', '22222222-2222-4222-8222-222222222222',
    'select count(*) from public.qr_verification_attempts') > 0,
  'QR8: managers can review the scan trail'
);
select is(
  extensions.count_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select count(*) from public.qr_verification_attempts'),
  0::bigint,
  'QR8: cashiers cannot read the scan trail'
);


-- ---------------------------------------------------------------------------
-- Versioned loyalty rule engine (20260906170000_loyalty_rules.sql)
-- Mirrors cases LR1-LR8 of scripts/rls-check/10_assertions.sql.
-- ---------------------------------------------------------------------------

-- LR1: launch policy installed for every business; history stamped.
select is(
  (select v.earn_spend_paise || ':' || v.earn_points || ':' || v.point_value_paise
     from public.loyalty_rule_versions v
     join public.loyalty_rules r on r.id = v.rule_id
    where r.business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and v.version = 1),
  '10000:10:10',
  'LR1: launch policy is Rs100 -> 10 points, 1 point = 10 paise'
);
select is(
  (select v.points_expiry_days
     from public.loyalty_rule_versions v
     join public.loyalty_rules r on r.id = v.rule_id
    where r.business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and v.version = 1),
  null::integer,
  'LR1: no points expiry at launch'
);
select is(
  (select count(*) from public.loyalty_rules
    where business_id = 'aaaaaaaa-0000-4000-8000-000000000002')::int,
  1,
  'LR1: the second tenant gets its own independent rule series'
);
select is(
  (select count(*) from public.sales where loyalty_rule_version_id is null)::int,
  0,
  'LR1: every sale is stamped with the version that priced it'
);
select is(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses'
      and column_name in ('earn_spend_paise', 'earn_points'))::int,
  0,
  'LR1: the hard-coded earn columns are gone from businesses'
);

-- LR2: owner-only.
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    'select public.set_loyalty_rule(null, 20000, 10, 10, 0, null, ''manager'')'),
  '42501',
  'LR2: a manager cannot change the loyalty rule'
);
select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select public.set_loyalty_rule(null, 20000, 10, 10, 0, null, ''staff'')'),
  '42501',
  'LR2: a cashier cannot change the loyalty rule'
);
select is(
  extensions.sqlstate_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select public.set_loyalty_rule(null, 20000, 10, 10, 0, null, ''customer'')'),
  '42501',
  'LR2: a customer cannot change the loyalty rule'
);
select is(
  extensions.sqlstate_as('authenticated', '99999999-9999-4999-8999-999999999999',
    'select public.set_loyalty_rule(''aaaaaaaa-0000-4000-8000-000000000001'',
       20000, 10, 10, 0, null, ''cross tenant'')'),
  '42501',
  'LR2: another tenant''s owner cannot change our rule'
);

-- LR3: invalid configuration fails safely.
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select public.set_loyalty_rule(null, 50, 10, 10, 0, null, ''tiny'')'),
  '22023',
  'LR3: a sub-rupee spend threshold is refused'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select public.set_loyalty_rule(null, 10000, 5000, 10, 0, null, ''greedy'')'),
  '22023',
  'LR3: 5000 points per step is refused'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select public.set_loyalty_rule(null, null, null, 10, 0, null, ''nulls'')'),
  '22023',
  'LR3: a missing rate is refused'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select public.set_loyalty_rule(null, 10000, 10, 10, 0, now() - interval ''2 days'', ''backdate'')'),
  '22023',
  'LR3: backdating (which would re-price settled history) is refused'
);
select is(
  (select count(*) from public.loyalty_rule_versions v
     join public.loyalty_rules r on r.id = v.rule_id
    where r.business_id = 'aaaaaaaa-0000-4000-8000-000000000001')::int,
  1,
  'LR3: no invalid attempt wrote a version'
);

-- LR4: an owner edit appends v2 and closes v1.
select set_config('app.lr_v2',
  extensions.text_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select public.set_loyalty_rule(null, 5000, 10, 10, 10000, null, ''Festive rate'')::text'), true);
select is(
  current_setting('app.lr_v2', true)::jsonb ->> 'version', '2',
  'LR4: the edit appends version 2'
);
select is(
  current_setting('app.lr_v2', true)::jsonb ->> 'superseded_version', '1',
  'LR4: version 1 is reported superseded'
);
select is(
  (select v.status::text || ':' || (v.effective_to is not null)::text
     from public.loyalty_rule_versions v
     join public.loyalty_rules r on r.id = v.rule_id
    where r.business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and v.version = 1),
  'superseded:true',
  'LR4: version 1 is closed, not rewritten'
);
select is(
  (select v.earn_spend_paise || ':' || v.earn_points
     from public.loyalty_rule_versions v
     join public.loyalty_rules r on r.id = v.rule_id
    where r.business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and v.version = 1),
  '10000:10',
  'LR4: version 1 economics are untouched'
);
select is(
  (select count(*) from public.loyalty_rule_versions v
     join public.loyalty_rules r on r.id = v.rule_id
    where r.business_id = 'aaaaaaaa-0000-4000-8000-000000000001'
      and v.effective_to is null)::int,
  1,
  'LR4: exactly one open window survives'
);
select is(
  (select count(*) from public.audit_logs
    where action = 'loyalty_rule.version_created'
      and (metadata ->> 'version')::int = 2
      and (metadata -> 'from' ->> 'earn_spend_paise')::bigint = 10000)::int,
  1,
  'LR4: the change is audited with before and after'
);

-- LR5: history keeps its version; new sales use the current one.
select is(
  (select v.version from public.sales s
     join public.loyalty_rule_versions v on v.id = s.loyalty_rule_version_id
    where s.idempotency_key = 'pgtap-sa1'),
  1,
  'LR5: the pre-change sale is still pinned to version 1'
);
select set_config('app.lr_sale2',
  extensions.text_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select public.create_sale(
       ''bbbbbbbb-0000-4000-8000-000000000001'',
       ''[{"name":"Wiring kit","qty":1,"unit_price_paise":125000}]''::jsonb,
       ''[{"method":"cash","amount_paise":125000}]''::jsonb,
       (select id from public.customer_memberships where membership_no = ''AE-DEVRAHUL1''),
       0, ''pgtap-lr5'')::text'), true);
select is(
  current_setting('app.lr_sale2', true)::jsonb -> 'points' ->> 'base', '250',
  'LR5: the new sale earns at the v2 rate (Rs50 -> 10 pts)'
);
select is(
  current_setting('app.lr_sale2', true)::jsonb ->> 'loyalty_rule_version', '2',
  'LR5: the new sale is stamped with version 2'
);
select is(
  (select l.loyalty_rule_version_id from public.points_ledger l
    where l.source_id = (current_setting('app.lr_sale2', true)::jsonb ->> 'sale_id')::uuid
      and l.source_type = 'sale'),
  (current_setting('app.lr_sale2', true)::jsonb ->> 'loyalty_rule_version_id')::uuid,
  'LR5: the ledger entry inherits the sale''s version'
);
select is(
  (select s.total_points from public.sales s where s.idempotency_key = 'pgtap-sa1'),
  125,
  'LR5: the historic sale''s points were not recalculated'
);

-- LR6: immutability.
select is(
  extensions.sqlstate_as('postgres', null,
    'update public.loyalty_rule_versions set earn_points = 999'),
  '42501',
  'LR6: rule economics cannot be rewritten, even by postgres'
);
select is(
  extensions.sqlstate_as('postgres', null,
    'update public.loyalty_rule_versions set effective_to = null where version = 1'),
  '42501',
  'LR6: a closed window cannot be reopened'
);
select is(
  extensions.sqlstate_as('postgres', null,
    'insert into public.loyalty_rule_versions
       (rule_id, business_id, version, earn_spend_paise, earn_points, effective_from, points_expiry_days)
     select rule_id, business_id, 99, 10000, 10, now() + interval ''2 days'', 365
       from public.loyalty_rule_versions limit 1'),
  '23514',
  'LR6: points expiry cannot be configured while no sweeper exists'
);

-- LR7: tenancy, visibility and RPC-only writes.
select is(
  extensions.count_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select count(*) from public.loyalty_rule_versions'),
  1::bigint,
  'LR7: a customer sees only the rule in force right now'
);
select ok(
  extensions.count_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select count(*) from public.loyalty_rule_versions') >= 2,
  'LR7: staff can read their own business rule history'
);
select is(
  extensions.count_as('authenticated', '99999999-9999-4999-8999-999999999999',
    'select count(*) from public.loyalty_rule_versions
      where business_id = ''aaaaaaaa-0000-4000-8000-000000000001'''),
  0::bigint,
  'LR7: rule history never crosses tenants'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'insert into public.loyalty_rules (business_id, code)
     values (''aaaaaaaa-0000-4000-8000-000000000001'', ''sneaky'')'),
  '42501',
  'LR7: even the owner cannot write rules directly (RPC-only)'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select public.active_loyalty_rule_version(''aaaaaaaa-0000-4000-8000-000000000001'')'),
  '42501',
  'LR7: the internal resolver is not callable by clients'
);
select ok(
  not has_function_privilege('anon',
    'public.set_loyalty_rule(uuid, bigint, integer, integer, bigint, timestamptz, text)', 'EXECUTE'),
  'LR7: anon cannot set the loyalty rule'
);

-- LR8: a scheduled version does not price today's sales.
select set_config('app.lr_v3',
  extensions.text_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select public.set_loyalty_rule(null, 100000, 10, 10, 0, now() + interval ''7 days'', ''New year'')::text'), true);
select is(
  current_setting('app.lr_v3', true)::jsonb ->> 'status', 'scheduled',
  'LR8: a future version is scheduled, not active'
);
select is(
  (public.active_loyalty_rule_version('aaaaaaaa-0000-4000-8000-000000000001')).version,
  2,
  'LR8: today still resolves to version 2'
);
select is(
  (public.active_loyalty_rule_version('aaaaaaaa-0000-4000-8000-000000000001',
     now() + interval '8 days')).version,
  3,
  'LR8: the scheduled version takes effect on its date'
);


-- ---------------------------------------------------------------------------
-- Persistent in-app notifications (20260906180000_notifications.sql)
-- Mirrors cases NT1-NT7 of scripts/rls-check/10_assertions.sql.
-- ---------------------------------------------------------------------------

-- NT1: the facts emit their own notifications.
select set_config('app.nt_sale',
  extensions.text_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select public.create_sale(
       ''bbbbbbbb-0000-4000-8000-000000000001'',
       ''[{"name":"Conduit pipe","qty":1,"unit_price_paise":60000}]''::jsonb,
       ''[{"method":"cash","amount_paise":60000}]''::jsonb,
       (select id from public.customer_memberships where membership_no = ''AE-DEVRAHUL1''),
       0, ''pgtap-nt1'')::text'), true);
select is(
  (select count(*) from public.notifications
    where audience = 'customer' and category = 'points'
      and source_id = (current_setting('app.nt_sale', true)::jsonb ->> 'sale_id')::uuid)::int,
  1,
  'NT1: a sale''s points award notifies the customer exactly once'
);
select is(
  (select source_type from public.notifications
    where source_id = (current_setting('app.nt_sale', true)::jsonb ->> 'sale_id')::uuid
      and category = 'points'),
  'points_ledger',
  'NT1: the notification carries a payload reference'
);
select ok(
  (select count(*) from public.notifications
    where audience = 'business' and category = 'rule') >= 1,
  'NT1: a loyalty rule change notifies the business'
);
select is(
  (select count(*) from public.notifications
    where category = 'rule' and (metadata ->> 'version')::int = 1)::int,
  0,
  'NT1: the launch policy installed at signup is not news'
);
select ok(
  (select count(*) from public.notifications
    where audience = 'business' and category = 'staff' and min_role = 'owner') >= 1,
  'NT1: a staff invitation notifies the owner'
);

-- NT2: recipients see only what they are authorized to see.
select ok(
  extensions.count_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select count(*) from public.notifications') >= 1,
  'NT2: the customer sees their own notifications'
);
select is(
  extensions.count_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select count(*) from public.notifications where audience = ''business'''),
  0::bigint,
  'NT2: a customer never sees business notifications'
);
select is(
  extensions.count_as('authenticated', '66666666-6666-4666-8666-666666666666',
    'select count(*) from public.notifications
      where customer_membership_id =
        (select id from public.customer_memberships where membership_no = ''AE-DEVRAHUL1'')'),
  0::bigint,
  'NT2: one customer cannot read another customer''s notifications'
);
select is(
  extensions.count_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select count(*) from public.notifications where min_role = ''owner'''),
  0::bigint,
  'NT2: a cashier cannot read owner-scoped notifications'
);
select is(
  extensions.count_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select count(*) from public.notifications where audience = ''customer'''),
  0::bigint,
  'NT2: a cashier cannot read customer notifications'
);
select ok(
  extensions.count_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select count(*) from public.notifications where min_role = ''owner''') >= 1,
  'NT2: the owner sees owner-scoped notifications'
);

-- NT3: cross-tenant and cross-store denial.
select lives_ok(
  $$insert into public.notifications
      (business_id, store_id, audience, min_role, category, title, dedupe_key)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002',
            'business', 'staff', 'stock', 'Satellite-only alert', 'pgtap-nt3')$$,
  'NT3: seed a satellite-store alert as the maintenance role'
);
select is(
  extensions.count_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select count(*) from public.notifications where dedupe_key = ''pgtap-nt3'''),
  0::bigint,
  'NT3: store scoping hides another store''s alert from scoped staff'
);
select is(
  extensions.count_as('authenticated', '44444444-4444-4444-8444-444444444444',
    'select count(*) from public.notifications where dedupe_key = ''pgtap-nt3'''),
  1::bigint,
  'NT3: the assigned cashier does see their store''s alert'
);
select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select public.mark_notification_read(
       (select id from public.notifications where dedupe_key = ''pgtap-nt3''))'),
  '42501',
  'NT3: an out-of-scope notification cannot be marked read'
);
select is(
  extensions.count_as('authenticated', '99999999-9999-4999-8999-999999999999',
    'select count(*) from public.notifications
      where business_id = ''aaaaaaaa-0000-4000-8000-000000000001'''),
  0::bigint,
  'NT3: notifications never cross tenants'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'insert into public.notifications (business_id, audience, min_role, category, title, dedupe_key)
     values (''aaaaaaaa-0000-4000-8000-000000000001'', ''business'', ''staff'', ''system'',
             ''Fake'', ''pgtap-fake'')'),
  '42501',
  'NT3: even the owner cannot write a notification directly'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select public.notify_emit(''aaaaaaaa-0000-4000-8000-000000000001'',
       ''business'', ''system'', ''Fake'', ''pgtap-fake2'')'),
  '42501',
  'NT3: notify_emit is internal, not a client API'
);

-- NT4: read state is personal, persistent and idempotent.
select is(
  extensions.text_as('authenticated', '44444444-4444-4444-8444-444444444444',
    'select public.mark_notification_read(
       (select id from public.notifications where dedupe_key = ''pgtap-nt3''))::text'),
  'true',
  'NT4: the assigned cashier can mark their alert read'
);
select is(
  (select count(*) from public.notification_reads r
     join public.notifications n on n.id = r.notification_id
    where n.dedupe_key = 'pgtap-nt3')::int,
  1,
  'NT4: exactly one read row exists'
);
select is(
  extensions.text_as('authenticated', '44444444-4444-4444-8444-444444444444',
    'select public.mark_notification_read(
       (select id from public.notifications where dedupe_key = ''pgtap-nt3''))::text'),
  'true',
  'NT4: marking read twice is idempotent, not an error'
);
select is(
  (select count(*) from public.notification_reads r
     join public.notifications n on n.id = r.notification_id
    where n.dedupe_key = 'pgtap-nt3')::int,
  1,
  'NT4: the duplicate mark-read added no second row'
);
select is(
  extensions.count_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select count(*) from public.notification_reads'),
  0::bigint,
  'NT4: read state is personal — the owner sees none of the cashier''s'
);
select ok(
  extensions.count_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select public.mark_all_notifications_read(''business'')') >= 1,
  'NT4: mark-all reports how many rows it changed'
);
select is(
  extensions.count_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select public.unread_notification_count(''business'')'),
  0::bigint,
  'NT4: the business bell is empty after mark-all'
);
select is(
  extensions.count_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select public.mark_all_notifications_read(''business'')'),
  0::bigint,
  'NT4: a second mark-all is a no-op'
);
select ok(
  extensions.count_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'select public.unread_notification_count(''customer'')') >= 1,
  'NT4: the business mark-all did not clear the customer bell'
);
select is(
  extensions.sqlstate_as('authenticated', '55555555-5555-4555-8555-555555555555',
    'insert into public.notification_reads (notification_id, profile_id)
     select id, ''88888888-8888-4888-8888-888888888888'' from public.notifications limit 1'),
  '42501',
  'NT4: a read row cannot be forged for another profile'
);

-- NT5: duplicates and replays never produce a second row.
select is(
  extensions.text_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select public.create_sale(
       ''bbbbbbbb-0000-4000-8000-000000000001'',
       ''[{"name":"Conduit pipe","qty":1,"unit_price_paise":60000}]''::jsonb,
       ''[{"method":"cash","amount_paise":60000}]''::jsonb,
       (select id from public.customer_memberships where membership_no = ''AE-DEVRAHUL1''),
       0, ''pgtap-nt1'') ->> ''replayed'''),
  'true',
  'NT5: the same idempotency key replays the stored sale'
);
select is(
  (select count(*) from public.notifications
    where audience = 'customer' and category = 'points'
      and source_id = (current_setting('app.nt_sale', true)::jsonb ->> 'sale_id')::uuid)::int,
  1,
  'NT5: the replay emitted no second notification'
);
select is(
  extensions.sqlstate_as('postgres', null,
    'insert into public.notifications (business_id, audience, min_role, category, title, dedupe_key)
     values (''aaaaaaaa-0000-4000-8000-000000000001'', ''business'', ''staff'', ''system'',
             ''Dup'', ''pgtap-nt3'')'),
  '23505',
  'NT5: the dedupe key is a hard constraint'
);
select is(
  (select public.notify_emit('aaaaaaaa-0000-4000-8000-000000000001', 'business', 'system',
     'Dup', 'pgtap-nt3', null, null, 'staff')),
  null::uuid,
  'NT5: notify_emit swallows a duplicate instead of aborting its caller'
);

-- NT6: low stock only where configured, only on the crossing.
select lives_ok(
  $$update public.inventory_by_store set reorder_level = 0, on_hand = 100
     where store_id = 'bbbbbbbb-0000-4000-8000-000000000001'
       and product_id = (select id from public.products
                          where business_id = 'aaaaaaaa-0000-4000-8000-000000000001'
                          order by sku limit 1)$$,
  'NT6: clear the reorder level for the probe product'
);
select set_config('app.nt_stock_before',
  (select count(*) from public.notifications where category = 'stock')::text, true);
select lives_ok(
  $$update public.inventory_by_store set on_hand = 1
     where store_id = 'bbbbbbbb-0000-4000-8000-000000000001'
       and product_id = (select id from public.products
                          where business_id = 'aaaaaaaa-0000-4000-8000-000000000001'
                          order by sku limit 1)$$,
  'NT6: drop the stock with no threshold configured'
);
select is(
  (select count(*) from public.notifications where category = 'stock')::int,
  current_setting('app.nt_stock_before', true)::int,
  'NT6: no alert when the business has not configured a reorder level'
);
select lives_ok(
  $$update public.inventory_by_store set reorder_level = 10, on_hand = 50
     where store_id = 'bbbbbbbb-0000-4000-8000-000000000001'
       and product_id = (select id from public.products
                          where business_id = 'aaaaaaaa-0000-4000-8000-000000000001'
                          order by sku limit 1)$$,
  'NT6: configure a reorder level'
);
select lives_ok(
  $$update public.inventory_by_store set on_hand = 8
     where store_id = 'bbbbbbbb-0000-4000-8000-000000000001'
       and product_id = (select id from public.products
                          where business_id = 'aaaaaaaa-0000-4000-8000-000000000001'
                          order by sku limit 1)$$,
  'NT6: cross the reorder level'
);
select is(
  (select count(*) from public.notifications where category = 'stock')::int,
  current_setting('app.nt_stock_before', true)::int + 1,
  'NT6: crossing the reorder level raises exactly one alert'
);
select is(
  (select distinct min_role::text from public.notifications
    where category = 'stock' and dedupe_key like 'low-stock:%'),
  'manager',
  'NT6: low stock is a manager-scoped alert'
);

-- NT7: Realtime exposure and grants.
select ok(
  not has_table_privilege('anon', 'public.notifications', 'SELECT'),
  'NT7: anonymous sockets cannot read notifications'
);
select ok(
  not has_table_privilege('authenticated', 'public.notifications', 'INSERT')
  and not has_table_privilege('authenticated', 'public.notifications', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.notifications', 'DELETE')
  and not has_table_privilege('authenticated', 'public.notification_reads', 'INSERT'),
  'NT7: notifications are trigger-written and RPC-read only'
);
select is(
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'notification_reads')::int,
  0,
  'NT7: personal read state is never published to Realtime'
);


-- ---------------------------------------------------------------------------
-- Catalogue images + essential settings (20260906190000_storage_and_settings.sql)
-- Mirrors cases ST1-ST4 / SET1-SET4 of scripts/rls-check/10_assertions.sql.
-- ---------------------------------------------------------------------------

select set_config('app.st_prod',
  (select id::text from public.products
    where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' order by sku limit 1), true);

-- ST1: manager attaches; every validation rule bites.
select set_config('app.st_img',
  extensions.text_as('authenticated', '22222222-2222-4222-8222-222222222222',
    format('select public.attach_catalogue_image(%L, null, ''product-images'',
              ''aaaaaaaa-0000-4000-8000-000000000001/%s/a.webp'', ''image/webp'',
              120000, 800, 800, ''Nine watt LED bulb'')::text',
           current_setting('app.st_prod', true), current_setting('app.st_prod', true))), true);
select is(
  current_setting('app.st_img', true)::jsonb ->> 'is_primary', 'true',
  'ST1: the first image becomes the thumbnail'
);
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    format('select public.attach_catalogue_image(%L, null, ''product-images'',
              ''aaaaaaaa-0000-4000-8000-000000000001/x/b.svg'', ''image/svg+xml'', 1000)',
           current_setting('app.st_prod', true))),
  '22023',
  'ST1: SVG is refused (it can carry script)'
);
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    format('select public.attach_catalogue_image(%L, null, ''product-images'',
              ''aaaaaaaa-0000-4000-8000-000000000001/x/c.jpg'', ''image/jpeg'', 99999999)',
           current_setting('app.st_prod', true))),
  '22023',
  'ST1: an oversized upload is refused'
);
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    format('select public.attach_catalogue_image(%L, null, ''product-images'',
              ''aaaaaaaa-0000-4000-8000-000000000002/x/d.jpg'', ''image/jpeg'', 1000)',
           current_setting('app.st_prod', true))),
  '22023',
  'ST1: a path under another tenant''s folder is refused'
);
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    format('select public.attach_catalogue_image(%L, null, ''product-images'',
              ''aaaaaaaa-0000-4000-8000-000000000001/../../etc/passwd'', ''image/jpeg'', 1000)',
           current_setting('app.st_prod', true))),
  '22023',
  'ST1: path traversal is refused'
);
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    format('select public.attach_catalogue_image(%L, null, ''reward-images'',
              ''aaaaaaaa-0000-4000-8000-000000000001/x/e.jpg'', ''image/jpeg'', 1000)',
           current_setting('app.st_prod', true))),
  '22023',
  'ST1: a product cannot be filed in the reward bucket'
);
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    'select public.attach_catalogue_image(null, null, ''product-images'',
       ''aaaaaaaa-0000-4000-8000-000000000001/x/f.jpg'', ''image/jpeg'', 1000)'),
  '22023',
  'ST1: an image must belong to exactly one product or reward'
);
select is(
  (select count(*) from public.catalogue_images
    where product_id = current_setting('app.st_prod', true)::uuid)::int,
  1,
  'ST1: no rejected upload left a row behind'
);

-- ST2: authorization and tenancy.
select is(
  extensions.count_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select count(*) from public.catalogue_images
             where product_id = %L', current_setting('app.st_prod', true))),
  1::bigint,
  'ST2: cashiers may look at catalogue images'
);
select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    format('select public.attach_catalogue_image(%L, null, ''product-images'',
              ''aaaaaaaa-0000-4000-8000-000000000001/x/staff.jpg'', ''image/jpeg'', 1000)',
           current_setting('app.st_prod', true))),
  '42501',
  'ST2: a cashier cannot attach an image'
);
select is(
  extensions.count_as('authenticated', '99999999-9999-4999-8999-999999999999',
    'select count(*) from public.catalogue_images
      where business_id = ''aaaaaaaa-0000-4000-8000-000000000001'''),
  0::bigint,
  'ST2: catalogue images never cross tenants'
);
select is(
  extensions.count_as('authenticated', '55555555-5555-4555-8555-555555555555',
    format('select count(*) from public.catalogue_images
             where product_id = %L', current_setting('app.st_prod', true))),
  0::bigint,
  'ST2: customers cannot browse product images yet'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    format('insert into public.catalogue_images
             (business_id, product_id, bucket, path, mime_type, size_bytes)
            values (''aaaaaaaa-0000-4000-8000-000000000001'', %L, ''product-images'',
                    ''aaaaaaaa-0000-4000-8000-000000000001/direct.jpg'', ''image/jpeg'', 100)',
           current_setting('app.st_prod', true))),
  '42501',
  'ST2: even the owner cannot insert an image row directly'
);

-- ST3: thumbnail, alt text, detach.
select set_config('app.st_img2',
  extensions.text_as('authenticated', '22222222-2222-4222-8222-222222222222',
    format('select public.attach_catalogue_image(%L, null, ''product-images'',
              ''aaaaaaaa-0000-4000-8000-000000000001/%s/second.png'', ''image/png'',
              90000, 600, 600, ''Side view'', true)::text',
           current_setting('app.st_prod', true), current_setting('app.st_prod', true))), true);
select is(
  (select count(*) from public.catalogue_images
    where product_id = current_setting('app.st_prod', true)::uuid and is_primary)::int,
  1,
  'ST3: exactly one thumbnail survives a second upload'
);
select is(
  (select is_primary from public.catalogue_images
    where id = (current_setting('app.st_img2', true)::jsonb ->> 'image_id')::uuid),
  true,
  'ST3: make_primary moved the thumbnail'
);
select is(
  extensions.sqlstate_as('postgres', null,
    format('update public.catalogue_images set is_primary = true where id = %L',
           current_setting('app.st_img', true)::jsonb ->> 'image_id')),
  '23505',
  'ST3: two thumbnails are impossible, not merely discouraged'
);
select is(
  extensions.text_as('authenticated', '22222222-2222-4222-8222-222222222222',
    format('select public.set_catalogue_image_alt(%L, ''  Front view  '')::text',
           current_setting('app.st_img', true)::jsonb ->> 'image_id')),
  'true',
  'ST3: alt text is editable without re-uploading'
);
select is(
  (select alt_text from public.catalogue_images
    where id = (current_setting('app.st_img', true)::jsonb ->> 'image_id')::uuid),
  'Front view',
  'ST3: alt text is trimmed on the way in'
);
select is(
  extensions.text_as('authenticated', '22222222-2222-4222-8222-222222222222',
    format('select public.detach_catalogue_image(%L) ->> ''bucket''',
           current_setting('app.st_img2', true)::jsonb ->> 'image_id')),
  'product-images',
  'ST3: detach returns the storage coordinates so the object can be removed'
);
select is(
  (select is_primary from public.catalogue_images
    where id = (current_setting('app.st_img', true)::jsonb ->> 'image_id')::uuid),
  true,
  'ST3: deleting the thumbnail promotes a survivor'
);

-- SET1: business identity.
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    'select public.update_business_profile(''Hijacked'')'),
  '42501',
  'SET1: a manager cannot edit the business profile'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select public.update_business_profile(null, null, null, ''not-an-email'')'),
  '22023',
  'SET1: a malformed support email is refused'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select public.update_business_profile(null, null, ''NOTAGSTIN'')'),
  '22023',
  'SET1: a malformed GSTIN is refused'
);
select lives_ok(
  $$select extensions.text_as('authenticated', '88888888-8888-4888-8888-888888888888',
      'select public.update_business_profile(''Ambika Electricals & Sons'')::text')$$,
  'SET1: the owner can rename the business'
);
select is(
  (select name from public.businesses where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'Ambika Electricals & Sons',
  'SET1: the new name is stored'
);
select is(
  (select count(*) from public.audit_logs
    where action = 'business.profile_updated'
      and metadata -> 'from' ->> 'name' = 'Ambika Electricals')::int,
  1,
  'SET1: the change is audited with the previous value'
);

-- SET2: stores.
select is(
  extensions.sqlstate_as('authenticated', '22222222-2222-4222-8222-222222222222',
    'select public.upsert_store(null, ''Manager Store'')'),
  '42501',
  'SET2: a manager cannot create a store'
);
select set_config('app.st_store',
  extensions.text_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select public.upsert_store(null, ''Karelibaug Counter'', ''KRB'')::text'), true);
select is(
  current_setting('app.st_store', true)::jsonb ->> 'created', 'true',
  'SET2: the owner can open a store'
);
select is(
  extensions.sqlstate_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select public.upsert_store(''bbbbbbbb-0000-4000-8000-000000000009'', ''Steal'')'),
  '22023',
  'SET2: another tenant''s store id looks exactly like a missing one'
);
select lives_ok(
  $$select extensions.text_as('authenticated', '88888888-8888-4888-8888-888888888888',
      format('select public.upsert_store(%L, null, null, null, null, false)::text',
             current_setting('app.st_store', true)::jsonb ->> 'store_id'))$$,
  'SET2: closing a store is a status flip'
);
select is(
  (select is_active from public.stores
    where id = (current_setting('app.st_store', true)::jsonb ->> 'store_id')::uuid),
  false,
  'SET2: the store is closed but still present for history'
);
select is(
  (select name from public.stores
    where id = (current_setting('app.st_store', true)::jsonb ->> 'store_id')::uuid),
  'Karelibaug Counter',
  'SET2: closing did not blank the other fields'
);

-- SET3: notification preferences.
select lives_ok(
  $$select extensions.text_as('authenticated', '33333333-3333-4333-8333-333333333333',
      'select public.set_notification_preferences(
         ''aaaaaaaa-0000-4000-8000-000000000001'', array[''stock'', ''rule''])::text')$$,
  'SET3: a cashier can mute categories for their business'
);
select is(
  (select array_to_string(muted_categories, ',') from public.notification_preferences
    where profile_id = '33333333-3333-4333-8333-333333333333'),
  'stock,rule',
  'SET3: the preference is stored'
);
select is(
  extensions.sqlstate_as('authenticated', '33333333-3333-4333-8333-333333333333',
    'select public.set_notification_preferences(
       ''aaaaaaaa-0000-4000-8000-000000000001'', array[''security''])'),
  '22023',
  'SET3: security notifications can never be muted'
);
select is(
  extensions.sqlstate_as('authenticated', '99999999-9999-4999-8999-999999999999',
    'select public.set_notification_preferences(
       ''aaaaaaaa-0000-4000-8000-000000000001'', array[''stock''])'),
  '42501',
  'SET3: an outsider cannot set preferences for another tenant'
);
select is(
  extensions.count_as('authenticated', '88888888-8888-4888-8888-888888888888',
    'select count(*) from public.notification_preferences'),
  0::bigint,
  'SET3: preferences are private to their owner'
);

-- SET4: grants.
select ok(
  not has_function_privilege('anon',
    'public.attach_catalogue_image(uuid, uuid, text, text, text, bigint, integer, integer, text, boolean)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.update_business_profile(text, text, text, text, text)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.set_notification_preferences(uuid, text[])', 'EXECUTE'),
  'SET4: anon cannot call any settings RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.catalogue_images', 'INSERT')
  and not has_table_privilege('authenticated', 'public.catalogue_images', 'DELETE')
  and not has_table_privilege('authenticated', 'public.notification_preferences', 'INSERT'),
  'SET4: settings tables are RPC-write-only'
);

select * from finish();
rollback;
