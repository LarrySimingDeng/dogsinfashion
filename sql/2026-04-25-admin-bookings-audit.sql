-- Add audit field to track bookings created by an admin on behalf of a user
-- via POST /api/bookings/admin. Null for user self-service bookings.
--
-- on delete set null: if the admin auth.users row is ever deleted, keep the
-- historical booking row but null the audit pointer (instead of blocking the
-- delete). This is the right semantics for an audit field.

alter table bookings
  add column if not exists created_by_admin_id uuid
  references auth.users(id) on delete set null;

comment on column bookings.created_by_admin_id is
  'Set when an admin created this booking on behalf of a user via /api/bookings/admin. Null for user self-service bookings.';
