-- =============================================================================
-- FitSync seed data — deterministic test state for local dev and CI.
--
-- Produces:
--   - 1 trainer user  (trainer@fitsync.dev / Password123!)
--   - 1 athlete user  (athlete@fitsync.dev / Password123!)
--   - 1 active coach_athlete_relationship (trainer ↔ athlete)
--   - 1 workout_session  (completed yesterday)
--   - 1 workout_event    (set_logged — required for AC-D2 RLS verification)
--
-- All IDs are fixed UUIDs so every `supabase db reset` produces identical state.
-- Playwright and manual tests can rely on these credentials and IDs.
--
-- Execution order:
--   1. auth.users inserts → handle_new_user trigger creates profiles rows.
--   2. auth.identities inserts → required for email/password sign-in to work.
--   3. coach_athlete_relationships insert → validate_relationship_roles trigger
--      checks the profiles rows created in step 1.
--   4. workout_sessions / workout_events inserts.
--
-- Note on pgcrypto: crypt() / gen_salt() live in the extensions schema.
-- Supabase local dev sets search_path = "$user", public, extensions by default,
-- so the bare function names resolve. If you see "function crypt() does not exist"
-- qualify them as extensions.crypt() / extensions.gen_salt().
-- =============================================================================

-- Fixed UUIDs ----------------------------------------------------------------
-- Trainer user:    00000000-0000-0000-0000-000000000001
-- Athlete user:    00000000-0000-0000-0000-000000000002
-- Relationship:    00000000-0000-0000-0000-000000000010
-- Workout session: 00000000-0000-0000-0000-000000000020
-- Workout event:   00000000-0000-0000-0000-000000000030
-- Seed device:     00000000-0000-0000-0000-000000000099
-- ----------------------------------------------------------------------------

-- ============================================================
-- 1. Auth users
--    The handle_new_user trigger fires on each INSERT and
--    creates the corresponding profiles row automatically.
-- ============================================================

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  -- GoTrue v2 scans these columns into non-pointer Go strings.
  -- They must be '' (empty string), not NULL, or GoTrue returns
  -- "sql: Scan error … converting NULL to string is unsupported".
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  phone_change_token,
  reauthentication_token,
  created_at,
  updated_at
) values
  -- Trainer
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'trainer@fitsync.dev',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Alex Trainer","role":"trainer"}',
    '', '', '', '', '', '', '',
    now(),
    now()
  ),
  -- Athlete
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'athlete@fitsync.dev',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Sam Athlete","role":"athlete"}',
    '', '', '', '', '', '', '',
    now(),
    now()
  );

-- ============================================================
-- 2. Auth identities
--    Required for email/password sign-in. Without these rows,
--    supabase.auth.signInWithPassword() returns "Invalid credentials"
--    even though the user exists in auth.users.
-- ============================================================

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
) values
  (
    '00000000-0000-0000-0000-000000000001',
    'trainer@fitsync.dev',
    '00000000-0000-0000-0000-000000000001',
    '{"sub":"00000000-0000-0000-0000-000000000001","email":"trainer@fitsync.dev"}',
    'email',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'athlete@fitsync.dev',
    '00000000-0000-0000-0000-000000000002',
    '{"sub":"00000000-0000-0000-0000-000000000002","email":"athlete@fitsync.dev"}',
    'email',
    now(),
    now(),
    now()
  );

-- ============================================================
-- 3. Active relationship
--    history_shared_from = 90 days ago → trainer sees the
--    seeded session and event created in steps 4–5.
-- ============================================================

insert into public.coach_athlete_relationships (
  id,
  trainer_id,
  athlete_id,
  status,
  history_shared_from,
  invited_email,
  invited_at,
  accepted_at
) values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'active',
  now() - interval '90 days',
  'athlete@fitsync.dev',
  now() - interval '90 days',
  now() - interval '90 days'
);

-- ============================================================
-- 4. Workout session
--    Started and finished yesterday — used to verify that the
--    trainer RLS policy (trainer_can_see_event) works end-to-end.
-- ============================================================

insert into public.workout_sessions (
  id,
  athlete_id,
  started_at,
  ended_at
) values (
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000002',
  now() - interval '1 day',
  now() - interval '23 hours'
);

-- ============================================================
-- 5. Workout event
--    One set_logged event in the seeded session.
--    Required for AC-D2 RLS verification:
--      - Athlete can read it (athlete_id = own id).
--      - Trainer can read it (active relationship, within history window).
--      - A different athlete cannot read it (RLS blocks).
-- ============================================================

insert into public.workout_events (
  id,
  session_id,
  athlete_id,
  device_id,
  client_sequence,
  event_type,
  payload,
  client_created_at
) values (
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000099',
  1,
  'set_logged',
  '{"exercise_name":"Squat","set_number":1,"reps":5,"weight_kg":100}',
  now() - interval '1 day'
);
