# Intergalactic Golf Tour

> A galaxy-spanning golf RPG where every stroke is a financial decision, every tournament is a survival gauntlet, and the path from your parents' couch on Earth to the top of the Intergalactic Golf Tour is brutal, expensive, and entirely up to you.

**Current build:** `IGT v3.5` — Expo + React Native prototype.
**Codename (repo):** `atlas-golf-phase1`.

---

## 📖 Documentation

The full design lives in the wiki. Start here:

- **[Wiki Home](https://github.com/thecoldplunge/atlas-golf-phase1/wiki)** — index of everything
- **[Current State](https://github.com/thecoldplunge/atlas-golf-phase1/wiki/Current-State)** — what's actually in the build right now (kept up to date)
- **[Grand Vision](https://github.com/thecoldplunge/atlas-golf-phase1/wiki/Grand-Vision)** — the full game we're building toward
- **[Backstory / World Bible](https://github.com/thecoldplunge/atlas-golf-phase1/wiki/Backstory)** — lore, species, the Tour, the Fold

---

## What is Intergalactic Golf Tour?

It's 2187. Humanity folded space, stumbled into a galaxy full of older species, and discovered that every civilization out there independently invented golf. The **Intergalactic Golf Tour** is the most prestigious sporting organization in known space. No human has ever won the Grand Slam.

You're a kid with a swing and not much else. The goal: get off your parents' couch, grind the Earth circuit, buy your fold passage, and climb — course by course, credit by credit — until you hoist the Sol Classic trophy as the first human in history to hold all four Majors.

**The pitch in three beats:**

1. **Golf as survival.** Lodging, food, fold-jumps, entry fees, gear repair — it all bleeds from your account every week. The money isn't a scoreboard; it's the game.
2. **Every stat costs money.** Power, Accuracy, Touch, Spin Control, Putting, Composure, Course Management — improve them through paid training with mini-games. Money + skill, both matter.
3. **Underdog fantasy.** Voss bomb 400-yard drives. Rill sink impossible putts. Paxi carve shots through crosswinds. You're a generalist from the newest spacefaring species, and you're coming for all of them.

See the full **[Grand Vision](https://github.com/thecoldplunge/atlas-golf-phase1/wiki/Grand-Vision)** for the career ladder, gambling underlayer, sponsorship system, property progression, and caddie mini-game.

---

## Current State (what's shipped right now)

Phase 1 is a playable Expo prototype focused on nailing the **core swing feel** before building the RPG/economy systems on top.

**What works today:**

- Runnable Expo app (iOS, Android, web via Expo Go)
- Golden-Tee–style swing on a lower control pad with vertical power meter — pull down to load (0–125%), flick up through center to strike
- Tap-to-aim with shot-preview dots at 25 / 50 / 75 / 100% power
- 2D top-down holes with fairway, rough, green, sand, water, walls/bumpers
- Full 14-club bag (DR, 3W/5W, 4I–9I, PW, GW, SW, LW, PT) with per-club distance / accuracy / forgiveness / spin stats
- Golfer roster with six core stats + three mental stats, horizontal-scroll picker, swappable avatars
- Three courses: **Pine Valley** (5 holes), **Michael's Course** (3 holes), **Driving Range** (practice, unlimited shots)
- Slope-aware greens and puttable surfaces
- Spin control (side-spin offset on the pad)
- Stroke tracking per hole and per round
- In-app dev tools: character / club editor, physics harness, sim QA scripts

The **[Current State](https://github.com/thecoldplunge/atlas-golf-phase1/wiki/Current-State)** wiki page is the live checklist — it's updated whenever the build changes.

---

## Run locally

```bash
npm install
npm run start
```

Open on iPhone via **Expo Go** (scan the QR code) or run `npm run ios` for the iOS Simulator.

If LAN fails, press `n` in the Expo terminal to switch to tunnel mode.

### Gameplay controls

- Tap anywhere on the course to aim. Press-and-hold to drag-adjust aim continuously.
- Shot-preview dots along the aim line show straight-travel estimates at 25 / 50 / 75 / 100%.
- Swing uses a lower control pad with a vertical power meter: start thumb in the center ring, pull straight down to load power (up to 125%), flick straight up through center to strike.
- Over 100% power is possible but punishes crooked follow-through.
- `Retry Hole` — restart current hole from stroke 0.
- `Quick Reset` — reset ball to tee with +1 stroke penalty.
- `Next Hole` — enabled after sinking the current hole.

---

## Project structure

```
App.js                                 gameplay, physics, rendering, hole data, UI
app.json                               Expo config (portrait orientation)
index.js                               Expo entrypoint
backstory.md                           long-form world bible (mirrored in wiki)
courses/                               external course JSON (e.g. michaels-course.json)
scripts/physics-harness.js             standalone physics test harness
docs/physics.html                      physics visualizer
sim-*.js, putt-qa.js, shot-qa.js       headless simulation / calibration scripts
dev-tool-character-club-editor.html    in-browser character + bag editor
```

---

## Tech

Minimal dependency footprint — core Expo / React Native only, no game engine. Physics and collision are implemented directly in `App.js`.

- `expo` `~54.0.0`
- `react` `19.1.0`
- `react-native` `0.81.5`
- `expo-status-bar`
- `react-native-web` (for web preview)

---

## Links

- **Wiki:** https://github.com/thecoldplunge/atlas-golf-phase1/wiki
- **Issues:** https://github.com/thecoldplunge/atlas-golf-phase1/issues
- **Owner:** [@thecoldplunge](https://github.com/thecoldplunge)
