# Roadmap

How we get from [Current State](./Current-State) → [Grand Vision](./Grand-Vision).

> This is a direction-setting document, not a schedule. Phases are ordered by dependency — you can't build the economy before the swing feels good, and you can't build sponsors before there's an economy.

---

## Phase 1 — Swing Prototype ✅ (shipped as `IGT v3.5`)

**Goal:** make the core swing feel good enough to build a game on.

- Tap-to-aim + Golden-Tee pad swing with power meter, tempo window, spin
- Full 14-club bag with per-club stats
- Nine-stat golfer profiles
- Three hand-built courses (Pine Valley, Michael's Course, Driving Range)
- Slope-aware greens, multi-surface physics
- Dev tools: character/club editor, physics harness, sim QA scripts

→ See [Current State](./Current-State) for the detailed checklist.

---

## Phase 2 — Career Skeleton

**Goal:** turn the prototype into a career loop you can replay.

- Player save / progression persistence
- Round → tournament structure (multi-round events, cut lines, leaderboards)
- NPC field with alien opponents using the existing nine-stat system
- Earth open tournaments + Earth Tour qualifier flow
- Simple money ledger (entry fees, prize purses) — no survival costs yet
- Ranking system + Earth Tour Card gating

**Exit criteria:** you can play an open tournament, make a cut, cash a check, and earn an Earth Tour Card.

---

## Phase 3 — Survival Economy

**Goal:** switch on "the money is the game."

- Weekly cost bleed: lodging, food, travel, repairs, entry fees
- Parents' house / rent-apartment lodging slots (focus penalty at home)
- Fold-jump cost model for inter-system travel (Phase 3 keeps travel on Earth; Phase 4 goes galactic)
- Broke-state rescue: **caddie mini-game** (read the lie, pick the club, call the line, collect a tip)
- Basic back-lot side bets (skins / Nassau) on home courses

**Exit criteria:** you can go broke, caddie your way back, and feel the pressure of "make the cut or starve."

---

## Phase 4 — The Galaxy

**Goal:** leave Earth.

- Galactic map with star systems, planets, fold-jumps, and Helion-9 costs
- Planetary / course map UI: clubhouse, pro shop, driving range, caddie hall, back lot, lodging, restaurants
- Planet-varying conditions: gravity, atmosphere, wind behavior, magnetic interference affecting ball flight
- International tournaments (off-world), IGT Tour Card qualifier
- Species roster fleshed out: Voss (power), Rill (precision), Paxi (touch/wind), plus minor species

**Exit criteria:** you can qualify out of Earth and onto the IGT.

---

## Phase 5 — Sponsors, Property, Prestige

**Goal:** deep progression — the reasons you keep winning.

- Apparel sponsors: appearance fees, branded gear overriding your wardrobe, rivalries, media obligations
- Equipment sponsors (IGT-only): premium club rentals gated on ranking
- Character customization slots fully wired (head/torso/legs/feet/hands/accessories/bag/clubs) with visible appearance changes
- Stat training mini-games (pay → play → stat gain)
- Property ladder: apartment → Earth house → off-world second home → luxury estates
- Fan / media reputation system

**Exit criteria:** finishing a tournament opens a sponsor offer; buying a house feels meaningful.

---

## Phase 6 — The Grand Slam

**Goal:** the endgame.

- The four Majors — Aeris Open, Keldaran Masters, Rill Invitational, Sol Classic — as distinct, ceremonial, once-a-year events
- Major-specific courses built to showcase their host world
- Underground exhibition circuit (high-stakes, organized by fixers)
- Grand Slam tracking, history, and the "first human" achievement arc
- Endgame narrative beats

**Exit criteria:** a player can plausibly hold all four Majors in a single career and feel like they earned it.

---

## Things that get built across phases (non-phased)

- Audio + music
- Polish: animations, VFX, UI theming
- Content: more courses, more golfers, more clubs, more apparel, more planets
- Economy balancing passes — every phase that adds a cost or reward needs one

---

## Open questions

- Tournament pacing: real-time round play vs. simulated-with-highlight? Leaning toward full play for your own shots, simulated for the rest of the field.
- How granular should the weekly cost bleed be? Too granular and it's spreadsheet hell; too coarse and the survival pressure doesn't bite.
- Multiplayer / asynchronous tournaments — in scope, or never?
- Save persistence model: local only, cloud-synced, or account-backed from day one?

Park these here; resolve them when the phase that needs the answer arrives.
