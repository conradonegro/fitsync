# Physical Device Testing Guide

Some acceptance criteria for FitSync require a physical iOS or Android device
because the iOS Simulator and Android Emulator always report the network as
connected (`expo-network` returns `isConnected: true` unconditionally in
emulated environments).

This guide walks through each physical-device test scenario step by step.

---

## Prerequisites

### One-time setup

1. **Install Maestro CLI**

   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   # Restart your shell, then verify:
   maestro --version
   ```

2. **Build and install a development build** on the device:

   ```bash
   # iOS (requires Xcode + Apple Developer account)
   eas build --platform ios --profile development
   # Then install the resulting .ipa via Xcode Organizer or TestFlight

   # Android (requires USB debugging enabled)
   eas build --platform android --profile development
   # Then install the resulting .apk:
   adb install path/to/build.apk
   ```

   > **Important:** The test flows use `appId: com.fitsync.app` — this matches
   > the development build bundle ID. Expo Go uses a different appId and will
   > NOT work with these flows.

3. **Connect the device**
   - **iOS:** Connect via USB and trust the computer. Run `idevice_id -l` to
     confirm the device is visible. Maestro targets the first connected device.
   - **Android:** Enable USB debugging in Developer Options. Run `adb devices`
     to confirm the device appears as `device` (not `unauthorized`).

4. **Point the app to your local Supabase** (or staging):

   - For physical device testing against local Supabase, your Mac must be on
     the same Wi-Fi network as the device.
   - Set `SUPABASE_URL=http://<your-mac-local-ip>:54321` in
     `apps/mobile/.env.local` and rebuild.
   - Alternatively, use the staging project URL
     (`https://rjhzkgomgsztcyrhkywf.supabase.co`) so the device can reach it
     over any network.

5. **Seed the database** (if using local Supabase):

   ```bash
   supabase db reset
   ```

---

## Running simulator-safe flows

All flows in `maestro/auth/`, `maestro/workout/`, and `maestro/sync/` except
`pending-badge.yaml` run in the iOS Simulator or Android Emulator:

```bash
# Run all simulator-safe flows:
maestro test maestro/auth/
maestro test maestro/workout/

# Run a single flow:
maestro test maestro/workout/crash-recovery.yaml

# Run with the Maestro Studio debugger:
maestro studio
```

---

## Physical device scenario 1 — Offline indicator (AC-D5-5)

**What it tests:** The yellow offline banner appears when the device loses
network connectivity.

**Steps:**

1. Connect the device and verify it is recognised (`idevice_id -l` or
   `adb devices`).

2. Open the FitSync app on the device. Log in as the seed athlete
   (`athlete@fitsync.dev` / `Password123!`) if not already logged in.

3. You should be on the home screen with "Start Workout" visible.

4. **Enable airplane mode** on the device (swipe to Control Centre → Airplane
   Mode ON).

5. Tap **Start Workout**.

6. **Expected:** A yellow banner appears at the top of the Active Workout
   screen with the text:
   > "You are offline. Sets are saved locally."

7. **Disable airplane mode** (Control Centre → Airplane Mode OFF).

8. **Expected:** The yellow banner disappears within a few seconds as
   `isOnline` flips back to `true`.

---

## Physical device scenario 2 — Offline pending badge + auto-sync (AC-D6-4 / AC-D6-5)

**What it tests:** Sets logged offline accumulate in a pending badge; when
network is restored, the sync engine flushes the queue and the badge clears.

**Steps:**

1. Connect the device and log in as the seed athlete.

2. **Enable airplane mode** on the device.

3. Tap **Start Workout**. Confirm the offline banner is visible.

4. Log **two sets**:
   - Set 1: exercise "Squat", reps 5, weight 100 → tap **Log Set**
   - Set 2: exercise "Squat", reps 3, weight 90 → tap **Log Set**

5. Tap **Finish Workout** → tap **Confirm** in the alert.

6. You are back on the home screen. **Expected:** A blue info badge shows:
   > "2 set(s) pending sync"

7. **Disable airplane mode** (network reconnects).

8. The Zustand store's `setIsOnline(false → true)` transition fires
   `performSync()`. **Expected in sequence:**
   - Blue badge: "Syncing..."
   - Badge disappears (pending count → 0)

