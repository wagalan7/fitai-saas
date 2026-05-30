# @fitness/mobile — iOS shell

Capacitor wrapper around the FitAI Next.js deploy. The native app is a thin
WKWebView that loads `https://fitai-web-production.up.railway.app` directly
(see `capacitor.config.ts`), so feature work continues to happen in
`apps/web` and ships through Railway. This app exists for two reasons only:

1. **App Store distribution** — PWA install on iOS has too much friction and
   no native push.
2. **Native APIs** — HealthKit (Apple Watch sync), native APNs push, haptics,
   and `Preferences` (Keychain-backed storage). These literally cannot work
   from Safari on iOS.

## First-time setup

```bash
# from repo root
npm install --workspace=@fitness/mobile --legacy-peer-deps

cd apps/mobile
LANG=en_US.UTF-8 npx cap sync ios   # refreshes pods + plugin manifest
npx cap open ios                     # opens Xcode
```

In Xcode:

1. Select the `App` target → **Signing & Capabilities**.
2. Set your Team. Bundle ID is `com.fitai.app`.
3. Confirm the capabilities **HealthKit** and **Push Notifications** appear
   (the entitlements file already declares them; this step just sanity-checks).
4. Plug in a real device (HealthKit doesn't work in the simulator) → ▶︎ Run.

## Common gotchas

- **CocoaPods Unicode error.** macOS Ruby 3.4 + a non-UTF-8 locale crashes
  `pod install`. Always export `LANG=en_US.UTF-8` before any `cap`/`pod`
  command. Adding it to `~/.zshrc` is the permanent fix.
- **Spaces in repo path.** This repo lives under `…/Agente de treino/…`.
  CocoaPods tolerates it but some Xcode build scripts get confused —
  if you see "No such file or directory" in build logs, that's the
  smoking gun.
- **HealthKit simulator.** Health data and the HealthKit auth sheet only
  exist on real devices. The plugin call returns `false` from the JS bridge
  in the simulator.

## Shipping

```bash
# After web changes are live on Railway, the iOS shell already has them —
# server.url points to prod. You only need to ship a new IPA when:
#   - you change Capacitor config (icons, splash, plugin list)
#   - you add a new entitlement or usage description
#   - Apple requires a build refresh for the App Store listing.

cd apps/mobile
LANG=en_US.UTF-8 npx cap sync ios
npx cap open ios
# Product → Archive → Distribute App → App Store Connect.
```

## What's wired

- `@capacitor/app` — back-button + state events
- `@capacitor/haptics` — light/medium/heavy feedback (used from `lib/native.ts`
  eventually; not yet)
- `@capacitor/preferences` — Keychain-backed K/V (good for auth tokens)
- `@capacitor/push-notifications` — APNs path. Server-side token registration
  is TODO; the JS pipeline reuses the existing `apps/api/src/push` module.
- `@capacitor/status-bar` — light/dark styling
- `@perfood/capacitor-healthkit` — workouts + activeEnergy + heartRate
  read/write. JS bridge in `apps/web/src/lib/native.ts`.

The web app feature-detects Capacitor at runtime (`window.Capacitor`) and
calls these plugins only when present, so the same Next.js build serves
browser, PWA, and native targets without conditional bundling.
