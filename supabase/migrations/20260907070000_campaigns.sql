-- ---------------------------------------------------------------------------
-- campaigns — targeted point offers/announcements a business publishes.
--
-- Deliberately a messaging record, not a pricing engine: `audience` and
-- `reward` are free-text descriptions the manager writes (matching the
-- wizard's "3X points on Lighting" / "Lapsed members (60+ days)" style
-- templates), not machine-enforced filters or multipliers — the real earn
-- rate stays whatever the loyalty rule engine says it is (§ tier/category
-- bonuses remain explicitly future work). Because there is no real
-- attribution mechanism (no campaign_id on sales, no way to mechanically
-- decide who is "in" a free-text audience), `reach` is the one honestly
-- computable number — the business's active member count — and redemptions/
-- revenue are correctly reported as zero rather than invented.
-- ---------------------------------------------------------------------------

create table if not exists public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null,
  description text,
  audience    text not null,
  reward      text not null,
  status      text not null default 'draft' check (status in ('draft', 'scheduled', 'active', 'ended')),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint campaigns_name_len check (length(trim(name)) between 2 and 120),
  constraint campaigns_window check (ends_at > starts_at)
);

create index if not exists campaigns_business_status_idx on public.campaigns (business_id, status);

alter table public.campaigns enable row level security;
alter table public.campaigns force row level security;

revoke all on public.campaigns from public, anon, authenticated;
grant select on public.campaigns to authenticated;

-- Staff+ see every campaign of their business; customers only ever see the
-- ones currently live — a draft is a business's own unpublished idea.
drop policy if exists "campaigns_select_staff_or_active_member" on public.campaigns;
create policy "campaigns_select_staff_or_active_member" on public.campaigns
  for select to authenticated
  using (
    public.role_at_least(public.business_role(business_id), 'staff')
    or (
      status = 'active'
      and exists (
        select 1 from public.customer_memberships cm
         where cm.business_id = campaigns.business_id and cm.profile_id = auth.uid() and cm.status = 'active'
      )
    )
  );

create or replace function public.create_campaign(
  p_business_id uuid,
  p_name        text,
  p_description text,
  p_audience    text,
  p_reward      text,
  p_status      text,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz
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
  if p_status not in ('draft', 'active') then
    raise exception 'invalid_status: campaigns can only be created as draft or active' using errcode = '22023';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'invalid_window' using errcode = '22023';
  end if;

  insert into public.campaigns (business_id, name, description, audience, reward, status, starts_at, ends_at, created_by)
  values (p_business_id, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_audience, p_reward, p_status, p_starts_at, p_ends_at, v_actor)
  returning id into v_id;

  perform public.write_audit('campaign.created', v_actor, v_role, p_business_id, null, 'campaign', v_id::text,
    jsonb_build_object('name', p_name, 'status', p_status, 'audience', p_audience));

  return jsonb_build_object('campaign_id', v_id);
end $$;

create or replace function public.set_campaign_status(p_campaign_id uuid, p_status text)
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
  if p_status not in ('draft', 'scheduled', 'active', 'ended') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  select business_id into v_biz from public.campaigns where id = p_campaign_id;
  if v_biz is null then
    raise exception 'campaign_not_found' using errcode = '22023';
  end if;
  v_role := public.business_role(v_biz);
  if not public.is_super_admin() and (v_role is null or not public.role_at_least(v_role, 'manager')) then
    raise exception 'not_authorized: manager_only' using errcode = '42501';
  end if;
  update public.campaigns set status = p_status, updated_at = now() where id = p_campaign_id;
  perform public.write_audit('campaign.status_changed', v_actor, v_role, v_biz, null, 'campaign', p_campaign_id::text,
    jsonb_build_object('status', p_status));
end $$;

revoke all on function public.create_campaign(uuid, text, text, text, text, text, timestamptz, timestamptz) from public, anon;
revoke all on function public.set_campaign_status(uuid, text) from public, anon;
grant execute on function public.create_campaign(uuid, text, text, text, text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.set_campaign_status(uuid, text) to authenticated;
