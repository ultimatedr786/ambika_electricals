-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2 Step 3 · Slice 2 — SERVER-AUTHORITATIVE SALES
-- Architecture proposal §8.1 `create_sale`, adapted to what exists after
-- Slices 0–1 (no products/inventory/rule-sets tables yet):
--   * line items carry NAME/SKU/PRICE SNAPSHOTS supplied by the POS; when the
--     inventory slice lands, `product_id` gets its FK and server re-pricing
--     from `products` supersedes snapshot prices (proposal §8.1 step 4).
--   * points use the launch policy columns on `businesses`
--     (₹100 → 10 points by default) instead of `loyalty_rule_sets`; the rule
--     engine slice will price sales from published rule-set snapshots.
--   * idempotency lives on the sale row itself (unique business+key, replay
--     returns the stored sale) instead of a generic idempotency_keys table —
--     same guarantee, less machinery. Deviation documented in RLS_POLICIES.md.
-- All writes flow through SECURITY DEFINER RPCs; no DML grants for API roles.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.sale_status as enum ('completed', 'voided', 'refunded');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_method as enum ('cash', 'upi', 'card', 'credit', 'points', 'other');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- launch loyalty policy on businesses (spec §2.5: ₹100 → 10 points, 1 point
-- = ₹0.10, no expiry). Owners may tune earn rates later via the settings
-- slice; point VALUE is display-side (₹0.10) and not stored per business.
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column if not exists earn_spend_paise integer not null default 10000,
  add column if not exists earn_points      integer not null default 10;

do $$ begin
  alter table public.businesses
    add constraint businesses_earn_spend_positive check (earn_spend_paise > 0);
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table public.businesses
    add constraint businesses_earn_points_non_negative check (earn_points >= 0);
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- invoice counters — one locked row per business gives gap-tolerant,
-- race-free sequential invoice numbers.
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_counters (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  next_seq    bigint not null default 1 check (next_seq > 0)
);

-- ---------------------------------------------------------------------------
-- sales
-- ---------------------------------------------------------------------------
create table if not exists public.sales (
  id                     uuid primary key default gen_random_uuid(),
  business_id            uuid not null references public.businesses (id) on delete cascade,
  store_id               uuid not null references public.stores (id),
  -- null = anonymous walk-in (no points). FK to memberships, never deleted.
  customer_membership_id uuid references public.customer_memberships (id),
  invoice_no             text not null,
  subtotal_paise         bigint not null check (subtotal_paise >= 0),
  discount_paise         bigint not null default 0 check (discount_paise >= 0),
  tax_paise              bigint not null default 0 check (tax_paise >= 0),
  total_paise            bigint not null check (total_paise >= 0),
  base_points            integer not null default 0 check (base_points >= 0),
  bonus_points           integer not null default 0 check (bonus_points >= 0),
  total_points           integer not null default 0 check (total_points >= 0),
  status                 public.sale_status not null default 'completed',
  sold_by_profile_id     uuid references public.profiles (id) on delete set null,
  sold_at                timestamptz not null default now(),
  idempotency_key        text,
  voided_at              timestamptz,
  void_reason            text,
  voided_by              uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint sales_total_matches check (total_paise = subtotal_paise - discount_paise + tax_paise),
  constraint sales_points_match  check (total_points = base_points + bonus_points),
  constraint sales_invoice_format check (invoice_no ~ '^INV-[0-9]{6,12}$'),
  constraint sales_void_fields check (
    (status = 'voided') = (voided_at is not null and voided_by is not null and void_reason is not null)
  ),
  constraint sales_idempotency_key_len check (
    idempotency_key is null or length(trim(idempotency_key)) between 4 and 120
  ),
  constraint sales_unique_invoice unique (business_id, invoice_no)
);

