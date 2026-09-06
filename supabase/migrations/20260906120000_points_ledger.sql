-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2 Step 3 · Slice 1 — IMMUTABLE POINTS LEDGER
-- Architecture proposal §A2/§A4: append-only points_ledger + transactionally
-- maintained customer_points_balance cache; ALL writes through SECURITY
-- DEFINER RPCs that re-check auth.uid(), role, tenancy and store scope, and
-- audit every success. Adapted to the Step-2 schema (customer_memberships
-- instead of the proposal's customer_profiles; actor kept FK-free following
-- the audit_logs precedent so auth-user deletion is never blocked).
--
-- Launch loyalty policy (spec §2.5): ₹100 → 10 points · 1 point = ₹0.10 ·
-- NO EXPIRY. expires_on stays nullable/unused until a policy enables it.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- enum
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.ledger_entry_type as enum ('earn', 'redeem', 'adjust', 'expiry');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- points_ledger — APPEND ONLY. No UPDATE, no DELETE, ever (trigger-enforced
-- for every role including superuser/service_role; corrections are appended
-- 'adjust' entries). No DML grants to API roles — INSERT happens only inside
-- the definer RPCs below.
-- ---------------------------------------------------------------------------
create table if not exists public.points_ledger (
  id                     bigint generated always as identity primary key,
  business_id            uuid not null references public.businesses (id),
  customer_membership_id uuid not null references public.customer_memberships (id),
  entry_type             public.ledger_entry_type not null,
  points                 integer not null check (points <> 0),  -- signed: +earn, −redeem
  balance_after          integer not null check (balance_after >= 0),
  source_type            text not null,
  source_id              uuid,
  store_id               uuid references public.stores (id),
  -- FK-free on purpose (audit_logs precedent): an actor's auth-user deletion
  -- must never be blocked by, or silently rewrite, financial history.
  actor_profile_id       uuid,
  reason                 text,
  expires_on             date,          -- unused while the no-expiry policy stands
  idempotency_key        text,
  created_at             timestamptz not null default now(),
  constraint ledger_source_type_known check (
    source_type in ('sale','redemption','manual','welcome','referral','birthday','campaign','adjustment','import')
  ),
  constraint ledger_earn_positive   check (entry_type <> 'earn'   or points > 0),
  constraint ledger_redeem_negative check (entry_type <> 'redeem' or points < 0),
  constraint ledger_expiry_negative check (entry_type <> 'expiry' or points < 0),
  constraint ledger_adjust_nonzero  check (entry_type <> 'adjust' or points <> 0),
  constraint ledger_adjust_reason   check (
    entry_type <> 'adjust' or (reason is not null and length(trim(reason)) > 0)
  ),
  constraint ledger_expiry_requires_date check (entry_type <> 'expiry' or expires_on is not null),
  constraint ledger_idempotency_key_len  check (
    idempotency_key is null or length(trim(idempotency_key)) between 4 and 120
  )
);

create index if not exists ledger_customer_idx
  on public.points_ledger (customer_membership_id, id desc);
create index if not exists ledger_business_created_idx
  on public.points_ledger (business_id, created_at desc);
