-- ============================================================
-- Mock data for Analytics Dashboard testing
-- Run in Supabase SQL Editor
-- ============================================================

-- Step 1: Create mock users in auth.users
-- (uses fixed UUIDs so the script is idempotent)

INSERT INTO auth.users (id, instance_id, email, encrypted_password, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
VALUES
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'mock-alice@example.com', crypt('password123', gen_salt('bf')), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"full_name":"Alice Wong"}', now() - interval '3 months', now(), '', now()),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'mock-bob@example.com',   crypt('password123', gen_salt('bf')), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"full_name":"Bob Smith"}',  now() - interval '2 months', now(), '', now()),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'mock-carol@example.com', crypt('password123', gen_salt('bf')), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"full_name":"Carol Lee"}',  now() - interval '2 weeks',  now(), '', now())
ON CONFLICT (id) DO NOTHING;

-- Step 2: Create profiles
-- Note: the trigger handle_new_user should auto-create these,
-- but in case it didn't fire, insert manually.
-- name column stores email (as per your setup).

INSERT INTO profiles (id, name, role)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'mock-alice@example.com', 'client'),
  ('a0000000-0000-0000-0000-000000000002', 'mock-bob@example.com',   'client'),
  ('a0000000-0000-0000-0000-000000000003', 'mock-carol@example.com', 'client')
ON CONFLICT (id) DO NOTHING;

-- Step 3: Insert mock bookings
-- Mix of completed (revenue), confirmed (upcoming), and cancelled
-- Spread across last ~3 months so all charts have data

INSERT INTO bookings (user_id, service_id, date, start_time, end_time, dog_name, dog_breed, address, notes, status, created_at) VALUES

-- === Alice's bookings (loyal returning customer, small dog) ===
('a0000000-0000-0000-0000-000000000001', 'bath-small',   CURRENT_DATE - 85, '09:00', '10:00', 'Mochi',   'Pomeranian',       '123 Oak St',   NULL,                    'completed', now() - interval '85 days'),
('a0000000-0000-0000-0000-000000000001', 'groom-small',  CURRENT_DATE - 78, '10:00', '12:00', 'Mochi',   'Pomeranian',       '123 Oak St',   'Extra fluffy please',   'completed', now() - interval '78 days'),
('a0000000-0000-0000-0000-000000000001', 'bath-small',   CURRENT_DATE - 57, '09:00', '10:00', 'Mochi',   'Pomeranian',       '123 Oak St',   NULL,                    'completed', now() - interval '57 days'),
('a0000000-0000-0000-0000-000000000001', 'groom-small',  CURRENT_DATE - 43, '14:00', '16:00', 'Mochi',   'Pomeranian',       '123 Oak St',   NULL,                    'completed', now() - interval '43 days'),
('a0000000-0000-0000-0000-000000000001', 'bath-small',   CURRENT_DATE - 29, '09:00', '10:00', 'Mochi',   'Pomeranian',       '123 Oak St',   NULL,                    'completed', now() - interval '29 days'),
('a0000000-0000-0000-0000-000000000001', 'groom-small',  CURRENT_DATE - 18, '11:00', '13:00', 'Mochi',   'Pomeranian',       '123 Oak St',   'Birthday groom!',       'completed', now() - interval '18 days'),
('a0000000-0000-0000-0000-000000000001', 'bath-small',   CURRENT_DATE - 2,  '09:00', '10:00', 'Mochi',   'Pomeranian',       '123 Oak St',   NULL,                    'completed', now() - interval '2 days'),
('a0000000-0000-0000-0000-000000000001', 'groom-small',  CURRENT_DATE,      '10:00', '12:00', 'Mochi',   'Pomeranian',       '123 Oak St',   NULL,                    'completed', now()),
('a0000000-0000-0000-0000-000000000001', 'bath-small',   CURRENT_DATE + 5,  '09:00', '10:00', 'Mochi',   'Pomeranian',       '123 Oak St',   NULL,                    'confirmed', now()),
('a0000000-0000-0000-0000-000000000001', 'groom-small',  CURRENT_DATE - 35, '15:00', '17:00', 'Mochi',   'Pomeranian',       '123 Oak St',   'Need to reschedule',    'cancelled', now() - interval '36 days'),

