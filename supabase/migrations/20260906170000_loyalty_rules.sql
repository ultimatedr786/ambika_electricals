-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2 · Step 3 · Slice 6: versioned loyalty rule engine
-- (FINAL_MVP_LAUNCH_COMPLETION.md §4)
--
-- Replaces the hard-coded launch-policy columns `businesses.earn_spend_paise`
-- / `businesses.earn_points` with versioned, server-authoritative rules.
--
-- Shape:
--   loyalty_rules          — the rule *series* per business (identity + type).
--   loyalty_rule_versions  — immutable economics, each with an effective
--                            window. A change never rewrites a version; it
--                            appends the next one and closes the previous.
--
-- Two properties everything else depends on:
--
--   1. **History is frozen.** `sales.loyalty_rule_version_id` and
--      `points_ledger.loyalty_rule_version_id` pin the exact version that
--      priced each transaction, so editing the rule tomorrow can never
--      retroactively change what a member earned yesterday.
--   2. **Versions are content-immutable.** A trigger rejects any UPDATE that
--      touches the economics (`earn_spend_paise`, `earn_points`,
--      `point_value_paise`, `min_spend_paise`, `points_expiry_days`,
--      `effective_from`, `version`). Only `effective_to`, `status` and `notes`
--      may move, and only forward — that is how supersession is expressed.
--
-- Deliberate scope (proposal §"Loyalty rules", trimmed to the MVP):
--   * ONE rule type is implemented: `spend_earn` (₹X eligible spend → Y
--     points). The enum carries the future models (`tier_multiplier`,
--     `category_bonus`, `campaign_bonus`) so the UI can show them as
--     explicitly future rather than half-working controls, but no code path
--     evaluates them and `loyalty_rules.rule_type` is CHECKed to
--     'spend_earn' for now.
--   * One active rule series per business (`code = 'default'`). Multiple
--     concurrent series (per-store or per-category rules) is a later slice —
--     the tables are already keyed for it.
--   * Points expiry stays OFF: `points_expiry_days` is nullable, defaults to
--     null (= never), and is CHECKed to null at launch so nobody can
--     configure an expiry there is no sweeper for.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.loyalty_rule_type as enum
    ('spend_earn', 'tier_multiplier', 'category_bonus', 'campaign_bonus');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.loyalty_rule_version_status as enum
    ('scheduled', 'active', 'superseded');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- loyalty_rules — the series. Cheap identity row; the economics live on the
-- versions. Created by `set_loyalty_rule` (or the backfill below), never by
-- hand: there are no INSERT grants for API roles.
-- ---------------------------------------------------------------------------
create table if not exists public.loyalty_rules (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  code        text not null default 'default',
  name        text not null default 'Standard earning',
  rule_type   public.loyalty_rule_type not null default 'spend_earn',
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,
  constraint loyalty_rules_code_format check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  constraint loyalty_rules_name_len check (length(trim(name)) between 2 and 80),
  -- Launch: only the spend-based model is evaluated anywhere. Widening this
  -- CHECK is a deliberate, reviewed migration — not a config toggle.
  constraint loyalty_rules_launch_type check (rule_type = 'spend_earn'),
  constraint loyalty_rules_unique_code unique (business_id, code)
);

create index if not exists loyalty_rules_business_idx
  on public.loyalty_rules (business_id);

-- ---------------------------------------------------------------------------
-- loyalty_rule_versions — the immutable economics + effective window.
--
-- `effective_to` is exclusive: a version prices a sale when
-- `effective_from <= sold_at < coalesce(effective_to, 'infinity')`.
-- ---------------------------------------------------------------------------
create table if not exists public.loyalty_rule_versions (
  id                uuid primary key default gen_random_uuid(),
  rule_id           uuid not null references public.loyalty_rules (id) on delete cascade,
  -- Denormalized for RLS and cross-tenant safety; kept honest by a trigger.
  business_id       uuid not null references public.businesses (id) on delete cascade,
  version           integer not null check (version >= 1),

  -- Economics. Whole paise / whole points only: money never becomes a float.
  earn_spend_paise  bigint  not null check (earn_spend_paise > 0),
  earn_points       integer not null check (earn_points >= 0),
  point_value_paise integer not null default 10 check (point_value_paise >= 0),
  min_spend_paise   bigint  not null default 0 check (min_spend_paise >= 0),
  -- null = never expires. CHECKed to null for the whole launch (see header).
  points_expiry_days integer check (points_expiry_days is null or points_expiry_days > 0),

  effective_from    timestamptz not null,
  effective_to      timestamptz,
  status            public.loyalty_rule_version_status not null default 'active',
  notes             text,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles (id) on delete set null,

  constraint lrv_window_ordered check (effective_to is null or effective_to > effective_from),
  constraint lrv_notes_len check (notes is null or length(trim(notes)) <= 280),
  constraint lrv_no_expiry_at_launch check (points_expiry_days is null),
  -- Sanity rails on what an owner can configure. ₹1 … ₹1,00,000 per step and
  -- at most 1000 points per step: enough for any real retail policy, tight
  -- enough that a typo cannot mint a fortune.
  constraint lrv_spend_range check (earn_spend_paise between 100 and 10000000),
  constraint lrv_points_range check (earn_points <= 1000),
  constraint lrv_point_value_range check (point_value_paise <= 10000),
  constraint lrv_unique_version unique (rule_id, version)
);