create unique index if not exists ledger_idem_uq
  on public.points_ledger (business_id, idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- customer_points_balance — transactional cache, never authoritative.
-- Maintained inside the same transaction as every ledger insert.
-- ---------------------------------------------------------------------------
create table if not exists public.customer_points_balance (
  customer_membership_id uuid primary key references public.customer_memberships (id),
  business_id            uuid not null references public.businesses (id),
  current_points         integer not null default 0 check (current_points >= 0),
  lifetime_earned        integer not null default 0 check (lifetime_earned >= 0),
  lifetime_redeemed      integer not null default 0 check (lifetime_redeemed >= 0),
  last_entry_id          bigint references public.points_ledger (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists customer_points_balance_set_updated_at on public.customer_points_balance;
create trigger customer_points_balance_set_updated_at
  before update on public.customer_points_balance
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Immutability trigger — reject UPDATE/DELETE on the ledger from ANY role.
-- ---------------------------------------------------------------------------
create or replace function public.points_ledger_no_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'points_ledger is immutable: % is not permitted (append an adjust entry instead)', tg_op
    using errcode = '22023'; -- invalid_parameter_value
end;
$$;

drop trigger if exists points_ledger_immutable on public.points_ledger;
create trigger points_ledger_immutable
  before update or delete on public.points_ledger
  for each row execute function public.points_ledger_no_mutation();

-- ---------------------------------------------------------------------------
-- Insert integrity trigger — even definer RPCs and seeds must satisfy:
-- membership exists, is active, belongs to the entry's business; store (when
-- given) belongs to the business; expires_on only for earn entries.
-- SECURITY DEFINER so unprivileged insert paths never fail on helper grants.
-- ---------------------------------------------------------------------------
create or replace function public.points_ledger_insert_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_membership record;
begin
  select cm.business_id, cm.status
    into v_membership
    from public.customer_memberships cm
   where cm.id = new.customer_membership_id;

  if not found then
    raise exception 'ledger membership % does not exist', new.customer_membership_id
      using errcode = 'P0002';
  end if;
  if v_membership.business_id <> new.business_id then
    raise exception 'ledger entry business % does not match membership business %',
      new.business_id, v_membership.business_id
      using errcode = '22023';
  end if;
  if v_membership.status <> 'active' then
    raise exception 'ledger entry rejected: membership % is %',
      new.customer_membership_id, v_membership.status
      using errcode = '22023';
  end if;
  if new.store_id is not null and not exists (
    select 1 from public.stores s
     where s.id = new.store_id and s.business_id = new.business_id
  ) then
    raise exception 'ledger store % does not belong to business %', new.store_id, new.business_id
      using errcode = '22023';
  end if;
  if new.expires_on is not null and new.entry_type <> 'earn' then
    raise exception 'expires_on is only valid on earn entries' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists points_ledger_insert_guard on public.points_ledger;
create trigger points_ledger_insert_guard
  before insert on public.points_ledger
  for each row execute function public.points_ledger_insert_check();

-- Cache row must agree with the membership's business (store_memberships pattern).
create or replace function public.customer_points_balance_business_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid;
begin
  select cm.business_id into v_business
    from public.customer_memberships cm
   where cm.id = new.customer_membership_id;
  if not found then
    raise exception 'balance cache references unknown membership %', new.customer_membership_id
      using errcode = 'P0002';
  end if;
  if v_business <> new.business_id then
    raise exception 'balance cache business % does not match membership business %',
      new.business_id, v_business
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists customer_points_balance_business_guard on public.customer_points_balance;
create trigger customer_points_balance_business_guard
  before insert or update of business_id, customer_membership_id on public.customer_points_balance
  for each row execute function public.customer_points_balance_business_check();

-- ---------------------------------------------------------------------------
-- point_balance — convenience read (SECURITY INVOKER: RLS on the cache table
-- decides who may ask). Returns 0 when nothing has been earned yet.
-- ---------------------------------------------------------------------------
create or replace function public.point_balance(p_membership_id uuid)
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select b.current_points
       from public.customer_points_balance b
      where b.customer_membership_id = p_membership_id),
    0
  );
$$;

