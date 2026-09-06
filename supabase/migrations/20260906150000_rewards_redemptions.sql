-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2 · Step 3 · Slice 4: rewards catalogue + point redemptions
-- (architecture proposal §"Rewards and redemptions", §8.2 redeem flow and
-- §8.4 collection codes, adapted to the schema as built).
--
-- Deviations from the proposal (documented in RLS_POLICIES.md §6):
--   * reward_options (points+cash / member-price variants) deferred — a
--     launch reward has ONE points cost (rewards.points_cost); cash_due_paise
--     stays 0 and the column exists for the options slice.
--   * reward_eligibility table deferred (tiers are not live yet): launch
--     guards are expiry_days, max_per_customer_per_month and inventory.
--   * Lifecycle simplified for launch: pending → collected | cancelled |
--     expired (no confirmed/ready_for_pickup states — counter pickup only);
--     expiry is lazy (marked on the next collect/cancel touch — which then
--     RETURNS status 'expired' instead of raising, because a raise would
--     roll the marking back) until a cron exists. Transitions are enforced
--     inside the RPCs + CHECK constraints. Invalid-code attempts are
--     denial-audited by the server action (a raising RPC cannot persist its
--     own audit row).
--   * redemption_status_events table deferred — every transition is an
--     audit_logs row (from/to in metadata) and the redemptions row carries
--     collected_*/cancelled_* fields; redemptions are never deleted.
--   * Collection codes follow §8.4 exactly: 8 chars Crockford base-32 from
--     pgcrypto gen_random_bytes(5), only sha256 stored (+ last4 for support),
--     the plaintext returned ONCE to the caller; typed codes are normalized
--     (I→1, L→1, O→0) before hashing. Rate limiting deferred (§10).
--   * Reward inventory: rows are holds (reserved), not product stock — a
--     reward WITHOUT inventory rows is unlimited (e.g. discount coupons);
--     store rows take precedence over the business-wide pool (store_id null).
--   * redeem_reward authorizes the customer themself (own linked membership)
--     OR business staff at the counter (store-scope aware), per §8.2 step 1.
--   * Lock order follows §8.2 step 2: customer balance row → reward
--     inventory row → reference counter (deadlock-free with create_sale,
--     which locks balance → product inventory → invoice counter).
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.reward_type as enum ('discount', 'coupon', 'free_product', 'gift', 'special_offer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.reward_status as enum ('active', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.redemption_status as enum ('pending', 'collected', 'cancelled', 'expired');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- rewards — RPC-only writes; archived, never deleted.
-- ---------------------------------------------------------------------------
create table if not exists public.rewards (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses (id) on delete cascade,
  name               text not null,
  description        text,
  reward_type        public.reward_type not null,
  category           text,
  regular_price_paise bigint check (regular_price_paise is null or regular_price_paise >= 0),
  art_key            text,
  points_cost        integer not null check (points_cost > 0),
  expiry_days        integer not null default 30 check (expiry_days between 1 and 365),
  max_per_customer_per_month integer check (max_per_customer_per_month is null or max_per_customer_per_month >= 1),
  terms              jsonb not null default '[]'::jsonb,
  status             public.reward_status not null default 'active',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint rewards_name_len check (length(trim(name)) between 1 and 160)
);

create index if not exists rewards_business_status_idx on public.rewards (business_id, status);

drop trigger if exists rewards_set_updated_at on public.rewards;
create trigger rewards_set_updated_at
  before update on public.rewards
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- reward_inventory — reservation bookkeeping (on_hand ≥ reserved). A reward
-- with NO rows is unlimited. store_id null = business-wide pool.
-- ---------------------------------------------------------------------------
create table if not exists public.reward_inventory (
  reward_id  uuid not null references public.rewards (id) on delete cascade,
  store_id   uuid references public.stores (id) on delete cascade,  -- null = pool
  on_hand    integer not null default 0 check (on_hand >= 0),
  reserved   integer not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now(),
  constraint reward_inventory_sane check (on_hand >= reserved)
);

-- Expression uniques need an INDEX (a table constraint can't hold coalesce).
create unique index if not exists reward_inventory_uq
  on public.reward_inventory (reward_id, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid));

drop trigger if exists reward_inventory_set_updated_at on public.reward_inventory;
create trigger reward_inventory_set_updated_at
  before update on public.reward_inventory
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- redemption_counters — internal per-business sequence for 'RDM-####'
-- references (same pattern as invoice_counters: RLS on, no policies, no
-- grants, locked inside redeem_reward).
-- ---------------------------------------------------------------------------
create table if not exists public.redemption_counters (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  next_seq    bigint not null default 1 check (next_seq >= 1),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists redemption_counters_set_updated_at on public.redemption_counters;
create trigger redemption_counters_set_updated_at
  before update on public.redemption_counters
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- redemptions — transactional; RPC-only writes; status flips but rows are
-- never deleted. Only sha256(code) + last4 are stored (§8.4).
-- ---------------------------------------------------------------------------
create table if not exists public.redemptions (
  id                     uuid primary key default gen_random_uuid(),
  business_id            uuid not null references public.businesses (id) on delete cascade,
  customer_membership_id uuid not null references public.customer_memberships (id),
  store_id               uuid references public.stores (id),
  reference              text not null,
  code_hash              bytea not null,
  code_last4             char(4) not null,
  reward_id              uuid not null references public.rewards (id),
  qty                    integer not null default 1 check (qty > 0),
  points_used            integer not null check (points_used > 0),
  cash_due_paise         bigint not null default 0 check (cash_due_paise >= 0),
  status                 public.redemption_status not null default 'pending',
  -- Which reward_inventory row holds the reservation ('store' = the row for
  -- redemptions.store_id, 'pool' = the business-wide row, null = unlimited
  -- reward). Recorded at redeem time so collect/cancel debit exactly the
  -- row that was reserved, even if inventory rows change afterwards.
  inventory_scope        text check (inventory_scope is null or inventory_scope in ('store', 'pool')),
  expires_at             timestamptz not null,
  collected_at           timestamptz,
  collected_by           uuid references public.profiles (id) on delete set null,
  cancelled_at           timestamptz,
  cancelled_by           uuid references public.profiles (id) on delete set null,
  cancel_reason          text,
  created_by             uuid references public.profiles (id) on delete set null,
  idempotency_key        text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint redemptions_reference_format check (reference ~ '^RDM-[0-9]{4,12}$'),
  constraint redemptions_reference_unique unique (business_id, reference),
  constraint redemptions_collected_fields check (
    (status = 'collected') = (collected_at is not null and collected_by is not null)
  ),
  constraint redemptions_cancelled_fields check (
    (status = 'cancelled') = (cancelled_at is not null and cancelled_by is not null and cancel_reason is not null)
  ),
  constraint redemptions_idem_len check (
    idempotency_key is null or length(trim(idempotency_key)) between 4 and 120
  )
);

create unique index if not exists redemptions_idem_uq
  on public.redemptions (business_id, idempotency_key)
  where idempotency_key is not null;
-- Codes must be unique among OPEN redemptions of a business (§8.4).
create unique index if not exists redemptions_open_code_uq
  on public.redemptions (business_id, code_hash)
  where status = 'pending';
create index if not exists redemptions_business_status_idx
  on public.redemptions (business_id, status, expires_at);
create index if not exists redemptions_membership_idx
  on public.redemptions (customer_membership_id, created_at desc);

drop trigger if exists redemptions_set_updated_at on public.redemptions;
create trigger redemptions_set_updated_at
  before update on public.redemptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- redemption_items — snapshot of what was redeemed (one reward line at
-- launch; keeps the proposal's shape for the multi-item slice).
-- ---------------------------------------------------------------------------
create table if not exists public.redemption_items (
  id            uuid primary key default gen_random_uuid(),
  redemption_id uuid not null references public.redemptions (id) on delete cascade,
  reward_id     uuid not null references public.rewards (id),
  name_snapshot text not null,
  qty           integer not null check (qty > 0),
  points_each   integer not null check (points_each >= 0),
  constraint redemption_items_name_len check (length(trim(name_snapshot)) between 1 and 160)
);

create index if not exists redemption_items_redemption_idx on public.redemption_items (redemption_id);

-- ---------------------------------------------------------------------------
-- create_reward — manager+.
-- ---------------------------------------------------------------------------
create or replace function public.create_reward(
  p_business_id    uuid,
  p_name           text,
  p_reward_type    text,
  p_points_cost    integer,
  p_description    text    default null,
  p_category       text    default null,
  p_regular_price_paise bigint default null,
  p_art_key        text    default null,
  p_expiry_days    integer default 30,
  p_max_per_customer_per_month integer default null,
  p_terms          jsonb   default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_actor_role public.app_role;
  v_type       public.reward_type;
  v_reward_id  uuid;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  v_actor_role := public.business_role(p_business_id);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'manager') then
    raise exception 'not_authorized: only a manager or the owner can manage rewards'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.status = 'active') then
    raise exception 'business_inactive' using errcode = '22023';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_reward: a reward needs a name' using errcode = '22023';
  end if;
  begin
    v_type := p_reward_type::public.reward_type;
  exception when invalid_text_representation then
    raise exception 'invalid_reward_type: % (use discount|coupon|free_product|gift|special_offer)', p_reward_type
      using errcode = '22023';
  end;
  if p_points_cost is null or p_points_cost <= 0 then
    raise exception 'invalid_points_cost: a reward must cost at least 1 point' using errcode = '22023';
  end if;
  if coalesce(p_expiry_days, 30) not between 1 and 365 then
    raise exception 'invalid_expiry: collection window must be 1–365 days' using errcode = '22023';
  end if;
  if p_max_per_customer_per_month is not null and p_max_per_customer_per_month < 1 then
    raise exception 'invalid_limit: max per month must be ≥ 1' using errcode = '22023';
  end if;

  insert into public.rewards
    (business_id, name, description, reward_type, category, regular_price_paise, art_key,
     points_cost, expiry_days, max_per_customer_per_month, terms)
  values
    (p_business_id, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), v_type,
     nullif(trim(coalesce(p_category, '')), ''), p_regular_price_paise, p_art_key,
     p_points_cost, coalesce(p_expiry_days, 30), p_max_per_customer_per_month,
     coalesce(p_terms, '[]'::jsonb))
  returning id into v_reward_id;

  perform public.write_audit(
    'reward.created', v_actor, v_actor_role, p_business_id, null,
    'reward', v_reward_id::text,
    jsonb_build_object('name', trim(p_name), 'type', v_type::text,
                       'points_cost', p_points_cost, 'expiry_days', coalesce(p_expiry_days, 30))
  );

  return jsonb_build_object(
    'reward_id', v_reward_id, 'name', trim(p_name),
    'reward_type', v_type::text, 'points_cost', p_points_cost
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- update_reward — manager+, partial update; rewards are archived, never
-- deleted; price/points changes land in the audit.
-- ---------------------------------------------------------------------------
create or replace function public.update_reward(
  p_reward_id   uuid,
  p_name        text    default null,
  p_description text    default null,
  p_points_cost integer default null,
  p_category    text    default null,
  p_regular_price_paise bigint default null,
  p_art_key     text    default null,
  p_expiry_days integer default null,
  p_max_per_customer_per_month integer default null,
  p_status      text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_actor_role public.app_role;
  v_reward     record;
  v_new_status public.reward_status;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select r.id, r.business_id, r.name, r.points_cost, r.status
    into v_reward
    from public.rewards r
   where r.id = p_reward_id
     for update;
  if not found then
    raise exception 'reward_not_found' using errcode = 'P0002';
  end if;

  v_actor_role := public.business_role(v_reward.business_id);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'manager') then
    raise exception 'not_authorized: only a manager or the owner can manage rewards'
      using errcode = '42501';
  end if;

  if p_name is null and p_description is null and p_points_cost is null and p_category is null
     and p_regular_price_paise is null and p_art_key is null and p_expiry_days is null
     and p_max_per_customer_per_month is null and p_status is null then
    raise exception 'nothing_to_update: supply at least one field' using errcode = '22023';
  end if;
  if p_points_cost is not null and p_points_cost <= 0 then
    raise exception 'invalid_points_cost: a reward must cost at least 1 point' using errcode = '22023';
  end if;
  if p_name is not null and length(trim(p_name)) = 0 then
    raise exception 'invalid_reward: a reward needs a name' using errcode = '22023';
  end if;
  if p_expiry_days is not null and p_expiry_days not between 1 and 365 then
    raise exception 'invalid_expiry: collection window must be 1–365 days' using errcode = '22023';
  end if;
  if p_status is not null then
    begin
      v_new_status := p_status::public.reward_status;
    exception when invalid_text_representation then
      raise exception 'invalid_status: rewards are active or archived (never deleted)'
        using errcode = '22023';
    end;
    if v_new_status = 'archived' then
      -- Archiving blocks new redemptions; open ones must be settled first.
      if exists (select 1 from public.redemptions rd
                  where rd.reward_id = p_reward_id and rd.status = 'pending') then
        raise exception 'reward_has_open_redemptions: settle pending pickups before archiving'
          using errcode = '22023';
      end if;
    end if;
  end if;

  update public.rewards
     set name            = coalesce(nullif(trim(p_name), ''), name),
         description     = case when p_description is null then description else nullif(trim(p_description), '') end,
         points_cost     = coalesce(p_points_cost, points_cost),
         category        = case when p_category is null then category else nullif(trim(p_category), '') end,
         regular_price_paise = coalesce(p_regular_price_paise, regular_price_paise),
         art_key         = coalesce(p_art_key, art_key),
         expiry_days     = coalesce(p_expiry_days, expiry_days),
         max_per_customer_per_month = case when p_max_per_customer_per_month is null
                                           then max_per_customer_per_month
                                           else p_max_per_customer_per_month end,
         status          = coalesce(v_new_status, status)
   where id = p_reward_id;

  perform public.write_audit(
    'reward.updated', v_actor, v_actor_role, v_reward.business_id, null,
    'reward', p_reward_id::text,
    jsonb_build_object(
      'points_before', v_reward.points_cost,
      'points_after', coalesce(p_points_cost, v_reward.points_cost),
      'status_after', coalesce(v_new_status::text, v_reward.status::text)
    )
  );

  return jsonb_build_object(
    'reward_id', p_reward_id,
    'points_cost', coalesce(p_points_cost, v_reward.points_cost),
    'status', coalesce(v_new_status::text, v_reward.status::text)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- set_reward_inventory — manager+. Absolute on_hand for a store row or the
-- business-wide pool (store null); removing the cap entirely = delete is
-- NOT offered (rows are kept; unlimited rewards simply have no rows —
-- created that way). on_hand may never drop below what's already reserved.
-- ---------------------------------------------------------------------------
create or replace function public.set_reward_inventory(
  p_reward_id uuid,
  p_store_id  uuid,
  p_on_hand   integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_actor_role public.app_role;
  v_business   uuid;
  v_old        integer;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_on_hand is null or p_on_hand < 0 then
    raise exception 'invalid_quantity: on_hand must be a non-negative whole number'
      using errcode = '22023';
  end if;

  select r.business_id into v_business from public.rewards r where r.id = p_reward_id for update of r;
  if not found then
    raise exception 'reward_not_found' using errcode = 'P0002';
  end if;

  v_actor_role := public.business_role(v_business);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'manager') then
    raise exception 'not_authorized: only a manager or the owner can manage reward inventory'
      using errcode = '42501';
  end if;

  if p_store_id is not null and not exists (
    select 1 from public.stores s where s.id = p_store_id and s.business_id = v_business
  ) then
    raise exception 'store_not_in_business: store % is not part of this business', p_store_id
      using errcode = '22023';
  end if;

  select ri.on_hand into v_old
    from public.reward_inventory ri
   where ri.reward_id = p_reward_id
     and coalesce(ri.store_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = coalesce(p_store_id, '00000000-0000-0000-0000-000000000000'::uuid);

  insert into public.reward_inventory (reward_id, store_id, on_hand)
  values (p_reward_id, p_store_id, p_on_hand)
  on conflict (reward_id, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set on_hand = excluded.on_hand;

  -- The CHECK (on_hand >= reserved) is the hard backstop; this gives a typed error.
  if exists (select 1 from public.reward_inventory ri
              where ri.reward_id = p_reward_id
                and coalesce(ri.store_id, '00000000-0000-0000-0000-000000000000'::uuid)
                  = coalesce(p_store_id, '00000000-0000-0000-0000-000000000000'::uuid)
                and ri.on_hand < ri.reserved) then
    raise exception 'inventory_reserved_conflict: % units are already reserved for open redemptions',
      (select ri.reserved from public.reward_inventory ri
        where ri.reward_id = p_reward_id
          and coalesce(ri.store_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = coalesce(p_store_id, '00000000-0000-0000-0000-000000000000'::uuid))
      using errcode = '22023';
  end if;

  perform public.write_audit(
    'reward.inventory_set', v_actor, v_actor_role, v_business, p_store_id,
    'reward', p_reward_id::text,
    jsonb_build_object('on_hand_before', v_old, 'on_hand_after', p_on_hand,
                       'scope', case when p_store_id is null then 'business_pool' else 'store' end)
  );

  return jsonb_build_object(
    'reward_id', p_reward_id, 'store_id', p_store_id,
    'on_hand_before', v_old, 'on_hand_after', p_on_hand
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- redeem_reward — §8.2. The customer themself (own linked membership) OR
-- business staff at the counter. Locks balance → reward inventory →
-- reference counter; reserves stock, spends points through the immutable
-- ledger, generates the one-time collection code (§8.4).
-- ---------------------------------------------------------------------------
create or replace function public.redeem_reward(
  p_reward_id              uuid,
  p_customer_membership_id uuid,
  p_store_id               uuid   default null,
  p_qty                    integer default 1,
  p_idempotency_key        text   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor        uuid := auth.uid();
  v_actor_role   public.app_role;
  v_business     uuid;
  v_membership   record;
  v_reward       record;
  v_scoped       boolean;
  v_existing     record;
  v_inv          record;
  v_inv_found    boolean := false;
  v_scope        text;
  v_points       integer;
  v_counter      bigint;
  v_reference    text;
  v_redemption_id uuid;
  v_bytes        bytea;
  v_num          bigint;
  v_code         text;
  v_hash         bytea;
  v_try          integer;
  v_recent       integer;
  v_ledger       jsonb;
  v_balance      integer;
  v_alphabet     text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';  -- Crockford base-32
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'invalid_quantity: qty must be a positive whole number' using errcode = '22023';
  end if;

  -- 1. Reward → business.
  select r.id, r.business_id, r.name, r.points_cost, r.status, r.expiry_days,
         r.max_per_customer_per_month
    into v_reward
    from public.rewards r
   where r.id = p_reward_id;
  if not found then
    raise exception 'reward_not_found' using errcode = 'P0002';
  end if;
  v_business := v_reward.business_id;

  if not exists (select 1 from public.businesses b where b.id = v_business and b.status = 'active') then
    raise exception 'business_inactive' using errcode = '22023';
  end if;
  if v_reward.status <> 'active' then
    raise exception 'reward_archived: % is no longer redeemable', v_reward.name using errcode = '22023';
  end if;

  -- 2. Membership must be an active membership OF the reward's business.
  select cm.id, cm.profile_id into v_membership
    from public.customer_memberships cm
   where cm.id = p_customer_membership_id and cm.business_id = v_business and cm.status = 'active';
  if not found then
    raise exception 'customer_not_found: no active membership % in this business', p_customer_membership_id
      using errcode = '22023';
  end if;

  -- 3. Authorize: staff at the counter, or the linked customer themself.
  v_actor_role := public.business_role(v_business);
  if v_actor_role is not null and public.role_at_least(v_actor_role, 'staff') then
    if not public.role_at_least(v_actor_role, 'manager') and p_store_id is not null then
      select exists (select 1 from public.my_stores()) into v_scoped;
      if v_scoped and not public.is_store_assigned(p_store_id) then
        raise exception 'store_forbidden: store-scoped staff cannot redeem outside their stores'
          using errcode = '42501';
      end if;
    end if;
  elsif v_membership.profile_id = v_actor then
    v_actor_role := null;  -- customer self-redemption (no business role)
  else
    raise exception 'not_authorized: redeem for your own membership or as business staff'
      using errcode = '42501';
  end if;

  if p_store_id is not null and not exists (
    select 1 from public.stores s where s.id = p_store_id and s.business_id = v_business
  ) then
    raise exception 'store_not_in_business: store % is not part of this business', p_store_id
      using errcode = '22023';
  end if;

  -- 4. Idempotent replay (the plaintext code is NOT replayed — once only).
  if p_idempotency_key is not null then
    select rd.id, rd.reference, rd.points_used, rd.expires_at, rd.status
      into v_existing
      from public.redemptions rd
     where rd.business_id = v_business and rd.idempotency_key = p_idempotency_key;
    if found then
      select l.balance_after into v_balance
        from public.points_ledger l
       where l.business_id = v_business and l.idempotency_key = 'redemption:' || v_existing.id;
      return jsonb_build_object(
        'redemption_id', v_existing.id, 'reference', v_existing.reference,
        'code', null, 'points_used', v_existing.points_used,
        'balance_after', v_balance, 'expires_at', v_existing.expires_at,
        'status', v_existing.status::text, 'replayed', true
      );
    end if;
  end if;

  -- 5. Monthly abuse guard (pending/collected within the last 30 days).
  if v_reward.max_per_customer_per_month is not null then
    select count(*) into v_recent
      from public.redemptions rd
     where rd.customer_membership_id = p_customer_membership_id
       and rd.reward_id = p_reward_id
       and rd.status in ('pending', 'collected')
       and rd.created_at >= now() - interval '30 days';
    if v_recent >= v_reward.max_per_customer_per_month then
      raise exception 'redemption_limit_exceeded: % allows % per customer per month',
        v_reward.name, v_reward.max_per_customer_per_month
        using errcode = '22023';
    end if;
  end if;

  v_points := v_reward.points_cost * p_qty;

  -- 6. Lock in deterministic order: balance → reward inventory → counter.
  insert into public.customer_points_balance (customer_membership_id, business_id)
  values (p_customer_membership_id, v_business)
  on conflict (customer_membership_id) do nothing;
  select cb.current_points into v_balance
    from public.customer_points_balance cb
   where cb.customer_membership_id = p_customer_membership_id
     for update;

  -- Inventory: only enforced when the reward has ANY rows (else unlimited).
  if exists (select 1 from public.reward_inventory ri where ri.reward_id = p_reward_id) then
    if p_store_id is not null then
      select ri.store_id, ri.on_hand, ri.reserved into v_inv
        from public.reward_inventory ri
       where ri.reward_id = p_reward_id and ri.store_id = p_store_id
         for update;
      v_inv_found := found;
      if v_inv_found then v_scope := 'store'; end if;
    end if;
    if not v_inv_found then
      select ri.store_id, ri.on_hand, ri.reserved into v_inv
        from public.reward_inventory ri
       where ri.reward_id = p_reward_id and ri.store_id is null
         for update;
      v_inv_found := found;
      if v_inv_found then v_scope := 'pool'; end if;
    end if;
    if not v_inv_found then
      raise exception 'insufficient_inventory: % has no business-wide stock pool — choose a store with stock', v_reward.name
        using errcode = '22023';
    end if;
    if v_inv.on_hand - v_inv.reserved < p_qty then
      raise exception 'insufficient_inventory: % — % available, % requested',
        v_reward.name, v_inv.on_hand - v_inv.reserved, p_qty
        using errcode = '22023';
    end if;
  end if;

  if v_balance < v_points then
    raise exception 'insufficient_points: balance % is below the % points needed', v_balance, v_points
      using errcode = '22023';
  end if;

  -- Reserve the stock (the chosen row is already locked above, if tracked).
  if v_scope = 'store' then
    update public.reward_inventory
       set reserved = reserved + p_qty
     where reward_id = p_reward_id and store_id = p_store_id;
  elsif v_scope = 'pool' then
    update public.reward_inventory
       set reserved = reserved + p_qty
     where reward_id = p_reward_id and store_id is null;
  end if;

  -- 7. Reference counter (locked row per business).
  insert into public.redemption_counters (business_id) values (v_business)
    on conflict (business_id) do nothing;
  select rc.next_seq into v_counter from public.redemption_counters rc
   where rc.business_id = v_business for update;
  update public.redemption_counters set next_seq = next_seq + 1 where business_id = v_business;
  v_reference := 'RDM-' || lpad(v_counter::text, 4, '0');

  -- 8. Collection code (§8.4): 8 Crockford chars from 5 random bytes;
  --    only sha256 + last4 stored; regenerated on (astronomically rare) clash.
  for v_try in 1..5 loop
    v_bytes := extensions.gen_random_bytes(5);
    v_num := (get_byte(v_bytes, 0)::bigint << 32)
           | (get_byte(v_bytes, 1)::bigint << 24)
           | (get_byte(v_bytes, 2)::bigint << 16)
           | (get_byte(v_bytes, 3)::bigint << 8)
           |  get_byte(v_bytes, 4)::bigint;
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, (((v_num >> (35 - 5 * i)) & 31)::int) + 1, 1);
    end loop;
    v_hash := extensions.digest(convert_to(v_code, 'UTF8'), 'sha256');
    exit when not exists (
      select 1 from public.redemptions rd
       where rd.business_id = v_business and rd.code_hash = v_hash and rd.status = 'pending'
    );
    if v_try = 5 then
      raise exception 'code_generation_failed: could not derive a unique collection code'
        using errcode = '22023';
    end if;
  end loop;

  -- 9. Write the redemption.
  insert into public.redemptions
    (business_id, customer_membership_id, store_id, reference, code_hash, code_last4,
     reward_id, qty, points_used, cash_due_paise, inventory_scope, expires_at,
     created_by, idempotency_key)
  values
    (v_business, p_customer_membership_id, p_store_id, v_reference, v_hash, right(v_code, 4),
     p_reward_id, p_qty, v_points, 0, v_scope,
     now() + make_interval(days => v_reward.expiry_days), v_actor, p_idempotency_key)
  returning id into v_redemption_id;

  insert into public.redemption_items (redemption_id, reward_id, name_snapshot, qty, points_each)
  values (v_redemption_id, p_reward_id, v_reward.name, p_qty, v_reward.points_cost);

  -- 10. Spend the points through the immutable ledger (Slice 1 internals).
  v_ledger := public.ledger_post_entry(
    v_business, p_customer_membership_id, 'redeem', -v_points,
    'redemption', v_redemption_id, p_store_id,
    'Redeemed ' || v_reward.name || ' (' || v_reference || ')',
    'redemption:' || v_redemption_id::text,
    'points.redeemed'
  );
  v_balance := (v_ledger ->> 'balance_after')::integer;

  -- 11. Audit + response (plaintext code leaves the database exactly once).
  perform public.write_audit(
    'redemption.created', v_actor, v_actor_role, v_business, p_store_id,
    'redemption', v_redemption_id::text,
    jsonb_build_object('reference', v_reference, 'reward_id', p_reward_id,
                       'points_used', v_points, 'qty', p_qty,
                       'code_last4', right(v_code, 4))
  );

  return jsonb_build_object(
    'redemption_id', v_redemption_id, 'reference', v_reference,
    'code', v_code, 'points_used', v_points, 'balance_after', v_balance,
    'expires_at', now() + make_interval(days => v_reward.expiry_days),
    'status', 'pending', 'replayed', false
  );
exception when unique_violation then
  -- Lost an idempotency race — replay the winner (without the code).
  if p_idempotency_key is not null then
    select rd.id, rd.reference, rd.points_used, rd.expires_at, rd.status
      into v_existing
      from public.redemptions rd
     where rd.business_id = v_business and rd.idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'redemption_id', v_existing.id, 'reference', v_existing.reference,
        'code', null, 'points_used', v_existing.points_used,
        'balance_after', null, 'expires_at', v_existing.expires_at,
        'status', v_existing.status::text, 'replayed', true
      );
    end if;
  end if;
  raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- collect_redemption — staff+ (store-scope aware). Verifies the hashed
-- collection code (typed codes normalized I→1, L→1, O→0), lazily expires
-- overdue pickups, then debits the reserved stock.
-- ---------------------------------------------------------------------------
create or replace function public.collect_redemption(p_redemption_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_actor_role public.app_role;
  v_red        record;
  v_scoped     boolean;
  v_norm       text;
  v_hash       bytea;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_code is null or length(trim(p_code)) <> 8 then
    raise exception 'code_required: the 8-character collection code is required'
      using errcode = '22023';
  end if;

  select rd.id, rd.business_id, rd.store_id, rd.reference, rd.code_hash, rd.status,
         rd.expires_at, rd.reward_id, rd.qty, rd.inventory_scope
    into v_red
    from public.redemptions rd
   where rd.id = p_redemption_id
     for update;
  if not found then
    raise exception 'redemption_not_found' using errcode = 'P0002';
  end if;

  v_actor_role := public.business_role(v_red.business_id);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'staff') then
    raise exception 'not_authorized: only business staff can hand over redemptions'
      using errcode = '42501';
  end if;
  if not public.role_at_least(v_actor_role, 'manager') and v_red.store_id is not null then
    select exists (select 1 from public.my_stores()) into v_scoped;
    if v_scoped and not public.is_store_assigned(v_red.store_id) then
      raise exception 'store_forbidden: this redemption belongs to another store'
        using errcode = '42501';
    end if;
  end if;

  -- Lazy expiry (a cron replaces this when one exists). Marking + releasing +
  -- auditing then RETURNING — a raise would roll all of it back.
  if v_red.status = 'pending' and v_red.expires_at <= now() then
    update public.redemptions
       set status = 'expired'
     where id = v_red.id;
    -- Release the reservation from exactly the row recorded at redeem time.
    if v_red.inventory_scope = 'store' then
      update public.reward_inventory set reserved = greatest(reserved - v_red.qty, 0)
       where reward_id = v_red.reward_id and store_id = v_red.store_id;
    elsif v_red.inventory_scope = 'pool' then
      update public.reward_inventory set reserved = greatest(reserved - v_red.qty, 0)
       where reward_id = v_red.reward_id and store_id is null;
    end if;
    perform public.write_audit(
      'redemption.expired', v_actor, v_actor_role, v_red.business_id, v_red.store_id,
      'redemption', v_red.id::text,
      jsonb_build_object('reference', v_red.reference, 'from_status', 'pending', 'to_status', 'expired')
    );
    return jsonb_build_object(
      'redemption_id', v_red.id, 'reference', v_red.reference,
      'status', 'expired', 'expired_now', true
    );
  end if;

  if v_red.status <> 'pending' then
    raise exception 'redemption_not_collectable: % is already %', v_red.reference, v_red.status
      using errcode = '22023';
  end if;

  -- Verify the code (Crockford normalization for human-typed codes).
  v_norm := translate(upper(trim(p_code)), 'ILO', '110');
  v_hash := extensions.digest(convert_to(v_norm, 'UTF8'), 'sha256');
  if v_hash <> v_red.code_hash then
    -- NOTE: no write_audit here — the raise below rolls the function's
    -- statement back and would erase the row. Invalid-code attempts are
    -- denial-audited by the calling server action (team-actions pattern).
    raise exception 'redemption_code_invalid: that collection code does not match %', v_red.reference
      using errcode = '22023';
  end if;

  update public.redemptions
     set status = 'collected', collected_at = now(), collected_by = v_actor
   where id = v_red.id;

  -- Debit the reserved stock from exactly the row recorded at redeem time.
  if v_red.inventory_scope = 'store' then
    update public.reward_inventory
       set on_hand = on_hand - v_red.qty, reserved = reserved - v_red.qty
     where reward_id = v_red.reward_id and store_id = v_red.store_id and reserved >= v_red.qty;
  elsif v_red.inventory_scope = 'pool' then
    update public.reward_inventory
       set on_hand = on_hand - v_red.qty, reserved = reserved - v_red.qty
     where reward_id = v_red.reward_id and store_id is null and reserved >= v_red.qty;
  end if;

  perform public.write_audit(
    'redemption.collected', v_actor, v_actor_role, v_red.business_id, v_red.store_id,
    'redemption', v_red.id::text,
    jsonb_build_object('reference', v_red.reference, 'from_status', 'pending', 'to_status', 'collected')
  );

  return jsonb_build_object(
    'redemption_id', v_red.id, 'reference', v_red.reference,
    'status', 'collected', 'collected_at', now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_redemption — manager+ OR the linked customer themself, while still
-- pending (and not expired). Releases the reservation and refunds the points
-- with an audited compensating ledger entry — never by editing a balance.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_redemption(p_redemption_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_actor_role public.app_role;
  v_red        record;
  v_membership record;
  v_ledger     jsonb;
  v_balance    integer := null;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason_required: cancelling a redemption needs an explanation'
      using errcode = '22023';
  end if;

  select rd.id, rd.business_id, rd.reference, rd.status, rd.expires_at,
         rd.reward_id, rd.qty, rd.points_used, rd.customer_membership_id,
         rd.store_id, rd.inventory_scope
    into v_red
    from public.redemptions rd
   where rd.id = p_redemption_id
     for update;
  if not found then
    raise exception 'redemption_not_found' using errcode = 'P0002';
  end if;

  select cm.profile_id into v_membership
    from public.customer_memberships cm
   where cm.id = v_red.customer_membership_id;

  v_actor_role := public.business_role(v_red.business_id);
  if v_actor_role is not null and public.role_at_least(v_actor_role, 'manager') then
    null;  -- manager+ may cancel anything in their business
  elsif v_membership.profile_id = v_actor then
    v_actor_role := null;  -- customer cancels their own redemption
  else
    raise exception 'not_authorized: only a manager, the owner, or the member themself can cancel'
      using errcode = '42501';
  end if;

  -- Lazy expiry (same semantics as collect): mark, release, audit, RETURN.
  if v_red.status = 'pending' and v_red.expires_at <= now() then
    update public.redemptions set status = 'expired' where id = v_red.id;
    if v_red.inventory_scope = 'store' then
      update public.reward_inventory set reserved = greatest(reserved - v_red.qty, 0)
       where reward_id = v_red.reward_id and store_id = v_red.store_id;
    elsif v_red.inventory_scope = 'pool' then
      update public.reward_inventory set reserved = greatest(reserved - v_red.qty, 0)
       where reward_id = v_red.reward_id and store_id is null;
    end if;
    perform public.write_audit(
      'redemption.expired', v_actor, v_actor_role, v_red.business_id, null,
      'redemption', v_red.id::text,
      jsonb_build_object('reference', v_red.reference, 'from_status', 'pending', 'to_status', 'expired')
    );
    return jsonb_build_object(
      'redemption_id', v_red.id, 'reference', v_red.reference,
      'status', 'expired', 'expired_now', true, 'points_refunded', 0
    );
  end if;

  if v_red.status <> 'pending' then
    raise exception 'redemption_not_cancellable: % is already %', v_red.reference, v_red.status
      using errcode = '22023';
  end if;

  update public.redemptions
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor,
         cancel_reason = trim(p_reason)
   where id = v_red.id;

  -- Release the reservation from exactly the row recorded at redeem time.
  if v_red.inventory_scope = 'store' then
    update public.reward_inventory set reserved = reserved - v_red.qty
     where reward_id = v_red.reward_id and store_id = v_red.store_id and reserved >= v_red.qty;
  elsif v_red.inventory_scope = 'pool' then
    update public.reward_inventory set reserved = reserved - v_red.qty
     where reward_id = v_red.reward_id and store_id is null and reserved >= v_red.qty;
  end if;

  -- Refund the points with an audited compensating entry.
  v_ledger := public.ledger_post_entry(
    v_red.business_id, v_red.customer_membership_id, 'adjust', v_red.points_used,
    'redemption', v_red.id, null,
    'Cancelled redemption ' || v_red.reference || ': ' || trim(p_reason),
    'redemption-cancel:' || v_red.id::text,
    'points.adjusted'
  );
  v_balance := (v_ledger ->> 'balance_after')::integer;

  perform public.write_audit(
    'redemption.cancelled', v_actor, v_actor_role, v_red.business_id, null,
    'redemption', v_red.id::text,
    jsonb_build_object('reference', v_red.reference, 'reason', trim(p_reason),
                       'points_refunded', v_red.points_used,
                       'from_status', 'pending', 'to_status', 'cancelled')
  );

  return jsonb_build_object(
    'redemption_id', v_red.id, 'reference', v_red.reference,
    'points_refunded', v_red.points_used, 'balance_after', v_balance, 'status', 'cancelled'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS — customers see ACTIVE rewards of businesses where they hold an active
-- linked membership (the customer-facing catalogue promised in Slice 3) and
-- their OWN redemptions; staff+ see the business-wide picture. Writes are
-- RPC-only: no DML grants anywhere.
-- ---------------------------------------------------------------------------
alter table public.rewards              enable row level security;
alter table public.reward_inventory     enable row level security;
alter table public.redemptions          enable row level security;
alter table public.redemption_items     enable row level security;
alter table public.redemption_counters  enable row level security;

drop policy if exists "rewards_select_business" on public.rewards;
create policy "rewards_select_business" on public.rewards
  for select to authenticated
  using (business_id in (select * from public.my_businesses('staff')));

drop policy if exists "rewards_select_customer" on public.rewards;
create policy "rewards_select_customer" on public.rewards
  for select to authenticated
  using (
    status = 'active'
    and exists (
      select 1 from public.customer_memberships cm
       where cm.business_id = rewards.business_id
         and cm.profile_id = auth.uid()
         and cm.status = 'active'
    )
  );

drop policy if exists "reward_inventory_select_business" on public.reward_inventory;
create policy "reward_inventory_select_business" on public.reward_inventory
  for select to authenticated
  using (exists (
    select 1 from public.rewards r
     where r.id = reward_inventory.reward_id
       and r.business_id in (select * from public.my_businesses('staff'))
  ));

drop policy if exists "redemptions_select_business" on public.redemptions;
create policy "redemptions_select_business" on public.redemptions
  for select to authenticated
  using (business_id in (select * from public.my_businesses('staff')));

drop policy if exists "redemptions_select_own_customer" on public.redemptions;
create policy "redemptions_select_own_customer" on public.redemptions
  for select to authenticated
  using (exists (
    select 1 from public.customer_memberships cm
     where cm.id = redemptions.customer_membership_id
       and cm.profile_id = auth.uid()
  ));

drop policy if exists "redemption_items_select" on public.redemption_items;
create policy "redemption_items_select" on public.redemption_items
  for select to authenticated
  using (exists (select 1 from public.redemptions rd where rd.id = redemption_items.redemption_id));

-- ---------------------------------------------------------------------------
-- grants — SELECT-only for API roles; all writes flow through the definer
-- RPCs; the reference counter stays invisible.
-- ---------------------------------------------------------------------------
revoke all on public.rewards             from public, anon, authenticated;
revoke all on public.reward_inventory    from public, anon, authenticated;
revoke all on public.redemptions         from public, anon, authenticated;
revoke all on public.redemption_items    from public, anon, authenticated;
revoke all on public.redemption_counters from public, anon, authenticated;

grant select on public.rewards          to authenticated;
grant select on public.reward_inventory to authenticated;
grant select on public.redemptions      to authenticated;
grant select on public.redemption_items to authenticated;

grant execute on function public.create_reward(uuid, text, text, integer, text, text, bigint, text, integer, integer, jsonb) to authenticated;
grant execute on function public.update_reward(uuid, text, text, integer, text, bigint, text, integer, integer, text) to authenticated;
grant execute on function public.set_reward_inventory(uuid, uuid, integer) to authenticated;
grant execute on function public.redeem_reward(uuid, uuid, uuid, integer, text) to authenticated;
grant execute on function public.collect_redemption(uuid, text) to authenticated;
grant execute on function public.cancel_redemption(uuid, text) to authenticated;
revoke execute on function public.create_reward(uuid, text, text, integer, text, text, bigint, text, integer, integer, jsonb) from public, anon;
revoke execute on function public.update_reward(uuid, text, text, integer, text, bigint, text, integer, integer, text) from public, anon;
revoke execute on function public.set_reward_inventory(uuid, uuid, integer) from public, anon;
revoke execute on function public.redeem_reward(uuid, uuid, uuid, integer, text) from public, anon;
revoke execute on function public.collect_redemption(uuid, text) from public, anon;
revoke execute on function public.cancel_redemption(uuid, text) from public, anon;

grant all on public.rewards             to service_role;
grant all on public.reward_inventory    to service_role;
grant all on public.redemptions         to service_role;
grant all on public.redemption_items    to service_role;
grant all on public.redemption_counters to service_role;
