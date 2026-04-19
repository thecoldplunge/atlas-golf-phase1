# Roadmap — Path from Current State → Grand Vision

How we get from where we are today to [Intergalactic Golf Tour — the full game](./Grand-Vision).

> This is a direction-setting document. Phases are ordered by dependency — you can't build the economy before the swing feels good, and you can't build sponsors before there's an economy. Great courses are content, not infrastructure, so the AI course generator belongs alongside the foundation, not after it.

---

## Where we are today (2026-04-19)

**Build:** `IGT v3.5` — playable Expo + React Native prototype.

**Shipped:** tap-to-aim + Golden-Tee pad swing, full 14-club bag, nine-stat golfer profiles, three courses (Pine Valley, Michael's Course, Driving Range), multi-surface physics, slope-aware greens, Next.js **Course Designer** (in `designer/`) for hand-authoring holes.

See **[Current State](./Current-State)** for the full shipped checklist.

### In-flight right now (parallel sessions)

- **This session:** dialing in foundational gameplay feel — swing tempo, mishit model, spin behavior, friction / rollout by surface, putt speed, slope influence.
- **Parallel session:** making **club stats and character stats actually affect gameplay** — distance curves, dispersion cones, forgiveness on mishit, touch on chips, putting confidence, composure under pressure.

Both of these are **Phase 1** work. Phase 1 is not "done" until both land and feel good together.

---

## Phase 1 — Foundation (in progress)

**Goal:** the 30-second test. A new player picks up the game, hits ten shots, and says "this feels like a real swing." Everything downstream depends on this. The swing is the engine; the character is the face; the animations are what sells the contact.

### 1.1 Swing & physics feel (this session)

- **Tempo window** — center the "perfect" band on fun, not frustration. Wide enough that a good swing is rewarded; narrow enough that a perfect swing feels earned.
- **Mishit severity curve** — satisfying variance without lottery outcomes. A small mistake should feel small; a big one should feel learnable.
- **Over-100% power tradeoff** — real cost to pushing past the top, not free distance.
- **Putt speed + green slope** — greens that roll true, reward reading, and punish overreads just enough.
- **Surface transitions** — fairway vs rough vs sand vs deep rough should be felt, not just numerical. Sand penalty should make players curse their drive.
- **Spin model** — draw / fade readable in the aim preview, and the ball actually curves that way.

Instrument via `sim-*.js` so every change is measurable, not vibes.

### 1.2 Stats wiring (parallel session)

Every stat needs a clearly observable effect on shot outcome. If a player can't feel their 60-Power driver vs their 40-Power driver, the stat system isn't doing its job.

- **Club stats → shot physics**
  - `distance` → carry ceiling + distance curve shape
  - `accuracy` → dispersion cone width
  - `forgiveness` → mishit penalty scaling (high-forgiveness clubs absorb bad tempo better)
  - `spin` → achievable side-spin + spin ceiling
  - `feel` (putter) → putt speed control sensitivity
- **Core golfer stats → same systems, multiplicatively with club**
  - Power, Accuracy, Touch, Spin Control, Putting, Recovery
  - A 90-Power player with a 50-Power driver should outdrive a 50-Power player with a 90-Power driver, but by a smaller margin
- **Mental stats → secondary, pressure-dependent effects**
  - Focus — decays with bad lodging (wiring stub now; real effect in Phase 4)
  - Composure — resists tilt after a bad hole, shrinks dispersion cone on the next shot
  - Course Management — shows up in auto-club suggestions and risk/reward hints

**Calibration:** every adjustment passes the sim-harness before it lands. No more "feels better to me" alone.

### 1.3 Character visual layer

Today, a character is four color swatches (skin / hat / shirt / pants). Phase 1 upgrades this into a visual layer that carries through creation → selection → the course → celebrations.

- **Creation-screen portrait**
  - Larger, posed character render on the character create + select screens
  - Shows current gear loadout (head / torso / legs / feet / hands / accessories)
  - Rotatable or cycled idle pose — not just a static square
  - AI-generated portrait art per species archetype as the base, then recolored / re-geared on top
- **Gear slots wired to visuals (foundation catalog)**
  - Slots: **Head · Torso · Legs · Feet · Hands · Accessories · Bag · Clubs**
  - Ship with a small starter catalog (~3–5 items per slot) so equipping is observable now
  - Each equip updates both the portrait and the on-course sprite
  - Sponsor-wardrobe-override plumbing in place (no sponsors yet — just the hook)
- **On-course emotes**
  - Triggered by shot outcome: birdie celebration, long-putt fist-pump, water-ball head-shake, chip-in hype, missed-putt disgust, par composure
  - Keep the set small (4–8) but tuned — an emote that fires too often gets annoying
  - Composure stat modulates which emotes fire (low composure = more visible tilt)
- **Species visual differentiation (stub)**
  - Human baseline now
  - Voss / Rill / Paxi silhouette stubs so Phase 5 doesn't start from zero

### 1.4 Animations

Animation is what sells the contact. Without it, every stroke feels the same.

- **Swing animation** — backswing load tied to pad pull-down, strike on flick-up, follow-through that reflects strike quality (clean = smooth finish, mishit = off-balance)
- **Putt animation** — shorter, measured stroke; face alignment visible in finish
- **Ball-contact feedback** — contact flash, turf divot on full shots, bunker splash on sand shots, rough-grass ruffle on heavy lies
- **Ball-flight telegraphs** — subtle trail that reflects spin (draw curves one way, fade the other)
- **Result animations** — ball-into-cup with flag wobble + drop SFX, lip-out on a miss-edge, short-of-cup stall, out-of-bounds drop marker
- **Transition animations** — walk-up to ball after a shot (or a time-skip that still feels like presence)

### Exit criteria for Phase 1

- Ten-shot gut-feel test passes across three fresh testers.
- Swing calibration locked; `sim-*.js` green on all checks.
- Stat system observable: a high-stat combo produces visibly better results than a low-stat combo in a blind test.
- Character creation has a real portrait. At least one full gear change visibly updates both portrait and on-course sprite.
- Emotes fire on shot outcomes. Animations for swing, strike, putt, and ball-in-hole all ship.

---

## Phase 2 — Great Courses: AI Course Generation + Editor (🆕 high priority)

**Goal:** never start a course from scratch again. One conversation produces a playable course; the [Course Designer](../tree/main/designer) handles the tweak.

Great courses are the highest-value content in a golf game. Hand-authoring every hole doesn't scale — the IGT needs dozens of courses across many planets. Phase 2 builds an AI-assisted generator behind a short Q&A that produces a valid course JSON (matching `designer/HOLE_FORMAT.md`), then hands the output to the existing designer for polish.

### 2.1 Planet registry (prerequisite for course coherence)

Before the generator can produce anything planet-coherent, each planet needs a data-driven look and feel. This registry is also foundational for Phase 5 (The Galaxy).

**Per-planet metadata:**

| Field | What it controls |
| --- | --- |
| `palette.grass` | Primary + fringe + rough colors |
| `palette.water` | Water color + reflection tint |
| `palette.sand` | Bunker color |
| `palette.sky` / `atmosphere` | Background + ambient tint |
| `flora[]` | Which plants / trees / obstacle art variants are in-bounds (Earth pines vs Keldaran crystal spires vs Rill ice shards vs Paxi wind-reeds) |
| `gravity` | Subtle physics scalar, e.g. 0.92 on a low-g world, 1.08 on heavy-g. Not arcade — just enough that regulars say "this flies different" |
| `atmosphere.windBase` | Baseline wind magnitude and gustiness |
| `atmosphere.airDrag` | Drag modifier (thinner atmosphere = thinner drag) |
| `atmosphere.magneticInterference` | Boolean (used in later phases) |
| `water.behavior` | Standard penal / low-grav floaty / Rill frictionless-ice / Paxi reactive |
| `inspirationTags[]` | "links", "Augusta-coded", "desert", "tundra", "volcanic", "crystal", "lunar", etc. — generator uses these |

Ship with **Earth + 3 alien planets** (Keldara, Rill ice-shelf, Aeris Station) at minimum. Everything beyond is data, not engineering.

### 2.2 The Q&A course-generator flow

A conversational picker (or form, or both) that walks the user through:

1. **Planet** — locks palette, flora, gravity, water color
2. **Landscape style** — links / forest / desert / mountain / coastal / canyon / tundra / crystal / volcanic / lunar basin
3. **Water presence** — none / incidental / featured / dominant
4. **Difficulty** — casual / standard / hard / championship
5. **Wind** — calm / moderate / gusting / hazardous
6. **Hole count** — 3 / 9 / 18 (prototype-friendly defaults)
7. **Inspiration (free-text)** — "Augusta meets Aeris Station," "a links course with one crystal cathedral green," "Paxi wind-canyon, brutal par 3s"
8. **Par target** (optional, inferred if omitted)
9. **Name & designer credit**

**Output:** a complete `courses/<slug>.json` matching the schema in `designer/HOLE_FORMAT.md`:

- Every hole built with tee, fairway segments, green, slopes, hazards, obstacles, flora
- Coordinates placed on the game's world grid (tee at bottom, cup at top)
- Slopes distributed by difficulty (harder = more aggressive break, more reading required)
- Hazards by water-presence + landscape setting
- Flora/obstacle art picked from the planet's `flora[]` set only — no Earth pines on Keldara
- Wind slots filled from the wind setting
- Generation **seed** stored with the course so the same inputs reproduce the same course

### 2.3 Generator implementation approach

- **Backend:** LLM with structured output constrained to the course JSON schema (JSON-schema-validated before emit)
- **Planet registry is hard constraint**, not a suggestion — the LLM gets planet palette + allowed flora set in its context, and the emitted JSON is validated against them
- **Layout helper** — a small local algorithm that proposes hole bounding boxes on the world grid given hole-count + par mix; LLM fills in terrain/hazards/slopes within each box. Prevents holes from overlapping or escaping the canvas.
- **Par distribution** — rule-based (e.g. 18 holes = 4 par 3 + 10 par 4 + 4 par 5) with LLM able to nudge within difficulty tolerance
- **Difficulty budget** — harder courses get more slope strength, more hazards, narrower fairways, longer par-3s
- **Validator pass** — before the course saves, run it through `sim-*.js` or a fast headless sim to check each hole is completable with median stats in reasonable strokes

### 2.4 Designer ⇄ AI handoff loop

- **"Generate course"** entry point in the designer opens the Q&A picker
- Generated course opens in the designer with a fresh diff baseline
- Existing designer components (`CourseDesigner.tsx`, `HolePanel.tsx`, `PropertiesPanel.tsx`) handle tweaks
- **New designer affordances** for AI-touch-up ergonomics:
  - "Re-roll this hole" — regenerate hole N with a new prompt while keeping the rest
  - "Vary" — spin a sibling course from the same inputs, different seed
  - "Make harder / easier" — ask the LLM to adjust difficulty in-place
  - "Swap flora density" — slider; the generator applies it
  - Nudge green position/size, fairway segments, hazards, obstacles (largely exists)
- **"Play test"** — drop directly into the round view from the designer
- **"Save to roster"** — add to the playable course list

### 2.5 Regeneration variants

- **Re-roll hole N** — keep 1..N-1 and N+1..end, regenerate hole N
- **Vary seed** — new course from same Q&A answers
- **Clone + tweak** — duplicate an existing course and ask AI to change one dimension ("same but harder," "same but windier," "same but add a crystal cathedral par 3")

### Exit criteria for Phase 2

- A playable 9-hole course generated end-to-end from a ≤1-minute Q&A.
- Generated courses are planet-coherent (Keldara has no Earth pines; Rill has no sand dunes).
- The designer can meaningfully tweak any hole the generator produced, including re-rolling a single hole.
- Two people who didn't build the feature ship a course via the flow and report it was fun.
- Every generated course passes the sim-completability validator before save.

---

## Phase 3 — Career Skeleton

**Goal:** turn the replayable prototype into a career loop.

- Player save / progression persistence (local-first, account-backed later)
- Tournament structure: multi-round events with cut lines, NPC fields, leaderboards
- NPC opponents using the nine-stat system — species roster seeded (Voss power, Rill precision, Paxi touch, human variants), each with stat priors
- Earth open-tournament circuit → Earth Tour qualifier flow → Earth Tour Card gating
- Simple money ledger (entry fees + prize purses). No survival costs yet.
- Post-round screens: leaderboard, earnings, ranking delta
- Ranking system

**Exit criteria:** a new player can enter an open tournament, make a cut, cash a check, and progress toward an Earth Tour Card.

---

## Phase 4 — Survival Economy

**Goal:** switch on "the money is the game."

- Weekly cost bleed: lodging, food, entry fees, gear repair
- Lodging slots: parents' house (free, **focus penalty**) → rent-apartment → hotel → luxury suite
- **Caddie mini-game** for broke-state recovery (read lie, call club, call line, collect tip; better reads → better tips → requested-back recurring gigs)
- **Stat training mini-games** — pay a coach, play a mini-game, earn stat gain (full on perfect, half on flub)
- **Back-lot side bets** on home courses: skins, Nassau
- Food system (skipping meals → focus penalty)

**Exit criteria:** a player can go broke, caddie back, feel the survival pressure, and still want to play another week.

---

## Phase 5 — The Galaxy

**Goal:** leave Earth.

- Galactic map with star systems, planets, fold-jumps, Helion-9 costs
- Planetary / course map UI: clubhouse, pro shop, driving range, caddie hall, back lot, lodging, restaurants
- Planet-varying physics applied fully: gravity, atmosphere, wind, magnetic interference on ball flight
- International tournaments (off-world), IGT Tour Card qualifier
- Full species roster with distinct playstyles: Voss (power), Rill (precision), Paxi (touch/wind)
- Expanded flora / art / palette packs per planet

This phase is where the **AI course generator earns its keep** — every new planet is a palette + flora pack, and courses scale.

**Exit criteria:** a player can qualify out of Earth and play at least one course on each of the four Major host worlds.

---

## Phase 6 — Sponsors, Property, Prestige

**Goal:** deep progression — the reasons you keep winning after you're winning.

- Apparel sponsor system: appearance fees, branded gear wardrobe override, rivalries, media obligations
- Equipment sponsors (IGT-only): premium club rentals gated on ranking
- Character customization fully wired across all slots, full catalog
- Property ladder: apartment → Earth house → off-world second home → luxury estates on prestige worlds
- Fan / media reputation system
- Social events, sponsor parties, VIP tour access unlocked by property tier

**Exit criteria:** finishing a tournament can generate a sponsor offer; owning property is felt week-to-week.

---

## Phase 7 — The Grand Slam

**Goal:** the endgame.

- The four Majors as distinct, ceremonial, once-a-year events:
  - **The Aeris Open** on Aeris Station
  - **The Keldaran Masters** on Keldara-7
  - **The Rill Invitational** on a Rill ice shelf
  - **The Sol Classic** on Earth
- Major courses generated via the AI pipeline at championship difficulty, then heavily hand-polished in the designer
- Underground exhibition circuit (high-stakes, organized by fixers / bookmakers)
- Grand Slam tracking + "first human" achievement arc
- Endgame narrative beats

**Exit criteria:** a player can plausibly hold all four Majors in a single career and feel like they earned it.

---

## Cross-phase work (ongoing)

- **Audio & music** — starts Phase 1 where budget allows; proper pass in Phase 3
- **VFX polish** — animations that scale with stat tier, premium-gear fx (Phase 6)
- **Content** — more flora packs, more species, more apparel, more clubs
- **Economy balance** — every phase that adds a cost or reward needs a pass
- **Telemetry** — once there are players, measure what's felt vs. what's designed

## Open questions (parked, resolve when the phase that needs the answer opens)

- **Tournament pacing** — full-play-your-own-shots vs simulate-the-field? (Current lean: full play for you, simulated for the rest of the field, with highlight reels.)
- **Cost-bleed granularity** — daily vs weekly vs per-event?
- **Multiplayer** — in scope or never?
- **Save persistence** — local-first, cloud-sync, or account-backed from day one?
- **AI course gen billing** — local LLM vs hosted? (Hosted is faster to ship; local gives the game offline mode.)

---

## Phase dependency graph

```
Phase 1 (Foundation)  ──┐
                        ├──► Phase 3 (Career Skeleton) ──► Phase 4 (Economy) ──► Phase 5 (Galaxy) ──► Phase 6 (Sponsors) ──► Phase 7 (Grand Slam)
Phase 2 (AI Courses) ──┘
```

Phase 1 and Phase 2 can run in parallel once Phase 1 foundation lands. Phase 2 depends on Phase 1 physics being stable (so courses don't have to be re-tuned later). Everything after depends on both.
