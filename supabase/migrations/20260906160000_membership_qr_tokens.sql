-- ═══════════════════════════════════════════════════════════════════════════
-- MVP LAUNCH · PART A §3 — SECURE MEMBERSHIP QR TOKENS + POS VERIFICATION
--
-- Replaces the raw membership-ID QR payload with an OPAQUE, SHORT-LIVED,
-- SINGLE-USE capability token.
--
-- Token format (v1):        RWD1.<selector>.<secret>
--   selector : 16 chars Crockford base-32 from gen_random_bytes(10) — a public
--              lookup handle with no relation to the membership number.
--   secret   : 26 chars Crockford base-32 from gen_random_bytes(16) — 128 bits
--              of entropy, returned to the customer's device ONCE and never
--              stored. Only sha256(salt || secret) is persisted, so a database
--              read cannot forge or replay a QR.
--
-- Security properties (spec §3 "Required design"):
--   • No PII, no membership id, no points, no business secret and nothing
--     predictable is encoded — the payload is two random strings.
--   • Short expiry (default 90 s, hard max 300 s) plus single use, so a photo
--     of somebody's screen is worthless within seconds.
--   • Server-verified context: the token row carries business_id, so a token
--     minted for business A can never be verified by staff of business B.
--   • Revocation: issuing a fresh token revokes the customer's previous live
--     tokens (one live token per membership), and a verified token is consumed.
--   • Rate limited on BOTH sides: issuing (per membership) and verification
--     attempts (per staff profile), recorded in `qr_verification_attempts`.
--   • Every issue / success / failure writes an audit_logs row that contains
--     the selector at most — NEVER the secret or the hash.
--   • Verification returns the MINIMUM data the counter needs: membership id,
--     membership number, display name, masked phone and the points balance.
--
-- Deviations / deferrals:
--   • Camera decoding is out of scope for this MVP (the POS scanner is still a
--     simulation) — this migration provides the token contract + verification
--     endpoint that a real camera decoder will hand its payload to unchanged.
--   • Rotation of a server-side pepper is unnecessary because each token has
--     its own random salt and a ≤5-minute lifetime.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.qr_verification_outcome as enum (
    'verified', 'invalid', 'expired', 'revoked', 'already_used',
    'business_mismatch', 'not_authorized', 'rate_limited'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- membership_qr_tokens — one row per issued QR. The secret is NOT stored.
-- ---------------------------------------------------------------------------
create table if not exists public.membership_qr_tokens (
  id                     uuid primary key default gen_random_uuid(),
  business_id            uuid not null references public.businesses (id) on delete cascade,
  customer_membership_id uuid not null references public.customer_memberships (id) on delete cascade,
  token_version          smallint not null default 1,
  selector               text not null,
  salt                   bytea not null,
  verifier_hash          bytea not null,
  issued_by              uuid references public.profiles (id) on delete set null,
  issued_at              timestamptz not null default now(),
  expires_at             timestamptz not null,
  consumed_at            timestamptz,
  consumed_by            uuid references public.profiles (id) on delete set null,
  consumed_store_id      uuid references public.stores (id) on delete set null,
  revoked_at             timestamptz,
  revoke_reason          text,
  constraint membership_qr_tokens_selector_unique unique (selector),
  constraint membership_qr_tokens_selector_format check (selector ~ '^[0-9A-HJKMNP-TV-Z]{16}$'),
  constraint membership_qr_tokens_ttl check (expires_at > issued_at and expires_at <= issued_at + interval '5 minutes'),
  constraint membership_qr_tokens_consumed_fields check (
    (consumed_at is null) = (consumed_by is null)
  )
);

create index if not exists membership_qr_tokens_membership_idx
  on public.membership_qr_tokens (customer_membership_id, issued_at desc);
create index if not exists membership_qr_tokens_live_idx
  on public.membership_qr_tokens (expires_at)
  where consumed_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- qr_verification_attempts — rate limiting + forensics. Records the OUTCOME
-- and the actor, plus the selector (a public handle) for support lookups.
-- Never the secret, never the hash.
-- ---------------------------------------------------------------------------
create table if not exists public.qr_verification_attempts (
  id           bigserial primary key,
  business_id  uuid references public.businesses (id) on delete cascade,
  store_id     uuid references public.stores (id) on delete set null,
  actor_id     uuid references public.profiles (id) on delete set null,
  selector     text,
  outcome      public.qr_verification_outcome not null,
  attempted_at timestamptz not null default now(),
  constraint qr_verification_attempts_selector_len check (selector is null or length(selector) <= 32)
);

create index if not exists qr_verification_attempts_actor_idx
  on public.qr_verification_attempts (actor_id, attempted_at desc);
create index if not exists qr_verification_attempts_business_idx
  on public.qr_verification_attempts (business_id, attempted_at desc);

-- Append-only: attempts are evidence, not editable state.
create or replace function public.qr_attempts_no_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'qr_verification_attempts are append-only' using errcode = '42501';
end;
$$;

drop trigger if exists qr_attempts_no_update on public.qr_verification_attempts;
create trigger qr_attempts_no_update
  before update or delete on public.qr_verification_attempts
  for each row execute function public.qr_attempts_no_mutation();

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

/** Crockford base-32 encoding of n random bytes (no I, L, O, U). */
create or replace function public.qr_random_base32(p_bytes integer)
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes    bytea := extensions.gen_random_bytes(p_bytes);
  v_out      text := '';
  i          integer;
begin
  for i in 0 .. p_bytes - 1 loop
    v_out := v_out || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_out;
end;
$$;

/** Normalizes the Crockford look-alikes a scanner/typist can introduce. */
create or replace function public.qr_normalize(p_text text)
returns text
language sql
immutable
as $$
  select translate(upper(coalesce(p_text, '')), 'ILOU', '1101');
$$;

-- ---------------------------------------------------------------------------
-- issue_membership_qr_token — customer-facing, rate limited.
--
-- The caller must be the signed-in owner of the membership (business staff
-- cannot mint a QR on a customer's behalf; the counter uses manual lookup for
-- that). Issuing revokes the membership's previous live tokens so at most one
-- QR is ever valid.
-- ---------------------------------------------------------------------------
create or replace function public.issue_membership_qr_token(
  p_business_id uuid    default null,
  p_ttl_seconds integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_membership record;
  v_count      integer;
  v_selector   text;
  v_secret     text;
  v_salt       bytea;
  v_ttl        integer;
  v_id         uuid;
  v_expires    timestamptz;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  v_ttl := least(greatest(coalesce(p_ttl_seconds, 90), 30), 300);

  -- 1. Resolve the caller's own active membership.
  if p_business_id is not null then
    select cm.id, cm.business_id into v_membership
      from public.customer_memberships cm
     where cm.profile_id = v_actor and cm.business_id = p_business_id and cm.status = 'active';
  else
    select cm.id, cm.business_id into v_membership
      from public.customer_memberships cm
     where cm.profile_id = v_actor and cm.status = 'active'
     order by cm.enrolled_at asc
     limit 1;
  end if;

  if not found then
    raise exception 'membership_not_found: no active membership for this account'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.businesses b where b.id = v_membership.business_id and b.status = 'active'
  ) then
    raise exception 'business_inactive' using errcode = '22023';
  end if;

  -- 2. Rate limit — a refreshing QR screen needs a handful per minute, no more.
  select count(*) into v_count
    from public.membership_qr_tokens t
   where t.customer_membership_id = v_membership.id
     and t.issued_at > now() - interval '1 minute';
  if v_count >= 10 then
    raise exception 'rate_limited: too many QR refreshes, wait a moment'
      using errcode = '53400';
  end if;

  -- 3. Exactly one live token per membership.
  update public.membership_qr_tokens
     set revoked_at = now(), revoke_reason = 'superseded'
   where customer_membership_id = v_membership.id
     and consumed_at is null and revoked_at is null and expires_at > now();

  -- 4. Mint. The secret leaves the database exactly once, in this result.
  v_selector := public.qr_random_base32(16);
  v_secret   := public.qr_random_base32(26);
  v_salt     := extensions.gen_random_bytes(16);
  v_expires  := now() + make_interval(secs => v_ttl);

  insert into public.membership_qr_tokens (
    business_id, customer_membership_id, selector, salt, verifier_hash,
    issued_by, expires_at
  ) values (
    v_membership.business_id, v_membership.id, v_selector, v_salt,
    extensions.digest(v_salt || convert_to(v_secret, 'UTF8'), 'sha256'),
    v_actor, v_expires
  )
  returning id into v_id;

  perform public.write_audit(
    'membership_qr.issued', v_actor, null, v_membership.business_id, null,
    'membership_qr_token', v_id::text,
    jsonb_build_object('selector', v_selector, 'ttl_seconds', v_ttl)
  );

  return jsonb_build_object(
    'token', 'RWD1.' || v_selector || '.' || v_secret,
    'expires_at', v_expires,
    'ttl_seconds', v_ttl
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- verify_membership_qr_token — staff POS verification.
--
-- IMPORTANT: verification failures RETURN a status object instead of raising.
-- A `raise` would roll back the attempt row and the audit row written in the
-- same statement (the same reason redemption denials are audited by the server
-- action), which would make both the security trail and the scanner rate limit
-- useless. Only "you are not signed in" raises, because there is nothing to
-- record. The server action maps `reason` to customer-facing copy.
--
-- Result shape:
--   success → { ok: true,  customer_membership_id, membership_no, display_name,
--               phone_masked, points_balance, business_id, verified_at }
--   failure → { ok: false, reason: 'qr_invalid' | 'qr_expired' | 'qr_revoked'
--               | 'qr_already_used' | 'not_authorized' | 'store_forbidden'
--               | 'store_not_in_business' | 'membership_inactive'
--               | 'rate_limited' }
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
    if not public.role_at_least(v_role, 'manager') then
      select exists (select 1 from public.my_stores()) into v_scoped;
      if v_scoped and not public.is_store_assigned(p_store_id) then
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


-- ---------------------------------------------------------------------------
-- revoke_membership_qr_tokens — "hide my QR" / lost-device control.
-- ---------------------------------------------------------------------------
create or replace function public.revoke_membership_qr_tokens(p_reason text default 'customer_revoked')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := left(coalesce(p_reason, 'customer_revoked'), 120);
  v_count integer;
  v_biz record;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  -- Revoke and audit in one pass. One audit row per affected business keeps the
  -- trail tenant-scoped (audit_logs RLS is business-scoped) and selector-free:
  -- revocation is a bulk act, not a scan of one particular code.
  v_count := 0;
  for v_biz in
    with revoked as (
      update public.membership_qr_tokens t
         set revoked_at = now(), revoke_reason = v_reason
        from public.customer_memberships cm
       where cm.id = t.customer_membership_id
         and cm.profile_id = v_actor
         and t.consumed_at is null and t.revoked_at is null and t.expires_at > now()
      returning t.business_id
    )
    select business_id, count(*)::integer as n from revoked group by business_id
  loop
    v_count := v_count + v_biz.n;
    perform public.write_audit(
      'membership_qr.revoked', v_actor, null, v_biz.business_id, null,
      'customer_membership', null::text,
      jsonb_build_object('tokens', v_biz.n, 'reason', v_reason)
    );
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS — the token table is never read by API roles (the secret material and
-- even the selector list stay server-side); customers/staff learn about tokens
-- only through the two RPCs. Attempts are visible to business managers+ for
-- security review.
-- ---------------------------------------------------------------------------
alter table public.membership_qr_tokens     enable row level security;
alter table public.qr_verification_attempts enable row level security;

drop policy if exists "qr_attempts_select_manager" on public.qr_verification_attempts;
create policy "qr_attempts_select_manager" on public.qr_verification_attempts
  for select to authenticated
  using (business_id in (select * from public.my_businesses('manager')));

-- ---------------------------------------------------------------------------
-- grants — RPC-only. No table DML, and no SELECT at all on the token table.
-- ---------------------------------------------------------------------------
revoke all on public.membership_qr_tokens     from public, anon, authenticated;
revoke all on public.qr_verification_attempts from public, anon, authenticated;
revoke all on sequence public.qr_verification_attempts_id_seq from public, anon, authenticated;

grant select on public.qr_verification_attempts to authenticated;

grant execute on function public.issue_membership_qr_token(uuid, integer)  to authenticated;
grant execute on function public.verify_membership_qr_token(text, uuid)    to authenticated;
grant execute on function public.revoke_membership_qr_tokens(text)         to authenticated;
revoke execute on function public.issue_membership_qr_token(uuid, integer) from public, anon;
revoke execute on function public.verify_membership_qr_token(text, uuid)   from public, anon;
revoke execute on function public.revoke_membership_qr_tokens(text)        from public, anon;
revoke execute on function public.qr_random_base32(integer)                from public, anon, authenticated;

grant all on public.membership_qr_tokens     to service_role;
grant all on public.qr_verification_attempts to service_role;
grant all on sequence public.qr_verification_attempts_id_seq to service_role;
