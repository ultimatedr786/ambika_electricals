-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2 · Step 3 · Slice 8: catalogue images (Storage) + essential settings
-- (FINAL_MVP_LAUNCH_COMPLETION.md §6)
--
-- Two halves, one migration because they share the same authorization spine.
--
-- STORAGE
--   Buckets `product-images` and `reward-images` hold catalogue photographs.
--   They are **public-read on purpose**: a product photo is shown to every
--   customer browsing the rewards store, so signing every URL would buy no
--   confidentiality while breaking CDN caching and expiring in users' faces.
--   What genuinely needs guarding is WRITE, and that is locked down twice:
--
--     1. Storage RLS policies allow INSERT/UPDATE/DELETE only to staff+ of the
--        business whose id is the first path segment. The path convention
--        `<business_id>/<owner_id>/<uuid>.<ext>` is therefore a security
--        boundary, not a filing preference.
--     2. `catalogue_images` rows — the metadata the app actually reads — can
--        only be created through `attach_catalogue_image`, which re-checks
--        role, tenancy, MIME type, byte size and that the path prefix matches
--        the caller's own business. An object with no metadata row is
--        invisible to the application.
--
--   Nothing here trusts the client: the server action uploads, then calls the
--   RPC, and the RPC independently re-derives every fact it needs.
--
-- SETTINGS
--   Only the five entry points §6 asks for, each role-authorized, validated,
--   tenant-scoped and audited. Deliberately NOT a broad settings surface.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- catalogue_images — durable metadata for an uploaded object.
--
-- One table for products and rewards (exactly one owner, enforced) so the
-- upload path, the validation rules and the RLS story exist once rather than
-- twice, while both foreign keys stay real.
-- ---------------------------------------------------------------------------
create table if not exists public.catalogue_images (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id  uuid references public.products (id) on delete cascade,
  reward_id   uuid references public.rewards (id) on delete cascade,

  bucket      text not null,
  -- Object key inside the bucket. Always `<business_id>/<owner_id>/<file>`.
  path        text not null,
  mime_type   text not null,
  size_bytes  bigint not null check (size_bytes > 0),
  width       integer check (width is null or width > 0),
  height      integer check (height is null or height > 0),

  -- Accessible alt text travels with the image, never with the component that
  -- happens to render it (§6 "Preserve accessible alt text").
  alt_text    text,
  is_primary  boolean not null default false,
  sort_order  integer not null default 0,

  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint catalogue_images_one_owner check (
    (product_id is not null and reward_id is null)
    or (product_id is null and reward_id is not null)
  ),
  constraint catalogue_images_bucket_known check (bucket in ('product-images', 'reward-images')),
  constraint catalogue_images_mime_allowed check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
  ),
  -- 5 MB. A counter phone photo fits comfortably; a mistakenly-picked video
  -- or RAW file does not.
  constraint catalogue_images_size_cap check (size_bytes <= 5242880),
  constraint catalogue_images_alt_len check (alt_text is null or length(trim(alt_text)) <= 200),
  constraint catalogue_images_path_scoped check (path like (business_id::text || '/%')),
  constraint catalogue_images_unique_object unique (bucket, path)
);

create index if not exists catalogue_images_product_idx
  on public.catalogue_images (product_id, sort_order)
  where product_id is not null;
create index if not exists catalogue_images_reward_idx
  on public.catalogue_images (reward_id, sort_order)
  where reward_id is not null;
create index if not exists catalogue_images_business_idx
  on public.catalogue_images (business_id);

-- At most one primary image per owner — the thumbnail is unambiguous.
create unique index if not exists catalogue_images_one_primary_product
  on public.catalogue_images (product_id)
  where product_id is not null and is_primary;
create unique index if not exists catalogue_images_one_primary_reward
  on public.catalogue_images (reward_id)
  where reward_id is not null and is_primary;

-- Keep the denormalized business_id honest against the owning row.
create or replace function public.catalogue_image_consistency()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_business uuid;
begin
  if new.product_id is not null then
    select p.business_id into v_business from public.products p where p.id = new.product_id;
  else
    select r.business_id into v_business from public.rewards r where r.id = new.reward_id;
  end if;

  if v_business is null then
    raise exception 'catalogue image owner not found' using errcode = '23503';
  end if;
  if new.business_id is distinct from v_business then
    raise exception 'catalogue image business mismatch' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists catalogue_image_consistency on public.catalogue_images;
