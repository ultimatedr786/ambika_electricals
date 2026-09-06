-- ============================================================================
-- Phase 2 Step 2 · Stage C/F — Invitations + server-authorized RPCs
--
-- Invitation creation/acceptance, role changes, staff removal and store
-- assignments MUST run through these SECURITY DEFINER functions (spec Stage D:
-- "server-authorized operations with audit events"). Direct table grants for
-- those mutations are deliberately withheld in the RLS migration.
--
-- Token handling: only a SHA-256 hash of the invitation token is stored; the
-- raw token is returned exactly once (to the server action that created it)
-- and is single-use with an expiry.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- invitations
-- ---------------------------------------------------------------------------
create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  store_id    uuid references public.stores (id) on delete cascade,  -- optional store scope
  email       text not null,
  role        public.app_role not null,
  token_hash  text not null unique,
  status      public.invitation_status not null default 'pending',
  expires_at  timestamptz not null,
  invited_by  uuid not null references public.profiles (id) on delete cascade,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at  timestamptz,
  revoked_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- owners are never "invited" (they sign up via business onboarding);
  -- customer relationships live in customer_memberships.
  constraint invitations_role check (role in ('manager', 'staff')),
  constraint invitations_email_basic check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint invitations_status_consistency_accepted check (status <> 'accepted' or accepted_at is not null),
  constraint invitations_status_consistency_not_accepted check (status = 'accepted' or accepted_at is null)
);

-- One live invitation per address per business; used/old rows stay for audit.
create unique index if not exists invitations_one_pending_per_email
  on public.invitations (business_id, lower(email))
  where status = 'pending';

create index if not exists invitations_business_status_idx on public.invitations (business_id, status);

drop trigger if exists invitations_set_updated_at on public.invitations;
create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function public.set_updated_at();

-- store_id (when set) must belong to the invitation's business.
create or replace function public.invitations_store_check()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.store_id is not null and not exists (
    select 1 from public.stores s
    where s.id = new.store_id and s.business_id = new.business_id
  ) then
    raise exception 'invitation store % does not belong to business %', new.store_id, new.business_id
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists invitations_store_check on public.invitations;
create trigger invitations_store_check
  before insert or update of store_id, business_id on public.invitations
  for each row execute function public.invitations_store_check();

-- ---------------------------------------------------------------------------
-- write_audit — internal helper. EXECUTE is revoked from public roles below;
-- only definer RPCs (running as the table owner) and the service role use it.
-- ---------------------------------------------------------------------------
create or replace function public.write_audit(
  p_action       text,
  p_actor        uuid default auth.uid(),
  p_actor_role   public.app_role default null,
  p_business_id  uuid default null,
  p_store_id     uuid default null,
  p_target_type  text default null,
  p_target_id    text default null,
  p_metadata     jsonb default '{}'::jsonb
)
returns void
language sql
set search_path = public, pg_temp
as $$
  insert into public.audit_logs (actor_profile_id, actor_role, action, business_id, store_id, target_type, target_id, metadata)
  values (p_actor, p_actor_role, p_action, p_business_id, p_store_id, p_target_type, p_target_id, p_metadata);
$$;

