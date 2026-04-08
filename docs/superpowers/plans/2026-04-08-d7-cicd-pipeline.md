# D7 CI/CD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the D7 CI/CD pipeline end-to-end: minimal CI that gates PRs with typecheck/lint/format/build, husky git hooks that enforce the fast quality-gate subset locally, a "before opening a PR" manual checklist for the heavy checks (Playwright/Maestro/gen:types drift), a `migrate-staging → deploy-production` deploy pipeline folded into the same workflow, and branch protection on `main`.

**Architecture:** Single `.github/workflows/ci.yml` file with three jobs (`verify`, `migrate-staging`, `deploy-production`). `.husky/pre-commit` runs `lint-staged` on staged files; `.husky/pre-push` runs turbo-filtered typecheck/lint/build/test + repo-wide format:check. EAS mobile builds are manual (`eas build` from the developer's machine). Preview web deploys are not in scope. Documentation updates cover `PHASE1_SCOPE.md`, `ARCHITECTURE.md` (new ADR-026 amending ADR-022/023), and `CLAUDE.md`.

**Tech Stack:** GitHub Actions, husky v9, lint-staged, turbo 2, pnpm 10, Vercel CLI, Supabase CLI, eslint, prettier.

**Canonical spec:** `docs/superpowers/specs/2026-04-08-d7-cicd-pipeline-design.md`. The spec is the source of truth for design rationale; this plan is the source of truth for implementation steps. When in doubt, consult the spec.

**Staged rollout:** This plan lands in two PRs per spec §13 — PR1 (Part A of this plan) adds all code changes with deploys disabled via `if: false`, PR2 (Part E) removes the overrides and enables deploys. Between them, Parts B–D cover the manual provisioning and pre-flight work that must happen before PR2 is safe to merge.

---

## Table of Contents

- [Part A — PR1: Code changes, deploys disabled](#part-a--pr1-code-changes-deploys-disabled)
- [Part B — External provisioning (manual, per spec §4 Phase A)](#part-b--external-provisioning-manual-per-spec-4-phase-a)
- [Part C — GitHub configuration (manual, per spec §4 Phase B)](#part-c--github-configuration-manual-per-spec-4-phase-b)
- [Part D — Pre-flight migration state check (per spec §4 Phase C)](#part-d--pre-flight-migration-state-check-per-spec-4-phase-c)
- [Part E — PR2: Enable deploys](#part-e--pr2-enable-deploys)
- [Part F — Lock-down (per spec §4 Phase D)](#part-f--lock-down-per-spec-4-phase-d)

---

## Part A — PR1: Code changes, deploys disabled

PR1 is a pure code PR. It lands all the files, but the `migrate-staging` and `deploy-production` jobs are gated by `if: false` so they never actually run. Once PR1 merges, the `Verify` status check will be observable, which we need before enabling branch protection in Part F.

### Task A1: Look up pinned CLI versions and record them

**Files:** No files modified yet — this task captures values you'll paste into `ci.yml` in Task A6.

**Context:** The spec (§5) uses `<TBD>` placeholders for `SUPABASE_CLI_VERSION` and `VERCEL_CLI_VERSION`. These must be real pinned versions before committing. This task runs the version-discovery commands and saves the results.

- [ ] **Step 1: Check the installed Supabase CLI version**

Run:
```bash
supabase --version
```

Expected: a version string like `2.20.5` or similar. If the CLI is not installed, install it with `brew install supabase/tap/supabase` (macOS) or see https://supabase.com/docs/guides/cli/getting-started. **Write down the output** — you will paste it into `ci.yml` in Task A6.

- [ ] **Step 2: Check the installed Vercel CLI version**

Run:
```bash
vercel --version
```

Expected: a version string like `39.1.2` or similar. If the CLI is not installed, you can skip this and install it later (the deploy-production job installs its own pinned version); but you still need the version number. Run `pnpm dlx vercel@latest --version` to get the latest version without installing it globally. **Write down the output.**

- [ ] **Step 3: Record both versions in your plan notes**

You'll substitute these two values into the `env:` block of `ci.yml` in Task A6. Keep them handy. Do NOT commit anything yet.

---

### Task A2: Add husky and lint-staged dev dependencies

**Files:**
- Modify: `package.json` (root)
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add husky and lint-staged to root devDependencies**

Run at the repo root:
```bash
pnpm add -Dw husky lint-staged
```

Expected output: pnpm resolves, downloads, and adds both packages. `package.json` shows new lines under `devDependencies`.

- [ ] **Step 2: Verify the new entries**

Open `package.json` and confirm the `devDependencies` block now includes `husky` and `lint-staged` with real version numbers (e.g. `"husky": "^9.x.x"`, `"lint-staged": "^15.x.x"`).

- [ ] **Step 3: Set the `prepare` script so `pnpm install` wires up husky automatically**

Run:
```bash
pnpm pkg set scripts.prepare="husky"
```

Then open `package.json` and confirm `"scripts"` now contains `"prepare": "husky"`.

- [ ] **Step 4: Re-run pnpm install to trigger the prepare script**

Run:
```bash
pnpm install
```

Expected: pnpm runs, the `prepare` script fires, and `.husky/_/` is created with auto-generated husky helpers. Do not commit yet — we're still adding files.

- [ ] **Step 5: Verify `.husky/_/` exists**

Run:
```bash
ls -la .husky/
```

Expected: a `_` subdirectory appears. The `.husky/` directory itself exists but has no `pre-commit` or `pre-push` files yet — those are added in Tasks A3 and A4.

---

### Task A3: Create `.husky/pre-commit`

**Files:**
- Create: `.husky/pre-commit`

- [ ] **Step 1: Write the pre-commit hook**

Create `.husky/pre-commit` with exactly this content:

```sh
#!/usr/bin/env sh
pnpm exec lint-staged
```

- [ ] **Step 2: Make the hook executable**

Run:
```bash
chmod +x .husky/pre-commit
```

(Husky v9 typically handles this automatically, but setting it explicitly is harmless and avoids surprises on systems where it doesn't.)

- [ ] **Step 3: Verify the file exists and is executable**

Run:
```bash
ls -la .husky/pre-commit
```

Expected: file exists, has execute permissions (`-rwxr-xr-x` or similar).

---

### Task A4: Create `.husky/pre-push`

**Files:**
- Create: `.husky/pre-push`

- [ ] **Step 1: Write the pre-push hook**

Create `.husky/pre-push` with exactly this content:

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

- [ ] **Step 2: Make the hook executable**

Run:
```bash
chmod +x .husky/pre-push
```

- [ ] **Step 3: Verify the file exists and is executable**

Run:
```bash
ls -la .husky/pre-push
```

Expected: file exists, has execute permissions.

---

### Task A5: Add lint-staged config to root `package.json`

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Read the current `package.json` to find the right place to insert**

Open `package.json`. The file currently has top-level keys: `name`, `version`, `private`, `packageManager`, `engines`, `scripts`, `devDependencies`, `pnpm`. Add a new top-level `lint-staged` key between `devDependencies` and `pnpm`.

- [ ] **Step 2: Add the `lint-staged` block**

Insert this block as a new top-level key in `package.json` (between `devDependencies` and `pnpm`):

```json
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,yaml,yml,css}": [
      "prettier --write"
    ]
  },
```

(Note the trailing comma — JSON requires it since `pnpm` follows.)

- [ ] **Step 3: Verify the JSON is still valid**

Run:
```bash
pnpm pkg get lint-staged
```

Expected: a JSON object that echoes the config you just added. If this command errors, the JSON is malformed — open the file and fix the trailing comma or brace.

---

### Task A6: Rewrite `.github/workflows/ci.yml` with the full three-job workflow

**Files:**
- Modify: `.github/workflows/ci.yml` (full rewrite)

This is the largest single change in the plan. The new file replaces the existing typecheck-and-lint-only skeleton with the full three-job workflow from spec §5.

**Important:** The `migrate-staging` and `deploy-production` jobs have `if: false && ...` as a temporary override. This keeps them defined (so YAML lints cleanly and the diff shows the final shape) but prevents them from running during PR1. Part E (PR2) removes the `false &&` prefix.

- [ ] **Step 1: Substitute the CLI version numbers you recorded in Task A1**

In the YAML below, find the lines:
```yaml
  SUPABASE_CLI_VERSION: '<REPLACE-WITH-SUPABASE-CLI-VERSION>'
  VERCEL_CLI_VERSION: '<REPLACE-WITH-VERCEL-CLI-VERSION>'
```
and replace both placeholders with the real values from Task A1 before writing the file. Example:
```yaml
  SUPABASE_CLI_VERSION: '2.20.5'
  VERCEL_CLI_VERSION: '39.1.2'
```

- [ ] **Step 2: Write the file**

Overwrite `.github/workflows/ci.yml` with this exact content (after substituting the version numbers from Step 1):

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
  SUPABASE_CLI_VERSION: '<REPLACE-WITH-SUPABASE-CLI-VERSION>'
  VERCEL_CLI_VERSION: '<REPLACE-WITH-VERCEL-CLI-VERSION>'

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
  #
  # TEMPORARY: `if: false && ...` is a PR1 safety gate.
  # Part E of the implementation plan removes `false &&`
  # after manual provisioning and pre-flight are complete.
  # ────────────────────────────────────────────────────
  migrate-staging:
    name: Migrate Staging
    needs: [verify]
    if: false && github.event_name == 'push' && github.ref == 'refs/heads/main'
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
  #
  # TEMPORARY: `if: false && ...` is a PR1 safety gate.
  # Part E of the implementation plan removes `false &&`
  # after manual provisioning and pre-flight are complete.
  # ────────────────────────────────────────────────────
  deploy-production:
    name: Deploy Production
    needs: [migrate-staging]
    if: false && github.event_name == 'push' && github.ref == 'refs/heads/main'
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

- [ ] **Step 3: Verify the YAML actually parses**

Run this single deterministic parse — it reads `.github/workflows/ci.yml` into a YAML loader and fails the task if anything is malformed:

```bash
python3 - <<'PY'
import sys
try:
    import yaml
except ImportError:
    print("ERROR: PyYAML not installed. Install with: pip3 install PyYAML", file=sys.stderr)
    sys.exit(1)

try:
    with open('.github/workflows/ci.yml') as f:
        yaml.safe_load(f)
    print('ci.yml parses OK')
except yaml.YAMLError as e:
    print(f'ERROR: ci.yml has YAML errors:\n{e}', file=sys.stderr)
    sys.exit(1)
except FileNotFoundError:
    print('ERROR: .github/workflows/ci.yml not found', file=sys.stderr)
    sys.exit(1)
PY
```

Expected: the single line `ci.yml parses OK` on stdout with exit code 0. If PyYAML is not installed, you get a clear install instruction — run `pip3 install PyYAML` and retry. If the file has YAML errors, you get the exact error message and line number — fix and retry. Do NOT proceed to Step 4 until you see `ci.yml parses OK`.

- [ ] **Step 4: Confirm you substituted the CLI versions**

Run:
```bash
grep -n "REPLACE-WITH" .github/workflows/ci.yml
```

Expected: **no output** (zero matches). If anything prints, you forgot to substitute one of the placeholders from Step 1. Fix it and re-check.

---

### Task A7: Delete `deploy-web.yml` and `eas-build.yml`

**Files:**
- Delete: `.github/workflows/deploy-web.yml`
- Delete: `.github/workflows/eas-build.yml`

- [ ] **Step 1: Delete both files**

Run:
```bash
rm .github/workflows/deploy-web.yml
rm .github/workflows/eas-build.yml
```

- [ ] **Step 2: Verify only `ci.yml` remains**

Run:
```bash
ls .github/workflows/
```

Expected output: exactly `ci.yml` and nothing else.

---

### Task A8: Update `.gitignore`

**Files:**
- Modify: `.gitignore`

**Context:** `.turbo/` is already gitignored wholesale — no sub-path additions needed for turbo. Two new ignores are required: `.vercel/` (per-dev Vercel project binding, contains project IDs that should stay local) and `.husky/_/` (husky v9 auto-generated helper directory).

- [ ] **Step 1: Add the two new entries**

Edit `.gitignore` to append these lines after the existing "Turbo" section (or anywhere sensible — grouping matters less than presence). Find the block that currently reads:

```
# Turbo
.turbo/
```

Immediately after that block, add:

```

# Vercel (project binding — per-developer, never commit)
.vercel/

# Husky v9 auto-generated helpers (hooks live in .husky/ but the _/ subdir is generated)
.husky/_/
```

- [ ] **Step 2: Verify the new entries are in the file**

Run:
```bash
grep -n "^.vercel/$\|^.husky/_/$" .gitignore
```

Expected output: two lines, each matching one of the new entries.

---

### Task A9: Update `PHASE1_SCOPE.md`

**Files:**
- Modify: `PHASE1_SCOPE.md` (§2 D7 "Includes" block, §4 AC-D7 checklist, §5 T16 task description)

**Context:** Spec §8 contains the exact replacement text. This task applies those replacements.

- [ ] **Step 1: Replace the §2 D7 "Includes" block**

Open `PHASE1_SCOPE.md` and find the `### D7 — CI/CD Pipeline` section. The existing "Includes:" bullet list begins with items like `- **ci.yml**: triggered on every PR...` and ends before `### D8 — Observability Baseline`. Replace the entire "Includes:" block (and the line right before it that says "Fully automated pipeline from PR to production.") with the block from spec §8.1.

The replacement should result in §2 D7 looking like this:

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

- [ ] **Step 2: Replace the §4 AC-D7 checklist**

Find `### AC-D7: CI/CD Pipeline` in §4 and replace the entire existing checklist (8 items beginning with "A PR with a TypeScript error blocks merge.") with:

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

- [ ] **Step 3: Update the §5 Task Breakdown T16 entry**

Find the `T16` line in §5 (in the "TRACK D — Quality" section) and replace it with:

```
T16 CI pipeline — single ci.yml (verify + migrate-staging + deploy-production),
    husky pre-commit + pre-push hooks, branch protection. Local-first model
    per ADR-026. (D7 complete.)
```

- [ ] **Step 4: Verify the file still reads cleanly**

Open `PHASE1_SCOPE.md` and skim the D7 section plus AC-D7. Confirm no stray markdown artifacts (mismatched code fences, orphaned list items). No command to run — eyes-on only.

---

### Task A10: Update `ARCHITECTURE.md` (add ADR-026, amend ADR-022 and ADR-023)

**Files:**
- Modify: `ARCHITECTURE.md`

- [ ] **Step 1: Amend ADR-022 Status line**

Find `### ADR-022 — Mobile Distribution & CI` (around line 473). Its Status line currently reads `**Status**: Approved`. Replace it with:

```markdown
- **Status**: Approved (Amended by ADR-026 — EAS Build is now manual, not branch-triggered)
```

- [ ] **Step 2: Amend ADR-023 Status line**

Find `### ADR-023 — Web Deployment Strategy` (around line 482). Replace its Status line with:

```markdown
- **Status**: Approved (Amended by ADR-026 — deploys fold into ci.yml; PR previews are out of scope for Phase 1)
```

- [ ] **Step 3: Append ADR-026 after ADR-025**

Find the end of `### ADR-025 — Maestro Mobile E2E Testing` (around line 500). After its Status line and before the next section (`## 6. Folder Structure` or similar), insert:

```markdown
---

### ADR-026 — Local-First Quality Gates, CI for Deploys Only

- **Decision:** Quality gates are split across three enforcement tiers:
  1. **Per-commit (fast):** `lint-staged` via `.husky/pre-commit` runs eslint + prettier on staged files only (~5s).
  2. **Per-push (medium):** `.husky/pre-push` runs `pnpm exec turbo run typecheck lint build test --filter="...[origin/main]"` followed by `pnpm format:check` — covers typecheck, lint, build, Jest unit tests, and repo-wide format check for packages affected by the current diff against `origin/main` (~15–90s). Turbo remote cache keeps cache-hit packages near-free.
  3. **Manual "before opening a PR" (developer discipline):** Playwright E2E (`cd apps/web && pnpm test:e2e`), `gen:types` drift (`pnpm gen:types && git diff --exit-code packages/database-types/src/types.ts`), and Maestro mobile E2E (`maestro test maestro/...`) are run manually when the developer is ready to open a PR. These are *not* in the pre-push hook because each requires external state (local Supabase running, simulator or device, a Next.js dev server) that isn't reliably present on every `git push`. Documented as a "Before opening a PR" checklist in `CLAUDE.md`.

  GitHub Actions CI runs a minimal `verify` job (typecheck + lint + format:check + build, ~90 seconds) as a safety net against hook bypasses, plus the deploy pipeline on push to `main` (`migrate-staging` → `deploy-production`). Production EAS Builds are invoked manually from the developer's machine — no CI trigger. There is no `develop` branch and no PR preview deployments.

- **Rationale:** For a solo-developer project in Phase 1, running the full test suite twice — once locally and once again in CI — duplicates 3–5 minutes of feedback time per PR for near-zero marginal safety. The developer is going to run checks before pushing regardless; the question is whether CI should repeat what the developer already ran. Pre-push hooks enforce the fast subset (typecheck, lint, build, Jest) that doesn't depend on external state. The slower checks (Playwright, Maestro, gen:types drift) need external state that isn't reliably present on every push, so forcing them into the hook would make the hook fragile and drive the developer toward `--no-verify`. Instead, they remain as a documented pre-PR checklist, enforced by developer discipline rather than automation. The CI `verify` job catches the narrow slice of issues that could slip through (primarily: a developer committing with `--no-verify` and forgetting to re-run checks). Production EAS Builds are ceremonial rather than automatic because (a) the free-tier 30-builds/month cap makes per-push builds irresponsible, (b) cutting an app-store-ready build is a release event, not a side effect of merging a PR, and (c) the 20–40 minute EAS free-tier queue times make automatic triggers frustrating.

- **Consequences:**
  - The pre-push hook enforces only what `turbo run` can handle via the affected-package filter: typecheck, lint, build, Jest. Plus a repo-wide `format:check`. It does **not** enforce Playwright, Maestro, or `gen:types` drift — those rely on developer discipline via the pre-PR checklist in `CLAUDE.md`.
  - A developer who runs `git push --no-verify` without re-running checks, or who skips the pre-PR checklist, can push code that fails Jest, Playwright, Maestro, or `gen:types` drift. The CI `verify` job will *not* catch any of these — only typecheck/lint/format/build run in CI. The social contract is that `--no-verify` and skipping the checklist are conscious acts for emergencies and WIP, not routine.
  - Phase 1 Acceptance Criteria AC-D7 is reworded to reflect this split. Jest failures block push via the pre-push hook. Playwright/Maestro/gen:types drift block *opening a PR* via the manual checklist, not push. Typecheck/lint/format/build are the only things that also block merge in CI.
  - When the team grows beyond one developer, this ADR should be revisited. The "trust the hook + trust the checklist" model scales poorly beyond ~3 contributors because each new machine is a new opportunity for hook installation to fail silently and each new contributor is a new chance to skip the checklist.
  - `deploy-web.yml` and `eas-build.yml` as separate workflow files are deleted. Vercel deploy concerns fold into `ci.yml`; EAS Build is removed from CI entirely.
  - There is no `develop` branch and no `preview-*` tag triggers. EAS preview builds are invoked manually with `eas build --profile preview --non-interactive` when a preview is actually needed.
  - Pre-push hooks add ~15–90 seconds to every `git push` depending on what changed, dropping further on cache hits via Turbo remote cache.
  - Migrations are forward-only and additive in Phase 1: no column drops, type changes, or data rewrites. Destructive changes require a two-PR dance (add new thing, deploy, backfill → drop old thing in a follow-up). Reason: `supabase db push` is forward-only; staging rollback means restoring from daily backup, which the free tier provides.

- **Status:** Approved
- **Amends:** ADR-022 (Mobile Distribution & CI), ADR-023 (Web Deployment Strategy)
```

- [ ] **Step 4: Update the Tech Stack table CI/CD row**

ARCHITECTURE.md has a Tech Stack & Tools table around line 274 with a CI/CD row that currently reads:

```
| CI/CD          | GitHub Actions                          | Typecheck + test on PR; EAS Build + Vercel deploy on merge                            |
```

The description is now stale (EAS Build is manual; deploy is folded into `ci.yml`). Replace that row with:

```
| CI/CD          | GitHub Actions                          | Single `ci.yml`: `verify` gates PRs, `migrate-staging` + `deploy-production` run on push to `main`. See ADR-026.     |
```

Also, update the Mobile Deploy row description to reflect the manual model. The current row reads:

```
| Mobile Deploy  | EAS Build + App Stores                  | Managed native builds, `development` / `preview` / `production` profiles              |
```

Replace with:

```
| Mobile Deploy  | EAS Build + App Stores                  | Managed native builds; `development` / `preview` / `production` profiles, all invoked manually (see ADR-026).        |
```

- [ ] **Step 5: Verify the ADR numbering is consistent**

Run:
```bash
grep -c "^### ADR-" ARCHITECTURE.md
```

Expected output: `26` (the count after adding ADR-026).

---

### Task A11: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (append new sections + update existing CI/CD section)

- [ ] **Step 1: Replace the existing `### CI/CD` section**

Find this block in `CLAUDE.md` (around lines 121–125):

```markdown
### CI/CD

- **`ci.yml`**: Typecheck + Lint + Format check on every PR
- **`deploy-web.yml`**: Vercel production deploy on merge to `main` (GitHub Actions controls all Vercel deploys — ADR-023)
- **`eas-build.yml`**: EAS preview build on `develop`, production build on `main` (builds only on merge, not PRs — ADR-022)
```

Replace it with:

```markdown
### CI/CD

Single workflow file: `.github/workflows/ci.yml`. Three jobs: `verify` (typecheck + lint + format + build — required status check on every PR and push to `main`), `migrate-staging` (runs `supabase db push` against staging on push to `main`), `deploy-production` (Vercel production deploy, needs `migrate-staging`). Production and preview EAS mobile builds are manual (`eas build --profile {production,preview}` from local). See ADR-026 for the full rationale.
```

- [ ] **Step 2: Append the new D7 sections at the bottom of `CLAUDE.md`**

Scroll to the end of `CLAUDE.md` (after the "Key Reference Docs" section). Append these sections, keeping the existing content above them intact:

```markdown

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
```

- [ ] **Step 3: Verify the file is still well-formed markdown**

Skim `CLAUDE.md` from top to bottom. Confirm no broken code fences, orphan headings, or accidentally-nested lists.

---

### Task A12: Run the full pre-commit checklist locally

**Files:** None modified — this task is the local verification gate before opening PR1.

- [ ] **Step 1: Run typecheck**

Run:
```bash
pnpm typecheck
```

Expected: zero TypeScript errors. If there are errors, fix them before continuing.

- [ ] **Step 2: Run lint**

Run:
```bash
pnpm lint
```

Expected: zero ESLint errors. Fix any before continuing.

- [ ] **Step 3: Run format check**

Run:
```bash
pnpm format:check
```

Expected: all files pass Prettier's check. If anything fails, run `pnpm format` to auto-fix, then re-run `pnpm format:check` to verify.

- [ ] **Step 4: Run build**

Run:
```bash
pnpm build
```

Expected: all packages build successfully. If anything fails, debug and fix before continuing.

- [ ] **Step 5: Run Jest unit tests**

Run:
```bash
pnpm test
```

Expected: all Jest suites pass (should be the same count as before — this task doesn't change any test-covered code).

- [ ] **Step 6: Verify the pre-commit hook actually runs by making a throwaway commit on a scratch file**

**⚠ Do not stage any real D7 file for this probe.** Staging a file that Task A11 already modified (like `CLAUDE.md`) and then rolling back would delete A11's work. We use a fresh file that doesn't exist in HEAD, so the rollback only touches the probe.

```bash
# Create a scratch file that does NOT exist anywhere in git history
echo "# scratch hook verification" > scratch-hook-verify.md

# Stage just the scratch file (do NOT use git add -A here)
git add scratch-hook-verify.md

# Commit — this is what fires the pre-commit hook
git commit -m "chore: verify pre-commit hook fires (rolled back immediately)"
```

Expected: during the commit, you see `pnpm exec lint-staged` output followed by prettier running against `scratch-hook-verify.md`. If you see no lint-staged output at all, the hook didn't fire — inspect `.husky/pre-commit` and confirm it exists, is executable (`ls -la .husky/pre-commit`), and that `pnpm pkg get scripts.prepare` returns `"husky"`.

- [ ] **Step 7: Roll back the scratch commit without touching any real file**

```bash
# Undo the commit (mixed reset — working tree keeps the scratch file as unstaged)
git reset HEAD~1

# Delete the scratch file from the working tree
rm scratch-hook-verify.md

# Verify: no scratch file, no commit, A11's real CLAUDE.md changes still present as unstaged
ls scratch-hook-verify.md 2>&1                   # expected: "No such file or directory"
git log -1 --oneline                             # expected: the spec commit, NOT the scratch commit
git diff --stat CLAUDE.md                        # expected: shows A11's CLAUDE.md changes still present
```

If `git diff --stat CLAUDE.md` shows no changes, something went wrong and A11's CLAUDE.md edits were lost. Re-do Task A11 before continuing.

- [ ] **Step 8: Verify the pre-push hook runs without actually pushing**

Run the pre-push hook script directly to confirm it executes:
```bash
sh .husky/pre-push
```

Expected: you see `turbo run` output (cache-hit or run-from-scratch for each package) followed by `pnpm format:check` output. All commands should succeed. If anything fails, that's a real pre-push failure — fix before opening the PR.

> **Note:** D7's changes only touch workflow and doc files, not any package source. Turbo's `--filter="...[origin/main]"` will determine "no packages affected" and run zero turbo tasks for this specific push — `pnpm format:check` will still run and cover the whole repo. That's the expected behavior for a CI-only PR; the hook mechanism works, it just has nothing to do in the turbo step.

---

### Task A13: Commit PR1 and open it against `main`

**Files:** Creates a commit and pushes.

- [ ] **Step 1: Review the working tree**

Run:
```bash
git status
```

Expected: modifications to `package.json`, `pnpm-lock.yaml`, `.gitignore`, `.github/workflows/ci.yml`, `PHASE1_SCOPE.md`, `ARCHITECTURE.md`, `CLAUDE.md`, and new files `.husky/pre-commit` + `.husky/pre-push`. Also deletions of `.github/workflows/deploy-web.yml` and `.github/workflows/eas-build.yml`.

- [ ] **Step 2: Stage everything D7-related**

Run:
```bash
git add package.json pnpm-lock.yaml .gitignore \
        .github/workflows/ci.yml \
        .husky/pre-commit .husky/pre-push \
        PHASE1_SCOPE.md ARCHITECTURE.md CLAUDE.md
git add -u .github/workflows/          # picks up the two deletions
git status
```

Expected: every D7-related file shows as staged. Nothing outside D7 scope should be staged.

- [ ] **Step 3: Commit**

Run:
```bash
git commit -m "$(cat <<'EOF'
feat(d7): minimal CI + husky hooks + local-first quality gates

Implements D7 per spec
docs/superpowers/specs/2026-04-08-d7-cicd-pipeline-design.md.

- ci.yml rewritten into one workflow with three jobs: verify (typecheck,
  lint, format:check, build — required status check), migrate-staging
  (supabase db push with dry-run preview), deploy-production (Vercel CLI
  deploy). migrate-staging and deploy-production are gated by `if: false`
  as a PR1 safety valve — removed in PR2 after manual provisioning and
  pre-flight are complete.
- husky v9 + lint-staged wired up via the prepare script. pre-commit runs
  lint-staged on staged files; pre-push runs turbo-filtered
  typecheck/lint/build/test + repo-wide format:check.
- deploy-web.yml and eas-build.yml deleted — folded into ci.yml or moved
  to manual invocation per ADR-026.
- Adds ADR-026 and amends ADR-022 / ADR-023 in ARCHITECTURE.md.
- PHASE1_SCOPE.md D7 includes, AC-D7, and T16 rewritten to reflect the
  local-first model.
- CLAUDE.md updated with migrations policy, local hooks scope, mobile
  build instructions, and the "Before opening a PR" manual checklist.
- .gitignore adds .vercel/ and .husky/_/ .

This commit lands the code only. External provisioning (Vercel, EAS,
GitHub Environments/Secrets, branch protection) follows in Parts B–D
of the implementation plan, and PR2 enables the deploy jobs.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push the branch**

Run:
```bash
git push -u origin feat/d7-cicd
```

Expected: the branch pushes cleanly. If GitHub asks about setting upstream, `-u` handles it.

- [ ] **Step 5: Open the PR**

Run:
```bash
gh pr create --title "feat(d7): minimal CI + husky hooks + local-first quality gates" --body "$(cat <<'EOF'
## Summary
- Single `ci.yml` workflow with three jobs: `verify` (typecheck/lint/format/build — required status check), `migrate-staging` (`supabase db push` with dry-run), `deploy-production` (Vercel CLI deploy). The latter two are gated by `if: false` as a PR1 safety valve; PR2 removes the override.
- husky v9 + lint-staged local hooks (`pre-commit` runs lint-staged; `pre-push` runs turbo-filtered typecheck/lint/build/test + repo-wide format:check).
- Deletes `deploy-web.yml` and `eas-build.yml` — folded into `ci.yml` (Vercel) or moved to manual (EAS).
- Adds ADR-026 and amends ADR-022 / ADR-023.
- Updates `PHASE1_SCOPE.md`, `CLAUDE.md` with the local-first model.
- Design spec: `docs/superpowers/specs/2026-04-08-d7-cicd-pipeline-design.md`

## Test plan
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test` all pass locally
- [ ] `.husky/pre-commit` fires on a test commit and runs lint-staged
- [ ] `.husky/pre-push` runs the turbo pipeline + format:check successfully
- [ ] CI `Verify` job runs green on this PR
- [ ] `migrate-staging` and `deploy-production` jobs are skipped (shown as "Skipped" in CI) due to `if: false`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Watch CI**

Run:
```bash
gh pr checks --watch
```

Expected: `Verify` runs green (~90 seconds). `Migrate Staging` and `Deploy Production` appear as skipped (not failing). If `Verify` fails, read the logs (`gh run view --log-failed`) and fix before proceeding.

- [ ] **Step 7: Merge PR1**

Once CI is green:
```bash
gh pr merge --squash --delete-branch
```

Expected: PR is merged via squash commit, feature branch deleted locally and remotely. Local `main` is now behind — pull the squash commit:

```bash
git checkout main
git pull origin main
```

---

## Part B — External provisioning (manual, per spec §4 Phase A)

These are browser-and-local-CLI tasks you execute yourself. Each references the exact Phase A sub-section in the spec for the detailed steps. This plan captures the order and the values you need to capture along the way.

**⚠ None of these tasks modify the repo.** They create external resources and capture credentials that will be added to GitHub in Part C.

### Task B1: Provision the Vercel project (spec §4 Phase A1)

- [ ] **Step 1: Execute spec §4 Phase A1 sub-steps 1–6** in your browser against vercel.com.

Follow the spec's exact guidance. Key constraints:
- Reserve the project name `fitsync` so the deployment URL is `https://fitsync.vercel.app`
- **Disable automatic deployments on push** in Project Settings → Git (ADR-023 requirement)
- Set all five environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_URL`) scoped to both **Production** and **Preview** environments

- [ ] **Step 2: Capture three values for Part C** (spec §4 Phase A1 step 7):
  - `VERCEL_TOKEN` — from Account Settings → Tokens → Create Token
  - `VERCEL_ORG_ID` — from team/account Settings → General → Team ID
  - `VERCEL_PROJECT_ID` — from the project's Settings → General → Project ID

Store these somewhere secure and temporary (a password manager or the OS keychain) — you'll paste them into GitHub in Part C.

### Task B2: Supabase credentials (spec §4 Phase A2)

- [ ] **Step 1: Generate a Supabase personal access token**

Visit `https://supabase.com/dashboard/account/tokens` → **Generate new token** → name it `fitsync-ci`. **Copy the token immediately** — it's only shown once. This is `SUPABASE_ACCESS_TOKEN`.

- [ ] **Step 2: Locate or reset the staging database password**

If you know the staging DB password, use it. If not, reset it via Supabase Dashboard → Project Settings → Database → **Reset database password**. Copy the new value. This is `SUPABASE_DB_PASSWORD`. Note: resetting rotates the password, so any local connections using the old value will need updating.

### Task B3: Initialize the EAS project (spec §4 Phase A3)

- [ ] **Step 1: Authenticate and initialize**

Run:
```bash
cd apps/mobile
eas login                   # opens browser if not already logged in
eas init                    # creates the EAS project
```

- [ ] **Step 2: Check for `app.config.ts` drift**

Run:
```bash
git diff apps/mobile/app.config.ts
```

**If the diff is empty:** `eas init` did not modify `app.config.ts`. Skip to Step 3.

**If the diff shows a change to `extra.eas.projectId`:** `eas init` replaced the line:
```ts
      projectId: process.env['EAS_PROJECT_ID'],
```
with a literal project ID string, e.g.:
```ts
      projectId: 'abc12345-6789-0def-ghij-klmnopqrstuv',
```

**Before reverting, capture the actual project ID from the diff** — you need it for the next step. Copy the literal UUID string from the new version of the line.

**Revert ONLY the `projectId` line, not the whole file.** Do NOT run `git checkout -- apps/mobile/app.config.ts` — that discards every local change in the file, which is unsafe if any other line was also modified. Instead, open `apps/mobile/app.config.ts` in your editor, find the line `eas init` rewrote (inside the `extra.eas` block), and change it back to:

```ts
      projectId: process.env['EAS_PROJECT_ID'],
```

Save the file.

- [ ] **Step 3 (only if the revert was needed): Put the captured project ID in `.env.local`**

Add or update this line in `apps/mobile/.env.local` (this file is gitignored):

```
EAS_PROJECT_ID=<paste-the-uuid-you-captured-above>
```

- [ ] **Step 4: Verify `app.config.ts` is clean and `.env.local` is not staged**

Run:
```bash
git diff apps/mobile/app.config.ts
git status apps/mobile/.env.local
```

Expected for `git diff`: **empty output** (the only change `eas init` made has been reverted). If the diff still shows other lines changed, **stop** — those are either pre-existing uncommitted changes you should investigate, or `eas init` touched more than just `projectId`. Resolve manually before continuing.

Expected for `git status`: the file appears as untracked or in "Ignored files" — never in "Changes to be committed" or "Changes not staged for commit."

- [ ] **Step 5: Create EAS Secrets used at build time**

Run:
```bash
eas secret:create --scope project --name SUPABASE_URL --value https://rjhzkgomgsztcyrhkywf.supabase.co
eas secret:create --scope project --name SUPABASE_ANON_KEY --value <staging-anon-key-from-supabase-dashboard>
```

Replace `<staging-anon-key-from-supabase-dashboard>` with the actual anon key value. `SENTRY_DSN` is deferred to D8.

- [ ] **Step 6: Verify the secrets are set**

Run:
```bash
eas secret:list
```

Expected: shows `SUPABASE_URL` and `SUPABASE_ANON_KEY` as project-scoped secrets. Values are not printed (by design).

### Task B4: Set up Turbo remote cache (spec §4 Phase A4)

- [ ] **Step 1: Authenticate and link**

From the repo root:
```bash
pnpm exec turbo login       # opens browser, authenticates with Vercel
pnpm exec turbo link        # binds repo to your Vercel-hosted Turbo cache
```

- [ ] **Step 2: Check for `.turbo/config.json` drift**

Run:
```bash
git status .turbo/ 2>/dev/null
```

`.turbo/` is gitignored wholesale, so `git status` should not show any new files. If a `.turbo/config.json` did appear as tracked (unlikely, but possible on older turbo setups), leave it for now and decide per-file whether to commit it (contains no secrets — just your team binding).

- [ ] **Step 3: Capture two values for Part C**
  - `TURBO_TOKEN` — visit vercel.com/account/tokens → **Create Token** (separate from `VERCEL_TOKEN`). Name it `fitsync-turbo-cache`. Copy the token.
  - `TURBO_TEAM` — for personal Hobby accounts, this is your Vercel username (e.g. `conradonegro`).

Store both securely for Part C.

---

## Part C — GitHub configuration (manual, per spec §4 Phase B)

Executed in the GitHub repo UI. Adds environments, a variable, and seven secrets.

### Task C1: Create GitHub Environments (spec §4 Phase B1)

- [ ] **Step 1: Create `staging` environment**

Go to the repo → Settings → **Environments** → **New environment** → name `staging` → **Configure environment**. Leave all protection rules unset. Click **Save**.

- [ ] **Step 2: Create `production` environment with branch restriction**

Go to **New environment** → name `production` → **Configure environment**. Under **Deployment branches and tags**, select **Selected branches and tags** → **Add deployment branch or tag rule** → exact name `main`. Leave "Required reviewers" unset. Click **Save**.

- [ ] **Step 3: Verify both environments exist**

Run:
```bash
gh api "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/environments" --jq '.environments[].name'
```

Expected: `staging` and `production` both appear in the output.

### Task C2: Add the repository variable (spec §4 Phase B2)

- [ ] **Step 1: Add `STAGING_SUPABASE_PROJECT_REF`**

Run:
```bash
gh variable set STAGING_SUPABASE_PROJECT_REF --body "rjhzkgomgsztcyrhkywf"
```

Expected: `✓ Set repository variable STAGING_SUPABASE_PROJECT_REF`.

- [ ] **Step 2: Verify**

Run:
```bash
gh variable list
```

Expected: `STAGING_SUPABASE_PROJECT_REF` appears with value `rjhzkgomgsztcyrhkywf`.

### Task C3: Add the seven repository secrets (spec §4 Phase B3)

- [ ] **Step 1: Add each secret via gh CLI**

Run the following commands, substituting the real values you captured in Part B. Each command prompts for the secret value interactively (do NOT pass secrets as shell arguments — they leak to shell history):

```bash
gh secret set VERCEL_TOKEN
gh secret set VERCEL_ORG_ID
gh secret set VERCEL_PROJECT_ID
gh secret set SUPABASE_ACCESS_TOKEN
gh secret set SUPABASE_DB_PASSWORD
gh secret set TURBO_TOKEN
gh secret set TURBO_TEAM
```

For each one, paste the value when prompted.

- [ ] **Step 2: Verify all seven are listed**

Run:
```bash
gh secret list
```

Expected output contains all seven secrets (values are never shown, only names and updated timestamps).

---

## Part D — Pre-flight migration state check (per spec §4 Phase C)

Critical safety step before enabling the deploy jobs in Part E.

### Task D1: Verify staging migration state matches the repo

**Files:** None modified — this is a read-only verification.

- [ ] **Step 1: Authenticate with Supabase**

Run:
```bash
supabase login
```

This uses the access token you captured in Task B2. If it prompts for a token, paste your `SUPABASE_ACCESS_TOKEN` value.

- [ ] **Step 2: Link the repo to the staging project**

Run from the repo root:
```bash
supabase link --project-ref rjhzkgomgsztcyrhkywf
```

Expected: "Finished supabase link." If prompted for the database password, paste your `SUPABASE_DB_PASSWORD`.

- [ ] **Step 3: List migrations (local vs. remote)**

Run:
```bash
supabase migration list --linked
```

Expected: a two-column table. **Every row in the "Local" column must also appear in the "Remote" column.** This means staging has already applied every migration in `supabase/migrations/`.

- [ ] **Step 4: Resolve any drift before proceeding**

If the output shows migrations in Local but NOT in Remote → run `supabase db push` locally to apply the missing migrations. Verify by re-running `supabase migration list --linked` until there is zero drift.

If the output shows migrations in Remote but NOT in Local → **STOP**. This is a real divergence. Identify the remote-only migration(s), decide whether to backport them to the repo or roll them back from staging, and resolve manually before continuing. Do not proceed to Part E.

- [ ] **Step 5: Final confirmation**

Re-run:
```bash
supabase migration list --linked
```

Expected: zero drift. Only proceed to Part E when this is true.

---

## Part E — PR2: Enable deploys

### Task E1: Create a branch for PR2

**Files:** None yet.

- [ ] **Step 1: Make sure `main` is up to date**

Run:
```bash
git checkout main
git pull origin main
```

- [ ] **Step 2: Create the PR2 branch**

Run:
```bash
git checkout -b feat/d7-enable-deploys
```

### Task E2: Remove the `if: false` overrides in `ci.yml`

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Remove `false &&` from `migrate-staging`**

Open `.github/workflows/ci.yml`. Find the `migrate-staging` job. Change:
```yaml
    if: false && github.event_name == 'push' && github.ref == 'refs/heads/main'
```
to:
```yaml
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

- [ ] **Step 2: Remove `false &&` from `deploy-production`**

Find the `deploy-production` job. Change:
```yaml
    if: false && github.event_name == 'push' && github.ref == 'refs/heads/main'
```
to:
```yaml
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

- [ ] **Step 3: Remove the "TEMPORARY" comment blocks above both jobs**

In the block immediately above each of the two jobs, delete these comment lines (keep the rest of each comment block intact — just the three TEMPORARY lines go):

```yaml
  #
  # TEMPORARY: `if: false && ...` is a PR1 safety gate.
  # Part E of the implementation plan removes `false &&`
  # after manual provisioning and pre-flight are complete.
```

- [ ] **Step 4: Verify the diff**

Run:
```bash
git diff .github/workflows/ci.yml
```

Expected: only the two `if:` line changes and the removal of the six TEMPORARY comment lines (three above each job). No other changes.

### Task E3: Commit PR2 and open it

**Files:** Commit + push + PR.

- [ ] **Step 1: Run the pre-PR local checks**

Before opening the PR, run the full pre-PR manual checklist from `CLAUDE.md` for any sections that apply:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm test
```

Expected: all pass. Playwright, Maestro, and `gen:types` drift are not strictly required for a CI-only YAML edit, but do run them if you want belt-and-suspenders assurance.

- [ ] **Step 2: Stage and commit**

Run:
```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
feat(d7): enable migrate-staging and deploy-production jobs

Removes the PR1 `if: false` safety overrides on both the migrate-staging
and deploy-production jobs. The pre-flight check (spec §4 Phase C) has
confirmed staging migration state matches the repo, so the next merge
to main will apply migrations and deploy to Vercel production for real.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push and open PR2**

Run:
```bash
git push -u origin feat/d7-enable-deploys
gh pr create --title "feat(d7): enable migrate-staging + deploy-production jobs" --body "$(cat <<'EOF'
## Summary
- Removes `if: false` overrides on `migrate-staging` and `deploy-production` in `ci.yml`.
- After merge, the next push to `main` will run `supabase db push --dry-run` + `supabase db push` against staging, then `vercel deploy --prod`.
- Pre-flight migration state verified per spec §4 Phase C before opening this PR — zero drift between local and staging.

## Test plan
- [ ] `Verify` job passes on this PR (deploy jobs are still skipped because this is a PR, not a push-to-main)
- [ ] After merge: `Migrate Staging` runs and reports "no new migrations to apply"
- [ ] After merge: `Deploy Production` runs and produces a Vercel deployment URL
- [ ] `https://fitsync.vercel.app` loads the web app; seed trainer login works; roster page is reachable

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Watch CI**

Run:
```bash
gh pr checks --watch
```

Expected: `Verify` runs green. The deploy jobs are skipped (because this is a pull_request, not a push to main).

- [ ] **Step 5: Merge PR2**

```bash
gh pr merge --squash --delete-branch
```

### Task E4: Monitor the first real deploy

**Files:** None modified — this is live observation.

- [ ] **Step 1: Pull main locally**

Run:
```bash
git checkout main
git pull origin main
```

- [ ] **Step 2: Watch the push-to-main workflow**

Run:
```bash
gh run list --branch main --limit 1
```

Copy the most recent run ID and watch it:

```bash
gh run watch <run-id>
```

Expected: `Verify` runs and passes. Then `Migrate Staging` runs — expect it to show "Remote migrations up to date" or equivalent (zero new migrations to apply, because pre-flight confirmed parity). Then `Deploy Production` runs — expect Vercel CLI output culminating in a deployment URL.

- [ ] **Step 3: If any job fails, diagnose via logs**

```bash
gh run view <run-id> --log-failed
```

Common failure modes and fixes:
- `migrate-staging` fails with authentication error → double-check `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` in repo secrets (Part C3)
- `deploy-production` fails with "project not found" → double-check `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` in repo secrets
- `deploy-production` fails with missing env vars at build time → check that `NEXT_PUBLIC_SUPABASE_URL` etc. are set in the Vercel dashboard (Task B1 step 6), scoped to **Production**

Forward-fix via a new commit — do NOT use `git revert` on a deploy-breaking change, as `supabase db push` is already forward-only and rolling back code without rolling back migrations creates drift.

- [ ] **Step 4: Verify the deployed web app**

Open `https://fitsync.vercel.app` in a browser:
- Page loads without errors
- Log in as the seed trainer (`trainer@fitsync.dev` / `Password123!` — these exist in staging if D2 seed was applied there)
- Navigate to the athletes roster page — should load without errors
- If any of these fail, forward-fix. Do not proceed to Part F until the deployed app is functional.

---

## Part F — Lock-down (per spec §4 Phase D)

### Task F1: Enable branch protection on `main` (spec §4 Phase D1)

**Files:** None modified — configured via GitHub UI or API.

- [ ] **Step 1: Navigate to Settings → Branches**

In the repo's GitHub UI: Settings → **Branches** → **Add branch ruleset** (or "Add rule" depending on UI version) → target `main`.

- [ ] **Step 2: Configure the ruleset**

Enable the following:
- ☑ **Require a pull request before merging**
  - Required approvals: **0**
  - ☑ Dismiss stale reviews when new commits are pushed
- ☑ **Require status checks to pass before merging**
  - ☑ Require branches to be up to date before merging
  - **Required status checks:** add `Verify` (type exactly `Verify` — this must match the `name:` field of the `verify` job in `ci.yml`)
- ☑ **Require linear history**
- ☑ **Block force pushes**
- ☑ **Restrict deletions**
- ☐ **Do not allow bypassing the above settings** — leave this UNCHECKED (admins can bypass in emergencies)

- [ ] **Step 3: Save the ruleset**

Click **Create** (or **Save changes**).

- [ ] **Step 4: Verify via CLI**

Run:
```bash
gh api "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/branches/main/protection" --jq '{required_status_checks: .required_status_checks.contexts, linear_history: .required_linear_history, force_pushes: .allow_force_pushes}'
```

Expected output (approximate shape):
```json
{
  "required_status_checks": ["Verify"],
  "linear_history": {"enabled": true},
  "force_pushes": {"enabled": false}
}
```

If `required_status_checks` does not list `Verify`, the required check name was entered incorrectly — go back to Step 2 and fix it.

### Task F2: Walk the AC-D7 checklist end-to-end

**Files:** None modified — this is the final verification pass.

- [ ] **Step 1: Open `PHASE1_SCOPE.md` §4 AC-D7**

Walk through each of the ~15 checklist items and verify:

- Per-commit gate: make a deliberately unformatted file, `git add` it, try to commit — pre-commit hook should auto-fix or block.
- Per-push gates: create a branch with a deliberate typecheck error, try to `git push` — hook should block. Repeat for lint error, format drift, broken build, failing Jest test. Finally, verify `git push --no-verify` does bypass the hook (then reset and don't actually push the bad code).
- Pre-PR manual checklist items: Playwright, `gen:types` drift, Maestro — run the commands from `CLAUDE.md` and confirm each works.
- CI quality gates: open a throwaway PR with a deliberate TypeScript error — confirm the `Verify` status check fails and blocks merge. Repeat for ESLint error, format drift, broken build.
- CI deploy pipeline: already verified live during Task E4.
- Manual mobile build pipeline: run `eas build --profile preview --non-interactive` from `apps/mobile` and confirm it queues a build.

- [ ] **Step 2: Tick each item off in `PHASE1_SCOPE.md`**

Open `PHASE1_SCOPE.md`, change `- [ ]` to `- [x]` for each verified item, commit (this should go through a normal PR since branch protection is now active):

```bash
git checkout -b chore/d7-ac-checklist-completed
# edit PHASE1_SCOPE.md, tick boxes
git add PHASE1_SCOPE.md
git commit -m "chore(d7): tick off AC-D7 acceptance criteria"
git push -u origin chore/d7-ac-checklist-completed
gh pr create --fill
```

Merge the PR. D7 is complete.

---

## Post-D7

Tag the `main` commit if desired:

```bash
git checkout main
git pull origin main
git tag d7-complete
git push origin d7-complete
```

That's the end of D7. Next deliverable is D8 (Observability Baseline): Sentry source map upload in builds, production error tracking, alert rules. D8 will add `SENTRY_DSN` and `SENTRY_AUTH_TOKEN` to the relevant secret stores.
