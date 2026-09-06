-- ============================================================================
-- RLS / RPC assertion suite — Phase 2 Step 2 Stage D proof.
--
-- Runs on ANY PostgreSQL after: 00_stubs.sql → supabase/migrations/* →
-- supabase/seed.sql. Executed case-by-case by scripts/rls-check/run.mjs;
-- each `-- CASE:` block runs inside its own transaction, so a failure never
-- corrupts later cases. Mirrors supabase/tests/rls_policy_tests.sql (pgTAP),
-- which is the canonical runner under `supabase test db`.
--
-- Convention: an assertion failure raises  'ASSERT: <why>'.
-- Fixed UUIDs come from supabase/seed.sql.
-- ============================================================================

-- CASE: S1 trigger — profile auto-created from auth.users
do $$
declare v_profile public.profiles; v_uid uuid := '70000000-1111-4000-8000-000000000001';
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
          's1-trigger@ambika.local', '!', now(), '{"full_name":"Trigger Test"}'::jsonb);
  select * into v_profile from public.profiles where id = v_uid;
  if not found then raise exception 'ASSERT: profile was not created by handle_new_user'; end if;
  if v_profile.email <> 's1-trigger@ambika.local' then raise exception 'ASSERT: profile email mismatch'; end if;
  if v_profile.display_name <> 'Trigger Test' then raise exception 'ASSERT: display_name not taken from metadata, got %', v_profile.display_name; end if;
  delete from auth.users where id = v_uid;  -- cascades profile
end $$;

-- CASE: S2 trigger — profile email follows auth email change
do $$
declare v_uid uuid := '70000000-1111-4000-8000-000000000002'; v_email text;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
          's2-before@ambika.local', '!', now(), '{"full_name":"Email Sync"}'::jsonb);
  update auth.users set email = 's2-after@ambika.local', updated_at = now() where id = v_uid;
  select email into v_email from public.profiles where id = v_uid;
  if v_email <> 's2-after@ambika.local' then raise exception 'ASSERT: profile email not synced, got %', v_email; end if;
  delete from auth.users where id = v_uid;
end $$;

-- CASE: S3 constraint — membership_no auto-generates in AE- format when omitted
do $$
declare v_no text;
begin
  insert into public.customer_memberships (business_id, profile_id, display_name, membership_no)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'Auto Numbering', null)
  returning membership_no into v_no;
  if v_no !~ '^AE-[A-Z0-9]{8}$' then raise exception 'ASSERT: generated membership_no has wrong shape: %', v_no; end if;
  delete from public.customer_memberships where membership_no = v_no
    and business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and display_name = 'Auto Numbering';
end $$;

-- CASE: S4 constraint — membership_no format check rejects garbage
do $$
begin
  begin
    insert into public.customer_memberships (business_id, membership_no, display_name)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'XX-1', 'Bad Number');
    raise exception 'ASSERT: garbage membership_no was accepted';
  exception when check_violation then null;
  end;
end $$;

-- CASE: S5 constraint — store_membership with mismatched business rejected
do $$
begin
  begin
    insert into public.store_memberships (store_id, business_id, profile_id)
    values ('bbbbbbbb-0000-4000-8000-000000000001',      -- Ambika Main Store
            'aaaaaaaa-0000-4000-8000-000000000002',      -- Volt business  → mismatch
            '33333333-3333-4333-8333-333333333333');
    raise exception 'ASSERT: cross-tenant store_membership was accepted';
  exception when integrity_constraint_violation then null;
  end;
end $$;

-- CASE: S6 constraint — duplicate business membership rejected
do $$
begin
  begin
    insert into public.business_memberships (business_id, profile_id, role)
    values ('aaaaaaaa-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'staff');
    raise exception 'ASSERT: duplicate membership accepted';
  exception when unique_violation then null;
  end;
end $$;

-- CASE: S7 constraint — one pending invitation per email per business
do $$
begin
  begin
    insert into public.invitations (business_id, email, role, token_hash, expires_at, invited_by)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'dev-newstaff@ambika.local', 'staff',
            encode(extensions.digest('duplicate-pending-token', 'sha256'), 'hex'),
            now() + interval '1 day', '88888888-8888-4888-8888-888888888888');
    raise exception 'ASSERT: second pending invitation for same email accepted';
  exception when unique_violation then null;
  end;
end $$;

-- CASE: S8 constraint — invitation role limited to manager/staff
do $$
begin
  begin
    insert into public.invitations (business_id, email, role, token_hash, expires_at, invited_by)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'x-owner@ambika.local', 'owner',
            encode(extensions.digest('role-check-token', 'sha256'), 'hex'),
            now() + interval '1 day', '88888888-8888-4888-8888-888888888888');
    raise exception 'ASSERT: owner-role invitation accepted';
  exception when check_violation then null;
  end;
end $$;

-- CASE: S9 audit — audit_logs immutable even for the table owner
do $$
begin
  begin
    update public.audit_logs set action = 'tampered.hack' where action = 'business.created';
    raise exception 'ASSERT: audit_logs UPDATE was permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.audit_logs where action = 'business.created';
    raise exception 'ASSERT: audit_logs DELETE was permitted';
  exception when insufficient_privilege then null;
  end;
end $$;

-- CASE: A1 anon — denied on every application table
set local role anon;
do $$
declare t text; v_n bigint;
begin
  foreach t in array array['profiles','businesses','stores','business_memberships',
                           'store_memberships','customer_memberships','invitations','audit_logs']
  loop
    begin
      execute format('select count(*) from public.%I', t) into v_n;
      raise exception 'ASSERT: anon could read %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
reset role;

-- CASE: A2 tenant — owner sees only their own business
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
do $$
declare v_n int; v_volt int;
begin
  select count(*) into v_n from public.businesses;
  if v_n <> 1 then raise exception 'ASSERT: owner should see exactly 1 business, saw %', v_n; end if;
  select count(*) into v_volt from public.businesses where id = 'aaaaaaaa-0000-4000-8000-000000000002';
  if v_volt <> 0 then raise exception 'ASSERT: owner can see the foreign (Volt) business'; end if;
end $$;
reset role;

-- CASE: A3 tenant — foreign identifiers resolve to nothing across tables
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  select count(*) into v_n from public.businesses where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if v_n <> 0 then raise exception 'ASSERT: volt owner probed Ambika business'; end if;
  select count(*) into v_n from public.stores where business_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if v_n <> 0 then raise exception 'ASSERT: volt owner probed Ambika stores'; end if;
  select count(*) into v_n from public.customer_memberships where business_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if v_n <> 0 then raise exception 'ASSERT: volt owner probed Ambika customers'; end if;
  select count(*) into v_n from public.business_memberships where business_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if v_n <> 0 then raise exception 'ASSERT: volt owner probed Ambika memberships'; end if;
  select count(*) into v_n from public.audit_logs where business_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if v_n <> 0 then raise exception 'ASSERT: volt owner probed Ambika audit trail'; end if;
end $$;
reset role;

-- CASE: A4 stores — manager sees all business stores; staff only assigned store
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  select count(*) into v_n from public.stores;
  if v_n <> 2 then raise exception 'ASSERT: manager should see 2 Ambika stores, saw %', v_n; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
do $$
declare v_n int; v_sat int;
begin
  select count(*) into v_n from public.stores;
  if v_n <> 1 then raise exception 'ASSERT: main-store staff should see exactly 1 store, saw %', v_n; end if;
  select count(*) into v_sat from public.stores where id = 'bbbbbbbb-0000-4000-8000-000000000002';
  if v_sat <> 0 then raise exception 'ASSERT: main-store staff can see the unassigned satellite store'; end if;
end $$;
reset role;

-- CASE: A5 customer — no business-side rows visible
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  select count(*) into v_n from public.businesses;
  if v_n <> 0 then raise exception 'ASSERT: customer can see businesses'; end if;
  select count(*) into v_n from public.stores;
  if v_n <> 0 then raise exception 'ASSERT: customer can see stores'; end if;
  select count(*) into v_n from public.business_memberships;
  if v_n <> 0 then raise exception 'ASSERT: customer can see business memberships'; end if;
  select count(*) into v_n from public.audit_logs;
  if v_n <> 0 then raise exception 'ASSERT: customer can see audit logs'; end if;
  select count(*) into v_n from public.invitations;
  if v_n <> 0 then raise exception 'ASSERT: customer can see invitations'; end if;
end $$;
reset role;

-- CASE: A6 customer — sees only their own customer membership
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
do $$
declare v_n int; v_rahul int;
begin
  select count(*) into v_n from public.customer_memberships;
  if v_n <> 1 then raise exception 'ASSERT: Priya should see exactly 1 membership, saw %', v_n; end if;
  select count(*) into v_rahul from public.customer_memberships
   where profile_id = '55555555-5555-4555-8555-555555555555';
  if v_rahul <> 0 then raise exception 'ASSERT: Priya can see Rahul''s membership'; end if;
end $$;
reset role;

-- CASE: A7 staff — sees own business customer directory, never foreign tenant
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
do $$
declare v_n int; v_foreign int;
begin
  select count(*) into v_n from public.customer_memberships;
  if v_n <> 3 then raise exception 'ASSERT: staff should see the 3 Ambika customer rows, saw %', v_n; end if;
  select count(*) into v_foreign from public.customer_memberships
   where business_id = 'aaaaaaaa-0000-4000-8000-000000000002';
  if v_foreign <> 0 then raise exception 'ASSERT: staff can see Volt customer rows'; end if;
end $$;
reset role;

-- CASE: A8 memberships — staff sees only own; manager sees whole business
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  select count(*) into v_n from public.business_memberships;
  if v_n <> 1 then raise exception 'ASSERT: staff should see only their own membership, saw %', v_n; end if;
  select count(*) into v_n from public.store_memberships;
  if v_n <> 1 then raise exception 'ASSERT: staff should see only their own store assignment, saw %', v_n; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  select count(*) into v_n from public.business_memberships;
  if v_n <> 4 then raise exception 'ASSERT: manager should see all 4 Ambika memberships, saw %', v_n; end if;
  select count(*) into v_n from public.store_memberships;
  if v_n <> 2 then raise exception 'ASSERT: manager should see both store assignments, saw %', v_n; end if;
end $$;
reset role;

-- CASE: A9 profiles — self, management peers, store peers boundaries
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  select count(*) into v_n from public.profiles;
  if v_n <> 1 then raise exception 'ASSERT: customer should see only their own profile, saw %', v_n; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  select count(*) into v_n from public.profiles;
  if v_n <> 4 then raise exception 'ASSERT: manager should see the 4 business-side profiles, saw %', v_n; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
do $$
declare v_n int; v_manager_visible int;
begin
  select count(*) into v_n from public.profiles;
  if v_n <> 1 then raise exception 'ASSERT: lone main-store staff should see only own profile, saw %', v_n; end if;
  select count(*) into v_manager_visible from public.profiles
   where id = '22222222-2222-4222-8222-222222222222';
  if v_manager_visible <> 0 then raise exception 'ASSERT: staff can see profile of non-coworker manager'; end if;
end $$;
reset role;

-- CASE: A10 invitations — owner sees business invitations; staff/manager do not
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  select count(*) into v_n from public.invitations;
  if v_n < 1 then raise exception 'ASSERT: owner should see the seeded pending invitation'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  select count(*) into v_n from public.invitations;
  if v_n <> 0 then raise exception 'ASSERT: manager can see invitations (owner-only)'; end if;
end $$;
reset role;

-- CASE: A11 audit — readable by owner only
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  select count(*) into v_n from public.audit_logs;
  if v_n < 1 then raise exception 'ASSERT: owner should see seeded audit rows'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  select count(*) into v_n from public.audit_logs;
  if v_n <> 0 then raise exception 'ASSERT: manager can read audit logs (owner-only)'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  select count(*) into v_n from public.audit_logs;
  if v_n <> 0 then raise exception 'ASSERT: staff can read audit logs (owner-only)'; end if;
end $$;
reset role;

-- CASE: W1 profiles — own safe fields OK; email/status columns denied; peers untouched
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
do $$
declare v_n int; v_name text;
begin
  update public.profiles set display_name = 'Rahul S.' where id = '55555555-5555-4555-8555-555555555555';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ASSERT: own safe-field update should affect 1 row, affected %', v_n; end if;
  select display_name into v_name from public.profiles where id = '55555555-5555-4555-8555-555555555555';
  if v_name <> 'Rahul S.' then raise exception 'ASSERT: safe-field update did not persist'; end if;

  begin
    update public.profiles set email = 'hijack@evil.example' where id = '55555555-5555-4555-8555-555555555555';
    raise exception 'ASSERT: email column update was permitted';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.profiles set status = 'suspended' where id = '55555555-5555-4555-8555-555555555555';
    raise exception 'ASSERT: status column update was permitted';
  exception when insufficient_privilege then null;
  end;

  update public.profiles set display_name = 'Hacked' where id = '66666666-6666-4666-8666-666666666666';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ASSERT: user updated another profile'; end if;
end $$;
reset role;
do $$
begin
  update public.profiles set display_name = 'Rahul Sharma' where id = '55555555-5555-4555-8555-555555555555';
end $$;

-- CASE: W2 businesses — owner update OK; manager/staff/foreign-tenant denied
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  update public.businesses set support_phone = '+91 98250 41299' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ASSERT: owner should update own business, affected %', v_n; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  update public.businesses set name = 'Manager Takeover' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ASSERT: manager updated business settings'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  update public.businesses set name = 'Volt Takeover' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ASSERT: foreign owner updated Ambika business'; end if;
end $$;
reset role;
do $$
begin
  update public.businesses set support_phone = '+91 98250 41200' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
end $$;

-- CASE: W3 businesses — direct INSERT denied for every signed-in role
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.businesses (name) values ('Shadow Business');
    raise exception 'ASSERT: direct business INSERT was permitted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- CASE: W4 stores — owner insert/update OK; staff+manager insert denied; staff update denied
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
do $$
declare v_n int; v_id uuid;
begin
  insert into public.stores (business_id, name, city)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'W4 Test Store', 'Surat')
  returning id into v_id;
  if v_id is null then raise exception 'ASSERT: owner store insert failed'; end if;
  update public.stores set city = 'Surat City' where id = v_id;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ASSERT: owner store update failed'; end if;
  delete from public.stores where id = v_id;  -- owner has no DELETE grant → should fail
  raise exception 'ASSERT: store DELETE should be denied (soft-close only)';
exception when insufficient_privilege then
  null; -- expected: DELETE denied — cleanup happens as postgres after reset role
end $$;
reset role;
delete from public.stores where name = 'W4 Test Store';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  begin
    insert into public.stores (business_id, name) values ('aaaaaaaa-0000-4000-8000-000000000001', 'Rogue Store');
    raise exception 'ASSERT: staff store INSERT was permitted';
  exception when insufficient_privilege then null;
  end;
  update public.stores set name = 'Renamed By Staff' where business_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ASSERT: staff updated a store'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.stores (business_id, name) values ('aaaaaaaa-0000-4000-8000-000000000001', 'Manager Store');
    raise exception 'ASSERT: manager store INSERT was permitted (owner-only)';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- CASE: W5 customer_memberships — staff enrolls own business only; customers denied
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
do $$
declare v_id uuid;
begin
  insert into public.customer_memberships (business_id, display_name, membership_no, enrolled_store_id)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'W5 Walk-in', null, 'bbbbbbbb-0000-4000-8000-000000000001')
  returning id into v_id;
  if v_id is null then raise exception 'ASSERT: staff enrollment failed'; end if;
  begin
    insert into public.customer_memberships (business_id, display_name, membership_no)
    values ('aaaaaaaa-0000-4000-8000-000000000002', 'Cross Tenant', null);
    raise exception 'ASSERT: staff enrolled a customer into a FOREIGN business';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.customer_memberships (business_id, display_name, membership_no)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'Self Enroll', null);
    raise exception 'ASSERT: customer self-enrollment INSERT was permitted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
delete from public.customer_memberships where display_name = 'W5 Walk-in';

-- CASE: W6 customer_memberships — UPDATE limited to manager+
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  update public.customer_memberships set status = 'blocked'
   where business_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ASSERT: staff updated customer membership status'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  update public.customer_memberships set display_name = 'Rahul Sharma (verified)'
   where profile_id = '55555555-5555-4555-8555-555555555555';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ASSERT: manager should update business customer rows, affected %', v_n; end if;
  update public.customer_memberships set display_name = 'Rahul Sharma'
   where profile_id = '55555555-5555-4555-8555-555555555555';
end $$;
reset role;

-- CASE: W7 memberships / invitations / audit — direct writes denied (RPC-only paths)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.business_memberships (business_id, profile_id, role)
    values ('aaaaaaaa-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555', 'staff');
    raise exception 'ASSERT: direct business_membership INSERT permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.business_memberships set role = 'owner' where profile_id = '33333333-3333-4333-8333-333333333333';
    raise exception 'ASSERT: direct business_membership UPDATE permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.business_memberships where profile_id = '33333333-3333-4333-8333-333333333333';
    raise exception 'ASSERT: direct business_membership DELETE permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.store_memberships (store_id, business_id, profile_id)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333');
    raise exception 'ASSERT: direct store_membership INSERT permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.invitations (business_id, email, role, token_hash, expires_at, invited_by)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'direct@ambika.local', 'staff',
            encode(extensions.digest('w7-direct', 'sha256'), 'hex'), now() + interval '1 day',
            '88888888-8888-4888-8888-888888888888');
    raise exception 'ASSERT: direct invitation INSERT permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.invitations set status = 'revoked';
    raise exception 'ASSERT: direct invitation UPDATE permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.audit_logs (action) values ('forged.entry');
    raise exception 'ASSERT: direct audit INSERT permitted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- CASE: R1 rpc — unauthenticated callers are rejected
set local role authenticated;
select set_config('request.jwt.claims', '', true);
do $$
begin
  begin
    perform * from public.create_invitation('aaaaaaaa-0000-4000-8000-000000000001', 'x@ambika.local', 'staff');
    raise exception 'ASSERT: anonymous RPC call succeeded';
  exception when insufficient_privilege or invalid_authorization_specification then null;
  end;
  begin
    perform public.complete_business_signup('Ghost Business');
    raise exception 'ASSERT: anonymous signup RPC succeeded';
  exception when insufficient_privilege or invalid_authorization_specification then null;
  end;
end $$;
reset role;

-- CASE: R2 rpc — owner creates invitation: raw token returned once, hash stored, audited
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
do $$
declare v_id uuid; v_token text;
begin
  select invitation_id, token into v_id, v_token
    from public.create_invitation('aaaaaaaa-0000-4000-8000-000000000001', 'r2-newmanager@ambika.local', 'manager', null, 48);
  if v_token is null or length(v_token) <> 64 then
    raise exception 'ASSERT: raw token not returned once (len %)', length(coalesce(v_token, ''));
  end if;
  execute 'reset role';
  if not exists (
    select 1 from public.invitations i
    where i.id = v_id
      and i.token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
      and i.token_hash <> v_token
      and i.status = 'pending'
  ) then
    raise exception 'ASSERT: invitation row/hash not stored correctly';
  end if;
  if not exists (
    select 1 from public.audit_logs
    where action = 'invitation.created' and business_id = 'aaaaaaaa-0000-4000-8000-000000000001'
      and target_id = v_id::text
  ) then
    raise exception 'ASSERT: invitation.created audit row missing';
  end if;
  -- invitation row cleanup (audit rows are immutable and intentionally remain)
  delete from public.invitations where id = v_id;
end $$;
reset role;

-- CASE: R3 rpc — manager/staff cannot invite; denials are audited
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$
begin
  begin
    perform * from public.create_invitation('aaaaaaaa-0000-4000-8000-000000000001', 'r3-target@ambika.local', 'staff');
    raise exception 'ASSERT: manager created an invitation';
  exception when insufficient_privilege then
    if sqlerrm not like '%not_authorized%' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
do $$
begin
  begin
    perform * from public.create_invitation('aaaaaaaa-0000-4000-8000-000000000001', 'r3-target@ambika.local', 'staff');
    raise exception 'ASSERT: staff created an invitation';
  exception when insufficient_privilege then
    if sqlerrm not like '%not_authorized%' then raise; end if;
  end;
end $$;
reset role;

-- CASE: R4 rpc — invalid role and expiry rejected
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
do $$
begin
  begin
    perform * from public.create_invitation('aaaaaaaa-0000-4000-8000-000000000001', 'r4@ambika.local', 'owner');
    raise exception 'ASSERT: owner-role invitation created via RPC';
  exception when invalid_parameter_value then
    if sqlerrm not like '%invalid_role%' then raise; end if;
  end;
  begin
    perform * from public.create_invitation('aaaaaaaa-0000-4000-8000-000000000001', 'r4@ambika.local', 'staff', null, 0);
    raise exception 'ASSERT: zero-hour expiry invitation created';
  exception when invalid_parameter_value then
    if sqlerrm not like '%invalid_expiry%' then raise; end if;
  end;
  begin
    perform * from public.create_invitation('aaaaaaaa-0000-4000-8000-000000000002', 'r4@ambika.local', 'staff');
    raise exception 'ASSERT: owner invited into a FOREIGN business';
  exception when insufficient_privilege then
    if sqlerrm not like '%not_authorized%' then raise; end if;
  end;
end $$;
reset role;

-- CASE: R5 rpc — duplicate pending invitation rejected
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
do $$
begin
  begin
    perform * from public.create_invitation('aaaaaaaa-0000-4000-8000-000000000001', 'DEV-NEWSTAFF@ambika.local', 'staff');
    raise exception 'ASSERT: duplicate pending invitation accepted';
  exception when unique_violation then
    if sqlerrm not like '%invitation_already_pending%' then raise; end if;
  end;
end $$;
reset role;

-- CASE: R6 rpc — accept binds the invited profile to exactly the intended business/store/role
do $$
declare
  v_invitee uuid := '70000000-1111-4000-8000-000000000006';
  v_token text; v_result jsonb; v_role public.app_role; v_store int; v_status public.invitation_status;
begin
  -- fresh invitee account (postgres role)
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', v_invitee, 'authenticated', 'authenticated',
          'r6-invitee@ambika.local', '!', now(), '{"full_name":"R6 Invitee"}'::jsonb);

  -- owner creates a store-scoped staff invitation
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
  select token into v_token
    from public.create_invitation('aaaaaaaa-0000-4000-8000-000000000001', 'r6-invitee@ambika.local', 'staff',
                                  'bbbbbbbb-0000-4000-8000-000000000002', 72);
  if v_token is null then raise exception 'ASSERT: no token returned'; end if;

  -- invitee accepts
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_invitee, 'role', 'authenticated')::text, true);
  select public.accept_invitation(v_token) into v_result;
  if v_result ->> 'role' <> 'staff' then raise exception 'ASSERT: accepted role mismatch: %', v_result; end if;
  if (v_result ->> 'business_id') <> 'aaaaaaaa-0000-4000-8000-000000000001' then raise exception 'ASSERT: accepted business mismatch'; end if;

  execute 'reset role';
  select role into v_role from public.business_memberships where profile_id = v_invitee;
  if v_role <> 'staff' then raise exception 'ASSERT: membership role not staff'; end if;
  select count(*) into v_store from public.store_memberships
   where profile_id = v_invitee and store_id = 'bbbbbbbb-0000-4000-8000-000000000002';
  if v_store <> 1 then raise exception 'ASSERT: store assignment missing after accept'; end if;
  select status into v_status from public.invitations where token_hash = encode(extensions.digest(v_token,'sha256'),'hex');
  if v_status <> 'accepted' then raise exception 'ASSERT: invitation status not accepted'; end if;
  if not exists (select 1 from public.audit_logs where action = 'invitation.accepted' and actor_profile_id = v_invitee) then
    raise exception 'ASSERT: invitation.accepted audit missing';
  end if;

  -- cleanup
  delete from public.store_memberships where profile_id = v_invitee;
  delete from public.business_memberships where profile_id = v_invitee;
  delete from public.invitations where token_hash = encode(extensions.digest(v_token,'sha256'),'hex');
  delete from auth.users where id = v_invitee;
end $$;

-- CASE: R7 rpc — invitation tokens are single-use
do $$
declare
  v_invitee uuid := '70000000-1111-4000-8000-000000000007';
  v_token text;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', v_invitee, 'authenticated', 'authenticated',
          'r7-invitee@ambika.local', '!', now(), '{"full_name":"R7 Invitee"}'::jsonb);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
  select token into v_token from public.create_invitation('aaaaaaaa-0000-4000-8000-000000000001', 'r7-invitee@ambika.local', 'staff');

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_invitee, 'role', 'authenticated')::text, true);
  perform public.accept_invitation(v_token);
  begin
    perform public.accept_invitation(v_token);
    raise exception 'ASSERT: invitation token was accepted twice';
  exception when invalid_parameter_value then
    if sqlerrm not like '%invitation_already_used%' then raise; end if;
  end;

  execute 'reset role';
  delete from public.store_memberships where profile_id = v_invitee;
  delete from public.business_memberships where profile_id = v_invitee;
  delete from public.invitations where token_hash = encode(extensions.digest(v_token,'sha256'),'hex');
  delete from auth.users where id = v_invitee;
end $$;

-- CASE: R8 rpc — acceptance bound to the invited email address
do $$
declare
  v_attacker uuid := '70000000-1111-4000-8000-000000000008';
  v_token text;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', v_attacker, 'authenticated', 'authenticated',
          'r8-attacker@ambika.local', '!', now(), '{"full_name":"Wrong Person"}'::jsonb);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
  select token into v_token from public.create_invitation('aaaaaaaa-0000-4000-8000-000000000001', 'r8-victim@ambika.local', 'manager');

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_attacker, 'role', 'authenticated')::text, true);
  begin
    perform public.accept_invitation(v_token);
    raise exception 'ASSERT: wrong account accepted someone else''s invitation';
  exception when invalid_authorization_specification or insufficient_privilege then
    if sqlerrm not like '%invitation_email_mismatch%' then raise; end if;
  end;

  execute 'reset role';
  if exists (select 1 from public.business_memberships where profile_id = v_attacker) then
    raise exception 'ASSERT: attacker received a membership';
  end if;
  delete from public.invitations where token_hash = encode(extensions.digest(v_token,'sha256'),'hex');
  delete from auth.users where id = v_attacker;
end $$;

-- CASE: R9 rpc — expired invitations rejected and marked expired
do $$
declare
  v_invitee uuid := '70000000-1111-4000-8000-000000000009';
  v_token text;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', v_invitee, 'authenticated', 'authenticated',
          'r9-invitee@ambika.local', '!', now(), '{"full_name":"R9 Invitee"}'::jsonb);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
  select token into v_token from public.create_invitation('aaaaaaaa-0000-4000-8000-000000000001', 'r9-invitee@ambika.local', 'staff');
  execute 'reset role';

  -- force expiry (privileged maintenance path)
  update public.invitations set expires_at = now() - interval '1 minute'
   where token_hash = encode(extensions.digest(v_token,'sha256'),'hex');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_invitee, 'role', 'authenticated')::text, true);
  begin
    perform public.accept_invitation(v_token);
    raise exception 'ASSERT: expired invitation was accepted';
  exception when invalid_parameter_value then
    if sqlerrm not like '%invitation_expired%' then raise; end if;
  end;
  execute 'reset role';

  delete from public.invitations where token_hash = encode(extensions.digest(v_token,'sha256'),'hex');
  delete from auth.users where id = v_invitee;
end $$;

-- CASE: R10 rpc — revoked invitations rejected; revoke is owner-only
do $$
declare
  v_invitee uuid := '70000000-1111-4000-8000-000000000010';
  v_token text; v_id uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', v_invitee, 'authenticated', 'authenticated',
          'r10-invitee@ambika.local', '!', now(), '{"full_name":"R10 Invitee"}'::jsonb);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
  select invitation_id, token into v_id, v_token
    from public.create_invitation('aaaaaaaa-0000-4000-8000-000000000001', 'r10-invitee@ambika.local', 'staff');

  -- manager tries to revoke → denied
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  begin
    perform public.revoke_invitation(v_id);
    raise exception 'ASSERT: manager revoked an invitation';
  exception when insufficient_privilege then
    if sqlerrm not like '%not_authorized%' then raise; end if;
  end;

  -- owner revokes
  perform set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
  perform public.revoke_invitation(v_id);

  -- invitee tries to accept → denied
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_invitee, 'role', 'authenticated')::text, true);
  begin
    perform public.accept_invitation(v_token);
    raise exception 'ASSERT: revoked invitation was accepted';
  exception when invalid_parameter_value then
    if sqlerrm not like '%invitation_revoked%' then raise; end if;
  end;
  execute 'reset role';

  if not exists (select 1 from public.invitations where id = v_id and status = 'revoked' and revoked_by = '88888888-8888-4888-8888-888888888888') then
    raise exception 'ASSERT: revoked state not recorded';
  end if;
  if not exists (select 1 from public.audit_logs where action = 'invitation.revoked' and target_id = v_id::text) then
    raise exception 'ASSERT: invitation.revoked audit missing';
  end if;

  delete from public.invitations where id = v_id;
  delete from auth.users where id = v_invitee;
end $$;

-- CASE: R11 rpc — change_member_role: owner-only, audited, self/owner guards
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
do $$
declare v_role public.app_role;
begin
  -- owner promotes staff-main → manager
  perform public.change_member_role('aaaaaaaa-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'manager');
  select role into v_role from public.business_memberships
   where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and profile_id = '33333333-3333-4333-8333-333333333333';
  if v_role <> 'manager' then raise exception 'ASSERT: role change did not persist'; end if;
  if not exists (select 1 from public.audit_logs where action = 'membership.role_changed'
                  and target_id = '33333333-3333-4333-8333-333333333333'
                  and metadata ->> 'new_role' = 'manager') then
    raise exception 'ASSERT: membership.role_changed audit missing';
  end if;
  -- owner cannot demote themselves
  begin
    perform public.change_member_role('aaaaaaaa-0000-4000-8000-000000000001', '88888888-8888-4888-8888-888888888888', 'staff');
    raise exception 'ASSERT: owner demoted themselves';
  exception when invalid_parameter_value then
    if sqlerrm not like '%cannot_change_own_role%' then raise; end if;
  end;
  -- now-manager cannot change roles (owner-only control)
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  begin
    perform public.change_member_role('aaaaaaaa-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'manager');
    raise exception 'ASSERT: promoted ex-staff changed another member role';
  exception when insufficient_privilege then
    if sqlerrm not like '%not_authorized%' then raise; end if;
  end;
  -- restore
  perform set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
  perform public.change_member_role('aaaaaaaa-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'staff');
end $$;
reset role;

-- CASE: R12 rpc — remove_member: owner-only, cascades store assignments, audited
do $$
declare
  v_staff uuid := '70000000-1111-4000-8000-000000000012';
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', v_staff, 'authenticated', 'authenticated',
          'r12-staff@ambika.local', '!', now(), '{"full_name":"R12 Staff"}'::jsonb);
  insert into public.business_memberships (business_id, profile_id, role)
  values ('aaaaaaaa-0000-4000-8000-000000000001', v_staff, 'staff');
  insert into public.store_memberships (store_id, business_id, profile_id)
  values ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', v_staff);

  execute 'set local role authenticated';
  -- manager cannot remove
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  begin
    perform public.remove_member('aaaaaaaa-0000-4000-8000-000000000001', v_staff);
    raise exception 'ASSERT: manager removed a member';
  exception when insufficient_privilege then
    if sqlerrm not like '%not_authorized%' then raise; end if;
  end;
  -- owner cannot remove self
  perform set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
  begin
    perform public.remove_member('aaaaaaaa-0000-4000-8000-000000000001', '88888888-8888-4888-8888-888888888888');
    raise exception 'ASSERT: owner removed themselves';
  exception when invalid_parameter_value then
    if sqlerrm not like '%cannot_remove_self%' then raise; end if;
  end;
  -- owner removes staff
  perform public.remove_member('aaaaaaaa-0000-4000-8000-000000000001', v_staff);
  execute 'reset role';

  if exists (select 1 from public.business_memberships where profile_id = v_staff) then
    raise exception 'ASSERT: membership survived remove_member';
  end if;
  if exists (select 1 from public.store_memberships where profile_id = v_staff) then
    raise exception 'ASSERT: store assignment survived remove_member';
  end if;
  if not exists (select 1 from public.audit_logs where action = 'membership.removed' and target_id = v_staff::text) then
    raise exception 'ASSERT: membership.removed audit missing';
  end if;
  delete from auth.users where id = v_staff;
end $$;

-- CASE: R13 rpc — store assignment owner-only and audited
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  perform public.assign_member_to_store('bbbbbbbb-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333');
  select count(*) into v_n from public.store_memberships
   where store_id = 'bbbbbbbb-0000-4000-8000-000000000002' and profile_id = '33333333-3333-4333-8333-333333333333';
  if v_n <> 1 then raise exception 'ASSERT: assignment missing'; end if;
  if not exists (select 1 from public.audit_logs where action = 'store_assignment.created') then
    raise exception 'ASSERT: store_assignment.created audit missing';
  end if;
  -- manager may not manage store assignments (owner-only control)
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  begin
    perform public.unassign_member_from_store('bbbbbbbb-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333');
    raise exception 'ASSERT: manager unassigned a store member';
  exception when insufficient_privilege then
    if sqlerrm not like '%not_authorized%' then raise; end if;
  end;
  -- owner unassigns (restore seed state)
  perform set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
  perform public.unassign_member_from_store('bbbbbbbb-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333');
end $$;
reset role;

-- CASE: R14 rpc — complete_business_signup creates a tenant once and is idempotent
do $$
declare
  v_customer uuid := '70000000-1111-4000-8000-000000000014';
  v_first jsonb; v_second jsonb; v_biz_before int; v_biz_after int; v_owner_result jsonb;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', v_customer, 'authenticated', 'authenticated',
          'r14-founder@ambika.local', '!', now(), '{"full_name":"R14 Founder","signup_context":"business"}'::jsonb);

  select count(*) into v_biz_before from public.businesses;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_customer, 'role', 'authenticated')::text, true);
  select public.complete_business_signup('R14 Test Electricals', 'R14 Main Store', null, null, '+91 90000 00000') into v_first;
  if (v_first ->> 'already_member')::boolean then raise exception 'ASSERT: first signup reported already_member'; end if;
  if (v_first ->> 'role') <> 'owner' then raise exception 'ASSERT: founder did not receive owner role'; end if;
  select public.complete_business_signup('R14 Test Electricals') into v_second;
  if not (v_second ->> 'already_member')::boolean then raise exception 'ASSERT: second signup was not idempotent'; end if;
  if (v_second ->> 'business_id') <> (v_first ->> 'business_id') then raise exception 'ASSERT: idempotency returned a different business'; end if;

  -- existing Ambika owner also gets already_member (no second tenant)
  perform set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
  select public.complete_business_signup('Ambika Electricals') into v_owner_result;
  if not (v_owner_result ->> 'already_member')::boolean
     or (v_owner_result ->> 'business_id') <> 'aaaaaaaa-0000-4000-8000-000000000001' then
    raise exception 'ASSERT: existing owner signup did not map to their business';
  end if;
  execute 'reset role';

  select count(*) into v_biz_after from public.businesses;
  if v_biz_after <> v_biz_before + 1 then raise exception 'ASSERT: expected exactly one new business (% → %)', v_biz_before, v_biz_after; end if;
  if not exists (select 1 from public.audit_logs where action = 'business.created' and business_id = (v_first ->> 'business_id')::uuid) then
    raise exception 'ASSERT: business.created audit missing';
  end if;

  -- cleanup the temporary tenant
  delete from public.business_memberships where business_id = (v_first ->> 'business_id')::uuid;
  delete from public.stores where business_id = (v_first ->> 'business_id')::uuid;
  delete from public.businesses where id = (v_first ->> 'business_id')::uuid;
  delete from auth.users where id = v_customer;
end $$;

-- CASE: V1 service_role — bypasses RLS for trusted server operations
set local role service_role;
do $$
declare v_n int;
begin
  select count(*) into v_n from public.businesses;
  if v_n < 2 then raise exception 'ASSERT: service_role should see all businesses, saw %', v_n; end if;
  select count(*) into v_n from public.profiles;
  if v_n < 6 then raise exception 'ASSERT: service_role should see all profiles, saw %', v_n; end if;
  select count(*) into v_n from public.audit_logs;
  if v_n < 1 then raise exception 'ASSERT: service_role should see audit trail'; end if;
end $$;
reset role;


-- ═══════════════════════════════════════════════════════════════════════════
-- L cases — points ledger (Slice 1). Cases COMMIT, and ledger rows are
-- immutable, so every case creates its own fresh memberships and uses unique
-- idempotency keys. Balances therefore start at 0 and are absolute-asserted.
-- ═══════════════════════════════════════════════════════════════════════════

-- CASE: L1 ledger — store-scoped staff awards points; cache, balance_after and audit stay in sync
do $$
declare
  v_mem uuid; v_res jsonb; v_bal int; v_n int;
begin
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'L1 Member', 'active')
  returning id into v_mem;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);

  select public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 120,
                             'sale', null, 'bbbbbbbb-0000-4000-8000-000000000001', 'l1-earn-1', 'L1 sale')
    into v_res;
  if (v_res ->> 'balance_after')::int <> 120 then raise exception 'ASSERT: L1 balance_after wrong: %', v_res; end if;
  if (v_res ->> 'replayed')::boolean then raise exception 'ASSERT: L1 first call reported replay'; end if;

  select public.point_balance(v_mem) into v_bal;
  if v_bal <> 120 then raise exception 'ASSERT: L1 point_balance % <> 120', v_bal; end if;

  select count(*) into v_n from public.customer_points_balance
   where customer_membership_id = v_mem and lifetime_earned = 120 and lifetime_redeemed = 0;
  if v_n <> 1 then raise exception 'ASSERT: L1 cache row not maintained'; end if;

  execute 'reset role';
  select count(*) into v_n from public.audit_logs
   where action = 'points.awarded' and target_id = v_mem::text;
  if v_n <> 1 then raise exception 'ASSERT: L1 points.awarded audit missing'; end if;
end $$;

-- CASE: L2 ledger — customers and other-tenant owners cannot award points (42501)
do $$
declare
  v_mem uuid;
begin
  -- reuse Rahul's seeded membership (one membership per profile is enforced)
  select id into v_mem from public.customer_memberships
   where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and membership_no = 'AE-DEVRAHUL1';

  -- Rahul (customer) tries to award himself
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
  begin
    perform public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 500, 'manual');
    raise exception 'ASSERT: L2 customer awarded points';
  exception when insufficient_privilege then null;
  end;

  -- Volt & Co owner tries to award into the Ambika tenant
  perform set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
  begin
    perform public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 500, 'manual');
    raise exception 'ASSERT: L2 cross-tenant owner awarded points';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end $$;

-- CASE: L3 ledger — store-scoped staff are confined to their stores; managers are not
do $$
declare
  v_mem uuid; v_res jsonb;
begin
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'L3 Member', 'active')
  returning id into v_mem;

  execute 'set local role authenticated';

  -- staff-main (scoped to Main Store) may NOT award at the Satellite store
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  begin
    perform public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 40,
                                'sale', null, 'bbbbbbbb-0000-4000-8000-000000000002', 'l3-staff-sat', null);
    raise exception 'ASSERT: L3 store-scoped staff awarded outside their store';
  exception when insufficient_privilege then null;
  end;

  -- manager (unscoped) MAY award at the Satellite store
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  select public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 40,
                             'sale', null, 'bbbbbbbb-0000-4000-8000-000000000002', 'l3-mgr-sat', null)
    into v_res;
  if (v_res ->> 'balance_after')::int <> 40 then raise exception 'ASSERT: L3 manager award failed: %', v_res; end if;

  -- staff-satellite (scoped to Satellite) MAY award at Satellite
  perform set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
  select public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 10,
                             'sale', null, 'bbbbbbbb-0000-4000-8000-000000000002', 'l3-staffsat-sat', null)
    into v_res;
  if (v_res ->> 'balance_after')::int <> 50 then raise exception 'ASSERT: L3 satellite staff award failed: %', v_res; end if;
  execute 'reset role';
end $$;

-- CASE: L4 ledger — idempotency key makes awards replay-safe (no double earn)
do $$
declare
  v_mem uuid; v_res1 jsonb; v_res2 jsonb; v_n int; v_bal int;
begin
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'L4 Member', 'active')
  returning id into v_mem;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);

  select public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 75,
                             'sale', null, null, 'l4-double-post', null) into v_res1;
  select public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 75,
                             'sale', null, null, 'l4-double-post', null) into v_res2;

  if not (v_res2 ->> 'replayed')::boolean then raise exception 'ASSERT: L4 second call did not report replay'; end if;
  if (v_res1 ->> 'entry_id') <> (v_res2 ->> 'entry_id') then raise exception 'ASSERT: L4 replay returned a different entry'; end if;

  select count(*) into v_n from public.points_ledger
   where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and idempotency_key = 'l4-double-post';
  if v_n <> 1 then raise exception 'ASSERT: L4 duplicate ledger entries: %', v_n; end if;

  select public.point_balance(v_mem) into v_bal;
  if v_bal <> 75 then raise exception 'ASSERT: L4 balance % after replay, expected 75', v_bal; end if;
  execute 'reset role';
end $$;

-- CASE: L5 ledger — manager spends points (negative entry, cache + audit updated); staff may not spend
do $$
declare
  v_mem uuid; v_res jsonb; v_pts int; v_n int;
begin
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'L5 Member', 'active')
  returning id into v_mem;

  execute 'set local role authenticated';

  -- staff cannot spend
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  select public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 200, 'sale', null, null, 'l5-earn', null) into v_res;
  begin
    perform public.spend_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 50, 'redemption', null, null, 'l5-staff-spend', null);
    raise exception 'ASSERT: L5 staff spent points';
  exception when insufficient_privilege then null;
  end;

  -- manager can
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  select public.spend_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 50, 'redemption', null, null, 'l5-mgr-spend', null) into v_res;
  if (v_res ->> 'balance_after')::int <> 150 then raise exception 'ASSERT: L5 balance_after % <> 150', v_res; end if;

  select points into v_pts from public.points_ledger
   where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and idempotency_key = 'l5-mgr-spend';
  if v_pts <> -50 then raise exception 'ASSERT: L5 redeem entry not stored negative: %', v_pts; end if;

  select count(*) into v_n from public.customer_points_balance
   where customer_membership_id = v_mem and current_points = 150 and lifetime_earned = 200 and lifetime_redeemed = 50;
  if v_n <> 1 then raise exception 'ASSERT: L5 cache totals wrong'; end if;
  execute 'reset role';

  select count(*) into v_n from public.audit_logs
   where action = 'points.redeemed' and target_id = v_mem::text;
  if v_n <> 1 then raise exception 'ASSERT: L5 points.redeemed audit missing'; end if;
end $$;

-- CASE: L6 ledger — overspending is refused with insufficient_points
do $$
declare
  v_mem uuid; v_msg text;
begin
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'L6 Member', 'active')
  returning id into v_mem;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  begin
    perform public.spend_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 10000, 'redemption', null, null, 'l6-overspend', null);
    raise exception 'ASSERT: L6 overspend was allowed';
  exception when invalid_parameter_value then
    v_msg := SQLERRM;
    if position('insufficient_points' in v_msg) = 0 then
      raise exception 'ASSERT: L6 wrong 22023 message: %', v_msg;
    end if;
  end;

  -- balance still zero, and nothing was written
  if public.point_balance(v_mem) <> 0 then raise exception 'ASSERT: L6 balance changed after refused spend'; end if;
  execute 'reset role';
end $$;

-- CASE: L7 ledger — owner-only adjustments require a reason and cannot overdraw
do $$
declare
  v_mem uuid; v_res jsonb; v_bal int; v_n int;
begin
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'L7 Member', 'active')
  returning id into v_mem;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  select public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 100, 'welcome', null, null, 'l7-earn', null) into v_res;

  -- manager cannot adjust
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  begin
    perform public.adjust_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, -30, 'manager correction');
    raise exception 'ASSERT: L7 manager adjusted points';
  exception when insufficient_privilege then null;
  end;

  -- owner can, with a reason
  perform set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
  begin
    perform public.adjust_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, -30, '   ');
    raise exception 'ASSERT: L7 blank reason accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.adjust_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, -5000, 'overdraw attempt');
    raise exception 'ASSERT: L7 overdraw accepted';
  exception when invalid_parameter_value then null;
  end;

  select public.adjust_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, -30, 'Goodwill correction') into v_res;
  if (v_res ->> 'balance_after')::int <> 70 then raise exception 'ASSERT: L7 balance_after % <> 70', v_res; end if;
  select public.point_balance(v_mem) into v_bal;
  if v_bal <> 70 then raise exception 'ASSERT: L7 point_balance % <> 70', v_bal; end if;

  -- lifetime totals untouched by adjustments
  select count(*) into v_n from public.customer_points_balance
   where customer_membership_id = v_mem and lifetime_earned = 100 and lifetime_redeemed = 0;
  if v_n <> 1 then raise exception 'ASSERT: L7 lifetimes should ignore adjustments'; end if;
  execute 'reset role';

  select count(*) into v_n from public.audit_logs
   where action = 'points.adjusted' and target_id = v_mem::text;
  if v_n <> 1 then raise exception 'ASSERT: L7 points.adjusted audit missing'; end if;
end $$;

-- CASE: L8 ledger — append-only: no DML grants for API roles; trigger blocks mutation even for postgres
do $$
declare
  v_mem uuid; v_res jsonb; v_id bigint;
begin
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'L8 Member', 'active')
  returning id into v_mem;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  select public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 60, 'manual', null, null, 'l8-earn', null) into v_res;
  v_id := (v_res ->> 'entry_id')::bigint;

  -- authenticated has no INSERT/UPDATE/DELETE grant at all
  begin
    update public.points_ledger set reason = 'tampered' where id = v_id;
    raise exception 'ASSERT: L8 authenticated updated the ledger';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.points_ledger where id = v_id;
    raise exception 'ASSERT: L8 authenticated deleted from the ledger';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.customer_points_balance set current_points = 999999 where customer_membership_id = v_mem;
    raise exception 'ASSERT: L8 authenticated updated the balance cache';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  -- even postgres (superuser) hits the immutability trigger
  begin
    update public.points_ledger set points = 6000 where id = v_id;
    raise exception 'ASSERT: L8 postgres updated the ledger';
  exception when invalid_parameter_value then null;
  end;
  begin
    delete from public.points_ledger where id = v_id;
    raise exception 'ASSERT: L8 postgres deleted from the ledger';
  exception when invalid_parameter_value then null;
  end;

  if public.point_balance(v_mem) <> 60 then raise exception 'ASSERT: L8 balance changed despite blocked mutation'; end if;
end $$;

-- CASE: L9 ledger — RLS visibility: own history for customers, business-wide for staff+, never cross-tenant
do $$
declare
  v_rahul_mem uuid; v_other_mem uuid; v_volt_mem uuid; v_res jsonb;
  v_own int; v_total int;
begin
  -- reuse Rahul's seeded membership (one membership per profile is enforced)
  select id into v_rahul_mem from public.customer_memberships
   where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and membership_no = 'AE-DEVRAHUL1';
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'L9 Other Mem', 'active')
  returning id into v_other_mem;
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000002', null, 'L9 Volt Mem', 'active')
  returning id into v_volt_mem;

  -- seed entries as staff-main (Ambika) and Volt owner (Volt)
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  select public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_rahul_mem, 30, 'manual', null, null, 'l9-rahul-1', null) into v_res;
  select public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_other_mem, 31, 'manual', null, null, 'l9-other-1', null) into v_res;
  perform set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
  select public.award_points('aaaaaaaa-0000-4000-8000-000000000002', v_volt_mem, 32, 'manual', null, null, 'l9-volt-1', null) into v_res;

  -- Rahul sees his own memberships' entries (L9 + his seeded history) and nothing else
  perform set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
  select count(*) into v_own from public.points_ledger
   where customer_membership_id = v_rahul_mem and idempotency_key = 'l9-rahul-1';
  if v_own <> 1 then raise exception 'ASSERT: L9 Rahul cannot see his own L9 entry, saw %', v_own; end if;
  select count(*) into v_total from public.points_ledger where customer_membership_id = v_other_mem;
  if v_total <> 0 then raise exception 'ASSERT: L9 Rahul sees % entries of another member, expected 0', v_total; end if;
  select count(*) into v_total from public.points_ledger where business_id = 'aaaaaaaa-0000-4000-8000-000000000002';
  if v_total <> 0 then raise exception 'ASSERT: L9 Rahul sees % Volt entries, expected 0', v_total; end if;
  select count(*) into v_own from public.customer_points_balance where customer_membership_id = v_rahul_mem;
  if v_own <> 1 then raise exception 'ASSERT: L9 Rahul sees % balance rows for his membership, expected 1', v_own; end if;
  select count(*) into v_total from public.customer_points_balance where customer_membership_id = v_other_mem;
  if v_total <> 0 then raise exception 'ASSERT: L9 Rahul sees another member''s balance row'; end if;

  -- staff-main sees all Ambika entries (L9: rahul + other) but nothing from Volt
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  select count(*) into v_total from public.points_ledger where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and idempotency_key like 'l9-%';
  if v_total <> 2 then raise exception 'ASSERT: L9 staff sees % Ambika L9 entries, expected 2', v_total; end if;
  select count(*) into v_total from public.points_ledger where business_id = 'aaaaaaaa-0000-4000-8000-000000000002';
  if v_total <> 0 then raise exception 'ASSERT: L9 staff sees % Volt entries, expected 0', v_total; end if;

  -- Volt owner sees only Volt
  perform set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
  select count(*) into v_total from public.points_ledger where business_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if v_total <> 0 then raise exception 'ASSERT: L9 Volt owner sees % Ambika entries, expected 0', v_total; end if;
  execute 'reset role';
end $$;

-- CASE: L10 ledger — integrity guards: membership must exist, be active and belong to the entry's business
do $$
declare
  v_mem uuid; v_res jsonb;
begin
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'L10 Member', 'active')
  returning id into v_mem;

  -- RPC: membership from another business is refused
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  begin
    perform public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 10, 'manual', null,
                                'bbbbbbbb-0000-4000-8000-000000000009', 'l10-foreign-store', null);
    raise exception 'ASSERT: L10 award into a foreign store was allowed';
  exception when invalid_parameter_value then null;
  end;
  execute 'reset role';

  -- direct insert (even as postgres) with a mismatched business is refused by the trigger
  begin
    insert into public.points_ledger
      (business_id, customer_membership_id, entry_type, points, balance_after, source_type, idempotency_key)
    values ('aaaaaaaa-0000-4000-8000-000000000002', v_mem, 'earn', 10, 10, 'import', 'l10-mismatch');
    raise exception 'ASSERT: L10 business-mismatched insert was allowed';
  exception when invalid_parameter_value then null;
  end;

  -- blocked memberships earn nothing (RPC + trigger both refuse)
  update public.customer_memberships set status = 'blocked' where id = v_mem;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  begin
    perform public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 10, 'manual', null, null, 'l10-blocked', null);
    raise exception 'ASSERT: L10 award into a blocked membership was allowed';
  exception when invalid_parameter_value then null;
  end;
  execute 'reset role';

  begin
    insert into public.points_ledger
      (business_id, customer_membership_id, entry_type, points, balance_after, source_type, idempotency_key)
    values ('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 'earn', 10, 10, 'import', 'l10-blocked-direct');
    raise exception 'ASSERT: L10 direct insert into a blocked membership was allowed';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SA cases — server-authoritative sales (Slice 2). Cases COMMIT; each creates
-- its own fixtures (memberships) and unique idempotency keys. Voided sales
-- flip status (sales are not immutable) but nothing is ever deleted.
-- ═══════════════════════════════════════════════════════════════════════════

-- CASE: SA1 sales — staff records a member sale: totals, points, invoice, payment, ledger and audit all in sync
do $$
declare
  v_mem uuid; v_res jsonb; v_n int; v_points int;
begin
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'SA1 Member', 'active')
  returning id into v_mem;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);

  -- ₹1,250.00 = 125000 paise → floor(125000 × 10 / 10000) = 125 points
  select public.create_sale(
    'bbbbbbbb-0000-4000-8000-000000000001',
    '[{"name":"Wiring kit","sku":"WK-100","qty":1,"unit_price_paise":100000},{"name":"LED bulb 9W","qty":5,"unit_price_paise":5000}]'::jsonb,
    '[{"method":"upi","amount_paise":125000}]'::jsonb,
    v_mem, 0, 'sa1-key'
  ) into v_res;

  if (v_res ->> 'total_paise')::bigint <> 125000 then raise exception 'ASSERT: SA1 total wrong: %', v_res; end if;
  if (v_res -> 'points' ->> 'base')::int <> 125 then raise exception 'ASSERT: SA1 points wrong: %', v_res; end if;
  if (v_res ->> 'balance_after')::int <> 125 then raise exception 'ASSERT: SA1 balance wrong: %', v_res; end if;
  if (v_res ->> 'invoice_no') !~ '^INV-[0-9]{6}$' then raise exception 'ASSERT: SA1 invoice format: %', v_res; end if;

  execute 'reset role';

  select count(*) into v_n from public.sale_items where sale_id = (v_res ->> 'sale_id')::uuid;
  if v_n <> 2 then raise exception 'ASSERT: SA1 expected 2 sale_items, got %', v_n; end if;
  select count(*) into v_n from public.sale_payments where sale_id = (v_res ->> 'sale_id')::uuid and method = 'upi';
  if v_n <> 1 then raise exception 'ASSERT: SA1 payment row missing'; end if;
  select count(*) into v_n from public.points_ledger
   where source_type = 'sale' and source_id = (v_res ->> 'sale_id')::uuid and points = 125;
  if v_n <> 1 then raise exception 'ASSERT: SA1 ledger earn entry missing'; end if;
  select total_points into v_points from public.sales where id = (v_res ->> 'sale_id')::uuid;
  if v_points <> 125 then raise exception 'ASSERT: SA1 sale.total_points wrong'; end if;
  select count(*) into v_n from public.audit_logs
   where action = 'sale.created' and target_id = (v_res ->> 'sale_id');
  if v_n <> 1 then raise exception 'ASSERT: SA1 sale.created audit missing'; end if;
end $$;

-- CASE: SA2 sales — walk-in sale earns no points and writes no ledger entry
do $$
declare
  v_res jsonb; v_n int;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  select public.create_sale(
    'bbbbbbbb-0000-4000-8000-000000000001',
    '[{"name":"MCB 32A","qty":2,"unit_price_paise":45000}]'::jsonb,
    '[{"method":"cash","amount_paise":90000}]'::jsonb,
    null, 0, 'sa2-key'
  ) into v_res;
  execute 'reset role';

  if (v_res -> 'points' ->> 'total')::int <> 0 then raise exception 'ASSERT: SA2 walk-in earned points'; end if;
  if (v_res ->> 'balance_after') is not null then raise exception 'ASSERT: SA2 walk-in has a balance'; end if;
  select count(*) into v_n from public.points_ledger where source_id = (v_res ->> 'sale_id')::uuid;
  if v_n <> 0 then raise exception 'ASSERT: SA2 ledger entry written for walk-in'; end if;
end $$;

-- CASE: SA3 sales — authorization: customers, other tenants and store-scoped staff are refused (42501)
do $$
declare
  v_mem uuid;
begin
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555', 'SA3 Rahul', 'active')
  on conflict do nothing;
  select id into v_mem from public.customer_memberships
   where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and membership_no = 'AE-DEVRAHUL1';

  execute 'set local role authenticated';

  -- customer cannot sell
  perform set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
  begin
    perform public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
      '[{"name":"x","qty":1,"unit_price_paise":100}]'::jsonb,
      '[{"method":"cash","amount_paise":100}]'::jsonb, v_mem, 0, 'sa3-customer');
    raise exception 'ASSERT: SA3 customer recorded a sale';
  exception when insufficient_privilege then null;
  end;

  -- Volt owner cannot sell into Ambika's store
  perform set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
  begin
    perform public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
      '[{"name":"x","qty":1,"unit_price_paise":100}]'::jsonb,
      '[{"method":"cash","amount_paise":100}]'::jsonb, null, 0, 'sa3-volt');
    raise exception 'ASSERT: SA3 cross-tenant sale recorded';
  exception when insufficient_privilege then null;
  end;

  -- staff-satellite (scoped to Satellite store) cannot sell at Main store
  perform set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
  begin
    perform public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
      '[{"name":"x","qty":1,"unit_price_paise":100}]'::jsonb,
      '[{"method":"cash","amount_paise":100}]'::jsonb, null, 0, 'sa3-scoped');
    raise exception 'ASSERT: SA3 store-scoped staff sold outside their store';
  exception when insufficient_privilege then null;
  end;

  -- ...but CAN sell at their own store
  perform public.create_sale('bbbbbbbb-0000-4000-8000-000000000002',
      '[{"name":"x","qty":1,"unit_price_paise":100}]'::jsonb,
      '[{"method":"cash","amount_paise":100}]'::jsonb, null, 0, 'sa3-scoped-ok');
  execute 'reset role';
end $$;

-- CASE: SA4 sales — idempotency key replay returns the stored sale without double-posting
do $$
declare
  v_mem uuid; v_res1 jsonb; v_res2 jsonb; v_n int;
begin
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'SA4 Member', 'active')
  returning id into v_mem;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  select public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
    '[{"name":"Fan","qty":1,"unit_price_paise":250000}]'::jsonb,
    '[{"method":"card","amount_paise":250000}]'::jsonb, v_mem, 0, 'sa4-key') into v_res1;
  select public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
    '[{"name":"Fan","qty":1,"unit_price_paise":250000}]'::jsonb,
    '[{"method":"card","amount_paise":250000}]'::jsonb, v_mem, 0, 'sa4-key') into v_res2;
  execute 'reset role';

  if not (v_res2 ->> 'replayed')::boolean then raise exception 'ASSERT: SA4 second call not replayed'; end if;
  if (v_res1 ->> 'sale_id') <> (v_res2 ->> 'sale_id') then raise exception 'ASSERT: SA4 replay returned a different sale'; end if;
  select count(*) into v_n from public.sales where idempotency_key = 'sa4-key';
  if v_n <> 1 then raise exception 'ASSERT: SA4 duplicate sales: %', v_n; end if;
  select count(*) into v_n from public.points_ledger where idempotency_key = 'sale:' || (v_res1 ->> 'sale_id');
  if v_n <> 1 then raise exception 'ASSERT: SA4 duplicate ledger entries: %', v_n; end if;
end $$;

-- CASE: SA5 sales — money validation: payment mismatch, bad method, bad qty/price, discount over subtotal
do $$
declare
  v_msg text;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);

  begin
    perform public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
      '[{"name":"x","qty":1,"unit_price_paise":10000}]'::jsonb,
      '[{"method":"cash","amount_paise":9999}]'::jsonb, null, 0, 'sa5-mismatch');
    raise exception 'ASSERT: SA5 payment mismatch accepted';
  exception when invalid_parameter_value then
    v_msg := SQLERRM;
    if position('payment_mismatch' in v_msg) = 0 then raise exception 'ASSERT: SA5 wrong message %', v_msg; end if;
  end;

  begin
    perform public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
      '[{"name":"x","qty":1,"unit_price_paise":10000}]'::jsonb,
      '[{"method":"bitcoin","amount_paise":10000}]'::jsonb, null, 0, 'sa5-method');
    raise exception 'ASSERT: SA5 invalid payment method accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
      '[{"name":"x","qty":0,"unit_price_paise":10000}]'::jsonb,
      '[{"method":"cash","amount_paise":0}]'::jsonb, null, 0, 'sa5-qty');
    raise exception 'ASSERT: SA5 zero qty accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
      '[{"name":"x","qty":1,"unit_price_paise":10000}]'::jsonb,
      '[{"method":"cash","amount_paise":5000}]'::jsonb, null, 999999, 'sa5-discount');
    raise exception 'ASSERT: SA5 over-subtotal discount accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.create_sale('bbbbbbbb-0000-4000-8000-000000000001', '[]'::jsonb,
      '[{"method":"cash","amount_paise":1}]'::jsonb, null, 0, 'sa5-empty');
    raise exception 'ASSERT: SA5 empty sale accepted';
  exception when invalid_parameter_value then null;
  end;
  execute 'reset role';
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.sales where idempotency_key like 'sa5-%';
  if v_n <> 0 then raise exception 'ASSERT: SA5 rejected sales were persisted: %', v_n; end if;
end $$;

-- CASE: SA6 sales — invoice numbers are sequential per business and independent across tenants
do $$
declare
  v_res jsonb; v_inv1 text; v_inv2 text; v_volt_inv text;
begin
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
  select public.create_sale('bbbbbbbb-0000-4000-8000-000000000009',
    '[{"name":"Volt item","qty":1,"unit_price_paise":50000}]'::jsonb,
    '[{"method":"cash","amount_paise":50000}]'::jsonb, null, 0, 'sa6-volt-1') into v_res;
  v_volt_inv := v_res ->> 'invoice_no';

  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  select public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
    '[{"name":"a","qty":1,"unit_price_paise":1000}]'::jsonb,
    '[{"method":"cash","amount_paise":1000}]'::jsonb, null, 0, 'sa6-amb-1') into v_res;
  v_inv1 := v_res ->> 'invoice_no';
  select public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
    '[{"name":"b","qty":1,"unit_price_paise":2000}]'::jsonb,
    '[{"method":"cash","amount_paise":2000}]'::jsonb, null, 0, 'sa6-amb-2') into v_res;
  v_inv2 := v_res ->> 'invoice_no';
  execute 'reset role';

  if v_volt_inv <> 'INV-000001' then raise exception 'ASSERT: SA6 Volt counter should start at 1, got %', v_volt_inv; end if;
  if (substr(v_inv2, 5))::bigint <> (substr(v_inv1, 5))::bigint + 1 then
    raise exception 'ASSERT: SA6 Ambika sequence not consecutive: %, %', v_inv1, v_inv2;
  end if;
  if v_inv1 = v_volt_inv and (select count(*) from public.sales) > 1 then
    raise exception 'ASSERT: SA6 tenants must have independent counters';
  end if;
end $$;

-- CASE: SA7 sales — void is manager+, reason-required, reverses points with a compensating entry, and is final
do $$
declare
  v_mem uuid; v_res jsonb; v_sale uuid; v_bal int; v_n int; v_status public.sale_status;
begin
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'SA7 Member', 'active')
  returning id into v_mem;

  execute 'set local role authenticated';

  -- staff records ₹500 → 50 points
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  select public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
    '[{"name":"Cable","qty":1,"unit_price_paise":50000}]'::jsonb,
    '[{"method":"cash","amount_paise":50000}]'::jsonb, v_mem, 0, 'sa7-key') into v_res;
  v_sale := (v_res ->> 'sale_id')::uuid;

  -- staff cannot void
  begin
    perform public.void_sale(v_sale, 'mistake');
    raise exception 'ASSERT: SA7 staff voided a sale';
  exception when insufficient_privilege then null;
  end;

  -- manager needs a reason
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  begin
    perform public.void_sale(v_sale, '   ');
    raise exception 'ASSERT: SA7 blank void reason accepted';
  exception when invalid_parameter_value then null;
  end;

  -- manager voids for real
  select public.void_sale(v_sale, 'Billing mistake') into v_res;
  if (v_res ->> 'points_reversed')::int <> 50 then raise exception 'ASSERT: SA7 points_reversed wrong: %', v_res; end if;
  if (v_res ->> 'balance_after')::int <> 0 then raise exception 'ASSERT: SA7 balance not back to 0: %', v_res; end if;
  execute 'reset role';

  select status into v_status from public.sales where id = v_sale;
  if v_status <> 'voided' then raise exception 'ASSERT: SA7 status not voided'; end if;
  select count(*) into v_n from public.points_ledger
   where entry_type = 'adjust' and points = -50 and source_id = v_sale;
  if v_n <> 1 then raise exception 'ASSERT: SA7 compensating adjust entry missing'; end if;
  select count(*) into v_n from public.audit_logs where action = 'sale.voided' and target_id = v_sale::text;
  if v_n <> 1 then raise exception 'ASSERT: SA7 sale.voided audit missing'; end if;

  -- second void is refused
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  begin
    perform public.void_sale(v_sale, 'again');
    raise exception 'ASSERT: SA7 double void accepted';
  exception when invalid_parameter_value then null;
  end;
  execute 'reset role';
end $$;

-- CASE: SA8 sales — RLS visibility: customers see only their own sales; staff whole business; never cross-tenant
do $$
declare
  v_rahul_mem uuid; v_other_mem uuid; v_res jsonb;
  v_own int; v_other int; v_volt int; v_items int;
begin
  select id into v_rahul_mem from public.customer_memberships
   where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and membership_no = 'AE-DEVRAHUL1';
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'SA8 Other', 'active')
  returning id into v_other_mem;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  select public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
    '[{"name":"Rahul item","qty":1,"unit_price_paise":30000}]'::jsonb,
    '[{"method":"cash","amount_paise":30000}]'::jsonb, v_rahul_mem, 0, 'sa8-rahul') into v_res;
  select public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
    '[{"name":"Other item","qty":1,"unit_price_paise":31000}]'::jsonb,
    '[{"method":"cash","amount_paise":31000}]'::jsonb, v_other_mem, 0, 'sa8-other') into v_res;

  -- Rahul: only his own sale (+ items through the parent-sale policy)
  perform set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
  select count(*) into v_own from public.sales where customer_membership_id = v_rahul_mem and idempotency_key = 'sa8-rahul';
  if v_own <> 1 then raise exception 'ASSERT: SA8 Rahul cannot see his own sale'; end if;
  select count(*) into v_other from public.sales where customer_membership_id = v_other_mem;
  if v_other <> 0 then raise exception 'ASSERT: SA8 Rahul sees another member''s sale'; end if;
  select count(*) into v_volt from public.sales where business_id = 'aaaaaaaa-0000-4000-8000-000000000002';
  if v_volt <> 0 then raise exception 'ASSERT: SA8 Rahul sees Volt sales'; end if;
  select count(*) into v_items from public.sale_items si
    where si.sale_id in (select s.id from public.sales s where s.idempotency_key = 'sa8-rahul');
  if v_items <> 1 then raise exception 'ASSERT: SA8 Rahul cannot see his own sale items'; end if;
  select count(*) into v_items from public.sale_items si
    where si.sale_id in (select s.id from public.sales s where s.idempotency_key = 'sa8-other');
  if v_items <> 0 then raise exception 'ASSERT: SA8 Rahul sees another member''s sale items'; end if;

  -- staff-main: sees both Ambika sales, no Volt sales
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  select count(*) into v_own from public.sales where idempotency_key like 'sa8-%';
  if v_own <> 2 then raise exception 'ASSERT: SA8 staff sees % sa8 sales, expected 2', v_own; end if;

  -- Volt owner: zero Ambika sales
  perform set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
  select count(*) into v_volt from public.sales where business_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if v_volt <> 0 then raise exception 'ASSERT: SA8 Volt owner sees % Ambika sales, expected 0', v_volt; end if;
  execute 'reset role';
end $$;

-- CASE: SA9 sales — no DML grants: API roles cannot insert/update sales, items, payments or counters
do $$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);

  begin
    insert into public.sales (business_id, store_id, invoice_no, subtotal_paise, total_paise)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
            'INV-999999', 100, 100);
    raise exception 'ASSERT: SA9 owner inserted a sale directly';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.sales set total_paise = 1 where invoice_no = 'INV-999999';
    raise exception 'ASSERT: SA9 owner updated sales directly';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.sale_payments (sale_id, method, amount_paise)
    values (gen_random_uuid(), 'cash', 100);
    raise exception 'ASSERT: SA9 owner inserted a payment directly';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.invoice_counters set next_seq = 999;
    raise exception 'ASSERT: SA9 owner touched the invoice counter';
  exception when insufficient_privilege then null;
  end;

  -- counters are invisible to API roles (no SELECT grant at all)
  begin
    perform count(*) from public.invoice_counters;
    raise exception 'ASSERT: SA9 invoice counters readable by API roles';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- INV cases — catalogue + per-store stock + append-only inventory movements
-- (Slice 3). Cases COMMIT; each creates its own fixtures (products) and
-- unique idempotency keys. Seeded catalogue product cccc…01 (Philips 9W LED
-- Bulb, ₹120.00 = 12000 paise, Main Store opening stock 120) is walked
-- deterministically: 120 → 118 → 117 (INV2) → 142 → 137 (INV4) → 134 → 137
-- (INV5). Stock rows are never deleted; corrections are appended movements.
-- ═══════════════════════════════════════════════════════════════════════════

-- CASE: INV1 products — manager creates with opening stock; staff/customers/other tenants refused; duplicate sku refused
do $$
declare
  v_res jsonb; v_pid uuid; v_n int;
begin
  execute 'set local role authenticated';

  -- staff cannot create products
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  begin
    perform public.create_product('aaaaaaaa-0000-4000-8000-000000000001', 'Staff attempt', 'INV1-STAFF', 100);
    raise exception 'ASSERT: INV1 staff created a product';
  exception when insufficient_privilege then null;
  end;

  -- customer cannot create products
  perform set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
  begin
    perform public.create_product('aaaaaaaa-0000-4000-8000-000000000001', 'Customer attempt', 'INV1-CUST', 100);
    raise exception 'ASSERT: INV1 customer created a product';
  exception when insufficient_privilege then null;
  end;

  -- Volt owner cannot create in Ambika's catalogue
  perform set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
  begin
    perform public.create_product('aaaaaaaa-0000-4000-8000-000000000001', 'Volt attempt', 'INV1-VOLT', 100);
    raise exception 'ASSERT: INV1 cross-tenant product created';
  exception when insufficient_privilege then null;
  end;

  -- manager creates with opening stock at the Main Store
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  select public.create_product(
    'aaaaaaaa-0000-4000-8000-000000000001', 'INV1 Test Product', 'inv1-test-sku', 50000,
    'Testing', null, 60000, 'piece', null,
    '[{"store_id":"bbbbbbbb-0000-4000-8000-000000000001","qty":10}]'::jsonb
  ) into v_res;
  execute 'reset role';

  v_pid := (v_res ->> 'product_id')::uuid;
  if (v_res ->> 'sku') <> 'INV1-TEST-SKU' then raise exception 'ASSERT: INV1 sku not normalized: %', v_res; end if;

  select count(*) into v_n from public.products
   where id = v_pid and status = 'active' and price_paise = 50000 and category = 'Testing';
  if v_n <> 1 then raise exception 'ASSERT: INV1 product row wrong'; end if;
  select on_hand into v_n from public.inventory_by_store
   where product_id = v_pid and store_id = 'bbbbbbbb-0000-4000-8000-000000000001';
  if v_n <> 10 then raise exception 'ASSERT: INV1 opening stock wrong: %', v_n; end if;
  select count(*) into v_n from public.inventory_movements
   where product_id = v_pid and reason = 'initial' and delta = 10 and balance_after = 10;
  if v_n <> 1 then raise exception 'ASSERT: INV1 initial movement missing'; end if;
  select count(*) into v_n from public.audit_logs where action = 'product.created' and target_id = v_pid::text;
  if v_n <> 1 then raise exception 'ASSERT: INV1 product.created audit missing'; end if;

  -- duplicate sku refused
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  begin
    perform public.create_product('aaaaaaaa-0000-4000-8000-000000000001', 'Dup', 'INV1-TEST-SKU', 100);
    raise exception 'ASSERT: INV1 duplicate sku accepted';
  exception when invalid_parameter_value then
    if position('sku_exists' in SQLERRM) = 0 then raise exception 'ASSERT: INV1 wrong message %', SQLERRM; end if;
  end;
  execute 'reset role';
end $$;

-- CASE: INV2 sales re-price from the catalogue; staff overrides refused, manager overrides flagged; stock decrements
do $$
declare
  v_res jsonb; v_sale uuid; v_n int; v_price bigint; v_over boolean; v_name text;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);

  -- staff sending a wrong price for a catalogue line is refused
  begin
    perform public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
      '[{"product_id":"cccccccc-0000-4000-8000-000000000001","name":"Hacked","qty":1,"unit_price_paise":10000}]'::jsonb,
      '[{"method":"cash","amount_paise":10000}]'::jsonb, null, 0, 'inv2-bad-price');
    raise exception 'ASSERT: INV2 staff price override accepted';
  exception when invalid_parameter_value then
    if position('price_override_forbidden' in SQLERRM) = 0 then raise exception 'ASSERT: INV2 wrong message %', SQLERRM; end if;
  end;
  execute 'reset role';
  select count(*) into v_n from public.sales where idempotency_key = 'inv2-bad-price';
  if v_n <> 0 then raise exception 'ASSERT: INV2 refused sale persisted'; end if;

  -- staff selling at the catalogue price succeeds; catalogue name/price win
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  select public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
    '[{"product_id":"cccccccc-0000-4000-8000-000000000001","name":"Hacked","qty":2,"unit_price_paise":12000}]'::jsonb,
    '[{"method":"upi","amount_paise":24000}]'::jsonb, null, 0, 'inv2-ok') into v_res;

  -- manager may override the price (flagged + audited)
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  select public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
    '[{"product_id":"cccccccc-0000-4000-8000-000000000001","qty":1,"unit_price_paise":11000}]'::jsonb,
    '[{"method":"cash","amount_paise":11000}]'::jsonb, null, 0, 'inv2-override') into v_res;
  if (v_res ->> 'price_overrides')::int <> 1 then raise exception 'ASSERT: INV2 override not counted: %', v_res; end if;
  v_sale := (v_res ->> 'sale_id')::uuid;
  execute 'reset role';

  select si.unit_price_paise, si.price_overridden, si.name_snapshot into v_price, v_over, v_name
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
   where s.idempotency_key = 'inv2-override';
  if v_price <> 11000 or not v_over then raise exception 'ASSERT: INV2 override line wrong: % / %', v_price, v_over; end if;

  select si.unit_price_paise, si.price_overridden, si.name_snapshot, si.product_id into v_price, v_over, v_name, v_sale
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
   where s.idempotency_key = 'inv2-ok';
  if v_price <> 12000 then raise exception 'ASSERT: INV2 catalogue price not used: %', v_price; end if;
  if v_over then raise exception 'ASSERT: INV2 clean line flagged as override'; end if;
  if v_name <> 'Philips 9W LED Bulb' then raise exception 'ASSERT: INV2 client name not replaced by catalogue: %', v_name; end if;
  if v_sale <> 'cccccccc-0000-4000-8000-000000000001' then raise exception 'ASSERT: INV2 product link missing'; end if;

  -- stock: 120 seeded → 118 (qty 2) → 117 (override qty 1)
  select on_hand into v_n from public.inventory_by_store
   where product_id = 'cccccccc-0000-4000-8000-000000000001' and store_id = 'bbbbbbbb-0000-4000-8000-000000000001';
  if v_n <> 117 then raise exception 'ASSERT: INV2 stock wrong: expected 117, got %', v_n; end if;
  select count(*) into v_n from public.inventory_movements
   where product_id = 'cccccccc-0000-4000-8000-000000000001' and reason = 'sale'
     and store_id = 'bbbbbbbb-0000-4000-8000-000000000001' and delta in (-2, -1);
  if v_n <> 2 then raise exception 'ASSERT: INV2 sale movements wrong: %', v_n; end if;
  select count(*) into v_n from public.inventory_movements m
   where m.reason = 'sale' and m.balance_after = 118 and m.delta = -2
     and m.product_id = 'cccccccc-0000-4000-8000-000000000001';
  if v_n <> 1 then raise exception 'ASSERT: INV2 movement balance_after wrong'; end if;
end $$;

-- CASE: INV3 sales — insufficient stock and fractional catalogue quantities are refused with nothing persisted
do $$
declare
  v_n int;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);

  begin
    perform public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
      '[{"product_id":"cccccccc-0000-4000-8000-000000000001","qty":5000,"unit_price_paise":12000}]'::jsonb,
      '[{"method":"cash","amount_paise":60000000}]'::jsonb, null, 0, 'inv3-stock');
    raise exception 'ASSERT: INV3 oversell accepted';
  exception when invalid_parameter_value then
    if position('insufficient_stock' in SQLERRM) = 0 then raise exception 'ASSERT: INV3 wrong message %', SQLERRM; end if;
  end;

  begin
    perform public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
      '[{"product_id":"cccccccc-0000-4000-8000-000000000001","qty":1.5,"unit_price_paise":12000}]'::jsonb,
      '[{"method":"cash","amount_paise":18000}]'::jsonb, null, 0, 'inv3-frac');
    raise exception 'ASSERT: INV3 fractional catalogue qty accepted';
  exception when invalid_parameter_value then
    if position('whole units' in SQLERRM) = 0 then raise exception 'ASSERT: INV3 wrong message %', SQLERRM; end if;
  end;
  execute 'reset role';

  select count(*) into v_n from public.sales where idempotency_key like 'inv3-%';
  if v_n <> 0 then raise exception 'ASSERT: INV3 refused sales persisted'; end if;
  select on_hand into v_n from public.inventory_by_store
   where product_id = 'cccccccc-0000-4000-8000-000000000001' and store_id = 'bbbbbbbb-0000-4000-8000-000000000001';
  if v_n <> 117 then raise exception 'ASSERT: INV3 stock moved on refusal: %', v_n; end if;
end $$;

-- CASE: INV4 stock ops — receive/adjust are manager+, reason-guarded, replay-safe, and cross-tenant-safe; update_product flow
do $$
declare
  v_res jsonb; v_n int; v_pid uuid; v_price bigint;
begin
  execute 'set local role authenticated';

  -- staff cannot receive stock
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  begin
    perform public.receive_stock('bbbbbbbb-0000-4000-8000-000000000001',
      'cccccccc-0000-4000-8000-000000000001', 5, null, 'inv4-staff');
    raise exception 'ASSERT: INV4 staff received stock';
  exception when insufficient_privilege then null;
  end;

  -- manager receives +25, replayed with the same key → one movement only
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  select public.receive_stock('bbbbbbbb-0000-4000-8000-000000000001',
    'cccccccc-0000-4000-8000-000000000001', 25, 'Supplier delivery', 'inv4-receive') into v_res;
  if (v_res ->> 'balance_after')::int <> 142 then raise exception 'ASSERT: INV4 receive balance wrong: %', v_res; end if;
  select public.receive_stock('bbbbbbbb-0000-4000-8000-000000000001',
    'cccccccc-0000-4000-8000-000000000001', 25, 'Supplier delivery', 'inv4-receive') into v_res;
  if not (v_res ->> 'replayed')::boolean then raise exception 'ASSERT: INV4 receive replay not flagged'; end if;

  select count(*) into v_n from public.inventory_movements where idempotency_key = 'inv4-receive';
  if v_n <> 1 then raise exception 'ASSERT: INV4 duplicate receipt movements: %', v_n; end if;

  -- invalid quantity
  begin
    perform public.receive_stock('bbbbbbbb-0000-4000-8000-000000000001',
      'cccccccc-0000-4000-8000-000000000001', 0, null, 'inv4-zero');
    raise exception 'ASSERT: INV4 zero receipt accepted';
  exception when invalid_parameter_value then null;
  end;

  -- adjustment needs a reason
  begin
    perform public.adjust_stock('bbbbbbbb-0000-4000-8000-000000000001',
      'cccccccc-0000-4000-8000-000000000001', -5, '   ', 'inv4-noreason');
    raise exception 'ASSERT: INV4 reasonless adjustment accepted';
  exception when invalid_parameter_value then null;
  end;

  -- valid adjustment −5 → 137
  select public.adjust_stock('bbbbbbbb-0000-4000-8000-000000000001',
    'cccccccc-0000-4000-8000-000000000001', -5, 'Damaged in transit', 'inv4-adjust') into v_res;
  if (v_res ->> 'balance_after')::int <> 137 then raise exception 'ASSERT: INV4 adjust balance wrong: %', v_res; end if;

  -- cannot adjust below available stock
  begin
    perform public.adjust_stock('bbbbbbbb-0000-4000-8000-000000000001',
      'cccccccc-0000-4000-8000-000000000001', -99999, 'Impossible', 'inv4-overdraw');
    raise exception 'ASSERT: INV4 overdraw accepted';
  exception when invalid_parameter_value then
    if position('insufficient_stock' in SQLERRM) = 0 then raise exception 'ASSERT: INV4 wrong message %', SQLERRM; end if;
  end;

  -- Volt's product cannot be received into an Ambika store
  begin
    perform public.receive_stock('bbbbbbbb-0000-4000-8000-000000000001',
      'cccccccc-0000-4000-8000-000000000007', 5, null, 'inv4-cross');
    raise exception 'ASSERT: INV4 cross-tenant receipt accepted';
  exception when invalid_parameter_value then
    if position('product_not_in_business' in SQLERRM) = 0 then raise exception 'ASSERT: INV4 wrong message %', SQLERRM; end if;
  end;

  -- update_product: staff refused; manager re-prices; bad status refused; empty update refused
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  begin
    perform public.update_product('cccccccc-0000-4000-8000-000000000003', null, 9999);
    raise exception 'ASSERT: INV4 staff re-priced a product';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  select public.update_product('cccccccc-0000-4000-8000-000000000003', null, 9000) into v_res;
  if (v_res ->> 'price_paise')::bigint <> 9000 then raise exception 'ASSERT: INV4 re-price wrong: %', v_res; end if;

  begin
    perform public.update_product('cccccccc-0000-4000-8000-000000000003', null, null, null, null, null, null, null, 'deleted');
    raise exception 'ASSERT: INV4 invalid status accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.update_product('cccccccc-0000-4000-8000-000000000003');
    raise exception 'ASSERT: INV4 empty update accepted';
  exception when invalid_parameter_value then null;
  end;

  -- archive a fixture product → receipts refused afterwards
  select public.create_product('aaaaaaaa-0000-4000-8000-000000000001', 'INV4 Archive Me', 'INV4-ARCH', 10000) into v_res;
  v_pid := (v_res ->> 'product_id')::uuid;
  perform public.update_product(v_pid, null, null, null, null, null, null, null, 'archived');
  begin
    perform public.receive_stock('bbbbbbbb-0000-4000-8000-000000000001', v_pid, 5, null, 'inv4-archived');
    raise exception 'ASSERT: INV4 archived product received stock';
  exception when invalid_parameter_value then
    if position('product_archived' in SQLERRM) = 0 then raise exception 'ASSERT: INV4 wrong message %', SQLERRM; end if;
  end;
  execute 'reset role';

  select price_paise into v_price from public.products where id = 'cccccccc-0000-4000-8000-000000000003';
  if v_price <> 9000 then raise exception 'ASSERT: INV4 catalogue price not persisted: %', v_price; end if;
  select count(*) into v_n from public.audit_logs where action = 'product.updated'
    and target_id = 'cccccccc-0000-4000-8000-000000000003';
  if v_n <> 1 then raise exception 'ASSERT: INV4 product.updated audit missing'; end if;
  select count(*) into v_n from public.audit_logs where action = 'stock.received'
    and target_id = 'cccccccc-0000-4000-8000-000000000001';
  if v_n <> 1 then raise exception 'ASSERT: INV4 replay double-audited: %', v_n; end if;
end $$;

-- CASE: INV5 void restocks catalogue lines with compensating sale_void movements
do $$
declare
  v_mem uuid; v_res jsonb; v_sale uuid; v_n int;
begin
  select id into v_mem from public.customer_memberships
   where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and membership_no = 'AE-DEVRAHUL1';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  select public.create_sale('bbbbbbbb-0000-4000-8000-000000000001',
    '[{"product_id":"cccccccc-0000-4000-8000-000000000001","qty":3,"unit_price_paise":12000}]'::jsonb,
    '[{"method":"cash","amount_paise":36000}]'::jsonb, v_mem, 0, 'inv5-sale') into v_res;
  v_sale := (v_res ->> 'sale_id')::uuid;
  execute 'reset role';

  select on_hand into v_n from public.inventory_by_store
   where product_id = 'cccccccc-0000-4000-8000-000000000001' and store_id = 'bbbbbbbb-0000-4000-8000-000000000001';
  if v_n <> 134 then raise exception 'ASSERT: INV5 stock not decremented: %', v_n; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  select public.void_sale(v_sale, 'Customer changed mind') into v_res;
  if (v_res ->> 'stock_lines_restored')::int <> 1 then raise exception 'ASSERT: INV5 restock count wrong: %', v_res; end if;
  if (v_res ->> 'points_reversed')::int <> 36 then raise exception 'ASSERT: INV5 points reversal wrong: %', v_res; end if;
  execute 'reset role';

  select on_hand into v_n from public.inventory_by_store
   where product_id = 'cccccccc-0000-4000-8000-000000000001' and store_id = 'bbbbbbbb-0000-4000-8000-000000000001';
  if v_n <> 137 then raise exception 'ASSERT: INV5 stock not restored: %', v_n; end if;
  select count(*) into v_n from public.inventory_movements
   where reason = 'sale_void' and product_id = 'cccccccc-0000-4000-8000-000000000001'
     and delta = 3 and balance_after = 137 and reference_id = v_sale;
  if v_n <> 1 then raise exception 'ASSERT: INV5 sale_void movement wrong'; end if;
end $$;

-- CASE: INV6 inventory_movements are immutable — triggers refuse postgres, grants refuse API roles
do $$
begin
  -- even postgres (table owner) cannot rewrite movement history
  begin
    update public.inventory_movements set note = 'tampered' where id = (select min(id) from public.inventory_movements);
    raise exception 'ASSERT: INV6 postgres updated a movement';
  exception when invalid_parameter_value then null;
  end;
  begin
    delete from public.inventory_movements where id = (select min(id) from public.inventory_movements);
    raise exception 'ASSERT: INV6 postgres deleted a movement';
  exception when invalid_parameter_value then null;
  end;

  -- API roles have no DML grants at all
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
  begin
    insert into public.inventory_movements (business_id, store_id, product_id, delta, balance_after, reason)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
            'cccccccc-0000-4000-8000-000000000001', 1, 999, 'receipt');
    raise exception 'ASSERT: INV6 owner inserted a movement directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.inventory_by_store set on_hand = 99999
     where product_id = 'cccccccc-0000-4000-8000-000000000001';
    raise exception 'ASSERT: INV6 owner rewrote stock directly';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end $$;

-- CASE: INV7 RLS visibility — staff+ see the business catalogue & stock; customers and other tenants see none
do $$
declare
  v_n int;
begin
  execute 'set local role authenticated';

  -- customer: no catalogue, no stock, no movements
  perform set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
  select count(*) into v_n from public.products where business_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if v_n <> 0 then raise exception 'ASSERT: INV7 customer sees % products', v_n; end if;
  select count(*) into v_n from public.inventory_by_store;
  if v_n <> 0 then raise exception 'ASSERT: INV7 customer sees stock rows'; end if;
  select count(*) into v_n from public.inventory_movements;
  if v_n <> 0 then raise exception 'ASSERT: INV7 customer sees movements'; end if;

  -- Volt owner: only Volt's catalogue
  perform set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
  select count(*) into v_n from public.products where business_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if v_n <> 0 then raise exception 'ASSERT: INV7 Volt owner sees Ambika products'; end if;
  select count(*) into v_n from public.products where business_id = 'aaaaaaaa-0000-4000-8000-000000000002';
  if v_n < 1 then raise exception 'ASSERT: INV7 Volt owner cannot see own products'; end if;

  -- store-scoped staff: business-wide catalogue reads, but stock only for
  -- their own stores (proposal §Store-scoped; the inventory policy inherits
  -- the stores RLS scoping). Seeded Satellite rows: 6 products × 1 store.
  perform set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
  select count(*) into v_n from public.products where business_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if v_n < 6 then raise exception 'ASSERT: INV7 scoped staff sees % products, expected ≥6', v_n; end if;
  select count(*) into v_n from public.inventory_by_store;
  if v_n <> 6 then raise exception 'ASSERT: INV7 scoped staff sees % stock rows, expected exactly their 6 store rows', v_n; end if;

  -- manager: business-wide stock, never the other tenant's
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  select count(*) into v_n from public.inventory_by_store;
  if v_n < 12 then raise exception 'ASSERT: INV7 manager sees % stock rows, expected ≥12', v_n; end if;
  select count(*) into v_n from public.inventory_by_store
   where store_id = 'bbbbbbbb-0000-4000-8000-000000000009';
  if v_n <> 0 then raise exception 'ASSERT: INV7 Ambika manager sees Volt stock rows'; end if;
  execute 'reset role';
end $$;

-- CASE: INV8 no DML grants — even owners cannot write products or stock directly (RPC-only)
do $$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);

  begin
    insert into public.products (business_id, sku, name, price_paise)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'INV8-DIRECT', 'Direct insert', 100);
    raise exception 'ASSERT: INV8 owner inserted a product directly';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.products set price_paise = 1 where sku = 'AMB-LGT-009';
    raise exception 'ASSERT: INV8 owner updated a product directly';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.inventory_by_store (product_id, store_id, on_hand)
    values ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 5);
    raise exception 'ASSERT: INV8 owner inserted a stock row directly';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.products where sku = 'AMB-LGT-009';
    raise exception 'ASSERT: INV8 owner deleted a product';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RE cases — rewards catalogue + point redemptions (Slice 4). Cases COMMIT;
-- each creates its own fixtures (rewards, memberships) and unique
-- idempotency keys. Balances are asserted as DELTAS (earlier committed cases
-- may have moved seeded balances). Collection codes are random per run — the
-- plaintext is captured from the RPC response and only its sha256 + last4
-- may exist in the database.
-- ═══════════════════════════════════════════════════════════════════════════

-- CASE: RE1 rewards — manager-only lifecycle: create with validation, update, archive; inventory rows manager-only
do $$
declare
  v_res jsonb; v_rid uuid; v_n int;
begin
  execute 'set local role authenticated';

  -- staff cannot create rewards
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  begin
    perform public.create_reward('aaaaaaaa-0000-4000-8000-000000000001', 'Staff gift', 'gift', 100);
    raise exception 'ASSERT: RE1 staff created a reward';
  exception when insufficient_privilege then null;
  end;

  -- customer cannot create rewards
  perform set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
  begin
    perform public.create_reward('aaaaaaaa-0000-4000-8000-000000000001', 'Customer gift', 'gift', 100);
    raise exception 'ASSERT: RE1 customer created a reward';
  exception when insufficient_privilege then null;
  end;

  -- Volt owner cannot create in Ambika's catalogue
  perform set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
  begin
    perform public.create_reward('aaaaaaaa-0000-4000-8000-000000000001', 'Volt gift', 'gift', 100);
    raise exception 'ASSERT: RE1 cross-tenant reward created';
  exception when insufficient_privilege then null;
  end;

  -- manager creates; invalid type / cost refused
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  begin
    perform public.create_reward('aaaaaaaa-0000-4000-8000-000000000001', 'Bad type', 'freebie', 100);
    raise exception 'ASSERT: RE1 invalid reward_type accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_reward('aaaaaaaa-0000-4000-8000-000000000001', 'Free freebie', 'gift', 0);
    raise exception 'ASSERT: RE1 zero points_cost accepted';
  exception when invalid_parameter_value then null;
  end;

  select public.create_reward('aaaaaaaa-0000-4000-8000-000000000001',
    'RE1 Test Gift', 'gift', 200, 'Fixture reward', 'Testing', null, 'gift', 7, 1) into v_res;
  v_rid := (v_res ->> 'reward_id')::uuid;

  -- update: re-price, then archive (nothing pending)
  select public.update_reward(v_rid, null, null, 250) into v_res;
  if (v_res ->> 'points_cost')::int <> 250 then raise exception 'ASSERT: RE1 re-price failed: %', v_res; end if;
  begin
    perform public.update_reward(v_rid, null, null, null, null, null, null, null, null, 'deleted');
    raise exception 'ASSERT: RE1 invalid status accepted';
  exception when invalid_parameter_value then null;
  end;
  select public.update_reward(v_rid, null, null, null, null, null, null, null, null, 'archived') into v_res;
  if (v_res ->> 'status') <> 'archived' then raise exception 'ASSERT: RE1 archive failed'; end if;

  -- archived rewards cannot be redeemed (staff counter flow for a walk-in member)
  begin
    perform public.redeem_reward(v_rid, (select cm.id from public.customer_memberships cm
      where cm.business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and cm.profile_id is null limit 1));
    raise exception 'ASSERT: RE1 archived reward redeemed';
  exception when invalid_parameter_value then
    if position('reward_archived' in SQLERRM) = 0 then raise exception 'ASSERT: RE1 wrong message %', SQLERRM; end if;
  end;

  -- inventory: staff refused; manager sets a store row; negative refused
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  begin
    perform public.set_reward_inventory('dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 9);
    raise exception 'ASSERT: RE1 staff set reward inventory';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  begin
    perform public.set_reward_inventory('dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', -1);
    raise exception 'ASSERT: RE1 negative on_hand accepted';
  exception when invalid_parameter_value then null;
  end;
  select public.set_reward_inventory('dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 20) into v_res;
  if (v_res ->> 'on_hand_before')::int <> 20 or (v_res ->> 'on_hand_after')::int <> 20 then
    raise exception 'ASSERT: RE1 inventory set wrong: %', v_res;  -- seeded 20 → unchanged
  end if;
  execute 'reset role';

  select count(*) into v_n from public.rewards where id = v_rid and status = 'archived' and points_cost = 250;
  if v_n <> 1 then raise exception 'ASSERT: RE1 reward row wrong'; end if;
  select count(*) into v_n from public.audit_logs where action = 'reward.created' and target_id = v_rid::text;
  if v_n <> 1 then raise exception 'ASSERT: RE1 reward.created audit missing'; end if;
  select count(*) into v_n from public.audit_logs where action = 'reward.updated' and target_id = v_rid::text;
  if v_n <> 2 then raise exception 'ASSERT: RE1 expected 2 reward.updated audits, got %', v_n; end if;
end $$;

-- CASE: RE2 redemptions — customer self-redeem: points spent via ledger, one-time code hashed, reference counter, replay
do $$
declare
  v_mem uuid; v_before int; v_after int; v_res jsonb; v_red uuid;
  v_code text; v_n int; v_last4 char(4); v_hash bytea; v_stored text;
begin
  select id into v_mem from public.customer_memberships
   where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and membership_no = 'AE-DEVRAHUL1';
  select current_points into v_before from public.customer_points_balance where customer_membership_id = v_mem;
  if v_before is null then v_before := 0; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);

  -- ₹100 discount coupon (100 pts, unlimited — no inventory rows)
  select public.redeem_reward('dddddddd-0000-4000-8000-000000000003', v_mem, null, 1, 're2-key') into v_res;
  execute 'reset role';

  v_red := (v_res ->> 'redemption_id')::uuid;
  v_code := v_res ->> 'code';
  if v_code !~ '^[0-9A-HJKMNP-TV-Z]{8}$' then raise exception 'ASSERT: RE2 code not Crockford-8: %', v_code; end if;
  if (v_res ->> 'reference') !~ '^RDM-[0-9]{4}$' then raise exception 'ASSERT: RE2 reference format: %', v_res; end if;
  if (v_res ->> 'points_used')::int <> 100 then raise exception 'ASSERT: RE2 points_used wrong: %', v_res; end if;
  if (v_res ->> 'balance_after')::int <> v_before - 100 then
    raise exception 'ASSERT: RE2 balance delta wrong: % vs before %', v_res, v_before;
  end if;

  select current_points into v_after from public.customer_points_balance where customer_membership_id = v_mem;
  if v_after <> v_before - 100 then raise exception 'ASSERT: RE2 cache not updated: % → %', v_before, v_after; end if;

  select code_last4, code_hash into v_last4, v_hash from public.redemptions where id = v_red;
  if v_last4 <> right(v_code, 4) then raise exception 'ASSERT: RE2 code_last4 mismatch'; end if;
  if v_hash is distinct from extensions.digest(convert_to(v_code, 'UTF8'), 'sha256') then
    raise exception 'ASSERT: RE2 stored hash is not sha256(code)';
  end if;

  select count(*) into v_n from public.points_ledger
   where entry_type = 'redeem' and points = -100 and source_type = 'redemption'
     and idempotency_key = 'redemption:' || v_red;
  if v_n <> 1 then raise exception 'ASSERT: RE2 ledger redeem entry missing'; end if;
  select count(*) into v_n from public.redemption_items where redemption_id = v_red and points_each = 100;
  if v_n <> 1 then raise exception 'ASSERT: RE2 redemption_items snapshot missing'; end if;
  select count(*) into v_n from public.audit_logs where action = 'redemption.created' and target_id = v_red::text;
  if v_n <> 1 then raise exception 'ASSERT: RE2 redemption.created audit missing'; end if;

  -- replay: same key → same redemption, NO code the second time, one ledger entry
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
  select public.redeem_reward('dddddddd-0000-4000-8000-000000000003', v_mem, null, 1, 're2-key') into v_res;
  execute 'reset role';
  if not (v_res ->> 'replayed')::boolean then raise exception 'ASSERT: RE2 replay not flagged'; end if;
  if (v_res ->> 'redemption_id')::uuid <> v_red then raise exception 'ASSERT: RE2 replay created a second redemption'; end if;
  if v_res ->> 'code' is not null then raise exception 'ASSERT: RE2 replay leaked the code again'; end if;
  select count(*) into v_n from public.points_ledger where idempotency_key = 'redemption:' || v_red;
  if v_n <> 1 then raise exception 'ASSERT: RE2 duplicate ledger entries on replay'; end if;
end $$;

-- CASE: RE3 redemptions — insufficient points refused with nothing persisted; staff counter redemption works
do $$
declare
  v_rahul uuid; v_priya uuid; v_before int; v_res jsonb; v_n int;
begin
  select id into v_rahul from public.customer_memberships
   where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and membership_no = 'AE-DEVRAHUL1';
  select id into v_priya from public.customer_memberships
   where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and membership_no = 'AE-DEVPRIYA1';
  select coalesce(current_points, 0) into v_before from public.customer_points_balance
   where customer_membership_id = v_rahul;

  execute 'set local role authenticated';

  -- Rahul cannot afford the 2450-pt ceiling fan
  perform set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
  begin
    perform public.redeem_reward('dddddddd-0000-4000-8000-000000000004', v_rahul, null, 1, 're3-poor');
    raise exception 'ASSERT: RE3 over-balance redemption accepted';
  exception when invalid_parameter_value then
    if position('insufficient_points' in SQLERRM) = 0 then raise exception 'ASSERT: RE3 wrong message %', SQLERRM; end if;
  end;
  execute 'reset role';
  select count(*) into v_n from public.redemptions where idempotency_key = 're3-poor';
  if v_n <> 0 then raise exception 'ASSERT: RE3 refused redemption persisted'; end if;
  select current_points into v_n from public.customer_points_balance where customer_membership_id = v_rahul;
  if v_n <> v_before then raise exception 'ASSERT: RE3 balance moved on refusal'; end if;

  -- staff redeems the ₹100 coupon for Priya at the counter
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  select public.redeem_reward('dddddddd-0000-4000-8000-000000000003', v_priya,
    'bbbbbbbb-0000-4000-8000-000000000001', 1, 're3-counter') into v_res;
  execute 'reset role';
  if (v_res ->> 'points_used')::int <> 100 then raise exception 'ASSERT: RE3 counter redemption wrong: %', v_res; end if;
  select count(*) into v_n from public.audit_logs
   where action = 'redemption.created' and target_id = (v_res ->> 'redemption_id');
  if v_n <> 1 then raise exception 'ASSERT: RE3 counter redemption audit missing'; end if;
end $$;

-- CASE: RE4 reward inventory — reservations, last-unit races, pool fallback, unlimited rewards
do $$
declare
  v_rid uuid; v_mem_a uuid; v_mem_b uuid; v_res jsonb; v_n int; v_red_a uuid;
begin
  -- fixture reward with exactly 1 unit at the Main Store
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  select public.create_reward('aaaaaaaa-0000-4000-8000-000000000001', 'RE4 Last Unit', 'gift', 50, null, null, null, null, 7, null) into v_res;
  v_rid := (v_res ->> 'reward_id')::uuid;
  perform public.set_reward_inventory(v_rid, 'bbbbbbbb-0000-4000-8000-000000000001', 1);
  execute 'reset role';

  -- two fixture members, 50 points each
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'RE4 Member A', 'active') returning id into v_mem_a;
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'RE4 Member B', 'active') returning id into v_mem_b;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  perform public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem_a, 50, 'manual', null,
    'bbbbbbbb-0000-4000-8000-000000000001', 're4-fund-a', 'RE4 fixture funding');
  perform public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem_b, 50, 'manual', null,
    'bbbbbbbb-0000-4000-8000-000000000001', 're4-fund-b', 'RE4 fixture funding');

  -- A claims the last unit; B is refused
  select public.redeem_reward(v_rid, v_mem_a, 'bbbbbbbb-0000-4000-8000-000000000001', 1, 're4-a') into v_res;
  v_red_a := (v_res ->> 'redemption_id')::uuid;
  begin
    perform public.redeem_reward(v_rid, v_mem_b, 'bbbbbbbb-0000-4000-8000-000000000001', 1, 're4-b');
    raise exception 'ASSERT: RE4 second claim on the last unit accepted';
  exception when invalid_parameter_value then
    if position('insufficient_inventory' in SQLERRM) = 0 then raise exception 'ASSERT: RE4 wrong message %', SQLERRM; end if;
  end;
  execute 'reset role';

  select reserved into v_n from public.reward_inventory
   where reward_id = v_rid and store_id = 'bbbbbbbb-0000-4000-8000-000000000001';
  if v_n <> 1 then raise exception 'ASSERT: RE4 reservation missing: %', v_n; end if;

  -- cancelling A releases the hold → B succeeds
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  perform public.cancel_redemption(v_red_a, 'RE4 test release');
  select public.redeem_reward(v_rid, v_mem_b, 'bbbbbbbb-0000-4000-8000-000000000001', 1, 're4-b2') into v_res;
  execute 'reset role';
  select reserved into v_n from public.reward_inventory
   where reward_id = v_rid and store_id = 'bbbbbbbb-0000-4000-8000-000000000001';
  if v_n <> 1 then raise exception 'ASSERT: RE4 reservation not re-held by B: %', v_n; end if;

  -- pool fallback: the ceiling fan has ONLY a business-wide pool row (3)
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  perform public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem_a, 2450, 'manual', null,
    'bbbbbbbb-0000-4000-8000-000000000001', 're4-fund-fan', 'RE4 fan funding');
  select public.redeem_reward('dddddddd-0000-4000-8000-000000000004', v_mem_a,
    'bbbbbbbb-0000-4000-8000-000000000001', 1, 're4-pool') into v_res;
  execute 'reset role';
  select count(*) into v_n from public.redemptions
   where id = (v_res ->> 'redemption_id')::uuid and inventory_scope = 'pool';
  if v_n <> 1 then raise exception 'ASSERT: RE4 pool fallback not recorded'; end if;
  select reserved into v_n from public.reward_inventory
   where reward_id = 'dddddddd-0000-4000-8000-000000000004' and store_id is null;
  if v_n <> 1 then raise exception 'ASSERT: RE4 pool reservation wrong: %', v_n; end if;
end $$;

-- CASE: RE5 redemption authorization — other customers, scoped staff and cross-tenant are refused
do $$
declare
  v_rahul uuid; v_priya uuid;
begin
  select id into v_rahul from public.customer_memberships
   where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and membership_no = 'AE-DEVRAHUL1';
  select id into v_priya from public.customer_memberships
   where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and membership_no = 'AE-DEVPRIYA1';

  execute 'set local role authenticated';

  -- Priya's user cannot redeem Rahul's membership
  perform set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
  begin
    perform public.redeem_reward('dddddddd-0000-4000-8000-000000000003', v_rahul, null, 1, 're5-priya-for-rahul');
    raise exception 'ASSERT: RE5 customer redeemed another member''s points';
  exception when insufficient_privilege then null;
  end;

  -- store-scoped staff cannot redeem at a store they aren't assigned to
  perform set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
  begin
    perform public.redeem_reward('dddddddd-0000-4000-8000-000000000003', v_priya,
      'bbbbbbbb-0000-4000-8000-000000000001', 1, 're5-scoped-main');
    raise exception 'ASSERT: RE5 scoped staff redeemed at a foreign store';
  exception when insufficient_privilege then null;
  end;

  -- ...but CAN at their own store (fund Priya first — RE3 spent her balance)
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  perform public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_priya, 100, 'manual', null,
    'bbbbbbbb-0000-4000-8000-000000000002', 're5-fund-priya', 'RE5 fixture funding');
  perform set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
  perform public.redeem_reward('dddddddd-0000-4000-8000-000000000003', v_priya,
      'bbbbbbbb-0000-4000-8000-000000000002', 1, 're5-scoped-sat');

  -- Volt owner cannot redeem Ambika rewards
  perform set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
  begin
    perform public.redeem_reward('dddddddd-0000-4000-8000-000000000003', v_priya, null, 1, 're5-volt');
    raise exception 'ASSERT: RE5 cross-tenant redemption accepted';
  exception when insufficient_privilege then null;
  end;

  -- Rahul cannot redeem into Volt's catalogue (membership not in that business)
  perform set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
  begin
    perform public.redeem_reward('dddddddd-0000-4000-8000-000000000006', v_rahul, null, 1, 're5-rahul-volt');
    raise exception 'ASSERT: RE5 membership crossed tenants';
  exception when invalid_parameter_value then
    if position('customer_not_found' in SQLERRM) = 0 then raise exception 'ASSERT: RE5 wrong message %', SQLERRM; end if;
  end;
  execute 'reset role';
end $$;

-- CASE: RE6 collect — hashed code verified (lowercase tolerated), stock debited, transitions final, staff-only
do $$
declare
  v_rid uuid; v_mem uuid; v_res jsonb; v_red uuid; v_code text; v_n int; v_on int; v_resv int;
begin
  -- fixture reward, 2 units at Main
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  select public.create_reward('aaaaaaaa-0000-4000-8000-000000000001', 'RE6 Pickup Gift', 'gift', 30, null, null, null, null, 7, null) into v_res;
  v_rid := (v_res ->> 'reward_id')::uuid;
  perform public.set_reward_inventory(v_rid, 'bbbbbbbb-0000-4000-8000-000000000001', 2);
  execute 'reset role';

  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'RE6 Member', 'active') returning id into v_mem;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  perform public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 30, 'manual', null,
    'bbbbbbbb-0000-4000-8000-000000000001', 're6-fund', 'RE6 fixture funding');
  select public.redeem_reward(v_rid, v_mem, 'bbbbbbbb-0000-4000-8000-000000000001', 1, 're6-redeem') into v_res;
  v_red := (v_res ->> 'redemption_id')::uuid;
  v_code := v_res ->> 'code';

  -- customer cannot collect their own redemption at the counter
  perform set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
  begin
    perform public.collect_redemption(v_red, v_code);
    raise exception 'ASSERT: RE6 customer collected a redemption';
  exception when insufficient_privilege then null;
  end;

  -- staff: wrong code refused + audited
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  begin
    perform public.collect_redemption(v_red, 'ZZZZZZZZ');
    raise exception 'ASSERT: RE6 wrong code accepted';
  exception when invalid_parameter_value then
    if position('redemption_code_invalid' in SQLERRM) = 0 then raise exception 'ASSERT: RE6 wrong message %', SQLERRM; end if;
  end;

  -- staff: lowercase code tolerated → collected
  select public.collect_redemption(v_red, lower(v_code)) into v_res;
  if (v_res ->> 'status') <> 'collected' then raise exception 'ASSERT: RE6 not collected: %', v_res; end if;

  -- second collect refused
  begin
    perform public.collect_redemption(v_red, v_code);
    raise exception 'ASSERT: RE6 double collect accepted';
  exception when invalid_parameter_value then
    if position('redemption_not_collectable' in SQLERRM) = 0 then raise exception 'ASSERT: RE6 wrong message %', SQLERRM; end if;
  end;
  execute 'reset role';

  select on_hand, reserved into v_on, v_resv from public.reward_inventory
   where reward_id = v_rid and store_id = 'bbbbbbbb-0000-4000-8000-000000000001';
  if v_on <> 1 or v_resv <> 0 then raise exception 'ASSERT: RE6 stock debit wrong: on_hand=%, reserved=%', v_on, v_resv; end if;
  select count(*) into v_n from public.audit_logs where action = 'redemption.collected' and target_id = v_red::text;
  if v_n <> 1 then raise exception 'ASSERT: RE6 collection not audited'; end if;
  select count(*) into v_n from public.redemptions
   where id = v_red and status = 'collected' and collected_at is not null and collected_by is not null;
  if v_n <> 1 then raise exception 'ASSERT: RE6 collected fields inconsistent'; end if;

  -- lazy expiry: a second pending redemption, backdated, is marked expired on
  -- the next collect touch — which RETURNS status 'expired' (no raise, so the
  -- marking + release + audit persist) instead of handing over the reward.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  perform public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 30, 'manual', null,
    'bbbbbbbb-0000-4000-8000-000000000001', 're6-fund-2', 'RE6 fixture funding');
  select public.redeem_reward(v_rid, v_mem, 'bbbbbbbb-0000-4000-8000-000000000001', 1, 're6-redeem-2') into v_res;
  execute 'reset role';
  update public.redemptions set expires_at = now() - interval '1 hour'
   where id = (v_res ->> 'redemption_id')::uuid;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  select public.collect_redemption((v_res ->> 'redemption_id')::uuid, v_res ->> 'code') into v_res;
  execute 'reset role';
  if (v_res ->> 'status') <> 'expired' or not (v_res ->> 'expired_now')::boolean then
    raise exception 'ASSERT: RE6 lazy expiry did not report expired: %', v_res;
  end if;
  select count(*) into v_n from public.redemptions
   where id = (v_res ->> 'redemption_id')::uuid and status = 'expired';
  if v_n <> 1 then raise exception 'ASSERT: RE6 expiry not persisted'; end if;
  select count(*) into v_n from public.audit_logs
   where action = 'redemption.expired' and target_id = (v_res ->> 'redemption_id');
  if v_n <> 1 then raise exception 'ASSERT: RE6 expiry not audited'; end if;
  select on_hand, reserved into v_on, v_resv from public.reward_inventory
   where reward_id = v_rid and store_id = 'bbbbbbbb-0000-4000-8000-000000000001';
  if v_on <> 1 or v_resv <> 0 then
    raise exception 'ASSERT: RE6 expired hold not released: on_hand=%, reserved=%', v_on, v_resv;
  end if;
end $$;

-- CASE: RE7 cancel — manager+ or the member themself, reason required, points refunded via compensating entry
do $$
declare
  v_mem uuid; v_res jsonb; v_red uuid; v_before int; v_after int; v_n int;
begin
  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'RE7 Member', 'active') returning id into v_mem;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  perform public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 100, 'manual', null,
    'bbbbbbbb-0000-4000-8000-000000000001', 're7-fund', 'RE7 fixture funding');
  select public.redeem_reward('dddddddd-0000-4000-8000-000000000003', v_mem, null, 1, 're7-redeem') into v_res;
  v_red := (v_res ->> 'redemption_id')::uuid;

  -- plain staff cannot cancel
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  begin
    perform public.cancel_redemption(v_red, 'staff attempt');
    raise exception 'ASSERT: RE7 staff cancelled a redemption';
  exception when insufficient_privilege then null;
  end;

  -- manager needs a reason
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  begin
    perform public.cancel_redemption(v_red, '  ');
    raise exception 'ASSERT: RE7 blank reason accepted';
  exception when invalid_parameter_value then null;
  end;

  select coalesce(current_points, 0) into v_before from public.customer_points_balance where customer_membership_id = v_mem;
  select public.cancel_redemption(v_red, 'Changed mind at counter') into v_res;
  if (v_res ->> 'points_refunded')::int <> 100 then raise exception 'ASSERT: RE7 refund wrong: %', v_res; end if;
  if (v_res ->> 'balance_after')::int <> v_before + 100 then raise exception 'ASSERT: RE7 balance not restored: %', v_res; end if;
  execute 'reset role';

  select count(*) into v_n from public.points_ledger
   where entry_type = 'adjust' and points = 100 and idempotency_key = 'redemption-cancel:' || v_red;
  if v_n <> 1 then raise exception 'ASSERT: RE7 compensating ledger entry missing'; end if;
  select count(*) into v_n from public.redemptions
   where id = v_red and status = 'cancelled' and cancelled_at is not null and cancel_reason is not null;
  if v_n <> 1 then raise exception 'ASSERT: RE7 cancelled fields inconsistent'; end if;

  -- double cancel refused
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  begin
    perform public.cancel_redemption(v_red, 'again');
    raise exception 'ASSERT: RE7 double cancel accepted';
  exception when invalid_parameter_value then
    if position('redemption_not_cancellable' in SQLERRM) = 0 then raise exception 'ASSERT: RE7 wrong message %', SQLERRM; end if;
  end;
  execute 'reset role';
end $$;

-- CASE: RE8 monthly limits — pending/collected count, cancelled do not
do $$
declare
  v_rid uuid; v_mem uuid; v_res jsonb; v_red uuid;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  select public.create_reward('aaaaaaaa-0000-4000-8000-000000000001', 'RE8 Once A Month', 'coupon', 10, null, null, null, null, 30, 1) into v_res;
  v_rid := (v_res ->> 'reward_id')::uuid;
  execute 'reset role';

  insert into public.customer_memberships (business_id, profile_id, display_name, status)
  values ('aaaaaaaa-0000-4000-8000-000000000001', null, 'RE8 Member', 'active') returning id into v_mem;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  perform public.award_points('aaaaaaaa-0000-4000-8000-000000000001', v_mem, 30, 'manual', null,
    'bbbbbbbb-0000-4000-8000-000000000001', 're8-fund', 'RE8 fixture funding');

  select public.redeem_reward(v_rid, v_mem, null, 1, 're8-first') into v_res;
  begin
    perform public.redeem_reward(v_rid, v_mem, null, 1, 're8-second');
    raise exception 'ASSERT: RE8 monthly limit not enforced';
  exception when invalid_parameter_value then
    if position('redemption_limit_exceeded' in SQLERRM) = 0 then raise exception 'ASSERT: RE8 wrong message %', SQLERRM; end if;
  end;

  -- cancelling frees the monthly slot
  v_red := (v_res ->> 'redemption_id')::uuid;
  perform public.cancel_redemption(v_red, 'RE8 slot release');
  select public.redeem_reward(v_rid, v_mem, null, 1, 're8-third') into v_res;
  execute 'reset role';
end $$;

-- CASE: RE9 RLS visibility + no DML grants on the redemption tables
do $$
declare
  v_rahul uuid; v_n int;
begin
  select id into v_rahul from public.customer_memberships
   where business_id = 'aaaaaaaa-0000-4000-8000-000000000001' and membership_no = 'AE-DEVRAHUL1';

  execute 'set local role authenticated';

  -- Rahul: own redemptions only, active rewards of his business only
  perform set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
  select count(*) into v_n from public.redemptions where customer_membership_id = v_rahul;
  if v_n < 1 then raise exception 'ASSERT: RE9 Rahul cannot see his own redemptions'; end if;
  select count(*) into v_n from public.redemptions rd
    join public.customer_memberships cm on cm.id = rd.customer_membership_id
   where cm.profile_id is distinct from '55555555-5555-4555-8555-555555555555';
  if v_n <> 0 then raise exception 'ASSERT: RE9 Rahul sees % other members'' redemptions', v_n; end if;
  select count(*) into v_n from public.rewards
   where business_id = 'aaaaaaaa-0000-4000-8000-000000000001'
     and id in ('dddddddd-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000002',
                'dddddddd-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000004',
                'dddddddd-0000-4000-8000-000000000005');
  if v_n <> 5 then raise exception 'ASSERT: RE9 Rahul sees % of the 5 seeded active rewards', v_n; end if;
  select count(*) into v_n from public.rewards where name = 'RE1 Test Gift';
  if v_n <> 0 then raise exception 'ASSERT: RE9 archived fixture reward visible to a customer'; end if;
  select count(*) into v_n from public.rewards where business_id = 'aaaaaaaa-0000-4000-8000-000000000002';
  if v_n <> 0 then raise exception 'ASSERT: RE9 Rahul sees Volt rewards'; end if;
  select count(*) into v_n from public.reward_inventory;
  if v_n <> 0 then raise exception 'ASSERT: RE9 customers can see reward inventory'; end if;

  -- staff-main: business-wide redemptions + inventory, no Volt
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
  select count(*) into v_n from public.redemptions where business_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if v_n < 3 then raise exception 'ASSERT: RE9 staff sees % business redemptions, expected ≥3', v_n; end if;
  select count(*) into v_n from public.redemptions where business_id = 'aaaaaaaa-0000-4000-8000-000000000002';
  if v_n <> 0 then raise exception 'ASSERT: RE9 staff sees Volt redemptions'; end if;

  -- Volt owner: zero Ambika rows
  perform set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
  select count(*) into v_n from public.rewards where business_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if v_n <> 0 then raise exception 'ASSERT: RE9 Volt owner sees Ambika rewards'; end if;

  -- owner: no DML grants anywhere
  perform set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
  begin
    insert into public.rewards (business_id, name, reward_type, points_cost)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'Direct', 'gift', 10);
    raise exception 'ASSERT: RE9 owner inserted a reward directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.redemptions set points_used = 0;
    raise exception 'ASSERT: RE9 owner updated redemptions directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.reward_inventory (reward_id, on_hand)
    values ('dddddddd-0000-4000-8000-000000000003', 5);
    raise exception 'ASSERT: RE9 owner inserted reward inventory directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.redemption_counters;
    raise exception 'ASSERT: RE9 redemption counters readable by API roles';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end $$;
