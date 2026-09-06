-- ============================================================================
-- Phase 2 Step 2 · Stage C — Core security schema
-- Ambika Electricals / Rewardly — identity & tenancy foundation.
--
-- Tables: profiles, businesses, stores, business_memberships,
--         store_memberships, customer_memberships, audit_logs
-- Plus:   role enums, helper functions used by RLS (Stage D), auth triggers.
--
-- Conventions (spec §Stage C "Schema rules"):
--   * UUID primary keys; profiles.id IS the auth.users id.
--   * created_at / updated_at on every table (updated_at via trigger).
--   * Deliberate FKs, checks, uniques and indexes.
--   * Membership numbers are unique per business and randomly generated
--     (never globally sequential/predictable).
--   * Constrained role model: customer, owner, manager, staff, super_admin.
--   * NO sales / product / points-ledger / redemption tables in this step —
--     those arrive with their own approved vertical slices.
-- ============================================================================

-- pgcrypto powers digest() (invitation token hashes) and gen_random_bytes()
-- (invitation tokens). Already present on Supabase; created for parity in
-- plain-Postgres test harnesses.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums — constrained role & lifecycle model
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('customer', 'owner', 'manager', 'staff', 'super_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.profile_status as enum ('active', 'invited', 'suspended', 'deleted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.business_status as enum ('active', 'suspended', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_status as enum ('active', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.membership_status as enum ('pending', 'active', 'blocked', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, created by trigger from auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  display_name text,
  phone       text,
  avatar_url  text,
  avatar_meta jsonb not null default '{}'::jsonb,
  status      public.profile_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_email_not_blank check (length(trim(email)) > 0),
  constraint profiles_display_name_len check (display_name is null or length(display_name) between 1 and 120)
);

create index if not exists profiles_status_idx on public.profiles (status);
create unique index if not exists profiles_lower_email_uidx on public.profiles (lower(email));

-- ---------------------------------------------------------------------------
-- businesses — tenant root: identity + lifecycle status
-- ---------------------------------------------------------------------------
create table if not exists public.businesses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  legal_name    text,
  gstin         text,
  support_email text,
  support_phone text,
  status        public.business_status not null default 'active',
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint businesses_name_len check (length(trim(name)) between 2 and 120),
  constraint businesses_gstin_format check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$')
);

create index if not exists businesses_status_idx on public.businesses (status);

-- ---------------------------------------------------------------------------
-- stores — belongs to a business; display/location/contact metadata
-- ---------------------------------------------------------------------------
create table if not exists public.stores (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  name         text not null,
  code         text,
  address_line text,
  city         text,
  region       text,
  postal_code  text,
  country      text not null default 'IN',
  phone        text,
  email        text,
  location     jsonb not null default '{}'::jsonb,   -- { "lat": …, "lng": … } etc.
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint stores_name_len check (length(trim(name)) between 2 and 120),
  constraint stores_business_unique_name unique (business_id, name)
);

create index if not exists stores_business_idx on public.stores (business_id);
create index if not exists stores_business_active_idx on public.stores (business_id) where is_active;

-- ---------------------------------------------------------------------------
-- business_memberships — profile ⇄ business relationship with role
-- ---------------------------------------------------------------------------
create table if not exists public.business_memberships (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  role        public.app_role not null,
  status      public.member_status not null default 'active',
  invited_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- The 'customer' role lives in customer_memberships, never here.
  constraint business_memberships_role check (role in ('owner', 'manager', 'staff', 'super_admin')),
  constraint business_memberships_one_per_business unique (business_id, profile_id)
);

create index if not exists business_memberships_profile_idx on public.business_memberships (profile_id);
create index if not exists business_memberships_business_role_idx on public.business_memberships (business_id, role);

-- ---------------------------------------------------------------------------
-- store_memberships — staff assignment / permission scope per store
-- business_id is denormalised (kept in sync by trigger) so authorization
-- checks never need a second join.
-- ---------------------------------------------------------------------------
create table if not exists public.store_memberships (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  status      public.member_status not null default 'active',
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint store_memberships_unique unique (store_id, profile_id)
);

create index if not exists store_memberships_profile_idx on public.store_memberships (profile_id);
create index if not exists store_memberships_business_idx on public.store_memberships (business_id);

-- ---------------------------------------------------------------------------
-- customer_memberships — customer linked to a business
-- profile_id is nullable so POS-enrolled walk-ins (later vertical slice) can
-- exist before they ever sign up; the loyalty rules bind on membership_no.
-- ---------------------------------------------------------------------------
create table if not exists public.customer_memberships (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  profile_id       uuid references public.profiles (id) on delete set null,
  membership_no    text not null,
  status           public.membership_status not null default 'active',
  -- Non-sensitive display data only (spec). No addresses, no payment data.
  display_name     text,
  phone_masked     text,
  enrollment_data  jsonb not null default '{}'::jsonb, -- { source, birthday, consent… }
  enrolled_store_id uuid references public.stores (id) on delete set null,
  enrolled_by      uuid references public.profiles (id) on delete set null,
  enrolled_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint customer_memberships_no_format check (membership_no ~ '^AE-[A-Z0-9]{4,12}$'),
  constraint customer_memberships_phone_masked_format check (phone_masked is null or phone_masked ~ '^[X0-9+ -]{6,16}$'),
  constraint customer_memberships_unique_no unique (business_id, membership_no)
);

-- One linked membership per profile per business (walk-in rows are exempt).
create unique index if not exists customer_memberships_one_per_profile
  on public.customer_memberships (business_id, profile_id)
  where profile_id is not null;

create index if not exists customer_memberships_profile_idx on public.customer_memberships (profile_id);
create index if not exists customer_memberships_business_status_idx on public.customer_memberships (business_id, status);

-- ---------------------------------------------------------------------------
-- audit_logs — immutable security/event trail (invitations, role changes,
-- access-sensitive actions). No UPDATE/DELETE grants exist anywhere; a trigger
-- rejects mutation even from privileged roles. Read access is RLS-restricted
-- to business owners.
--
-- Deliberately NO foreign keys: an audit trail is append-only history, and
-- FK "on delete set null" actions would perform RI updates on this table
-- (blocked by the immutability trigger, and they would block legitimate
-- auth-user deletions). Actor/target/business ids are recorded as metadata.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id               bigint generated always as identity primary key,
  occurred_at      timestamptz not null default now(),
  actor_profile_id uuid,
  actor_role       public.app_role,
  action           text not null,
  business_id      uuid,
  store_id         uuid,
  target_type      text,
  target_id        text,
  metadata         jsonb not null default '{}'::jsonb,
  ip_address       text,
  constraint audit_logs_action_format check (action ~ '^[a-z_]+\.[a-z_.]+$')
);

create index if not exists audit_logs_business_time_idx on public.audit_logs (business_id, occurred_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_profile_id);
create index if not exists audit_logs_action_idx on public.audit_logs (action);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','businesses','stores','business_memberships',
                           'store_memberships','customer_memberships']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end $$;

