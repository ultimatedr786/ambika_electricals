-- ---------------------------------------------------------------------------
-- wishlist_items — a customer's saved rewards for later (Step 3 follow-up).
--
-- Writes go through add_to_wishlist / remove_from_wishlist rather than a
-- direct table grant, matching this project's rule that every table besides
-- profiles and customer_memberships is RPC-only. Each RPC re-checks that the
-- caller owns the row AND currently holds an active membership in that
-- business AND the reward is still one that business shows — so a stale or
-- forged reward_id/business_id combination is rejected by the database
-- itself, never trusted from the client.
-- ---------------------------------------------------------------------------

create table if not exists public.wishlist_items (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  reward_id   uuid not null references public.rewards (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint wishlist_items_unique unique (profile_id, reward_id)
);

create index if not exists wishlist_items_profile_idx on public.wishlist_items (profile_id);
create index if not exists wishlist_items_business_idx on public.wishlist_items (business_id);

alter table public.wishlist_items enable row level security;
alter table public.wishlist_items force row level security;

revoke all on public.wishlist_items from public, anon, authenticated;
grant select on public.wishlist_items to authenticated;

drop policy if exists "wishlist_items_select_own" on public.wishlist_items;
create policy "wishlist_items_select_own" on public.wishlist_items
  for select to authenticated
  using (profile_id = auth.uid());

create or replace function public.add_to_wishlist(p_business_id uuid, p_reward_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.customer_memberships cm
     where cm.business_id = p_business_id and cm.profile_id = v_actor and cm.status = 'active'
  ) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.rewards r where r.id = p_reward_id and r.business_id = p_business_id and r.status = 'active'
  ) then
    raise exception 'reward_not_found' using errcode = '22023';
  end if;

  insert into public.wishlist_items (profile_id, business_id, reward_id)
  values (v_actor, p_business_id, p_reward_id)
  on conflict (profile_id, reward_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.wishlist_items where profile_id = v_actor and reward_id = p_reward_id;
  end if;

  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.remove_from_wishlist(p_reward_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  delete from public.wishlist_items where profile_id = auth.uid() and reward_id = p_reward_id;
end $$;

revoke all on function public.add_to_wishlist(uuid, uuid) from public, anon;
revoke all on function public.remove_from_wishlist(uuid) from public, anon;
grant execute on function public.add_to_wishlist(uuid, uuid) to authenticated;
grant execute on function public.remove_from_wishlist(uuid) to authenticated;
