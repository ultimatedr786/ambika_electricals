# Phase 2 — Architecture Proposal (Step 1 of Part B §15)

Ambika Electricals / Rewardly · real production backend on Supabase + Next.js
Prepared 2026-09-05 · Branch `arena/01a0718a-ambika-electricals`

---

## 0. Status of this document

This is **Step 1 only** of the Part B §15 sequence: *"Architecture decision, data model,
migrations, RLS policy design, seed strategy, environments and CI checks."*

**Nothing has been built.** Per your instruction I have not:

- created a Supabase project, tables, migrations, buckets or credentials;
- installed `@supabase/supabase-js`, `@supabase/ssr` or the Supabase CLI;
- touched `src/lib/services/index.ts` or any mock data;
- changed a single line of the running Phase 1.3 application.

Every SQL block below is a **design sketch for your review**, not a migration to run.
Once you approve (§13.4 checklist), Step 2 begins: real auth, roles, business/store
membership, protected routes and session UX — as one vertical slice, with the rest of
the app still on mocks.

### Compatibility verified before proposing anything

| Thing | Verified position (Sept 2026) | Consequence for us |
|---|---|---|
| `@supabase/ssr` | Current, official way to do cookie-based auth in the App Router. `@supabase/auth-helpers-nextjs` is deprecated. Package is still labelled beta, API may shift. | Adopt `@supabase/supabase-js` + `@supabase/ssr`. Pin exact versions; isolate all client construction in 3 files so a breaking change is a 3-file fix. |
| API keys | New `sb_publishable_…` / `sb_secret_…` keys replace `anon` / `service_role`; **legacy keys deprecated end of 2026**. Secret keys are not JWTs and must be sent on the `apikey` header. | Start on the **new keys** — we would otherwise migrate within months. Never expose a secret key via `NEXT_PUBLIC_`. |
| Realtime | Supabase now recommends **Broadcast from database triggers** (`realtime.broadcast_changes()`) over `postgres_changes`, which re-authorises every event per subscriber and degrades past ~3,000 concurrent subscribers. | Design on Broadcast + private channels from day one. `postgres_changes` only as a local dev shortcut, never shipped. |
| Migrations | Declarative schema (`supabase/schemas/*.sql` → `supabase db diff`) is supported, but the migra differ **does not track** DML, RLS `alter policy`, column privileges, materialized views, partitions, comments or grants reliably. | Hybrid: declarative for tables/indexes/functions; **hand-written versioned migrations for all RLS, grants, seed DML and partitions**. Details in §2.4. |
| Next.js | **Next.js 14 reached end of life on 26 Oct 2025.** 14.2.35 (what we run) was its final patch. The 15.x line is Maintenance LTS until 21 Oct 2026; 16.x is Active LTS. Nine CVEs were patched in July 2026 on supported lines only — including a middleware/proxy bypass. | **This is a decision I need from you (§13.4 D1).** Putting real auth behind an EOL framework with a known unpatched middleware-bypass class of CVE is the single largest risk in Phase 2. |
| SMS OTP in India | TRAI/TCCCPR mandates **DLT registration** — Principal Entity ID, 6-character alphabetic header, and pre-approved templates — before any commercial SMS reaches an Indian handset. Approval takes ~3–10 business days for entity/header plus 1–5 for templates. OTP must use the Transactional (-T) category and include the brand name. | Phone OTP has a **lead time and a paperwork owner**, not just an integration. Decision D4. |

