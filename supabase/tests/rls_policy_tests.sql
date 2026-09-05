-- ============================================================================
-- pgTAP RLS policy tests — canonical runner: `supabase test db` (local CLI).
-- Mirrors scripts/rls-check/10_assertions.sql (plain-SQL harness used in CI
-- and anywhere PostgreSQL is available without Docker/Supabase CLI).
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

select plan(48);

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

select * from finish();
rollback;
