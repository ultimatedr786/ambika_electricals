-- ============================================================================
-- Phase 2 Step 2 · Stage D — Row Level Security (fail-closed)
--
-- Principles implemented here (spec §Stage D):
--   * RLS enabled on EVERY application table. Nothing is public by default.
--   * A user reads/updates only their own profile, and only safe columns
--     (email/status changes are not grantable to the user role at all).
--   * Customers see only their own customer membership (and later loyalty
--     records) — never another customer's, never business data.
--   * Owners manage their own business, stores, staff and customer directory.
--   * Managers get scoped management, never owner-only controls.
--   * Staff reach only their assigned stores and their business's customer
--     lookup — never business settings or staff management.
--   * Tenant isolation: every policy keys off auth.uid() (signed JWT), so
--     manipulated browser identifiers cannot widen access.
--   * Mutation of memberships/invitations/audit happens ONLY through the
--     SECURITY DEFINER RPCs from the previous migration (no direct grants).
--   * anon receives no table grants and matches no policy.
--
-- Proven by: supabase/tests/rls_policy_tests.sql (pgTAP, `supabase test db`)
-- and scripts/rls-check (plain-SQL harness runnable on any PostgreSQL).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS on every application table
-- ---------------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.businesses            enable row level security;
alter table public.stores                enable row level security;
alter table public.business_memberships  enable row level security;
alter table public.store_memberships     enable row level security;
alter table public.customer_memberships  enable row level security;
alter table public.invitations           enable row level security;
alter table public.audit_logs            enable row level security;

-- ---------------------------------------------------------------------------
-- Grants — fail-closed baseline, then the narrowest useful privilege set.
-- Where no grant exists, the operation is impossible regardless of policies
-- (e.g. no role may DELETE memberships directly, nobody may write audit logs
-- directly, and profile email/status columns are not user-updatable).
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

revoke all on all tables in schema public from public;
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

-- Future tables (later vertical slices) must opt in explicitly — mirrors the
-- fail-closed convention instead of inheriting platform-wide exposure.
alter default privileges for role postgres in schema public revoke all on tables from public, anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

-- profiles: read own + peers; update only SAFE columns of own row.
grant select on public.profiles to authenticated;
grant update (display_name, phone, avatar_url, avatar_meta, updated_at) on public.profiles to authenticated;

-- businesses: members read; owners update. Creation only via RPC.
grant select, update on public.businesses to authenticated;

-- stores: read per policy; owners create/update. Soft-close via is_active.
grant select, insert, update on public.stores to authenticated;

-- memberships: read-only over the API; all writes via audited RPCs.
grant select on public.business_memberships to authenticated;
grant select on public.store_memberships to authenticated;

-- customer directory: business-side enrollment/edits per policy; customers
-- only ever see their own row (policy).
grant select, insert, update on public.customer_memberships to authenticated;

-- invitations: read per policy; create/accept/revoke only via RPCs.
grant select on public.invitations to authenticated;

-- audit: owners read their business trail; nobody writes/updates/deletes.
grant select on public.audit_logs to authenticated;

-- service role (trusted server ops & scripts only — never in a browser
-- bundle): full access, bypasses RLS by platform design.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to service_role;

-- Functions: strip PUBLIC/anon/authenticated defaults, then re-grant exactly
-- the helpers and RPCs the signed-in user role needs.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;

grant execute on function public.role_rank(public.app_role) to authenticated;
grant execute on function public.role_at_least(public.app_role, public.app_role) to authenticated;
grant execute on function public.business_role(uuid) to authenticated;
grant execute on function public.my_businesses(public.app_role) to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_store_assigned(uuid) to authenticated;
grant execute on function public.my_stores() to authenticated;
grant execute on function public.shares_business_with(uuid, public.app_role) to authenticated;
grant execute on function public.shares_store_with(uuid) to authenticated;

grant execute on function public.create_invitation(uuid, text, public.app_role, uuid, int) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.change_member_role(uuid, uuid, public.app_role) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.assign_member_to_store(uuid, uuid) to authenticated;
grant execute on function public.unassign_member_from_store(uuid, uuid) to authenticated;
grant execute on function public.complete_business_signup(text, text, text, text, text, text) to authenticated;

-- write_audit stays internal: executable only by the owner (definer RPCs)
-- and the service role.
grant execute on function public.write_audit(text, uuid, public.app_role, uuid, uuid, text, text, jsonb) to service_role;
grant execute on all functions in schema public to service_role;

-- ---------------------------------------------------------------------------
-- policies — profiles
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_select_business_peers" on public.profiles;
create policy "profiles_select_business_peers" on public.profiles
  for select to authenticated
  using (public.shares_business_with(id, 'manager'));

drop policy if exists "profiles_select_store_peers" on public.profiles;
create policy "profiles_select_store_peers" on public.profiles
  for select to authenticated
  using (public.shares_store_with(id));

