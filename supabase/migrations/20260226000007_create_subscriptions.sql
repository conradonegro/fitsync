-- subscriptions — Phase 2 Stripe integration stub.
--
-- Schema is defined now so that:
--   a) the generated TypeScript types include the table shape,
--   b) the trainer profile can reference subscription status without a
--      Phase 2 migration adding a new table from scratch.
--
-- No business logic is implemented in Phase 1. Updates arrive via Stripe
-- webhooks processed by an Edge Function using the service_role key, which
-- bypasses RLS — so no UPDATE policy is needed here.
--
-- status values: 'free' | 'active' | 'past_due' | 'canceled'
-- Using text (not enum) for maximum flexibility when Stripe plan changes.

-- ============================================================
-- Table
-- ============================================================

create table public.subscriptions (
  id                     uuid        primary key default gen_random_uuid(),
  -- One subscription row per trainer.
  trainer_id             uuid        not null unique references public.profiles (id) on delete cascade,
  stripe_subscription_id text        unique,
  stripe_price_id        text,
  status                 text        not null default 'free',
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ============================================================
-- updated_at trigger
-- ============================================================

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.handle_updated_at();

-- ============================================================
-- RLS
-- ============================================================

alter table public.subscriptions enable row level security;

-- Trainers can read their own subscription.
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (auth.uid() = trainer_id);

-- Trainers can insert their own subscription row (e.g. on first login).
create policy "subscriptions_insert_own"
  on public.subscriptions for insert
  with check (auth.uid() = trainer_id);

-- No UPDATE policy — updates come from the Stripe webhook Edge Function
-- using the service_role key, which bypasses RLS entirely.
