# FitSync — Architecture Document

> **Audience**: Experienced developers onboarding to the project.  
> **Purpose**: Single source of truth for architectural decisions, conventions, and rationale.  
> **Reading time**: ~12 minutes.

---

## Table of Contents

1. [Project Goals](#1-project-goals)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Detailed Architecture](#3-detailed-architecture)
4. [Tech Stack](#4-tech-stack)
5. [Architectural Decision Records](#5-architectural-decision-records)
6. [Folder Structure](#6-folder-structure)
7. [Key Constraints & Non-Negotiables](#7-key-constraints--non-negotiables)

---

## 1. Project Goals

| Priority | Goal |
|---|---|
| Primary | Portfolio: demonstrate mastery of full-stack TypeScript, cross-platform sync, and professional DevOps. |
| Secondary | Commercial: market-ready MVP supporting paid subscriptions for independent personal trainers. |

**Key differentiators**: append-only event model, offline-first sync with deterministic reconciliation, structured coach intent metadata, exportable privacy-first datasets, i18n from day one.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│                                                                 │
│   ┌──────────────────────┐    ┌──────────────────────────────┐  │
│   │   Web App (Next.js)  │    │   Mobile App (Expo / RN)     │  │
│   │   Trainer-focused    │    │   Athlete-focused            │  │
│   │   Vercel             │    │   EAS Build / App Stores     │  │
│   └──────────┬───────────┘    └──────────────┬───────────────┘  │
└──────────────┼──────────────────────────────-┼──────────────────┘
               │                               │
               │     ┌─────────────────────┐   │
               │     │   Shared Packages   │   │
               └────►│  @fitsync/shared    │◄──┘
                     │  @fitsync/ui        │
                     │  @fitsync/database  │
                     │  @fitsync/db-types  │
                     └────────┬────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                       BACKEND LAYER (Supabase)                  │
│                                                                 │
│   ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌─────────────┐  │
│   │   Auth   │  │ Postgres │  │  Realtime  │  │    Edge     │  │
│   │  (JWT)   │  │ + RLS    │  │ (WebSocket)│  │  Functions  │  │
│   └──────────┘  └──────────┘  └────────────┘  └──────┬──────┘  │
└──────────────────────────────────────────────────────┼─────────┘
                                                       │
                                          ┌────────────▼──────────┐
                                          │   External Services   │
                                          │   Resend  │  Sentry   │
                                          │   Stripe (deferred)   │
                                          └───────────────────────┘
```

### Component Summary

| Component | Role |
|---|---|
| **Web App** | Trainer dashboard: program creation, athlete management, progress analytics. |
| **Mobile App** | Athlete tool: in-gym workout logging, program viewing, progress tracking. Full offline support. |
| **packages/shared** | Single source of truth for Zod schemas, RBAC rules, business logic, i18n translation files. No infrastructure dependencies. |
| **packages/ui** | Shared React components with platform-split files (`.web.tsx` / `.native.tsx`). |
| **packages/database** | Configured Supabase clients (browser, server, native). Subpath exports enforce correct client per context. |
| **packages/database-types** | Auto-generated Supabase TypeScript types only. Zero runtime dependencies. Never edited manually. |
| **Supabase** | Auth, Postgres with RLS, Realtime for push, Edge Functions for thin external integrations. |
| **Resend** | Transactional email: trainer invitations, conflict notifications. Called from Edge Functions. |
| **Sentry** | Runtime error tracking on both web and mobile. |
| **Stripe** | Subscription billing for trainers. Stubbed in schema; implementation deferred to Phase 2. |

---

## 3. Detailed Architecture

### 3.1 Data Model — Core Concepts

The data model has four levels of abstraction:

```
Profile (user identity + role)
  └── coach_athlete_relationships (trainer ↔ athlete binding)
       └── workout_sessions (a single training session)
            └── workout_events (append-only atomic actions within a session)
```

**Profiles** hold user identity, role (`trainer` | `athlete`), and `stripe_customer_id`. Roles are mutually exclusive and assigned at signup.

**coach_athlete_relationships** manages the trainer-athlete binding. Trainers invite athletes by email. Athletes accept or reject. The `history_shared_from` timestamp controls retrospective data visibility — the athlete chooses at acceptance time whether to share full history or from the connection date forward.

**workout_sessions** group events into a meaningful unit (one training session). They have explicit `started_at` / `ended_at` and belong to an athlete. Trainers can associate a `program_version_id` to detect conflicts when coaching plans change mid-cycle.

**workout_events** are the core of the system. Every atomic action (set logged, rep recorded, weight entered, coach correction) is an event. Events are **never updated or deleted** in normal operation. A `corrections` event type allows coaches to annotate athlete logs without mutating the original record.

### 3.2 Offline Sync Model

```
ATHLETE DEVICE                          SERVER
─────────────────                       ──────────────────────────
1. Action occurs (online or offline)
2. Event written to SQLite queue        
   with (device_id, client_sequence)    
3. Optimistic UI update via Zustand     

[On reconnect]
4. Catch-up query: fetch events         ← server_created_at > last_known
   missed during disconnection
5. Flush queue in batches of 50         → POST /sync/events (ordered by client_sequence ASC)
6. Server checks (device_id,            ← ON CONFLICT DO NOTHING, returns canonical event
   client_sequence) for idempotency
7. Server assigns server_created_at
8. SQLite queue entry removed           ← only after server confirms receipt
9. TanStack Query cache invalidated
   → re-fetches fresh aggregates
```

**Identity**: `device_id` is a UUID v4 generated on first launch, stored in `expo-secure-store`. It never changes until reinstall. `user_id` comes from Supabase Auth. Every event carries both.

**Conflict resolution**: 
- Numeric fields: last-writer-wins with timestamp cross-check.
- Semantic conflicts (coach edits vs. athlete logs): a `corrections` event is created and the coach is notified via email.

**Offline read scope**: Full active program always synced. Last 90 days of workout history. Older history available online only.

**SQLite responsibilities**: Source of truth for offline reads, event write queue, persisted `last_server_timestamp` for catch-up. Never used for secrets.

**TanStack Query responsibilities**: Performance cache for online reads only. Never authoritative. Always considered stale on app resume.

### 3.3 Authentication & Sessions

- Supabase Auth issues JWTs. Sessions are managed via `@supabase/ssr` middleware in Next.js (required — see ADR-012).
- Mobile uses `@supabase/supabase-js` with AsyncStorage/SecureStore adapter.
- Three Supabase client contexts exist and must not be mixed (see ADR-013).
- OAuth URL scheme is registered in `app.config.ts` at scaffold even though OAuth login is deferred.

### 3.4 Row-Level Security Model

RLS is the security boundary for all data access. Policies follow this logic:

| Table | Who can read | Who can write |
|---|---|---|
| `profiles` | Own row; trainer can read active athletes | Own row only |
| `workout_sessions` | Owner; trainer with active relationship and `started_at >= history_shared_from` | Owner (athlete) only |
| `workout_events` | Owner; trainer with active relationship (same time filter) | Owner (athlete) for log events; trainer for `corrections` event type only |
| `coach_athlete_relationships` | Both parties in the relationship | Trainer creates; athlete updates status |
| `user_devices` | Own rows | Own rows |

RLS policies use security-definer functions for coach-athlete relationship lookups to avoid per-row subquery overhead.

### 3.5 Internationalization

- **Web**: `next-intl` (App Router compatible, Server Component support).
- **Mobile**: `react-i18next`.
- **Shared**: Translation JSON files in `packages/shared/src/locales/{en,es,cs}.json`.
- **Interpolation**: Both libraries configured to use single-brace `{variable}` syntax.
- **Languages at launch**: English, Spanish, Czech.

### 3.6 Edge Functions

Edge Functions are intentionally thin. They never import from `packages/shared` (Deno runtime incompatibility). Their only roles are:

- Call Resend API for transactional email (invitations, conflict notifications).
- Handle Stripe webhooks (Phase 2).
- Any future third-party integrations.

All business logic stays in Postgres functions, RLS policies, and the client-side shared package.

### 3.7 Testing Strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit / Integration | Jest + React Testing Library | Shared logic, Zod schemas, components |
| Web E2E | Playwright | Full trainer flows against local Supabase with seed data |
| Mobile E2E | Maestro (Android in CI, iOS locally) | Core athlete flows on device/emulator |
| Type safety | `tsc --noEmit` | Run on every PR, blocks merge on failure |

**CI triggers**:
- Every PR: typecheck + ESLint + Jest + Playwright.
- Merge to `develop`: EAS preview build.
- Merge to `main`: EAS production build + Vercel production deploy.

### 3.8 GDPR Compliance

Erasure requests anonymize PII in place rather than hard-deleting records. This preserves event log integrity for aggregate analytics while satisfying GDPR Article 17. A `pending_deletion` flag on the profile triggers a 30-day grace period before a scheduled job performs anonymization. Text fields become `[deleted]`, foreign key references are preserved for structural integrity.

---

## 4. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Web App | Next.js 15 (App Router) | SSR, routing, SEO, standard for React full-stack |
| Mobile App | Expo (managed workflow) + React Native | Cross-platform, managed build pipeline via EAS, compatible with target native modules |
| Shared UI | `packages/ui` with platform-split files | Single package, one API, Metro/Next.js resolve correct implementation automatically |
| Web Styling | TailwindCSS | Utility-first, zero runtime, excellent with App Router |
| Mobile Styling | NativeWind v4 | Tailwind syntax for React Native, built on New Architecture |
| Server State | TanStack Query v5 | Best-in-class async data caching, optimistic updates, hydration support |
| Client State | Zustand | Minimal boilerplate, works identically on web and native, no Redux overhead |
| Backend | Supabase | Postgres + RLS + Auth + Realtime + Edge Functions in one platform |
| Offline Store | Expo SQLite | Persistent local storage for event queue and offline read cache |
| Secure Storage | expo-secure-store | Encrypted storage for `device_id` and sensitive tokens |
| i18n (web) | next-intl | Purpose-built for Next.js App Router, Server Component support |
| i18n (mobile) | react-i18next | Mature, flexible, React Native compatible |
| Email | Resend | Modern transactional email, excellent TypeScript SDK, generous free tier |
| Error Tracking | Sentry | SDKs for both Next.js and Expo, free tier covers MVP |
| Payments | Stripe | Industry standard, deferred to Phase 2, schema stubbed |
| Monorepo | Turborepo + pnpm | Fast incremental builds, shared dependency management |
| Type System | TypeScript (strict) | `strict: true`, `exactOptionalPropertyTypes: true`, `moduleResolution: "bundler"` |
| Testing | Jest + RTL + Playwright + Maestro | Full coverage from unit to E2E across both platforms |
| Linting | ESLint + Prettier | Consistent style, enforced pre-commit and in CI |
| CI/CD | GitHub Actions | Typecheck + test on PR; EAS Build + Vercel deploy on merge |
| Web Deploy | Vercel | Zero-config Next.js, preview URLs per PR, custom domain ready |
| Mobile Deploy | EAS Build + App Stores | Managed native builds, `development` / `preview` / `production` profiles |

---

## 5. Architectural Decision Records

### ADR-001 — Monorepo Structure
- **Decision**: Turborepo with pnpm workspaces. Root `.npmrc` sets `node-linker=hoisted`.
- **Rationale**: Shared code across apps without symlink issues in Metro bundler. `node-linker=hoisted` produces a flat `node_modules` that Metro can resolve without custom configuration.
- **Consequences**: Slightly reduced pnpm isolation. Acceptable tradeoff for the significant reduction in bundler configuration complexity.
- **Status**: Approved

---

### ADR-002 — TypeScript Configuration
- **Decision**: `strict: true`, `exactOptionalPropertyTypes: true`, `moduleResolution: "bundler"` in root `tsconfig.base.json`. All packages extend this base.
- **Rationale**: `moduleResolution: "bundler"` is required for `package.json` subpath exports (used by `@fitsync/database/server`). `exactOptionalPropertyTypes` prevents `undefined` being assigned to optional fields.
- **Consequences**: Stricter type errors during development. Occasional need for explicit type assertions at library boundaries.
- **Status**: Approved

---

### ADR-003 — Internal Package Naming
- **Decision**: All internal packages use the `@fitsync/` npm org scope (e.g., `@fitsync/shared`, `@fitsync/ui`). The `@/` alias is reserved for within-app local imports only (e.g., `@/components/header`).
- **Rationale**: `@/` is a Next.js convention for local `src/` aliasing. Using it for cross-package imports causes ambiguity and build tool conflicts.
- **Consequences**: Clear distinction between internal package imports and local imports. All developers must follow this convention.
- **Status**: Approved

---

### ADR-004 — React Functional Components
- **Decision**: All React code uses functional components with hooks. Class components are forbidden.
- **Rationale**: Modern React best practice. Better tree-shaking, simpler testing, consistent with all current React ecosystem tooling.
- **Consequences**: No class component patterns. Developers unfamiliar with hooks need onboarding.
- **Status**: Approved

---

### ADR-005 — Internationalization
- **Decision**: `next-intl` on web, `react-i18next` on mobile. Shared translation JSON files in `packages/shared/locales/{en,es,cs}.json`. Both libraries configured for single-brace `{variable}` interpolation syntax. English, Spanish, Czech at launch.
- **Rationale**: `next-i18next` (the common i18next wrapper) does not support Next.js App Router or Server Components. `next-intl` is purpose-built for App Router. Single-brace interpolation unifies the format across both libraries, enabling shared translation files.
- **Consequences**: Two different i18n library APIs to maintain. JSON file format is the shared contract — any interpolation variables must use `{variable}` syntax.
- **Status**: Approved

---

### ADR-006 — Code Quality Tooling
- **Decision**: ESLint + Prettier + Conventional Commits enforced via pre-commit hooks and CI. Shared configs in `packages/eslint-config` and `packages/typescript-config`.
- **Rationale**: Consistent style across a multi-package repo. Conventional Commits enable automated changelogs and semantic versioning.
- **Consequences**: Initial setup overhead. Long-term reduction in code review noise and merge conflicts.
- **Status**: Approved

---

### ADR-007 — Shared UI Package Strategy
- **Decision**: Single `packages/ui` with platform-split files (`component.web.tsx` / `component.native.tsx` / `component.types.ts`). Shared interface defined once in `component.types.ts`.
- **Rationale**: Separate `ui-web` and `ui-native` packages double maintenance burden (two APIs, two test suites, two changelogs). Platform-split files give Metro and Next.js automatic resolution of the correct implementation while maintaining one package and one interface contract.
- **Consequences**: Next.js requires explicit webpack config to resolve `.web.tsx` before `.tsx`. This is configured at scaffold and documented.
- **Status**: Approved

---

### ADR-008 — Styling
- **Decision**: TailwindCSS for web (Next.js). NativeWind v4 for mobile (Expo). NativeWind v4 requires Expo SDK 50+ and React Native New Architecture.
- **Rationale**: Tailwind is the standard for Next.js. NativeWind brings the same utility-class API to React Native. Unified mental model across platforms without a shared runtime.
- **Consequences**: Every native module added to the Expo app must be verified for New Architecture compatibility before installation. NativeWind v4 cannot be downgraded to Old Architecture without switching to NativeWind v2.
- **Status**: Approved

---

### ADR-009 — State Management
- **Decision**: TanStack Query v5 for server/async state. Zustand for client/UI state. Redux Toolkit is not used.
- **Rationale**: TanStack Query handles caching, deduplication, background refetch, and optimistic updates out of the box. Zustand handles auth session, sync queue status, and UI state with minimal boilerplate. RTK adds infrastructure cost without adding value at this project scale.
- **Consequences**: Clear contract required: TanStack Query is never authoritative on mobile when offline. SQLite is the offline source of truth. TanStack Query is a performance cache only.
- **Status**: Approved

---

### ADR-010 — Backend Platform
- **Decision**: Supabase (Postgres, Auth, RLS, Realtime, Edge Functions). Three environments: local (Supabase CLI + Docker), staging (Supabase free project), production (Supabase Pro).
- **Rationale**: All required capabilities (auth, realtime, row-level security, serverless compute) in one platform. CLI enables deterministic local development and migration management. Staging environment required to test migrations before production.
- **Consequences**: Docker Desktop is a hard prerequisite for local development. `supabase start` must be running for any backend-dependent work.
- **Status**: Approved

---

### ADR-011 — Database Type Generation Strategy
- **Decision**: DB-first. `supabase gen types typescript --local` generates types into `packages/database-types/src/types.ts`. This package has zero runtime dependencies. Zod schemas in `packages/shared` are written to align with these generated types. `supabase gen types` is run as a CI step — type drift causes compilation failure.
- **Rationale**: Postgres is the authoritative source of truth for data shape. The generated types enforce this at compile time. Separating generated types into their own package prevents `packages/shared` from having a runtime dependency on Supabase infrastructure.
- **Consequences**: Schema changes require regenerating types and updating Zod schemas before the build passes. This is intentional — it makes schema changes explicit and auditable.
- **Status**: Approved

---

### ADR-012 — Supabase Migration Location
- **Decision**: The `supabase/` directory (containing `config.toml`, `migrations/`, `seed.sql`, `functions/`) lives at the repository root. `packages/database/src/` contains only the TypeScript client layer.
- **Rationale**: Supabase CLI tooling assumes root-level placement. All CLI commands (`supabase start`, `supabase db push`, `supabase gen types`) work without path overrides. Clean separation between infrastructure config and application code.
- **Consequences**: Supabase CLI commands must be run from the repo root.
- **Status**: Approved

---

### ADR-013 — Supabase Client Architecture
- **Decision**: `packages/database` exports three distinct clients via `package.json` subpath exports:
  - `@fitsync/database` — platform-split (`.web.ts` = browser client, `.native.ts` = RN AsyncStorage client).
  - `@fitsync/database/server` — `@supabase/ssr` client for Next.js Server Components, Route Handlers, and middleware.
- **Rationale**: Using the wrong Supabase client in the wrong context causes silent auth failures. Subpath exports make the wrong choice physically impossible — the `./server` path cannot be imported in mobile code.
- **Consequences**: Next.js `middleware.ts` is required to handle session refresh on every request. Omitting it causes sessions to expire silently after one hour.
- **Status**: Approved

---

### ADR-014 — Offline Sync Model
- **Decision**: Events are identified by `(device_id, client_sequence)` tuples. `device_id` is a UUID v4 generated on first app launch, stored in `expo-secure-store`. `client_sequence` is a monotonically incrementing integer per device, stored in SQLite. Wall-clock timestamps are stored for display only and never used for ordering. Server assigns `server_created_at` on receipt.
- **Rationale**: Device clocks are unreliable for ordering (drift, timezone changes, manual adjustments). Logical sequence numbers per device provide deterministic ordering. `expo-secure-store` is encrypted at rest and purpose-built for stable device identity.
- **Consequences**: A device reinstall generates a new `device_id`. The sync queue starts fresh on reinstall, which is the correct behavior. Multi-device scenarios are handled correctly because each device has an independent sequence space.
- **Status**: Approved

---

### ADR-015 — Event Idempotency
- **Decision**: The `workout_events` table has a unique constraint on `(device_id, client_sequence)`. Server-side inserts use `ON CONFLICT DO NOTHING` and always return the canonical event. Clients may safely retry failed submissions.
- **Rationale**: Network failures mid-flush may cause duplicate submissions. Without idempotency, retries create phantom events that corrupt athlete logs.
- **Consequences**: Duplicate submissions are silently deduplicated. The client always receives a canonical response regardless of whether the event was newly created or already existed.
- **Status**: Approved

---

### ADR-016 — Edge Functions Scope
- **Decision**: Edge Functions are thin. They handle: transactional email via Resend, incoming Stripe webhooks (Phase 2), and future third-party API integrations. They never contain business logic and never import from `packages/shared`.
- **Rationale**: Edge Functions run on Deno. Deno does not understand pnpm workspaces or Node.js `package.json` imports. Importing from `packages/shared` in an Edge Function is not possible without a custom build step.
- **Consequences**: All business logic stays in Postgres functions, RLS policies, and the client-side `packages/shared`. Edge Functions are stateless, single-responsibility, and easily testable in isolation.
- **Status**: Approved

---

### ADR-017 — RBAC Model
- **Decision**: Two roles: `trainer` and `athlete`. Roles are assigned at signup and are mutually exclusive. A user cannot hold both roles. No platform admin role for MVP (Supabase dashboard serves operational needs). Trainers invite athletes by email; the relationship status progresses through `pending → active → revoked`.
- **Rationale**: Mutually exclusive roles simplify RLS policies significantly. A user needing both roles can create a second account. Invite-by-email gives the trainer control of their roster while requiring explicit athlete consent (privacy-first).
- **Consequences**: The `coach_athlete_relationships` table is the authorization boundary for all trainer access to athlete data. RLS policies on all athlete data tables must join through this table.
- **Status**: Approved

---

### ADR-018 — Historical Data Access
- **Decision**: The `coach_athlete_relationships` table has a `history_shared_from timestamptz` column. At the time of accepting a trainer invitation, the athlete explicitly chooses to share all history (sets `history_shared_from` to their account creation date) or only future data (sets it to `now()`). RLS policies on athlete data include `AND events.created_at >= relationship.history_shared_from`.
- **Rationale**: Athletes may have logged private workout data before connecting with a trainer. Silent retrospective exposure of that data to a third party would be a GDPR violation and a trust violation. Explicit consent at connection time is the correct model.
- **Consequences**: RLS policies are slightly more complex. The athlete onboarding/invitation acceptance flow must present this choice clearly.
- **Status**: Approved

---

### ADR-019 — GDPR Erasure Strategy
- **Decision**: On erasure request, the user's profile is flagged `pending_deletion = true`. After a 30-day grace period, a scheduled Postgres job anonymizes all PII in place: text fields become `[deleted]`, the profile row is anonymized, foreign key references are preserved for structural integrity. Hard deletion is not used.
- **Rationale**: Hard deletion of an event log owner cascades unpredictably and destroys aggregate data integrity. Anonymization satisfies GDPR Article 17's intent (no longer personally identifiable) while preserving the system's structural and analytical integrity.
- **Consequences**: A `pending_deletion` flag must be checked in auth middleware to prevent login during the grace period if desired. The scheduled job must be implemented as a Postgres cron function (via `pg_cron` extension on Supabase).
- **Status**: Approved

---

### ADR-020 — Workout Session Entity
- **Decision**: Workout sessions are first-class entities in a `workout_sessions` table. All `workout_events` carry a `session_id` foreign key. Sessions have explicit `started_at` and `ended_at` timestamps and a reference to the trainer's `program_version_id` if applicable.
- **Rationale**: Grouping events into sessions is fundamental for dashboard aggregation, trainer review, and conflict detection (detecting when athlete logged against a stale program version). Deriving sessions from time proximity is fragile. A `session_start` event type creates query complexity without benefit.
- **Consequences**: The client must create a session record before logging any events. On the offline path, the session creation event enters the sync queue first, and all subsequent events in that session carry the local session ID.
- **Status**: Approved

---

### ADR-021 — Environment Variable Strategy
- **Decision**: `process.env` is not available at runtime in React Native. All environment variables for the mobile app are injected at build time via `app.config.ts` and accessed at runtime via `expo-constants`. The web app uses `process.env` and Next.js's built-in `.env.local` support. Secrets live in CI provider vault and Supabase project settings. The `service_role` key never appears in any client code or `.env.local` file.
- **Rationale**: React Native has no Node.js runtime. `process.env` references in RN code silently resolve to `undefined`. `app.config.ts` (not `app.json`) is required to read environment variables at config build time.
- **Consequences**: Changes to `app.config.ts` that affect native config (permissions, URL schemes, new native modules) require a new EAS Build — they cannot be shipped via OTA update.
- **Status**: Approved

---

### ADR-022 — Mobile Distribution & CI
- **Decision**: Expo managed workflow. EAS Build with three profiles: `development` (local dev client), `preview` (internal testing via TestFlight / Play Store internal track), `production` (public store builds). EAS Build is only triggered on merge to `develop` (preview) or `main` (production), never on PRs.
- **Rationale**: Managed workflow covers all current and planned native requirements (health data sync via config plugin in Phase 2). EAS Build on PRs is prohibitively slow on free tier (20–40 minute queue times). Full CI (typecheck + lint + tests) runs on every PR via Linux runners.
- **Consequences**: Developers cannot test production-parity native builds locally without triggering an EAS Build or using the local Expo dev client.
- **Status**: Approved

---

### ADR-023 — Web Deployment Strategy
- **Decision**: Vercel hosts the Next.js web app. Vercel's native GitHub auto-deploy integration is disabled. All deployments are triggered explicitly by GitHub Actions using the Vercel CLI. Preview deployments are created on PR. Production deployment occurs on merge to `main` after all CI checks pass.
- **Rationale**: Vercel's auto-deploy and GitHub Actions would both trigger on every push, causing race conditions and wasted build minutes. GitHub Actions as the single deployment controller ensures deployments only happen after tests pass.
- **Consequences**: Vercel project settings must have automatic deployments disabled at initial setup. Deployment keys must be stored in GitHub Actions secrets.
- **Status**: Approved

---

### ADR-024 — Error Tracking
- **Decision**: Sentry is integrated in both the Next.js app (`@sentry/nextjs`) and the Expo app (`@sentry/react-native`) from day one. Source maps are uploaded during CI builds.
- **Rationale**: Production errors are invisible without instrumentation. Retrofitting error tracking after launch means a gap in early production data. The free tier covers MVP scale. 30-minute setup cost is trivially justified.
- **Consequences**: Sentry DSN must be stored as an environment variable in both app environments and CI secrets. Source map upload adds ~30 seconds to CI build time.
- **Status**: Approved

---

### ADR-025 — Maestro Mobile E2E Testing
- **Decision**: Maestro is used for mobile E2E tests. In CI, only Android is tested (Linux runner). iOS Maestro tests are run locally by developers before merging. Detox is not used.
- **Rationale**: iOS simulators require macOS runners which cost ~10x more than Linux runners. Maestro is simpler to configure than Detox for Expo apps and sufficient for MVP-level coverage. Android in CI catches the majority of integration regressions.
- **Consequences**: iOS-specific regressions may not be caught in CI. Developers must run iOS Maestro locally before submitting PRs with native-affecting changes.
- **Status**: Approved

---

## 6. Folder Structure

```
fitsync/
│
├── supabase/                          # Supabase CLI root (config, migrations, functions)
│   ├── config.toml                    # Local Supabase config
│   ├── seed.sql                       # Deterministic test data for E2E and local dev
│   ├── migrations/                    # Versioned SQL migrations (never edited after deploy)
│   └── functions/                     # Edge Functions (Deno, thin, no shared imports)
│       ├── send-invitation/
│       └── handle-stripe-webhook/     # Phase 2 stub
│
├── apps/
│   ├── web/                           # Next.js App Router (trainer-focused)
│   │   ├── app/                       # App Router pages, layouts, route handlers
│   │   │   ├── (auth)/                # Auth routes (login, signup)
│   │   │   ├── (dashboard)/           # Protected trainer dashboard
│   │   │   └── api/                   # Route handlers
│   │   ├── components/                # Web-only components (use @fitsync/ui for shared)
│   │   ├── middleware.ts              # Supabase session refresh (required)
│   │   ├── next.config.ts            # Includes .web.tsx resolution + Sentry
│   │   └── .env.local                # NEXT_PUBLIC_SUPABASE_URL, ANON_KEY only
│   │
│   └── mobile/                        # Expo managed workflow (athlete-focused)
│       ├── app/                       # Expo Router file-based routes
│       │   ├── (auth)/
│       │   └── (tabs)/
│       ├── components/                # Mobile-only components
│       ├── store/                     # Zustand stores
│       ├── sync/                      # Event queue, flush logic, catch-up
│       ├── app.config.ts             # EAS config + env injection via Constants
│       ├── eas.json                  # EAS Build profiles (development/preview/production)
│       ├── metro.config.js           # NativeWind + monorepo watchFolders
│       └── .env.local                # SUPABASE_URL, SUPABASE_ANON_KEY (build-time only)
│
├── packages/
│   ├── shared/                        # Zero infrastructure deps — the brain of the app
│   │   ├── src/
│   │   │   ├── schemas/               # Zod schemas (aligned with database-types)
│   │   │   ├── rbac/                  # Role definitions, permission helpers
│   │   │   ├── business-logic/        # Pure functions: aggregations, conflict detection
│   │   │   └── locales/               # i18n JSON files
│   │   │       ├── en.json
│   │   │       ├── es.json
│   │   │       └── cs.json
│   │   └── package.json
│   │
│   ├── database-types/                # AUTO-GENERATED — do not edit manually
│   │   ├── src/
│   │   │   └── types.ts               # Output of: supabase gen types typescript
│   │   └── package.json               # Zero runtime dependencies
│   │
│   ├── database/                      # Supabase client layer
│   │   ├── src/
│   │   │   ├── client.web.ts          # @supabase/supabase-js (browser)
│   │   │   ├── client.native.ts       # @supabase/supabase-js (AsyncStorage adapter)
│   │   │   └── client.server.ts       # @supabase/ssr (Next.js Server Components)
│   │   └── package.json               # exports: { ".": platform-split, "./server": server }
│   │
│   ├── ui/                            # Shared component library
│   │   ├── src/
│   │   │   └── button/
│   │   │       ├── button.web.tsx     # Tailwind implementation
│   │   │       ├── button.native.tsx  # NativeWind implementation
│   │   │       ├── button.types.ts    # Shared prop interface
│   │   │       └── index.ts
│   │   └── package.json
│   │
│   ├── typescript-config/             # Shared tsconfig exports
│   │   ├── base.json                  # moduleResolution: bundler, strict, etc.
│   │   ├── nextjs.json
│   │   └── react-native.json
│   │
│   └── eslint-config/                 # Shared ESLint rules
│       ├── base.js
│       ├── next.js
│       └── react-native.js
│
├── .github/
│   └── workflows/
│       ├── ci.yml                     # PR: typecheck + lint + Jest + Playwright
│       ├── deploy-web.yml             # main → Vercel production
│       └── eas-build.yml              # develop → EAS preview, main → EAS production
│
├── .npmrc                             # node-linker=hoisted (Metro symlink fix)
├── turbo.json                         # Pipeline with ^build dependency ordering
├── pnpm-workspace.yaml
├── tsconfig.base.json                 # Extended by all packages
└── package.json                       # Root scripts: dev, build, test, lint, gen:types
```

---

## 7. Key Constraints & Non-Negotiables

These are constraints that must not be violated. Any PR that breaks them should be rejected in review.

| Constraint | Rule |
|---|---|
| **Shared package purity** | `packages/shared` must never import from `packages/database` or any infrastructure package. |
| **Database types are generated** | `packages/database-types/src/types.ts` is never edited manually. Always regenerated via `pnpm gen:types`. |
| **Edge Functions are thin** | No business logic, no `packages/shared` imports, no Zod validation in Edge Functions. |
| **Append-only events** | `workout_events` rows are never updated or deleted in normal operation. Corrections use the `corrections` event type. |
| **Wrong Supabase client** | Browser client is never used in Next.js Server Components. Server client is never bundled in mobile. |
| **service_role key** | Never in any client code, never in `.env.local`, only in CI secrets and Supabase Edge Function environment. |
| **client_sequence ordering** | Event queue flushes always `ORDER BY client_sequence ASC`. Out-of-order submission corrupts aggregates. |
| **SQLite is offline truth** | On mobile, SQLite is the source of truth when offline. TanStack Query cache is never treated as authoritative. |
| **Native module vetting** | Every new Expo native module must be verified for React Native New Architecture compatibility before installation. |
| **No process.env in mobile** | All env vars on mobile are injected via `app.config.ts` and read via `expo-constants`. |
