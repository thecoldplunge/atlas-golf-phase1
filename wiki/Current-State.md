# Current State

**Build:** `IGT v3.5`
**Last updated:** 2026-04-19
**Status:** Phase 1 prototype — playable on Expo Go / iOS Simulator / web.

> This page is the source of truth for what is actually in the build today. If it's not listed here, it isn't shipped — it's in the [Grand Vision](./Grand-Vision).

---

## TL;DR

Phase 1 is a playable swing prototype. The goal of this phase is to **nail the core swing feel** — aim, power, tempo, strike quality, spin, lie — before building the RPG economy, travel, sponsors, or career layers on top. Physics, the bag, and golfer stats are all instrumented so that the economy and progression systems can plug into them in later phases.

## In-flight right now

Two parallel workstreams, both inside Phase 1 of the [Roadmap](./Roadmap):

- **Gameplay feel** — dialing swing tempo, mishit curve, surface friction, putt speed, slope influence.
- **Stats → gameplay wiring** — making club stats and character stats visibly affect shot outcomes (distance curves, dispersion cones, forgiveness, touch, putting, composure under pressure).

Phase 1 also includes upcoming work on the **character visual layer** (portrait on creation, gear-driven appearance, on-course emotes) and **animations** (swing, strike, putt, ball-in-cup). See the Roadmap for the full breakdown.

---

## What's shipped

### App / platform

- Expo + React Native app, portrait-only
- Runs on iOS (Expo Go), Android (Expo Go), and web (`react-native-web`)
- Build version badge in UI: `IGT v3.5`
- No third-party game engine — physics and collision are implemented directly in `App.js`

### Swing mechanic

- Golden-Tee–style lower control pad with a vertical power meter on its right
- Start thumb in the center ring → pull straight down to load power (0–125%) → flick straight up through center to strike
- Over-100% power allowed but punishes crooked follow-through (tempo + straightness penalties)
- Aim set by tapping anywhere on the course; press-and-hold to drag-adjust continuously
- Shot-preview dots show straight-travel estimates at 25 / 50 / 75 / 100% power
- Aim line is fixed during swing (no drift mid-pull)
- Side-spin offset on the pad (spin dot) — fade / draw control
- Tempo window with a "perfect" band (narrow ms window for max carry)
- Mishit model: straightness sensitivity + overpower penalty + club forgiveness scaling

### Bag / equipment

- Full 14-club default bag: `DR`, `3W`, `5W`, `4I`, `5I`, `6I`, `7I`, `8I`, `9I`, `PW`, `GW`, `SW`, `LW`, `PT`
- Per-club stats: `distance`, `accuracy`, `forgiveness`, `spin` (putter uses `feel`)
- Starter gear is the "Generic" brand — placeholder for the real equipment economy
- Club auto-select for layup / drop distance
- Club picker UI during play

### Golfers / roster

- Golfer profiles with six core stats: **Power, Accuracy, Touch, Spin Control, Putting, Recovery**
- Three mental stats: **Focus, Composure, Course Management**
- Horizontal-scroll golfer picker with avatar thumbnails
- Avatar system (skin / hat / shirt / pants) — cosmetic, foundation for the character slot system in the Grand Vision
- Roster seeded with imported golfer data + the baseline `Mike G` human generalist
- Sample character bio/flavor text

### Courses

Three courses are in the build:

| Course | Holes | Par | Difficulty | Designer |
| --- | ---: | ---: | --- | --- |
| Pine Valley | 5 | 20 | Medium | Atlas |
| Michael's Course | 3 | 12 | Hard | Michael |
| Driving Range | 1 | — | Practice | Atlas |

- Top-down 2D holes with fairway, rough, green, sand, water, trees/walls, bumpers
- Slope-aware greens (grain / break affects roll)
- Puttable surfaces with dedicated putt physics
- External course format (`courses/michaels-course.json`) — third-party courses are data, not code

### Physics / simulation

- Gravity, air drag, wind force scaling
- Fairway / rough / deep-rough / sand / green frictions (distinct)
- Landing damping per surface
- Apex hang factor, curve force, curve-launch blend
- Bounce / rollout model with min bounce speed
- Slope influence on green roll
- Preview-line live calibration so aim dots match actual launch math