-- === Bob's bookings (medium dog: Buster) ===
('a0000000-0000-0000-0000-000000000002', 'bath-medium',  CURRENT_DATE - 70, '10:00', '11:00', 'Buster',  'Beagle',           '456 Elm Ave',  NULL,                    'completed', now() - interval '70 days'),
('a0000000-0000-0000-0000-000000000002', 'groom-medium', CURRENT_DATE - 55, '09:00', '11:00', 'Buster',  'Beagle',           '456 Elm Ave',  NULL,                    'completed', now() - interval '55 days'),
('a0000000-0000-0000-0000-000000000002', 'bath-medium',  CURRENT_DATE - 40, '14:00', '15:00', 'Buster',  'Beagle',           '456 Elm Ave',  'Use oatmeal shampoo',   'completed', now() - interval '40 days'),
('a0000000-0000-0000-0000-000000000002', 'groom-medium', CURRENT_DATE - 25, '10:00', '12:00', 'Buster',  'Beagle',           '456 Elm Ave',  NULL,                    'completed', now() - interval '25 days'),
('a0000000-0000-0000-0000-000000000002', 'bath-medium',  CURRENT_DATE - 12, '09:00', '10:00', 'Buster',  'Beagle',           '456 Elm Ave',  NULL,                    'completed', now() - interval '12 days'),
('a0000000-0000-0000-0000-000000000002', 'groom-medium', CURRENT_DATE - 5,  '14:00', '16:00', 'Buster',  'Beagle',           '456 Elm Ave',  NULL,                    'completed', now() - interval '5 days'),
('a0000000-0000-0000-0000-000000000002', 'bath-medium',  CURRENT_DATE - 1,  '10:00', '11:00', 'Buster',  'Beagle',           '456 Elm Ave',  NULL,                    'completed', now() - interval '1 day'),
('a0000000-0000-0000-0000-000000000002', 'groom-medium', CURRENT_DATE + 3,  '09:00', '11:00', 'Buster',  'Beagle',           '456 Elm Ave',  NULL,                    'confirmed', now()),
('a0000000-0000-0000-0000-000000000002', 'bath-medium',  CURRENT_DATE - 20, '15:00', '16:00', 'Buster',  'Beagle',           '456 Elm Ave',  'Dog is sick',           'cancelled', now() - interval '21 days'),

-- === Bob's second dog (large: Duke) ===
('a0000000-0000-0000-0000-000000000002', 'bath-large',   CURRENT_DATE - 60, '11:00', '12:00', 'Duke',    'Golden Retriever', '456 Elm Ave',  NULL,                    'completed', now() - interval '60 days'),
('a0000000-0000-0000-0000-000000000002', 'groom-large',  CURRENT_DATE - 45, '09:00', '11:00', 'Duke',    'Golden Retriever', '456 Elm Ave',  'Heavy shedding season', 'completed', now() - interval '45 days'),
('a0000000-0000-0000-0000-000000000002', 'bath-large',   CURRENT_DATE - 30, '14:00', '15:00', 'Duke',    'Golden Retriever', '456 Elm Ave',  NULL,                    'completed', now() - interval '30 days'),
('a0000000-0000-0000-0000-000000000002', 'groom-large',  CURRENT_DATE - 14, '10:00', '12:00', 'Duke',    'Golden Retriever', '456 Elm Ave',  NULL,                    'completed', now() - interval '14 days'),
('a0000000-0000-0000-0000-000000000002', 'groom-large',  CURRENT_DATE - 3,  '09:00', '11:00', 'Duke',    'Golden Retriever', '456 Elm Ave',  NULL,                    'completed', now() - interval '3 days'),

-- === Carol's bookings (new customer this month) ===
('a0000000-0000-0000-0000-000000000003', 'bath-large',   CURRENT_DATE - 10, '11:00', '12:00', 'Rosie',   'Labrador',         '789 Pine Rd',  'First time, a bit shy', 'completed', now() - interval '10 days'),
('a0000000-0000-0000-0000-000000000003', 'groom-large',  CURRENT_DATE - 4,  '10:00', '12:00', 'Rosie',   'Labrador',         '789 Pine Rd',  NULL,                    'completed', now() - interval '4 days'),
('a0000000-0000-0000-0000-000000000003', 'bath-small',   CURRENT_DATE - 4,  '14:00', '15:00', 'Peanut',  'Chihuahua',        '789 Pine Rd',  NULL,                    'completed', now() - interval '4 days'),
('a0000000-0000-0000-0000-000000000003', 'groom-small',  CURRENT_DATE,      '14:00', '16:00', 'Peanut',  'Chihuahua',        '789 Pine Rd',  NULL,                    'completed', now()),
('a0000000-0000-0000-0000-000000000003', 'groom-large',  CURRENT_DATE + 7,  '10:00', '12:00', 'Rosie',   'Labrador',         '789 Pine Rd',  NULL,                    'confirmed', now()),
('a0000000-0000-0000-0000-000000000003', 'bath-small',   CURRENT_DATE + 7,  '14:00', '15:00', 'Peanut',  'Chihuahua',        '789 Pine Rd',  NULL,                    'confirmed', now()),
('a0000000-0000-0000-0000-000000000003', 'bath-large',   CURRENT_DATE - 6,  '09:00', '10:00', 'Rosie',   'Labrador',         '789 Pine Rd',  'Weather too bad',       'cancelled', now() - interval '7 days');
