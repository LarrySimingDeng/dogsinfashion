-- Fix: Stage 2 migration (2026-04-10-migrate-admin-email.sql) broke signup
-- because the CREATE OR REPLACE dropped schema qualification + search_path.
--
-- Symptom: POST /auth/v1/signup returns 500 with Postgres log:
--   "relation \"profiles\" does not exist (SQLSTATE 42P01)"
--   -> "500: Database error saving new user"
--
-- Root cause: Supabase Auth runs triggers with empty search_path for
-- security. `insert into profiles` cannot resolve the unqualified table
-- name. Fix: (1) fully qualify `public.profiles`, and (2) pin
-- `search_path = public` on the function itself so it's robust
-- regardless of caller search_path.
--
-- Idempotent: safe to re-run. Only affects NEW signups; existing users
-- are unaffected.
--
-- Run this in Supabase SQL Editor ONCE. Takes ~1 second. No service
-- restart or redeploy needed. After running, Doris can immediately
-- retry signup at www.dogsinfashion.com.

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, avatar_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    case when new.email in (
      'contact@dogsinfashion.com',
      'dogsinfashionca@gmail.com',
      '<your-dev-email>',
      '<admin-email>'
    ) then 'admin' else 'client' end
  );
  return new;
end;
$$ language plpgsql security definer
set search_path = public;

-- Sanity check 1: verify the function config now has search_path set.
-- Expected: config column shows {search_path=public}
select
  p.proname as function_name,
  p.prosecdef as is_security_definer,
  p.proconfig as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'handle_new_user' and n.nspname = 'public';

-- Sanity check 2: verify the trigger is still attached to auth.users.
-- Expected: one row, tgname = 'on_auth_user_created'
select tgname, tgrelid::regclass as table_name, tgenabled
from pg_trigger
where tgname = 'on_auth_user_created';
