# Repository Guidelines

## Project Structure & Module Organization

FitSync is a `pnpm`/Turbo monorepo. Main apps live in `apps/web` (Next.js trainer dashboard) and `apps/mobile` (Expo athlete app). Shared code lives in `packages/`: `shared` for Zod schemas, RBAC, and locales, `ui` for shared components, `database` for Supabase clients, and `database-types` for generated schema types. Backend assets live in `supabase/` (migrations, seed data, Edge Functions). Mobile E2E flows live in `maestro/`.

## Build, Test, and Development Commands

Run all workspace commands from the repo root unless a section says otherwise.

- `pnpm dev`: starts app dev tasks in parallel through Turbo.
- `pnpm build`: builds all packages and apps in dependency order.
- `pnpm typecheck`: runs TypeScript checks across the monorepo.
- `pnpm lint`: runs ESLint in every package/app.
- `pnpm test`: runs Jest suites across the workspace.
- `pnpm format` / `pnpm format:check`: apply or verify Prettier formatting.
- `pnpm gen:types`: regenerates `packages/database-types/src/types.ts` from local Supabase.
- `cd apps/web && pnpm test:e2e`: runs Playwright web E2E tests.
- `maestro test maestro/auth/`: runs mobile Maestro flows against a development build.

## Coding Style & Naming Conventions

Use TypeScript throughout. Prettier enforces 2-space indentation, single quotes, semicolons, trailing commas, and a 100-character line width. ESLint forbids `any`, non-null assertions, and unused variables unless intentionally prefixed with `_`. Use `PascalCase` for React components, `camelCase` for functions/state, and kebab-case for route segments and YAML flow files. Do not hand-edit generated files in `packages/database-types/`.

## Testing Guidelines

Jest covers unit and integration tests with `**/__tests__/**/*.test.ts` naming across `apps/web`, `apps/mobile`, and `packages/shared`. Playwright specs live in `apps/web/e2e`. Maestro flows cover mobile auth, workout, and sync paths. No coverage threshold is enforced in config; contributors should add or update tests for every behavior change and run the relevant suite locally before opening a PR.

## Commit & Pull Request Guidelines

Recent history follows a Conventional Commit style such as `feat(d6): ...` and `fix: ...`; keep subject lines imperative and scoped when helpful. PRs should target `main`, describe user-visible changes, call out schema/env updates, and include screenshots for UI changes. CI currently enforces `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`; run tests locally and mention what you verified.

## Security & Configuration Tips

Copy `.env.example`, `apps/web/.env.local.example`, and `apps/mobile/.env.local.example` for local setup. Never commit real secrets or expose `SUPABASE_SERVICE_ROLE_KEY` in client code. When schema changes land, run `supabase db reset` and `pnpm gen:types` together.