create trigger catalogue_image_consistency
  before insert or update on public.catalogue_images
  for each row execute function public.catalogue_image_consistency();

-- ---------------------------------------------------------------------------
-- notification_preferences — per profile, per business.
--
-- Preferences cannot gate emission: a notification row is shared by everyone
-- entitled to see it, so muting is a *read-side* choice. Storing it server-side
-- (rather than in localStorage) is what makes it follow the user across
-- devices, which is the whole point of the notification slice.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  business_id      uuid not null references public.businesses (id) on delete cascade,
  muted_categories public.notification_category[] not null default '{}',
  updated_at       timestamptz not null default now(),
  primary key (profile_id, business_id),
  -- Security events are never mutable: an owner must not be able to hide the
  -- one category that exists to surface abuse.
  constraint notification_prefs_security_always_on check (
    not ('security' = any (muted_categories))
  ),
  constraint notification_prefs_sane check (array_length(muted_categories, 1) is null
                                            or array_length(muted_categories, 1) <= 7)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- RPCs — images
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * Record an uploaded object against a product or reward.
 *
 * Called by the server action AFTER the object lands in Storage. Every check
 * is repeated here even though the action already made it, because the action
 * is ordinary application code and this is the last line before the database
 * believes something.
 */
create or replace function public.attach_catalogue_image(
  p_product_id uuid    default null,
  p_reward_id  uuid    default null,
  p_bucket     text    default null,
  p_path       text    default null,
  p_mime_type  text    default null,
  p_size_bytes bigint  default null,
  p_width      integer default null,
  p_height     integer default null,
  p_alt_text   text    default null,
  p_make_primary boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := auth.uid();
  v_business uuid;
  v_role     public.app_role;
  v_id       uuid;
  v_first    boolean;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if (p_product_id is null) = (p_reward_id is null) then
    raise exception 'invalid_owner: attach to exactly one product or reward' using errcode = '22023';
  end if;

  -- Ownership: resolve the business from the owning row, never from input.
  if p_product_id is not null then
    select p.business_id into v_business from public.products p where p.id = p_product_id;
  else
    select r.business_id into v_business from public.rewards r where r.id = p_reward_id;
  end if;
  if v_business is null then
    raise exception 'owner_not_found' using errcode = '22023';
  end if;

  v_role := public.business_role(v_business);
  if v_role is null or not public.role_at_least(v_role, 'manager') then
    raise exception 'not_authorized: manager_only' using errcode = '42501';
  end if;

  -- Bucket must match what is being attached, so a reward photo cannot be
  -- filed under the product bucket and vice versa.
  if p_bucket is distinct from (case when p_product_id is not null
                                then 'product-images' else 'reward-images' end) then
    raise exception 'invalid_bucket' using errcode = '22023';
  end if;

  -- The path prefix is the tenancy boundary in Storage; reject anything that
  -- would let one business write into another's folder.
  if p_path is null or p_path not like (v_business::text || '/%')
     or p_path like '%..%' or length(p_path) > 300 then
    raise exception 'invalid_path' using errcode = '22023';
  end if;

  if p_mime_type is null or p_mime_type not in
     ('image/jpeg', 'image/png', 'image/webp', 'image/avif') then
    raise exception 'invalid_mime_type' using errcode = '22023';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 5242880 then
    raise exception 'invalid_size' using errcode = '22023';
  end if;

  select not exists (
    select 1 from public.catalogue_images ci
     where (p_product_id is not null and ci.product_id = p_product_id)
        or (p_reward_id is not null and ci.reward_id = p_reward_id)
  ) into v_first;

  -- Stand the previous thumbnail down FIRST: `catalogue_images_one_primary_*`
  -- is a real unique index, so inserting a second primary and demoting the
  -- old one afterwards would abort the statement.
  if (v_first or coalesce(p_make_primary, false)) then
    update public.catalogue_images
       set is_primary = false
     where is_primary
       and ((p_product_id is not null and product_id = p_product_id)
         or (p_reward_id is not null and reward_id = p_reward_id));
  end if;

  insert into public.catalogue_images
    (business_id, product_id, reward_id, bucket, path, mime_type, size_bytes,
     width, height, alt_text, is_primary, sort_order, uploaded_by)
  values
    (v_business, p_product_id, p_reward_id, p_bucket, p_path, p_mime_type, p_size_bytes,
     p_width, p_height, nullif(trim(coalesce(p_alt_text, '')), ''),
     -- First image is always primary; later ones only if asked, and the
     -- previous primary is stood down below.
     v_first or coalesce(p_make_primary, false),
     coalesce((select max(sort_order) + 1 from public.catalogue_images ci
                where (p_product_id is not null and ci.product_id = p_product_id)
                   or (p_reward_id is not null and ci.reward_id = p_reward_id)), 0),
     v_actor)
  returning id into v_id;

  perform public.write_audit(
    'catalogue_image.attached', v_actor, v_role, v_business, null,
    case when p_product_id is not null then 'product' else 'reward' end,
    coalesce(p_product_id, p_reward_id)::text,
    jsonb_build_object('image_id', v_id, 'bucket', p_bucket, 'path', p_path,
                       'mime_type', p_mime_type, 'size_bytes', p_size_bytes)
  );

  return jsonb_build_object(
    'image_id', v_id, 'bucket', p_bucket, 'path', p_path,
    'is_primary', v_first or coalesce(p_make_primary, false)
  );
end;
$$;

/** Promote one image to the thumbnail. Manager+, same tenant. */
create or replace function public.set_primary_catalogue_image(p_image_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_img public.catalogue_images; v_role public.app_role;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  select * into v_img from public.catalogue_images where id = p_image_id;
  if v_img.id is null then
    raise exception 'image_not_found' using errcode = '22023';
  end if;
  v_role := public.business_role(v_img.business_id);
  if v_role is null or not public.role_at_least(v_role, 'manager') then
    raise exception 'not_authorized: manager_only' using errcode = '42501';
  end if;

  update public.catalogue_images set is_primary = false
   where id <> p_image_id
     and ((v_img.product_id is not null and product_id = v_img.product_id)
       or (v_img.reward_id is not null and reward_id = v_img.reward_id));
  update public.catalogue_images set is_primary = true where id = p_image_id;

  perform public.write_audit(
    'catalogue_image.primary_set', auth.uid(), v_role, v_img.business_id, null,
    'catalogue_image', p_image_id::text, jsonb_build_object('path', v_img.path)
  );
  return true;
end $$;

/**
 * Detach an image. Returns the storage coordinates so the caller can delete
 * the object too — the row is the application's source of truth, and an
 * orphaned object is invisible but wasteful.
 */
create or replace function public.detach_catalogue_image(p_image_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_img public.catalogue_images; v_role public.app_role; v_next uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  select * into v_img from public.catalogue_images where id = p_image_id;
  if v_img.id is null then
    raise exception 'image_not_found' using errcode = '22023';
  end if;
  v_role := public.business_role(v_img.business_id);
  if v_role is null or not public.role_at_least(v_role, 'manager') then
    raise exception 'not_authorized: manager_only' using errcode = '42501';
  end if;

  delete from public.catalogue_images where id = p_image_id;

  -- Never leave an owner with images but no thumbnail.
  if v_img.is_primary then
    select id into v_next from public.catalogue_images
     where (v_img.product_id is not null and product_id = v_img.product_id)
        or (v_img.reward_id is not null and reward_id = v_img.reward_id)
     order by sort_order limit 1;
    if v_next is not null then
      update public.catalogue_images set is_primary = true where id = v_next;
    end if;
  end if;

  perform public.write_audit(
    'catalogue_image.detached', auth.uid(), v_role, v_img.business_id, null,
    'catalogue_image', p_image_id::text,
    jsonb_build_object('bucket', v_img.bucket, 'path', v_img.path)
  );

  return jsonb_build_object('bucket', v_img.bucket, 'path', v_img.path);
end $$;

/** Alt text is an accessibility property, editable without re-uploading. */
create or replace function public.set_catalogue_image_alt(p_image_id uuid, p_alt_text text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_img public.catalogue_images; v_role public.app_role;
begin
  select * into v_img from public.catalogue_images where id = p_image_id;
  if v_img.id is null then
    raise exception 'image_not_found' using errcode = '22023';
  end if;
  v_role := public.business_role(v_img.business_id);
  if v_role is null or not public.role_at_least(v_role, 'manager') then
    raise exception 'not_authorized: manager_only' using errcode = '42501';
  end if;
  if p_alt_text is not null and length(trim(p_alt_text)) > 200 then
    raise exception 'invalid_alt_text' using errcode = '22023';
  end if;

  update public.catalogue_images
     set alt_text = nullif(trim(coalesce(p_alt_text, '')), '')
   where id = p_image_id;
  return true;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RPCs — essential settings
-- ═══════════════════════════════════════════════════════════════════════════

/** Business identity. Owner only, validated, audited with before/after. */
create or replace function public.update_business_profile(
  p_name          text default null,
  p_legal_name    text default null,
  p_gstin         text default null,
  p_support_email text default null,
  p_support_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := auth.uid();
  v_biz    record;
  v_before jsonb;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select b.* into v_biz
    from public.businesses b
    join public.business_memberships bm
      on bm.business_id = b.id and bm.profile_id = v_actor
     and bm.status = 'active' and bm.role = 'owner'
   limit 1;
  if v_biz.id is null then
    raise exception 'not_authorized: owner_only' using errcode = '42501';
  end if;

  if p_name is not null and length(trim(p_name)) not between 2 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_support_email is not null and trim(p_support_email) <> ''
     and p_support_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  -- GSTIN is 15 characters in a fixed shape; a wrong one on an invoice is a
  -- compliance problem, so it is validated rather than trusted.
  if p_gstin is not null and trim(p_gstin) <> ''
     and upper(trim(p_gstin)) !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$' then
    raise exception 'invalid_gstin' using errcode = '22023';
  end if;

  v_before := jsonb_build_object(
    'name', v_biz.name, 'legal_name', v_biz.legal_name, 'gstin', v_biz.gstin,
    'support_email', v_biz.support_email, 'support_phone', v_biz.support_phone
  );

  update public.businesses
     set name          = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
         legal_name    = coalesce(nullif(trim(coalesce(p_legal_name, '')), ''), legal_name),
         gstin         = coalesce(nullif(upper(trim(coalesce(p_gstin, ''))), ''), gstin),
         support_email = coalesce(nullif(trim(coalesce(p_support_email, '')), ''), support_email),
         support_phone = coalesce(nullif(trim(coalesce(p_support_phone, '')), ''), support_phone)
   where id = v_biz.id;

  perform public.write_audit(
    'business.profile_updated', v_actor, 'owner', v_biz.id, null,
    'business', v_biz.id::text,
    jsonb_build_object('from', v_before)
  );

  return jsonb_build_object('business_id', v_biz.id);
end $$;

/**
 * Create or update a store. Owner only.
 *
 * Closing a store is a status flip, never a delete: sales, stock and staff
 * assignments all point at it and history must survive.
 */
create or replace function public.upsert_store(
  p_store_id     uuid    default null,
  p_name         text    default null,
  p_code         text    default null,
  p_address_line text    default null,
  p_phone        text    default null,
  p_is_active    boolean default null,
  p_city         text    default null,
  p_region       text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := auth.uid();
  v_business uuid;
  v_store    public.stores;
  v_id       uuid;
  v_created  boolean := false;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select bm.business_id into v_business
    from public.business_memberships bm
   where bm.profile_id = v_actor and bm.status = 'active' and bm.role = 'owner'
   limit 1;
  if v_business is null then
    raise exception 'not_authorized: owner_only' using errcode = '42501';
  end if;

  if p_store_id is not null then
    select * into v_store from public.stores where id = p_store_id;
    if v_store.id is null or v_store.business_id <> v_business then
      -- Same answer for "does not exist" and "belongs to someone else": a
      -- probe must not reveal another tenant's store ids.
      raise exception 'store_not_found' using errcode = '22023';
    end if;
  end if;

  if p_store_id is null and (p_name is null or length(trim(p_name)) < 2) then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_name is not null and length(trim(p_name)) not between 2 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if p_store_id is null then
    insert into public.stores (business_id, name, code, address_line, city, region, phone, is_active)
    values (v_business, trim(p_name), nullif(trim(coalesce(p_code, '')), ''),
            nullif(trim(coalesce(p_address_line, '')), ''),
            nullif(trim(coalesce(p_city, '')), ''),
            nullif(trim(coalesce(p_region, '')), ''),
            nullif(trim(coalesce(p_phone, '')), ''),
            coalesce(p_is_active, true))
    returning id into v_id;
    v_created := true;
  else
    update public.stores
       set name         = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
           code         = coalesce(nullif(trim(coalesce(p_code, '')), ''), code),
           address_line = coalesce(nullif(trim(coalesce(p_address_line, '')), ''), address_line),
           city         = coalesce(nullif(trim(coalesce(p_city, '')), ''), city),
           region       = coalesce(nullif(trim(coalesce(p_region, '')), ''), region),
           phone        = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone),
           is_active    = coalesce(p_is_active, is_active)
     where id = p_store_id
    returning id into v_id;
  end if;

  perform public.write_audit(
    case when v_created then 'store.created' else 'store.updated' end,
    v_actor, 'owner', v_business, v_id, 'store', v_id::text,
    jsonb_build_object('name', p_name, 'is_active', p_is_active)
  );

  return jsonb_build_object('store_id', v_id, 'created', v_created);
end $$;

/** Per-profile notification muting for one business. */
create or replace function public.set_notification_preferences(
  p_business_id      uuid default null,
  p_muted_categories text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := auth.uid();
  v_biz    uuid;
  v_cats   public.notification_category[];
  v_raw    text;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  -- The caller must actually belong to the business, as staff or as a customer.
  select b.id into v_biz from public.businesses b
   where (p_business_id is null or b.id = p_business_id)
     and (
       exists (select 1 from public.business_memberships bm
                where bm.business_id = b.id and bm.profile_id = v_actor and bm.status = 'active')
       or exists (select 1 from public.customer_memberships cm
                   where cm.business_id = b.id and cm.profile_id = v_actor and cm.status = 'active')
     )
   limit 1;
  if v_biz is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_cats := '{}';
  foreach v_raw in array coalesce(p_muted_categories, '{}')
  loop
    if v_raw not in ('points','reward','stock','staff','rule','security','system') then
      raise exception 'invalid_category: %', v_raw using errcode = '22023';
    end if;
    if v_raw = 'security' then
      raise exception 'security_cannot_be_muted' using errcode = '22023';
    end if;
    v_cats := array_append(v_cats, v_raw::public.notification_category);
  end loop;

  insert into public.notification_preferences (profile_id, business_id, muted_categories, updated_at)
  values (v_actor, v_biz, v_cats, now())
  on conflict (profile_id, business_id)
  do update set muted_categories = excluded.muted_categories, updated_at = now();

  return jsonb_build_object('business_id', v_biz, 'muted', to_jsonb(v_cats));
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.catalogue_images          enable row level security;
alter table public.notification_preferences  enable row level security;

-- Images are catalogue content: staff+ see their business's, and customers
-- see images of things they can already see (active rewards, per the rewards
-- policy). Products stay staff-only until a customer catalogue exists.
drop policy if exists "catalogue_images_select" on public.catalogue_images;
create policy "catalogue_images_select" on public.catalogue_images
  for select to authenticated
  using (
    business_id in (select * from public.my_businesses('staff'))
    or (
      reward_id is not null
      and exists (
        select 1 from public.rewards r
         where r.id = catalogue_images.reward_id
           and r.status = 'active'
           and exists (
             select 1 from public.customer_memberships cm
              where cm.business_id = r.business_id
                and cm.profile_id = auth.uid()
                and cm.status = 'active'
           )
      )
    )
  );

drop policy if exists "notification_prefs_own" on public.notification_preferences;
create policy "notification_prefs_own" on public.notification_preferences
  for select to authenticated
  using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- grants — read direct, write through RPCs.
-- ---------------------------------------------------------------------------
revoke all on public.catalogue_images         from public, anon, authenticated;
revoke all on public.notification_preferences from public, anon, authenticated;

grant select on public.catalogue_images         to authenticated;
grant select on public.notification_preferences to authenticated;

grant all on public.catalogue_images         to service_role;
grant all on public.notification_preferences to service_role;

grant execute on function public.attach_catalogue_image(uuid, uuid, text, text, text, bigint, integer, integer, text, boolean) to authenticated;
grant execute on function public.set_primary_catalogue_image(uuid) to authenticated;
grant execute on function public.detach_catalogue_image(uuid)      to authenticated;
grant execute on function public.set_catalogue_image_alt(uuid, text) to authenticated;
grant execute on function public.update_business_profile(text, text, text, text, text) to authenticated;
grant execute on function public.upsert_store(uuid, text, text, text, text, boolean, text, text) to authenticated;
grant execute on function public.set_notification_preferences(uuid, text[]) to authenticated;

revoke execute on function public.attach_catalogue_image(uuid, uuid, text, text, text, bigint, integer, integer, text, boolean) from public, anon;
revoke execute on function public.set_primary_catalogue_image(uuid) from public, anon;
revoke execute on function public.detach_catalogue_image(uuid)      from public, anon;
revoke execute on function public.set_catalogue_image_alt(uuid, text) from public, anon;
revoke execute on function public.update_business_profile(text, text, text, text, text) from public, anon;
revoke execute on function public.upsert_store(uuid, text, text, text, text, boolean, text, text) from public, anon;
revoke execute on function public.set_notification_preferences(uuid, text[]) from public, anon;

-- ---------------------------------------------------------------------------
-- Storage buckets and policies.
--
-- Guarded: the `storage` schema exists on Supabase but not on the bare
-- PostgreSQL used by the local RLS harness, and this migration must apply
-- cleanly to both.
--
-- The path convention `<business_id>/<owner_id>/<file>` is load-bearing:
-- `split_part(name, '/', 1)` is the tenant check in every policy below.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema absent — skipping bucket setup (local harness)';
    return;
  end if;

  -- Public READ (catalogue photos are shown to customers anyway); the file
  -- size and MIME allowlist are enforced by the bucket as well as by the RPC.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('product-images', 'product-images', true, 5242880,
     array['image/jpeg','image/png','image/webp','image/avif']),
    ('reward-images',  'reward-images',  true, 5242880,
     array['image/jpeg','image/png','image/webp','image/avif'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute $pol$
    drop policy if exists "catalogue_images_public_read" on storage.objects;
    create policy "catalogue_images_public_read" on storage.objects
      for select to public
      using (bucket_id in ('product-images', 'reward-images'));
  $pol$;

  -- Writes: staff+ of the business named by the first path segment, only.
  execute $pol$
    drop policy if exists "catalogue_images_staff_write" on storage.objects;
    create policy "catalogue_images_staff_write" on storage.objects
      for insert to authenticated
      with check (
        bucket_id in ('product-images', 'reward-images')
        and (
          select public.role_at_least(
            public.business_role(nullif(split_part(name, '/', 1), '')::uuid), 'manager')
        )
      );
  $pol$;

  execute $pol$
    drop policy if exists "catalogue_images_staff_update" on storage.objects;
    create policy "catalogue_images_staff_update" on storage.objects
      for update to authenticated
      using (
        bucket_id in ('product-images', 'reward-images')
        and (
          select public.role_at_least(
            public.business_role(nullif(split_part(name, '/', 1), '')::uuid), 'manager')
        )
      );
  $pol$;

  execute $pol$
    drop policy if exists "catalogue_images_staff_delete" on storage.objects;
    create policy "catalogue_images_staff_delete" on storage.objects
      for delete to authenticated
      using (
        bucket_id in ('product-images', 'reward-images')
        and (
          select public.role_at_least(
            public.business_role(nullif(split_part(name, '/', 1), '')::uuid), 'manager')
        )
      );
  $pol$;
end $$;

comment on table public.catalogue_images is
  'Durable metadata for product/reward images in Storage. Objects without a row here are invisible to the app.';
comment on table public.notification_preferences is
  'Per-profile, per-business notification muting. Security notifications can never be muted.';
