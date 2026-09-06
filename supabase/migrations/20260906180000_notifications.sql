-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2 · Step 3 · Slice 7: persistent, tenant-scoped in-app notifications
-- (FINAL_MVP_LAUNCH_COMPLETION.md §5)
--
-- Two tables, deliberately:
--
--   notifications       — the EVENT. One row per thing that happened, shared
--                         by everyone entitled to see it.
--   notification_reads  — the per-recipient READ STATE. One row per
--                         (notification, profile).
--
-- Splitting them is what makes "syncs across the user's authorized sessions"
-- work without lying to anyone: a low-stock alert is one event that three
-- cashiers each read independently, and a single boolean on the event row
-- could not represent that. It also means marking something read is an INSERT
-- of your own row — never an UPDATE of shared state — so two sessions racing
-- cannot clobber each other.
--
-- Emission is by TRIGGER, not by editing the eleven RPCs that cause these
-- events. That is a deliberate choice:
--
--   * a notification cannot drift out of sync with the fact it describes —
--     the trigger fires in the same transaction, so a rolled-back sale leaves
--     no phantom alert, and a sale written by any future code path still
--     notifies;
--   * the existing, tested RPC bodies are not touched at all (the rule-engine
--     slice taught us what reimplementing a working function costs).
--
-- De-duplication is structural: every emitter computes a deterministic
-- `dedupe_key` and inserts ON CONFLICT DO NOTHING. A Realtime reconnect that
-- replays an event, a retried RPC, or a trigger that fires twice can never
-- produce two rows — which is also why "duplicate/reconnect events do not
-- duplicate activity or points" is testable at the database level rather than
-- being a promise about client code.
--
-- Scope: in-app only. Web push, email fan-out and digesting are explicitly
-- out (§5 "Keep web push separate; do not implement browser push yet").
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.notification_audience as enum ('customer', 'business');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_category as enum
    ('points', 'reward', 'stock', 'staff', 'rule', 'security', 'system');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- notifications — the event
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Store scope. When set, store-scoped staff see it only if assigned there.
  store_id    uuid references public.stores (id) on delete cascade,
  audience    public.notification_audience not null,
  -- Exactly one of these is meaningful, enforced below:
  --   audience 'customer' → customer_membership_id identifies the recipient
  --   audience 'business' → min_role is the lowest role that may see it
  customer_membership_id uuid references public.customer_memberships (id) on delete cascade,
  min_role    public.app_role,

  category    public.notification_category not null,
  title       text not null,
  body        text,

  -- What this notification is about, so the UI can deep-link without parsing
  -- prose and without a second round trip.
  source_type text,
  source_id   uuid,
  -- FK-free on purpose (audit_logs / points_ledger precedent): deleting a
  -- staff auth user must never block or rewrite history.
  actor_profile_id uuid,
  metadata    jsonb not null default '{}'::jsonb,

  -- Structural de-duplication. Unique per business.
  dedupe_key  text not null,
  created_at  timestamptz not null default now(),

  constraint notifications_title_len check (length(trim(title)) between 2 and 160),
  constraint notifications_body_len check (body is null or length(body) <= 500),
  constraint notifications_dedupe_len check (length(trim(dedupe_key)) between 3 and 200),
  constraint notifications_audience_shape check (
    (audience = 'customer' and customer_membership_id is not null and min_role is null)
    or
    (audience = 'business' and customer_membership_id is null and min_role is not null)
  ),
  constraint notifications_unique_event unique (business_id, dedupe_key)
);

create index if not exists notifications_customer_idx
  on public.notifications (customer_membership_id, created_at desc)
  where customer_membership_id is not null;
create index if not exists notifications_business_idx
  on public.notifications (business_id, created_at desc);
create index if not exists notifications_store_idx
  on public.notifications (store_id, created_at desc)
  where store_id is not null;

-- ---------------------------------------------------------------------------
-- notification_reads — per-recipient state
-- ---------------------------------------------------------------------------
create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, profile_id)
);

create index if not exists notification_reads_profile_idx
  on public.notification_reads (profile_id, read_at desc);

