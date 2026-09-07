-- ---------------------------------------------------------------------------
-- challenges — gamified goals staff publish, computed against the same real
-- sales/sale_items/referrals data everywhere else in the app already writes.
-- There is no separate "progress" table to keep in sync: progress is always
-- computed on demand from the ledger of truth, and a completion is recorded
-- (once, ever, per member) only when that computation crosses the target —
-- so a member can never be short-changed or double-paid by a stale cache.
-- ---------------------------------------------------------------------------

alter table public.points_ledger drop constraint if exists ledger_source_type_known;
alter table public.points_ledger add constraint ledger_source_type_known check (
  source_type in ('sale','redemption','manual','welcome','referral','birthday','campaign','adjustment','import','challenge')
);

create table if not exists public.challenges (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  name          text not null,
  description   text,
  unit          text not null check (unit in ('purchases', 'products', 'categories', '₹ spent', 'referrals')),
  target        numeric not null check (target > 0),
  reward_points integer not null check (reward_points >= 0),
  starts_at     timestamptz not null default now(),
  ends_at       timestamptz not null,
  status        text not null default 'active' check (status in ('active', 'completed')),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint challenges_name_len check (length(trim(name)) between 2 and 120),
  constraint challenges_window check (ends_at > starts_at)
);

create index if not exists challenges_business_status_idx on public.challenges (business_id, status);

create table if not exists public.challenge_completions (
  id                      uuid primary key default gen_random_uuid(),
  challenge_id            uuid not null references public.challenges (id) on delete cascade,
  customer_membership_id  uuid not null references public.customer_memberships (id) on delete cascade,
  points_awarded          integer not null check (points_awarded >= 0),
  completed_at            timestamptz not null default now(),
  constraint challenge_completions_unique unique (challenge_id, customer_membership_id)
);

create index if not exists challenge_completions_member_idx on public.challenge_completions (customer_membership_id);

alter table public.challenges enable row level security;
alter table public.challenges force row level security;
alter table public.challenge_completions enable row level security;
alter table public.challenge_completions force row level security;

revoke all on public.challenges from public, anon, authenticated;
revoke all on public.challenge_completions from public, anon, authenticated;
grant select on public.challenges to authenticated;
grant select on public.challenge_completions to authenticated;

drop policy if exists "challenges_select_staff_or_member" on public.challenges;
create policy "challenges_select_staff_or_member" on public.challenges
  for select to authenticated
  using (
    public.role_at_least(public.business_role(business_id), 'staff')
    or exists (
      select 1 from public.customer_memberships cm
       where cm.business_id = challenges.business_id and cm.profile_id = auth.uid() and cm.status = 'active'
    )
  );

