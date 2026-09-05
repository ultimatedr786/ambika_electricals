-- ============================================================================
-- LOCAL DEVELOPMENT SEED — Ambika Electricals demo tenant (spec Stage C).
--
-- Applied automatically by `supabase db reset` (local CLI stack only) and by
-- scripts/rls-check. NEVER run against staging/production:
--   * It aborts unless auth.users AND businesses are both empty (a fresh db).
--   * Accounts use non-routable @ambika.local addresses.
--   * Password hashes are invalid ('!') — NO usable credentials are created;
--     real local sign-in happens through Supabase Auth email flows.
--
-- Fixed UUIDs keep tests deterministic.
-- ============================================================================

do $$
begin
  if exists (select 1 from auth.users) or exists (select 1 from public.businesses) then
    raise exception
      'seed.sql aborted: this database already contains users/businesses. The demo seed is for a FRESH LOCAL database only.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- auth users (profiles are created automatically by public.handle_new_user)
-- ---------------------------------------------------------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '88888888-8888-4888-8888-888888888888', 'authenticated', 'authenticated',
   'dev-ambika-owner@ambika.local', '!', now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Nitin Trivedi","signup_context":"business"}'::jsonb, now(), now()),

  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'dev-manager@ambika.local', '!', now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Meera Joshi"}'::jsonb, now(), now()),

  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
   'dev-staff-main@ambika.local', '!', now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Kiran Bhatt"}'::jsonb, now(), now()),

  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated',
   'dev-staff-satellite@ambika.local', '!', now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Asha Devi"}'::jsonb, now(), now()),

  ('00000000-0000-0000-0000-000000000000', '55555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated',
   'dev-rahul@ambika.local', '!', now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Rahul Sharma","signup_context":"customer","phone":"+91 98240 11248"}'::jsonb, now(), now()),

  ('00000000-0000-0000-0000-000000000000', '66666666-6666-4666-8666-666666666666', 'authenticated', 'authenticated',
   'dev-priya@ambika.local', '!', now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Priya Patel","signup_context":"customer"}'::jsonb, now(), now()),

  -- Second tenant (for cross-business isolation checks)
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated',
   'dev-volt-owner@ambika.local', '!', now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Vikram Rao","signup_context":"business"}'::jsonb, now(), now());

-- ---------------------------------------------------------------------------
-- businesses & stores
-- ---------------------------------------------------------------------------
insert into public.businesses (id, name, legal_name, gstin, support_email, support_phone, status, created_by)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Ambika Electricals', 'Ambika Electricals Pvt Ltd',
   '24ABKPE1234K1Z9', 'care@ambikaelectricals.local', '+91 98250 41200', 'active',
   '88888888-8888-4888-8888-888888888888'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Volt & Co (Demo)', null, null, null, null, 'active',
   '99999999-9999-4999-8999-999999999999');

insert into public.stores (id, business_id, name, code, address_line, city, region, postal_code, phone, is_active)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Main Store', 'AE-MAIN',
   'Shop 14, Sardar Complex, Ring Road', 'Surat', 'Gujarat', '395002', '+91 98250 41200', true),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'Satellite Store', 'AE-SAT',
   '7 Lake View Galleria', 'Surat', 'Gujarat', '395007', '+91 98250 41311', true),
  ('bbbbbbbb-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-000000000002', 'Volt Store', 'VC-MAIN',
   '12 MG Road', 'Bengaluru', 'Karnataka', '560001', null, true);

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------
insert into public.business_memberships (business_id, profile_id, role, status)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '88888888-8888-4888-8888-888888888888', 'owner',   'active'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'manager', 'active'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'staff',   'active'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'staff',   'active'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '99999999-9999-4999-8999-999999999999', 'owner',   'active');

-- store scoping: each staff member is assigned to exactly one store.
insert into public.store_memberships (store_id, business_id, profile_id, status)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'active'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'active');

-- ---------------------------------------------------------------------------
-- customer memberships (Ambika: Rahul + Priya + one walk-in; Volt: its own)
-- ---------------------------------------------------------------------------
insert into public.customer_memberships
  (business_id, profile_id, membership_no, status, display_name, phone_masked, enrollment_data, enrolled_store_id, enrolled_by)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555', 'AE-DEVRAHUL1', 'active',
   'Rahul Sharma', 'XXXXX11248', '{"source":"seed","birthday":"1996-04-18"}'::jsonb,
   'bbbbbbbb-0000-4000-8000-000000000001', '88888888-8888-4888-8888-888888888888'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '66666666-6666-4666-8666-666666666666', 'AE-DEVPRIYA1', 'active',
   'Priya Patel', null, '{"source":"seed"}'::jsonb,
   'bbbbbbbb-0000-4000-8000-000000000001', '88888888-8888-4888-8888-888888888888'),
  ('aaaaaaaa-0000-4000-8000-000000000001', null, 'AE-DEVWALKIN1', 'active',
   'Walk-in Customer', null, '{"source":"seed-pos"}'::jsonb,
   'bbbbbbbb-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333'),
  ('aaaaaaaa-0000-4000-8000-000000000002', null, 'AE-DEVVOLTC1', 'active',
   'Volt Customer', null, '{"source":"seed"}'::jsonb,
   'bbbbbbbb-0000-4000-8000-000000000009', '99999999-9999-4999-8999-999999999999');

-- ---------------------------------------------------------------------------
-- One pending invitation so local accept/revoke/expiry flows are testable.
-- Dev-only raw token (64 hex chars) whose SHA-256 hash is stored below:
--   devlocal0000000000000000000000000000000000000000000000000000000000
-- Accept link: http://localhost:3000/auth/invite/<token>
-- ---------------------------------------------------------------------------
insert into public.invitations (business_id, store_id, email, role, token_hash, status, expires_at, invited_by)
values (
  'aaaaaaaa-0000-4000-8000-000000000001',
  'bbbbbbbb-0000-4000-8000-000000000001',
  'dev-newstaff@ambika.local',
  'staff',
  encode(extensions.digest('devlocal0000000000000000000000000000000000000000000000000000000000', 'sha256'), 'hex'),
  'pending',
  now() + interval '72 hours',
  '88888888-8888-4888-8888-888888888888'
);

-- ---------------------------------------------------------------------------
-- A seed audit row (proves owner-only audit read policies locally)
-- ---------------------------------------------------------------------------
insert into public.audit_logs (actor_profile_id, actor_role, action, business_id, target_type, target_id, metadata)
values
  ('88888888-8888-4888-8888-888888888888', 'owner', 'business.created',
   'aaaaaaaa-0000-4000-8000-000000000001', 'business',
   'aaaaaaaa-0000-4000-8000-000000000001', '{"origin":"dev-seed"}'::jsonb);

do $$
begin
  raise notice 'Dev seed complete: Ambika Electricals (owner dev-ambika-owner@ambika.local), manager, 2 store-scoped staff, customers Rahul/Priya, second tenant Volt & Co, 1 pending invitation (dev token devlocal0000...0000). No usable passwords exist — use Supabase Auth email flows locally.';
end $$;
