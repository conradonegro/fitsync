# FitSync — Phase 1 Scope Definition

> **Purpose**: Formal definition of Phase 1 deliverables, exclusions, and acceptance criteria.  
> **Rule**: No task begins development until it appears in this document.  
> **Status**: Pending approval.

---

## Table of Contents

1. [Phase 1 Objective](#1-phase-1-objective)
2. [Deliverables](#2-deliverables)
3. [Explicit Exclusions](#3-explicit-exclusions)
4. [Acceptance Criteria](#4-acceptance-criteria)
5. [Task Breakdown & Order](#5-task-breakdown--order)
6. [Definition of Done](#6-definition-of-done)

---

## 1. Phase 1 Objective

**Prove the full architecture end-to-end with the minimum surface area that demonstrates all core technical bets.**

Phase 1 is not a feature release. It is an architectural proof-of-concept that every subsequent phase builds on. At the end of Phase 1, a trainer can invite an athlete, the athlete can log a single workout session offline, and that session syncs to the server when connectivity is restored — visible to the trainer on the web dashboard.

Every layer of the stack is exercised. Every infrastructure decision is validated. No known architectural surprises remain.

---

## 2. Deliverables

### D1 — Monorepo Scaffold

A working Turborepo monorepo with all packages and apps bootstrapped, building, linting, and type-checking cleanly.

Includes:

- `pnpm-workspace.yaml`, `.npmrc` (`node-linker=hoisted`), `turbo.json` with `^build` pipeline.
- All packages created with correct `package.json`, `tsconfig.json` extending base, and empty `src/index.ts`.
- `packages/typescript-config` and `packages/eslint-config` shared and consumed by all packages.
- `apps/web` (Next.js 15, App Router, Tailwind) and `apps/mobile` (Expo managed, NativeWind v4) bootstrapped.
- `pnpm build`, `pnpm lint`, `pnpm typecheck` all pass from root with zero errors.
- `next.config.ts` configured with `.web.tsx` resolution.
- `metro.config.js` configured with NativeWind and monorepo `watchFolders`.
- Sentry initialized in both apps (DSN from environment, no source maps in dev).

### D2 — Supabase Infrastructure

Local and staging environments fully operational. Schema deployed and versioned.

Includes:

- `supabase/config.toml` configured for local development.
- All migrations written and applied locally and to staging.
- `supabase gen types` wired to `packages/database-types/src/types.ts`.
- `pnpm gen:types` root script regenerates types in one command.
- `packages/database` with three client exports working (`@fitsync/database`, `@fitsync/database/server`).
- `supabase/seed.sql` with deterministic test data: one trainer, one athlete, one active relationship.

**Schema delivered in this phase** (see Section 4 for full column specs):

- `profiles`
- `user_devices`
- `coach_athlete_relationships`
- `workout_sessions`
- `workout_events`
- `subscriptions` (stub — columns only, no logic)

**RLS policies** for all tables above, designed as per ADR-017 and ADR-018.

### D3 — Authentication

Full auth flow on both platforms. Role assigned at signup. Session persisted correctly.

Includes:

- **Web**: Supabase Auth with email/password. `middleware.ts` for session refresh. Protected routes redirect unauthenticated users.
- **Mobile**: Supabase Auth with email/password. Session stored via AsyncStorage adapter. `device_id` generated on first launch and stored in `expo-secure-store`. `device_id` registered in `user_devices` on first login.
- **Shared**: Role selection UI at signup (`trainer` | `athlete`). Role stored in `profiles` on account creation.
- **Both platforms**: Login, signup, logout flows complete. Auth state in Zustand.

OAuth (Google/Apple Sign-In) is **not** in Phase 1 but the URL scheme is registered in `app.config.ts`.

### D4 — Trainer Web: Athlete Management

The trainer's core relationship management surface on the web app.

Includes:

- Trainer dashboard layout with navigation.
- **Athlete roster page**: list of connected athletes with status (`pending` / `active`).
- **Invite athlete flow**: form to enter athlete email → triggers Edge Function → Resend sends invitation email with accept link.
- **Invitation accept flow**: athlete visits link → signs up or logs in → relationship created with `history_shared_from` choice presented clearly.
- **Athlete detail page**: shows athlete name, connection date, and placeholder for workout history (populated in D6).

### D5 — Mobile: Offline-First Workout Logging

The athlete's core in-gym logging flow, fully functional offline.

Includes:

- Athlete home screen showing today's date and a "Start Workout" entry point.
- **Session creation**: tapping "Start Workout" creates a `workout_session` record locally in SQLite.
- **Exercise logging**: athlete can add exercises by name (free text for Phase 1, no exercise library yet), log sets with reps and weight.
- **Each log action** writes an append-only `workout_event` to the SQLite queue with `(device_id, client_sequence)`.
- **Optimistic UI**: logged sets appear immediately regardless of connectivity.
- **Session end**: athlete taps "Finish Workout", `ended_at` is written.
- **Offline indicator**: visible UI state showing online/offline status.
- Full flow works with airplane mode enabled.

### D6 — Sync Engine

The bridge between the mobile SQLite queue and the Supabase backend.

Includes:

- **Flush on reconnect**: when connectivity is restored, the event queue flushes in batches of 50, ordered by `client_sequence ASC`.
- **Idempotency**: server handles duplicate `(device_id, client_sequence)` submissions gracefully.
- **Catch-up on reconnect**: on every reconnect, query for all server events with `server_created_at > last_server_timestamp`. `last_server_timestamp` persisted in SQLite.
- **Confirmation before removal**: events are removed from the SQLite queue only after the server confirms receipt.
- **Sync status in Zustand**: pending event count, last sync timestamp, current sync state (`idle` / `syncing` / `error`).
- **Trainer web view updated**: after sync, the athlete's workout session appears on the trainer's athlete detail page.

### D7 — CI/CD Pipeline

Fully automated pipeline from PR to production.

Includes:

- **`ci.yml`**: triggered on every PR. Runs typecheck, ESLint, Jest, Playwright (web E2E against local Supabase with seed data). Blocks merge on failure.
- **`deploy-web.yml`**: triggered on merge to `main`. Deploys to Vercel production via Vercel CLI. Requires all CI checks to have passed.
- **`eas-build.yml`**: triggered on merge to `develop` (EAS preview profile) and `main` (EAS production profile). Never triggered on PRs.
- **`gen-types` step**: `supabase gen types` runs in CI. Type drift between DB schema and `packages/database-types` causes pipeline failure.
- Vercel auto-deploy disabled in project settings.
- All secrets (Supabase keys, Vercel token, EAS token, Sentry DSN, Resend API key) stored in GitHub Actions secrets vault.

### D8 — Observability Baseline

Errors are visible in production from day one.

Includes:

- Sentry error capture active on both web and mobile.
- Source maps uploaded during CI builds for both platforms.
- Basic Sentry alerts configured (new issue, regression).

---

## 3. Explicit Exclusions

The following are **not** in Phase 1. Any PR introducing these is out of scope and should be deferred.

| Excluded Feature                      | Reason                                                   | Target Phase |
| ------------------------------------- | -------------------------------------------------------- | ------------ |
| Exercise library / catalog            | Free-text exercise names are sufficient to validate sync | Phase 2      |
| Coach program builder                 | No structured programs needed to prove sync model        | Phase 2      |
| Workout history dashboard (analytics) | Placeholder sufficient in Phase 1                        | Phase 2      |
| Push notifications                    | Email-only for MVP (ADR-016)                             | Phase 2      |
| Apple Health / Health Connect         | Deferred by design (ADR — health data)                   | Phase 2      |
| Stripe / payments                     | Schema stubbed, no logic                                 | Phase 2      |
| `corrections` event type              | Requires program builder to be meaningful                | Phase 2      |
| OAuth (Google / Apple Sign-In)        | URL scheme registered, implementation deferred           | Phase 2      |
| GDPR erasure flow                     | `pending_deletion` column added to schema, job deferred  | Phase 2      |
| Media attachments                     | Excluded from MVP entirely                               | Phase 2      |
| Full parity web/mobile                | Role-based split for MVP (ADR — feature split)           | Post-MVP     |
| Maestro iOS CI                        | Android only in CI (ADR-025)                             | Post-MVP     |

---

## 4. Acceptance Criteria

### AC-D1: Monorepo Scaffold

- [ ] `pnpm install` from root succeeds with no errors.
- [ ] `pnpm build` from root builds all packages and apps in dependency order.
- [ ] `pnpm typecheck` from root returns zero TypeScript errors.
- [ ] `pnpm lint` from root returns zero ESLint errors.
- [ ] Importing `@fitsync/shared` in `apps/web` and `apps/mobile` resolves correctly.
- [ ] Importing `@fitsync/database/server` in a Next.js Server Component resolves correctly.
- [ ] Importing `@fitsync/database/server` in mobile code fails at compile time (wrong export).
- [ ] A shared UI component renders correctly on web (DOM) and mobile (native) from the same `@fitsync/ui` import.

### AC-D2: Supabase Infrastructure

- [ ] `supabase start` succeeds locally.
- [ ] All migrations apply cleanly on a fresh local instance: `supabase db reset` produces no errors.
- [ ] All migrations apply cleanly to the staging Supabase project.
- [ ] `pnpm gen:types` regenerates `packages/database-types/src/types.ts` with no manual intervention.
- [ ] A deliberate schema change (add a column, run gen:types) causes a TypeScript compilation error in `packages/shared` until Zod schemas are updated.
- [ ] Seed data loads: `supabase db reset` produces one trainer user, one athlete user, one active relationship.
- [ ] RLS verified: athlete user cannot read another athlete's `workout_events` via Supabase client.
- [ ] RLS verified: trainer can read their connected athlete's `workout_events` but not an unconnected athlete's.

### AC-D3: Authentication

- [x] Trainer can sign up with email/password and role `trainer` on web.
- [x] Athlete can sign up with email/password and role `athlete` on mobile.
- [x] Both can log in and log out.
- [x] Unauthenticated users are redirected to login on both platforms.
- [x] Session persists across app restarts on mobile.
- [x] `device_id` is present in `user_devices` after first mobile login.
- [x] `device_id` does not change across app restarts.
- [x] Next.js `middleware.ts` refreshes expired sessions without user action (verify by shortening token expiry in local config and confirming no silent logout).

### AC-D4: Trainer Athlete Management

- [ ] Trainer can see their athlete roster (empty state handled).
- [ ] Trainer can enter an athlete's email and trigger an invitation.
- [ ] Resend delivers the invitation email (verify in Resend dashboard).
- [ ] Athlete can click the link, sign up, and see the invitation with history sharing choice.
- [ ] After acceptance, the relationship appears as `active` in the trainer's roster.
- [ ] Athlete's history choice is correctly reflected in `history_shared_from` column.

### AC-D5: Offline Workout Logging

- [ ] Athlete can start a workout session with airplane mode enabled.
- [ ] Athlete can log sets (exercise name, reps, weight) with no network connection.
- [ ] Logged sets appear immediately in the UI (optimistic update).
- [ ] Athlete can end the session with airplane mode enabled.
- [ ] Offline indicator is visible when no network connection is present.
- [ ] SQLite contains the queued events after offline logging (verify via Expo dev tools or debug screen).

### AC-D6: Sync Engine

- [ ] After re-enabling network, queued events flush automatically without user action.
- [ ] Flushed events appear in Supabase `workout_events` table with correct `server_created_at`.
- [ ] SQLite queue is empty after successful flush.
- [ ] Submitting the same event twice (simulated retry) does not create duplicate records in Supabase.
- [ ] After sync, the trainer can see the athlete's completed session on the athlete detail page (web app).
- [ ] Killing the app mid-flush and relaunching re-submits only unconfirmed events, not already-confirmed ones.
- [ ] Catch-up query on reconnect retrieves any events missed during disconnection.

### AC-D7: CI/CD Pipeline

- [ ] A PR with a TypeScript error blocks merge.
- [ ] A PR with an ESLint error blocks merge.
- [ ] A failing Jest test blocks merge.
- [ ] A failing Playwright test blocks merge.
- [ ] Merging a passing PR to `main` triggers a Vercel production deployment.
- [ ] The deployed web app is accessible at the Vercel subdomain.
- [ ] Merging to `develop` triggers an EAS preview build.
- [ ] A schema change without a corresponding `gen:types` run causes CI to fail.

### AC-D8: Observability

- [ ] Triggering a deliberate runtime error in the web app creates an issue in Sentry.
- [ ] Triggering a deliberate runtime error in the mobile app creates an issue in Sentry.
- [ ] Sentry issues include a readable stack trace (source maps working).

---

## 5. Task Breakdown & Order

Tasks must be completed in this order. Later tasks have hard dependencies on earlier ones.

```
TRACK A — Infrastructure (must complete before any feature work)
─────────────────────────────────────────────────────────────────
T1  Monorepo scaffold (D1)
     └── T2  Supabase local setup + schema + RLS + seed (D2)
          └── T3  packages/database clients + gen:types script (D2)
               └── T4  CI pipeline skeleton — typecheck + lint only (D7, partial)

TRACK B — Authentication (depends on Track A complete)
─────────────────────────────────────────────────────────────────
T5  Web auth — signup (with role), login, logout, middleware (D3)
T6  Mobile auth — signup, login, logout, device_id + SecureStore (D3)

TRACK C — Features (depends on Track B complete)
─────────────────────────────────────────────────────────────────
T7  Trainer web — athlete roster + invite flow + Edge Function + Resend (D4)
T8  Invitation accept flow — athlete web/mobile (D4)
T9  Mobile — workout session creation + exercise logging UI (D5)
T10 Mobile — SQLite event queue + offline indicator (D5, D6 partial)
T11 Sync engine — flush, idempotency, catch-up, queue cleanup (D6)
T12 Trainer web — athlete detail page shows synced sessions (D4, D6)

TRACK D — Quality (runs in parallel from T1 onward, completes last)
─────────────────────────────────────────────────────────────────
T13 Jest unit tests — shared schemas, sync logic, RBAC helpers
T14 Playwright E2E — invite flow + sync flow (requires seed data from T2)
T15 Maestro Android — offline logging + sync flow
T16 CI pipeline — add Jest + Playwright + EAS + Vercel deploy (D7, D8 complete)
T17 Sentry source maps + alert configuration (D8)
```

**Critical path**: T1 → T2 → T3 → T4 → T5/T6 → T7/T8 → T9/T10 → T11 → T12 → T16

---

## 6. Definition of Done

Phase 1 is complete when **all** of the following are true:

1. Every acceptance criterion above is passing.
2. `pnpm build`, `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass from root with zero errors or warnings.
3. The web app is live at the Vercel subdomain (staging config, not production Supabase).
4. A production EAS Build has been submitted and is installable on a physical Android device.
5. The end-to-end scenario works on a physical device: trainer invites athlete → athlete accepts → athlete logs session offline → session syncs → trainer sees it on web.
6. All CI pipeline checks are green on the `main` branch.
7. `ARCHITECTURE.md` and this document are committed to the repository and reflect the as-built state.
8. No known `TODO` or `FIXME` comments exist for Phase 1 scope items (Phase 2+ deferred items may be tagged `// TODO Phase 2`).
