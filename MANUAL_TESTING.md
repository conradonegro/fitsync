# FitSync — Manual Testing Guide

> This guide covers everything that cannot be verified by automated tests: UI
> flows, cross-platform scenarios, RLS verification, and physical-device offline
> behaviour. Work through it top-to-bottom before marking a release as ready.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Setup](#2-environment-setup)
3. [Automated Test Baseline](#3-automated-test-baseline)
4. [Web App — Trainer Flows](#4-web-app--trainer-flows)
5. [Mobile App — Athlete Flows](#5-mobile-app--athlete-flows)
6. [Full End-to-End Scenario](#6-full-end-to-end-scenario)
7. [RLS Verification](#7-rls-verification)
8. [Physical Device — Offline & Sync](#8-physical-device--offline--sync)
9. [Acceptance Criteria Checklist](#9-acceptance-criteria-checklist)

---

## 1. Prerequisites

| Tool                 | Version | Required for                 |
| -------------------- | ------- | ---------------------------- |
| Node.js              | 20.20.0 | Everything                   |
| pnpm                 | 10.30.2 | Package management           |
| Docker Desktop       | Latest  | `supabase start`             |
| Supabase CLI         | Latest  | Migrations, type gen, Studio |
| Expo Go or dev build | —       | Mobile simulator testing     |
| Maestro CLI          | Latest  | Automated mobile E2E         |

Install Maestro if not already done:

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
maestro --version
```

---

## 2. Environment Setup

Run these once before every testing session.

```bash
# 1. Start local Supabase (Docker Desktop must be running)
supabase start

# 2. Reset DB — applies all migrations and loads seed data
supabase db reset

# 3. Start the web app
pnpm dev --filter=@fitsync/web
# Web runs at http://localhost:3000

# 4. Start the mobile app (separate terminal)
pnpm dev --filter=@fitsync/mobile
# Opens Expo dev server — press i for iOS simulator, a for Android emulator
```

### Seed credentials

| Role    | Email                 | Password       |
| ------- | --------------------- | -------------- |
| Trainer | `trainer@fitsync.dev` | `Password123!` |
| Athlete | `athlete@fitsync.dev` | `Password123!` |

The seed data also includes one pre-existing active relationship between these
two accounts and one historical workout session, so the trainer's athlete detail
page is not empty on first load.

---

## 3. Automated Test Baseline

Run this first. Manual testing only begins once all automated checks are green.

```bash
pnpm typecheck   # zero errors expected
pnpm lint        # zero errors expected (9 pre-existing console.warn in source — OK)
pnpm test        # 239 tests: 100 shared + 97 mobile + 42 web
pnpm build       # all packages build cleanly
```

For Playwright web E2E (requires local Supabase running):

```bash
cd apps/web
pnpm test:e2e    # 30 tests: auth, roster, invite, athlete-detail
```

---

## 4. Web App — Trainer Flows

Open http://localhost:3000 in a browser.

### 4.1 Unauthenticated redirect

1. Open http://localhost:3000/dashboard/athletes in a fresh private window.
2. **Expected:** Immediately redirected to `/login`.
3. Open http://localhost:3000/invite/accept?token=anything in a fresh private window.
4. **Expected:** Page loads (not redirected — `/invite` is a public route).

### 4.2 Signup — trainer

1. Go to http://localhost:3000/signup.
2. Enter a new email (e.g. `newtrainer@example.com`), a password meeting the
   requirements, and select role **Trainer**.
3. Submit.
4. **Expected:** Redirected to `/dashboard/athletes` with an empty athlete roster
   ("No athletes yet").

### 4.3 Login and logout

1. Go to http://localhost:3000/login.
2. Log in as `trainer@fitsync.dev` / `Password123!`.
3. **Expected:** Redirected to `/dashboard/athletes`.
4. Click **Sign out** (or the logout button in the nav).
5. **Expected:** Redirected to `/login`. Navigating to any protected route redirects
   back to `/login`.

### 4.4 Athlete roster — existing relationship

1. Log in as the seed trainer.
2. Go to `/dashboard/athletes`.
3. **Expected:**
   - One athlete row visible: `athlete@fitsync.dev`, status **Active**.
   - "Invite Athlete" form is present.

### 4.5 Invite flow — new athlete

1. Log in as the seed trainer.
2. Enter a fresh email in the Invite Athlete form (use a real email or
   `newathlete+<timestamp>@example.com`).
3. Submit.
4. **Expected:**
   - Success message or form resets with no error.
   - Athlete roster shows a new row with status **Pending**.
5. Check the invitation row exists in Supabase Studio:

   ```sql
   SELECT * FROM coach_athlete_relationships ORDER BY created_at DESC LIMIT 5;
   ```

   The new row should have `status = 'pending'` and `athlete_id IS NULL`.

6. _(Optional — requires Resend key)_ Verify the invitation email arrived in the
   Resend dashboard or the recipient inbox.

### 4.6 Invite accept flow

1. Copy the invite accept URL from the database:

   ```sql
   SELECT id FROM coach_athlete_relationships WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1;
   ```

2. Construct the URL: `http://localhost:3000/invite/accept?token=<id>`.
3. Open it in a private window (logged out).
4. **Expected:** Page shows the trainer's name and "Accept Invitation" form with
   a history-sharing choice.
5. Sign up with a new athlete account or log in as an existing athlete.
6. Choose a history sharing option and submit.
7. **Expected:** Redirected to `/` (or the athlete confirmation screen).
8. Back in the trainer's browser, go to `/dashboard/athletes` and refresh.
9. **Expected:** The pending row is now **Active**.

### 4.7 Athlete detail page

1. Log in as the seed trainer.
2. Click the seed athlete's name in the roster.
3. **Expected:**
   - Athlete name, email, and connection date are displayed.
   - The pre-seeded workout session (from `seed.sql`) appears in the session
     list, or a message indicating no sessions if seed data was not loaded.

### 4.8 Locale switcher

1. On any authenticated page, click the locale switcher (EN / ES / CS).
2. Switch to **ES**.
3. **Expected:** Page text changes to Spanish without a full page reload.
4. Switch back to **EN** and verify text reverts.

### 4.9 Validation — invite form

1. On the roster page, submit the invite form with:
   - Empty email → **Expected:** "Invalid email address" error shown inline.
   - Invalid email (`notanemail`) → same error.
   - Valid email of the already-invited athlete → **Expected:** "An open
     invitation already exists for this email".

---

## 5. Mobile App — Athlete Flows

These tests run in the iOS Simulator or Android Emulator (no physical device
needed unless noted). Start the Expo dev server with `pnpm dev --filter=@fitsync/mobile`.

### 5.1 Unauthenticated redirect

1. Open the app fresh (or clear app storage in the simulator).
2. **Expected:** Lands on the login screen, not the home screen.

### 5.2 Signup — athlete

1. On the login screen, tap **Sign up**.
2. Enter a new email, password, full name, and select role **Athlete**.
3. Submit.
4. **Expected:** Navigates to the athlete home screen.
5. Verify `user_devices` in Supabase Studio has a row for this new user's
   `device_id`.

### 5.3 Login and logout

1. Log in as `athlete@fitsync.dev` / `Password123!`.
2. **Expected:** Athlete home screen with the user's email shown.
3. Tap **Sign out**.
4. **Expected:** Returns to the login screen.

### 5.4 Session persistence

1. Log in on the simulator.
2. Force-quit the app (Cmd+Shift+H twice on iOS Simulator, or swipe up).
3. Reopen the app.
4. **Expected:** Still logged in — home screen appears without re-authentication.

### 5.5 Start and log a workout (online)

1. Log in as the seed athlete.
2. Tap **Start Workout**.
3. **Expected:** Active workout screen opens.
4. Enter exercise `Squat`, reps `5`, weight `100` → tap **Log Set**.
5. **Expected:** Set appears in the list immediately (optimistic update — no
   spinner before it appears).
6. Log a second set: `Squat`, reps `3`, weight `90`.
7. Log a set of a different exercise: `Bench Press`, reps `8`, weight `60`.
8. **Expected:** Three rows in the list. Squat sets are numbered Set 1 and Set 2.
   Bench Press is Set 1 of its own exercise.

### 5.6 Finish workout

1. With sets logged, tap **Finish Workout**.
2. **Expected:** A confirmation alert/dialog appears.
3. Tap **Confirm**.
4. **Expected:** Returns to the home screen. No active session. No pending badge
   (sync happened automatically because you are online).

### 5.7 Crash recovery (simulator-safe)

1. Tap **Start Workout** and log one set.
2. Without finishing, force-quit the app.
3. Reopen the app.
4. **Expected:** Home screen shows **Resume Workout** (not Start Workout),
   reflecting the recovered active session.
5. Tap **Resume Workout**, confirm the previously logged set is still visible.
6. Finish the workout normally.

### 5.8 Offline indicator

> **Simulator limitation:** `expo-network` always returns `isConnected: true`
> in simulators. This scenario **must** be verified on a physical device.
> See [Section 8](#8-physical-device--offline--sync).

---

## 6. Full End-to-End Scenario

This is the core Phase 1 proof: trainer invites athlete → athlete logs session
offline → session syncs to server → trainer sees it.

### Prerequisites

- Local Supabase running with seed data reset.
- Web app running at http://localhost:3000.
- Mobile dev server running.

### Steps

**Step 1 — Trainer invites a fresh athlete**

1. Log in to the web app as `trainer@fitsync.dev`.
2. Invite a new email (e.g. `e2e+<timestamp>@example.com`).
3. Copy the resulting invite token from the DB:

   ```sql
   SELECT id FROM coach_athlete_relationships WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1;
   ```

**Step 2 — Athlete signs up and accepts**

1. In a private window, open `http://localhost:3000/invite/accept?token=<id>`.
2. Sign up with the invited email (role: Athlete).
3. Accept the invitation with "Share all history".
4. Relationship is now `active`. Verify in the trainer's roster.

**Step 3 — Athlete logs a workout**

1. On the mobile app, log in as the new athlete.
2. _(Optional: enable airplane mode on a physical device to test offline path)_
3. Tap **Start Workout**.
4. Log two sets: `Deadlift`, 3 reps, 150 kg.
5. Tap **Finish Workout → Confirm**.

**Step 4 — Sync**

- If online: sync fires automatically. Pending badge appears briefly and clears.
- If offline: re-enable network. Sync fires on reconnect.

**Step 5 — Trainer verifies**

1. On the web app, go to `/dashboard/athletes`.
2. Click the new athlete.
3. **Expected:** The Deadlift session appears in the workout history with the
   correct date and set details.

Verify directly in Supabase Studio:

```sql
SELECT
  ws.id,
  ws.started_at,
  ws.ended_at,
  we.event_type,
  we.payload
FROM workout_sessions ws
JOIN workout_events we ON we.session_id = ws.id
ORDER BY ws.started_at DESC, we.client_sequence ASC;
```

---

## 7. RLS Verification

These checks confirm that Row-Level Security policies are correctly enforced.
Run them using the Supabase client directly (or via the REST API with explicit
Authorization headers).

### 7.1 Athlete cannot read another athlete's events

1. Sign in as `athlete@fitsync.dev` in the JS console or via a test script:

   ```ts
   import { createClient } from '@supabase/supabase-js';
   const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
   await client.auth.signInWithPassword({ email: 'athlete@fitsync.dev', password: 'Password123!' });

   // Try to read a workout_event belonging to a different athlete's session
   const { data, error } = await client
     .from('workout_events')
     .select('*')
     .eq('athlete_id', '<other-athlete-uuid>');

   console.log(data); // Expected: [] (empty — RLS blocks it)
   ```

2. **Expected:** Empty array returned, no error (RLS silently filters, not 403).

### 7.2 Trainer can read their connected athlete's events

```ts
await client.auth.signInWithPassword({ email: 'trainer@fitsync.dev', password: 'Password123!' });

const { data } = await client
  .from('workout_events')
  .select('*')
  .eq('athlete_id', '00000000-0000-0000-0000-000000000002'); // seed athlete UUID

console.log(data); // Expected: rows returned (trainer is connected to this athlete)
```

**Expected:** One or more rows returned.

### 7.3 Trainer cannot read an unconnected athlete's events

```ts
// Sign in as the seed trainer, then query events for an athlete NOT in their roster.
// Create a second athlete account first, or use a known UUID with no relationship.
const { data } = await client
  .from('workout_events')
  .select('*')
  .eq('athlete_id', '<unconnected-athlete-uuid>');

console.log(data); // Expected: [] (RLS blocks — no active relationship)
```

---

## 8. Physical Device — Offline & Sync

See **[maestro/PHYSICAL_DEVICE_TESTING.md](./maestro/PHYSICAL_DEVICE_TESTING.md)**
for full step-by-step instructions. Summary of scenarios:

| Scenario                                    | AC              | Simulator            | Device |
| ------------------------------------------- | --------------- | -------------------- | ------ |
| Offline indicator banner appears            | AC-D5-5         | ❌                   | ✅     |
| Log sets with airplane mode on              | AC-D5-1 to D5-4 | ❌                   | ✅     |
| Pending badge → auto-sync on reconnect      | AC-D6-1, D6-2   | ❌                   | ✅     |
| Kill mid-flush → only unsynced events retry | AC-D6-6         | ❌                   | ✅     |
| Catch-up from second device                 | AC-D6-7         | ❌ (needs 2 devices) | ✅     |

> **Key reminder:** The iOS Simulator and Android Emulator both report
> `isConnected: true` unconditionally via `expo-network`. Any test that depends
> on detecting offline state requires a real device with airplane mode.

---

## 9. Acceptance Criteria Checklist

Use this as a sign-off checklist before marking a release as ready.

### AC-D1: Monorepo Scaffold

- [ ] `pnpm install` from root succeeds with no errors.
- [ ] `pnpm build` builds all packages in dependency order.
- [ ] `pnpm typecheck` returns zero errors.
- [ ] `pnpm lint` returns zero errors.

### AC-D2: Supabase Infrastructure

- [ ] `supabase start` succeeds.
- [ ] `supabase db reset` applies all migrations and loads seed data with no errors.
- [ ] `pnpm gen:types` regenerates types with no manual intervention.
- [ ] A deliberate schema change + `gen:types` causes a typecheck failure in `packages/shared`.
- [ ] RLS verified: athlete cannot read another athlete's events (Section 7.1).
- [ ] RLS verified: trainer can read their connected athlete's events (Section 7.2).
- [ ] RLS verified: trainer cannot read an unconnected athlete's events (Section 7.3).

### AC-D3: Authentication

- [ ] Trainer can sign up on web (Section 4.2).
- [ ] Athlete can sign up on mobile (Section 5.2).
- [ ] Both can log in and log out (Sections 4.3, 5.3).
- [ ] Unauthenticated users are redirected to login (Sections 4.1, 5.1).
- [ ] Session persists across mobile app restarts (Section 5.4).
- [ ] `device_id` row exists in `user_devices` after first mobile login (Section 5.2).
- [ ] `device_id` does not change across app restarts.

### AC-D4: Trainer Athlete Management

- [ ] Trainer can see their roster (Section 4.4).
- [ ] Trainer can invite an athlete by email (Section 4.5).
- [ ] Resend delivers the invitation email (requires Resend key — verify in dashboard).
- [ ] Athlete can accept the invitation (Section 4.6 / full E2E scenario Section 6).
- [ ] Relationship appears as `active` after acceptance (Section 4.6).
- [ ] History choice reflected in `history_shared_from` column (verify in Studio).

### AC-D5: Offline Workout Logging

- [ ] Athlete can start a workout offline (physical device — Section 8).
- [ ] Athlete can log sets with no network connection (physical device).
- [ ] Sets appear immediately in the UI after logging (Section 5.5).
- [ ] Athlete can finish the session offline (physical device).
- [ ] Offline indicator banner is visible when disconnected (physical device).
- [ ] SQLite `event_queue` contains the queued events after offline logging.

### AC-D6: Sync Engine

- [ ] Queued events flush automatically after reconnect (physical device — Section 8).
- [ ] Flushed events appear in Supabase `workout_events` with `server_created_at` set.
- [ ] SQLite queue is empty after successful flush for a completed session.
- [ ] Duplicate submission does not create duplicate records in Supabase.
- [ ] Trainer sees the athlete's synced session on the web (full E2E — Section 6).
- [ ] App mid-flush kill + relaunch re-submits only unconfirmed events (physical device).
- [ ] Catch-up query retrieves events from other devices (physical device — Section 8).
