# D7 — CI/CD Pipeline (Local-First Quality Gates Design)

| Field            | Value                                          |
| ---------------- | ---------------------------------------------- |
| **Status**       | Approved (design); implementation pending      |
| **Date**         | 2026-04-08                                     |
| **Branch**       | `feat/d7-cicd`                                 |
| **Deliverable**  | D7 — CI/CD Pipeline (per `PHASE1_SCOPE.md` §2) |
| **Related ADRs** | ADR-026 (new), amends ADR-022 and ADR-023      |
| **Supersedes**   | None                                           |

---

## 1. Context

### 1.1 What is D7?

`PHASE1_SCOPE.md` §2 defines D7 as "Fully automated pipeline from PR to production," covering CI gates (typecheck, lint, Jest, Playwright, `gen:types` drift), web deployment (Vercel), mobile builds (EAS), and secret management. The original scope envisioned every quality check running in GitHub Actions and gating PR merges.

### 1.2 What changed during design

After exploring the problem space, the team made a deliberate decision to move _most_ quality gates from CI to local checks. The reasoning is captured in ADR-026 and summarized below:

- For a solo developer running every check locally before pushing anyway, duplicating the full test matrix in CI adds 3–5 minutes of feedback latency per PR for near-zero marginal safety
- Pre-push hooks (with sensible filters via `turbo run --filter`) enforce the fast-feedback subset of checks — typecheck, lint, format, build, and Jest unit tests — on every push without requiring external services
- Playwright E2E, Maestro mobile E2E, and `gen:types` drift are _not_ run by the pre-push hook because each needs external state (local Supabase running, simulators, a Next.js dev server). These are documented as a "before opening a PR" manual checklist in `CLAUDE.md` and remain the developer's responsibility to run at the right moments
- A minimal CI `verify` job remains as a safety net for the narrow case of `--no-verify` bypasses
- EAS Build is removed from CI entirely — production mobile builds become a deliberate manual command, not a side effect of merging

This design represents the _minimal_ shape of D7 that still satisfies the _intent_ of the original AC-D7 (broken code never reaches production), while explicitly deviating from the _literal text_ of several AC items. The literal AC text is rewritten to reflect the new model — see §8.2 below.

### 1.3 Existing state at design time

