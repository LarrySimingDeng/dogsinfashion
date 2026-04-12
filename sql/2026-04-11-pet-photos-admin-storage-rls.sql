-- Phase A supplement: grant admin full write access to the pet-photos
-- Supabase Storage bucket. Runs after 2026-04-11-pet-profiles.sql and after
-- the pet-photos bucket + owner RLS policies have been created via the
-- Supabase dashboard.
--
-- Permission model: admin is a super user for this project — any admin can
-- upload / update / delete photos on behalf of any client. Owner-only RLS
-- is preserved for clients; these policies stack additively on top.
--
-- Idempotent: safe to re-run.

drop policy if exists "pet_photos_admin_write" on storage.objects;
drop policy if exists "pet_photos_admin_update" on storage.objects;
drop policy if exists "pet_photos_admin_delete" on storage.objects;

create policy "pet_photos_admin_write" on storage.objects for insert
  with check (
    bucket_id = 'pet-photos'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "pet_photos_admin_update" on storage.objects for update
  using (
    bucket_id = 'pet-photos'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "pet_photos_admin_delete" on storage.objects for delete
  using (
    bucket_id = 'pet-photos'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Sanity check: should return 6 rows total (3 owner + 3 admin).
select polname from pg_policy
where polrelid = 'storage.objects'::regclass
  and polname like 'pet_photos_%'
order by polname;
