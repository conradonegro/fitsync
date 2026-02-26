  -- ② Different athlete cannot read them (should return 0 rows)
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000099","role":"authenticated"}';
  select * from workout_events;  -- expect 0