- `.github/workflows/ci.yml`, `deploy-web.yml`, `eas-build.yml` exist as skeletons committed in earlier deliverables but are largely TODO-marked
- `apps/mobile/eas.json` exists with three profiles (`development`, `preview`, `production`)
- `apps/mobile/app.config.ts` has `owner: 'conradonegro'` and `eas.projectId: process.env['EAS_PROJECT_ID']` (EAS project is not yet initialized — `projectId` comes from a local env var that doesn't yet exist)
- No `husky`, `lint-staged`, or any local hook tooling in the repo
- No Vercel project created yet, no EAS project initialized, no GitHub Environments, no GitHub Actions secrets, no branch protection
- Staging Supabase project exists at project ref `rjhzkgomgsztcyrhkywf` with all D1–D6 migrations applied (see `supabase/migrations/` directory for the full migration list at the time of this spec)
- No `EXPO_TOKEN` has been added to GitHub Actions secrets. It was anticipated earlier but is intentionally dropped by this design — EAS builds are manual (see §2 decision 10)

---

## 2. Locked design decisions

| #   | Topic                      | Decision                                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Branching                  | Single `main` branch. No `develop`, no `preview-*` tag triggers.                                                                                                                                                                                                                                                                                                             |
| 2   | Vercel project             | Does not exist; provisioned during D7. Reserve project name `fitsync` so `APP_URL=https://fitsync.vercel.app` is deterministic from day one.                                                                                                                                                                                                                                 |
| 3   | EAS project                | Expo account exists; project initialized via `eas init` during D7.                                                                                                                                                                                                                                                                                                           |
| 4   | Test matrix                | Pre-push hook runs typecheck + lint + format:check + build + Jest (via turbo filter). Playwright E2E, Maestro, and `gen:types` drift are _not_ in the hook — they need external state (local Supabase, simulators, dev server) and are documented as a "before opening a PR" manual checklist in `CLAUDE.md`. CI `verify` runs only typecheck + lint + format:check + build. |
| 5   | CI structure               | Single `ci.yml` workflow, three jobs: `verify` (PR + push), `migrate-staging` (push to main only, needs verify), `deploy-production` (push to main only, needs migrate-staging).                                                                                                                                                                                             |
| 6   | Vercel previews            | None. PR preview deploys are not in D7 scope.                                                                                                                                                                                                                                                                                                                                |
| 7   | Branch protection          | Strict on `main`. `verify` is the only required status check. "Include administrators" Off.                                                                                                                                                                                                                                                                                  |
| 8   | Backend for deploys        | Both production and (future) preview Vercel deploys point at staging Supabase `rjhzkgomgsztcyrhkywf`.                                                                                                                                                                                                                                                                        |
| 9   | Failure notifications      | GitHub default email only.                                                                                                                                                                                                                                                                                                                                                   |
| 10  | EAS Build trigger          | Manual only. `eas build --profile {preview,production} --non-interactive` from local machine. No CI integration.                                                                                                                                                                                                                                                             |
| 11  | Migration drift mitigation | `migrate-staging` job runs `supabase db push --dry-run` then `supabase db push` against staging _before_ `deploy-production`. Atomic ordering via `needs:`.                                                                                                                                                                                                                  |
| 12  | Migration safety policy    | Additive changes only in Phase 1 — see §7 (ADR-026).                                                                                                                                                                                                                                                                                                                         |
| 13  | Local quality gates        | husky v9 + lint-staged. `pre-commit` runs `lint-staged` (~5s); `pre-push` runs `pnpm exec turbo run typecheck lint build test --filter="...[origin/main]"` followed by `pnpm format:check` (~15–90s). Scope of what the hook enforces: see row 4.                                                                                                                            |
| 14  | Turbo remote cache         | Enabled via Vercel-hosted cache. `TURBO_TOKEN` + `TURBO_TEAM` secrets; one-time `turbo login && turbo link` locally.                                                                                                                                                                                                                                                         |
| 15  | Concurrency control        | Single concurrency group `ci-${{ github.ref }}`. PRs cancel-in-progress on new pushes; pushes to `main` wait for older runs to finish (never cancel mid-`db push`).                                                                                                                                                                                                          |

---

## 3. Architecture overview

### 3.1 Branches

| Branch   | Purpose                                 | Protection                                                                                                                     | Triggers                     |
| -------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `main`   | Production. The only long-lived branch. | Strict: PR required, `verify` required, linear history, up-to-date branches, force-push blocked. "Include administrators" Off. | `ci.yml` (all three jobs)    |
| `feat/*` | Feature branches                        | None                                                                                                                           | `ci.yml` (`verify` job only) |

There is no `develop` branch. There are no preview tag triggers. Mobile builds are not branch-triggered at all.

### 3.2 Workflows

One file: `.github/workflows/ci.yml`. Three jobs:

```
on: [pull_request to main, push to main]

verify           ← runs always; required status check on main
  ↓
migrate-staging  ← runs only on push to main; needs verify
  ↓
deploy-production ← runs only on push to main; needs migrate-staging
```

`deploy-web.yml` and `eas-build.yml` are deleted as standalone files. Their concerns are folded into `ci.yml` (Vercel) or removed from CI entirely (EAS).

### 3.3 Secrets and environment variables

Two stores. Distinct purposes.

#### GitHub Actions secrets (used by CI)

| Secret                  | Used in job                               | Purpose                                                                                                                            |
| ----------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `VERCEL_TOKEN`          | `deploy-production`                       | Vercel CLI authentication                                                                                                          |
| `VERCEL_ORG_ID`         | `deploy-production` (exported as env var) | Binds CLI commands to the correct Vercel team/account — required on clean CI runners that have no committed `.vercel/project.json` |
| `VERCEL_PROJECT_ID`     | `deploy-production` (exported as env var) | Binds CLI commands to the correct Vercel project — required on clean CI runners                                                    |
| `SUPABASE_ACCESS_TOKEN` | `migrate-staging`                         | Supabase CLI authentication                                                                                                        |
| `SUPABASE_DB_PASSWORD`  | `migrate-staging`                         | Direct Postgres connection password for `db push`                                                                                  |
| `TURBO_TOKEN`           | `verify` (and others using `pnpm build`)  | Turbo remote cache authentication                                                                                                  |
| `TURBO_TEAM`            | `verify`                                  | Turbo remote cache team binding                                                                                                    |

#### GitHub Actions repository variables (not secret)

| Variable                       | Value                  | Purpose                                              |
| ------------------------------ | ---------------------- | ---------------------------------------------------- |
| `STAGING_SUPABASE_PROJECT_REF` | `rjhzkgomgsztcyrhkywf` | Project ref for `supabase link` in `migrate-staging` |

#### Vercel project environment variables (set in Vercel dashboard)

| Variable                        | Scope                | Value                                      |
| ------------------------------- | -------------------- | ------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Production + Preview | `https://rjhzkgomgsztcyrhkywf.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production + Preview | (staging anon key)                         |
| `SUPABASE_URL`                  | Production + Preview | same URL                                   |
| `SUPABASE_ANON_KEY`             | Production + Preview | same key                                   |
| `APP_URL`                       | Production + Preview | `https://fitsync.vercel.app`               |

These are pulled into the build via `vercel pull --environment=production` before `vercel build` runs.

#### Supabase Edge Function secrets

| Secret           | Set via                                       | Used by                         |
| ---------------- | --------------------------------------------- | ------------------------------- |
| `RESEND_API_KEY` | `supabase secrets set` (manual, pre-existing) | `send-invitation` Edge Function |

D7 does not add any new Edge Function secrets. The `send-invitation` Edge Function reads `acceptUrl` from its request body — the web Server Action at `apps/web/app/actions/relationships.ts` constructs the URL from `process.env['APP_URL']` and passes it to the function. Only the Vercel-side `APP_URL` env var is needed.

#### EAS Secrets (used by EAS Build runners at build time)

| Secret              | Set via                                                                                                  | Purpose            |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ------------------ |
| `SUPABASE_URL`      | `eas secret:create --scope project --name SUPABASE_URL --value https://rjhzkgomgsztcyrhkywf.supabase.co` | Mobile app runtime |
| `SUPABASE_ANON_KEY` | `eas secret:create --scope project --name SUPABASE_ANON_KEY --value <key>`                               | Mobile app runtime |

`SENTRY_DSN` and Sentry source map upload are deferred to D8.

`EAS_PROJECT_ID` is written to `apps/mobile/.env.local` (local-only, not committed) by `eas init`.

#### Intentionally NOT added

- `EXPO_TOKEN` — would only be needed if EAS builds ran in CI. They don't. The CLI authenticates via the developer's local `eas login` session.
- `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` — D8 scope.

---

## 4. Manual setup checklist

This section captures every step that cannot be automated. The order matters because some steps depend on earlier ones.

### Phase A — Provisioning (before code is written)

#### A1. Vercel project

1. Log in at vercel.com (create account if needed — Hobby plan, no card required)
2. **Create New Project** → Import from GitHub → select `conradonegro/fitsync`
3. **Reserve project name `fitsync`** so the deployment URL is `https://fitsync.vercel.app` from day one. This makes `APP_URL` deterministic and avoids a chicken-and-egg situation where the first deploy has the wrong URL.
4. Configure build settings (verify Vercel's monorepo auto-detection works first; fall back to the explicit commands below if it doesn't):
   - **Framework preset:** Next.js
   - **Root directory:** verify whether Vercel auto-detects the `apps/web` package via `turbo.json`. If yes, leave Root Directory at repo root and let auto-detection handle it. If no, set Root Directory to `apps/web` and use the cd-trick fallback below.
   - **Install command (fallback if auto-detection fails):** `cd ../.. && pnpm install --frozen-lockfile`
   - **Build command (fallback):** `cd ../.. && pnpm turbo build --filter=@fitsync/web`
   - **Output directory:** leave default (Next.js auto-detect)
5. **⚠ Critical (per ADR-023):** Settings → **Git** → **disable "Automatic deployments on push"**. GitHub Actions must be the only deployment controller. If Vercel auto-deploys and GitHub Actions also deploys, you get race conditions and wasted build minutes.
6. **Environment variables** (Settings → Environment Variables; scope to **Production** AND **Preview**):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://rjhzkgomgsztcyrhkywf.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (staging anon key from Supabase dashboard → Project Settings → API)
   - `SUPABASE_URL` = same URL
   - `SUPABASE_ANON_KEY` = same key
   - `APP_URL` = `https://fitsync.vercel.app`
7. Capture three values for GitHub secrets in Phase B3:
   - `VERCEL_TOKEN` — Account Settings → Tokens → **Create Token** named `fitsync-ci`. Copy immediately; it's only shown once.
   - `VERCEL_ORG_ID` — Settings → General → copy **Team ID** (for personal Hobby accounts, this is your user ID)
   - `VERCEL_PROJECT_ID` — Project Settings → General → copy **Project ID**

#### A2. Supabase credentials

1. **`SUPABASE_ACCESS_TOKEN`:** Visit `https://supabase.com/dashboard/account/tokens` → **Generate new token** → name it `fitsync-ci` → copy it once.
2. **`SUPABASE_DB_PASSWORD`:** The password set when creating the staging project. If forgotten: Supabase Dashboard → Project Settings → Database → **Reset database password**. Copy the new value. (Resetting the password rotates it; existing local connections that use the old password will need updating.)

No Edge Function secrets are added in D7. The existing `RESEND_API_KEY` (set during D4) remains in place.

#### A3. EAS project initialization

```bash
cd apps/mobile
eas login                          # interactive; opens browser if needed
eas init                           # creates the EAS project, may modify app.config.ts
```

**⚠ After `eas init` runs, immediately:**

```bash
git diff apps/mobile/app.config.ts
```

If `eas init` replaced the line `projectId: process.env['EAS_PROJECT_ID']` with a literal project ID string, **revert that specific line** back to `process.env['EAS_PROJECT_ID']` and instead put the actual ID in `apps/mobile/.env.local` as:

```
EAS_PROJECT_ID=<actual-id-from-eas-init>
```

This preserves the env-var-driven config pattern and keeps the actual ID out of the committed source.

Then create the EAS Secrets used at build time by EAS Build runners:

```bash
eas secret:create --scope project --name SUPABASE_URL --value https://rjhzkgomgsztcyrhkywf.supabase.co
eas secret:create --scope project --name SUPABASE_ANON_KEY --value <staging-anon-key>
```

(`SENTRY_DSN` is deferred to D8.)

#### A4. Turbo remote cache

```bash
cd <repo-root>
pnpm exec turbo login              # opens browser; authenticates with Vercel
pnpm exec turbo link               # binds repo to Vercel-hosted Turbo cache
```

Then capture two values for GitHub secrets (Phase B3):

- `TURBO_TOKEN` — vercel.com/account/tokens → **Create Token** (separate from `VERCEL_TOKEN`; scope: account-wide)
- `TURBO_TEAM` — for personal Hobby accounts, this is your Vercel username (`conradonegro`)

The `turbo link` command may write a `.turbo/config.json` file. Verify if it should be committed (modern turbo v2 may not need this file; if it exists and contains no secrets, committing is safe).

### Phase B — GitHub configuration (after the first D7 PR is open)

#### B1. Create GitHub Environments

Repo → Settings → **Environments** → **New environment**:

- **`staging`** — no protection rules
- **`production`** — set **Deployment branches and tags** to **Selected branches and tags**, and add `main` as the only allowed branch. Defense in depth: prevents any branch other than `main` from claiming the production environment. (Optionally also add an Environment URL pointing to `https://fitsync.vercel.app` after the first deploy succeeds — gives the GitHub Environments tab a clickable link.)

#### B2. Repository variables

Settings → Secrets and variables → Actions → **Variables** tab → **New repository variable**:

| Name                           | Value                  |
| ------------------------------ | ---------------------- |
| `STAGING_SUPABASE_PROJECT_REF` | `rjhzkgomgsztcyrhkywf` |

#### B3. Repository secrets

Settings → Secrets and variables → Actions → **Secrets** tab → **New repository secret**:

| Name                    | Source                               |
| ----------------------- | ------------------------------------ |
| `VERCEL_TOKEN`          | Captured in A1.7                     |
| `VERCEL_ORG_ID`         | Captured in A1.7                     |
| `VERCEL_PROJECT_ID`     | Captured in A1.7                     |
| `SUPABASE_ACCESS_TOKEN` | Captured in A2.1                     |
| `SUPABASE_DB_PASSWORD`  | Captured in A2.2                     |
| `TURBO_TOKEN`           | Captured in A4                       |
| `TURBO_TEAM`            | Captured in A4 (e.g. `conradonegro`) |

### Phase C — Safe first-run + pre-flight (during the D7 PR)

#### C1. Initial PR lands with deploy jobs disabled

The first D7 PR includes the full `ci.yml` but with `if: false` temporarily added to `migrate-staging` and `deploy-production` jobs. This lets the merge happen while:

- Verifying `verify` job runs cleanly
- Verifying pnpm install caches correctly on the runner
- Verifying Turbo remote cache is reachable
- Confirming no YAML syntax errors

#### C2. Pre-flight migration state check

With D7 code on `main` but deploys still disabled, run locally:

```bash
cd <repo-root>
supabase login                     # uses SUPABASE_ACCESS_TOKEN if not already authenticated
supabase link --project-ref rjhzkgomgsztcyrhkywf
supabase migration list --linked   # shows local vs remote migration state
```

**Required state before proceeding:** every file in `supabase/migrations/` must appear as "applied" on remote. Investigate any drift before continuing:

- If remote is _missing_ migrations the repo has → run `supabase db push` locally to apply them
- If remote _has extra_ migrations the repo doesn't have → stop. This is divergence that needs manual reconciliation. Identify the divergent migration, decide whether to backport it to the repo or remove it from staging, and resolve before any CI-driven `db push` runs.

Do not proceed to C3 until `migration list --linked` reports zero drift.

#### C3. Enable deploy jobs

Open a follow-up PR that removes the `if: false` overrides. When this PR merges, `migrate-staging` and `deploy-production` run for the first time. Watch both jobs in the GitHub Actions UI.

#### C4. Verify the first production deploy

- `migrate-staging` should be green and report "no new migrations to apply" (because Phase C2 ensured staging matches the repo)
- `deploy-production` should be green and Vercel CLI should report a deployment URL
- Open `https://fitsync.vercel.app` in a browser:
  - Web app loads
  - Login as the seed trainer succeeds
  - Roster page loads
- If anything fails, diagnose and forward-fix (do not roll back via destructive git operations).

### Phase D — Lock it down

#### D1. Branch protection on `main`

Settings → **Branches** → **Add branch ruleset** → Target `main` → enable:

- ☑ **Require a pull request before merging**
  - Required approvals: **0** (solo developer; bump to 1 when collaborators are added)
  - ☑ Dismiss stale reviews when new commits are pushed
- ☑ **Require status checks to pass before merging**
  - ☑ Require branches to be up to date before merging
  - **Required status checks:** add `Verify` (must match the exact `name:` of the `verify` job in `ci.yml`)
- ☑ **Require linear history**
- ☑ **Block force pushes**
- ☑ **Restrict deletions**
- ☐ **Do not allow bypassing the above settings** — leave UNCHECKED. Admins can bypass in emergencies.

#### D2. Final verification — walk the AC-D7 checklist

Walk through the revised AC-D7 in `PHASE1_SCOPE.md` (see §8.2 below for the full revised checklist) and tick each item.

---

## 5. `ci.yml` — full YAML

> **Note:** the version pin values for `SUPABASE_CLI_VERSION` and the Vercel CLI must be replaced with real installed versions before this file is committed. Use the output of `supabase --version` and `vercel --version` from the developer's machine.

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

env:
  # Pin exact versions to prevent silent drift between local and CI.
  # gen:types output and CLI behavior change across versions.
  SUPABASE_CLI_VERSION: '<TBD>' # replace with actual version, e.g. '1.226.4'
  VERCEL_CLI_VERSION: '<TBD>' # replace with actual version, e.g. '37.10.0'

jobs:
  # ────────────────────────────────────────────────────
  # verify — runs on every PR and push to main.
  # This is the required status check for branch protection.
  # WARNING: this job's name "Verify" is referenced in GitHub
  # branch protection settings. If you rename it, update settings.
  # ────────────────────────────────────────────────────
  verify:
    name: Verify
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
      TURBO_TEAM: ${{ secrets.TURBO_TEAM }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.30.2

      - name: Get pnpm store path
        id: pnpm-cache
        shell: bash
        run: echo "store=$(pnpm store path)" >> $GITHUB_OUTPUT

      - name: Cache pnpm store
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.store }}
          key: pnpm-${{ runner.os }}-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: pnpm-${{ runner.os }}-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Format check
        run: pnpm format:check

      - name: Build
        run: pnpm build

  # ────────────────────────────────────────────────────
  # migrate-staging — push to main only.
  # Applies any pending migrations to staging Supabase
  # before deploying the new web code. Dry-run runs first
  # so failures surface before any state is changed.
  # ────────────────────────────────────────────────────
  migrate-staging:
    name: Migrate Staging
    needs: [verify]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    environment: staging
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: ${{ env.SUPABASE_CLI_VERSION }}

      - name: Link staging project
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
        run: supabase link --project-ref ${{ vars.STAGING_SUPABASE_PROJECT_REF }}

      - name: Preview migrations (dry-run)
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
        run: supabase db push --dry-run

      - name: Push migrations to staging
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
        run: supabase db push

  # ────────────────────────────────────────────────────
  # deploy-production — push to main only.
  # Deploys the web app to Vercel after migrations complete.
  # ────────────────────────────────────────────────────
  deploy-production:
    name: Deploy Production
    needs: [migrate-staging]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment: production
    env:
      # These must be exported as env vars on every step that invokes the
      # Vercel CLI. On a clean runner there is no committed .vercel/project.json,
      # so the CLI has no other way to discover which project to pull/build/deploy.
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.30.2

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Vercel CLI
        run: pnpm add -g vercel@${{ env.VERCEL_CLI_VERSION }}

      - name: Pull Vercel environment
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}

      - name: Build project
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}

      - name: Deploy to production
        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
