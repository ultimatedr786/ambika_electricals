-- ============================================================================
-- Fix: create_sale accepted payment.method = 'points' without ever debiting
-- the points ledger, creating an RPC-level accounting hole — a sale could be
-- recorded as "paid" partly in points with no corresponding deduction from
-- the customer's balance.
--
-- Investigated intent before fixing: the `sale_payments` table comment says
-- "the 'points' method is used by the redemption slice (points + cash at the
-- counter)", but the actual points-for-goods path already exists and is
-- fully implemented as `redeem_reward` (customer_points_balance debit via
-- ledger_post_entry, insufficient-points rejection, idempotency, a
-- collection code) — a materially different, already-correct mechanism from
-- "pay for a POS sale line with a raw points amount". create_sale has no
-- concept of a points-to-paise exchange rate for arbitrary sale totals, no
-- insufficient-points check on this path, and nothing in the shipped UI
-- (`live-pos-panel.tsx`'s PAYMENT_METHODS list) ever sends 'points'. Rather
-- than invent an undefined product behaviour, this migration closes the hole
-- outright: `create_sale` now refuses `payment.method = 'points'` the same
-- way it already refuses any other invalid method, with a message pointing
-- callers at the mechanism that actually exists. If "pay for a sale with
-- points" becomes a real product requirement, it should be designed and
-- implemented as its own reviewed change, not left as a silent no-op.
--
-- Only the "5. Payments must cover the total exactly" loop changed — the
-- rest of the function is byte-for-byte identical to the version it replaces.
-- ============================================================================
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