create unique index if not exists sales_idem_uq
  on public.sales (business_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists sales_store_sold_at_idx
  on public.sales (store_id, sold_at desc);
create index if not exists sales_customer_idx
  on public.sales (customer_membership_id, sold_at desc);

drop trigger if exists sales_set_updated_at on public.sales;
create trigger sales_set_updated_at
  before update on public.sales
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sale_items — snapshot lines (see header). line_total is server-computed:
-- round(qty × unit_price) − line_discount, enforced by CHECK so even a buggy
-- RPC cannot store inconsistent money.
-- ---------------------------------------------------------------------------
create table if not exists public.sale_items (
  id                 uuid primary key default gen_random_uuid(),
  sale_id            uuid not null references public.sales (id) on delete cascade,
  -- FK added by the inventory slice when public.products exists:
  product_id         uuid,
  sku_snapshot       text,
  name_snapshot      text not null,
  qty                numeric(12,3) not null check (qty > 0),
  unit_price_paise   bigint not null check (unit_price_paise >= 0),
  line_discount_paise bigint not null default 0 check (line_discount_paise >= 0),
  line_total_paise   bigint not null check (line_total_paise >= 0),
  points_awarded     integer not null default 0,
  constraint sale_items_line_total check (
    line_total_paise = (round(qty * unit_price_paise) - line_discount_paise)::bigint
  ),
  constraint sale_items_line_discount_max check (
    line_discount_paise <= round(qty * unit_price_paise)::bigint
  ),
  constraint sale_items_name_len check (length(trim(name_snapshot)) between 1 and 160)
);

create index if not exists sale_items_sale_idx on public.sale_items (sale_id);

-- ---------------------------------------------------------------------------
-- sale_payments — supports split payments now; the 'points' method is used by
-- the redemption slice (points + cash at the counter).
-- ---------------------------------------------------------------------------
create table if not exists public.sale_payments (
  id            uuid primary key default gen_random_uuid(),
  sale_id       uuid not null references public.sales (id) on delete cascade,
  method        public.payment_method not null,
  amount_paise  bigint not null check (amount_paise > 0),
  reference     text,
  captured_at   timestamptz not null default now()
);

create index if not exists sale_payments_sale_idx on public.sale_payments (sale_id);

-- ---------------------------------------------------------------------------
-- integrity trigger — store must belong to the sale's business; member (when
-- present) must belong to the same business and be active.
-- ---------------------------------------------------------------------------
create or replace function public.sales_insert_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.stores s where s.id = new.store_id and s.business_id = new.business_id
  ) then
    raise exception 'sale store % does not belong to business %', new.store_id, new.business_id
      using errcode = '22023';
  end if;
  if new.customer_membership_id is not null then
    if not exists (
      select 1 from public.customer_memberships cm
       where cm.id = new.customer_membership_id
         and cm.business_id = new.business_id
         and cm.status = 'active'
    ) then
      raise exception 'sale member % is not an active membership of business %',
        new.customer_membership_id, new.business_id
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sales_insert_guard on public.sales;
create trigger sales_insert_guard
  before insert on public.sales
  for each row execute function public.sales_insert_check();

