-- ---------------------------------------------------------------------------
-- referrals — a member's own membership number doubles as their referral
-- code (no new identifier to manage). Staff record the link when they enrol
-- the referred walk-in (there is no self-service online enrolment yet — see
-- `enroll_member` call sites), and the bonus is posted automatically, once,
-- the moment the referred member's very first sale is recorded. Nothing here
-- is client-writable except through the RPC and the trigger below.
-- ---------------------------------------------------------------------------

create table if not exists public.referrals (
  id                      uuid primary key default gen_random_uuid(),
  business_id             uuid not null references public.businesses (id) on delete cascade,
  referrer_membership_id  uuid not null references public.customer_memberships (id) on delete cascade,
  referred_membership_id  uuid not null references public.customer_memberships (id) on delete cascade,
  status                  text not null default 'pending' check (status in ('pending', 'completed')),
  bonus_points            integer not null default 200 check (bonus_points >= 0),
  completed_at            timestamptz,
  created_by              uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  constraint referrals_no_self_referral check (referrer_membership_id <> referred_membership_id),
  constraint referrals_completed_fields check ((status = 'completed') = (completed_at is not null))
);

-- One referral credit per referred member, ever.
create unique index if not exists referrals_referred_unique on public.referrals (referred_membership_id);
create index if not exists referrals_referrer_idx on public.referrals (referrer_membership_id);
create index if not exists referrals_business_idx on public.referrals (business_id, status);

alter table public.referrals enable row level security;
alter table public.referrals force row level security;

revoke all on public.referrals from public, anon, authenticated;
grant select on public.referrals to authenticated;

-- SELECT: either side of the referral (as the signed-in customer) or staff+.
drop policy if exists "referrals_select_participant_or_staff" on public.referrals;
create policy "referrals_select_participant_or_staff" on public.referrals
  for select to authenticated
  using (
    public.role_at_least(public.business_role(business_id), 'staff')
    or exists (
      select 1 from public.customer_memberships cm
       where cm.id in (referrer_membership_id, referred_membership_id)
         and cm.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- record_referral — staff+ links a referral code to the member they just
-- enrolled. Re-validates everything server-side: both memberships must be
-- active rows of the SAME business the caller works at, the code must
-- resolve to someone other than the person being enrolled, and a member can
-- only ever be credited as "referred" once (the unique index is the backstop
-- if two staff race on the same enrolment).
-- ---------------------------------------------------------------------------
create or replace function public.record_referral(
  p_business_id            uuid,
  p_referred_membership_id uuid,
  p_referral_code          text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := auth.uid();
  v_role     public.app_role;
  v_referrer record;
  v_referred record;
  v_id       uuid;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  v_role := public.business_role(p_business_id);
  if not public.is_super_admin() and (v_role is null or not public.role_at_least(v_role, 'staff')) then
    raise exception 'not_authorized: staff_only' using errcode = '42501';
  end if;

  select id, business_id into v_referred
    from public.customer_memberships
   where id = p_referred_membership_id and business_id = p_business_id and status = 'active';
  if v_referred.id is null then
    raise exception 'referred_not_found' using errcode = '22023';
  end if;

  select id into v_referrer
    from public.customer_memberships
   where business_id = p_business_id
     and status = 'active'
     and upper(membership_no) = upper(trim(coalesce(p_referral_code, '')));
  if v_referrer.id is null then
    raise exception 'referral_code_not_found' using errcode = '22023';
  end if;
  if v_referrer.id = v_referred.id then
    raise exception 'cannot_refer_self' using errcode = '22023';
  end if;

  if exists (select 1 from public.referrals where referred_membership_id = v_referred.id) then
    raise exception 'already_referred' using errcode = '22023';
  end if;

  insert into public.referrals (business_id, referrer_membership_id, referred_membership_id, created_by)
  values (p_business_id, v_referrer.id, v_referred.id, v_actor)
  returning id into v_id;

  perform public.write_audit(
    'referral.recorded', v_actor, v_role, p_business_id, null,
    'referral', v_id::text,
    jsonb_build_object('referrer_membership_id', v_referrer.id, 'referred_membership_id', v_referred.id)
  );

  return jsonb_build_object('referral_id', v_id);
exception
  when unique_violation then
    raise exception 'already_referred' using errcode = '22023';
end $$;

revoke all on function public.record_referral(uuid, uuid, text) from public, anon;
grant execute on function public.record_referral(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- award_referral_bonus_on_first_sale — fires after every sale insert. Awards
-- the referrer's bonus the moment the referred member's first-ever sale
-- lands, then closes the referral out. Idempotency key + the unique index
-- above both guard against a double award if this ever somehow ran twice.
-- ---------------------------------------------------------------------------
create or replace function public.award_referral_bonus_on_first_sale()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_referral record;
  v_prior_sales integer;
begin
  if new.customer_membership_id is null or new.status <> 'completed' then
    return new;
  end if;

  select * into v_referral
    from public.referrals
   where referred_membership_id = new.customer_membership_id
     and status = 'pending';
  if v_referral.id is null then
    return new;
  end if;

  select count(*) into v_prior_sales
    from public.sales
   where customer_membership_id = new.customer_membership_id
     and status = 'completed';
  if v_prior_sales <> 1 then
    -- Not their first completed sale (this trigger only fires on INSERT, so
    -- v_prior_sales includes the row just inserted — 1 means "this one").
    return new;
  end if;

  update public.referrals
     set status = 'completed', completed_at = now()
   where id = v_referral.id and status = 'pending';
  if not found then
    return new;
  end if;

  perform public.ledger_post_entry(
    v_referral.business_id, v_referral.referrer_membership_id, 'earn', v_referral.bonus_points,
    'referral', v_referral.id, new.store_id,
    'Referral bonus — a member you referred made their first purchase',
    'referral-bonus:' || v_referral.id::text,
    'points.referral_bonus'
  );

  return new;
end $$;

revoke all on function public.award_referral_bonus_on_first_sale() from public, anon, authenticated;

drop trigger if exists award_referral_bonus_on_first_sale on public.sales;
create trigger award_referral_bonus_on_first_sale
  after insert on public.sales
  for each row execute function public.award_referral_bonus_on_first_sale();