-- ---------------------------------------------------------------------------
-- Shared internals for the three write RPCs. Locks the cache row, appends the
-- ledger entry, updates the cache and audits — all in the caller's
-- transaction. Owned by postgres; only reachable through the RPCs below.
-- ---------------------------------------------------------------------------
create or replace function public.ledger_post_entry(
  p_business_id   uuid,
  p_membership_id uuid,
  p_entry_type    public.ledger_entry_type,
  p_points        integer,           -- signed as it will be stored
  p_source_type   text,
  p_source_id     uuid,
  p_store_id      uuid,
  p_reason        text,
  p_idem_key      text,
  p_audit_action  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_balance    record;
  v_new_balance int;
  v_entry_id   bigint;
begin
  -- Lock (or create) the cache row — serializes concurrent postings per member.
  loop
    select cb.current_points, cb.lifetime_earned, cb.lifetime_redeemed
      into v_balance
      from public.customer_points_balance cb
     where cb.customer_membership_id = p_membership_id
     for update;
    exit when found;

    insert into public.customer_points_balance (customer_membership_id, business_id)
    values (p_membership_id, p_business_id)
    on conflict (customer_membership_id) do nothing;
    -- If the conflict fired, the loop re-selects and now finds the row.
  end loop;

  v_new_balance := v_balance.current_points + p_points;
  if v_new_balance < 0 then
    raise exception 'insufficient_points: balance % cannot cover % points',
      v_balance.current_points, abs(p_points)
      using errcode = '22023';
  end if;

  insert into public.points_ledger
    (business_id, customer_membership_id, entry_type, points, balance_after,
     source_type, source_id, store_id, actor_profile_id, reason, idempotency_key)
  values
    (p_business_id, p_membership_id, p_entry_type, p_points, v_new_balance,
     p_source_type, p_source_id, p_store_id, v_actor, p_reason, p_idem_key)
  returning id into v_entry_id;

  update public.customer_points_balance cb
     set current_points  = v_new_balance,
         lifetime_earned = cb.lifetime_earned + case when p_entry_type = 'earn' then p_points else 0 end,
         lifetime_redeemed = cb.lifetime_redeemed + case when p_entry_type = 'redeem' then abs(p_points) else 0 end,
         last_entry_id   = v_entry_id
   where cb.customer_membership_id = p_membership_id;

  perform public.write_audit(
    p_audit_action, v_actor, public.business_role(p_business_id), p_business_id, p_store_id,
    'customer_membership', p_membership_id::text,
    jsonb_build_object(
      'entry_id', v_entry_id,
      'entry_type', p_entry_type::text,
      'points', p_points,
      'balance_after', v_new_balance,
      'source_type', p_source_type,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'entry_id', v_entry_id,
    'balance_after', v_new_balance,
    'replayed', false
  );
end;
$$;

-- Internal helper: not callable through the API (grants below).
revoke execute on function public.ledger_post_entry(uuid, uuid, public.ledger_entry_type, integer, text, uuid, uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- award_points — staff+ of the business. Store-scoped staff may only award
-- into stores they are assigned to (unscoped staff = all business stores).
-- Idempotent: replaying the same (business, key) returns the original entry.
-- ---------------------------------------------------------------------------
create or replace function public.award_points(
  p_business_id     uuid,
  p_membership_id   uuid,
  p_points          integer,
  p_source_type     text default 'manual',
  p_source_id       uuid default null,
  p_store_id        uuid default null,
  p_idempotency_key text default null,
  p_reason          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_role public.app_role;
  v_existing   record;
  v_scoped     boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_points is null or p_points <= 0 then
    raise exception 'invalid_points: awards must be positive' using errcode = '22023';
  end if;

  v_actor_role := public.business_role(p_business_id);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'staff') then
    raise exception 'not_authorized: only business staff or above can award points'
      using errcode = '42501';
  end if;

  if p_store_id is not null then
    if not exists (select 1 from public.stores s where s.id = p_store_id and s.business_id = p_business_id) then
      raise exception 'store_not_in_business' using errcode = '22023';
    end if;
    if not public.role_at_least(v_actor_role, 'manager') then
      select exists (select 1 from public.my_stores()) into v_scoped;
      if v_scoped and not public.is_store_assigned(p_store_id) then
        raise exception 'not_authorized: store-scoped staff cannot award outside their stores'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if not exists (
    select 1 from public.customer_memberships cm
     where cm.id = p_membership_id and cm.business_id = p_business_id and cm.status = 'active'
  ) then
    raise exception 'membership_not_found: no active membership % in this business', p_membership_id
      using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select l.id, l.balance_after into v_existing
      from public.points_ledger l
     where l.business_id = p_business_id and l.idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('entry_id', v_existing.id, 'balance_after', v_existing.balance_after, 'replayed', true);
    end if;
  end if;

  begin
    return public.ledger_post_entry(
      p_business_id, p_membership_id, 'earn', p_points,
      p_source_type, p_source_id, p_store_id, p_reason, p_idempotency_key,
      'points.awarded'
    );
  exception when unique_violation then
    -- Lost a race on the idempotency key — replay the winner's entry.
    select l.id, l.balance_after into v_existing
      from public.points_ledger l
     where l.business_id = p_business_id and l.idempotency_key = p_idempotency_key;
    if not found then raise; end if;
    return jsonb_build_object('entry_id', v_existing.id, 'balance_after', v_existing.balance_after, 'replayed', true);
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- spend_points — manager+ (POS redemption slice may widen with explicit
-- scope later). Stores points NEGATIVE; refuses to overdraw the balance.
-- ---------------------------------------------------------------------------
create or replace function public.spend_points(
  p_business_id     uuid,
  p_membership_id   uuid,
  p_points          integer,
  p_source_type     text default 'redemption',
  p_source_id       uuid default null,
  p_store_id        uuid default null,
  p_idempotency_key text default null,
  p_reason          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_role public.app_role;
  v_existing   record;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_points is null or p_points <= 0 then
    raise exception 'invalid_points: spends must be positive (stored negative)' using errcode = '22023';
  end if;

  v_actor_role := public.business_role(p_business_id);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'manager') then
    raise exception 'not_authorized: only a manager or the owner can spend member points'
      using errcode = '42501';
  end if;

  if p_store_id is not null and not exists (
    select 1 from public.stores s where s.id = p_store_id and s.business_id = p_business_id
  ) then
    raise exception 'store_not_in_business' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.customer_memberships cm
     where cm.id = p_membership_id and cm.business_id = p_business_id and cm.status = 'active'
  ) then
    raise exception 'membership_not_found: no active membership % in this business', p_membership_id
      using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select l.id, l.balance_after into v_existing
      from public.points_ledger l
     where l.business_id = p_business_id and l.idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('entry_id', v_existing.id, 'balance_after', v_existing.balance_after, 'replayed', true);
    end if;
  end if;

  begin
    return public.ledger_post_entry(
      p_business_id, p_membership_id, 'redeem', -abs(p_points),
      p_source_type, p_source_id, p_store_id, p_reason, p_idempotency_key,
      'points.redeemed'
    );
  exception when unique_violation then
    select l.id, l.balance_after into v_existing
      from public.points_ledger l
     where l.business_id = p_business_id and l.idempotency_key = p_idempotency_key;
    if not found then raise; end if;
    return jsonb_build_object('entry_id', v_existing.id, 'balance_after', v_existing.balance_after, 'replayed', true);
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- adjust_points — owner-only corrections (or platform super_admin). Signed;
-- a reason is mandatory; may not push the balance negative.
-- ---------------------------------------------------------------------------
create or replace function public.adjust_points(
  p_business_id     uuid,
  p_membership_id   uuid,
  p_points          integer,
  p_reason          text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_role public.app_role;
  v_existing   record;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_points is null or p_points = 0 then
    raise exception 'invalid_points: adjustments must be non-zero' using errcode = '22023';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason_required: every adjustment needs an explanation' using errcode = '22023';
  end if;

  v_actor_role := public.business_role(p_business_id);
  if not public.is_super_admin() and (v_actor_role is null or not public.role_at_least(v_actor_role, 'owner')) then
    raise exception 'not_authorized: only the business owner can adjust points'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.customer_memberships cm
     where cm.id = p_membership_id and cm.business_id = p_business_id and cm.status = 'active'
  ) then
    raise exception 'membership_not_found: no active membership % in this business', p_membership_id
      using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select l.id, l.balance_after into v_existing
      from public.points_ledger l
     where l.business_id = p_business_id and l.idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('entry_id', v_existing.id, 'balance_after', v_existing.balance_after, 'replayed', true);
    end if;
  end if;

  begin
    return public.ledger_post_entry(
      p_business_id, p_membership_id, 'adjust', p_points,
      'adjustment', null, null, p_reason, p_idempotency_key,
      'points.adjusted'
    );
  exception when unique_violation then
    select l.id, l.balance_after into v_existing
      from public.points_ledger l
     where l.business_id = p_business_id and l.idempotency_key = p_idempotency_key;
    if not found then raise; end if;
    return jsonb_build_object('entry_id', v_existing.id, 'balance_after', v_existing.balance_after, 'replayed', true);
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS + fail-closed grants (mirrors 20260905120200 style)
--   * SELECT: the member themselves + business staff and above.
--   * No INSERT/UPDATE/DELETE grants for anon/authenticated — writes exist
--     only inside the RPCs (double-locked by the immutability trigger).
-- ---------------------------------------------------------------------------
alter table public.points_ledger            enable row level security;
alter table public.customer_points_balance  enable row level security;

revoke all on public.points_ledger           from public, anon, authenticated;
revoke all on public.customer_points_balance from public, anon, authenticated;

grant select on public.points_ledger           to authenticated;
grant select on public.customer_points_balance to authenticated;

grant execute on function public.point_balance(uuid) to authenticated;
grant execute on function public.award_points(uuid, uuid, integer, text, uuid, uuid, text, text) to authenticated;
grant execute on function public.spend_points(uuid, uuid, integer, text, uuid, uuid, text, text) to authenticated;
grant execute on function public.adjust_points(uuid, uuid, integer, text, text) to authenticated;
revoke execute on function public.point_balance(uuid) from public, anon;
revoke execute on function public.award_points(uuid, uuid, integer, text, uuid, uuid, text, text) from public, anon;
revoke execute on function public.spend_points(uuid, uuid, integer, text, uuid, uuid, text, text) from public, anon;
revoke execute on function public.adjust_points(uuid, uuid, integer, text, text) from public, anon;

-- policies — points_ledger
drop policy if exists "points_ledger_select_own" on public.points_ledger;
create policy "points_ledger_select_own" on public.points_ledger
  for select to authenticated
  using (
    customer_membership_id in (
      select cm.id from public.customer_memberships cm where cm.profile_id = auth.uid()
    )
  );

drop policy if exists "points_ledger_select_business" on public.points_ledger;
create policy "points_ledger_select_business" on public.points_ledger
  for select to authenticated
  using (business_id in (select * from public.my_businesses('staff')));

-- policies — customer_points_balance
drop policy if exists "points_balance_select_own" on public.customer_points_balance;
create policy "points_balance_select_own" on public.customer_points_balance
  for select to authenticated
  using (
    customer_membership_id in (
      select cm.id from public.customer_memberships cm where cm.profile_id = auth.uid()
    )
  );

drop policy if exists "points_balance_select_business" on public.customer_points_balance;
create policy "points_balance_select_business" on public.customer_points_balance
  for select to authenticated
  using (business_id in (select * from public.my_businesses('staff')));

-- service_role: full access for trusted server operations (bypasses RLS by
-- attribute; grants kept explicit for parity with the Step-2 tables).
grant all on public.points_ledger           to service_role;
grant all on public.customer_points_balance to service_role;
grant usage, select on sequence public.points_ledger_id_seq to service_role;