9. Open the Supabase Studio (`supabase studio`) or run the following query to
   confirm the events landed on the server:

   ```sql
   SELECT session_id, event_type, payload, server_created_at
   FROM workout_events
   WHERE athlete_id = '00000000-0000-0000-0000-000000000002'
   ORDER BY server_created_at DESC
   LIMIT 10;
   ```

   You should see `session_start`, two `set_logged`, and `session_end` rows.

---

## Physical device scenario 3 — Sync retry on error (AC-D6-6)

**What it tests:** When sync fails (e.g., staging is unreachable), the error
badge appears with a "Try again" button that manually retries.

**Steps:**

1. Temporarily break the Supabase URL in your `.env.local` (e.g., change the
   port to `54399`) and rebuild the app, OR enable airplane mode AFTER logging
   in and logging a set (so the device has pending events but no network).

2. Log in and log one set while online (or offline), then finish the workout.

3. Return to home screen. With the broken URL, the sync attempt will fail.

4. **Expected:** An orange badge shows:
   > "Sync failed — will retry when online"
   alongside a **"Try again"** button.

5. Fix the URL / re-enable network, then tap **Try again**.

6. **Expected:** "Syncing..." appears briefly, then the badge clears.

---

## Running the pending-badge Maestro flow on a physical device

The file `maestro/sync/pending-badge.yaml` is designed to be run semi-manually
on a physical device. Maestro does not pause and wait for a human gesture, so
you must coordinate airplane mode toggles with the flow execution.

**Recommended approach:**

1. Start the flow:

   ```bash
   maestro test maestro/sync/pending-badge.yaml
   ```

2. The flow will log in and reach the home screen. At this point it immediately
   issues `tapOn: "Start Workout"`.

3. **Before that tap completes** (i.e., as soon as the flow starts running),
   enable airplane mode. The flow will proceed while offline.

4. After the flow taps **Confirm** to finish the workout and asserts
   `"1 set(s) pending sync"`, it proceeds to assert `"Syncing..."`.

5. At this point (after the pending-badge assertion passes), **disable airplane
   mode**. The `setIsOnline` transition fires, sync starts, and the flow's
   remaining assertions should pass.

> **Tip:** Use `maestro studio` for a visual view of what Maestro is doing in
> real time. This makes it easier to time the airplane mode toggle.

---

## Scenario 4 — Cross-device catch-up (AC-D6-7)

**What it tests:** Events written by Device A on the server are fetched and
stored in `remote_events` when Device B syncs.

This test requires two physical devices (or one physical device + simulator
workaround).

**Steps:**

1. **Device A** (athlete, device_id A): Log in, log 2 sets, finish workout,
   wait for sync to complete.

2. **Device B** (same athlete account, device_id B): Log in. Because
   `rehydrateFromDb` calls `performSync()` on launch when online and
   `pendingEventCount > 0`, the catch-up phase fires automatically.

   Alternatively, trigger sync manually by briefly enabling then disabling
   airplane mode.

3. Verify the `remote_events` table on Device B's SQLite via the Supabase
   dashboard query or by inspecting the local DB:

   ```bash
   # List device databases (iOS simulator path example):
   find ~/Library/Developer/CoreSimulator -name "fitsync.db" 2>/dev/null
   # Open with any SQLite client and query:
   # SELECT * FROM remote_events ORDER BY server_created_at DESC;
   ```

4. **Expected:** The rows written by Device A appear in Device B's
   `remote_events` table with `device_id` matching Device A.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `appId not found` when running Maestro | Make sure the development build is installed. Expo Go uses `host.exp.Exponent`, not `com.fitsync.app`. |
| iOS device not detected | Run `idevice_id -l`. If empty, disconnect and reconnect USB, trust the computer again. |
| Android device shows `unauthorized` | Revoke and re-accept USB debugging in Developer Options on the device. |
| Assertions time out on login | The device may be reaching staging Supabase over a slow connection. Increase `--timeout` flag or switch to local Supabase on the same Wi-Fi. |
| Offline banner never appears in simulator | Expected — `expo-network` always returns connected in simulators. Use a physical device. |
| Sync badge never appears | Check that `SUPABASE_URL` in `.env.local` is reachable from the device (not `localhost`). |
