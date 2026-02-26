-- workout_sessions — one row per athlete workout session.
--
-- started_at / ended_at are set by the client (device clock). ended_at is
-- NULL while the session is in progress.
--
-- program_version_id is a placeholder FK for the Phase 2 program builder.
-- It is intentionally left as a plain uuid column with no FK constraint
-- since the referenced table does not exist yet.
--
-- trainer_can_see_event() is used for trainer SELECT so that the
-- history_shared_from window is respected — a session started before the
-- agreed cutoff is not visible to the trainer.

-- ============================================================
-- Table
-- ============================================================

create table public.workout_sessions (
  id                 uuid        primary key default gen_random_uuid(),
  athlete_id         uuid        not null references public.profiles (id) on delete cascade,
  started_at         timestamptz not null,
  ended_at           timestamptz,
  -- FK: will reference program_versions(id) in Phase 2
  program_version_id uuid,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint workout_sessions_ended_after_started
    check (ended_at is null or ended_at > started_at)
);

-- ============================================================
-- Indexes
-- ============================================================

-- Primary access pattern: list sessions for an athlete sorted by recency.
create index workout_sessions_athlete_started_idx
  on public.workout_sessions (athlete_id, started_at desc);

-- Filter for completed vs in-progress sessions.
create index workout_sessions_athlete_ended_idx
  on public.workout_sessions (athlete_id, ended_at)
  where ended_at is not null;

-- ============================================================
-- updated_at trigger
-- ============================================================

create trigger workout_sessions_updated_at
  before update on public.workout_sessions
  for each row execute function public.handle_updated_at();

-- ============================================================
-- RLS
-- ============================================================

alter table public.workout_sessions enable row level security;

-- Athletes read and write their own sessions.
create policy "workout_sessions_select_own"
  on public.workout_sessions for select
  using (auth.uid() = athlete_id);

-- Trainers can read sessions within their history window.
create policy "workout_sessions_select_trainer"
  on public.workout_sessions for select
  using (public.trainer_can_see_event(auth.uid(), athlete_id, started_at));

create policy "workout_sessions_insert_own"
  on public.workout_sessions for insert
  with check (auth.uid() = athlete_id);

create policy "workout_sessions_update_own"
  on public.workout_sessions for update
  using (auth.uid() = athlete_id)
  with check (auth.uid() = athlete_id);

-- No DELETE policy — sessions are never deleted (ADR-019 anonymizes via flag).
