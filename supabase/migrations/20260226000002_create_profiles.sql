-- profiles — one row per authenticated user.
--
-- id mirrors auth.users(id) exactly — no surrogate key. This means the
-- profile and the auth user share the same UUID, simplifying all FK joins.
--
-- handle_updated_at() is created here and reused by every subsequent table
-- that needs an auto-maintained updated_at column.
--
-- handle_new_user() fires AFTER INSERT on auth.users and creates the profile
-- automatically. This means application code never inserts into profiles
-- directly — it calls supabase.auth.signUp() and the trigger does the rest.
-- The trigger reads full_name and role from raw_user_meta_data, which the
-- signup form must populate.
--
-- RLS note: the "trainer sees athlete profiles" policy is added in migration
-- 20260226000004 after coach_athlete_relationships and its helper functions exist.

-- ============================================================
-- Table
-- ============================================================

create table public.profiles (
  id                uuid        primary key references auth.users (id) on delete cascade,
  email             text        not null,
  full_name         text        not null,
  role              public.user_role not null,
  stripe_customer_id text,
  pending_deletion  boolean     not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- Indexes
-- ============================================================

-- Role is filtered on nearly every cross-table RLS policy.
create index profiles_role_idx on public.profiles (role);

-- Used in trainer invite-by-email lookup (D4).
create index profiles_email_idx on public.profiles (email);

-- Phase 2 Stripe webhook handler looks up by stripe_customer_id.
-- Partial index keeps it lean while the column is mostly NULL.
create index profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- ============================================================
-- handle_updated_at — reusable trigger function for all tables
-- ============================================================

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- ============================================================
-- handle_new_user — auto-create profile on auth.users INSERT
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    (new.raw_user_meta_data ->> 'role')::public.user_role
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RLS
-- ============================================================

alter table public.profiles enable row level security;

-- Users can read their own profile.
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can only create their own profile row (redundant given the trigger,
-- but blocks any direct INSERT attempt that bypasses the trigger).
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Users can update their own profile.
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- "profiles_select_trainer_sees_athletes" is intentionally deferred to
-- migration 20260226000004 after has_active_relationship() exists.
