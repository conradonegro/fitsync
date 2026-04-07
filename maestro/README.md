# Maestro E2E Tests — FitSync Mobile

[Maestro](https://maestro.mobile.dev) is the mobile E2E framework for FitSync.
Tests are YAML flows that run against an installed development build.

## App IDs

| Platform | Development build | Expo Go (not supported) |
|---|---|---|
| iOS | `com.fitsync.app` | `host.exp.Exponent` |
| Android | `com.fitsync.app` | `host.exp.exponent` |

Always test against a **development build**, not Expo Go.

## Flow structure

```
maestro/
  helpers/
    login.yaml              — reusable login subflow (not a standalone test)
  auth/
    login.yaml              — valid login → home screen
    logout.yaml             — Sign out → login screen
    validation.yaml         — client-side form validation errors
  workout/
    start-and-log.yaml      — start workout + log 2 sets
    finish.yaml             — finish workout via confirmation alert
    crash-recovery.yaml     — kill mid-workout → rehydration from SQLite
  sync/
    pending-badge.yaml      — offline sets → pending badge → sync clears (⚠️ physical device only)
  PHYSICAL_DEVICE_TESTING.md  — step-by-step guide for network/offline scenarios
```

## Quick start

### 1. Install Maestro

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
maestro --version
```

### 2. Install a development build

```bash
# iOS simulator build
eas build --platform ios --profile development --local
# Opens in simulator automatically

# Android emulator / device
eas build --platform android --profile development --local
adb install path/to/build.apk
```

### 3. Start local Supabase and seed data

```bash
supabase start
supabase db reset   # loads seed data (trainer + athlete accounts)
```

### 4. Run flows

```bash
# All simulator-safe flows:
maestro test maestro/auth/
maestro test maestro/workout/

# Single flow:
maestro test maestro/auth/login.yaml

# Interactive debugger:
maestro studio
```

## Simulator vs physical device

| Flow | Simulator | Physical device |
|---|---|---|
| auth/login, logout, validation | ✅ | ✅ |
| workout/start-and-log, finish | ✅ | ✅ |
| workout/crash-recovery | ✅ | ✅ |
| sync/pending-badge | ❌ | ✅ |
| Offline indicator banner | ❌ | ✅ |

`expo-network` always reports `isConnected: true` in simulators. Tests that
depend on the offline state must run on a real device with airplane mode.

See **PHYSICAL_DEVICE_TESTING.md** for detailed step-by-step instructions for
each physical-device scenario.

## Seed credentials

| Role | Email | Password |
|---|---|---|
| Athlete | `athlete@fitsync.dev` | `Password123!` |
| Trainer | `trainer@fitsync.dev` | `Password123!` |

All flows run as the **athlete** (mobile app = athlete app).
