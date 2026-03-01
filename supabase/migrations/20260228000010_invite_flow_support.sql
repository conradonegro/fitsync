-- Migration 010 — Invite flow support
--
-- Changes:
--   1. Makes athlete_id nullable so trainers can invite athletes who don't have
--      an account yet. The existing car_trainer_athlete_unique constraint is
--      replaced with a partial unique index that only applies to non-null pairs.
--   2. Updates validate_relationship_roles trigger to skip athlete role check
--      when new.athlete_id IS NULL.
--   3. Adds partial unique index to prevent duplicate open invites to the same
--      email from the same trainer.
--   4. Adds SECURITY DEFINER get_pending_invite() RPC — returns invite details
--      only when the caller's email matches invited_email.
--   5. Adds SECURITY DEFINER accept_invitation() RPC — atomically validates and
--      accepts an invitation, writing athlete_id, status, history_shared_from,
--      and accepted_at in one transaction.

-- ============================================================
-- 1. Make athlete_id nullable
-- ============================================================

-- Drop the old NOT NULL constraint and the unique constraint that referenced it.
-- The unique constraint car_trainer_athlete_unique cannot have NULLs behave
-- correctly (NULL != NULL in unique indexes) so we replace it with a partial
-- unique index applied only to rows where athlete_id IS NOT NULL.
alter table public.coach_athlete_relationships
  alter column athlete_id drop not null;

-- Drop old unique constraint and re-create as partial index so that NULL
-- athlete_id rows (pending invites) are not matched against each other.
alter table public.coach_athlete_relationships
  drop constraint if exists car_trainer_athlete_unique;

create unique index car_trainer_athlete_unique_idx
  on public.coach_athlete_relationships (trainer_id, athlete_id)
  where athlete_id is not null;

-- ============================================================
-- 2. Update role validation trigger (skip athlete check when NULL)
-- ============================================================

create or replace function public.validate_relationship_roles()
returns trigger
language plpgsql
as $$
begin
  if (select role from public.profiles where id = new.trainer_id) <> 'trainer' then
    raise exception 'trainer_id must reference a profile with role = trainer';
  end if;
  -- athlete_id is nullable for pending invites; skip role check when NULL.
  if new.athlete_id is not null then
    if (select role from public.profiles where id = new.athlete_id) <> 'athlete' then
      raise exception 'athlete_id must reference a profile with role = athlete';
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================
-- 3. Partial unique index — prevents duplicate open invites
-- ============================================================

-- Only one non-revoked invite per (trainer, email) pair may exist at a time.
create unique index car_trainer_email_pending_idx
  on public.coach_athlete_relationships (trainer_id, invited_email)
  where status <> 'revoked';

-- ============================================================
-- 4. get_pending_invite() — caller must be the invited athlete
-- ============================================================

create or replace function public.get_pending_invite(p_invite_id uuid)
returns table (
  id              uuid,
  trainer_id      uuid,
  trainer_name    text,
  invited_email   text,
  status          public.relationship_status,
  athlete_id      uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
begin
  -- Resolve the caller's email from auth.users.
  select au.email
    into v_caller_email
    from auth.users au
   where au.id = auth.uid();

  return query
    select
      car.id,
      car.trainer_id,
      coalesce(p.full_name, 'Unknown Trainer') as trainer_name,
      car.invited_email,
      car.status,
      car.athlete_id
    from   public.coach_athlete_relationships car
    left   join public.profiles p on p.id = car.trainer_id
    where  car.id            = p_invite_id
      and  car.invited_email = v_caller_email;
end;
$$;

-- ============================================================
-- 5. accept_invitation() — atomically accepts an invite
-- ============================================================

create or replace function public.accept_invitation(
  p_invite_id          uuid,
  p_share_full_history boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id    uuid := auth.uid();
  v_caller_email text;
  v_caller_role  public.user_role;
  v_invite       public.coach_athlete_relationships%rowtype;
  v_history_from timestamptz;
begin
  -- Resolve caller identity.
  select au.email into v_caller_email
    from auth.users au where au.id = v_caller_id;

  select role into v_caller_role
    from public.profiles where id = v_caller_id;

  -- Guard: caller must be an athlete.
  if v_caller_role <> 'athlete' then
    raise exception 'caller_not_athlete';
  end if;

  -- Fetch the invite row.
  select * into v_invite
    from public.coach_athlete_relationships
   where id = p_invite_id;

  if not found then
    raise exception 'invitation_not_found';
  end if;

  -- Guard: invite must still be pending.
  if v_invite.status <> 'pending' then
    raise exception 'invitation_not_pending';
  end if;

  -- Guard: caller's email must match invited_email.
  if v_invite.invited_email <> v_caller_email then
    raise exception 'email_mismatch';
  end if;

  -- Determine history_shared_from.
  if p_share_full_history then
    select created_at into v_history_from
      from public.profiles where id = v_caller_id;
  else
    v_history_from := now();
  end if;

  -- Atomically accept the invite.
  update public.coach_athlete_relationships
     set athlete_id          = v_caller_id,
         status              = 'active',
         history_shared_from = v_history_from,
         accepted_at         = now()
   where id = p_invite_id;
end;
$$;
