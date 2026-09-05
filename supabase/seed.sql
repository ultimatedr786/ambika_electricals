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

-- ---------------------------------------------------------------------------
-- Points ledger history for the seeded customers (Slice 1). Mirrors the
-- launch policy: earn on purchases, redeem at the counter, never expire.
-- balance_after is computed sequentially; the cache table is kept in sync.
-- ---------------------------------------------------------------------------
do $$
declare
  v_biz        uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  v_main_store uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  v_owner      uuid := '88888888-8888-4888-8888-888888888888';
  v_staff_main uuid := '33333333-3333-4333-8333-333333333333';
  v_rahul      uuid;
  v_priya      uuid;
  v_balance    int;
  v_entry_id   bigint;
begin
  select id into v_rahul from public.customer_memberships where business_id = v_biz and membership_no = 'AE-DEVRAHUL1';
  select id into v_priya from public.customer_memberships where business_id = v_biz and membership_no = 'AE-DEVPRIYA1';

  -- Rahul: welcome +100, sale earn +450, sale earn +120, counter redeem −250 → 420
  v_balance := 0;

  v_balance := v_balance + 100;
  insert into public.points_ledger
    (business_id, customer_membership_id, entry_type, points, balance_after, source_type, store_id, actor_profile_id, reason, idempotency_key)
  values (v_biz, v_rahul, 'earn', 100, v_balance, 'welcome', v_main_store, v_owner, 'Welcome bonus', 'seed-rahul-welcome')
  returning id into v_entry_id;
  insert into public.customer_points_balance (customer_membership_id, business_id, current_points, lifetime_earned, lifetime_redeemed, last_entry_id)
  values (v_rahul, v_biz, v_balance, 100, 0, v_entry_id);

  v_balance := v_balance + 450;
  insert into public.points_ledger
    (business_id, customer_membership_id, entry_type, points, balance_after, source_type, store_id, actor_profile_id, reason, idempotency_key)
  values (v_biz, v_rahul, 'earn', 450, v_balance, 'sale', v_main_store, v_staff_main, 'Sale ₹4,500 (wiring order)', 'seed-rahul-sale-1')
  returning id into v_entry_id;
  update public.customer_points_balance
     set current_points = v_balance, lifetime_earned = v_balance, last_entry_id = v_entry_id
   where customer_membership_id = v_rahul;

  v_balance := v_balance + 120;
  insert into public.points_ledger
    (business_id, customer_membership_id, entry_type, points, balance_after, source_type, store_id, actor_profile_id, reason, idempotency_key)
  values (v_biz, v_rahul, 'earn', 120, v_balance, 'sale', v_main_store, v_staff_main, 'Sale ₹1,200 (LED bulbs)', 'seed-rahul-sale-2')
  returning id into v_entry_id;
  update public.customer_points_balance
     set current_points = v_balance, lifetime_earned = v_balance, last_entry_id = v_entry_id
   where customer_membership_id = v_rahul;

  v_balance := v_balance - 250;
  insert into public.points_ledger
    (business_id, customer_membership_id, entry_type, points, balance_after, source_type, store_id, actor_profile_id, reason, idempotency_key)
  values (v_biz, v_rahul, 'redeem', -250, v_balance, 'redemption', v_main_store, v_owner, 'Redeemed ₹25 off', 'seed-rahul-redeem-1')
  returning id into v_entry_id;
  update public.customer_points_balance
     set current_points = v_balance, lifetime_redeemed = 250, last_entry_id = v_entry_id
   where customer_membership_id = v_rahul;

  -- Priya: welcome +100, birthday +50 → 150
  v_balance := 100;
  insert into public.points_ledger
    (business_id, customer_membership_id, entry_type, points, balance_after, source_type, store_id, actor_profile_id, reason, idempotency_key)
  values (v_biz, v_priya, 'earn', 100, v_balance, 'welcome', v_main_store, v_owner, 'Welcome bonus', 'seed-priya-welcome')
  returning id into v_entry_id;
  insert into public.customer_points_balance (customer_membership_id, business_id, current_points, lifetime_earned, lifetime_redeemed, last_entry_id)
  values (v_priya, v_biz, v_balance, 100, 0, v_entry_id);

  v_balance := v_balance + 50;
  insert into public.points_ledger
    (business_id, customer_membership_id, entry_type, points, balance_after, source_type, store_id, actor_profile_id, reason, idempotency_key)
  values (v_biz, v_priya, 'earn', 50, v_balance, 'birthday', v_main_store, v_owner, 'Birthday bonus', 'seed-priya-birthday')
  returning id into v_entry_id;
  update public.customer_points_balance
     set current_points = v_balance, lifetime_earned = v_balance, last_entry_id = v_entry_id
   where customer_membership_id = v_priya;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Slice 3 seed: product catalogue + per-store stock + opening 'initial'