-- ---------------------------------------------------------------------------
-- create_sale — the POS write (proposal §8.1, adapted). One transaction:
-- authorize → validate items/payments → invoice counter → sale + items +
-- payments → ledger earn (Slice 1 RPC internals) → audit → typed response.
-- ---------------------------------------------------------------------------
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
  v_subtotal     bigint := 0;
  v_line_total   bigint;
  v_total        bigint;
  v_discount     bigint := coalesce(p_discount_paise, 0);
  v_base_points  integer := 0;
  v_earn         record;
  v_counter      bigint;
  v_invoice      text;
  v_sale_id      uuid;
  v_pay_sum      bigint := 0;
  v_ledger       jsonb;
  v_balance      integer := null;
  v_item_count   integer := 0;
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

  -- 4. Validate + price line items server-side (snapshots until the products
  --    slice; totals are computed here, never trusted from the client).
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
    if v_item.name is null or length(trim(v_item.name)) = 0 then
      raise exception 'invalid_item: line % has no name', v_item_count using errcode = '22023';
    end if;
    if v_item.qty is null or v_item.qty <= 0 then
      raise exception 'invalid_item: line % (%) needs qty > 0', v_item_count, v_item.name
        using errcode = '22023';
    end if;
    if v_item.unit_price_paise is null or v_item.unit_price_paise < 0 then
      raise exception 'invalid_item: line % (%) needs a non-negative unit price', v_item_count, v_item.name
        using errcode = '22023';
    end if;
    v_line_total := (round(v_item.qty * v_item.unit_price_paise) - coalesce(v_item.line_discount_paise, 0))::bigint;
    if v_line_total < 0 then
      raise exception 'invalid_item: line % (%) discount exceeds its gross', v_item_count, v_item.name
        using errcode = '22023';
    end if;
    v_subtotal := v_subtotal + v_line_total;
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
      perform v_pay.method::public.payment_method;
    exception when invalid_text_representation then
      raise exception 'invalid_payment_method: %', v_pay.method using errcode = '22023';
    end;
    v_pay_sum := v_pay_sum + v_pay.amount_paise;
  end loop;
  if v_pay_sum <> v_total then
    raise exception 'payment_mismatch: payments % do not equal total %', v_pay_sum, v_total
      using errcode = '22023';
  end if;

  -- 6. Points (launch policy from the business row; floor on exact paise).
  select b.earn_spend_paise, b.earn_points into v_earn
    from public.businesses b where b.id = v_business;
  if p_customer_membership_id is not null and v_earn.earn_points > 0 then
    v_base_points := floor(v_total::numeric * v_earn.earn_points / v_earn.earn_spend_paise)::integer;
  end if;

  -- 7. Invoice counter (locked row per business).
  insert into public.invoice_counters (business_id) values (v_business)
    on conflict (business_id) do nothing;
  select ic.next_seq into v_counter from public.invoice_counters ic
   where ic.business_id = v_business for update;
  update public.invoice_counters set next_seq = next_seq + 1 where business_id = v_business;
  v_invoice := 'INV-' || lpad(v_counter::text, 6, '0');

  -- 8. Write the sale.
  insert into public.sales
    (business_id, store_id, customer_membership_id, invoice_no,
     subtotal_paise, discount_paise, tax_paise, total_paise,
     base_points, bonus_points, total_points, sold_by_profile_id, idempotency_key)
  values
    (v_business, p_store_id, p_customer_membership_id, v_invoice,
     v_subtotal, v_discount, 0, v_total,
     v_base_points, 0, v_base_points, v_actor, p_idempotency_key)
  returning id into v_sale_id;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(
      product_id uuid, name text, sku text, qty numeric,
      unit_price_paise bigint, line_discount_paise bigint
    )
  loop
    insert into public.sale_items
      (sale_id, product_id, sku_snapshot, name_snapshot, qty,
       unit_price_paise, line_discount_paise, line_total_paise)
    values
      (v_sale_id, v_item.product_id, v_item.sku, trim(v_item.name), v_item.qty,
       v_item.unit_price_paise, coalesce(v_item.line_discount_paise, 0),
       (round(v_item.qty * v_item.unit_price_paise) - coalesce(v_item.line_discount_paise, 0))::bigint);
  end loop;

  for v_pay in
    select * from jsonb_to_recordset(p_payments) as y(method text, amount_paise bigint, reference text)
  loop
    insert into public.sale_payments (sale_id, method, amount_paise, reference)
    values (v_sale_id, v_pay.method::public.payment_method, v_pay.amount_paise, v_pay.reference);
  end loop;

  -- 9. Ledger earn (Slice 1 internals; idempotent on the sale id).
  if v_base_points > 0 then
    v_ledger := public.ledger_post_entry(
      v_business, p_customer_membership_id, 'earn', v_base_points,
      'sale', v_sale_id, p_store_id, 'Sale ' || v_invoice, 'sale:' || v_sale_id::text,
      'points.awarded'
    );
    v_balance := (v_ledger ->> 'balance_after')::integer;
  end if;

  -- 10. Audit + response.
  perform public.write_audit(
    'sale.created', v_actor, v_actor_role, v_business, p_store_id,
    'sale', v_sale_id::text,
    jsonb_build_object(
      'invoice_no', v_invoice, 'total_paise', v_total,
      'points', v_base_points, 'membership', p_customer_membership_id
    )
  );

  return jsonb_build_object(
    'sale_id', v_sale_id, 'invoice_no', v_invoice,
    'subtotal_paise', v_subtotal, 'discount_paise', v_discount, 'total_paise', v_total,
    'points', jsonb_build_object('base', v_base_points, 'bonus', 0, 'total', v_base_points),
    'balance_after', v_balance, 'replayed', false
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

-- ---------------------------------------------------------------------------
-- void_sale — manager+, reason required, never deletes: flips status and
-- appends a compensating 'adjust' ledger entry (points come back only through
-- an audited reversal, per proposal §8.1).
-- ---------------------------------------------------------------------------
create or replace function public.void_sale(p_sale_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_actor_role public.app_role;
  v_sale       record;
  v_ledger     jsonb;
  v_balance    integer := null;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason_required: voiding a sale needs an explanation' using errcode = '22023';
  end if;

  select sa.id, sa.business_id, sa.store_id, sa.status, sa.invoice_no,
         sa.total_points, sa.customer_membership_id
    into v_sale
    from public.sales sa
   where sa.id = p_sale_id
     for update;
  if not found then
    raise exception 'sale_not_found' using errcode = 'P0002';
  end if;

  v_actor_role := public.business_role(v_sale.business_id);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'manager') then
    raise exception 'not_authorized: only a manager or the owner can void sales'
      using errcode = '42501';
  end if;

  if v_sale.status <> 'completed' then
    raise exception 'sale_not_voidable: sale % is already %', v_sale.invoice_no, v_sale.status
      using errcode = '22023';
  end if;

  update public.sales
     set status = 'voided', voided_at = now(), void_reason = trim(p_reason), voided_by = v_actor
   where id = v_sale.id;

  -- Reverse earned points with an audited compensating entry.
  if v_sale.total_points > 0 and v_sale.customer_membership_id is not null then
    v_ledger := public.ledger_post_entry(
      v_sale.business_id, v_sale.customer_membership_id, 'adjust', -v_sale.total_points,
      'adjustment', v_sale.id, v_sale.store_id,
      'Void sale ' || v_sale.invoice_no || ': ' || trim(p_reason),
      'sale-void:' || v_sale.id::text,
      'points.adjusted'
    );
    v_balance := (v_ledger ->> 'balance_after')::integer;
  end if;

  perform public.write_audit(
    'sale.voided', v_actor, v_actor_role, v_sale.business_id, v_sale.store_id,
    'sale', v_sale.id::text,
    jsonb_build_object('invoice_no', v_sale.invoice_no, 'reason', trim(p_reason),
                       'points_reversed', v_sale.total_points)
  );

  return jsonb_build_object(
    'sale_id', v_sale.id, 'invoice_no', v_sale.invoice_no,
    'points_reversed', v_sale.total_points, 'balance_after', v_balance
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS + fail-closed grants (Step-2 pattern).
--   * staff+ read their whole business; customers read their OWN sales.
--   * items/payments visibility follows the parent sale through EXISTS.
--   * no INSERT/UPDATE/DELETE grants — create_sale/void_sale only.
-- ---------------------------------------------------------------------------
alter table public.sales          enable row level security;
alter table public.sale_items     enable row level security;
alter table public.sale_payments  enable row level security;
alter table public.invoice_counters enable row level security;

revoke all on public.sales           from public, anon, authenticated;
revoke all on public.sale_items      from public, anon, authenticated;
revoke all on public.sale_payments   from public, anon, authenticated;
revoke all on public.invoice_counters from public, anon, authenticated;

grant select on public.sales         to authenticated;
grant select on public.sale_items    to authenticated;
grant select on public.sale_payments to authenticated;
-- invoice_counters: NO grant to authenticated (internal bookkeeping).

grant execute on function public.create_sale(uuid, jsonb, jsonb, uuid, bigint, text) to authenticated;
grant execute on function public.void_sale(uuid, text) to authenticated;
revoke execute on function public.create_sale(uuid, jsonb, jsonb, uuid, bigint, text) from public, anon;
revoke execute on function public.void_sale(uuid, text) from public, anon;

drop policy if exists "sales_select_business" on public.sales;
create policy "sales_select_business" on public.sales
  for select to authenticated
  using (business_id in (select * from public.my_businesses('staff')));

drop policy if exists "sales_select_own_customer" on public.sales;
create policy "sales_select_own_customer" on public.sales
  for select to authenticated
  using (
    customer_membership_id in (
      select cm.id from public.customer_memberships cm where cm.profile_id = auth.uid()
    )
  );

drop policy if exists "sale_items_select" on public.sale_items;
create policy "sale_items_select" on public.sale_items
  for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));

drop policy if exists "sale_payments_select" on public.sale_payments;
create policy "sale_payments_select" on public.sale_payments
  for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));

-- invoice_counters: RLS enabled with NO policies → invisible to API roles.

grant all on public.sales          to service_role;
grant all on public.sale_items     to service_role;
grant all on public.sale_payments  to service_role;
grant all on public.invoice_counters to service_role;