```

### 5.1 Notes on the workflow

- **Concurrency:** PRs cancel old runs on new pushes (fast feedback). Pushes to `main` _wait_ for older runs (`cancel-in-progress: false` on push events) so `supabase db push` is never interrupted mid-migration.
- **Pinned CLI versions:** Both Supabase CLI and Vercel CLI versions are pinned via `env` block. Drift between local and CI in `gen:types` output or `vercel build` behavior is a real source of false-positive failures otherwise.
- **GitHub Environments:** `staging` and `production` are referenced as job-level environments. They must exist in repo settings before the workflow runs. They scaffold deploy history, optional approval gates, and per-environment secret scoping for future use.
- **`vercel pull` reads runtime env vars from the Vercel project dashboard.** Application-level env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_URL`) live in the Vercel dashboard — they are downloaded into the build context by `vercel pull` before `vercel build` runs, and are _not_ duplicated into GitHub. **Three Vercel-related values do live in GitHub Actions secrets**: `VERCEL_TOKEN` (authenticates the CLI), `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (exported as env vars at the job level so the CLI can resolve which Vercel project to pull/build/deploy to on a clean runner with no committed `.vercel/project.json`).
- **No `EXPO_TOKEN`, no EAS Build job, no preview deploy job.** Mobile builds are manual; preview deploys are not in scope.

---

## 6. Local hooks (husky + lint-staged)

### 6.1 Install

```bash
# Repo root
pnpm add -Dw husky lint-staged
pnpm pkg set scripts.prepare="husky"
pnpm install
```

The `prepare` script runs automatically during `pnpm install` and initializes `.husky/`. Anyone who clones the repo and runs `pnpm install` gets working hooks.

### 6.2 `lint-staged` config (in root `package.json`)

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yaml,yml,css}": ["prettier --write"]
  }
}
```

