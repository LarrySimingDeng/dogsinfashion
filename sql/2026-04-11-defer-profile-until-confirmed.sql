-- Defer profile creation until the user's email is actually confirmed.
--
-- Problem: previously, `handle_new_user` fired on `AFTER INSERT ON auth.users`,
-- which runs as soon as someone calls supabase.auth.signUp(). A user who
-- typos their email (e.g. `12345@163.cpm` instead of `.com`) will still
-- have a `public.profiles` row created for them, even though they can
-- never confirm and can never log in. Over time this leaves orphaned
-- profile rows that cannot be cleaned up automatically, and makes the
-- profiles table not a reliable "this user is real" signal.
--
-- Fix: move the trigger to fire on `INSERT OR UPDATE OF email_confirmed_at`,
-- and only insert the profile when `email_confirmed_at` is (or just became)
-- NOT NULL. This covers three flows:
--   1. Email/password signup with confirmation enabled:
--      INSERT with email_confirmed_at=NULL -> no profile yet.
--      User clicks confirmation link -> UPDATE sets email_confirmed_at
--      -> trigger fires -> profile created.
--   2. Google OAuth (and any provider that returns a pre-verified email):
--      Supabase inserts the auth.users row with email_confirmed_at already
--      set, so the INSERT branch fires and the profile is created.
--   3. Admin manually confirms a user in the Supabase dashboard:
--      UPDATE transitions email_confirmed_at from NULL to NOT NULL -> fires.
--
-- Idempotent: safe to re-run. Only affects the trigger definition; no data
-- is migrated. Existing profiles are untouched.
--
-- Run this in Supabase SQL Editor ONCE. Takes ~1 second. No redeploy needed.

create or replace function public.handle_new_user()
returns trigger as $$
begin
  -- Skip while the email is still unconfirmed.
  if new.email_confirmed_at is null then
    return new;
  end if;

  -- On UPDATE, only act on the NULL -> NOT NULL transition. If the row
  -- was already confirmed and some other column is being updated, do
  -- nothing — we already created the profile the first time around.
  -- (Nested to avoid relying on plpgsql's handling of OLD.* in an INSERT
  -- context, where OLD is an unassigned record. The nested form only
  -- touches OLD when tg_op is 'UPDATE', which is unambiguously safe.)
  if tg_op = 'UPDATE' then
    if old.email_confirmed_at is not null then
      return new;
    end if;
  end if;

  insert into public.profiles (id, name, avatar_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    case when new.email in (
      'contact@dogsinfashion.com',
      'dogsinfashionca@gmail.com'
      -- add deployment admin emails here
    ) then 'admin' else 'client' end
  )
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer
set search_path = public;

-- Re-attach the trigger with the new event list. The old trigger was
-- AFTER INSERT only; we need INSERT OR UPDATE OF email_confirmed_at now.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Sanity checks
-- ---------------------------------------------------------------------------

-- Check 1: function config still has search_path pinned.
-- Expected: proconfig shows {search_path=public}, prosecdef = true.
select
  p.proname as function_name,
  p.prosecdef as is_security_definer,
  p.proconfig as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'handle_new_user' and n.nspname = 'public';

-- Check 2: trigger is attached to auth.users and fires on both events.
-- Expected: one row, tgname = 'on_auth_user_created'.
select tgname, tgrelid::regclass as table_name, tgenabled, tgtype
from pg_trigger
where tgname = 'on_auth_user_created';

-- Check 3 (optional, for peace of mind): count any existing profiles
-- that belong to unconfirmed auth.users. These are leftovers from the
-- old trigger behavior. You can decide separately whether to delete
-- them — this migration does NOT touch them automatically.
select count(*) as orphaned_profiles_from_unconfirmed_users
from public.profiles p
join auth.users u on u.id = p.id
where u.email_confirmed_at is null;
