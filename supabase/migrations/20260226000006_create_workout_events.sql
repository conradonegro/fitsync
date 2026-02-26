-- workout_events — append-only event log (ADR-014, ADR-015).
--
-- IDEMPOTENCY: the unique constraint on (device_id, client_sequence) is the
-- core of the offline sync design. The server upserts events using this
-- constraint — a duplicate submission simply fails silently (INSERT ... ON
-- CONFLICT DO NOTHING). This guarantees exactly-once delivery regardless of
-- how many times the mobile client retries (ADR-015).
--
-- athlete_id DENORMALIZATION: storing athlete_id directly avoids a join
-- through workout_sessions on every RLS row evaluation. At event-log scale
-- (millions of rows) this join would be prohibitively expensive. A BEFORE
-- INSERT trigger validates that workout_events.athlete_id matches
-- workout_sessions.athlete_id to prevent inconsistency.
--
-- client_created_at vs server_created_at: client_created_at is the device
-- clock timestamp — used for display only, never for ordering or business
-- logic (the device clock is unreliable). server_created_at is assigned on
-- arrival and is the authoritative ordering key for the catch-up query.
--
-- event_type CHECK constraint: Phase 1 allows session_start, set_logged,
-- session_end. The 'corrections' type (Phase 2) is excluded per
-- PHASE1_SCOPE.md. To add it in Phase 2:
--   ALTER TABLE workout_events DROP CONSTRAINT workout_events_event_type_check;
--   ALTER TABLE workout_events ADD CONSTRAINT workout_events_event_type_check
--     CHECK (event_type IN ('session_start','set_logged','session_end','corrections'));
--
-- No updated_at column or trigger — events are immutable by design.

-- ============================================================
-- Table
-- ============================================================

create table public.workout_events (
  id                uuid        primary key default gen_random_uuid(),
  session_id        uuid        not null references public.workout_sessions (id) on delete cascade,
  athlete_id        uuid        not null references public.profiles (id) on delete cascade,
  device_id         uuid        not null,
  client_sequence   bigint      not null,
  event_type        text        not null,
  payload           jsonb       not null,
  client_created_at timestamptz not null,
  server_created_at timestamptz not null default now(),
  created_at        timestamptz not null default now(),

  -- Core idempotency constraint (ADR-015).
  constraint workout_events_idempotency
    unique (device_id, client_sequence),

  -- Phase 1 event types only.
  -- Phase 2 will extend this list to include 'corrections' and others.
  constraint workout_events_event_type_check
    check (event_type in ('session_start', 'set_logged', 'session_end'))
);

-- ============================================================
-- Indexes
-- ============================================================

-- Primary sync access pattern: all events for a session in client order.
create index workout_events_session_sequence_idx
  on public.workout_events (session_id, client_sequence asc);

-- Catch-up query: events for an athlete newer than last_server_timestamp.
create index workout_events_athlete_server_created_idx
  on public.workout_events (athlete_id, server_created_at desc);

-- Per-device catch-up query.
create index workout_events_device_server_created_idx
  on public.workout_events (device_id, server_created_at desc);

-- ============================================================
-- Athlete consistency trigger
-- ============================================================

-- Ensures workout_events.athlete_id matches workout_sessions.athlete_id.
-- Prevents a client from submitting events for a session they don't own.
create or replace function public.validate_event_athlete()
returns trigger
language plpgsql
as $$
begin
  if (
    select athlete_id
    from   public.workout_sessions
    where  id = new.session_id
  ) <> new.athlete_id then
    raise exception
      'workout_events.athlete_id must match workout_sessions.athlete_id for session %',
      new.session_id;
  end if;
  return new;
end;
$$;

create trigger validate_event_athlete_trigger
  before insert on public.workout_events
  for each row execute function public.validate_event_athlete();

-- ============================================================
-- RLS
-- ============================================================

alter table public.workout_events enable row level security;

-- Athletes read their own events.
create policy "workout_events_select_own"
  on public.workout_events for select
  using (auth.uid() = athlete_id);

-- Trainers read athlete events within their history window.
create policy "workout_events_select_trainer"
  on public.workout_events for select
  using (public.trainer_can_see_event(auth.uid(), athlete_id, client_created_at));

-- Athletes insert their own events. The event_type check here mirrors
-- the table CHECK constraint — belt-and-suspenders for Phase 1.
-- When Phase 2 adds 'corrections' for trainers, a separate trainer INSERT
-- policy will gate it behind has_active_relationship().
create policy "workout_events_insert_athlete"
  on public.workout_events for insert
  with check (
    auth.uid() = athlete_id
    and event_type in ('session_start', 'set_logged', 'session_end')
  );

-- No UPDATE or DELETE policies — events are immutable (ADR-014).