Runs eslint and prettier on staged files only. Auto-fixes safe issues and re-stages the modified files. Aborts the commit on unfixable lint errors.

### 6.3 `.husky/pre-commit`

```sh
#!/usr/bin/env sh
pnpm exec lint-staged
```

Fast (~5 seconds typical). Runs on every commit.

### 6.4 `.husky/pre-push`

```sh
#!/usr/bin/env sh

# Verification before push leaves the machine.
# turbo's affected-package filter only checks packages that have changed
# since origin/main, plus their dependents. Combined with Turbo remote
# cache, even "dependent" packages typically hit cache unless their inputs
# actually changed.
#
# Scope of this hook: typecheck, lint, build, and Jest unit tests (all via turbo),
# plus repo-wide format:check (prettier runs at the root, not per-package).
#
# NOT covered by this hook (need external state — run manually before opening a PR):
#   - Playwright E2E (apps/web/pnpm test:e2e) — needs local Supabase + seed data + Next.js dev server
#   - Maestro mobile E2E — needs simulator or physical device
#   - gen:types drift (pnpm gen:types && git diff) — needs local Supabase running
# See CLAUDE.md "Before opening a PR" checklist for when to run each.

set -e
pnpm exec turbo run typecheck lint build test --filter="...[origin/main]"
pnpm format:check
```