-- audit_logs are immutable: reject any mutation, from any role.
create or replace function public.audit_logs_no_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is immutable: % is not permitted', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_no_mutation();

-- ---------------------------------------------------------------------------
-- auth.users → profiles bootstrap
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_display_name text;
begin
  v_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(new.email, '@', 1), '')
  );

  insert into public.profiles (id, email, display_name, phone, avatar_url, avatar_meta)
  values (
    new.id,
    new.email,
    v_display_name,
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    coalesce(new.raw_user_meta_data -> 'avatar_meta', '{}'::jsonb)
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email in sync when the auth email changes (confirmed changes).
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Membership number generation — unique inside the business, random (never
-- globally predictable), ambiguity-free alphabet (no I/O/0/1).
-- ---------------------------------------------------------------------------
create or replace function public.generate_membership_no(p_business_id uuid)
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_candidate text;
  i int;
begin
  loop
    v_candidate := 'AE-';
    for i in 1..8 loop
      v_candidate := v_candidate || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.customer_memberships
      where business_id = p_business_id and membership_no = v_candidate
    );
  end loop;
  return v_candidate;
end;
$$;

create or replace function public.customer_memberships_assign_no()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.membership_no is null or trim(new.membership_no) = '' then
    new.membership_no := public.generate_membership_no(new.business_id);
  end if;
  return new;
