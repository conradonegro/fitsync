-- user_devices — tracks device UUIDs registered per user.
--
-- A user may own multiple devices. Each device has a stable UUID stored in
-- expo-secure-store on the device (ADR-014). The unique constraint on
-- (user_id, device_id) prevents duplicate registrations on repeated logins.
--
-- device_id is referenced by workout_events to identify the event source
-- and enforce idempotency (ADR-015).

-- ============================================================
-- Table
-- ============================================================

create table public.user_devices (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles (id) on delete cascade,
  device_id     uuid        not null,
  device_name   text,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),

  constraint user_devices_user_device_unique unique (user_id, device_id)
);

-- ============================================================
-- Indexes
-- ============================================================

create index user_devices_user_id_idx   on public.user_devices (user_id);
-- device_id lookup used in sync idempotency checks.
create index user_devices_device_id_idx on public.user_devices (device_id);

-- ============================================================
-- RLS
-- ============================================================

alter table public.user_devices enable row level security;

create policy "user_devices_select_own"
  on public.user_devices for select
  using (auth.uid() = user_id);

create policy "user_devices_insert_own"
  on public.user_devices for insert
  with check (auth.uid() = user_id);

create policy "user_devices_update_own"
  on public.user_devices for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No DELETE policy — devices are never deleted in Phase 1.
-- Stale devices are identified by last_seen_at; cleanup is a Phase 2 concern.