Typical timings:

- Single-package change: ~15–30 seconds (cache hits everywhere else)
- Change to shared code: ~60–90 seconds
- Full-repo change: ~120 seconds

### 6.5 Escape hatches

- `git commit --no-verify` — skips pre-commit
- `git push --no-verify` — skips pre-push
- `HUSKY=0 git push` — env-var equivalent

These are documented intentional escape hatches for WIP commits and emergency fixes. The CI `verify` job is the only safety net when hooks are bypassed.

---

## 7. ADR-026 (full text — to be added to `ARCHITECTURE.md` §4)

```markdown
### ADR-026 — Local-First Quality Gates, CI for Deploys Only

- **Decision:** Quality gates are split across three enforcement tiers:
  1. **Per-commit (fast):** `lint-staged` via `.husky/pre-commit` runs eslint + prettier on staged files only (~5s).
  2. **Per-push (medium):** `.husky/pre-push` runs `pnpm exec turbo run typecheck lint build test --filter="...[origin/main]"` followed by `pnpm format:check` — covers typecheck, lint, build, Jest unit tests, and repo-wide format check for packages affected by the current diff against `origin/main` (~15–90s). Turbo remote cache keeps cache-hit packages near-free.
  3. **Manual "before opening a PR" (developer discipline):** Playwright E2E (`cd apps/web && pnpm test:e2e`), `gen:types` drift (`pnpm gen:types && git diff --exit-code packages/database-types/src/types.ts`), and Maestro mobile E2E (`maestro test maestro/...`) are run manually when the developer is ready to open a PR. These are _not_ in the pre-push hook because each requires external state (local Supabase running, simulator or device, a Next.js dev server) that isn't reliably present on every `git push`. Documented as a "Before opening a PR" checklist in `CLAUDE.md`.

  GitHub Actions CI runs a minimal `verify` job (typecheck + lint + format:check + build, ~90 seconds) as a safety net against hook bypasses, plus the deploy pipeline on push to `main` (`migrate-staging` → `deploy-production`). Production EAS Builds are invoked manually from the developer's machine — no CI trigger. There is no `develop` branch and no PR preview deployments.

- **Rationale:** For a solo-developer project in Phase 1, running the full test suite twice — once locally and once again in CI — duplicates 3–5 minutes of feedback time per PR for near-zero marginal safety. The developer is going to run checks before pushing regardless; the question is whether CI should repeat what the developer already ran. Pre-push hooks enforce the fast subset (typecheck, lint, build, Jest) that doesn't depend on external state. The slower checks (Playwright, Maestro, gen:types drift) need external state that isn't reliably present on every push, so forcing them into the hook would make the hook fragile and drive the developer toward `--no-verify`. Instead, they remain as a documented pre-PR checklist, enforced by developer discipline rather than automation. The CI `verify` job catches the narrow slice of issues that could slip through (primarily: a developer committing with `--no-verify` and forgetting to re-run checks). Production EAS Builds are ceremonial rather than automatic because (a) the free-tier 30-builds/month cap makes per-push builds irresponsible, (b) cutting an app-store-ready build is a release event, not a side effect of merging a PR, and (c) the 20–40 minute EAS free-tier queue times make automatic triggers frustrating.

- **Consequences:**
  - The pre-push hook enforces only what `turbo run` can handle via the affected-package filter: typecheck, lint, build, Jest. Plus a repo-wide `format:check`. It does **not** enforce Playwright, Maestro, or `gen:types` drift — those rely on developer discipline via the pre-PR checklist in `CLAUDE.md`.
  - A developer who runs `git push --no-verify` without re-running checks, or who skips the pre-PR checklist, can push code that fails Jest, Playwright, Maestro, or `gen:types` drift. The CI `verify` job will _not_ catch any of these — only typecheck/lint/format/build run in CI. The social contract is that `--no-verify` and skipping the checklist are conscious acts for emergencies and WIP, not routine.
  - Phase 1 Acceptance Criteria AC-D7 is reworded to reflect this split. Jest failures block push via the pre-push hook. Playwright/Maestro/gen:types drift block _opening a PR_ via the manual checklist, not push. Typecheck/lint/format/build are the only things that also block merge in CI.
  - When the team grows beyond one developer, this ADR should be revisited. The "trust the hook + trust the checklist" model scales poorly beyond ~3 contributors because each new machine is a new opportunity for hook installation to fail silently and each new contributor is a new chance to skip the checklist.
  - `deploy-web.yml` and `eas-build.yml` as separate workflow files are deleted. Vercel deploy concerns fold into `ci.yml`; EAS Build is removed from CI entirely.
  - There is no `develop` branch and no `preview-*` tag triggers. EAS preview builds are invoked manually with `eas build --profile preview --non-interactive` when a preview is actually needed.
  - Pre-push hooks add ~15–90 seconds to every `git push` depending on what changed, dropping further on cache hits via Turbo remote cache.
  - Migrations are forward-only and additive in Phase 1: no column drops, type changes, or data rewrites. Destructive changes require a two-PR dance (add new thing, deploy, backfill → drop old thing in a follow-up). Reason: `supabase db push` is forward-only; staging rollback means restoring from daily backup, which the free tier provides.

- **Status:** Approved
- **Amends:** ADR-022 (Mobile Distribution & CI), ADR-023 (Web Deployment Strategy)
```