drop policy if exists "challenge_completions_select_own_or_staff" on public.challenge_completions;
create policy "challenge_completions_select_own_or_staff" on public.challenge_completions
  for select to authenticated
  using (
    exists (
      select 1 from public.challenges c
       where c.id = challenge_completions.challenge_id
         and public.role_at_least(public.business_role(c.business_id), 'staff')
    )
    or exists (
      select 1 from public.customer_memberships cm
       where cm.id = challenge_completions.customer_membership_id and cm.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- create_challenge / end_challenge — manager+ (challenges sit alongside
-- rewards & campaigns in the manager's remit, same as elsewhere in the app).
-- ---------------------------------------------------------------------------
create or replace function public.create_challenge(
  p_business_id   uuid,
  p_name          text,
  p_description   text,
  p_unit          text,
  p_target        numeric,
  p_reward_points integer,
  p_ends_at       timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role  public.app_role;
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  v_role := public.business_role(p_business_id);
  if not public.is_super_admin() and (v_role is null or not public.role_at_least(v_role, 'manager')) then
    raise exception 'not_authorized: manager_only' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_ends_at <= now() then
    raise exception 'invalid_end_date' using errcode = '22023';
  end if;

  insert into public.challenges (business_id, name, description, unit, target, reward_points, ends_at, created_by)
  values (p_business_id, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_unit, p_target, p_reward_points, p_ends_at, v_actor)
  returning id into v_id;

  perform public.write_audit('challenge.created', v_actor, v_role, p_business_id, null, 'challenge', v_id::text,
    jsonb_build_object('name', p_name, 'unit', p_unit, 'target', p_target, 'reward_points', p_reward_points));

  return jsonb_build_object('challenge_id', v_id);
end $$;

create or replace function public.end_challenge(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_biz   uuid;
  v_role  public.app_role;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  select business_id into v_biz from public.challenges where id = p_challenge_id;
  if v_biz is null then
    raise exception 'challenge_not_found' using errcode = '22023';
  end if;
  v_role := public.business_role(v_biz);
  if not public.is_super_admin() and (v_role is null or not public.role_at_least(v_role, 'manager')) then
    raise exception 'not_authorized: manager_only' using errcode = '42501';
  end if;
  update public.challenges set status = 'completed' where id = p_challenge_id;
  perform public.write_audit('challenge.ended', v_actor, v_role, v_biz, null, 'challenge', p_challenge_id::text, '{}'::jsonb);
end $$;

revoke all on function public.create_challenge(uuid, text, text, text, numeric, integer, timestamptz) from public, anon;
revoke all on function public.end_challenge(uuid) from public, anon;
grant execute on function public.create_challenge(uuid, text, text, text, numeric, integer, timestamptz) to authenticated;
grant execute on function public.end_challenge(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- challenge_progress — the single source of truth for "how far along is this
-- member", computed fresh every time from sales/sale_items/referrals. Never
-- cached, so it can never drift from what actually happened.
-- ---------------------------------------------------------------------------
create or replace function public.challenge_progress(p_challenge_id uuid, p_membership_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ch record;
  v_progress numeric;
begin
  select * into v_ch from public.challenges where id = p_challenge_id;
  if v_ch.id is null then
    return 0;
  end if;

  if v_ch.unit = 'purchases' then
    select count(*) into v_progress from public.sales
     where customer_membership_id = p_membership_id and status = 'completed'
       and sold_at >= v_ch.starts_at and sold_at < v_ch.ends_at;
  elsif v_ch.unit = '₹ spent' then
    select coalesce(sum(total_paise), 0) / 100.0 into v_progress from public.sales
     where customer_membership_id = p_membership_id and status = 'completed'
       and sold_at >= v_ch.starts_at and sold_at < v_ch.ends_at;
  elsif v_ch.unit = 'products' then
    select coalesce(sum(si.qty), 0) into v_progress
      from public.sale_items si join public.sales s on s.id = si.sale_id
     where s.customer_membership_id = p_membership_id and s.status = 'completed'
       and s.sold_at >= v_ch.starts_at and s.sold_at < v_ch.ends_at;
  elsif v_ch.unit = 'categories' then
    select count(distinct p.category) into v_progress
      from public.sale_items si
      join public.sales s on s.id = si.sale_id
      join public.products p on p.id = si.product_id
     where s.customer_membership_id = p_membership_id and s.status = 'completed'
       and s.sold_at >= v_ch.starts_at and s.sold_at < v_ch.ends_at
       and p.category is not null;
  elsif v_ch.unit = 'referrals' then
    select count(*) into v_progress from public.referrals
     where referrer_membership_id = p_membership_id and status = 'completed'
       and completed_at >= v_ch.starts_at and completed_at < v_ch.ends_at;
  else
    v_progress := 0;
  end if;

  return coalesce(v_progress, 0);
end $$;

revoke all on function public.challenge_progress(uuid, uuid) from public, anon;
grant execute on function public.challenge_progress(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- check_and_award_challenges — fired after any event that could move a
-- member's progress (a completed sale, a completed referral). Awards each
-- challenge's points at most once per member: the unique index on
-- challenge_completions is the hard backstop if two events race.
-- ---------------------------------------------------------------------------
create or replace function public.check_and_award_challenges(p_business_id uuid, p_membership_id uuid, p_store_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ch record;
  v_progress numeric;
begin
  if p_membership_id is null then
    return;
  end if;
  for v_ch in
    select * from public.challenges
     where business_id = p_business_id and status = 'active' and now() < ends_at
  loop
    if exists (
      select 1 from public.challenge_completions cc
       where cc.challenge_id = v_ch.id and cc.customer_membership_id = p_membership_id
    ) then
      continue;
    end if;
    v_progress := public.challenge_progress(v_ch.id, p_membership_id);
    if v_progress < v_ch.target then
      continue;
    end if;
    begin
      insert into public.challenge_completions (challenge_id, customer_membership_id, points_awarded)
      values (v_ch.id, p_membership_id, v_ch.reward_points);
    exception when unique_violation then
      continue;
    end;
    if v_ch.reward_points > 0 then
      perform public.ledger_post_entry(
        p_business_id, p_membership_id, 'earn', v_ch.reward_points,
        'challenge', v_ch.id, p_store_id,
        'Challenge completed — ' || v_ch.name,
        'challenge-bonus:' || v_ch.id::text || ':' || p_membership_id::text,
        'points.challenge_bonus'
      );
    end if;
  end loop;
end $$;

revoke all on function public.check_and_award_challenges(uuid, uuid, uuid) from public, anon, authenticated;

-- Deliberately NOT a trigger on `sales`: an AFTER INSERT ROW trigger there
-- fires the instant the `sales` row lands, which is BEFORE create_sale has
-- inserted that same sale's `sale_items` — so a 'products' or 'categories'
-- challenge would see the wrong (short) total for the sale that just
-- happened. Instead, create_sale itself is redefined below to call
-- check_and_award_challenges once everything about the sale — items,
-- payments, stock, the earn-ledger entry — has actually landed.

create or replace function public.check_challenges_on_referral()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'completed' and (old.status is distinct from new.status) then
    perform public.check_and_award_challenges(new.business_id, new.referrer_membership_id, null);
  end if;
  return new;
end $$;

revoke all on function public.check_challenges_on_referral() from public, anon, authenticated;

drop trigger if exists check_challenges_on_referral on public.referrals;
create trigger check_challenges_on_referral
  after update on public.referrals
  for each row execute function public.check_challenges_on_referral();

-- ---------------------------------------------------------------------------
-- my_challenges — the customer-facing read: every challenge visible to one
-- of the caller's own active memberships, with that membership's own live
-- progress and completion state folded in. One round trip for the whole page.
-- ---------------------------------------------------------------------------
create or replace function public.my_challenges()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_out   jsonb := '[]'::jsonb;
  v_row   record;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  for v_row in
    select c.id, c.name, c.description, c.unit, c.target, c.reward_points, c.starts_at, c.ends_at, c.status,
           cm.id as membership_id,
           (cc.id is not null) as completed
      from public.customer_memberships cm
      join public.challenges c on c.business_id = cm.business_id
      left join public.challenge_completions cc on cc.challenge_id = c.id and cc.customer_membership_id = cm.id
     where cm.profile_id = v_actor and cm.status = 'active'
     order by c.status asc, c.ends_at asc
  loop
    v_out := v_out || jsonb_build_object(
      'id', v_row.id, 'name', v_row.name, 'description', v_row.description,
      'unit', v_row.unit, 'target', v_row.target, 'rewardPoints', v_row.reward_points,
      'endsAt', v_row.ends_at, 'status', v_row.status, 'completed', v_row.completed,
      'progress', public.challenge_progress(v_row.id, v_row.membership_id)
    );
  end loop;

  return v_out;
end $$;

revoke all on function public.my_challenges() from public, anon;
grant execute on function public.my_challenges() to authenticated;

-- ---------------------------------------------------------------------------
-- list_business_challenges — the staff-facing read: every challenge for one
-- business, with real participant/average-progress stats computed across its
-- active membership base.
-- ---------------------------------------------------------------------------
create or replace function public.list_business_challenges(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role  public.app_role;
  v_out   jsonb := '[]'::jsonb;
  v_ch    record;
  v_mem   record;
  v_participants integer;
  v_progress_sum numeric;
  v_progress     numeric;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  v_role := public.business_role(p_business_id);
  if not public.is_super_admin() and (v_role is null or not public.role_at_least(v_role, 'staff')) then
    raise exception 'not_authorized: staff_only' using errcode = '42501';
  end if;

  for v_ch in select * from public.challenges where business_id = p_business_id order by created_at desc loop
    v_participants := 0;
    v_progress_sum := 0;
    for v_mem in select id from public.customer_memberships where business_id = p_business_id and status = 'active' loop
      v_progress := public.challenge_progress(v_ch.id, v_mem.id);
      if v_progress > 0 then
        v_participants := v_participants + 1;
        v_progress_sum := v_progress_sum + least(1, v_progress / v_ch.target);
      end if;
    end loop;
    v_out := v_out || jsonb_build_object(
      'id', v_ch.id, 'name', v_ch.name, 'description', v_ch.description,
      'unit', v_ch.unit, 'target', v_ch.target, 'rewardPoints', v_ch.reward_points,
      'endsAt', v_ch.ends_at, 'status', case when v_ch.status = 'completed' or v_ch.ends_at <= now() then 'completed' else 'active' end,
      'participants', v_participants,
      'averageProgressPercent', case when v_participants > 0 then round((v_progress_sum / v_participants) * 100) else 0 end,
      'completions', (select count(*) from public.challenge_completions where challenge_id = v_ch.id)
    );
  end loop;

  return v_out;
end $$;

revoke all on function public.list_business_challenges(uuid) from public, anon;
grant execute on function public.list_business_challenges(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- create_sale — redefined only to add step 10b (the challenge check) after
-- the sale's items, stock and earn-ledger entry have all landed. Every other
-- line is byte-for-byte identical to the version this replaces
-- (20260907020000_reject_points_as_sale_payment.sql).
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
  v_pay_method   public.payment_method;
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
      v_pay_method := v_pay.method::public.payment_method;
    exception when invalid_text_representation then
      raise exception 'invalid_payment_method: %', v_pay.method using errcode = '22023';
    end;
    if v_pay_method = 'points' then
      raise exception 'invalid_payment_method: points is not a supported sale payment method — redeem a reward instead'
        using errcode = '22023';
    end if;
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

  -- 10b. Challenges — checked only now that items, stock and the earn entry
  -- have all landed, so a 'products'/'categories' challenge sees this sale's
  -- true total rather than whatever existed before it.
  if p_customer_membership_id is not null then
    perform public.check_and_award_challenges(v_business, p_customer_membership_id, p_store_id);
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