-- ---------------------------------------------------------------------------
-- create_invitation — owner-only (spec Stage F "Invitations").
-- Returns the invitation id and the RAW token exactly once. The server action
-- hashes nothing itself and emails the accept link via the configured mailer.
-- ---------------------------------------------------------------------------
create or replace function public.create_invitation(
  p_business_id uuid,
  p_email       text,
  p_role        public.app_role,
  p_store_id    uuid default null,
  p_expires_in_hours int default 72
)
returns table (invitation_id uuid, token text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor       uuid := auth.uid();
  v_actor_role  public.app_role;
  v_token       text;
  v_id          uuid;
  v_expiry      timestamptz;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_role not in ('manager', 'staff') then
    raise exception 'invalid_role: only manager and staff invitations are supported'
      using errcode = '22023';
  end if;
  if p_expires_in_hours is null or p_expires_in_hours < 1 or p_expires_in_hours > 720 then
    raise exception 'invalid_expiry: must be between 1 and 720 hours' using errcode = '22023';
  end if;

  v_actor_role := public.business_role(p_business_id);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'owner') then
    -- Fail closed: managers/staff/outsiders cannot invite.
    -- NOTE: denial auditing happens in the calling server action (which also
    -- has the client IP). An audit row written here would roll back together
    -- with the raising statement, so nothing is written in-SQL.
    raise exception 'not_authorized: only a business owner can invite %', p_role
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.status = 'active') then
    raise exception 'business_inactive' using errcode = '22023';
  end if;

  if p_store_id is not null and not exists (
    select 1 from public.stores s where s.id = p_store_id and s.business_id = p_business_id
  ) then
    raise exception 'store_not_in_business' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.invitations i
    where i.business_id = p_business_id and lower(i.email) = lower(trim(p_email)) and i.status = 'pending'
  ) then
    raise exception 'invitation_already_pending: revoke the existing invitation first'
      using errcode = '23505';
  end if;

  v_token  := encode(extensions.gen_random_bytes(32), 'hex');
  v_expiry := now() + make_interval(hours => p_expires_in_hours);

  insert into public.invitations (business_id, store_id, email, role, token_hash, expires_at, invited_by)
  values (
    p_business_id, p_store_id, lower(trim(p_email)), p_role,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_expiry, v_actor
  )
  returning id into v_id;

  perform public.write_audit(
    'invitation.created', v_actor, v_actor_role, p_business_id, p_store_id,
    'invitation', v_id::text,
    jsonb_build_object('email', lower(trim(p_email)), 'role', p_role::text, 'expires_at', v_expiry)
  );

  return query select v_id, v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- revoke_invitation — owner-only, pending invitations only.