### 7.1 Required updates to ADR-022 and ADR-023

Update the Status line of each:

- **ADR-022 — Mobile Distribution & CI:** change `**Status**: Approved` → `**Status**: Approved (Amended by ADR-026 — EAS Build is now manual, not branch-triggered)`
- **ADR-023 — Web Deployment Strategy:** change `**Status**: Approved` → `**Status**: Approved (Amended by ADR-026 — deploys fold into ci.yml; PR previews are out of scope for Phase 1)`

The core decisions of ADR-022 and ADR-023 remain valid; only the trigger mechanisms are amended.

---

## 8. `PHASE1_SCOPE.md` updates

### 8.1 §2 D7 — replace the "Includes:" bullet list

```markdown
### D7 — CI/CD Pipeline

Local-first quality gates with minimal CI for deploys only. See ADR-026.

Includes:

- **`ci.yml`**: one workflow, three jobs.
  - `verify` runs on every PR and push to `main`. Typecheck, lint, format:check, build (~90s). Required status check on `main`.
  - `migrate-staging` runs on push to `main` only. Runs `supabase db push --dry-run` then `supabase db push` against staging. Needs `verify`.
  - `deploy-production` runs on push to `main` only. Vercel CLI deploy to production. Needs `migrate-staging`.
- **No separate `deploy-web.yml` or `eas-build.yml`** — both deleted. Production mobile builds are manual, invoked via `eas build --profile production --non-interactive` from the developer's machine.
- **Local pre-commit + pre-push hooks** (husky v9 + lint-staged): commit-time runs eslint + prettier on staged files; push-time runs `pnpm exec turbo run typecheck lint build test --filter="...[origin/main]"`.
- **No `develop` branch and no PR preview deployments.** Preview EAS builds are also manual.
- **Turbo remote cache** enabled via `TURBO_TOKEN` / `TURBO_TEAM` — keeps CI builds fast and matches local cache behavior.
- Vercel auto-deploy disabled in project settings (per ADR-023); all Vercel deploys triggered explicitly by `ci.yml`.
- All secrets stored in the correct store per type:
  - **GitHub Actions secrets** for CI operations: Vercel token + IDs, Supabase access token + DB password, Turbo cache credentials.
  - **EAS Secrets** for mobile runtime: Supabase URL, Supabase anon key (`SENTRY_DSN` deferred to D8).
  - **Supabase Edge Function secrets** for the `send-invitation` function: `RESEND_API_KEY` remains in place (pre-existing). D7 does not add any new Edge Function secrets — the Edge Function reads `acceptUrl` from its request body, not from env.
- **Migration policy (Phase 1):** additive changes only. See ADR-026 for the two-PR dance pattern for destructive changes.
- **Branch protection on `main`:** strict (PR required, `Verify` status check required, linear history, force-push blocked). "Include administrators" Off.
```

### 8.2 §4 — replace AC-D7 entirely