-- movements. Mirrors the Phase-1 mock catalogue (same SKUs/names/prices) so
-- the live POS feels familiar. Real stock history starts here; no sales are
-- seeded (the POS starts empty by design).
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  v_biz        uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  v_volt       uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  v_main       uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  v_sat        uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  v_volt_store uuid := 'bbbbbbbb-0000-4000-8000-000000000009';
  p record;
begin
  insert into public.products
    (id, business_id, sku, name, category, subcategory, unit, mrp_paise, price_paise, art_key)
  values
    ('cccccccc-0000-4000-8000-000000000001', v_biz, 'AMB-LGT-009', 'Philips 9W LED Bulb',
     'Lighting', 'LED Bulbs', 'piece', 16500, 12000, 'bulb'),
    ('cccccccc-0000-4000-8000-000000000002', v_biz, 'AMB-LGT-020', 'Wipro 20W LED Tube Light',
     'Lighting', 'Tube Lights', 'piece', 45000, 34000, 'tube'),
    ('cccccccc-0000-4000-8000-000000000003', v_biz, 'AMB-SWT-006', 'Anchor Modular Switch 6A',
     'Switches & Sockets', 'Switches', 'piece', 11000, 8500, 'switch'),
    ('cccccccc-0000-4000-8000-000000000004', v_biz, 'AMB-WIR-015', 'Polycab 1.5 sq mm FR Wire (90m)',
     'Wires & Cables', 'House Wire', 'coil', 178000, 145000, 'wire'),
    ('cccccccc-0000-4000-8000-000000000005', v_biz, 'AMB-PRT-032', 'Schneider 32A MCB Single Pole',
     'Protection', 'MCB', 'piece', 47000, 38000, 'mcb'),
    ('cccccccc-0000-4000-8000-000000000006', v_biz, 'AMB-FAN-120', 'Crompton Ceiling Fan 1200mm',
     'Fans', 'Ceiling Fan', 'piece', 320000, 245000, 'fan'),
    ('cccccccc-0000-4000-8000-000000000007', v_volt, 'VLT-FAN-001', 'Volt Ceiling Fan 1200mm',
     'Fans', 'Ceiling Fan', 'piece', 340000, 265000, 'fan')
  on conflict (business_id, sku) do nothing;

  -- Opening stock: (product, store, qty, reorder_level)
  for p in
    select * from (values
      ('cccccccc-0000-4000-8000-000000000001'::uuid, v_main, 120, 24),
      ('cccccccc-0000-4000-8000-000000000001'::uuid, v_sat,   60, 24),
      ('cccccccc-0000-4000-8000-000000000002'::uuid, v_main,  40,  8),
      ('cccccccc-0000-4000-8000-000000000002'::uuid, v_sat,   20,  8),
      ('cccccccc-0000-4000-8000-000000000003'::uuid, v_main, 150, 30),
      ('cccccccc-0000-4000-8000-000000000003'::uuid, v_sat,   80, 30),
      ('cccccccc-0000-4000-8000-000000000004'::uuid, v_main,  24,  6),
      ('cccccccc-0000-4000-8000-000000000004'::uuid, v_sat,   12,  6),
      ('cccccccc-0000-4000-8000-000000000005'::uuid, v_main,  55, 12),
      ('cccccccc-0000-4000-8000-000000000005'::uuid, v_sat,   30, 12),
      ('cccccccc-0000-4000-8000-000000000006'::uuid, v_main,  12,  4),
      ('cccccccc-0000-4000-8000-000000000006'::uuid, v_sat,    6,  4),
      ('cccccccc-0000-4000-8000-000000000007'::uuid, v_volt_store, 15, 5)
    ) as t(product_id, store_id, qty, reorder_level)
  loop
    insert into public.inventory_by_store (product_id, store_id, on_hand, reorder_level)
    values (p.product_id, p.store_id, p.qty, p.reorder_level)
    on conflict (product_id, store_id) do nothing;

    insert into public.inventory_movements
      (business_id, store_id, product_id, delta, balance_after, reason,
       reference_type, reference_id, note, idempotency_key)
    values
      (case when p.product_id = 'cccccccc-0000-4000-8000-000000000007' then v_volt else v_biz end,
       p.store_id, p.product_id, p.qty, p.qty, 'initial',
       'product', p.product_id, 'Opening stock (seed)',
       'seed-inv:' || p.product_id::text || ':' || p.store_id::text)
    on conflict (business_id, idempotency_key) where idempotency_key is not null do nothing;
  end loop;
end $$;

do $$
begin
  raise notice 'Dev seed complete: Ambika Electricals (owner dev-ambika-owner@ambika.local), manager, 2 store-scoped staff, customers Rahul/Priya, second tenant Volt & Co, 1 pending invitation (dev token devlocal0000...0000), points ledger history (Rahul 420 pts, Priya 150 pts), product catalogue (6 Ambika + 1 Volt) with per-store opening stock and initial movements. No usable passwords exist — use Supabase Auth email flows locally.';
end $$;