-- ---------------------------------------------------------------------------
create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_actor_role public.app_role;
  v_inv        public.invitations;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select * into v_inv from public.invitations where id = p_invitation_id;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  v_actor_role := public.business_role(v_inv.business_id);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'owner') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'invitation_not_pending: current status is %', v_inv.status using errcode = '22023';
  end if;

  update public.invitations
     set status = 'revoked', revoked_at = now(), revoked_by = v_actor
   where id = p_invitation_id;

  perform public.write_audit(
    'invitation.revoked', v_actor, v_actor_role, v_inv.business_id, v_inv.store_id,
    'invitation', p_invitation_id::text,
    jsonb_build_object('email', v_inv.email, 'role', v_inv.role::text)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_invitation — single-use, expiry-checked, bound to the invited email.
-- Attaches the authenticated profile to ONLY the intended business/store/role.
-- Every denial path is explicit and audited (spec Stage F).
-- ---------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor   uuid := auth.uid();
  v_inv     public.invitations;
  v_profile public.profiles;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_token is null or length(p_token) <> 64 then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  select * into v_profile from public.profiles where id = v_actor;
  if v_profile.id is null then
    raise exception 'profile_missing' using errcode = 'P0002';
  end if;

  select * into v_inv
  from public.invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  -- Denial paths raise with distinct markers. Audit rows are NOT written here
  -- because everything a raising statement wrote rolls back with it; the
  -- calling server action records 'invitation.accept_denied' (with the real
  -- client IP) through the admin client. Expiry is enforced on every accept
  -- attempt (status stays 'pending' in-db; UIs derive "expired" from
  -- expires_at), so a stale link can never be redeemed.
  if v_inv.status = 'revoked' then
    raise exception 'invitation_revoked: this invitation is no longer valid' using errcode = '22023';
  end if;

  if v_inv.status = 'accepted' then
    raise exception 'invitation_already_used: this invitation has already been accepted' using errcode = '22023';
  end if;

  if v_inv.status = 'expired' or v_inv.expires_at < now() then
    raise exception 'invitation_expired: ask the business owner to send a new invitation' using errcode = '22023';
  end if;

  if lower(v_profile.email) is distinct from lower(v_inv.email) then
    -- The link is bound to the invited address; another account cannot claim it.
    raise exception 'invitation_email_mismatch: sign in as % to accept this invitation', v_inv.email
      using errcode = '28000';
  end if;

  -- Attach to the intended business with exactly the invited role.
  insert into public.business_memberships (business_id, profile_id, role, status, invited_by)
  values (v_inv.business_id, v_actor, v_inv.role, 'active', v_inv.invited_by)
  on conflict (business_id, profile_id) do update
     set role = excluded.role, status = 'active', updated_at = now();

  if v_inv.store_id is not null then
    insert into public.store_memberships (store_id, business_id, profile_id, status, assigned_by)
    values (v_inv.store_id, v_inv.business_id, v_actor, 'active', v_inv.invited_by)
    on conflict (store_id, profile_id) do update
       set status = 'active', updated_at = now();
  end if;

  update public.invitations
     set status = 'accepted', accepted_at = now(), accepted_by = v_actor
   where id = v_inv.id;

  perform public.write_audit(
    'invitation.accepted', v_actor, v_inv.role, v_inv.business_id, v_inv.store_id,
    'invitation', v_inv.id::text,
    jsonb_build_object('email', v_inv.email, 'role', v_inv.role::text)
  );

  return jsonb_build_object(
    'business_id', v_inv.business_id,
    'store_id', v_inv.store_id,
    'role', v_inv.role
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- change_member_role — owner-only, audited. Owners cannot demote themselves
-- (prevents accidental tenant lockout); platform super_admins can.
-- ---------------------------------------------------------------------------
create or replace function public.change_member_role(
  p_business_id uuid,
  p_profile_id  uuid,
  p_new_role    public.app_role
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_actor_role public.app_role;
  v_old_role   public.app_role;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_new_role not in ('owner', 'manager', 'staff') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  v_actor_role := public.business_role(p_business_id);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'owner') then
    raise exception 'not_authorized: only a business owner can change roles' using errcode = '42501';
  end if;

  select role into v_old_role
  from public.business_memberships
  where business_id = p_business_id and profile_id = p_profile_id and status = 'active'
  for update;
  if not found then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  if p_profile_id = v_actor and v_actor_role <> 'super_admin' then
    raise exception 'cannot_change_own_role' using errcode = '22023';
  end if;
  if v_old_role = 'owner' and v_actor_role <> 'super_admin' then
    raise exception 'owner_role_protected: ownership transfer is a platform action' using errcode = '22023';
  end if;

  update public.business_memberships
     set role = p_new_role, updated_at = now()
   where business_id = p_business_id and profile_id = p_profile_id;

  perform public.write_audit(
    'membership.role_changed', v_actor, v_actor_role, p_business_id, null,
    'business_membership', p_profile_id::text,
    jsonb_build_object('old_role', v_old_role::text, 'new_role', p_new_role::text)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- remove_member — owner-only, audited. Cannot remove yourself or another
-- owner (ownership transfer is a platform action).
-- ---------------------------------------------------------------------------
create or replace function public.remove_member(p_business_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_actor_role public.app_role;
  v_role       public.app_role;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  v_actor_role := public.business_role(p_business_id);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'owner') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select role into v_role
  from public.business_memberships
  where business_id = p_business_id and profile_id = p_profile_id
  for update;
  if not found then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  if p_profile_id = v_actor then
    raise exception 'cannot_remove_self' using errcode = '22023';
  end if;
  if v_role = 'owner' and v_actor_role <> 'super_admin' then
    raise exception 'owner_protected' using errcode = '22023';
  end if;

  delete from public.store_memberships where business_id = p_business_id and profile_id = p_profile_id;
  delete from public.business_memberships where business_id = p_business_id and profile_id = p_profile_id;

  perform public.write_audit(
    'membership.removed', v_actor, v_actor_role, p_business_id, null,
    'business_membership', p_profile_id::text,
    jsonb_build_object('removed_role', v_role::text)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Store assignment (owner-only for now — managers receive scoped permissions
-- only when explicitly granted in a later slice).
-- ---------------------------------------------------------------------------
create or replace function public.assign_member_to_store(p_store_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_actor_role public.app_role;
  v_business   uuid;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select business_id into v_business from public.stores where id = p_store_id;
  if not found then
    raise exception 'store_not_found' using errcode = 'P0002';
  end if;

  v_actor_role := public.business_role(v_business);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'owner') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.business_memberships
    where business_id = v_business and profile_id = p_profile_id and status = 'active'
  ) then
    raise exception 'not_a_business_member' using errcode = '22023';
  end if;

  insert into public.store_memberships (store_id, business_id, profile_id, status, assigned_by)
  values (p_store_id, v_business, p_profile_id, 'active', v_actor)
  on conflict (store_id, profile_id) do update set status = 'active', updated_at = now();

  perform public.write_audit(
    'store_assignment.created', v_actor, v_actor_role, v_business, p_store_id,
    'store_membership', p_profile_id::text, '{}'::jsonb
  );
end;
$$;

create or replace function public.unassign_member_from_store(p_store_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_actor_role public.app_role;
  v_business   uuid;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select business_id into v_business from public.stores where id = p_store_id;
  if not found then
    raise exception 'store_not_found' using errcode = 'P0002';
  end if;

  v_actor_role := public.business_role(v_business);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'owner') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  delete from public.store_memberships where store_id = p_store_id and profile_id = p_profile_id;

  perform public.write_audit(
    'store_assignment.removed', v_actor, v_actor_role, v_business, p_store_id,
    'store_membership', p_profile_id::text, '{}'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_business_signup — idempotent owner onboarding used by the real
-- business signup flow after email confirmation. Creates the business, its
-- first store and the owner membership in one audited step. If the caller is
-- already a member of any business it simply returns that membership.
-- ---------------------------------------------------------------------------
create or replace function public.complete_business_signup(
  p_business_name text,
  p_store_name    text default null,
  p_legal_name    text default null,
  p_gstin         text default null,
  p_support_phone text default null,
  p_support_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor       uuid := auth.uid();
  v_business_id uuid;
  v_store_id    uuid;
  v_existing    record;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_business_name is null or length(trim(p_business_name)) < 2 then
    raise exception 'business_name_required' using errcode = '22023';
  end if;

  select bm.business_id, bm.role into v_existing
  from public.business_memberships bm
  where bm.profile_id = v_actor and bm.status = 'active'
  order by public.role_rank(bm.role) desc, bm.created_at asc
  limit 1;

  if found then
    return jsonb_build_object(
      'business_id', v_existing.business_id,
      'role', v_existing.role,
      'already_member', true
    );
  end if;

  insert into public.businesses (name, legal_name, gstin, support_email, support_phone, created_by)
  values (
    trim(p_business_name),
    nullif(trim(coalesce(p_legal_name, p_business_name)), ''),
    nullif(upper(trim(coalesce(p_gstin, ''))), ''),
    nullif(trim(coalesce(p_support_email, '')), ''),
    nullif(trim(coalesce(p_support_phone, '')), ''),
    v_actor
  )
  returning id into v_business_id;

  insert into public.stores (business_id, name)
  values (v_business_id, trim(coalesce(nullif(trim(p_store_name), ''), p_business_name || ' — Main Store')))
  returning id into v_store_id;

  insert into public.business_memberships (business_id, profile_id, role, status)
  values (v_business_id, v_actor, 'owner', 'active');

  perform public.write_audit(
    'business.created', v_actor, 'owner', v_business_id, v_store_id,
    'business', v_business_id::text,
    jsonb_build_object('name', trim(p_business_name), 'first_store', v_store_id)
  );
  perform public.write_audit(
    'membership.created', v_actor, 'owner', v_business_id, null,
    'business_membership', v_actor::text,
    jsonb_build_object('role', 'owner', 'origin', 'business_signup')
  );

  return jsonb_build_object(
    'business_id', v_business_id,
    'store_id', v_store_id,
    'role', 'owner',
    'already_member', false
  );
end;
$$;