end;
$$;

drop trigger if exists customer_memberships_assign_no on public.customer_memberships;
create trigger customer_memberships_assign_no
  before insert on public.customer_memberships
  for each row execute function public.customer_memberships_assign_no();

-- store_memberships.business_id must always match the store's real business.
create or replace function public.store_memberships_business_check()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_business uuid;
begin
  select business_id into v_business from public.stores where id = new.store_id;
  if v_business is null then
    raise exception 'store % does not exist', new.store_id using errcode = 'foreign_key_violation';
  end if;
  if v_business is distinct from new.business_id then
    raise exception 'store_memberships.business_id must match the store''s business'
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists store_memberships_business_check on public.store_memberships;
create trigger store_memberships_business_check
  before insert or update of store_id, business_id on public.store_memberships
  for each row execute function public.store_memberships_business_check();

-- ---------------------------------------------------------------------------
-- Authorization helpers used by RLS policies (Stage D).
-- SECURITY DEFINER + fixed search_path: policies can call these without
-- recursing into the RLS of the tables they read, and auth.uid() comes from
-- the signed JWT — never from browser-supplied identifiers.
-- ---------------------------------------------------------------------------
create or replace function public.role_rank(p_role public.app_role)
returns int
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_role
    when 'super_admin' then 5
    when 'owner'       then 4
    when 'manager'     then 3
    when 'staff'       then 2
    when 'customer'    then 1
  end;
$$;

create or replace function public.role_at_least(p_role public.app_role, p_min public.app_role)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select public.role_rank(p_role) >= public.role_rank(p_min);
$$;

create or replace function public.business_role(p_business_id uuid)
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select bm.role
  from public.business_memberships bm
  where bm.profile_id = auth.uid()
    and bm.business_id = p_business_id
    and bm.status = 'active';
$$;

create or replace function public.my_businesses(p_min_role public.app_role default 'staff')
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select bm.business_id
  from public.business_memberships bm
  where bm.profile_id = auth.uid()
    and bm.status = 'active'
    and public.role_at_least(bm.role, p_min_role);
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.business_memberships bm
    where bm.profile_id = auth.uid() and bm.role = 'super_admin' and bm.status = 'active'
  );
$$;

create or replace function public.is_store_assigned(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.store_memberships sm
    where sm.profile_id = auth.uid() and sm.store_id = p_store_id and sm.status = 'active'
  );
$$;

create or replace function public.my_stores()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select sm.store_id
  from public.store_memberships sm
  where sm.profile_id = auth.uid() and sm.status = 'active';
$$;

create or replace function public.shares_business_with(p_profile_id uuid, p_min_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_memberships mine
    join public.business_memberships peer on peer.business_id = mine.business_id
    where mine.profile_id = auth.uid()
      and peer.profile_id = p_profile_id
      and mine.status = 'active'
      and peer.status = 'active'
      and public.role_at_least(mine.role, p_min_role)
  );
$$;

create or replace function public.shares_store_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.store_memberships mine
    join public.store_memberships peer on peer.store_id = mine.store_id
    where mine.profile_id = auth.uid()
      and peer.profile_id = p_profile_id
      and mine.status = 'active'
      and peer.status = 'active'
  );
$$;
