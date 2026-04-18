# Lo-Fi Pocket Golf (Phase 1 Prototype)

A semi-lo-fi mobile golf prototype built with Expo + React Native.

## What is implemented

- Runnable Expo app
- Portrait-only orientation
- One-finger drag-to-aim, release-to-shoot mechanic
- 2D top-down holes with ball, cup, walls/bumpers, sand, and water hazards
- 5 playable holes with increasing difficulty
- Stroke tracking (current hole + total round)
- Quick reset controls (`Retry Hole` and `Quick Reset`)
- Minimal clean visual style

## Tech choices (minimal dependencies)

Only core Expo/React Native packages are used:

- `expo`
- `react`
- `react-native`
- `expo-status-bar`

No game engine dependency is used; physics and collision are implemented directly in `App.js`.

## Run locally

From repo root:

```bash
npm install
npm run start
```

This opens Expo Dev Tools in the terminal.

## Run on iPhone with Expo Go (exact steps)

1. Install **Expo Go** from the iOS App Store.
2. On your Mac, run:
   ```bash
   npm run start
   ```
3. Keep iPhone and Mac on the same Wi-Fi network.
4. In the terminal, scan the QR code using:
   - iPhone Camera app, or
   - QR scanner inside Expo Go.
5. The app opens in Expo Go.

If LAN connection fails, press `n` in the Expo terminal to switch to tunnel mode and scan again.

## iOS Simulator steps

Prereqs:

- Xcode installed (includes iOS Simulator)

Then run:

```bash
npm run ios
```

Expo will boot the app in the iOS Simulator.

## Gameplay controls

- Set aim first by dragging near the ball, or use `Aim Left` / `Aim Right`
- Swing uses a fixed bottom-center control pad (Golden Tee style):
- Start thumb in the center ring
- Pull straight down to load power (0% to 125%)
- Flick straight up through center to strike
- Over 100% power is possible but punishes crooked follow-through
- `Retry Hole`: restart current hole from stroke 0
- `Quick Reset`: reset ball to tee with +1 stroke penalty
- `Next Hole`: enabled after sinking current hole

## Project structure

- `App.js` - gameplay, physics, rendering, hole data, UI
- `app.json` - Expo config (portrait orientation)
- `index.js` - Expo entrypoint