Sources: [Supabase SSR client docs](https://supabase.com/docs/guides/auth/server-side/creating-a-client) · [Migrating to publishable and secret keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys) · [Subscribing to database changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes) · [Postgres Changes scaling](https://supabase.com/docs/guides/realtime/postgres-changes) · [Declarative schema caveats](https://supabase.com/docs/guides/ai-tools/ai-prompts/declarative-database-schema) · [Branching & deployment](https://supabase.com/docs/guides/deployment/branching) · [Next.js EOL timeline](https://www.herodevs.com/blog-posts/nextjs-eol-dates-version-support-timeline) · [Next.js July 2026 security release](https://ecorpit.com/nextjs-july-2026-security-release-cve-upgrade-2026/) · [DLT registration guide](https://www.messagecentral.com/blog/a-complete-guide-on-dlt-registration) · [India SMS guidelines](https://www.messagecentral.com/sms-guideline/india)

---

## 1. Architecture decisions

### 1.1 Shape of the system

```
┌──────────────────────────── Browser ────────────────────────────┐
│  Next.js App Router (existing Phase 1.3 UI, unchanged)          │
│  • Server Components read data                                  │
│  • Client Components subscribe to Realtime (publishable key)    │
│  • NEVER calls a privileged key, never computes final points    │
└───────────────┬─────────────────────────────┬───────────────────┘
                │ cookies (PKCE session)      │ wss (private channels)
┌───────────────▼─────────────────────────────│───────────────────┐
│ Next.js server: Server Actions + Route Handlers                 │
│  • zod-validates every input                                    │
│  • builds a request-scoped Supabase client from the user cookie │
│  • calls Postgres RPCs; RLS still applies (no key escalation)   │
│  • uses the secret key ONLY for: invitations, QR issuance,      │
│    storage policy checks, webhooks, cron — each behind an       │
│    explicit authorisation check written in our code             │
└───────────────┬─────────────────────────────┬───────────────────┘
                │ postgrest / rpc             │
┌───────────────▼─────────────────────────────▼───────────────────┐
│ Supabase (region: ap-south-1 Mumbai — decision D9)              │
│  Postgres  · RLS on every table · SECURITY DEFINER RPCs         │
│  Auth      · email+password, phone OTP, invitations, MFA        │
│  Realtime  · Broadcast from triggers, private topics            │
│  Storage   · product/reward images, invoices                    │
│  pgmq + pg_cron + pg_net · outbox for SMS/email/push, expiry    │
│  Edge Functions · provider webhooks, heavy async work           │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Decision record

| # | Decision | Why | Alternative rejected |
|---|---|---|---|
| A1 | **Supabase Postgres as the system of record**, not an ORM-over-any-DB | RLS is the only way to satisfy "never trust a role from browser state" at the data layer; Auth/Realtime/Storage share the same identity | Prisma + custom auth: we'd hand-roll tenant isolation in application code, which is exactly the failure mode the brief forbids |
| A2 | **Business logic that must be atomic lives in Postgres functions** (`create_sale`, `redeem_reward`, …), called by RPC | A sale writes 6 tables; only a DB transaction makes that atomic. Also makes the rules testable with pgTAP independent of the UI | Multi-step writes from a Server Action: partial failures corrupt the ledger |
| A3 | **Money as `bigint` paise**, never float | ₹ amounts with GST and discounts must not drift | `numeric` is safe but invites accidental float casts in JS; paise integers round-trip cleanly to JS numbers up to ₹90,00,00,00,000 |
| A4 | **Append-only `points_ledger`** with a transactionally-maintained `customer_points_balance` cache | §10 mandates it; the cache keeps the POS fast without recomputing a sum over years of history | Balance column only: unauditable, unrecoverable after a bug |
| A5 | **Repository layer keeps the existing `useServices()` shape** | Phase 1.3 UI keeps working; we swap implementations behind identical method signatures, one service at a time | Rewriting components alongside the backend doubles the blast radius of every bug |
| A6 | **Realtime Broadcast from DB triggers**, private channels, RLS on `realtime.messages` | Verified current Supabase guidance; scales past per-subscriber authorisation | `postgres_changes`: simpler but a known scaling cliff and it leaks table shape |
| A7 | **New publishable/secret API keys** | Legacy keys deprecated end of 2026 | Starting on `anon`/`service_role` buys a forced migration inside six months |
| A8 | **`zod` schemas shared client/server**, already a dependency | One definition drives the RHF form, the Server Action guard and the generated TS type | Duplicated validation drifts |
| A9 | **Idempotency keys on every money/points mutation** | POS staff double-tap; networks retry; §11 requires it | "Just disable the button" is not a correctness argument |

### 1.3 Naming and conventions

- Schemas: `public` (API-exposed tables), `app` (SECURITY DEFINER business functions), `app_private` (RLS helpers, never exposed), `audit` (logs, partitioned), `analytics` (materialized views).
- Tables plural snake_case; PKs `id uuid default gen_random_uuid()` except high-volume append-only tables (`points_ledger`, `audit.audit_logs`, `inventory_movements`) which use `bigint generated always as identity` for cheap ordering.
- Every business table carries `business_id uuid not null`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` (trigger-maintained), and `archived_at timestamptz` for soft delete. **We never hard-delete customer, sale, ledger or redemption rows.**
- `*_snapshot` columns capture the value at transaction time (product name, price, category) so a later catalogue edit never rewrites history.
- Enums as Postgres `enum` types where the set is closed and rarely changes; `text` + check constraint where the business may extend it.

---

## 2. Data model

### 2.1 Entity map

```
platform_admins                     (super admin, no tenant)
businesses ─┬─ business_settings (1:1)
            ├─ stores ─┬─ inventory_by_store ── products
            │          └─ staff_store_access ── staff_profiles
            ├─ tiers
            ├─ product_categories ── products ─┬─ product_images
            │                                  └─ inventory_movements
            ├─ customer_profiles ─┬─ customer_addresses
            │                     ├─ membership_qr_tokens
            │                     ├─ points_ledger ── customer_points_balance (1:1 cache)
            │                     ├─ referrals ── referral_rewards
            │                     ├─ challenge_progress
            │                     └─ notifications
            ├─ staff_profiles ── staff_invitations
            ├─ sales ─┬─ sale_items
            │         ├─ sale_payments
            │         └─ invoices
            ├─ loyalty_rules ── loyalty_rule_versions ── loyalty_rule_sets
            ├─ rewards ─┬─ reward_options
            │           ├─ reward_inventory
            │           └─ reward_eligibility
            ├─ redemptions ─┬─ redemption_items
            │               └─ redemption_status_events
            ├─ campaigns, challenges
            └─ notification_preferences, device_tokens, notification_deliveries

audit.audit_logs (monthly partitions) · public.idempotency_keys · audit.qr_scan_attempts
```

`user_profiles` sits beside `auth.users` (1:1) and is referenced by both
`customer_profiles.user_id` and `staff_profiles.user_id`. **A person can be both** a
customer and a staff member; the two profiles are independent rows pointing at the same
`auth.users.id`.

### 2.2 Core tables (design sketches)

Only the columns that carry meaning are listed; every table also gets the standard
`created_at / updated_at / archived_at` trio described in §1.3.

#### Tenancy

```sql
create table public.businesses (
  id            uuid primary key default gen_random_uuid(),
  slug          citext not null unique,              -- 'ambika-electricals'
  legal_name    text not null,
  display_name  text not null,
  gst_number    text,                                -- '24ABKPE1234K1Z9'
  phone         text not null,
  email         citext not null,
  address       jsonb not null,                      -- {line1, area, city, state, pincode}
  currency      char(3) not null default 'INR',
  timezone      text   not null default 'Asia/Kolkata',
  status        business_status not null default 'active'
);

create table public.business_settings (
  business_id           uuid primary key references public.businesses on delete cascade,
  point_value_paise     integer not null default 10,   -- 1 point = ₹0.10  (decision D3)
  earn_spend_paise      integer not null default 10000, -- per ₹100 …
  earn_points           integer not null default 10,    -- … award 10 points
  points_expiry_months  integer,                        -- null = never  (decision D3)
  rounding_mode         text not null default 'floor',
  invoice_prefix        text not null default 'AE',
  invoice_next_seq      bigint not null default 1,
  tax_display           text not null default 'inclusive',
  qr_token_ttl_seconds  integer not null default 120,
  updated_by            uuid references public.user_profiles
);

create table public.stores (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses on delete cascade,
  code          text not null,                        -- 'MAIN', 'CITY'
  name          text not null,
  address       jsonb not null,
  phone         text,
  manager_staff_id uuid references public.staff_profiles,
  pickup_enabled   boolean not null default true,
  status        store_status not null default 'active',
  unique (business_id, code)
);

create table public.tiers (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses on delete cascade,
  name          text not null,                        -- Bronze/Silver/Gold/Platinum
  rank          smallint not null,                    -- 0..3, used for comparisons
  min_lifetime_points integer not null,
  max_lifetime_points integer,                        -- null = open ended
  multiplier    numeric(4,2) not null default 1.00,
  benefits      jsonb not null default '[]',
  color         text,
  unique (business_id, rank),
  unique (business_id, name)
);
```

> Tier comparisons use `rank`, never the display name — the current mock code compares
> `tierOrder.indexOf(name)`, which would break the moment a tier is renamed.

#### Identity

```sql
create table public.user_profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text not null,
  phone       text,
  email       citext,
  avatar_path text,
  locale      text not null default 'en-IN',
  last_seen_at timestamptz
);

create table public.customer_profiles (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses on delete cascade,
  user_id           uuid references public.user_profiles,  -- NULL = walk-in member, no app login
  membership_id     text not null,                         -- 'AE-10248'
  full_name         text not null,
  phone             text not null,
  email             citext,
  birthday          date,
  tier_id           uuid not null references public.tiers,
  joined_store_id   uuid references public.stores,
  referral_code     text not null,
  referred_by       uuid references public.customer_profiles,
  status            customer_status not null default 'active',
  marketing_consent boolean not null default false,
  consent_recorded_at timestamptz,
  notes             text,
  enrolled_by_staff_id uuid references public.staff_profiles,
  unique (business_id, membership_id),
  unique (business_id, referral_code)
);
create unique index customer_phone_uq
  on public.customer_profiles (business_id, phone) where archived_at is null;
create unique index customer_user_uq
  on public.customer_profiles (business_id, user_id) where user_id is not null;

create table public.staff_profiles (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses on delete cascade,
  user_id        uuid not null references public.user_profiles,
  role           staff_role not null,      -- owner | manager | cashier | marketing
  employee_code  text,
  status         staff_status not null default 'invited',
  invited_by     uuid references public.user_profiles,
  invited_at     timestamptz,
  activated_at   timestamptz,
  last_active_at timestamptz,
  unique (business_id, user_id)
);

create table public.staff_store_access (
  staff_id  uuid not null references public.staff_profiles on delete cascade,
  store_id  uuid not null references public.stores on delete cascade,
  is_primary boolean not null default false,
  primary key (staff_id, store_id)
);

create table public.staff_invitations (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses on delete cascade,
  email        citext not null,
  role         staff_role not null,
  store_ids    uuid[] not null default '{}',
  token_hash   bytea not null,             -- sha256 of a 32-byte random token
  expires_at   timestamptz not null,       -- now() + 7 days
  accepted_at  timestamptz,
  accepted_user_id uuid references public.user_profiles,
  revoked_at   timestamptz,
  created_by   uuid not null references public.user_profiles
);

create table public.platform_admins (      -- super admin, deliberately tenant-less
  user_id    uuid primary key references public.user_profiles on delete cascade,
  granted_by uuid references public.user_profiles,
  granted_at timestamptz not null default now()
);
```

#### Catalogue and inventory

```sql
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  name text not null, slug text not null, parent_id uuid references public.product_categories,
  art_key text, sort_order smallint not null default 0,
  unique (business_id, slug)
);

create table public.products (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses on delete cascade,
  sku           text not null,
  name          text not null,
  category_id   uuid not null references public.product_categories,
  subcategory   text,
  brand         text not null,
  description   text,
  unit          text not null default 'piece',
  mrp_paise     bigint,
  price_paise   bigint not null check (price_paise >= 0),
  points_override integer,               -- null = derive from the rule engine
  art_key       text,                    -- Phase 1.3 illustration key, kept as a fallback
  status        product_status not null default 'active',
  search_tsv    tsvector generated always as (
                  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(sku,''))
                ) stored,
  unique (business_id, sku)
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products on delete cascade,
  storage_path text not null,            -- product-images/<business>/<product>/<uuid>.webp
  alt_text text not null,
  width int, height int, bytes int, mime text,
  is_primary boolean not null default false,
  sort_order smallint not null default 0,
  uploaded_by uuid references public.user_profiles
);
create unique index product_primary_image_uq
  on public.product_images (product_id) where is_primary;

create table public.inventory_by_store (
  product_id uuid not null references public.products on delete cascade,
  store_id   uuid not null references public.stores on delete cascade,
  on_hand    integer not null default 0,
  reserved   integer not null default 0,
  reorder_level integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (product_id, store_id),
  check (on_hand >= 0 and reserved >= 0)
);

create table public.inventory_movements (      -- append-only
  id bigint generated always as identity primary key,
  business_id uuid not null,
  store_id uuid not null references public.stores,
  product_id uuid not null references public.products,
  delta integer not null,                       -- signed
  reason inventory_reason not null,             -- sale|sale_void|receipt|adjustment|redemption|redemption_cancel|stock_take
  reference_type text, reference_id uuid,
  note text,
  created_by uuid references public.user_profiles,
  created_at timestamptz not null default now()
);
```

#### Sales

```sql
create table public.sales (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses on delete cascade,
  store_id       uuid not null references public.stores,
  customer_id    uuid references public.customer_profiles,   -- null = anonymous walk-in
  invoice_no     text not null,
  subtotal_paise bigint not null,
  discount_paise bigint not null default 0,
  tax_paise      bigint not null default 0,
  total_paise    bigint not null,
  base_points    integer not null default 0,
  bonus_points   integer not null default 0,
  total_points   integer not null default 0,
  status         sale_status not null default 'completed',   -- completed|voided|refunded
  rule_set_id    uuid references public.loyalty_rule_sets,   -- which rules priced this sale
  sold_by_staff_id uuid not null references public.staff_profiles,
  sold_at        timestamptz not null default now(),
  idempotency_key text,
  voided_at timestamptz, void_reason text, voided_by uuid references public.user_profiles,
  unique (business_id, invoice_no),
  check (total_paise = subtotal_paise - discount_paise + tax_paise)
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales on delete cascade,
  product_id uuid references public.products,
  sku_snapshot text not null, name_snapshot text not null,
  brand_snapshot text, category_snapshot text,
  qty numeric(12,3) not null check (qty > 0),
  unit_price_paise bigint not null,
  line_discount_paise bigint not null default 0,
  line_total_paise bigint not null,
  points_awarded integer not null default 0
);

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales on delete cascade,
  method payment_method not null,        -- cash|upi|card|credit|points
  amount_paise bigint not null,
  reference text,
  captured_at timestamptz not null default now()
);
```

#### Loyalty engine and ledger

```sql
create table public.loyalty_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  name text not null,
  rule_type loyalty_rule_type not null,   -- spend|product|category|multiplier|signup|
                                          -- first_purchase|referral|birthday|campaign
  priority smallint not null default 100,
  enabled boolean not null default true,
  current_version_id uuid                 -- FK added after loyalty_rule_versions
);

create table public.loyalty_rule_versions (   -- immutable
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.loyalty_rules on delete cascade,
  version integer not null,
  config jsonb not null,   -- {match:{category_id|brand|sku|min_qty|weekday[]},
                           --  award:{kind:'points'|'multiplier', value:number, cap?:number}}
  created_by uuid references public.user_profiles,
  created_at timestamptz not null default now(),
  unique (rule_id, version)
);

create table public.loyalty_rule_sets (       -- the snapshot a sale is priced against
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  version integer not null,
  snapshot jsonb not null,        -- fully resolved, ordered list of rule versions
  published_by uuid references public.user_profiles,
  published_at timestamptz not null default now(),
  unique (business_id, version)
);

create table public.points_ledger (           -- APPEND ONLY. See §6.
  id            bigint generated always as identity primary key,
  business_id   uuid not null references public.businesses,
  customer_id   uuid not null references public.customer_profiles,
  entry_type    ledger_entry_type not null,
  points        integer not null check (points <> 0),   -- signed: +earn, −redeem
  balance_after integer not null check (balance_after >= 0),
  source_type   text not null,        -- 'sale' | 'redemption' | 'manual' | 'expiry' | …
  source_id     uuid,
  rule_set_id   uuid references public.loyalty_rule_sets,
  store_id      uuid references public.stores,
  actor_user_id uuid references public.user_profiles,
  reason        text,
  expires_on    date,                 -- for earn entries when expiry is enabled
  idempotency_key text,
  created_at    timestamptz not null default now()
);
create index ledger_customer_idx on public.points_ledger (customer_id, id desc);
create index ledger_business_created_idx on public.points_ledger (business_id, created_at desc);
create unique index ledger_idem_uq on public.points_ledger (business_id, idempotency_key)
  where idempotency_key is not null;

create table public.customer_points_balance (   -- transactional cache, never authoritative
  customer_id uuid primary key references public.customer_profiles on delete cascade,
  business_id uuid not null,
  current_points integer not null default 0 check (current_points >= 0),
  lifetime_earned integer not null default 0,
  lifetime_redeemed integer not null default 0,
  last_entry_id bigint references public.points_ledger,
  updated_at timestamptz not null default now()
);
```

#### Rewards and redemptions

```sql
create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  name text not null, description text,
  reward_type reward_type not null,        -- discount|coupon|free_product|gift|special_offer
  category text,
  regular_price_paise bigint,
  brand text, art_key text, image_path text,
  min_tier_rank smallint not null default 0,
  expiry_days integer not null default 30,
  max_per_customer_per_month integer,
  terms jsonb not null default '[]',
  status reward_status not null default 'active'
);

create table public.reward_options (       -- mirrors RewardRedemptionOption
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.rewards on delete cascade,
  option_type redemption_option_type not null,  -- points|points_cash|member_price|coupon
  points integer not null default 0,
  cash_paise bigint not null default 0,
  label text not null, description text,
  sort_order smallint not null default 0
);

create table public.reward_inventory (
  reward_id uuid not null references public.rewards on delete cascade,
  store_id  uuid references public.stores,   -- null row = business-wide pool
  on_hand   integer not null default 0,
  reserved  integer not null default 0,
  updated_at timestamptz not null default now(),
  check (on_hand >= 0 and reserved >= 0)
);
create unique index reward_inventory_uq
  on public.reward_inventory (reward_id, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.reward_eligibility (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.rewards on delete cascade,
  min_tier_rank smallint,
  min_lifetime_spend_paise bigint,
  first_purchase_only boolean not null default false,
  allowed_store_ids uuid[],
  starts_at timestamptz, ends_at timestamptz
);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  customer_id uuid not null references public.customer_profiles,
  store_id uuid references public.stores,
  reference  text not null,               -- 'RDM-2041', shown to the customer
  code_hash  bytea not null,              -- sha256 of the collection code
  code_last4 char(4) not null,            -- for support lookup only
  points_used integer not null default 0,
  cash_due_paise bigint not null default 0,
  status redemption_status not null default 'pending',
  fulfilment fulfilment_type not null default 'pickup',
  address_snapshot jsonb,
  expires_at timestamptz not null,
  confirmed_at timestamptz, completed_at timestamptz,
  cancelled_at timestamptz, cancel_reason text,
  created_by uuid references public.user_profiles,
  idempotency_key text,
  unique (business_id, reference)
);

create table public.redemption_items (
  id uuid primary key default gen_random_uuid(),
  redemption_id uuid not null references public.redemptions on delete cascade,
  reward_id uuid not null references public.rewards,
  option_id uuid references public.reward_options,
  name_snapshot text not null,
  qty integer not null check (qty > 0),
  points_each integer not null,
  cash_each_paise bigint not null default 0
);

create table public.redemption_status_events (
  id bigint generated always as identity primary key,
  redemption_id uuid not null references public.redemptions on delete cascade,
  from_status redemption_status, to_status redemption_status not null,
  actor_user_id uuid references public.user_profiles,
  reason text,
  created_at timestamptz not null default now()
);
```

#### Engagement, notifications, addresses, ops

```sql
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  name text not null, description text,
  status campaign_status not null default 'draft',
  audience jsonb not null default '{}',        -- {tiers:[], min_spend, inactive_days, store_ids}
  reward_id uuid references public.rewards,
  points_multiplier numeric(4,2),
  starts_at timestamptz, ends_at timestamptz,
  created_by uuid references public.user_profiles
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  name text not null, description text,
  metric challenge_metric not null,   -- purchases|spend|category_units|referrals
  metric_config jsonb not null default '{}',
  target numeric not null, unit text not null,
  reward_points integer not null,
  starts_at timestamptz not null, ends_at timestamptz not null,
  status challenge_status not null default 'scheduled'
);

create table public.challenge_progress (
  challenge_id uuid not null references public.challenges on delete cascade,
  customer_id  uuid not null references public.customer_profiles on delete cascade,
  progress numeric not null default 0,
  completed_at timestamptz,
  awarded_ledger_id bigint references public.points_ledger,
  updated_at timestamptz not null default now(),
  primary key (challenge_id, customer_id)
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  referrer_customer_id uuid not null references public.customer_profiles,
  referee_customer_id  uuid references public.customer_profiles,
  code text not null,
  status referral_status not null default 'pending',  -- pending|joined|qualified|expired
  joined_at timestamptz, qualified_sale_id uuid references public.sales,
  expires_at timestamptz
);

create table public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals on delete cascade,
  beneficiary_customer_id uuid not null references public.customer_profiles,
  points integer not null,
  ledger_id bigint references public.points_ledger,
  awarded_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  audience notification_audience not null,        -- customer | staff
  customer_id uuid references public.customer_profiles,
  staff_user_id uuid references public.user_profiles,
  kind notification_kind not null,                -- points|reward|tier|campaign|system|sale
  title text not null, body text not null,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check ((audience = 'customer' and customer_id is not null)
      or (audience = 'staff' and staff_user_id is not null))
);
create index notif_customer_idx on public.notifications (customer_id, created_at desc)
  where customer_id is not null;

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  customer_id uuid references public.customer_profiles on delete cascade,
  user_id uuid references public.user_profiles on delete cascade,
  channels jsonb not null default '{"in_app":true,"push":false,"email":false,"sms":false,"whatsapp":false}',
  kinds jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles on delete cascade,
  platform text not null,                -- web|android|ios
  endpoint jsonb not null,               -- web push subscription object
  token_hash bytea not null,
  last_seen_at timestamptz, revoked_at timestamptz,
  unique (user_id, token_hash)
);

create table public.notification_deliveries (   -- outbox result log
  id bigint generated always as identity primary key,
  notification_id uuid references public.notifications on delete set null,
  channel text not null, provider text,
  status delivery_status not null default 'queued',
  attempts smallint not null default 0,
  provider_message_id text, last_error text,
  queued_at timestamptz not null default now(), sent_at timestamptz
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles on delete cascade,
  label text, full_name text not null, phone text not null,
  line1 text not null, area text, city text not null, state text not null,
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  is_default boolean not null default false
);

create table public.idempotency_keys (
  key           text primary key,
  business_id   uuid not null,
  endpoint      text not null,
  request_hash  bytea not null,
  status        idempotency_status not null default 'in_progress',
  response      jsonb,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '24 hours'
);

create table public.membership_qr_tokens (      -- see §8
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  customer_id uuid not null references public.customer_profiles on delete cascade,
  token_hash bytea not null unique,
  purpose qr_purpose not null default 'membership',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz, consumed_by_staff_id uuid references public.staff_profiles,
  revoked_at timestamptz
);

create schema audit;

create table audit.audit_logs (
  id bigint generated always as identity,
  business_id uuid,
  actor_user_id uuid, actor_role text,
  action text not null,                  -- 'sale.void', 'points.adjust', 'role.change', …
  entity_type text not null, entity_id uuid,
  before jsonb, after jsonb,
  ip inet, user_agent text,
  created_at timestamptz not null default now()
) partition by range (created_at);

create table audit.qr_scan_attempts (
  id bigint generated always as identity primary key,
  business_id uuid, store_id uuid, staff_id uuid,
  token_prefix text,                     -- first 8 chars only, never the token
  result qr_scan_result not null,        -- ok|expired|not_found|revoked|wrong_business|rate_limited
  ip inet,
  created_at timestamptz not null default now()
);
```

### 2.3 Indexes that exist for a reason

| Index | Why |
|---|---|
| every `business_id` column | RLS predicate — without it each policy forces a seq scan |
| `sales (business_id, sold_at desc)`, `sales (store_id, sold_at desc)`, `sales (customer_id, sold_at desc)` | the three list screens and the customer detail page |
| `points_ledger (customer_id, id desc)` | activity feed, and the balance recomputation |
| `products USING gin (search_tsv)` + `products (business_id, category_id, status)` | POS search must stay instant while typing |
| `redemptions (business_id, status, expires_at)` | pickup queue + the expiry cron |
| `notifications (customer_id, created_at desc) where customer_id is not null` | inbox |
| `inventory_by_store (store_id) include (on_hand)` | low-stock dashboard |
| partial unique on `idempotency_key` | makes replay protection a constraint, not a race |

### 2.4 What the mock data becomes

| Phase 1 mock | Phase 2 home | Note |
|---|---|---|
| `Customer.points / lifetimePoints / redeemedPoints` | derived from `points_ledger`, cached in `customer_points_balance` | the UI keeps reading three numbers; the repository supplies them |
| `Customer.tier` | `tier_id` FK, recalculated on every earn entry | tier becomes data, not a string literal |
| `Sale.basePoints / bonusPoints` | computed **server-side** by `app.price_sale()`; browser shows an estimate | §11 of the brief |
| `RewardRule.when/then` prose | `loyalty_rule_versions.config` jsonb; the prose becomes a generated label | the rules page can still show sentences |
| `lib/points.ts calculatePoints()` | ported to `app.calculate_points()` in SQL, with the TS version retained **only** as the client-side estimate, and a parity test asserting they agree | one engine, two renderers |
| `product.image` art keys | `products.art_key` (kept) + `product_images` (new, optional) | Phase 1.3 illustrations remain the fallback, so nothing looks broken mid-migration |
| `Store.sales/revenue/customers` | `analytics.store_rollup` materialized view | stop storing derived numbers |

---

---

## 3. Migration plan and seed strategy

### 3.1 Repository layout

```
supabase/
  config.toml
  schemas/                  # declarative — desired state, diffed into migrations
    00_extensions.sql
    01_types.sql            # every enum
    05_tenancy.sql          # businesses, business_settings, stores, tiers
    10_identity.sql
    20_catalogue.sql
    30_sales.sql
    40_loyalty.sql
    50_rewards.sql
    60_engagement.sql
    70_notifications.sql
    80_ops.sql
    90_functions.sql        # app.* SECURITY DEFINER functions
    95_views.sql
  migrations/               # generated + hand-written, committed, immutable once merged
    20260910093000_initial_schema.sql
    20260910093500_rls_policies.sql        ← hand-written (migra can't diff RLS reliably)
    20260910094000_grants_and_revokes.sql  ← hand-written
    20260910094500_audit_partitions.sql    ← hand-written
    20260910095000_reference_data.sql      ← hand-written DML
  seed.sql                  # local/preview only, never production
  tests/                    # pgTAP
    rls/…  functions/…  invariants/…
```

**Why hybrid rather than pure declarative:** the verified caveat list for `supabase db diff`
says the differ does not track DML, `alter policy`, column privileges, materialized views,
partitions, comments or schema grants. Those are exactly the objects that carry our
security. So: tables/columns/indexes/functions are declarative; **policies, grants,
partitions and reference data are hand-written versioned migrations that are reviewed
line by line.**

### 3.2 Migration rules

1. One logical change per migration; RLS + indexes + grants ship **in the same migration as the table they protect** — never "we'll add policies next PR".
2. Every migration must apply cleanly from scratch: CI runs `supabase db reset` on a shadow database on every PR.
3. Migrations are forward-only. A mistake is corrected by a new migration, never by editing a merged file.
4. Destructive statements (`drop column`, `drop table`, type narrowing) require the `destructive:` prefix in the migration name and an explicit approval label on the PR. CI fails otherwise.
5. Expand → migrate → contract for any column rename: add new, backfill, dual-write, switch reads, drop old — four PRs, never one.
6. Long index builds use `create index concurrently` in a standalone migration (cannot run inside a transaction).

### 3.3 Seed strategy — three distinct data sets

| Set | Where it runs | Content | Risk control |
|---|---|---|---|
| **Reference data** (a real migration) | dev, staging, **production** | enum-backed lookup rows that the app cannot function without: the four tiers, the seven product categories, the ten baseline loyalty rules as `loyalty_rule_versions` v1, and the initial `loyalty_rule_sets` v1 | idempotent `insert … on conflict do nothing`; keyed by stable slugs, not UUIDs |
| **Business bootstrap** (one-off, operator-run) | production, once | the real `businesses` row for Ambika Electricals, its `business_settings`, the two real stores, and the owner's staff invitation | a CLI script requiring an explicit `--confirm-production` flag; produces an audit log row |
| **Demo/sample data** (`seed.sql`) | local + preview branches **only** | the current Phase 1 mock catalogue and customers, translated to SQL — still Indian electrical retail, still Ambika-specific | `seed.sql` is never referenced by a production migration; CI asserts no migration file inserts into `customer_profiles`/`sales` |

The Phase 1 mock files stay in the repo during migration as the source for `seed.sql`
generation, then are deleted service by service as each repository goes live.

**Production never receives fabricated customers, sales or points.** Ambika's real
opening data (existing members, if any) is a separate, explicitly-approved import with
its own reconciliation report — that is decision **D6**.

### 3.4 Cutover per vertical slice

Each of Steps 2–8 follows the same five moves, so the app is never half-broken:

1. Ship the migration (tables + RLS + tests) — no UI change, nothing reads it yet.
2. Ship the typed repository implementing the **existing** `useServices()` method signatures against Supabase, behind a per-service flag (`NEXT_PUBLIC_LIVE_SERVICES="products,customers"`).
3. Enable the flag in dev → preview → staging, run the slice's e2e pack.
4. Enable in production; the mock implementation stays in the bundle for one release as an instant rollback.
5. Delete the mock service and its mock-data file; update the flag list. One PR, easy to revert.

---

## 4. Roles and permissions

### 4.1 Role definitions

| Role | Scope | Who | Notes |
|---|---|---|---|
| `customer` | own `customer_profiles` row and its children | app users, and walk-in members with no login | A walk-in member (`user_id is null`) has data but no session; they can claim the account later by verifying the phone |
| `cashier` | assigned stores only | counter staff | Least privilege: create sales, scan QR, look up customers, view own store's day |
| `manager` | assigned stores | store manager | Cashier + void sales, adjust stock, confirm/complete redemptions, invite cashiers |
| `owner` | whole business | Nitin Trivedi | Everything within the business incl. settings, rules, roles, exports, points adjustments |
| `marketing` | whole business, read-mostly | campaign operator | Campaigns/challenges/notifications; **no** access to sales creation or points adjustment |
| `platform_admin` | cross-tenant | us / support | Not a business role. Read-only by default; any write is audited and requires a support-ticket reference |

`marketing` exists in the current mock (`StaffMember["role"]`) so it stays; it is not in
the brief's five, and I have not given it money or points powers.

### 4.2 Permission matrix (what the RLS policies must encode)

Legend: **R** read · **C** create · **U** update · **D** archive/void · **—** no access

| Resource | customer | cashier | manager | marketing | owner | platform_admin |
|---|---|---|---|---|---|---|
| own profile / addresses | R U | — | — | — | — | R |
| other customers | — | R (lookup by phone/QR, limited columns) | R U C | R (aggregates) | R U C | R |
| products / categories | R (active) | R | R U C | R | R U C D | R |
| inventory | — | R (own stores) | R U (own stores) | — | R U C | R |
| sales | R (own) | R (own store, own shift) C | R U D (own stores) | R (aggregate) | R C U D | R |
| points_ledger | R (own) | R (of the customer at the counter) | R | R (aggregate) | R + C via adjust RPC | R |
| rewards / options | R (active, tier-eligible) | R | R U C | R U C | R U C D | R |
| redemptions | R (own) C | R (own store) U (status→completed) | R U C D | R | R U C D | R |
| campaigns / challenges | R (published, own progress) | R | R U C | R U C | R U C D | R |
| notifications | R U (own read state) | R (own) | R C | R C | R C | R |
| stores | R (public fields) | R (own) | R U (own) | R | R U C D | R |
| staff / invitations | — | — | R + invite `cashier` | — | R U C D, role changes | R |
| business_settings, loyalty rules | — | — | R | R | R U | R |
| audit logs | — | — | R (own stores) | — | R | R |

**Never trusted from the browser:** role, `business_id`, `store_id`, points totals,
prices, tier, reward eligibility. All are re-derived server-side from the session.

---

## 5. Row Level Security design

### 5.1 Claims in the JWT

A `custom_access_token_hook` (PL/pgSQL, granted to `supabase_auth_admin`) adds exactly
three small claims — keeping the token small and stable:

```
app_business_id : uuid | null     -- the staff member's business
app_role        : 'owner'|'manager'|'cashier'|'marketing'|'customer'
app_is_admin    : boolean
```

`customer_id` and `store_ids` are **not** in the token: a customer can belong to more
than one business later, and store access changes without a re-login. Those are resolved
by indexed helper functions instead. Claims are advisory shortcuts; **every policy still
verifies against a table**, so a stale token cannot grant access that has been revoked
(revocation takes effect on the next query, not the next login).

### 5.2 Helper functions (`app_private`, `security definer`, `stable`)

```sql
create or replace function app_private.uid() returns uuid
  language sql stable as $$ select auth.uid() $$;

create or replace function app_private.is_platform_admin() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
$$;

-- the staff row for the current user in a given business (null if none)
create or replace function app_private.staff_in(p_business uuid)
returns public.staff_profiles language sql stable security definer set search_path = '' as $$
  select s.* from public.staff_profiles s
  where s.user_id = auth.uid() and s.business_id = p_business
    and s.status = 'active' and s.archived_at is null
$$;

create or replace function app_private.has_role(p_business uuid, p_roles staff_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_profiles s
    where s.user_id = auth.uid() and s.business_id = p_business
      and s.status = 'active' and s.archived_at is null and s.role = any(p_roles))
$$;

create or replace function app_private.has_store(p_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_store_access a
    join public.staff_profiles s on s.id = a.staff_id
    where a.store_id = p_store and s.user_id = auth.uid()
      and s.status = 'active' and s.archived_at is null)
     or app_private.has_role((select business_id from public.stores where id = p_store),
                             array['owner','manager']::staff_role[])
$$;

create or replace function app_private.customer_id_in(p_business uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.customer_profiles c
  where c.user_id = auth.uid() and c.business_id = p_business and c.archived_at is null
$$;
```

Three performance rules, applied everywhere:

1. Wrap helper calls in a scalar subquery — `(select app_private.has_store(store_id))` — so Postgres caches the result as an InitPlan instead of re-evaluating per row.
2. Always add `TO authenticated` (or `TO anon`) to a policy so it is skipped for other roles.
3. Index every column a policy touches (§2.3).

### 5.3 Policy pattern: restrictive tenant guard + permissive role grants

Every tenant table gets **one RESTRICTIVE policy** that can never be widened by adding a
permissive one later — this is the belt that stops a future careless policy from leaking
across businesses:

```sql
alter table public.sales enable row level security;
alter table public.sales force row level security;

create policy tenant_guard on public.sales
  as restrictive for all to authenticated
  using (
    business_id = coalesce(((select auth.jwt()) ->> 'app_business_id')::uuid,
                           business_id)          -- customers have no business claim
    and ( app_private.is_platform_admin()
       or (select app_private.staff_in(business_id)) is not null
       or business_id in (select business_id from public.customer_profiles
                          where user_id = (select auth.uid())) )
  );
```

Then narrow, permissive, per-operation policies:

```sql
-- customer sees their own purchases
create policy sales_select_own on public.sales
  for select to authenticated
  using (customer_id = (select app_private.customer_id_in(business_id)));

-- staff see sales for stores they are assigned to
create policy sales_select_staff on public.sales
  for select to authenticated
  using ((select app_private.has_store(store_id)));

-- nobody INSERTs a sale directly; only app.create_sale() may write
revoke insert, update, delete on public.sales from authenticated, anon;
```

### 5.4 Policy plan per table class

| Class | Tables | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| **Tenant config** | businesses, business_settings, tiers, loyalty_rules(+versions/sets) | staff of the business; customers see a public-safe view only | owner | owner (rules create a new *version*, never mutate) | never |
| **Store scoped** | stores, inventory_by_store, staff_store_access | staff with store access | owner/manager | owner/manager | never (archive) |
| **Catalogue** | products, product_categories, product_images | staff; customers see `status='active'` via a view | owner/manager | owner/manager | never (archive) |
| **Customer owned** | customer_profiles, customer_addresses, notification_preferences, device_tokens | self, or staff of the business | self (signup RPC) / staff (enrol RPC) | self limited columns; staff limited columns | never |
| **Transactional** | sales, sale_items, sale_payments, redemptions, redemption_items | self (customer) or store staff | **RPC only** | **RPC only** (status transitions) | never |
| **Ledger** | points_ledger, inventory_movements, redemption_status_events | self / staff | **RPC only** | **revoked at grant level + trigger** | **revoked + trigger** |
| **Engagement** | campaigns, challenges, challenge_progress, referrals | staff; customers see published + own progress | owner/manager/marketing | same | never |
| **Notifications** | notifications | recipient only | RPC / service | recipient may set `read_at` only (column-level grant) | never |
| **Ops** | audit_logs, idempotency_keys, qr tokens, scan attempts | owner (audit), nobody else | RPC only | never | never |

`storage.objects` gets its own policies (§10.3). `realtime.messages` gets topic
authorisation policies (§9.2).

### 5.5 Proving it — the authorisation test matrix

RLS is tested **separately from the UI** (brief §14). A pgTAP suite enumerates
`roles × tables × operations` and asserts the expected allow/deny for:

- two businesses, each with owner/manager/cashier/marketing and two stores;
- a cashier assigned to store A trying to read store B's sales → **deny**;
- a customer of business 1 reading business 2's rewards → **deny**;
- a customer setting `points` directly → **deny (no grant)**;
- a manager updating `points_ledger` → **deny (revoked + trigger)**;
- a platform admin reading anything → allow; writing → allow only through the audited RPC;
- **anon** touching any tenant table → deny.

A CI guard fails the build if any table in `public` has `relrowsecurity = false`, or has
RLS enabled but zero policies, or has `grant insert/update/delete … to authenticated`
on a transactional table.

---

## 6. Authentication, sessions, invitations, OTP

### 6.1 Methods

| Journey | Method | Notes |
|---|---|---|
| Customer sign-up / sign-in | **Phone OTP primary**, email+password optional | Matches Indian retail reality and the existing membership-by-phone model. Requires DLT (D4) |
| Customer account claim | Walk-in member enrolled at the counter later verifies the same phone via OTP → `customer_profiles.user_id` is linked | No duplicate member records |
| Staff sign-in | Email + password, **MFA (TOTP) required for `owner`**, offered to `manager` | TOTP is free on all Supabase plans; SMS MFA is not, and needs DLT anyway |
| Staff onboarding | Invitation link (§6.3), never self-signup | `staff_profiles.status='invited'` until accepted |
| Password reset | Supabase recovery email, PKCE flow, single-use, 1 h expiry | Existing `/forgot-password` UI is reused |
| Session | HTTP-only cookies via `@supabase/ssr`, PKCE, refreshed in middleware | Never `localStorage` |

### 6.2 Session handling rules

- Three client factories, and only three: `lib/supabase/client.ts` (browser, publishable key), `lib/supabase/server.ts` (RSC/actions, cookie-bound), `lib/supabase/admin.ts` (secret key, `import 'server-only'` at the top).
- `middleware.ts` refreshes the session and gates `/business/*` and `/customer/*`. **Authorisation is never decided in middleware alone** — it is a UX redirect; the real gate is RLS plus a server-side check inside each Server Action.
- Server code validates the user with `getUser()`/`getClaims()` (verifies the JWT) — never `getSession()`, which trusts the cookie.
- Access token TTL 1 h, refresh token rotation on, reuse detection on → a stolen refresh token invalidates the family.
- "Sign out everywhere" calls `signOut({ scope: 'global' })`; a per-device list comes from `auth.sessions` surfaced read-only in the profile screen.
- Staff sessions get a shorter idle timeout (proposed 12 h) because POS terminals are shared — decision **D5**.

### 6.3 Invitation security

1. Owner/manager creates an invitation. Server generates 32 random bytes; **only the SHA-256 hash is stored**; the raw token appears once, in the emailed link.
2. Link is single-use, expires in 7 days, is scoped to `business_id + role + store_ids`, and is revocable.
3. On acceptance the invitee must authenticate first (existing user) or sign up (new user); only then is `staff_profiles` activated, in the same transaction that marks the invitation accepted. Email must match, case-insensitively.
4. Role escalation guard: a `manager` may only invite `cashier`. An `owner` is the only role that can create another `owner`, and the **last active owner cannot be demoted or archived** (enforced by a trigger, not by the UI).
5. Every invitation create/accept/revoke and every role change writes an `audit.audit_logs` row.

### 6.4 OTP and abuse controls

- OTP: 6 digits, 5-minute validity, single use, **hashed at rest**, max 5 verification attempts per code, then the code is burned.
- Rate limits (defaults to be confirmed against the project's Auth settings at implementation): per phone 3 sends/hour, per IP 10/hour, per device 5/hour, with exponential backoff and a captcha (hCaptcha/Turnstile) after the second failure.
- Enumeration resistance: sign-in, reset and OTP endpoints return an identical generic response whether or not the identity exists.
- Login throttling: 5 failed passwords → 15-minute lockout for that identity, logged as `auth.failed_login`.
- OTP SMS content must match a DLT-approved Transactional template including the brand name and an OTP-typed variable, e.g. `Ambika Electricals: {#var#} is your login OTP, valid {#var#} minutes. Do not share.` — no links (D4).
- Server-side rate limiting for our own RPCs (QR scan, redemption create, sale create) uses a small `app_private.rate_limit(key, limit, window)` function backed by a table, so limits survive across serverless instances.

---

## 7. Immutable points ledger

### 7.1 Guarantees

1. **Append only.** `revoke update, delete on public.points_ledger from authenticated, anon, service_role;` plus a `before update or delete` trigger that raises `insufficient_privilege`. Even a secret-key connection cannot silently rewrite history — a correction is a new compensating entry.
2. **Only functions write.** `insert` is revoked from every client role; `app.append_ledger()` is `security definer`, owned by a dedicated `app_ledger_writer` role, and is the sole insert path.
3. **Balance is derived, then cached.** `append_ledger()` locks `customer_points_balance` (`for update`), computes `balance_after = current + points`, rejects the entry if it would go negative, writes the ledger row and updates the cache in the same transaction. `balance_after` is stored on the row, so the running balance is auditable without recomputation.
4. **Reconciliation.** A nightly `pg_cron` job asserts `sum(points) = current_points` per customer and raises a monitoring alert (and writes an audit row) on any drift. Any drift is a bug, not a data fix.
5. **Corrections are entries.** Void a sale → `refund_clawback` entry. Cancel a redemption → `redeem_reversal` entry. Expire points → `expiry` entry. Manual fix → `adjustment` with a mandatory reason, owner-only, audited.
6. **Clawback floor.** A clawback that would push the balance below zero writes the maximum possible negative entry and flags `customer_profiles.status='review'` for staff follow-up, rather than creating a negative balance. This needs your sign-off — decision **D7**.

### 7.2 Entry types

`earn` · `bonus` · `signup` · `referral` · `birthday` · `challenge` · `campaign` ·
`adjustment` · `redeem` · `redeem_reversal` · `refund_clawback` · `expiry` · `import`

### 7.3 Expiry (only if enabled)

Earn entries carry `expires_on = created_at + business_settings.points_expiry_months`.
A monthly job consumes the oldest unexpired earn entries FIFO against redemptions to
compute what has actually lapsed, writes one `expiry` entry per customer, and notifies
them 30 days beforehand. **Default in the proposal is expiry disabled** (`null`), because
the current UI shows "420 points expire on 31 Dec 2026" as a hard-coded string with no
rule behind it — decision **D3**.

---

## 8. Atomic transaction flows

### 8.1 `app.create_sale()` — the POS write

Signature:

```sql
app.create_sale(
  p_store_id uuid,
  p_customer_id uuid,          -- nullable (walk-in)
  p_items jsonb,               -- [{product_id, qty, unit_price_paise?, line_discount_paise?}]
  p_discount_paise bigint,
  p_payments jsonb,            -- [{method, amount_paise, reference}]
  p_idempotency_key text
) returns jsonb                -- {sale_id, invoice_no, totals, points:{base,bonus,total}, balance_after}
```

Steps, all inside one transaction:

1. **Idempotency.** `insert into idempotency_keys … on conflict do nothing`. If the key exists with the same request hash and a stored response → return the stored response. Same key, different payload → `409 conflict`. In-progress → `409 retry_later`.
2. **Authorise.** Caller must be active staff of the store's business with `has_store(p_store_id)` and role in (cashier, manager, owner). Fail closed.
3. **Lock in a deterministic order** to avoid deadlocks: customer balance row → inventory rows ordered by `product_id` → the store's invoice counter.
4. **Re-price server-side.** Prices come from `products`, not the request. If the client sent a `unit_price_paise` that differs, the sale is rejected unless the caller is manager+ and the row is flagged `price_override` (audited).
5. **Validate stock** for each line against `inventory_by_store.on_hand - reserved`. Insufficient → typed error `insufficient_stock` naming the product.
6. **Compute points** with `app.calculate_points(customer, items, rule_set)` using the **current published `loyalty_rule_sets` row**, whose id is stored on the sale. Re-running the calculation years later reproduces the same number.
7. **Write** `sales` → `sale_items` → `sale_payments` → `inventory_movements` (+ decrement `inventory_by_store`) → `points_ledger` via `append_ledger()` → tier re-evaluation → `notifications` row for the customer.
8. **Audit** `sale.create`, then emit the Realtime broadcast (§9) from an `after insert` trigger, so the event fires only if the transaction commits.
9. Store the response on the idempotency key and return it.

Errors are typed (`insufficient_stock`, `customer_not_found`, `store_forbidden`,
`price_mismatch`, `idempotency_conflict`) so the POS can show the right message instead
of a generic failure.

**Void/refund** is a separate RPC (`app.void_sale`) — manager+, requires a reason,
writes reversing inventory movements and a `refund_clawback` ledger entry, sets
`status='voided'`, and never deletes the original rows.

### 8.2 `app.redeem_reward()` — the redemption write

1. Idempotency + authorise (the customer themselves, or staff redeeming at the counter).
2. Lock the customer's balance row, then reward inventory rows in `reward_id` order.
3. Validate, in this order, with typed errors: reward active → tier rank ≥ `min_tier_rank` → eligibility window/store → `max_per_customer_per_month` → inventory available → **balance sufficient**.
4. Reserve inventory (`reserved += qty`), create `redemptions` + `redemption_items`, write the negative `redeem` ledger entry, generate the collection code (§8.4).
5. Insert `redemption_status_events (null → pending)`, audit, broadcast, notify.
6. Return the redemption id, reference, code (once, to the caller only) and expiry.

**Lifecycle** — allowed transitions are enforced by a trigger, not by the application:

```
pending ──confirm──► confirmed ──ready──► ready_for_pickup ──complete──► completed
   │                    │                        │
   └──cancel──┐         └──cancel──┐             └──cancel──┐
              ▼                    ▼                        ▼
          cancelled            cancelled                cancelled
   │
   └──(cron, expires_at passed)──► expired
```

`completed` and `cancelled`/`expired` are terminal. Cancellation and expiry release the
inventory reservation and write a `redeem_reversal` ledger entry — points come back only
through an audited compensating event, never by editing a balance.

### 8.3 Concurrency and correctness tests

- Two parallel redemptions that each need the last unit → exactly one succeeds, the other gets `insufficient_inventory`.
- Two parallel redemptions spending the same points → exactly one succeeds.
- Same idempotency key fired 20× concurrently → one sale, 20 identical responses.
- Sale + concurrent stock adjustment → no negative `on_hand` (DB check constraint is the last line of defence).
- Deadlock probe: 200 concurrent sales over an overlapping product set → zero deadlocks (deterministic lock order).

### 8.4 Collection codes

8 characters, Crockford base-32 (no I/L/O/U, so no ambiguity when read aloud), generated
from `gen_random_bytes`, checked for uniqueness within the business's open redemptions.
**Only `sha256(code)` is stored**, plus the last 4 characters for support lookup. Staff
verify by scanning or typing the code, which is hashed and compared — the database never
holds a code that can be read out of a leaked dump.

---

## 9. Membership QR token design

### 9.1 The token

The current prototype encodes `AMBIKA|<membershipId>` — a raw, guessable, permanent
identifier. That is replaced by an **opaque, short-lived, single-use token**:

```
Payload shown in the QR:   RWD1.<24-char base32 random>          (no PII, no membership id)
Stored in Postgres:        membership_qr_tokens.token_hash = sha256(token)
TTL:                       120 s (business_settings.qr_token_ttl_seconds)
Use:                       single-use — consumed_at is set on the first successful scan
```

- Issued by an authenticated RPC `app.issue_membership_token()` for the calling customer only.
- The customer app refreshes it every ~90 s while the QR sheet is open, and stops on close/tab-hide — the same visibility discipline the Phase 1.3 auth visual uses.
- Old tokens for that customer are revoked on issue (one live token per customer).
- The QR contains **no name, phone, membership id, tier or balance**. A leaked screenshot is worthless after two minutes.

### 9.2 Scan validation

`app.verify_membership_token(p_token text, p_store_id uuid)` — staff-only — checks, in
order, and records every attempt in `audit.qr_scan_attempts`:

1. Caller is active staff with access to `p_store_id` → else `wrong_business`.
2. Token hash exists → else `not_found` (generic message to the cashier).
3. Not expired, not consumed, not revoked → else `expired` / `already_used` / `revoked`.
4. Token's customer belongs to the same business as the store → else `wrong_business`.
5. Rate limit: 20 scans/minute per staff, 60/minute per store → else `rate_limited`.
6. On success: mark consumed, return **only** the fields the counter needs — name, membership id, tier name, current points. Never email, address, birthday or purchase history.

**Manual fallback** (required by §11): staff can look up by phone or membership id. That
path returns the same minimal projection, is rate-limited (10/minute), and is audited
with the search term hashed. Repeated failed lookups raise a monitoring alert — this is
the obvious enumeration vector and it is treated as one.

### 9.3 Redemption pass QR

The customer's redemption pass encodes the collection code, not the redemption id.
Validation is the same shape: hash, look up, check status/expiry/store, single-use
transition to `completed`, audited. Offline verification is explicitly **not** supported
(see D8).

---

## 10. Realtime events and notifications

### 10.1 Channels

Private channels only, one topic per audience boundary:

| Topic | Subscribers | Events |
|---|---|---|
| `business:{business_id}:ops` | owner, manager, marketing | `sale.created`, `sale.voided`, `redemption.created`, `stock.low` |
| `store:{store_id}:ops` | staff with store access | `sale.created`, `redemption.status_changed` |
| `customer:{customer_id}` | that customer | `points.changed`, `tier.changed`, `redemption.status_changed`, `challenge.progress` |
| `user:{user_id}:inbox` | that user | `notification.created` |

### 10.2 Delivery mechanism

Broadcast **from database triggers** using `realtime.broadcast_changes()` on
`after insert/update` of `sales`, `points_ledger`, `redemptions` and `notifications`, so:

- an event fires only if the transaction committed — no phantom updates;
- one write fans out once, instead of re-authorising per subscriber (the `postgres_changes` cliff);
- the payload is **our shape**, not the table shape, so we never leak columns a subscriber cannot read.

Topic authorisation is enforced by RLS policies on `realtime.messages`: a client may only
join `customer:{id}` if that id resolves to their own `customer_profiles` row, and
`store:{id}` only with `has_store(id)`.

### 10.3 Client behaviour (matches the existing `lib/events.ts` seam)

Realtime handlers **do not refetch the app**. Each event carries the minimum needed to
patch one query cache slice, and is re-emitted onto the existing typed `eventBus`, so the
Phase 1 UI keeps working unchanged:

- **Dedup:** every payload has an `event_id` (ledger id / sale id + status); a bounded LRU of the last 200 ids drops repeats after a reconnect replay.
- **Ordering:** monotonically increasing `seq` (ledger `id`, or `updated_at` for status rows); an out-of-order event is discarded rather than applied.
- **Reconnect:** exponential backoff with jitter; on `SUBSCRIBED` after a gap, one targeted refetch of the affected slice (points balance, open redemptions) reconciles anything missed. Connection state is surfaced as a small, non-alarming indicator, not a modal.
- **Optimistic UI:** the POS shows client-estimated points immediately, then reconciles to the server value from the event; if they differ, the server value wins silently and the difference is logged for us to investigate.

### 10.4 Notifications are database rows first

`notifications` is the source of truth; Realtime is only the fast path. The inbox always
reads from Postgres, so a missed socket event never loses a notification. External
delivery (push/SMS/email/WhatsApp) is an **outbox**: the same transaction writes the
notification row and enqueues a `pgmq` job; a `pg_cron` worker invokes an Edge Function
that calls the provider and records the result in `notification_deliveries` with retries
and a dead-letter queue. Clients never call a provider. Web push is deferred to Step 9
and requires permission UX, VAPID key storage, per-kind preferences, unsubscribe handling
and the DPDP consent record before it ships.

---

## 11. Storage and image upload

| Bucket | Public | Contents | Limits |
|---|---|---|---|
| `product-images` | public read, path-obscured | product photos + generated thumbnails | 5 MB, `image/jpeg png webp avif` |
| `reward-images` | public read | reward artwork | 5 MB, same types |
| `avatars` | private | staff/customer avatars | 2 MB |
| `documents` | private | invoice PDFs, exports | 20 MB, `application/pdf`, `text/csv` |

Path convention: `{business_id}/{entity_id}/{uuid}.{ext}` — the tenant boundary is the
first path segment, which is what the storage RLS policy matches on with
`storage.foldername(name)[1]`.

**Upload flow** (never a direct client write to a public bucket):

1. Client asks a Server Action for permission, sending filename, declared mime and byte size.
2. Server checks the role (owner/manager for products), enforces size/type, then issues a **signed upload URL** scoped to a server-generated path. The client cannot choose the path.
3. Client PUTs the bytes straight to Storage (keeps large uploads off our server).
4. Client calls `confirmUpload(path)`; the server **verifies the object server-side** — actual size, real content type from magic bytes, dimensions — and only then inserts `product_images`. Objects never confirmed are swept by a nightly job.
5. Alt text is **required** by the form and by a `not null` constraint. Accessibility is not optional.
6. Rendering uses Supabase image transformations for a 320/640/1280 set, `next/image` with the Supabase loader, and `cacheControl: 'public, max-age=31536000, immutable'` (paths are content-unique).

The Phase 1.3 illustration set stays: `products.art_key` remains the fallback whenever a
product has no image, so the catalogue never shows a broken tile during migration.
Buckets have `file_size_limit` and `allowed_mime_types` set at the bucket level too —
defence in depth, because a bucket setting cannot be bypassed by a bug in our route.

---

## 12. Environments

| | Local | Preview (per PR) | Staging | Production |
|---|---|---|---|---|
| Database | `supabase start` (Docker) | Supabase preview branch (Pro) | persistent branch or its own project | own project, region **ap-south-1 (Mumbai)** |
| Data | `seed.sql` demo data | `seed.sql` demo data | anonymised, realistic volume | real only |
| App | `next dev` | Vercel preview | Vercel staging | Vercel production |
| Auth emails | Inbucket (local) | test inbox | test inbox | real provider |
| SMS | logged to console | logged | provider sandbox | live DLT-approved templates |
| Secret key | local, throwaway | branch-scoped | staging-only | production-only, rotated quarterly |

Environment variables (exact names to be fixed at implementation):

```
NEXT_PUBLIC_SUPABASE_URL              # per environment
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  # sb_publishable_… safe in the browser
SUPABASE_SECRET_KEY                   # sb_secret_… server only, NEVER NEXT_PUBLIC_
SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN   # CI only
SENTRY_DSN, SMS_PROVIDER_KEY, VAPID_PUBLIC/PRIVATE_KEY
```

A CI check greps the built client bundle for `sb_secret_` and for any secret name and
fails the build on a hit. `lib/supabase/admin.ts` starts with `import 'server-only'` so a
client import is a compile error, not a production incident.

Data residency: Mumbai is proposed for latency and for DPDP-friendly Indian residency.
Confirm — decision **D9**.

---

## 13. CI, security, backups, monitoring, testing

### 13.1 CI pipeline (GitHub Actions, on every PR)

| Job | Gate |
|---|---|
| `typecheck` | `tsc --noEmit` |
| `lint` | `next lint`, plus a rule banning `service_role`/secret imports outside `lib/supabase/admin.ts` |
| `unit` | Vitest: points engine, zod schemas, mappers. Includes the **SQL↔TS points parity test** |
| `db` | `supabase db reset` on a shadow DB → all migrations apply from scratch → `supabase db lint` |
| `pgtap` | the §5.5 authorisation matrix + ledger invariants + concurrency tests |
| `rls-guard` | fails if any `public` table lacks RLS, lacks policies, or grants write to `authenticated` on a transactional table |
| `migration-guard` | fails on destructive DDL without the approval label; fails if a migration inserts into customer/sale/ledger tables |
| `e2e` | Playwright on a preview branch: customer signup → enrol → sale → points → redeem → collect |
| `security` | `npm audit --production`, gitleaks secret scan, CodeQL, bundle scan for secret patterns |
| `perf` | first-load JS budget per route — the Phase 1.3 numbers become the ceiling |

Merge to `main` → migrations applied to staging automatically; **production deploys are a
manual, approved promotion** of the exact commit that passed staging.

### 13.2 Backups and recovery

- Point-in-Time Recovery enabled (Pro add-on), 7-day window minimum.
- Daily logical dump (`pg_dump`) to an external bucket in a different provider, 30-day retention, encrypted at rest.
- **Quarterly restore drill** into a scratch project, with a written RTO/RPO result. A backup that has never been restored is not a backup. Target: RPO ≤ 5 min (PITR), RTO ≤ 2 h.
- Ledger and audit logs are additionally exported monthly to cold storage with a 7-year retention (financial record convention — confirm in D10).
- `audit.audit_logs` partitions are detached and archived after 12 months, never dropped.

### 13.3 Monitoring and testing

- **Errors:** Sentry on client and server, release-tagged, with a `request_id` that also appears in the structured server log and in `audit_logs`, so one id ties a user report to the exact DB transaction.
- **Health:** `/api/health` checks DB, Auth and Storage reachability; used by uptime monitoring.
- **Alerts:** error rate, p95 RPC latency, failed logins spike, QR failure spike, redemption failure spike, pgmq queue depth, delivery failure rate, **ledger drift ≠ 0**, `on_hand < 0` (should be impossible), RLS-denied surge.
- **Load:** k6 against `create_sale` at expected peak (a festival Saturday) × 3, plus a Realtime soak with the expected concurrent subscribers.
- **Accessibility:** axe in CI on the critical flows; manual keyboard/screen-reader pass before UAT — carried over from Phase 1.3.
- **Security testing:** the authorisation matrix (§5.5), an IDOR sweep over every route handler with two tenants' ids, rate-limit verification, and a dependency/secret scan on every build.

### 13.4 Decisions I need from you before Step 2

> **Everything below is a business or budget decision. I will not pick for you.**

| # | Decision | Why it matters | My recommendation |
|---|---|---|---|
| **D1** | **Upgrade Next.js 14 → 16 LTS before real auth ships?** | 14.x is EOL since Oct 2025 and receives no security patches; the July 2026 batch included a middleware/proxy bypass. Putting real sessions on an unpatched framework is the largest risk in Phase 2 | **Yes — upgrade first**, as its own PR with the Phase 1.3 QA re-run. 14→15→16, two hops. Adds ~1 sprint; buys two years of patches |
| **D2** | **Single-tenant or multi-tenant?** Is Rewardly only ever Ambika, or a product other shops will buy? | The whole model carries `business_id` and full RLS either way, but multi-tenant adds sign-up, billing and support tooling later | Keep the multi-tenant **schema** (cheap now, impossible to retrofit) and ship a single-tenant **product**. Decide commercially later |
| **D3** | **Loyalty economics.** Confirm: 10 points per ₹100; 1 point = ₹0.10; Bronze/Silver/Gold/Platinum at 0/1,000/5,000/15,000 lifetime points with 1/1.25/1.5/2× multipliers; **do points expire?** | These are prototype numbers. Once real points are issued they are a liability you owe customers. Changing them later needs a migration and a customer communication | Confirm the earn rate as-is; **start with no expiry**, add a 24-month rule later with 30-day warnings if you want the liability capped |
| **D4** | **Phone OTP: who owns DLT registration, and which SMS provider?** | Mandatory in India. Entity + header + template approval takes ~1–2 weeks and needs your business documents. Without it, OTP simply does not arrive | Start DLT registration **now**, in parallel with Step 2, so it is not the critical path. Provider: MSG91 or Twilio India route — I'll compare cost/deliverability once you name a budget |
| **D5** | **Staff session policy.** Shared POS terminals: idle timeout, and is TOTP MFA mandatory for owner (and manager)? | Trade-off between counter friction and someone walking up to an unlocked till | 12-hour idle timeout, quick PIN re-auth for the cashier, **MFA mandatory for owner**, optional for manager |
| **D6** | **Is there existing member/points data to import?** (spreadsheets, an old system, Tally/Busy) | Determines whether we need an import pipeline, dedupe rules and an opening-balance ledger entry type | Tell me the format; I'll add an `import` ledger entry type and a reconciliation report before any go-live |
| **D7** | **Refund policy for points.** If a sale is voided after the customer already spent those points, do we allow a negative balance, cap the clawback at zero, or flag for staff? | Real scenario at a counter; it must be a policy, not an accident | Cap at zero and flag the account for review |
| **D8** | **Offline behaviour at the till.** If the internet drops mid-sale, may staff complete a sale offline and sync later? | Offline sales cannot validate stock, points or QR tokens. The brief forbids shipping this until conflict resolution is designed | **No offline sale confirmation in Phase 2.** Offline read-only + a queued draft that must be confirmed online |
| **D9** | **Region and compliance.** Confirm Mumbai (ap-south-1) residency; who is the DPDP "Data Fiduciary" contact; consent text for marketing messages; retention/deletion policy for a customer who asks to be erased | DPDP Act 2023 penalties are severe, and erasure conflicts with keeping an immutable ledger | Mumbai; erase PII (name/phone/email/address) on request but **retain pseudonymised ledger and sale rows** for financial integrity, documented in the privacy notice |
| **D10** | **Supabase plan and budget.** Pro is required for branching, PITR and SMS-based MFA; plus SMS costs (~₹0.12/message), Sentry, and the Vercel plan | Preview branches and PITR are load-bearing in this plan | Supabase Pro from Step 2. I'll produce a monthly cost estimate at your expected member/sale volume if you give me the numbers |
| **D11** | **Payments.** Reward options include `points_cash` (a cash top-up). Is that collected at the counter, or does it need an online payment gateway (Razorpay/UPI)? | A gateway adds PCI scope, refunds, reconciliation and a whole delivery step | Counter-collected in Phase 2; gateway only if you need online redemption checkout |
| **D12** | **Is Rewardly the invoice of record for GST?** Or does billing stay in your existing software, with Rewardly recording the sale for loyalty only? | Changes whether we need GST-compliant sequential invoicing, HSN codes, tax breakup and e-invoice APIs | **Loyalty record only** for Phase 2. `invoice_no` is our internal reference; your existing billing stays authoritative. If Rewardly must issue GST invoices, that is a separate scoped workstream |

### 13.5 Assumptions I have made

1. One business (Ambika Electricals), two stores, single currency INR, single timezone Asia/Kolkata.
2. Expected scale: low tens of thousands of customers, hundreds of sales/day, tens of concurrent staff — comfortably within a Supabase Pro instance. Realtime subscriber counts stay far below the Broadcast threshold.
3. Staff always have connectivity at the till (see D8).
4. The Phase 1.3 UI is final for these journeys; Phase 2 changes data sources, not layouts.
5. No third-party ERP/accounting integration in Phase 2 (see D12).
6. English-only UI for now; `user_profiles.locale` exists so Gujarati/Hindi can be added without a migration.
7. Product images are supplied by Ambika (photos or the existing illustration set); no stock photography.

### 13.6 Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Next.js 14 CVE exploited after real auth ships | Medium | **Critical** | D1 — upgrade before Step 2 |
| An RLS policy gap leaks cross-tenant data | Medium | Critical | Restrictive tenant guard + pgTAP matrix + CI RLS guard + IDOR sweep |
| Points forged or double-spent | Low | Critical | Ledger writes only via `security definer` RPC, revoked grants, row locks, idempotency, concurrency tests |
| Ledger/cache drift | Medium | High | `balance_after` on every row + nightly reconciliation alert |
| DLT approval delays phone OTP | **High** | Medium | Start registration in parallel; email+password ships first, OTP behind a flag |
| Migration breaks production | Low | High | Shadow-DB reset in CI, staging soak, forward-only, destructive-DDL gate, PITR |
| Realtime cost/limit surprise | Low | Medium | Broadcast (not postgres_changes), narrow topics, subscriber metrics alarmed |
| Secret key leaks into the client bundle | Low | Critical | `server-only` import, lint rule, bundle grep in CI, per-service rotatable secret keys |
| Scope creep from "while we're in there" UI changes | High | Medium | Phase 2 PRs may not change layout; visual changes go to a separate backlog |
| `@supabase/ssr` breaking change (still beta) | Medium | Low | All client construction isolated to 3 files; versions pinned; upgrade is a deliberate PR |

---

## 14. What Step 2 looks like once you approve

The first vertical slice, so you can see the shape of every slice after it:

1. Supabase project created (dev + staging), CLI wired, `config.toml` committed.
2. Migrations 1–5: extensions, enums, tenancy, identity, and their RLS + grants.
3. `custom_access_token_hook`, the `app_private` helpers, the pgTAP authorisation matrix (**tests before features**).
4. `lib/supabase/{client,server,admin}.ts`, `middleware.ts` session refresh, `/auth/callback`.
5. Real sign-up/sign-in/reset wired into the **existing** Phase 1.3 auth screens — no visual change beyond real error states.
6. Owner bootstrap + staff invitation flow; `/business/staff` reads live data.
7. Route protection: business routes require an active staff row; customer routes require a customer profile.
8. Everything else still runs on mocks behind the service flags.
9. Delivered as a PR with: the migration diff, the RLS test output, a short security note, and a demo script.

Steps 3–10 then follow Part B §15 in order, one slice per step, each with its own tests
and its own report — never all mock services at once.

---

## 15. Approval checklist

Please reply with a decision on each. D1, D3, D4 and D12 block Step 2; the rest can be
answered as we go, but the earlier the better.

- [ ] **D1** Next.js 14 → 16 upgrade before real auth (recommended: yes)
- [ ] **D2** Multi-tenant schema, single-tenant product (recommended: yes)
- [ ] **D3** Loyalty economics confirmed; points expiry yes/no
- [ ] **D4** DLT registration owner + SMS provider
- [ ] **D5** Staff session timeout + mandatory MFA for owner
- [ ] **D6** Existing member/points data to import?
- [ ] **D7** Points clawback policy on voided sales
- [ ] **D8** No offline sale confirmation in Phase 2 (recommended: agreed)
- [ ] **D9** Mumbai region, DPDP contact, consent text, erasure policy
- [ ] **D10** Supabase Pro + budget approved
- [ ] **D11** Cash top-up at counter vs online payment gateway
- [ ] **D12** GST invoice of record stays in your existing billing software

**Nothing will be built until you approve.** On approval I will start Step 2 and nothing
beyond it.