```markdown
### AC-D7: CI/CD Pipeline

**Per-commit gates (enforced by `.husky/pre-commit` + `lint-staged`):**

- [ ] Committing unformatted or lint-failing code auto-fixes what it can and aborts on unfixable issues.

**Per-push gates (enforced by `.husky/pre-push`):**

- [ ] Pushing code with a typecheck error is blocked by the pre-push hook.
- [ ] Pushing code with an ESLint error is blocked.
- [ ] Pushing code with a format drift is blocked.
- [ ] Pushing code with a broken `pnpm build` is blocked.
- [ ] Pushing code with a failing Jest test is blocked.
- [ ] `git push --no-verify` bypasses the hook (intentional escape hatch — verify it works).

**Before-opening-a-PR manual checklist (documented in `CLAUDE.md`, not automated):**

- [ ] `cd apps/web && pnpm test:e2e` — Playwright E2E tests pass (requires local Supabase running with seed data + Next.js dev server).
- [ ] `pnpm gen:types && git diff --exit-code packages/database-types/src/types.ts` — generated types match the committed file (requires local Supabase running). Run whenever `supabase/migrations/` has changed.
- [ ] `maestro test maestro/auth/ && maestro test maestro/workout/` — mobile E2E flows pass on a running simulator or device. Required only when mobile-relevant code changed.

**CI quality gates (enforced by `verify` job in `ci.yml`):**

- [ ] A PR with a TypeScript error blocks merge (`Verify` status check fails).
- [ ] A PR with an ESLint error blocks merge.
- [ ] A PR with a format drift blocks merge.
- [ ] A PR with a broken build blocks merge.

**CI deploy pipeline:**

- [ ] Merging a passing PR to `main` runs `supabase db push --dry-run` then `supabase db push` against staging.
- [ ] After successful migration, Vercel production deploy runs automatically.
- [ ] The deployed web app is accessible at `https://fitsync.vercel.app`.
- [ ] A merged PR with an invalid migration fails the `migrate-staging` job and blocks the production deploy (`deploy-production` does not run).

**Manual mobile build pipeline:**

- [ ] `cd apps/mobile && eas build --profile preview --non-interactive` from local produces a working internal-distribution Android APK.
- [ ] `cd apps/mobile && eas build --profile production --non-interactive` from local produces a working store-submission build.
```

### 8.3 §5 Task Breakdown — update T16

T4 was the early CI skeleton (already shipped). Update T16's text:

```
T16 CI pipeline — single ci.yml (verify + migrate-staging + deploy-production),
    husky pre-commit + pre-push hooks, branch protection. Local-first model
    per ADR-026. (D7 complete.)
```

Remove the part about "add Jest + Playwright + EAS + Vercel deploy" — Jest runs via the pre-push hook, Playwright runs via the pre-PR manual checklist, EAS is manual, and Vercel deploy is folded into `ci.yml`.

---

## 9. `CLAUDE.md` updates

Add the following sections (additive only — no changes to existing content):

````markdown
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
````

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

```

---

## 10. `ARCHITECTURE.md` updates

- **§3.x (CI/CD section):** add a one-paragraph note pointing to ADR-026 for the rationale behind the minimal-CI design. Do not duplicate the ADR text — just a pointer so readers landing in §3 understand why `ci.yml` looks the way it does.
- **§4 ADR list:** add ADR-026 between ADR-025 and the next decision (or at the end of the section).
- **§4 ADR-022:** update Status line to reference amendment by ADR-026.
- **§4 ADR-023:** update Status line to reference amendment by ADR-026.

---

## 11. `AGENTS.md`

**Not modified.** `AGENTS.md` is owned by another AI assistant on this project and is off-limits to edits from this design.

---

## 12. Files inventory

### 12.1 New files

- `.husky/pre-commit`
- `.husky/pre-push`
- `docs/superpowers/specs/2026-04-08-d7-cicd-pipeline-design.md` (this file)

### 12.2 Modified files

- `.github/workflows/ci.yml` — substantially rewritten with the new three-job structure
- `package.json` (root) — adds `husky` and `lint-staged` to devDependencies; adds `prepare` script; adds `lint-staged` config block
- `pnpm-lock.yaml` — updated by `pnpm install`
- `.gitignore` — adds `.husky/_/`, `.vercel/`, `.turbo/cache/`, `.turbo/daemon/` (verify which already exist before editing)
- `PHASE1_SCOPE.md` — §2 D7 section, §4 AC-D7 checklist, §5 task breakdown T16
- `ARCHITECTURE.md` — new ADR-026 in §4; status updates on ADR-022 and ADR-023; brief note in §3.x
- `CLAUDE.md` — new sections per §9 above

### 12.3 Deleted files

- `.github/workflows/deploy-web.yml`
- `.github/workflows/eas-build.yml`

### 12.4 Files explicitly NOT modified

- `AGENTS.md` (off-limits)

---

## 13. Implementation order

The order matters because of the staging migration first-run risk. Do not deviate without a reason.

1. **PR1 — Code only, deploys disabled:**
   - Add husky + lint-staged
   - Write `.husky/pre-commit`, `.husky/pre-push`
   - Update root `package.json`
   - Write the new `ci.yml` with `if: false` temporarily on `migrate-staging` and `deploy-production`
   - Delete `deploy-web.yml`, `eas-build.yml`
   - Update `.gitignore`
   - Update `PHASE1_SCOPE.md`, `ARCHITECTURE.md`, `CLAUDE.md`
   - Open PR. `verify` job runs in CI. Merge once green.

2. **Phase A provisioning (in parallel with PR1 review or after merge):**
   - Vercel project + env vars + capture IDs/token
   - Supabase access token + DB password
   - `eas init` + EAS Secrets
   - Turbo `login` + `link` + capture token

3. **Phase B GitHub config (after PR1 merges):**
   - Create GitHub Environments (`staging`, `production` with `main`-only deployment branch restriction)
   - Add repository variables
   - Add repository secrets

4. **Phase C pre-flight (after Phase B):**
   - `supabase link` + `supabase migration list --linked` locally
   - Verify zero drift between local and staging migration state
   - Resolve any drift before proceeding

