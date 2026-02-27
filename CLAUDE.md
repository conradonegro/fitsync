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
| Mobile  | Expo 52 (managed), React Native 0.76, NativeWind v4, Expo Router                     |
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
- `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`

**`apps/mobile/.env.local`** (build-time only, injected via `app.config.ts`)

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `SENTRY_DSN`, `EAS_PROJECT_ID`

`SUPABASE_SERVICE_ROLE_KEY` lives only in CI vaults and Supabase project settings — never in client code.

### CI/CD

- **`ci.yml`**: Typecheck + Lint + Format check on every PR
- **`deploy-web.yml`**: Vercel production deploy on merge to `main` (GitHub Actions controls all Vercel deploys — ADR-023)
- **`eas-build.yml`**: EAS preview build on `develop`, production build on `main` (builds only on merge, not PRs — ADR-022)

### Key Reference Docs

- `ARCHITECTURE.md` — 25 ADRs, data model, sync design, auth/RLS model, full folder structure
- `PHASE1_SCOPE.md` — Phase 1 deliverables, explicit exclusions, acceptance criteria
