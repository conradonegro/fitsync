# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev                          # Run all dev servers in parallel
pnpm dev --filter=@fitsync/web    # Run only web app
pnpm dev --filter=@fitsync/mobile # Run only mobile app

# Build & Type Check
pnpm build                        # Build all packages (respects ^build order)
pnpm typecheck                    # TypeScript check across all packages
pnpm lint                         # ESLint across all packages
pnpm format                       # Prettier format
pnpm format:check                 # Check formatting without writing

# Testing
pnpm test                         # Run all Jest tests
pnpm test --filter=<package>      # Run tests for a specific package

# Database
pnpm gen:types                    # Regenerate Supabase types: supabase gen types typescript --local
supabase start                    # Start local Supabase (requires Docker Desktop)
supabase db reset                 # Reset local DB and re-run migrations

# Cleanup
pnpm clean                        # Clean turbo cache and node_modules
```

## Architecture Overview

FitSync is a **professional coaching platform** for trainers and athletes, built as a Turborepo + pnpm monorepo.

### Structure

```
apps/
  web/      — Next.js 15 App Router (trainer dashboard, deployed to Vercel)
  mobile/   — Expo managed workflow (athlete app, deployed via EAS Build)
packages/
  shared/          — Zod schemas, RBAC rules, i18n JSON (no infrastructure deps)
  database-types/  — Auto-generated Supabase TypeScript types (never edit manually)
  database/        — Supabase client layer with platform-enforced subpath exports
  ui/              — Shared components with .web.tsx / .native.tsx platform splits
  typescript-config/ — Shared tsconfig presets
  eslint-config/   — Shared ESLint rules
```

### Key Architectural Decisions

**Platform-split clients (ADR-013):** `packages/database` uses `package.json` subpath exports to physically enforce the correct Supabase client per context — browser client, Next.js server/middleware, and React Native are separate entry points. Using the wrong client in the wrong context causes a build error.

**Internal package scope (ADR-003):** All internal packages use `@fitsync/` scope (e.g., `@fitsync/shared`, `@fitsync/ui`). Avoid using `@/` for cross-package imports.

**Platform-split UI (ADR-007):** `packages/ui` components use `.web.tsx` / `.native.tsx` suffixes. The bundler resolves the correct file automatically. One component API, two implementations.

**Offline sync (ADR-014):** The mobile app uses an **append-only event log** stored in `expo-sqlite`. Events are identified by `(device_id, client_sequence)` for deterministic, idempotent server reconciliation. Event idempotency is enforced via a unique DB constraint (ADR-015).

**State management (ADR-009):** TanStack Query for server/async state, Zustand for client state (auth session, sync queue status, UI). No Redux.

**Two roles only (ADR-017):** A user is either `trainer` or `athlete` — mutually exclusive. This simplifies all RLS policies.

**DB-first types (ADR-011):** PostgreSQL is the source of truth. Always regenerate types with `pnpm gen:types` after schema changes. Never hand-edit `packages/database-types/`.

**GDPR erasure (ADR-019):** User data is anonymized, not hard-deleted, to preserve event log integrity.

### Data Model Hierarchy

```
Profile (trainer or athlete)
  └── Relationship (trainer ↔ athlete, with history_shared_from timestamp)
        └── Session (workout session)
              └── Event (append-only, offline-first log entry)
```

### Tech Stack

| Layer   | Technology                                                                           |
| ------- | ------------------------------------------------------------------------------------ |
| Web     | Next.js 15, TailwindCSS, next-intl                                                   |
| Mobile  | Expo 54 (managed), React Native 0.81, NativeWind v5 (preview), Expo Router v6        |
| Backend | Supabase (Postgres + RLS + Auth + Realtime + Edge Functions)                         |
| State   | TanStack Query v5, Zustand v5                                                        |
| Offline | expo-sqlite (event queue), expo-secure-store (device_id + tokens)                    |
| i18n    | next-intl (web), react-i18next (mobile), shared JSON in packages/shared/src/locales/ |
| Email   | Resend (via Edge Functions)                                                          |
| Errors  | Sentry (@sentry/nextjs, @sentry/react-native)                                        |
| Build   | Turborepo 2, pnpm 10, EAS Build, Vercel                                              |

### TypeScript Configuration

- `strict: true` and `exactOptionalPropertyTypes: true` are non-negotiable
- `moduleResolution: "bundler"` enables subpath exports resolution
- All packages extend from `packages/typescript-config/`

### Environment Variables

**`apps/web/.env.local`**

- `NEXT_PUBLIC_SUPABASE_URL` — browser client (`client.web.ts`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — browser client (`client.web.ts`)
- `SUPABASE_URL` — server client + middleware (no `NEXT_PUBLIC_` prefix)
- `SUPABASE_ANON_KEY` — server client + middleware (no `NEXT_PUBLIC_` prefix)
- `APP_URL` — base URL for invite accept links (e.g., `http://localhost:3000`). Used in Server Actions.
- `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`