create index if not exists lrv_rule_window_idx
  on public.loyalty_rule_versions (rule_id, effective_from desc);
create index if not exists lrv_business_idx
  on public.loyalty_rule_versions (business_id);

-- Only one open-ended version per rule: the future is unambiguous.
create unique index if not exists lrv_one_open_window
  on public.loyalty_rule_versions (rule_id)
  where effective_to is null;

-- ---------------------------------------------------------------------------
-- integrity triggers
-- ---------------------------------------------------------------------------

-- The denormalized business_id must match the parent rule (same pattern as
-- store_memberships / sale_items).
create or replace function public.lrv_business_consistency()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_business uuid;
begin
  select r.business_id into v_business from public.loyalty_rules r where r.id = new.rule_id;
  if v_business is null then
    raise exception 'loyalty rule % not found', new.rule_id using errcode = '23503';
  end if;
  if new.business_id is distinct from v_business then
    raise exception 'loyalty rule version business mismatch' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists lrv_business_consistency on public.loyalty_rule_versions;
create trigger lrv_business_consistency
  before insert or update on public.loyalty_rule_versions
  for each row execute function public.lrv_business_consistency();

-- Content immutability: a published version's economics can never change.
-- Editing the rule appends a new version; that is the whole point of the
-- slice, and a trigger is the only place it cannot be forgotten.
--
-- Scope note: this guards UPDATE only. Deletion is prevented by grants (API
-- roles have none) rather than by the trigger, because a version must be able
-- to cascade away with its business — a deleted tenant should not leave
-- orphaned configuration behind.
create or replace function public.lrv_content_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.rule_id           is distinct from old.rule_id
     or new.business_id    is distinct from old.business_id
     or new.version        is distinct from old.version
     or new.earn_spend_paise   is distinct from old.earn_spend_paise
     or new.earn_points        is distinct from old.earn_points
     or new.point_value_paise  is distinct from old.point_value_paise
     or new.min_spend_paise    is distinct from old.min_spend_paise
     or new.points_expiry_days is distinct from old.points_expiry_days
     or new.effective_from is distinct from old.effective_from
     or new.created_at     is distinct from old.created_at
  then
    raise exception 'loyalty rule version economics are immutable — create a new version'
      using errcode = '42501';
  end if;

  -- A closed window never reopens or moves.
  if old.effective_to is not null and new.effective_to is distinct from old.effective_to then
    raise exception 'loyalty rule version window already closed' using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists lrv_content_immutable on public.loyalty_rule_versions;
create trigger lrv_content_immutable
  before update on public.loyalty_rule_versions
  for each row execute function public.lrv_content_immutable();

-- ---------------------------------------------------------------------------
-- stamping columns — history keeps the version that priced it.
-- ---------------------------------------------------------------------------
alter table public.sales
  add column if not exists loyalty_rule_version_id uuid
    references public.loyalty_rule_versions (id);

alter table public.points_ledger
  add column if not exists loyalty_rule_version_id uuid
    references public.loyalty_rule_versions (id);

create index if not exists sales_rule_version_idx
  on public.sales (loyalty_rule_version_id)
  where loyalty_rule_version_id is not null;
create index if not exists ledger_rule_version_idx
  on public.points_ledger (loyalty_rule_version_id)
  where loyalty_rule_version_id is not null;

-- ---------------------------------------------------------------------------
-- resolution + evaluation helpers
-- ---------------------------------------------------------------------------

/**
 * The version that prices a transaction at `p_at` for `p_business_id`.
 * SECURITY DEFINER so `create_sale` can resolve it regardless of who is
 * standing at the till, and STABLE so the planner may cache it per statement.
 */
create or replace function public.active_loyalty_rule_version(
  p_business_id uuid,
  p_at          timestamptz default now()
)
returns public.loyalty_rule_versions
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select v.*
    from public.loyalty_rule_versions v
    join public.loyalty_rules r on r.id = v.rule_id
   where r.business_id = p_business_id
     and r.code = 'default'
     and v.effective_from <= p_at
     and (v.effective_to is null or v.effective_to > p_at)
   order by v.effective_from desc, v.version desc
   limit 1;
$$;

/**
 * Points for an eligible amount under a specific version.
 *
 * One implementation, used by `create_sale` and echoed to the browser as a
 * *preview* — the server result is always the one that is stored. Floors on
 * exact paise (no floating point anywhere) and honours the minimum spend.
 */
create or replace function public.loyalty_points_for(
  p_version_id     uuid,
  p_eligible_paise bigint
)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v public.loyalty_rule_versions;
begin
  if p_version_id is null or coalesce(p_eligible_paise, 0) <= 0 then
    return 0;
  end if;
  select * into v from public.loyalty_rule_versions where id = p_version_id;
  if not found or v.earn_points = 0 then
    return 0;
  end if;
  if p_eligible_paise < v.min_spend_paise then
    return 0;
  end if;
  return floor(p_eligible_paise::numeric * v.earn_points / v.earn_spend_paise)::integer;