5. **PR2 — Enable deploys:**
   - Remove `if: false` overrides from `migrate-staging` and `deploy-production`
   - Open PR, merge once `verify` is green
   - Watch the first real run of `migrate-staging` and `deploy-production`
   - Verify deployed web app loads at `https://fitsync.vercel.app`

6. **Phase D lock-down:**
   - Enable branch protection on `main` with `Verify` as the required status check
   - Walk the AC-D7 checklist end-to-end, ticking each item
   - Tag the commit if desired

---

## 14. Risks flagged during design (with mitigations)

These were surfaced during brainstorming and are captured here so they don't get lost. Each is either mitigated by a step in the design or accepted as a known trade-off.

| # | Risk | Mitigation |
|---|---|---|
| 1 | First-run `db push` could fail if staging migration state diverges from repo | Phase C pre-flight check (§4 Phase C2) — required before deploys are enabled |
| 2 | `supabase db push` is forward-only; bad migration breaks staging with no rollback | Additive-only migration policy (§7, §9); `--dry-run` step before real push (§5 ci.yml) |
| 3 | PR with a migration would have a broken preview deploy | N/A — PR previews are not in D7 scope; no broken-preview pathway exists |
| 4 | Cross-workflow CI-wait race condition | Eliminated by folding deploy jobs into `ci.yml` with `needs:` |
| 5 | EAS free-tier quota burn from per-push builds | Eliminated by making EAS builds manual |
| 6 | Pre-commit hook would be too slow → developers bypass it | Mitigated by lint-staged (commit-time, ~5s) + pre-push for full checks (turbo affected-package filter + Turbo remote cache → ~15–90s) |
| 7 | Pre-push hook bypassed via `--no-verify` lets bad code through | CI `verify` job is the safety net for typecheck/lint/format/build. Jest failures also escape into CI. Playwright/Maestro/gen:types drift are not in the hook at all (§6.4) — they rely on the pre-PR checklist in `CLAUDE.md`. Accepted trade-off for solo-dev model. ADR-026 documents this. |
| 8 | Pre-PR manual checklist skipped → Playwright/Maestro/gen:types drift regressions reach `main` | Accepted — no automation can catch this. Mitigations: (a) checklist lives in `CLAUDE.md` where it's surfaced to the AI assistant each session, (b) `gen:types` drift check also runs in pre-commit CLAUDE.md reminder when migrations change, (c) the developer is the single accountable reviewer. Revisit if the failure mode ever hits production. |
| 9 | Vercel CLI / Supabase CLI version drift between local and CI causes false-positive failures | Both pinned via `env:` block in `ci.yml` |
| 10 | Concurrent pushes to `main` race in `migrate-staging` and `deploy-production` | Concurrency group with `cancel-in-progress: false` on push events |
| 11 | Branch protection required check matches by job name string; rename breaks it silently | Comment in `ci.yml` next to the `verify` job + note in CLAUDE.md (§9) |
| 12 | `eas init` may overwrite `app.config.ts` env-var pattern with literal project ID | Phase A3 step explicitly checks `git diff` after `eas init` and reverts if needed |
| 13 | `APP_URL` chicken-and-egg on first deploy | Reserve Vercel project name `fitsync` up front so `APP_URL=https://fitsync.vercel.app` is deterministic from day one |
| 14 | GitHub Environments not created → workflow fails | Phase B1 creates them before PR2 enables deploy jobs |
| 15 | Production environment could be claimed by a non-`main` branch | Phase B1: set `production` environment to allow only `main` as deployment branch |
| 16 | Vercel monorepo build command pattern is fragile | Phase A1.4 explicitly notes to verify auto-detection first and fall back to `cd ../..` only if needed |
| 17 | `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` must be exported as env vars in the `deploy-production` job — otherwise the CLI cannot resolve the project on a clean runner | Handled in §5 `ci.yml` via the job-level `env:` block |
| 18 | `VERCEL_TOKEN` is account-scoped on Hobby plan (broad blast radius) | Accepted hygiene risk — rotate every 90 days. Note in ADR-026. |
| 19 | Documentation drift between CLAUDE.md and other docs | CLAUDE.md only contains terse pointers; canonical detailed text lives in this spec file and ADR-026 |
| 20 | Turbo remote cache requires `turbo link` locally first → other developers may forget | Documented in §4 Phase A4. For solo dev not an issue; revisit when team grows. |

---

## 15. Out of scope / explicitly deferred

- **PR preview deploys** (Vercel preview environments per PR) — out of D7. Not in original AC-D7. Adds setup complexity for marginal solo-dev value.
- **EAS Build automation** — moved to manual per ADR-026.
- **Sentry source map upload in CI builds** — D8 scope.
- **Sentry DSN as a GitHub secret** — D8 scope.
- **Maestro Android in CI** — local-only per Q4 decision and ADR-025.
- **`develop` branch / GitFlow** — not adopted.
- **`preview-*` tag triggers** — not adopted.
- **Slack/email failure notifications beyond GitHub default** — not adopted (Q9).
- **Turbo remote cache eviction policy** — Vercel manages this; not configured by us.
- **Custom domain for the web app** — Phase 2 (when going public). Vercel subdomain is fine for Phase 1.
- **Real production Supabase project** (separate from staging) — Phase 2. All Vercel deploys point at staging in Phase 1 per `PHASE1_SCOPE.md` §6.

---

## 16. Open questions

None. All decisions are locked at the end of this design phase. The next step is the implementation plan, produced via the `superpowers:writing-plans` skill.

---

## 17. Approval and sign-off

- **Designed by:** Conrado Negro + Claude (interactive brainstorming session, 2026-04-08)
- **Skill used:** `superpowers:brainstorming`
- **Next skill:** `superpowers:writing-plans`
- **Status:** Awaiting user review of this spec file before plan generation begins.
```
