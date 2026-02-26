-- coach_athlete_relationships — the central authorization boundary for all
-- trainer access to athlete data (ADR-017, ADR-018).
--
-- Key design points:
--   - A BEFORE INSERT trigger validates that trainer_id references a profile
--     with role=trainer and athlete_id references role=athlete. Cross-table
--     CHECK constraints are not supported in Postgres; a trigger is the
--     correct pattern.
--   - has_active_relationship() and trainer_can_see_event() are SECURITY
--     DEFINER functions. Downstream RLS policies on workout_sessions and
--     workout_events call these functions to avoid repeating the join.
--     SECURITY DEFINER means they run as the function owner (postgres), not
--     the calling user, so the RLS on this table does not block them.
--   - history_shared_from: the athlete chooses at acceptance time whether
--     the trainer can see all historical data (set to profiles.created_at)
--     or only data from the connection forward (set to now()). NULL while
--     pending. The trainer_can_see_event() function handles the NULL case.
--   - The deferred "profiles_select_trainer_sees_athletes" policy is added
--     at the end of this migration now that has_active_relationship() exists.

-- ============================================================
-- Table
-- ============================================================

create table public.coach_athlete_relationships (
  id                   uuid                     primary key default gen_random_uuid(),
  trainer_id           uuid                     not null references public.profiles (id) on delete cascade,
  athlete_id           uuid                     not null references public.profiles (id) on delete cascade,
  status               public.relationship_status not null default 'pending',
  history_shared_from  timestamptz,
  invited_email        text                     not null,
  invited_at           timestamptz              not null default now(),
  accepted_at          timestamptz,
  revoked_at           timestamptz,
  created_at           timestamptz              not null default now(),
  updated_at           timestamptz              not null default now(),

  -- One relationship per trainer–athlete pair.
  constraint car_trainer_athlete_unique unique (trainer_id, athlete_id)
);

-- ============================================================
-- Indexes
-- ============================================================

-- Trainer dashboard: list athletes filtered by status.
create index car_trainer_status_idx  on public.coach_athlete_relationships (trainer_id, status);
-- Athlete view: list trainers filtered by status.
create index car_athlete_status_idx  on public.coach_athlete_relationships (athlete_id, status);
-- Invite-accept flow: look up relationship by invited email.
create index car_invited_email_idx   on public.coach_athlete_relationships (invited_email);

-- ============================================================
-- updated_at trigger
-- ============================================================

create trigger car_updated_at
  before update on public.coach_athlete_relationships
  for each row execute function public.handle_updated_at();

-- ============================================================
-- Role validation trigger
-- ============================================================

create or replace function public.validate_relationship_roles()
returns trigger
language plpgsql
as $$
begin
  if (select role from public.profiles where id = new.trainer_id) <> 'trainer' then
    raise exception 'trainer_id must reference a profile with role = trainer';
  end if;
  if (select role from public.profiles where id = new.athlete_id) <> 'athlete' then
    raise exception 'athlete_id must reference a profile with role = athlete';
  end if;
  return new;
end;
$$;

create trigger validate_relationship_roles_trigger
  before insert on public.coach_athlete_relationships
  for each row execute function public.validate_relationship_roles();

-- ============================================================
-- Security-definer helper functions
-- ============================================================

-- Returns true if an active relationship exists between trainer and athlete.
-- Used in RLS policies on profiles, workout_sessions, and workout_events.
-- SECURITY DEFINER + set search_path prevents search_path injection.
create or replace function public.has_active_relationship(
  p_trainer_id uuid,
  p_athlete_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from   public.coach_athlete_relationships
    where  trainer_id = p_trainer_id
      and  athlete_id = p_athlete_id
      and  status     = 'active'
  );
$$;

-- Returns true if the trainer has an active relationship with the athlete
-- AND the event timestamp falls within the agreed history window.
-- When history_shared_from IS NULL, COALESCE returns p_event_time, making
-- the comparison trivially true — used for the pending→active transition
-- window before history_shared_from is set (though RLS only fires for
-- active relationships so this case is an extra safety net).
create or replace function public.trainer_can_see_event(
  p_trainer_id uuid,
  p_athlete_id uuid,
  p_event_time  timestamptz
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from   public.coach_athlete_relationships
    where  trainer_id          = p_trainer_id
      and  athlete_id          = p_athlete_id
      and  status              = 'active'
      and  p_event_time       >= coalesce(history_shared_from, p_event_time)
  );
$$;

-- ============================================================
-- RLS
-- ============================================================

alter table public.coach_athlete_relationships enable row level security;

-- Trainers can read all their own relationship rows.
create policy "car_select_trainer"
  on public.coach_athlete_relationships for select
  using (auth.uid() = trainer_id);

-- Athletes can read relationship rows where they are the athlete.
create policy "car_select_athlete"
  on public.coach_athlete_relationships for select
  using (auth.uid() = athlete_id);

-- Only the trainer can create a relationship (send the invite).
create policy "car_insert_trainer"
  on public.coach_athlete_relationships for insert
  with check (auth.uid() = trainer_id);

-- Athletes can update their own relationship rows (accept / revoke).
create policy "car_update_athlete"
  on public.coach_athlete_relationships for update
  using (auth.uid() = athlete_id);

-- Trainers can update their own relationship rows (revoke).
create policy "car_update_trainer"
  on public.coach_athlete_relationships for update
  using (auth.uid() = trainer_id);

-- ============================================================
-- Deferred profiles policy (requires has_active_relationship)
-- ============================================================

-- Trainers can read the profile of any athlete they have an active
-- relationship with. Deferred from migration 002 until this function existed.
create policy "profiles_select_trainer_sees_athletes"
  on public.profiles for select
  using (public.has_active_relationship(auth.uid(), id));