### QA / dev tools

- `designer/` — **Next.js + Tailwind Course Designer** (canvas-based hole editor with tool suite, properties panel, export modal, character/club libraries). Deployed as its own Vercel project with root `designer/`. This is the editor the AI course generator will feed into in Phase 2.
- `dev-tool-character-club-editor.html` — lightweight in-browser editor for characters and bags
- `docs/physics.html` — physics visualizer
- `scripts/physics-harness.js` — standalone physics test harness
- Sim scripts: `sim-test.js`, `sim-calibrate.js`, `sim-calibrate2.js`, `sim-swing-qa.js`, `sim-putt-qa.js`, `shot-qa.js`, `putt-qa.js`
- Stroke tracking per hole and per round
- Retry Hole / Quick Reset (+1 penalty) / Next Hole controls

---

## What's not yet shipped (tracked in [Roadmap](./Roadmap) and [Grand Vision](./Grand-Vision))

Listed here so expectations are clear — none of this is in the current build. Grouped by roadmap phase:

### Phase 1 — Foundation (in progress)
- **Stats → gameplay wiring**: club + character stats visibly affecting shot outcomes (distance curves, dispersion cones, forgiveness, touch, putting, composure). _In-flight in a parallel session._
- **Swing feel final pass**: tempo window, mishit curve, over-100% tradeoff, surface transitions. _In-flight this session._
- **Character visual layer**: creation-screen portrait, gear-driven appearance, on-course emotes (birdie / fist-pump / tilt / composure), species silhouette stubs.
- **Animations**: swing backswing + strike + follow-through, putt stroke, contact flash, turf divot, bunker splash, ball-in-cup with flag wobble, lip-out, walk-up.

### Phase 2 — AI Course Generation + Editor
- **Planet registry**: palette, flora set, gravity, atmosphere, water behavior, inspiration tags, per-planet.
- **AI course generator**: Q&A flow (planet, landscape, water, difficulty, wind, hole count, inspiration) → validated course JSON → opens in the existing designer.
- **Designer ↔ AI loop**: re-roll single hole, vary seed, make harder/easier, flora-density slider, play-test button, save-to-roster.

### Phase 3 — Career Skeleton
- **Save / progression persistence** beyond the current round
- **Tournaments with cuts**: fields of NPCs, leaderboards, cut lines, prize distribution
- **Career ladder**: open tournaments → Earth Tour → IGT Tour → Majors / Grand Slam
- **Money ledger** (entry fees, prize purses — no survival costs yet)

### Phase 4 — Survival Economy
- **Weekly cost bleed**: lodging, food, fold-jump costs, entry fees, repair costs, credit balance
- **Caddie mini-game**: picking up bags when broke, reading lies / wind / putts for a pro, tip economy
- **Stat training mini-games**: pay a coach → nail the mini-game → full stat gain (flub it, half gain)
- **Back-lot gambling underlayer**: skins, scramble, Nassau, parking-lot side bets

### Phase 5 — The Galaxy
- **Travel / galactic map**: star systems, planets, fold-jumps with Helion-9 cost
- **Planetary / course map**: clubhouse, pro shop, driving range, caddie hall, back lot, lodging, restaurants
- **Planet-varying course rules**: gravity, atmosphere, wind behavior, magnetic interference affecting ball flight
- **Alien species roster**: Voss, Rill, Paxi, and minor species with distinct playstyles

### Phase 6 — Sponsors, Property, Prestige
- **Sponsorships**: apparel sponsors (per-tournament fee + branded gear), equipment sponsors (post-IGT rentals), media obligations, rivalries
- **Property system**: parents' house (free, focus penalty) → rent apartment → buy Earth house → off-world second home → luxury estates
- **Media / reputation**: press conferences, fan following, sponsor tier gating

### Phase 7 — The Grand Slam
- The four Majors (Aeris Open, Keldaran Masters, Rill Invitational, Sol Classic) as ceremonial annual events
- Underground exhibition circuit
- Grand Slam tracking + "first human" achievement arc

---

## How to update this page

When a feature ships, move it from the "not yet shipped" list above into the appropriate section, and bump the **Build** / **Last updated** header at the top. Keep the language honest — this page is the anti-hype page. If it's half-done, say "partial" and describe what's missing.
