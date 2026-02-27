-- Corrective migration: security hardening pass (code-review findings).
--
-- Changes in this migration:
--
-- 1. workout_events_select_trainer RLS: use server_created_at instead of
--    client_created_at for the history-window check. client_created_at is the
--    device clock and is explicitly documented as unreliable — a spoofed clock
--    could allow a trainer to see events outside the agreed history window.
--    server_created_at is assigned on arrival and cannot be manipulated by
--    the mobile client.
--
-- 2. profiles_update_own RLS: prevent users from mutating their own role.
--    role must be immutable after signup. The previous policy allowed any
--    column update, so a user could change trainer → athlete or vice versa,
--    bypassing RBAC everywhere. The new with check compares the incoming
--    role against the stored role, rejecting any attempt to change it.
--
-- 3. validate_relationship_roles() and validate_event_athlete() trigger
--    functions: add `set search_path = public` for consistency with the
--    SECURITY DEFINER helper functions in the same file. Trigger functions
--    run as the current user (not SECURITY DEFINER) but pinning the
--    search_path prevents unexpected behavior if the search_path is ever
--    altered in the session.
--
-- 4. Drop the redundant created_at column from workout_events. The table
--    already has server_created_at (the authoritative ordering key) and
--    client_created_at (device clock, display only). A third timestamp with
--    no documented distinction from server_created_at adds confusion.

-- ============================================================
-- 1. Fix workout_events_select_trainer to use server_created_at
-- ============================================================

drop policy if exists "workout_events_select_trainer" on public.workout_events;

create policy "workout_events_select_trainer"
  on public.workout_events for select
  using (public.trainer_can_see_event(auth.uid(), athlete_id, server_created_at));

-- ============================================================
-- 2. Harden profiles_update_own: prevent role mutation
-- ============================================================

drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.profiles where id = auth.uid())
  );

-- ============================================================
-- 3. Add set search_path to trigger functions
-- ============================================================

create or replace function public.validate_relationship_roles()
returns trigger
language plpgsql
set search_path = public
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

create or replace function public.validate_event_athlete()
returns trigger
language plpgsql
set search_path = public
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

-- ============================================================
-- 4. Drop redundant created_at column from workout_events
-- ============================================================

-- server_created_at is the authoritative timestamp (assigned on arrival,
-- used for ordering and catch-up queries). client_created_at is the device
-- clock (display only). created_at was added without distinction from
-- server_created_at and serves no unique purpose.
alter table public.workout_events drop column if exists created_at;
