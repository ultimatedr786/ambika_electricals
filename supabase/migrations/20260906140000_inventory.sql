-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2 · Step 3 · Slice 3: catalogue + per-store stock + append-only
-- inventory movements (architecture proposal §"Catalogue and inventory" and
-- §8.1 steps 3–7, adapted to the Step-2 schema as built).
--
-- Deviations from the proposal (documented in RLS_POLICIES.md §6):
--   * product_categories / product_images / brand hierarchy deferred —
--     free-text category/subcategory + art_key (Phase 1.3 illustrations)
--     cover the launch POS and UI; a customer-facing catalogue view is
--     deferred to the rewards/redemptions slice.
--   * Direct stock writes (receive/adjust) are MANAGER+ per the proposal's
--     Store-scoped row (§981); staff change stock only through create_sale,
--     which is already staff-authorized.
--   * inventory_movements adds balance_after + per-business idempotency_key
--     (points_ledger pattern) and keeps created_by FK-free (audit_logs
--     precedent: user deletion must never rewrite operational history).
--   * reserved stays 0 until the redemptions slice introduces holds.
--   * Re-pricing (§8.1 step 4): catalogue-backed lines are priced from
--     products.price_paise; a differing client price is REJECTED unless the
--     caller is manager+ (line flagged price_overridden, audited).
--   * Catalogue-backed lines need whole units (movements are integer deltas);
--     fractional units (wire per metre) stay snapshot-only until a units
--     slice. Voiding a sale restocks it with compensating 'sale_void'
--     movements — stock rows are never deleted, mirrors the points reversal.
--   * Lock order per §8.1 step 3: customer balance row → inventory rows
--     ordered by product_id → invoice counter (deadlock-free).
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.product_status as enum ('active', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.inventory_reason as enum (
    'initial', 'receipt', 'sale', 'sale_void', 'adjustment', 'stock_take',
    'redemption', 'redemption_cancel'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- products — writes are RPC-only (create_product / update_product); products
-- are never deleted, only archived.
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  sku           text not null,
  name          text not null,
  category      text,
  subcategory   text,
  unit          text not null default 'piece',
  mrp_paise     bigint check (mrp_paise is null or mrp_paise >= 0),
  price_paise   bigint not null check (price_paise >= 0),
  art_key       text,                  -- Phase 1.3 illustration key (fallback art)
  status        public.product_status not null default 'active',
  search_tsv    tsvector generated always as (
                  to_tsvector('simple',
                    coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(category, '')
                  )
                ) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint products_sku_unique unique (business_id, sku),
  constraint products_sku_format check (sku ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$'),
  constraint products_name_len check (length(trim(name)) between 1 and 160)
);

create index if not exists products_business_status_idx
  on public.products (business_id, status);
create index if not exists products_search_gin
  on public.products using gin (search_tsv);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- inventory_by_store — the CURRENT stock picture. Writes are RPC-only; the
-- authoritative history is inventory_movements below.
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_by_store (
  product_id    uuid not null references public.products (id) on delete cascade,
  store_id      uuid not null references public.stores (id) on delete cascade,
  on_hand       integer not null default 0 check (on_hand >= 0),
  reserved      integer not null default 0 check (reserved >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  updated_at    timestamptz not null default now(),
  primary key (product_id, store_id),
  constraint inventory_stock_sane check (on_hand >= reserved)
);

create index if not exists inventory_store_idx
  on public.inventory_by_store (store_id) include (on_hand);

drop trigger if exists inventory_by_store_set_updated_at on public.inventory_by_store;
create trigger inventory_by_store_set_updated_at
  before update on public.inventory_by_store
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- inventory_movements — APPEND ONLY. No UPDATE, no DELETE, ever (trigger for
-- every role including superuser/service_role; corrections are appended
-- movements). No DML grants to API roles — inserts happen only inside the
-- definer functions below.
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_movements (
  id              bigint generated always as identity primary key,
  business_id     uuid not null references public.businesses (id),
  store_id        uuid not null references public.stores (id),
  product_id      uuid not null references public.products (id),
  delta           integer not null check (delta <> 0),      -- signed
  balance_after   integer not null check (balance_after >= 0),
  reason          public.inventory_reason not null,
  reference_type  text,
  reference_id    uuid,
  note            text,
  -- FK-free on purpose (audit_logs / points_ledger precedent).
  created_by      uuid,
  idempotency_key text,
  created_at      timestamptz not null default now(),
  constraint inv_movements_adjustment_note check (
    reason <> 'adjustment' or (note is not null and length(trim(note)) > 0)
  ),
  constraint inv_movements_ref_known check (
    reference_type is null or reference_type in ('sale', 'product', 'redemption')
  ),
  constraint inv_movements_idem_len check (
    idempotency_key is null or length(trim(idempotency_key)) between 4 and 120
  )
);

create unique index if not exists inv_movements_idem_uq
  on public.inventory_movements (business_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists inv_movements_product_store_idx
  on public.inventory_movements (product_id, store_id, id desc);
create index if not exists inv_movements_business_created_idx
  on public.inventory_movements (business_id, created_at desc);

create or replace function public.inventory_movements_no_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'inventory_movements is immutable: % is not permitted (append a compensating movement instead)', tg_op
    using errcode = '22023'; -- invalid_parameter_value
end;
$$;

drop trigger if exists inventory_movements_immutable on public.inventory_movements;
create trigger inventory_movements_immutable
  before update or delete on public.inventory_movements
  for each row execute function public.inventory_movements_no_mutation();

-- ---------------------------------------------------------------------------
-- sale_items — wire the catalogue FK the sales slice reserved, plus the
-- manager price-override flag (§8.1 step 4).
-- ---------------------------------------------------------------------------
alter table public.sale_items
  add column if not exists price_overridden boolean not null default false;

do $$ begin
  alter table public.sale_items
    add constraint sale_items_product_fk
    foreign key (product_id) references public.products (id);
exception when duplicate_object then null;
end $$;

create index if not exists sale_items_product_idx on public.sale_items (product_id);

-- ---------------------------------------------------------------------------
-- inventory_move — INTERNAL mover (like ledger_post_entry): EXECUTE revoked
-- from API roles, callable from the definer RPCs below. Locks the stock row,
-- enforces on_hand >= reserved, appends the movement, replay-safe on the
-- per-business idempotency key.
-- ---------------------------------------------------------------------------
create or replace function public.inventory_move(
  p_business uuid,
  p_store    uuid,
  p_product  uuid,
  p_delta    integer,
  p_reason   public.inventory_reason,
  p_ref_type text,
  p_ref_id   uuid,
  p_note     text,
  p_idem     text,
  p_actor    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv        record;
  v_name       text;
  v_movement   bigint;
  v_balance    integer;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'invalid_quantity: stock movements must be non-zero' using errcode = '22023';
  end if;

  -- Idempotent replay.
  if p_idem is not null then
    select im.id, im.balance_after into v_inv
      from public.inventory_movements im
     where im.business_id = p_business and im.idempotency_key = p_idem;
    if found then
      return jsonb_build_object(
        'movement_id', v_inv.id, 'balance_after', v_inv.balance_after, 'replayed', true
      );
    end if;
  end if;

  insert into public.inventory_by_store (product_id, store_id, on_hand)
  values (p_product, p_store, 0)
  on conflict (product_id, store_id) do nothing;

  select ibs.on_hand, ibs.reserved into v_inv
    from public.inventory_by_store ibs
   where ibs.product_id = p_product and ibs.store_id = p_store
     for update;

  if v_inv.on_hand + p_delta < v_inv.reserved then
    select p.name into v_name from public.products p where p.id = p_product;
    raise exception 'insufficient_stock: % — have % available, movement needs %',
      coalesce(v_name, p_product::text), v_inv.on_hand - v_inv.reserved, -p_delta
      using errcode = '22023';
  end if;

  update public.inventory_by_store
     set on_hand = on_hand + p_delta
   where product_id = p_product and store_id = p_store;
  v_balance := v_inv.on_hand + p_delta;

  insert into public.inventory_movements
    (business_id, store_id, product_id, delta, balance_after, reason,
     reference_type, reference_id, note, created_by, idempotency_key)
  values
    (p_business, p_store, p_product, p_delta, v_balance, p_reason,
     p_ref_type, p_ref_id, p_note, p_actor, p_idem)
  returning id into v_movement;

  return jsonb_build_object(
    'movement_id', v_movement, 'balance_after', v_balance, 'replayed', false
  );
exception when unique_violation then
  -- Lost an idempotency race — replay the winner.
  if p_idem is not null then
    select im.id, im.balance_after into v_inv
      from public.inventory_movements im
     where im.business_id = p_business and im.idempotency_key = p_idem;
    if found then
      return jsonb_build_object(
        'movement_id', v_inv.id, 'balance_after', v_inv.balance_after, 'replayed', true
      );
    end if;
  end if;
  raise;
end;
$$;

revoke execute on function public.inventory_move(uuid, uuid, uuid, integer, public.inventory_reason, text, uuid, text, text, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_product — manager+. Optional opening stock [{store_id, qty}] is
-- posted as 'initial' movements (never a bare inventory row without history).
-- ---------------------------------------------------------------------------
create or replace function public.create_product(
  p_business_id   uuid,
  p_name          text,
  p_sku           text,
  p_price_paise   bigint,
  p_category      text    default null,
  p_subcategory   text    default null,
  p_mrp_paise     bigint  default null,
  p_unit          text    default 'piece',
  p_art_key       text    default null,
  p_opening_stock jsonb   default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_actor_role public.app_role;
  v_sku        text;
  v_product_id uuid;
  v_stock      record;
  v_store_biz  uuid;
  v_stocked    integer := 0;
  v_move       jsonb;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  v_actor_role := public.business_role(p_business_id);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'manager') then
    raise exception 'not_authorized: only a manager or the owner can manage products'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.status = 'active') then
    raise exception 'business_inactive' using errcode = '22023';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_product: a product needs a name' using errcode = '22023';
  end if;
  v_sku := upper(trim(coalesce(p_sku, '')));
  if v_sku !~ '^[A-Z0-9][A-Z0-9._-]{2,31}$' then
    raise exception 'invalid_sku: 3–32 letters/digits/._- starting alphanumeric' using errcode = '22023';
  end if;
  if p_price_paise is null or p_price_paise < 0 then
    raise exception 'invalid_price: price must be a non-negative paise amount' using errcode = '22023';
  end if;
  if exists (select 1 from public.products p where p.business_id = p_business_id and p.sku = v_sku) then
    raise exception 'sku_exists: % is already catalogued in this business', v_sku
      using errcode = '22023';
  end if;

  insert into public.products
    (business_id, sku, name, category, subcategory, unit, mrp_paise, price_paise, art_key)
  values
    (p_business_id, v_sku, trim(p_name), nullif(trim(coalesce(p_category, '')), ''),
     nullif(trim(coalesce(p_subcategory, '')), ''),
     coalesce(nullif(trim(p_unit), ''), 'piece'), p_mrp_paise, p_price_paise, p_art_key)
  returning id into v_product_id;

  if p_opening_stock is not null and jsonb_typeof(p_opening_stock) = 'array' then
    for v_stock in
      select * from jsonb_to_recordset(p_opening_stock) as s(store_id uuid, qty integer)
    loop
      if v_stock.qty is null or v_stock.qty <= 0 then
        raise exception 'invalid_quantity: opening stock must be a positive whole number'
          using errcode = '22023';
      end if;
      select s.business_id into v_store_biz from public.stores s where s.id = v_stock.store_id;
      if not found or v_store_biz <> p_business_id then
        raise exception 'store_not_in_business: store % is not part of this business', v_stock.store_id
          using errcode = '22023';
      end if;
      v_move := public.inventory_move(
        p_business_id, v_stock.store_id, v_product_id, v_stock.qty,
        'initial', 'product', v_product_id, 'Opening stock',
        'product-opening:' || v_product_id::text || ':' || v_stock.store_id::text,
        v_actor
      );
      v_stocked := v_stocked + 1;
    end loop;
  end if;

  perform public.write_audit(
    'product.created', v_actor, v_actor_role, p_business_id, null,
    'product', v_product_id::text,
    jsonb_build_object('sku', v_sku, 'name', trim(p_name), 'price_paise', p_price_paise,
                       'opening_stock_stores', v_stocked)
  );

  return jsonb_build_object(
    'product_id', v_product_id, 'sku', v_sku, 'name', trim(p_name),
    'price_paise', p_price_paise, 'stores_stocked', v_stocked
  );
exception when unique_violation then
  raise exception 'sku_exists: % is already catalogued in this business', v_sku
    using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- update_product — manager+. Partial update (only supplied fields change);
-- products are archived, never deleted; price changes land in the audit.
-- ---------------------------------------------------------------------------
create or replace function public.update_product(
  p_product_id  uuid,
  p_name        text    default null,
  p_price_paise bigint  default null,
  p_category    text    default null,
  p_subcategory text    default null,
  p_mrp_paise   bigint  default null,
  p_unit        text    default null,
  p_art_key     text    default null,
  p_status      text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_actor_role public.app_role;
  v_product    record;
  v_old_price  bigint;
  v_new_status public.product_status;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select p.id, p.business_id, p.sku, p.name, p.price_paise, p.status
    into v_product
    from public.products p
   where p.id = p_product_id
     for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  v_actor_role := public.business_role(v_product.business_id);
  if v_actor_role is null or not public.role_at_least(v_actor_role, 'manager') then
    raise exception 'not_authorized: only a manager or the owner can manage products'
      using errcode = '42501';
  end if;

  if p_name is null and p_price_paise is null and p_category is null and p_subcategory is null
     and p_mrp_paise is null and p_unit is null and p_art_key is null and p_status is null then
    raise exception 'nothing_to_update: supply at least one field' using errcode = '22023';
  end if;
  if p_price_paise is not null and p_price_paise < 0 then
    raise exception 'invalid_price: price must be a non-negative paise amount' using errcode = '22023';
  end if;
  if p_name is not null and length(trim(p_name)) = 0 then
    raise exception 'invalid_product: a product needs a name' using errcode = '22023';
  end if;
  if p_status is not null then
    begin
      v_new_status := p_status::public.product_status;
    exception when invalid_text_representation then
      raise exception 'invalid_status: products are active or archived (never deleted)'
        using errcode = '22023';
    end;
  end if;

  v_old_price := v_product.price_paise;

  update public.products
     set name        = coalesce(nullif(trim(p_name), ''), name),
         price_paise = coalesce(p_price_paise, price_paise),
         category    = case when p_category    is null then category    else nullif(trim(p_category), '')    end,
         subcategory = case when p_subcategory is null then subcategory else nullif(trim(p_subcategory), '') end,
         mrp_paise   = coalesce(p_mrp_paise, mrp_paise),
         unit        = coalesce(nullif(trim(coalesce(p_unit, '')), ''), unit),
         art_key     = coalesce(p_art_key, art_key),
         status      = coalesce(v_new_status, status)
   where id = p_product_id;

  perform public.write_audit(
    'product.updated', v_actor, v_actor_role, v_product.business_id, null,
    'product', p_product_id::text,
    jsonb_build_object(
      'sku', v_product.sku,
      'price_before', v_old_price,
      'price_after', coalesce(p_price_paise, v_old_price),
      'status_after', coalesce(v_new_status::text, v_product.status::text)
    )
  );

  return jsonb_build_object(
    'product_id', p_product_id, 'sku', v_product.sku,
    'price_paise', coalesce(p_price_paise, v_old_price),
    'status', coalesce(v_new_status::text, v_product.status::text)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- receive_stock — manager+ (proposal §Store-scoped: inventory writes are
-- owner/manager). Appends a 'receipt' movement; replay-safe on the key.
-- ---------------------------------------------------------------------------
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
    'balance_after', v_move ->> 'balance_after', 'replayed', v_move ->> 'replayed'
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
    'balance_after', v_move ->> 'balance_after', 'replayed', v_move ->> 'replayed'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- create_sale v2 — Slice-2 flow plus §8.1 steps 3–5: deterministic lock
-- order (balance → inventory by product_id → invoice counter), server
-- re-pricing from the catalogue (manager+ override, flagged & audited) and
-- stock validation + decrement through inventory_move. Snapshot-only lines
-- (no product_id) behave exactly as in Slice 2.
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
  v_earn         record;
  v_counter      bigint;
  v_invoice      text;
  v_sale_id      uuid;
  v_pay_sum      bigint := 0;
  v_ledger       jsonb;
  v_balance      integer := null;
  v_item_count   integer := 0;
  v_stock_lines  integer := 0;
  v_overrides    integer := 0;
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

  -- 7. Points (launch policy from the business row; floor on exact paise).
  select b.earn_spend_paise, b.earn_points into v_earn
    from public.businesses b where b.id = v_business;
  if p_customer_membership_id is not null and v_earn.earn_points > 0 then
    v_base_points := floor(v_total::numeric * v_earn.earn_points / v_earn.earn_spend_paise)::integer;
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
     base_points, bonus_points, total_points, sold_by_profile_id, idempotency_key)
  values
    (v_business, p_store_id, p_customer_membership_id, v_invoice,
     v_subtotal, v_discount, 0, v_total,
     v_base_points, 0, v_base_points, v_actor, p_idempotency_key)
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
      'stock_lines', v_stock_lines, 'price_overrides', v_overrides
    )
  );

  return jsonb_build_object(
    'sale_id', v_sale_id, 'invoice_no', v_invoice,
    'subtotal_paise', v_subtotal, 'discount_paise', v_discount, 'total_paise', v_total,
    'points', jsonb_build_object('base', v_base_points, 'bonus', 0, 'total', v_base_points),
    'balance_after', v_balance, 'replayed', false,
    'stock_lines', v_stock_lines, 'price_overrides', v_overrides
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
-- void_sale v2 — Slice-2 semantics plus stock restoration: every catalogue
-- line is restocked with a compensating 'sale_void' movement (idempotent per
-- sale+product). Points reversal unchanged (Slice 1/2).
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
  v_line       record;
  v_ledger     jsonb;
  v_balance    integer := null;
  v_restocked  integer := 0;
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

  -- Restore stock for catalogue lines (compensating movements, replay-safe).
  for v_line in
    select si.product_id, sum(si.qty)::integer as units
      from public.sale_items si
     where si.sale_id = v_sale.id and si.product_id is not null
     group by si.product_id
  loop
    perform public.inventory_move(
      v_sale.business_id, v_sale.store_id, v_line.product_id, v_line.units,
      'sale_void', 'sale', v_sale.id, 'Void ' || v_sale.invoice_no || ': ' || trim(p_reason),
      'sale-void-stock:' || v_sale.id::text || ':' || v_line.product_id::text,
      v_actor
    );
    v_restocked := v_restocked + 1;
  end loop;

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
                       'points_reversed', v_sale.total_points, 'stock_lines_restored', v_restocked)
  );

  return jsonb_build_object(
    'sale_id', v_sale.id, 'invoice_no', v_sale.invoice_no,
    'points_reversed', v_sale.total_points, 'balance_after', v_balance,
    'stock_lines_restored', v_restocked
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS — staff+ see the whole business catalogue/stock/movements (consistent
-- with the sales matrix); customers get nothing until the rewards slice adds
-- a customer-facing catalogue view. Writes are RPC-only: no DML grants.
-- ---------------------------------------------------------------------------
alter table public.products            enable row level security;
alter table public.inventory_by_store  enable row level security;
alter table public.inventory_movements enable row level security;

drop policy if exists "products_select_business" on public.products;
create policy "products_select_business" on public.products
  for select to authenticated
  using (business_id in (select * from public.my_businesses('staff')));

drop policy if exists "inventory_by_store_select_business" on public.inventory_by_store;
create policy "inventory_by_store_select_business" on public.inventory_by_store
  for select to authenticated
  using (exists (
    select 1 from public.stores s
     where s.id = inventory_by_store.store_id
       and s.business_id in (select * from public.my_businesses('staff'))
  ));

drop policy if exists "inventory_movements_select_business" on public.inventory_movements;
create policy "inventory_movements_select_business" on public.inventory_movements
  for select to authenticated
  using (business_id in (select * from public.my_businesses('staff')));

-- ---------------------------------------------------------------------------
-- grants — SELECT-only for API roles; all writes flow through the definer
-- RPCs; inventory_move stays internal.
-- ---------------------------------------------------------------------------
revoke all on public.products            from public, anon, authenticated;
revoke all on public.inventory_by_store  from public, anon, authenticated;
revoke all on public.inventory_movements from public, anon, authenticated;

grant select on public.products            to authenticated;
grant select on public.inventory_by_store  to authenticated;
grant select on public.inventory_movements to authenticated;

grant execute on function public.create_product(uuid, text, text, bigint, text, text, bigint, text, text, jsonb) to authenticated;
grant execute on function public.update_product(uuid, text, bigint, text, text, bigint, text, text, text) to authenticated;
grant execute on function public.receive_stock(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, integer, text, text) to authenticated;
revoke execute on function public.create_product(uuid, text, text, bigint, text, text, bigint, text, text, jsonb) from public, anon;
revoke execute on function public.update_product(uuid, text, bigint, text, text, bigint, text, text, text) from public, anon;
revoke execute on function public.receive_stock(uuid, uuid, integer, text, text) from public, anon;
revoke execute on function public.adjust_stock(uuid, uuid, integer, text, text) from public, anon;

grant all on public.products            to service_role;
grant all on public.inventory_by_store  to service_role;
grant all on public.inventory_movements to service_role;
grant usage, select on sequence public.inventory_movements_id_seq to service_role;