-- ---------------------------------------------------------------------------
-- visibility helper — one definition of "may this profile see this row",
-- reused by the RLS policy and by the mark-read RPCs so the two can never
-- disagree about what is authorized.
-- ---------------------------------------------------------------------------
create or replace function public.can_see_notification(p_notification_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.notifications n
     where n.id = p_notification_id
       and (
         -- Customer: only their own membership's notifications.
         (n.audience = 'customer' and exists (
            select 1 from public.customer_memberships cm
             where cm.id = n.customer_membership_id
               and cm.profile_id = auth.uid()
               and cm.status = 'active'
          ))
         or
         -- Business: role floor, then store scoping for scoped staff.
         (n.audience = 'business'
          and public.role_at_least(public.business_role(n.business_id), n.min_role)
          and (n.store_id is null or public.is_store_assigned(n.store_id)))
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- notify_emit — the single insertion point. Internal (no API grants).
--
-- Returns the notification id, or null when the event was already recorded.
-- Never raises on a duplicate: emitters are triggers inside somebody else's
-- transaction, and a duplicate notification must never abort the sale,
-- redemption or stock movement that produced it.
-- ---------------------------------------------------------------------------
create or replace function public.notify_emit(
  p_business_id  uuid,
  p_audience     public.notification_audience,
  p_category     public.notification_category,
  p_title        text,
  p_dedupe_key   text,
  p_body         text default null,
  p_customer_membership_id uuid default null,
  p_min_role     public.app_role default null,
  p_store_id     uuid default null,
  p_source_type  text default null,
  p_source_id    uuid default null,
  p_actor        uuid default null,
  p_metadata     jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if p_business_id is null or p_title is null or p_dedupe_key is null then
    return null;
  end if;

  insert into public.notifications
    (business_id, store_id, audience, customer_membership_id, min_role,
     category, title, body, source_type, source_id, actor_profile_id,
     metadata, dedupe_key)
  values
    (p_business_id, p_store_id, p_audience, p_customer_membership_id,
     case when p_audience = 'business' then coalesce(p_min_role, 'staff') else null end,
     p_category, left(p_title, 160), left(p_body, 500), p_source_type, p_source_id,
     coalesce(p_actor, auth.uid()), coalesce(p_metadata, '{}'::jsonb), p_dedupe_key)
  on conflict (business_id, dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- emitters
-- ═══════════════════════════════════════════════════════════════════════════

-- --- 1. points awarded on a sale -------------------------------------------
create or replace function public.notify_on_points_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_store uuid;
begin
  -- Only real earnings from a sale. Redemption spends get their own
  -- notification from the redemption emitter, and manual adjustments are a
  -- back-office action the customer is told about in person.
  if new.entry_type <> 'earn' or new.source_type <> 'sale' then
    return new;
  end if;

  perform public.notify_emit(
    p_business_id => new.business_id,
    p_audience    => 'customer',
    p_category    => 'points',
    p_title       => new.points || ' points added to your account',
    p_dedupe_key  => 'points:' || new.id::text,
    p_body        => coalesce(new.reason, 'Thanks for shopping with us.')
                     || ' New balance: ' || new.balance_after || ' points.',
    p_customer_membership_id => new.customer_membership_id,
    p_store_id    => new.store_id,
    p_source_type => 'points_ledger',
    p_source_id   => new.source_id,
    p_actor       => new.actor_profile_id,
    p_metadata    => jsonb_build_object(
      'points', new.points, 'balance_after', new.balance_after,
      'ledger_entry_id', new.id
    )
  );
  return new;
end $$;

drop trigger if exists notify_on_points_entry on public.points_ledger;
create trigger notify_on_points_entry
  after insert on public.points_ledger
  for each row execute function public.notify_on_points_entry();

-- --- 2. redemption created / status changed ---------------------------------
create or replace function public.notify_on_redemption()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reward text;
  v_title  text;
  v_body   text;
begin
  -- Only fire on creation or a real status transition.
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select r.name into v_reward from public.rewards r where r.id = new.reward_id;
  v_reward := coalesce(v_reward, 'Your reward');

  if tg_op = 'INSERT' then
    v_title := 'Reward reserved: ' || v_reward;
    v_body  := new.points_used || ' points used · reference ' || new.reference
               || ' · collect by ' || to_char(new.expires_at, 'DD Mon');
  elsif new.status = 'collected' then
    v_title := 'Reward collected: ' || v_reward;
    v_body  := 'Picked up at the counter · reference ' || new.reference;
  elsif new.status = 'cancelled' then
    v_title := 'Reward cancelled: ' || v_reward;
    v_body  := coalesce(new.cancel_reason, 'Your points have been refunded.');
  elsif new.status = 'expired' then
    v_title := 'Reward expired: ' || v_reward;
    v_body  := 'Reference ' || new.reference || ' was not collected in time.';
  else
    return new;
  end if;

  -- The customer always hears about their own redemption…
  perform public.notify_emit(
    p_business_id => new.business_id,
    p_audience    => 'customer',
    p_category    => 'reward',
    p_title       => v_title,
    p_dedupe_key  => 'redemption:' || new.id::text || ':' || new.status::text,
    p_body        => v_body,
    p_customer_membership_id => new.customer_membership_id,
    p_store_id    => new.store_id,
    p_source_type => 'redemption',
    p_source_id   => new.id,
    p_metadata    => jsonb_build_object('status', new.status::text, 'reference', new.reference)
  );

  -- …and the counter hears about the ones that need someone to act.
  if tg_op = 'INSERT' or new.status = 'collected' then
    perform public.notify_emit(
      p_business_id => new.business_id,
      p_audience    => 'business',
      p_category    => 'reward',
      p_title       => case when tg_op = 'INSERT'
                            then 'Reward to hand over: ' || v_reward
                            else 'Reward collected: ' || v_reward end,
      p_dedupe_key  => 'redemption-staff:' || new.id::text || ':' || new.status::text,
      p_body        => 'Reference ' || new.reference || ' · ' || new.points_used || ' points',
      p_min_role    => 'staff',
      p_store_id    => new.store_id,
      p_source_type => 'redemption',
      p_source_id   => new.id,
      p_metadata    => jsonb_build_object('status', new.status::text, 'reference', new.reference)
    );
  end if;

  return new;
end $$;

drop trigger if exists notify_on_redemption on public.redemptions;
create trigger notify_on_redemption
  after insert or update of status on public.redemptions
  for each row execute function public.notify_on_redemption();

-- --- 3. low stock, where configured -----------------------------------------
create or replace function public.notify_on_low_stock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product record;
  v_available integer := new.on_hand - new.reserved;
  v_was       integer := old.on_hand - old.reserved;
begin
  -- "where configured" — a reorder level of 0 means the business has not
  -- asked to be told, and we do not invent a threshold for them.
  if new.reorder_level <= 0 then
    return new;
  end if;
  -- Only on the crossing, not on every movement below the line: otherwise a
  -- busy Saturday buries the notification centre in the same alert.
  if not (v_available <= new.reorder_level and v_was > old.reorder_level) then
    return new;
  end if;

  select p.id, p.name, p.business_id into v_product
    from public.products p where p.id = new.product_id;
  if v_product.id is null then
    return new;
  end if;

  perform public.notify_emit(
    p_business_id => v_product.business_id,
    p_audience    => 'business',
    p_category    => 'stock',
    p_title       => 'Low stock: ' || v_product.name,
    -- Re-armed by the crossing itself: restocking above the line and dropping
    -- below it again is a genuinely new alert, so the key carries the level.
    p_dedupe_key  => 'low-stock:' || new.product_id::text || ':' || new.store_id::text
                     || ':' || v_available::text,
    p_body        => v_available || ' left at this store (reorder level '
                     || new.reorder_level || ').',
    p_min_role    => 'manager',
    p_store_id    => new.store_id,
    p_source_type => 'product',
    p_source_id   => new.product_id,
    p_metadata    => jsonb_build_object(
      'available', v_available, 'reorder_level', new.reorder_level,
      'store_id', new.store_id
    )
  );
  return new;
end $$;

drop trigger if exists notify_on_low_stock on public.inventory_by_store;
create trigger notify_on_low_stock
  after update of on_hand, reserved on public.inventory_by_store
  for each row execute function public.notify_on_low_stock();

-- --- 4. staff invitation ----------------------------------------------------
create or replace function public.notify_on_invitation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.notify_emit(
    p_business_id => new.business_id,
    p_audience    => 'business',
    p_category    => 'staff',
    p_title       => 'Invitation sent to ' || new.email,
    p_dedupe_key  => 'invitation:' || new.id::text,
    p_body        => 'Role: ' || new.role::text || ' · expires '
                     || to_char(new.expires_at, 'DD Mon HH24:MI'),
    -- Team changes are an owner concern; managers do not manage staff yet.
    p_min_role    => 'owner',
    p_store_id    => new.store_id,
    p_source_type => 'invitation',
    p_source_id   => new.id,
    p_actor       => new.invited_by,
    p_metadata    => jsonb_build_object('email', new.email, 'role', new.role::text)
  );
  return new;
end $$;

drop trigger if exists notify_on_invitation on public.invitations;
create trigger notify_on_invitation
  after insert on public.invitations
  for each row execute function public.notify_on_invitation();

-- --- 5. loyalty rule change -------------------------------------------------
create or replace function public.notify_on_rule_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Version 1 is the launch policy installed at signup — not news.
  if new.version <= 1 then
    return new;
  end if;

  perform public.notify_emit(
    p_business_id => new.business_id,
    p_audience    => 'business',
    p_category    => 'rule',
    p_title       => 'Loyalty rule updated to v' || new.version,
    p_dedupe_key  => 'rule-version:' || new.id::text,
    p_body        => '₹' || round(new.earn_spend_paise / 100.0, 2) || ' → '
                     || new.earn_points || ' points, from '
                     || to_char(new.effective_from, 'DD Mon YYYY HH24:MI') || '.',
    p_min_role    => 'staff',
    p_source_type => 'loyalty_rule_version',
    p_source_id   => new.id,
    p_actor       => new.created_by,
    p_metadata    => jsonb_build_object(
      'version', new.version,
      'earn_spend_paise', new.earn_spend_paise,
      'earn_points', new.earn_points,
      'effective_from', new.effective_from
    )
  );
  return new;
end $$;

drop trigger if exists notify_on_rule_version on public.loyalty_rule_versions;
create trigger notify_on_rule_version
  after insert on public.loyalty_rule_versions
  for each row execute function public.notify_on_rule_version();

-- --- 6. QR verification security events -------------------------------------
create or replace function public.notify_on_qr_attempt()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_recent integer;
begin
  -- A single mistyped code is noise, not a security event. Rate limiting and
  -- authorization failures are, and so is a burst of bad codes at one till.
  if new.outcome in ('verified', 'expired', 'already_used') then
    return new;
  end if;

  if new.outcome in ('rate_limited', 'not_authorized', 'business_mismatch') then
    perform public.notify_emit(
      p_business_id => new.business_id,
      p_audience    => 'business',
      p_category    => 'security',
      p_title       => 'QR verification blocked (' || new.outcome::text || ')',
      p_dedupe_key  => 'qr-security:' || new.id::text,
      p_body        => 'A member QR scan was refused. Review the scan trail if this repeats.',
      p_min_role    => 'manager',
      p_store_id    => new.store_id,
      p_source_type => 'qr_verification_attempt',
      p_source_id   => null,
      p_actor       => new.actor_id,
      p_metadata    => jsonb_build_object('outcome', new.outcome::text, 'attempt_id', new.id)
    );
    return new;
  end if;

  -- Bursts of invalid codes: five in five minutes from one scanner.
  if new.outcome = 'invalid' and new.actor_id is not null then
    select count(*) into v_recent
      from public.qr_verification_attempts a
     where a.actor_id = new.actor_id
       and a.outcome = 'invalid'
       and a.attempted_at > now() - interval '5 minutes';
    if v_recent >= 5 then
      perform public.notify_emit(
        p_business_id => new.business_id,
        p_audience    => 'business',
        p_category    => 'security',
        p_title       => 'Repeated invalid QR scans',
        -- One alert per scanner per five-minute bucket.
        p_dedupe_key  => 'qr-invalid-burst:' || new.actor_id::text || ':'
                         || to_char(date_trunc('hour', now()), 'YYYYMMDDHH24')
                         || ':' || (extract(minute from now())::int / 5)::text,
        p_body        => v_recent || ' invalid member codes in the last five minutes at this till.',
        p_min_role    => 'manager',
        p_store_id    => new.store_id,
        p_source_type => 'qr_verification_attempt',
        p_source_id   => null,
        p_actor       => new.actor_id,
        p_metadata    => jsonb_build_object('invalid_count', v_recent)
      );
    end if;
  end if;

  return new;
end $$;

drop trigger if exists notify_on_qr_attempt on public.qr_verification_attempts;
create trigger notify_on_qr_attempt
  after insert on public.qr_verification_attempts
  for each row execute function public.notify_on_qr_attempt();

-- ═══════════════════════════════════════════════════════════════════════════
-- read-state RPCs
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * Mark one notification read. Idempotent: calling it twice (two tabs, a
 * retry, an optimistic update that also lands) keeps the first read_at.
 */
create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  -- Authorization uses the same predicate as the RLS policy, so a user can
  -- never mark something read that they were not allowed to see.
  if not public.can_see_notification(p_notification_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.notification_reads (notification_id, profile_id)
  values (p_notification_id, v_actor)
  on conflict (notification_id, profile_id) do nothing;

  return true;
end $$;

/**
 * Mark every currently-visible notification read, optionally limited to one
 * audience so the business bell and the customer bell stay independent.
 * Returns how many rows this actually changed.
 */
create or replace function public.mark_all_notifications_read(p_audience text default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_count integer;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_audience is not null and p_audience not in ('customer', 'business') then
    raise exception 'invalid_audience' using errcode = '22023';
  end if;

  with visible as (
    select n.id
      from public.notifications n
     where (p_audience is null or n.audience::text = p_audience)
       and (
         (n.audience = 'customer' and exists (
            select 1 from public.customer_memberships cm
             where cm.id = n.customer_membership_id
               and cm.profile_id = v_actor
               and cm.status = 'active'))
         or
         (n.audience = 'business'
          and public.role_at_least(public.business_role(n.business_id), n.min_role)
          and (n.store_id is null or public.is_store_assigned(n.store_id)))
       )
  ), inserted as (
    insert into public.notification_reads (notification_id, profile_id)
    select v.id, v_actor from visible v
    on conflict (notification_id, profile_id) do nothing
    returning 1
  )
  select count(*)::integer into v_count from inserted;

  return v_count;
end $$;

/** Unread count for the badge — one round trip instead of fetching the list. */
create or replace function public.unread_notification_count(p_audience text default null)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
    from public.notifications n
   where (p_audience is null or n.audience::text = p_audience)
     and not exists (
       select 1 from public.notification_reads r
        where r.notification_id = n.id and r.profile_id = auth.uid()
     )
     and (
       (n.audience = 'customer' and exists (
          select 1 from public.customer_memberships cm
           where cm.id = n.customer_membership_id
             and cm.profile_id = auth.uid()
             and cm.status = 'active'))
       or
       (n.audience = 'business'
        and public.role_at_least(public.business_role(n.business_id), n.min_role)
        and (n.store_id is null or public.is_store_assigned(n.store_id)))
     );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.notifications      enable row level security;
alter table public.notification_reads enable row level security;

drop policy if exists "notifications_select_authorized" on public.notifications;
create policy "notifications_select_authorized" on public.notifications
  for select to authenticated
  using (
    (audience = 'customer' and exists (
       select 1 from public.customer_memberships cm
        where cm.id = notifications.customer_membership_id
          and cm.profile_id = auth.uid()
          and cm.status = 'active'))
    or
    (audience = 'business'
     and public.role_at_least(public.business_role(notifications.business_id), notifications.min_role)
     and (notifications.store_id is null or public.is_store_assigned(notifications.store_id)))
  );

-- Read state is strictly personal: you see and write only your own rows.
drop policy if exists "notification_reads_select_own" on public.notification_reads;
create policy "notification_reads_select_own" on public.notification_reads
  for select to authenticated
  using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- grants — reads are direct (Realtime needs SELECT), writes are RPC-only.
-- ---------------------------------------------------------------------------
revoke all on public.notifications      from public, anon, authenticated;
revoke all on public.notification_reads from public, anon, authenticated;

grant select on public.notifications      to authenticated;
grant select on public.notification_reads to authenticated;

grant all on public.notifications      to service_role;
grant all on public.notification_reads to service_role;

grant execute on function public.mark_notification_read(uuid)          to authenticated;
grant execute on function public.mark_all_notifications_read(text)     to authenticated;
grant execute on function public.unread_notification_count(text)       to authenticated;
revoke execute on function public.mark_notification_read(uuid)         from public, anon;
revoke execute on function public.mark_all_notifications_read(text)    from public, anon;
revoke execute on function public.unread_notification_count(text)      from public, anon;

-- Internal: only the triggers may emit, and only RLS decides visibility.
revoke execute on function public.notify_emit(
  uuid, public.notification_audience, public.notification_category, text, text, text,
  uuid, public.app_role, uuid, text, uuid, uuid, jsonb
) from public, anon, authenticated;
revoke execute on function public.can_see_notification(uuid) from public, anon;
grant execute on function public.can_see_notification(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime publication.
--
-- Only `notifications` is published, and Supabase applies the SELECT policy
-- above per subscriber — a cashier's socket physically cannot receive another
-- tenant's row. `notification_reads` is deliberately NOT published: read state
-- is personal, high-frequency and already known to the tab that changed it.
--
-- Guarded because the publication does not exist on a bare PostgreSQL used by
-- the local RLS harness.
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'notifications'
    ) then
      execute 'alter publication supabase_realtime add table public.notifications';
    end if;
  end if;
end $$;

-- REPLICA IDENTITY FULL would leak unfiltered old rows to subscribers; the
-- default (primary key) is what Realtime needs for INSERT events.

comment on table public.notifications is
  'Persistent in-app notifications. One row per event; read state lives in notification_reads.';
comment on table public.notification_reads is
  'Per-profile read state, so one event can be read independently by many staff.';
