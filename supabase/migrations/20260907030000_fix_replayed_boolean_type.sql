-- ============================================================================
-- Fix: receive_stock and adjust_stock returned `replayed` as a JSON STRING
-- ("true"/"false") instead of a JSON boolean.
--
-- inventory_move() (unchanged, already correct) returns a genuine jsonb
-- boolean for `replayed`. But receive_stock/adjust_stock re-embedded it with
-- `v_move ->> 'replayed'` — the `->>` operator always extracts as text, so
-- the wire value became the *string* "false", not the boolean `false`.
-- src/app/business/(app)/products/inventory-actions.ts then does
-- `Boolean(row.replayed)`, and in JavaScript any non-empty string — including
-- the string "false" — is truthy, so `replayed` was always reported as
-- `true` regardless of the actual outcome.
--
-- Fix: cast back to boolean with `(v_move ->> 'replayed')::boolean` before
-- re-embedding, so jsonb_build_object stores a real JSON boolean. Only the
-- final `jsonb_build_object(...)` return line in each function changed —
-- everything else is byte-for-byte identical to the version it replaces.
-- `balance_after` is left as-is (extracted as text): the caller reads it with
-- `Number(...)`, which parses a numeric text value correctly, so it was never
-- broken the way `replayed` was.
-- ============================================================================

create or replace function public.receive_stock(
  p_store_id        uuid,
  p_product_id      uuid,
  p_quantity        integer,
  p_note            text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_actor_role public.app_role;
  v_business   uuid;
  v_product    record;
  v_move       jsonb;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'invalid_quantity: receipts must be a positive whole number'
      using errcode = '22023';
  end if;

  select s.business_id into v_business from public.stores s where s.id = p_store_id;
  if not found then
    raise exception 'store_not_found' using errcode = 'P0002';
  end if;

  v_actor_role := public.business_role(v_business);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'manager') then
    raise exception 'not_authorized: only a manager or the owner can receive stock'
      using errcode = '42501';
  end if;

  select p.id, p.status into v_product
    from public.products p
   where p.id = p_product_id and p.business_id = v_business;
  if not found then
    raise exception 'product_not_in_business: product % is not catalogued here', p_product_id
      using errcode = '22023';
  end if;
  if v_product.status <> 'active' then
    raise exception 'product_archived: archived products cannot receive stock'
      using errcode = '22023';
  end if;

  v_move := public.inventory_move(
    v_business, p_store_id, p_product_id, p_quantity,
    'receipt', 'product', p_product_id, nullif(trim(coalesce(p_note, '')), ''),
    p_idempotency_key, v_actor
  );

  if not (v_move ->> 'replayed')::boolean then
    perform public.write_audit(
      'stock.received', v_actor, v_actor_role, v_business, p_store_id,
      'product', p_product_id::text,
      jsonb_build_object('quantity', p_quantity, 'balance_after', v_move ->> 'balance_after',
                         'note', nullif(trim(coalesce(p_note, '')), ''))
    );
  end if;

  return jsonb_build_object(
    'product_id', p_product_id, 'store_id', p_store_id, 'quantity', p_quantity,
    'balance_after', v_move ->> 'balance_after', 'replayed', (v_move ->> 'replayed')::boolean
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- adjust_stock — manager+, reason mandatory (stock takes, damage, shrinkage).
-- Signed delta; never drives available stock negative.
-- ---------------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_store_id        uuid,
  p_product_id      uuid,
  p_delta           integer,
  p_reason          text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_actor_role public.app_role;
  v_business   uuid;
  v_product    record;
  v_move       jsonb;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'invalid_quantity: adjustments must be a non-zero whole number'
      using errcode = '22023';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason_required: stock adjustments need an explanation'
      using errcode = '22023';
  end if;

  select s.business_id into v_business from public.stores s where s.id = p_store_id;
  if not found then
    raise exception 'store_not_found' using errcode = 'P0002';
  end if;

  v_actor_role := public.business_role(v_business);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'manager') then
    raise exception 'not_authorized: only a manager or the owner can adjust stock'
      using errcode = '42501';
  end if;

  select p.id, p.status into v_product
    from public.products p
   where p.id = p_product_id and p.business_id = v_business;
  if not found then
    raise exception 'product_not_in_business: product % is not catalogued here', p_product_id
      using errcode = '22023';
  end if;
  if v_product.status <> 'active' then
    raise exception 'product_archived: archived products cannot be adjusted'
      using errcode = '22023';
  end if;

  v_move := public.inventory_move(
    v_business, p_store_id, p_product_id, p_delta,
    'adjustment', null, null, trim(p_reason), p_idempotency_key, v_actor
  );

  if not (v_move ->> 'replayed')::boolean then
    perform public.write_audit(
      'stock.adjusted', v_actor, v_actor_role, v_business, p_store_id,
      'product', p_product_id::text,
      jsonb_build_object('delta', p_delta, 'balance_after', v_move ->> 'balance_after',
                         'reason', trim(p_reason))
    );
  end if;

  return jsonb_build_object(
    'product_id', p_product_id, 'store_id', p_store_id, 'delta', p_delta,
    'balance_after', v_move ->> 'balance_after', 'replayed', (v_move ->> 'replayed')::boolean
  );
end;
$$;
