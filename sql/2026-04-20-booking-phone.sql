-- Add phone column to bookings table
-- Nullable for existing bookings; new bookings will require it via API validation.
ALTER TABLE bookings ADD COLUMN phone text;
