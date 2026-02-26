  -- ③ Trainer can read connected athlete's events (should return 1 row)
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
  select * from workout_events;  -- expect 1