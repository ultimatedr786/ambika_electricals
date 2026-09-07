-- ---------------------------------------------------------------------------
-- products.barcode — a real, camera-scannable or manually-typed barcode per
-- product, unique within a business when set (two products can both have no
-- barcode, but never share one). create_product / update_product are
-- redefined only to add this one field; every other line is unchanged from
-- 20260906140000_inventory.sql.
-- ---------------------------------------------------------------------------

alter table public.products add column if not exists barcode text;

alter table public.products drop constraint if exists products_barcode_len;
alter table public.products add constraint products_barcode_len
  check (barcode is null or length(trim(barcode)) between 4 and 48);

create unique index if not exists products_business_barcode_uidx
  on public.products (business_id, barcode) where barcode is not null;

-- `create or replace function` only replaces a function whose parameter
-- TYPE LIST matches exactly — adding a trailing parameter (even with a
-- default) creates a second overload instead, which then makes every old
-- positional call ambiguous ("function is not unique"). Drop the old-arity
-- overloads explicitly before redefining them with the new signature.
drop function if exists public.create_product(uuid, text, text, bigint, text, text, bigint, text, text, jsonb);
drop function if exists public.update_product(uuid, text, bigint, text, text, bigint, text, text, text);

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
  p_opening_stock jsonb   default '[]'::jsonb,
  p_barcode       text    default null
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
  v_barcode    text;
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
  v_barcode := nullif(trim(coalesce(p_barcode, '')), '');
  if v_barcode is not null and length(v_barcode) < 4 then
    raise exception 'invalid_barcode: a barcode needs at least 4 characters' using errcode = '22023';
  end if;
  if v_barcode is not null and exists (
    select 1 from public.products p where p.business_id = p_business_id and p.barcode = v_barcode
  ) then
    raise exception 'barcode_exists: % is already assigned to another product', v_barcode
      using errcode = '22023';
  end if;

  insert into public.products
    (business_id, sku, name, category, subcategory, unit, mrp_paise, price_paise, art_key, barcode)
  values
    (p_business_id, v_sku, trim(p_name), nullif(trim(coalesce(p_category, '')), ''),
     nullif(trim(coalesce(p_subcategory, '')), ''),
     coalesce(nullif(trim(p_unit), ''), 'piece'), p_mrp_paise, p_price_paise, p_art_key, v_barcode)
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
                       'opening_stock_stores', v_stocked, 'barcode', v_barcode)
  );

  return jsonb_build_object(
    'product_id', v_product_id, 'sku', v_sku, 'name', trim(p_name),
    'price_paise', p_price_paise, 'stores_stocked', v_stocked, 'barcode', v_barcode
  );
exception when unique_violation then
  if v_barcode is not null and exists (
    select 1 from public.products p where p.business_id = p_business_id and p.barcode = v_barcode
  ) then
    raise exception 'barcode_exists: % is already assigned to another product', v_barcode
      using errcode = '22023';
  end if;
  raise exception 'sku_exists: % is already catalogued in this business', v_sku
    using errcode = '22023';
end;
$$;

create or replace function public.update_product(
  p_product_id  uuid,
  p_name        text    default null,
  p_price_paise bigint  default null,
  p_category    text    default null,
  p_subcategory text    default null,
  p_mrp_paise   bigint  default null,
  p_unit        text    default null,
  p_art_key     text    default null,
  p_status      text    default null,
  p_barcode     text    default null
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
  v_barcode    text;
  v_barcode_set boolean := p_barcode is not null;
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
     and p_mrp_paise is null and p_unit is null and p_art_key is null and p_status is null
     and p_barcode is null then
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
  -- An explicit empty string clears the barcode; a genuinely absent argument
  -- (sql null) leaves whatever is stored untouched, matching category/subcategory.
  if v_barcode_set then
    v_barcode := nullif(trim(p_barcode), '');
    if v_barcode is not null and length(v_barcode) < 4 then
      raise exception 'invalid_barcode: a barcode needs at least 4 characters' using errcode = '22023';
    end if;
    if v_barcode is not null and exists (
      select 1 from public.products p
       where p.business_id = v_product.business_id and p.barcode = v_barcode and p.id <> p_product_id
    ) then
      raise exception 'barcode_exists: % is already assigned to another product', v_barcode
        using errcode = '22023';
    end if;
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
         status      = coalesce(v_new_status, status),
         barcode     = case when v_barcode_set then v_barcode else barcode end
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
exception when unique_violation then
  raise exception 'barcode_exists: barcode is already assigned to another product' using errcode = '22023';
end;
$$;

grant execute on function public.create_product(uuid, text, text, bigint, text, text, bigint, text, text, jsonb, text) to authenticated;
grant execute on function public.update_product(uuid, text, bigint, text, text, bigint, text, text, text, text) to authenticated;
revoke execute on function public.create_product(uuid, text, text, bigint, text, text, bigint, text, text, jsonb, text) from public, anon;
revoke execute on function public.update_product(uuid, text, bigint, text, text, bigint, text, text, text, text) from public, anon;
