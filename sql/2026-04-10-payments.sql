-- ============================================================
-- Phase 7: Mandatory deposit (Square Payments)
-- Adds `payments` audit table + `deposit_status` / `deposit_paid_at`
-- columns on `bookings`.
-- Run in Supabase SQL Editor (dev first, then prod).
-- Safe to re-run: all statements are idempotent.
-- ============================================================

-- Step 1: payments audit table
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  type text not null default 'deposit'
    check (type in ('deposit', 'balance', 'refund')),
  amount_cents int not null check (amount_cents > 0),
  currency text not null default 'USD',
  status text not null default 'paid'
    check (status in ('paid', 'refunded')),
  square_payment_id text unique,
  square_receipt_url text,
  paid_at timestamptz not null default now(),
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_booking on payments(booking_id);

-- Step 2: RLS on payments
-- Backend uses service role key and bypasses RLS; this policy only
-- governs direct PostgREST access from the client.
alter table payments enable row level security;

drop policy if exists "Users view own payments" on payments;
create policy "Users view own payments" on payments for select using (
  exists (
    select 1 from bookings b
    where b.id = payments.booking_id and b.user_id = auth.uid()
  )
);

-- Step 3: deposit_status + deposit_paid_at on bookings
alter table bookings
  add column if not exists deposit_status text not null default 'none';

-- Add check constraint separately so re-runs don't fail
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_deposit_status_check'
  ) then
    alter table bookings
      add constraint bookings_deposit_status_check
      check (deposit_status in ('none', 'paid', 'refunded'));
  end if;
end $$;

alter table bookings
  add column if not exists deposit_paid_at timestamptz;

-- ============================================================
-- Verification queries (run manually after the migration):
--
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_name = 'bookings'
--     and column_name in ('deposit_status', 'deposit_paid_at');
--
--   select column_name, data_type
--   from information_schema.columns
--   where table_name = 'payments'
--   order by ordinal_position;
-- ============================================================
