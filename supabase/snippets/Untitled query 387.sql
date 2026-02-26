-- ① Athlete can read their own events (should return 1 row)
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
  select * from workout_events;  -- expect 1