-- Own row only; column grant limits WHICH fields may change (safe fields).
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- policies — businesses
-- ---------------------------------------------------------------------------
drop policy if exists "businesses_select_member" on public.businesses;
create policy "businesses_select_member" on public.businesses
  for select to authenticated
  using (id in (select * from public.my_businesses('staff')));

drop policy if exists "businesses_update_owner" on public.businesses;
create policy "businesses_update_owner" on public.businesses
  for update to authenticated
  using (id in (select * from public.my_businesses('owner')))
  with check (id in (select * from public.my_businesses('owner')));

-- ---------------------------------------------------------------------------
-- policies — stores
-- Manager/owner: all stores of their business. Staff: only assigned stores.
-- ---------------------------------------------------------------------------
drop policy if exists "stores_select_scoped" on public.stores;
create policy "stores_select_scoped" on public.stores
  for select to authenticated
  using (
    business_id in (select * from public.my_businesses('manager'))
    or public.is_store_assigned(id)
  );

drop policy if exists "stores_insert_owner" on public.stores;
create policy "stores_insert_owner" on public.stores
  for insert to authenticated
  with check (business_id in (select * from public.my_businesses('owner')));

drop policy if exists "stores_update_owner" on public.stores;
create policy "stores_update_owner" on public.stores
  for update to authenticated
  using (business_id in (select * from public.my_businesses('owner')))
  with check (business_id in (select * from public.my_businesses('owner')));

-- ---------------------------------------------------------------------------
-- policies — business_memberships / store_memberships (read-only over API)
-- ---------------------------------------------------------------------------
drop policy if exists "business_memberships_select_own" on public.business_memberships;
create policy "business_memberships_select_own" on public.business_memberships
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists "business_memberships_select_management" on public.business_memberships;
create policy "business_memberships_select_management" on public.business_memberships
  for select to authenticated
  using (business_id in (select * from public.my_businesses('manager')));

drop policy if exists "store_memberships_select_own" on public.store_memberships;
create policy "store_memberships_select_own" on public.store_memberships
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists "store_memberships_select_management" on public.store_memberships;
create policy "store_memberships_select_management" on public.store_memberships
  for select to authenticated
  using (business_id in (select * from public.my_businesses('manager')));

-- ---------------------------------------------------------------------------
-- policies — customer_memberships
-- Customers: own row only. Business side: staff+ read the directory (POS
-- lookup), staff+ enroll (insert), manager+ edit. Status flips are limited to
-- manager+ by the update policy.
-- ---------------------------------------------------------------------------
drop policy if exists "customer_memberships_select_own" on public.customer_memberships;
create policy "customer_memberships_select_own" on public.customer_memberships
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists "customer_memberships_select_business" on public.customer_memberships;
create policy "customer_memberships_select_business" on public.customer_memberships
  for select to authenticated
  using (business_id in (select * from public.my_businesses('staff')));

drop policy if exists "customer_memberships_insert_business" on public.customer_memberships;
create policy "customer_memberships_insert_business" on public.customer_memberships
  for insert to authenticated
  with check (business_id in (select * from public.my_businesses('staff')));

drop policy if exists "customer_memberships_update_management" on public.customer_memberships;
create policy "customer_memberships_update_management" on public.customer_memberships
  for update to authenticated
  using (business_id in (select * from public.my_businesses('manager')))
  with check (business_id in (select * from public.my_businesses('manager')));

-- ---------------------------------------------------------------------------
-- policies — invitations
-- Owners manage their business' invitations; an invited address may see its
-- own PENDING invitation (to render context on the accept page). Tokens are
-- hash-only, so reading a row never leaks acceptance ability.
-- ---------------------------------------------------------------------------
drop policy if exists "invitations_select_owner" on public.invitations;
create policy "invitations_select_owner" on public.invitations
  for select to authenticated
  using (business_id in (select * from public.my_businesses('owner')));

drop policy if exists "invitations_select_invitee" on public.invitations;
create policy "invitations_select_invitee" on public.invitations
  for select to authenticated
  using (
    status = 'pending'
    and lower(email) = lower(coalesce((select p.email from public.profiles p where p.id = auth.uid()), ''))
  );

-- ---------------------------------------------------------------------------
-- policies — audit_logs (read: owners of the business; write: RPCs only)
-- ---------------------------------------------------------------------------
drop policy if exists "audit_logs_select_owner" on public.audit_logs;
create policy "audit_logs_select_owner" on public.audit_logs
  for select to authenticated
  using (
    business_id in (select * from public.my_businesses('owner'))
    or (business_id is null and public.is_super_admin())
  );

-- ---------------------------------------------------------------------------
-- Deliberate omissions (documented decisions):
--   * No DELETE policies/grants anywhere — lifecycle is expressed through
--     status flags (businesses.status, stores.is_active, memberships.status).
--   * No INSERT policy on profiles — rows exist only via the auth trigger.
--   * Realtime publication membership is NOT added for these tables: nothing
--     in this step broadcasts auth/tenancy data; realtime authorization is
--     designed with its own vertical slice.
--   * Storage buckets: none yet (product image migration is a later slice).
-- ---------------------------------------------------------------------------
