-- ============================================================================
-- Fix: store-scoped staff could bypass store confinement by omitting
-- p_store_id.
--
-- award_points, redeem_reward and verify_membership_qr_token each guarded
-- store confinement with `if p_store_id is not null then ... end if`. Since
-- p_store_id is an optional, client-supplied parameter and any authenticated
-- client can call a granted RPC directly (independent of what the shipped UI
-- happens to send), a cashier confined to one store could call these with
-- p_store_id => null and act business-wide — awarding points, redeeming
-- rewards, or verifying a membership QR with no store attribution at all.
--
-- This never crossed a tenant boundary (business_role(...) still requires
-- real staff membership in that exact business), but it defeated the whole
-- point of store scoping as a fraud-control boundary.
--
-- Fix, matching the pattern already used by create_sale (p_store_id there is
-- a required, non-nullable parameter so the bypass can't exist): for any
-- actor who is NOT manager+ and who has at least one row in my_stores() (i.e.
-- is store-scoped at all), a null p_store_id is now rejected outright rather
-- than silently skipping the check. A supplied p_store_id is still validated
-- against is_store_assigned(), exactly as before. Staff with zero store
-- assignments (business-wide staff) are unaffected, matching create_sale's
-- existing semantics. Every other line of each function body below is
-- byte-for-byte identical to the version it replaces — only the store-scoping
-- block in each function changed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- award_points — only the store-scoping block (originally
-- "if p_store_id is not null then ... end if") changed.
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
  end if;

  if not public.role_at_least(v_actor_role, 'manager') then
    select exists (select 1 from public.my_stores()) into v_scoped;
    if v_scoped then
      if p_store_id is null then
        raise exception 'store_required: store-scoped staff must specify a store'
          using errcode = '22023';
      end if;
      if not public.is_store_assigned(p_store_id) then
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
-- redeem_reward — only the "3. Authorize" block changed (originally guarded
-- the my_stores()/is_store_assigned() check with "... and p_store_id is not
-- null then"). Everything else is verbatim.
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
    if not public.role_at_least(v_actor_role, 'manager') then
      select exists (select 1 from public.my_stores()) into v_scoped;
      if v_scoped then
        if p_store_id is null then
          raise exception 'store_required: store-scoped staff must specify a store'
            using errcode = '22023';
        end if;
        if not public.is_store_assigned(p_store_id) then
          raise exception 'store_forbidden: store-scoped staff cannot redeem outside their stores'
            using errcode = '42501';
        end if;
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
-- verify_membership_qr_token — only the "Store scoping" block changed
-- (originally guarded the my_stores()/is_store_assigned() check with
-- "if p_store_id is not null then"). This function must never `raise` on an
-- ordinary denial: a raise rolls back the qr_verification_attempts row it
-- just wrote (MVP_HANDOFF.md §3), so the new denial path returns
-- {ok:false, reason:'store_required'} instead, matching every other branch.
-- ---------------------------------------------------------------------------
create or replace function public.verify_membership_qr_token(
  p_token    text,
  p_store_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_parts      text[];
  v_selector   text;
  v_secret     text;
  v_token      record;
  v_found      boolean := false;
  v_role       public.app_role;
  v_scoped     boolean;
  v_store_biz  uuid;
  v_membership record;
  v_balance    integer;
  v_recent     integer;
  v_outcome    public.qr_verification_outcome;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  -- 1. Scanner rate limit — a counter scans a few per minute, not hundreds.
  select count(*) into v_recent
    from public.qr_verification_attempts a
   where a.actor_id = v_actor
     and a.attempted_at > now() - interval '1 minute';
  if v_recent >= 40 then
    insert into public.qr_verification_attempts (business_id, store_id, actor_id, selector, outcome)
    values (null, p_store_id, v_actor, null, 'rate_limited');
    perform public.write_audit(
      'membership_qr.rate_limited', v_actor, null, null, p_store_id,
      'membership_qr_token', null::text, jsonb_build_object('window', '1 minute')
    );
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  -- 2. Parse. Malformed input never reaches the database lookup.
  v_parts := string_to_array(coalesce(p_token, ''), '.');
  if array_length(v_parts, 1) is distinct from 3
     or upper(v_parts[1]) <> 'RWD1'
     or public.qr_normalize(v_parts[2]) !~ '^[0-9A-HJKMNP-TV-Z]{16}$'
     or public.qr_normalize(v_parts[3]) !~ '^[0-9A-HJKMNP-TV-Z]{26}$' then
    insert into public.qr_verification_attempts (business_id, store_id, actor_id, selector, outcome)
    values (null, p_store_id, v_actor, null, 'invalid');
    perform public.write_audit(
      'membership_qr.verify_failed', v_actor, null, null, p_store_id,
      'membership_qr_token', null::text, jsonb_build_object('reason', 'malformed')
    );
    return jsonb_build_object('ok', false, 'reason', 'qr_invalid');
  end if;

  v_selector := public.qr_normalize(v_parts[2]);
  v_secret   := public.qr_normalize(v_parts[3]);

  -- 3. Look up the token row (selector is a public handle; the secret decides).
  select t.* into v_token
    from public.membership_qr_tokens t
   where t.selector = v_selector;
  v_found := found;

  -- Unknown selector OR wrong secret → the SAME opaque failure: we must not
  -- leak whether a selector exists.
  if not v_found
     or v_token.verifier_hash is distinct from
        extensions.digest(v_token.salt || convert_to(v_secret, 'UTF8'), 'sha256') then
    insert into public.qr_verification_attempts (business_id, store_id, actor_id, selector, outcome)
    values (case when v_found then v_token.business_id end, p_store_id, v_actor, v_selector, 'invalid');
    perform public.write_audit(
      'membership_qr.verify_failed', v_actor, null,
      case when v_found then v_token.business_id end, p_store_id,
      'membership_qr_token', case when v_found then v_token.id::text end,
      jsonb_build_object('reason', 'signature_mismatch', 'selector', v_selector)
    );
    return jsonb_build_object('ok', false, 'reason', 'qr_invalid');
  end if;

  -- 4. Authorize the SCANNER before revealing anything about the customer.
  v_role := public.business_role(v_token.business_id);
  if v_role is null or not public.role_at_least(v_role, 'staff') then
    -- Cross-tenant or non-staff attempt, recorded against the token's business
    -- so the owner can see somebody probing their codes.
    insert into public.qr_verification_attempts (business_id, store_id, actor_id, selector, outcome)
    values (v_token.business_id, p_store_id, v_actor, v_selector,
            (case when v_role is null then 'business_mismatch' else 'not_authorized' end)::public.qr_verification_outcome);
    perform public.write_audit(
      'membership_qr.verify_denied', v_actor, v_role, v_token.business_id, p_store_id,
      'membership_qr_token', v_token.id::text,
      jsonb_build_object('reason', 'not_business_staff', 'selector', v_selector)
    );
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  -- Store scoping: a store-assigned cashier verifies only at their store.
  if p_store_id is not null then
    select s.business_id into v_store_biz from public.stores s where s.id = p_store_id;
    if v_store_biz is distinct from v_token.business_id then
      insert into public.qr_verification_attempts (business_id, store_id, actor_id, selector, outcome)
      values (v_token.business_id, null, v_actor, v_selector, 'business_mismatch');
      perform public.write_audit(
        'membership_qr.verify_denied', v_actor, v_role, v_token.business_id, null,
        'membership_qr_token', v_token.id::text,
        jsonb_build_object('reason', 'store_not_in_business', 'selector', v_selector)
      );
      return jsonb_build_object('ok', false, 'reason', 'store_not_in_business');
    end if;
  end if;
  if not public.role_at_least(v_role, 'manager') then
    select exists (select 1 from public.my_stores()) into v_scoped;
    if v_scoped then
      if p_store_id is null then
        insert into public.qr_verification_attempts (business_id, store_id, actor_id, selector, outcome)
        values (v_token.business_id, null, v_actor, v_selector, 'not_authorized');
        perform public.write_audit(
          'membership_qr.verify_denied', v_actor, v_role, v_token.business_id, null,
          'membership_qr_token', v_token.id::text,
          jsonb_build_object('reason', 'store_required', 'selector', v_selector)
        );
        return jsonb_build_object('ok', false, 'reason', 'store_required');
      end if;
      if not public.is_store_assigned(p_store_id) then
        insert into public.qr_verification_attempts (business_id, store_id, actor_id, selector, outcome)
        values (v_token.business_id, p_store_id, v_actor, v_selector, 'not_authorized');
        perform public.write_audit(
          'membership_qr.verify_denied', v_actor, v_role, v_token.business_id, p_store_id,
          'membership_qr_token', v_token.id::text,
          jsonb_build_object('reason', 'store_forbidden', 'selector', v_selector)
        );
        return jsonb_build_object('ok', false, 'reason', 'store_forbidden');
      end if;
    end if;
  end if;

  -- 5. Lifecycle checks (after authorization, so lifecycle detail is only
  --    visible to staff who were entitled to scan in the first place).
  if v_token.revoked_at is not null then
    v_outcome := 'revoked';
  elsif v_token.consumed_at is not null then
    v_outcome := 'already_used';
  elsif v_token.expires_at <= now() then
    v_outcome := 'expired';
  end if;

  if v_outcome is not null then
    insert into public.qr_verification_attempts (business_id, store_id, actor_id, selector, outcome)
    values (v_token.business_id, p_store_id, v_actor, v_selector, v_outcome);
    perform public.write_audit(
      'membership_qr.verify_failed', v_actor, v_role, v_token.business_id, p_store_id,
      'membership_qr_token', v_token.id::text,
      jsonb_build_object('reason', v_outcome::text, 'selector', v_selector)
    );
    return jsonb_build_object(
      'ok', false,
      'reason', case v_outcome
                  when 'expired' then 'qr_expired'
                  when 'already_used' then 'qr_already_used'
                  else 'qr_revoked'
                end
    );
  end if;

  -- 6. Consume (single use). The conditional UPDATE makes concurrent scans of
  --    the same code safe: exactly one of them wins.
  update public.membership_qr_tokens
     set consumed_at = now(), consumed_by = v_actor, consumed_store_id = p_store_id
   where id = v_token.id and consumed_at is null and revoked_at is null;
  if not found then
    insert into public.qr_verification_attempts (business_id, store_id, actor_id, selector, outcome)
    values (v_token.business_id, p_store_id, v_actor, v_selector, 'already_used');
    return jsonb_build_object('ok', false, 'reason', 'qr_already_used');
  end if;

  -- 7. Minimum viable customer data for the counter.
  select cm.id, cm.membership_no, cm.display_name, cm.phone_masked, cm.status
    into v_membership
    from public.customer_memberships cm
   where cm.id = v_token.customer_membership_id;

  if v_membership.status <> 'active' then
    insert into public.qr_verification_attempts (business_id, store_id, actor_id, selector, outcome)
    values (v_token.business_id, p_store_id, v_actor, v_selector, 'revoked');
    return jsonb_build_object('ok', false, 'reason', 'membership_inactive');
  end if;

  v_balance := public.point_balance(v_membership.id);

  insert into public.qr_verification_attempts (business_id, store_id, actor_id, selector, outcome)
  values (v_token.business_id, p_store_id, v_actor, v_selector, 'verified');

  perform public.write_audit(
    'membership_qr.verified', v_actor, v_role, v_token.business_id, p_store_id,
    'customer_membership', v_membership.id::text,
    jsonb_build_object('selector', v_selector, 'token_id', v_token.id)
  );

  return jsonb_build_object(
    'ok', true,
    'customer_membership_id', v_membership.id,
    'membership_no', v_membership.membership_no,
    'display_name', v_membership.display_name,
    'phone_masked', v_membership.phone_masked,
    'points_balance', v_balance,
    'business_id', v_token.business_id,
    'verified_at', now()
  );
end;
$$;
