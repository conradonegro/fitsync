# FitSync

Professional coaching platform for independent personal trainers and athletes.

---

## Prerequisites

> These must be installed before running anything. Missing any of them will cause
> confusing errors on first setup.

| Tool | Version | Required For |
|---|---|---|
| Node.js | 20.20.0 | Everything |
| pnpm | 10.30.2 | Package management |
| Docker Desktop | Latest | `supabase start` (local DB) |
| Supabase CLI | Latest | Local Supabase, migrations, type gen |
| EAS CLI | Latest | Mobile builds |

```bash
# Verify your environment
node --version   # must be 20.x
pnpm --version   # must be 10.x
docker --version
supabase --version
eas --version
```

---

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/conradonegro/fitsync.git
cd fitsync

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env.local             # root (CI use only)
cp apps/web/.env.local.example apps/web/.env.local
cp apps/mobile/.env.local.example apps/mobile/.env.local

# 4. Start local Supabase (requires Docker Desktop running)
supabase start
# Note the anon key and URL printed — copy into your .env.local files.

# 5. Apply migrations and seed data
supabase db reset

# 6. Generate TypeScript types from the local schema
pnpm gen:types

# 7. Start development servers
pnpm dev
```

---

## Monorepo Structure

```
fitsync/
├── apps/
│   ├── web/        # Next.js — trainer dashboard (port 3000)
│   └── mobile/     # Expo — athlete app
├── packages/
│   ├── shared/            # Zod schemas, RBAC, business logic, i18n files
│   ├── database-types/    # Auto-generated Supabase types (do not edit)
│   ├── database/          # Supabase clients (browser / native / server)
│   ├── ui/                # Shared components with platform-split files
│   ├── typescript-config/ # Shared tsconfig presets
│   └── eslint-config/     # Shared ESLint rules
└── supabase/              # Migrations, seed data, Edge Functions
```

---

## Common Commands

```bash
# From repo root:
pnpm build        # Build all packages and apps (respects dependency order)
pnpm typecheck    # TypeScript type check across all packages
pnpm lint         # ESLint across all packages
pnpm test         # Run all tests
pnpm format       # Format all files with Prettier
pnpm gen:types    # Regenerate packages/database-types from local Supabase schema

# Supabase:
supabase start           # Start local Supabase
supabase stop            # Stop local Supabase
supabase db reset        # Reset DB, re-run all migrations, apply seed.sql
supabase migration new <name>   # Create a new migration file

# Mobile:
cd apps/mobile
pnpm dev          # Start Expo dev server
```

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full architectural decision record,
data model, sync design, and tech stack rationale.

---

## Environment Variables

See `.env.example` for all required variables with descriptions.

**Security rules — non-negotiable:**
- The `SUPABASE_SERVICE_ROLE_KEY` must NEVER appear in any client code or mobile bundle.
- Never commit `.env.local` or any file with real secrets.
- All production secrets live in the CI provider vault (GitHub Actions secrets).

---

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Production-ready code. Protected. |
| `develop` | Integration branch. All features merge here first. |
| `feature/<name>` | New features. |
| `fix/<name>` | Bug fixes. |
| `chore/<name>` | Maintenance, dependency updates. |

PRs require passing CI (typecheck + lint + tests) before merge.

---

## Phase 1 Scope

See [PHASE1_SCOPE.md](./PHASE1_SCOPE.md) for the full Phase 1 deliverables,
acceptance criteria, and task breakdown.
