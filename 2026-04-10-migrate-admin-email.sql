-- Migration: add contact@dogsinfashion.com to admin whitelist
-- Date: 2026-04-10
-- Context: Doris moved from dogsinfashionca@gmail.com (personal Gmail) to
-- contact@dogsinfashion.com (Google Workspace on the brand domain). Keep the
-- old email in the whitelist as a backup so the existing account stays admin.
--
-- Run this in Supabase SQL Editor, first in DEV, then verify, then in PROD.
--
-- Idempotent: running multiple times is safe.
--   - CREATE OR REPLACE replaces the function definition.
--   - The backfill UPDATE is a no-op if role is already 'admin'.

-- 1) Update the trigger function. This only affects NEW signups going
--    forward; existing profile rows keep their current role unless the
--    backfill below promotes them.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, name, avatar_url, role)
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
$$ language plpgsql security definer;

-- 2) Backfill: if Doris has already signed up with the new email before
--    this migration ran, promote her existing profile row to admin.
--    If she hasn't signed up yet, this updates 0 rows (harmless).
update profiles
set role = 'admin'
where id in (
  select id from auth.users where email = 'contact@dogsinfashion.com'
)
and role <> 'admin';

-- 3) Sanity check: print current admin accounts after migration so you can
--    eyeball the result in the SQL Editor output pane.
select u.email, p.role, p.id
from profiles p
join auth.users u on u.id = p.id
where p.role = 'admin'
order by u.email;