end $$;

/**
 * Read-side convenience for clients: the current rule as JSON, or null when a
 * business somehow has none. SECURITY INVOKER — RLS decides who may see it.
 */
create or replace function public.current_loyalty_rule(p_business_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'version_id', v.id,
    'rule_id', v.rule_id,
    'business_id', v.business_id,
    'version', v.version,
    'earn_spend_paise', v.earn_spend_paise,
    'earn_points', v.earn_points,
    'point_value_paise', v.point_value_paise,
    'min_spend_paise', v.min_spend_paise,
    'points_expiry_days', v.points_expiry_days,
    'effective_from', v.effective_from,
    'effective_to', v.effective_to,
    'status', v.status,
    'notes', v.notes
  )
  from public.loyalty_rule_versions v
  join public.loyalty_rules r on r.id = v.rule_id
  where r.business_id = p_business_id
    and r.code = 'default'
    and v.effective_from <= now()
    and (v.effective_to is null or v.effective_to > now())
  order by v.effective_from desc, v.version desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- backfill — every existing business gets version 1 carrying exactly the
-- policy it is running today, effective from the day it was created, so all
-- existing history maps onto a real version instead of null.
-- ---------------------------------------------------------------------------
do $$
declare b record;
declare v_rule_id uuid;
declare v_version_id uuid;
begin
  for b in
    select id, created_at, created_by,
           coalesce(earn_spend_paise, 10000) as spend,
           coalesce(earn_points, 10)         as points
      from public.businesses
  loop
    insert into public.loyalty_rules (business_id, code, name, rule_type, created_by)
    values (b.id, 'default', 'Standard earning', 'spend_earn', b.created_by)
    on conflict (business_id, code) do nothing;

    select id into v_rule_id from public.loyalty_rules
     where business_id = b.id and code = 'default';

    if not exists (select 1 from public.loyalty_rule_versions where rule_id = v_rule_id) then
      insert into public.loyalty_rule_versions
        (rule_id, business_id, version, earn_spend_paise, earn_points,
         point_value_paise, min_spend_paise, points_expiry_days,
         effective_from, effective_to, status, notes, created_by)
      values
        (v_rule_id, b.id, 1, b.spend, b.points,
         10, 0, null,
         b.created_at, null, 'active',
         'Launch policy migrated from businesses.earn_* columns', b.created_by)
      returning id into v_version_id;

      -- Freeze existing history onto v1: it was priced by exactly this policy.
      update public.sales
         set loyalty_rule_version_id = v_version_id
       where business_id = b.id and loyalty_rule_version_id is null;

      update public.points_ledger
         set loyalty_rule_version_id = v_version_id
       where business_id = b.id
         and source_type = 'sale'
         and loyalty_rule_version_id is null;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Every new business starts with the launch policy on day one. Without this a
-- freshly signed-up tenant would have no rule and `create_sale` would refuse
-- to price anything — the rule engine has to be self-installing, not an extra
-- onboarding step someone can forget.
-- ---------------------------------------------------------------------------
create or replace function public.install_default_loyalty_rule()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_rule_id uuid;
begin
  insert into public.loyalty_rules (business_id, code, name, rule_type, created_by)
  values (new.id, 'default', 'Standard earning', 'spend_earn', new.created_by)
  on conflict (business_id, code) do nothing
  returning id into v_rule_id;

  if v_rule_id is null then
    select id into v_rule_id from public.loyalty_rules
     where business_id = new.id and code = 'default';
  end if;

  -- Launch policy: ₹100 eligible spend → 10 points, 1 point = ₹0.10, no expiry.
  insert into public.loyalty_rule_versions
    (rule_id, business_id, version, earn_spend_paise, earn_points,
     point_value_paise, min_spend_paise, points_expiry_days,
     effective_from, effective_to, status, notes, created_by)
  select v_rule_id, new.id, 1, 10000, 10, 10, 0, null,
         new.created_at, null, 'active', 'Launch policy', new.created_by
   where not exists (
     select 1 from public.loyalty_rule_versions where rule_id = v_rule_id
   );

  return new;
end $$;

drop trigger if exists businesses_install_loyalty_rule on public.businesses;
create trigger businesses_install_loyalty_rule
  after insert on public.businesses
  for each row execute function public.install_default_loyalty_rule();

-- The hard-coded launch policy is gone: the rule versions are the only source
-- of truth from here on. (Every reader was migrated in the same commit.)
alter table public.businesses drop constraint if exists businesses_earn_spend_positive;
alter table public.businesses drop constraint if exists businesses_earn_points_non_negative;
alter table public.businesses drop column if exists earn_spend_paise;
alter table public.businesses drop column if exists earn_points;

