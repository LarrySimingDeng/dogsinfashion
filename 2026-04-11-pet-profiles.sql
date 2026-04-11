-- Phase A of the Pet Profiles feature.
--
-- Adds a `pets` table (one row per dog, per user), a nullable `bookings.pet_id`
-- FK, a `profiles.default_address` column, and all RLS policies needed for
-- owner + admin access.
--
-- Idempotent: safe to re-run. No data migration — old bookings stay with
-- pet_id = NULL (project is pre-launch).
--
-- After running this, the Supabase Storage `pet-photos` bucket and its RLS
-- policies must be created via the dashboard (see companion instructions).

-- ---------------------------------------------------------------------------
-- pets table
-- ---------------------------------------------------------------------------
create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  breed text,
  size text check (size in ('small', 'medium', 'large')),
  birthday date,
  photo_url text,
  care_notes text,      -- visible to owner + admin
  groomer_notes text,   -- admin-only writable; owner cannot see
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pets_user_id_idx
  on public.pets(user_id)
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- bookings.pet_id (nullable FK — legacy bookings keep NULL)
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists pet_id uuid references public.pets(id) on delete set null;

create index if not exists bookings_pet_id_idx on public.bookings(pet_id);

-- ---------------------------------------------------------------------------
-- profiles.default_address
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists default_address text;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- (matches 2026-04-10-fix-trigger-search-path.sql: security definer + pinned
-- search_path so it works regardless of caller context.)
-- ---------------------------------------------------------------------------
create or replace function public.pets_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists pets_updated_at_trigger on public.pets;
create trigger pets_updated_at_trigger
  before update on public.pets
  for each row execute function public.pets_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.pets enable row level security;

-- drop-if-exists block so this migration is safe to re-run
drop policy if exists "pets_owner_select" on public.pets;
drop policy if exists "pets_admin_select" on public.pets;
drop policy if exists "pets_owner_insert" on public.pets;
drop policy if exists "pets_owner_update" on public.pets;
drop policy if exists "pets_admin_update" on public.pets;
drop policy if exists "pets_owner_delete" on public.pets;

-- Owner sees their own non-archived pets (defense-in-depth against a direct
-- PostgREST client; the backend uses supabaseAdmin and filters explicitly.)
create policy "pets_owner_select" on public.pets for select
  using (auth.uid() = user_id and archived_at is null);

create policy "pets_admin_select" on public.pets for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "pets_owner_insert" on public.pets for insert
  with check (auth.uid() = user_id);

-- UPDATE policies need both USING and WITH CHECK so an owner can't re-assign
-- user_id to another user.
create policy "pets_owner_update" on public.pets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "pets_admin_update" on public.pets for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "pets_owner_delete" on public.pets for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Sanity checks
-- ---------------------------------------------------------------------------
-- Expected: one row showing pets table with RLS enabled.
select relname, relrowsecurity
from pg_class
where relname = 'pets' and relnamespace = 'public'::regnamespace;

-- Expected: 6 rows (the 6 policies above).
select polname from pg_policy
where polrelid = 'public.pets'::regclass
order by polname;

-- Expected: one row — bookings.pet_id column exists.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'bookings' and column_name = 'pet_id';

-- Expected: one row — profiles.default_address exists.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'default_address';
