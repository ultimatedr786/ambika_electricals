-- ============================================================================
-- Minimal Supabase-compatible stubs so the real migrations + RLS suite can run
-- on ANY plain PostgreSQL (CI service container, embedded-postgres, laptop).
-- Everything is idempotent and no-ops on a real Supabase database where the
-- auth schema and roles already exist.
--
-- This is a test harness, NOT a replacement for Supabase Auth. On a hosted
-- project the platform provides auth.users, auth.uid() and the anon /
-- authenticated / service_role roles.
-- ============================================================================

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create schema if not exists auth;
create schema if not exists extensions;

-- auth.users stub: only the columns the app migrations/triggers/seed touch.
create table if not exists auth.users (
  instance_id        uuid,
  id                 uuid primary key default gen_random_uuid(),
  aud                text,
  role               text,
  email              text unique,
  encrypted_password text not null default '',
  email_confirmed_at timestamptz,
  raw_app_meta_data  jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- auth.uid() stub: mirrors Supabase — the user id comes from the verified JWT
-- claims (request.jwt.claims ->> 'sub'), never from request bodies.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ), ''
  )::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select on auth.users to service_role;
grant usage on schema public to anon, authenticated, service_role;