-- ---------------------------------------------------------------------------
-- set_loyalty_rule — owner-only. Appends the next version and closes the
-- current one at the new version's start. Never rewrites, never deletes.
-- ---------------------------------------------------------------------------
create or replace function public.set_loyalty_rule(
  p_business_id       uuid    default null,
  p_earn_spend_paise  bigint  default null,
  p_earn_points       integer default null,
  p_point_value_paise integer default null,
  p_min_spend_paise   bigint  default null,
  p_effective_from    timestamptz default null,
  p_note              text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := auth.uid();
  v_business uuid;
  v_role     public.app_role;
  v_rule_id  uuid;
  v_current  public.loyalty_rule_versions;
  v_from     timestamptz;
  v_next     integer;
  v_id       uuid;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  -- Resolve the business from the caller's own memberships. A client-supplied
  -- id is only ever used to disambiguate between businesses they already own.
  select bm.business_id, bm.role into v_business, v_role
    from public.business_memberships bm
   where bm.profile_id = v_actor
     and bm.status = 'active'
     and (p_business_id is null or bm.business_id = p_business_id)
   order by (bm.role = 'owner') desc
   limit 1;

  if v_business is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_role <> 'owner' then
    raise exception 'not_authorized: owner_only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.businesses b where b.id = v_business and b.status = 'active') then
    raise exception 'business_inactive' using errcode = '22023';
  end if;

  -- Validation. Every failure is explicit and nothing is written.
  if p_earn_spend_paise is null or p_earn_points is null then
    raise exception 'invalid_rule: spend and points are required' using errcode = '22023';
  end if;
  if p_earn_spend_paise < 100 or p_earn_spend_paise > 10000000 then
    raise exception 'invalid_rule: spend threshold must be between ₹1 and ₹1,00,000'
      using errcode = '22023';
  end if;
  if p_earn_points < 0 or p_earn_points > 1000 then
    raise exception 'invalid_rule: points per step must be between 0 and 1000'
      using errcode = '22023';
  end if;
  if coalesce(p_point_value_paise, 10) < 0 or coalesce(p_point_value_paise, 10) > 10000 then
    raise exception 'invalid_rule: point value out of range' using errcode = '22023';
  end if;
  if coalesce(p_min_spend_paise, 0) < 0 then
    raise exception 'invalid_rule: minimum spend cannot be negative' using errcode = '22023';
  end if;

  v_from := coalesce(p_effective_from, now());
  -- Backdating would silently re-price history that is already stamped and
  -- already paid out. Refuse it: corrections are `adjust_points` entries.
  if v_from < now() - interval '1 minute' then
    raise exception 'invalid_rule: effective_from cannot be in the past' using errcode = '22023';
  end if;
  if v_from > now() + interval '365 days' then
    raise exception 'invalid_rule: effective_from is too far in the future' using errcode = '22023';
  end if;

  select id into v_rule_id from public.loyalty_rules
   where business_id = v_business and code = 'default';
  if v_rule_id is null then
    insert into public.loyalty_rules (business_id, code, name, rule_type, created_by)
    values (v_business, 'default', 'Standard earning', 'spend_earn', v_actor)
    returning id into v_rule_id;
  end if;

  -- Lock the series so two owners cannot append version N twice.
  perform 1 from public.loyalty_rules where id = v_rule_id for update;

  select * into v_current
    from public.loyalty_rule_versions
   where rule_id = v_rule_id and effective_to is null
   order by version desc
   limit 1;

  select coalesce(max(version), 0) + 1 into v_next
    from public.loyalty_rule_versions where rule_id = v_rule_id;

  if v_current.id is not null then
    if v_from <= v_current.effective_from then
      raise exception 'invalid_rule: a newer version must start after the current one'
        using errcode = '22023';
    end if;
    update public.loyalty_rule_versions
       set effective_to = v_from,
           status = 'superseded'
     where id = v_current.id;
  end if;

  insert into public.loyalty_rule_versions
    (rule_id, business_id, version, earn_spend_paise, earn_points,
     point_value_paise, min_spend_paise, points_expiry_days,
     effective_from, effective_to, status, notes, created_by)
  values
    (v_rule_id, v_business, v_next, p_earn_spend_paise, p_earn_points,
     coalesce(p_point_value_paise, 10), coalesce(p_min_spend_paise, 0), null,
     v_from, null,
     (case when v_from > now() then 'scheduled' else 'active' end)::public.loyalty_rule_version_status,
     nullif(trim(coalesce(p_note, '')), ''), v_actor)
  returning id into v_id;

  perform public.write_audit(
    'loyalty_rule.version_created', v_actor, v_role, v_business, null,
    'loyalty_rule_version', v_id::text,
    jsonb_build_object(
      'version', v_next,
      'previous_version', v_current.version,
      'earn_spend_paise', p_earn_spend_paise,
      'earn_points', p_earn_points,
      'point_value_paise', coalesce(p_point_value_paise, 10),
      'min_spend_paise', coalesce(p_min_spend_paise, 0),
      'effective_from', v_from,
      'from', case when v_current.id is null then null else jsonb_build_object(
        'earn_spend_paise', v_current.earn_spend_paise,
        'earn_points', v_current.earn_points,
        'point_value_paise', v_current.point_value_paise,
        'min_spend_paise', v_current.min_spend_paise
      ) end
    )
  );

  return jsonb_build_object(
    'version_id', v_id,
    'rule_id', v_rule_id,
    'version', v_next,
    'earn_spend_paise', p_earn_spend_paise,
    'earn_points', p_earn_points,
    'point_value_paise', coalesce(p_point_value_paise, 10),
    'min_spend_paise', coalesce(p_min_spend_paise, 0),
    'points_expiry_days', null,
    'effective_from', v_from,
    'status', case when v_from > now() then 'scheduled' else 'active' end,
    'superseded_version', v_current.version
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- ledger_post_entry v2 — same contract, one addition: every entry that refers
-- to a sale inherits that sale's pinned rule version.
--
-- Doing it here rather than in `create_sale` means the void reversal picks the
-- stamp up for free, and the append-only trigger on `points_ledger` is never
-- fought with an after-the-fact UPDATE (there is none — the value is set on
-- the INSERT).
-- ---------------------------------------------------------------------------
create or replace function public.ledger_post_entry(
  p_business_id   uuid,
  p_membership_id uuid,
  p_entry_type    public.ledger_entry_type,
  p_points        integer,
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
  v_actor       uuid := auth.uid();
  v_balance     record;
  v_new_balance int;
  v_entry_id    bigint;
  v_rule_version uuid;
begin
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
  end loop;

  v_new_balance := v_balance.current_points + p_points;
  if v_new_balance < 0 then
    raise exception 'insufficient_points: balance % cannot cover % points',
      v_balance.current_points, abs(p_points)
      using errcode = '22023';
  end if;

  -- Inherit the sale's rule version when this entry is about a sale (earn) or
  -- about voiding one (the compensating adjust carries the sale id too).
  if p_source_id is not null then
    select s.loyalty_rule_version_id into v_rule_version
      from public.sales s where s.id = p_source_id;
  end if;

  insert into public.points_ledger
    (business_id, customer_membership_id, entry_type, points, balance_after,
     source_type, source_id, store_id, actor_profile_id, reason, idempotency_key,
     loyalty_rule_version_id)
  values
    (p_business_id, p_membership_id, p_entry_type, p_points, v_new_balance,
     p_source_type, p_source_id, p_store_id, v_actor, p_reason, p_idem_key,
     v_rule_version)
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
      'reason', p_reason,
      'loyalty_rule_version_id', v_rule_version
    )
  );

  return jsonb_build_object(
    'entry_id', v_entry_id,
    'balance_after', v_new_balance,
    'replayed', false
  );
end;
$$;

revoke execute on function public.ledger_post_entry(uuid, uuid, public.ledger_entry_type, integer, text, uuid, uuid, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_sale v3 — byte-for-byte the Slice-3 function except for the points
-- step: the rate now comes from the resolved rule version instead of the
-- dropped `businesses.earn_*` columns, and that version id is stamped on the
-- sale (and, through ledger_post_entry, on the ledger entry).
--
-- Re-pricing, stock validation, invoice numbering, payment validation,
-- idempotency and the lock order are deliberately untouched.
-- ---------------------------------------------------------------------------
create or replace function public.create_sale(
  p_store_id               uuid,
  p_items                  jsonb,
  p_payments               jsonb,
  p_customer_membership_id uuid   default null,
  p_discount_paise         bigint default 0,
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
  v_store_record record;
  v_scoped       boolean;
  v_existing     record;
  v_item         record;
  v_pay          record;
  v_prod         record;
  v_stock_line   record;
  v_inv          record;
  v_lines        jsonb := '[]'::jsonb;
  v_name         text;
  v_sku          text;
  v_price        bigint;
  v_overridden   boolean;
  v_subtotal     bigint := 0;
  v_line_total   bigint;
  v_total        bigint;
  v_discount     bigint := coalesce(p_discount_paise, 0);
  v_base_points  integer := 0;
  v_rule         public.loyalty_rule_versions;
  v_counter      bigint;
  v_invoice      text;
  v_sale_id      uuid;
  v_pay_sum      bigint := 0;
  v_ledger       jsonb;
  v_balance      integer := null;
  v_item_count   integer := 0;
  v_stock_lines  integer := 0;
  v_overrides    integer := 0;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  -- 1. Store → business, authorization + store scoping (fail closed).
  select s.business_id into v_store_record from public.stores s where s.id = p_store_id;
  if not found then
    raise exception 'store_not_found' using errcode = 'P0002';
  end if;
  v_business := v_store_record.business_id;

  v_actor_role := public.business_role(v_business);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'staff') then
    raise exception 'not_authorized: only business staff can record sales' using errcode = '42501';
  end if;
  if not public.role_at_least(v_actor_role, 'manager') then
    select exists (select 1 from public.my_stores()) into v_scoped;
    if v_scoped and not public.is_store_assigned(p_store_id) then
      raise exception 'store_forbidden: store-scoped staff cannot sell outside their stores'
        using errcode = '42501';
    end if;
  end if;

  if not exists (select 1 from public.businesses b where b.id = v_business and b.status = 'active') then
    raise exception 'business_inactive' using errcode = '22023';
  end if;

  -- 2. Idempotent replay.
  if p_idempotency_key is not null then
    select sa.id, sa.invoice_no, sa.subtotal_paise, sa.discount_paise, sa.total_paise,
           sa.base_points, sa.bonus_points, sa.total_points, sa.customer_membership_id
      into v_existing
      from public.sales sa
     where sa.business_id = v_business and sa.idempotency_key = p_idempotency_key;
    if found then
      select (l.balance_after) into v_balance
        from public.points_ledger l
       where l.business_id = v_business and l.idempotency_key = 'sale:' || v_existing.id;
      return jsonb_build_object(
        'sale_id', v_existing.id, 'invoice_no', v_existing.invoice_no,
        'subtotal_paise', v_existing.subtotal_paise, 'discount_paise', v_existing.discount_paise,
        'total_paise', v_existing.total_paise,
        'points', jsonb_build_object('base', v_existing.base_points, 'bonus', v_existing.bonus_points, 'total', v_existing.total_points),
        'balance_after', v_balance, 'replayed', true
      );
    end if;
  end if;

  -- 3. Member validation (when not a walk-in).
  if p_customer_membership_id is not null and not exists (
    select 1 from public.customer_memberships cm
     where cm.id = p_customer_membership_id and cm.business_id = v_business and cm.status = 'active'
  ) then
    raise exception 'customer_not_found: no active membership % in this business', p_customer_membership_id
      using errcode = '22023';
  end if;

  -- 4. Validate + price line items server-side. Catalogue lines are priced
  --    from products.price_paise; a differing client price is refused unless
  --    the caller is manager+ (flagged price_overridden, audited below).
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items_required: a sale needs at least one line' using errcode = '22023';
  end if;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(
      product_id uuid, name text, sku text, qty numeric,
      unit_price_paise bigint, line_discount_paise bigint
    )
  loop
    v_item_count := v_item_count + 1;
    if v_item.qty is null or v_item.qty <= 0 then
      raise exception 'invalid_item: line % (%) needs qty > 0', v_item_count, coalesce(v_item.name, '?')
        using errcode = '22023';
    end if;

    v_overridden := false;
    if v_item.product_id is not null then
      -- Catalogue-backed line: the products row is authoritative.
      select p.name, p.sku, p.price_paise, p.status into v_prod
        from public.products p
       where p.id = v_item.product_id and p.business_id = v_business;
      if not found then
        raise exception 'product_not_found: line % references a product outside this catalogue', v_item_count
          using errcode = '22023';
      end if;
      if v_prod.status <> 'active' then
        raise exception 'product_archived: line % (%) is archived', v_item_count, v_prod.name
          using errcode = '22023';
      end if;
      v_name := v_prod.name;
      v_sku  := v_prod.sku;
      v_price := v_prod.price_paise;
      if v_item.unit_price_paise is not null and v_item.unit_price_paise <> v_prod.price_paise then
        if public.role_at_least(v_actor_role, 'manager') then
          v_price := v_item.unit_price_paise;
          v_overridden := true;
          v_overrides := v_overrides + 1;
        else
          raise exception 'price_override_forbidden: line % (%) sent % but the catalogue price is % — only managers can override',
            v_item_count, v_prod.name, v_item.unit_price_paise, v_prod.price_paise
            using errcode = '22023';
        end if;
      end if;
      if v_item.qty <> trunc(v_item.qty) then
        raise exception 'invalid_item: catalogue line % (%) needs whole units', v_item_count, v_prod.name
          using errcode = '22023';
      end if;
    else
      -- Snapshot line (until every POS line is catalogue-backed).
      if v_item.name is null or length(trim(v_item.name)) = 0 then
        raise exception 'invalid_item: line % has no name', v_item_count using errcode = '22023';
      end if;
      if v_item.unit_price_paise is null or v_item.unit_price_paise < 0 then
        raise exception 'invalid_item: line % (%) needs a non-negative unit price', v_item_count, v_item.name
          using errcode = '22023';
      end if;
      v_name := trim(v_item.name);
      v_sku  := v_item.sku;
      v_price := v_item.unit_price_paise;
    end if;

    v_line_total := (round(v_item.qty * v_price) - coalesce(v_item.line_discount_paise, 0))::bigint;
    if v_line_total < 0 then
      raise exception 'invalid_item: line % (%) discount exceeds its gross', v_item_count, v_name
        using errcode = '22023';
    end if;
    v_subtotal := v_subtotal + v_line_total;

    v_lines := v_lines || jsonb_build_object(
      'product_id', v_item.product_id, 'sku', v_sku, 'name', v_name,
      'qty', v_item.qty, 'unit_price_paise', v_price,
      'line_discount_paise', coalesce(v_item.line_discount_paise, 0),
      'price_overridden', v_overridden
    );
  end loop;

  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'discount_exceeds_subtotal' using errcode = '22023';
  end if;
  v_total := v_subtotal - v_discount;  -- tax stays 0 until GST slice

  -- 5. Payments must cover the total exactly.
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'payments_required' using errcode = '22023';
  end if;
  for v_pay in
    select * from jsonb_to_recordset(p_payments) as y(method text, amount_paise bigint, reference text)
  loop
    if v_pay.amount_paise is null or v_pay.amount_paise <= 0 then
      raise exception 'invalid_payment: amounts must be positive' using errcode = '22023';
    end if;
    begin
      perform v_pay.method::public.payment_method;
    exception when invalid_text_representation then
      raise exception 'invalid_payment_method: %', v_pay.method using errcode = '22023';
    end;
    v_pay_sum := v_pay_sum + v_pay.amount_paise;
  end loop;
  if v_pay_sum <> v_total then
    raise exception 'payment_mismatch: payments % do not equal total %', v_pay_sum, v_total
      using errcode = '22023';
  end if;

  -- 6. Lock in deterministic order (§8.1 step 3): customer balance row →
  --    inventory rows ordered by product_id → invoice counter (step 8).
  if p_customer_membership_id is not null then
    insert into public.customer_points_balance (customer_membership_id, business_id)
    values (p_customer_membership_id, v_business)
    on conflict (customer_membership_id) do nothing;
    perform 1 from public.customer_points_balance cpb
     where cpb.customer_membership_id = p_customer_membership_id for update;
  end if;

  for v_stock_line in
    select (l.product_id)::uuid as product_id, sum(l.qty)::integer as units
      from jsonb_to_recordset(v_lines) as l(product_id uuid, qty numeric)
     where l.product_id is not null
     group by l.product_id
     order by l.product_id
  loop
    insert into public.inventory_by_store (product_id, store_id, on_hand)
    values (v_stock_line.product_id, p_store_id, 0)
    on conflict (product_id, store_id) do nothing;

    select ibs.on_hand, ibs.reserved into v_inv
      from public.inventory_by_store ibs
     where ibs.product_id = v_stock_line.product_id and ibs.store_id = p_store_id
       for update;

    if v_inv.on_hand - v_inv.reserved < v_stock_line.units then
      select p.name into v_name from public.products p where p.id = v_stock_line.product_id;
      raise exception 'insufficient_stock: % — need %, have % at this store',
        coalesce(v_name, v_stock_line.product_id::text), v_stock_line.units,
        v_inv.on_hand - v_inv.reserved
        using errcode = '22023';
    end if;
    v_stock_lines := v_stock_lines + 1;
  end loop;

  -- 7. Points — from the rule version in force *right now*. Resolved once and
  --    pinned to the sale below, so tomorrow's rule change can never re-price
  --    what was earned today.
  v_rule := public.active_loyalty_rule_version(v_business, now());
  if v_rule.id is null then
    raise exception 'loyalty_rule_missing' using errcode = '22023';
  end if;
  if p_customer_membership_id is not null then
    v_base_points := public.loyalty_points_for(v_rule.id, v_total);
  end if;

  -- 8. Invoice counter (locked row per business).
  insert into public.invoice_counters (business_id) values (v_business)
    on conflict (business_id) do nothing;
  select ic.next_seq into v_counter from public.invoice_counters ic
   where ic.business_id = v_business for update;
  update public.invoice_counters set next_seq = next_seq + 1 where business_id = v_business;
  v_invoice := 'INV-' || lpad(v_counter::text, 6, '0');

  -- 9. Write the sale.
  insert into public.sales
    (business_id, store_id, customer_membership_id, invoice_no,
     subtotal_paise, discount_paise, tax_paise, total_paise,
     base_points, bonus_points, total_points, sold_by_profile_id, idempotency_key,
     loyalty_rule_version_id)
  values
    (v_business, p_store_id, p_customer_membership_id, v_invoice,
     v_subtotal, v_discount, 0, v_total,
     v_base_points, 0, v_base_points, v_actor, p_idempotency_key,
     v_rule.id)
  returning id into v_sale_id;

  for v_item in
    select * from jsonb_to_recordset(v_lines) as x(
      product_id uuid, sku text, name text, qty numeric,
      unit_price_paise bigint, line_discount_paise bigint, price_overridden boolean
    )
  loop
    insert into public.sale_items
      (sale_id, product_id, sku_snapshot, name_snapshot, qty,
       unit_price_paise, line_discount_paise, line_total_paise, price_overridden)
    values
      (v_sale_id, v_item.product_id, v_item.sku, v_item.name, v_item.qty,
       v_item.unit_price_paise, v_item.line_discount_paise,
       (round(v_item.qty * v_item.unit_price_paise) - v_item.line_discount_paise)::bigint,
       coalesce(v_item.price_overridden, false));
  end loop;

  for v_pay in
    select * from jsonb_to_recordset(p_payments) as y(method text, amount_paise bigint, reference text)
  loop
    insert into public.sale_payments (sale_id, method, amount_paise, reference)
    values (v_sale_id, v_pay.method::public.payment_method, v_pay.amount_paise, v_pay.reference);
  end loop;

  -- 9b. Decrement stock for catalogue lines (rows already locked in step 6).
  for v_stock_line in
    select (l.product_id)::uuid as product_id, sum(l.qty)::integer as units
      from jsonb_to_recordset(v_lines) as l(product_id uuid, qty numeric)
     where l.product_id is not null
     group by l.product_id
  loop
    perform public.inventory_move(
      v_business, p_store_id, v_stock_line.product_id, -v_stock_line.units,
      'sale', 'sale', v_sale_id, 'Sale ' || v_invoice,
      'sale-stock:' || v_sale_id::text || ':' || v_stock_line.product_id::text,
      v_actor
    );
  end loop;

  -- 10. Ledger earn (Slice 1 internals; idempotent on the sale id).
  if v_base_points > 0 then
    v_ledger := public.ledger_post_entry(
      v_business, p_customer_membership_id, 'earn', v_base_points,
      'sale', v_sale_id, p_store_id, 'Sale ' || v_invoice, 'sale:' || v_sale_id::text,
      'points.awarded'
    );
    v_balance := (v_ledger ->> 'balance_after')::integer;
  end if;

  -- 11. Audit + response.
  perform public.write_audit(
    'sale.created', v_actor, v_actor_role, v_business, p_store_id,
    'sale', v_sale_id::text,
    jsonb_build_object(
      'invoice_no', v_invoice, 'total_paise', v_total,
      'points', v_base_points, 'membership', p_customer_membership_id,
      'stock_lines', v_stock_lines, 'price_overrides', v_overrides,
      'loyalty_rule_version', v_rule.version, 'loyalty_rule_version_id', v_rule.id
    )
  );

  return jsonb_build_object(
    'sale_id', v_sale_id, 'invoice_no', v_invoice,
    'subtotal_paise', v_subtotal, 'discount_paise', v_discount, 'total_paise', v_total,
    'points', jsonb_build_object('base', v_base_points, 'bonus', 0, 'total', v_base_points),
    'balance_after', v_balance, 'replayed', false,
    'stock_lines', v_stock_lines, 'price_overrides', v_overrides,
    'loyalty_rule_version_id', v_rule.id, 'loyalty_rule_version', v_rule.version
  );
exception when unique_violation then
  -- Lost an idempotency race — replay the winner.
  if p_idempotency_key is not null then
    select sa.id, sa.invoice_no, sa.subtotal_paise, sa.discount_paise, sa.total_paise,
           sa.base_points, sa.bonus_points, sa.total_points
      into v_existing
      from public.sales sa
     where sa.business_id = v_business and sa.idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'sale_id', v_existing.id, 'invoice_no', v_existing.invoice_no,
        'subtotal_paise', v_existing.subtotal_paise, 'discount_paise', v_existing.discount_paise,
        'total_paise', v_existing.total_paise,
        'points', jsonb_build_object('base', v_existing.base_points, 'bonus', v_existing.bonus_points, 'total', v_existing.total_points),
        'balance_after', null, 'replayed', true
      );
    end if;
  end if;
  raise;
end;
$$;


-- ---------------------------------------------------------------------------
-- RLS — rules are configuration, not secrets: staff+ read their business's
-- rules, and customers may see the *current* earning policy of a business
-- they belong to (it is printed on the wall anyway). Writes are RPC-only.
-- ---------------------------------------------------------------------------
alter table public.loyalty_rules         enable row level security;
alter table public.loyalty_rule_versions enable row level security;

drop policy if exists "loyalty_rules_select_business" on public.loyalty_rules;
create policy "loyalty_rules_select_business" on public.loyalty_rules
  for select to authenticated
  using (
    business_id in (select * from public.my_businesses('staff'))
    or exists (
      select 1 from public.customer_memberships cm
       where cm.business_id = loyalty_rules.business_id
         and cm.profile_id = auth.uid()
         and cm.status = 'active'
    )
  );

drop policy if exists "loyalty_rule_versions_select_business" on public.loyalty_rule_versions;
create policy "loyalty_rule_versions_select_business" on public.loyalty_rule_versions
  for select to authenticated
  using (
    business_id in (select * from public.my_businesses('staff'))
    or (
      -- Customers see only the version that is in force right now, never the
      -- history of what the business used to pay out.
      effective_from <= now()
      and (effective_to is null or effective_to > now())
      and exists (
        select 1 from public.customer_memberships cm
         where cm.business_id = loyalty_rule_versions.business_id
           and cm.profile_id = auth.uid()
           and cm.status = 'active'
      )
    )
  );

-- ---------------------------------------------------------------------------
-- grants — read-only for API roles; every write goes through set_loyalty_rule.
-- ---------------------------------------------------------------------------
revoke all on public.loyalty_rules         from public, anon, authenticated;
revoke all on public.loyalty_rule_versions from public, anon, authenticated;

grant select on public.loyalty_rules         to authenticated;
grant select on public.loyalty_rule_versions to authenticated;

grant all on public.loyalty_rules         to service_role;
grant all on public.loyalty_rule_versions to service_role;

grant execute on function public.set_loyalty_rule(uuid, bigint, integer, integer, bigint, timestamptz, text)
  to authenticated;
revoke execute on function public.set_loyalty_rule(uuid, bigint, integer, integer, bigint, timestamptz, text)
  from public, anon;

grant execute on function public.current_loyalty_rule(uuid) to authenticated;
revoke execute on function public.current_loyalty_rule(uuid) from public, anon;

-- Internal helpers: the sale RPC calls them, clients never do.
revoke execute on function public.active_loyalty_rule_version(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.loyalty_points_for(uuid, bigint) to authenticated;
revoke execute on function public.loyalty_points_for(uuid, bigint) from public, anon;

comment on table public.loyalty_rules is
  'Loyalty rule series per business (launch: one spend_earn series, code=default).';
comment on table public.loyalty_rule_versions is
  'Immutable rule economics with effective windows. Sales/ledger rows pin the version that priced them.';