**Supabase Edge Function secrets** (not Next.js env vars — set via CLI):

- `RESEND_API_KEY` — Resend API key for email delivery. Set with `supabase secrets set RESEND_API_KEY=<key>`. For local dev, run `supabase functions serve` after setting the secret. Email delivery is non-fatal if missing.

**`apps/mobile/.env.local`** (build-time only, injected via `app.config.ts`)

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `SENTRY_DSN`, `EAS_PROJECT_ID`

`SUPABASE_SERVICE_ROLE_KEY` lives only in CI vaults and Supabase project settings — never in client code.

### CI/CD

Single workflow file: `.github/workflows/ci.yml`. Three jobs: `verify` (typecheck + lint + format + build — required status check on every PR and push to `main`), `migrate-staging` (runs `supabase db push` against staging on push to `main`), `deploy-production` (Vercel production deploy, needs `migrate-staging`). Production and preview EAS mobile builds are manual (`eas build --profile {production,preview}` from local). See ADR-026 for the full rationale.

### Key Reference Docs

- `ARCHITECTURE.md` — 26 ADRs, data model, sync design, auth/RLS model, full folder structure
- `PHASE1_SCOPE.md` — Phase 1 deliverables, explicit exclusions, acceptance criteria

## D7 — Migrations policy (Phase 1)

Additive changes only: new tables, new columns (nullable or defaulted), new indexes, new RLS policies. No column drops, no type changes, no data rewrites. Destructive changes require a two-PR dance (add new thing → deploy → backfill; then drop old thing in a follow-up). Reason: `supabase db push` is forward-only and staging rollback means restoring from daily backup. See ADR-026.

## D7 — Local hooks

`pnpm install` wires up husky via the `prepare` script. `.husky/pre-commit` runs `pnpm exec lint-staged` on staged files only (~5s). `.husky/pre-push` runs `pnpm exec turbo run typecheck lint build test --filter="...[origin/main]"` followed by `pnpm format:check` (~15–90s depending on what changed). **Scope of the pre-push hook: typecheck, lint, build, Jest unit tests (via turbo), and repo-wide format:check only.** Playwright, Maestro, and `gen:types` drift are NOT in the hook — see the "Before opening a PR" checklist below. Use `git commit --no-verify` / `git push --no-verify` consciously for WIP and emergencies — CI's `verify` job is the only safety net when bypassed.

## D7 — Before opening a PR (manual checklist)

Run these before opening any PR. The pre-push hook cannot run them because each needs external state that isn't reliably present on every push.

1. **Playwright web E2E** — requires local Supabase running with seed data + the Next.js dev server:
   ```bash
   supabase start && supabase db reset     # if not already running
   pnpm dev --filter=@fitsync/web &         # background
   cd apps/web && pnpm test:e2e
   ```
2. **gen:types drift check** — required when `supabase/migrations/` has changed. Requires local Supabase running:
   ```bash
   pnpm gen:types
   git diff --exit-code packages/database-types/src/types.ts  # must be clean
   ```
3. **Maestro mobile E2E** — required when mobile-relevant code has changed (`apps/mobile/**`, `packages/ui/**`, `packages/shared/**`). Requires a running iOS simulator or Android emulator with a dev build installed:
   ```bash
   maestro test maestro/auth/
   maestro test maestro/workout/
   ```
4. If any of the above fail, fix locally before pushing the PR.

## D7 — Mobile builds (manual)

EAS production and preview builds are invoked locally, not by CI:

- Preview: `cd apps/mobile && eas build --profile preview --non-interactive`
- Production: `cd apps/mobile && eas build --profile production --non-interactive`

Free-tier quota: ~30 builds/month. Queue times: 20–40 min. Apple Developer ($99/yr) and Google Play Console ($25 one-time) required for actual store distribution.

## D7 — Deployment provisioning (one-time)

See `docs/superpowers/specs/2026-04-08-d7-cicd-pipeline-design.md` §4 for one-time setup of Vercel project, Supabase access token + DB password, EAS init, Turbo remote cache, GitHub Environments, repository variables/secrets, and branch protection.

## D7 — Branch protection gotcha

GitHub branch protection's "required status checks" matches by exact job `name:` string. The `verify` job in `ci.yml` is registered as `Verify`. If you rename the job, you must also update the required check name in repo settings — otherwise branch protection silently stops gating merges.
