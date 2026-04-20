# IGT Visual Design Guide — Earth v1

> Soft-pixel modern retro, Golf-Story-inspired. Earth only for now; per-planet
> variants (Keldara, Rill, Paxi, Aeris) layer on top of this reference.

**Owner:** visual direction lives in `designer/shared/theme.js` — that file is
the single source of truth. Both the designer canvas (`designer/lib/renderer.ts`)
and the game's SVG layer (`App.js`) read from it.

## 0. Locked picks (v1)

Selected by Mike from the preview gallery:

| Surface | Pick | Notes |
| --- | --- | --- |
| Fairway | **B** | Diagonal stripes, Augusta-style |
| Green | **A** | Diagonal mowing stripes (same angle as fairway — unity) |
| Rough | **B** | Tuft dots (light highlight + dark shadow) |
| Deep Rough | **B** | Dense dark clumps |
| Sand | **A** | Pure grain stipple — NO rim |
| Water | **B** | Broken-line ripples |
| Trees | **Set 1** | Golf Story Chunky (3-tone canopy + outline + trunk + shadow) |

### Principles extracted from these picks (apply to all future design)
- **Texture over flat.** Every surface needs a pattern overlay; flat fills feel cheap.
- **Diagonal mowing unity.** Fairway + green both diagonal, same angle.
- **Dot-contrast grass.** Use highlight + shadow dots (not blade strokes) for rough varieties.
- **No rims.** Don't add crisp framing strokes to surfaces unless asked; let color-blocks speak.
- **Chunky outlined sprites.** 1.2px dark outlines on all discrete props (trees, characters, ball, flag, rocks). Terrain stays un-outlined.

## 1. Aesthetic brief

**Reference:** Golf Story (Sidebar Games, 2017) and Sports Story (2022).
- Not hard NES/SNES pixel grid. Not Augusta broadcast TV. Cozy, warm, earthy.
- Flat color blocks with 3-tone shading (shadow / base / highlight).
- 1–2px dark outlines on characters, props, and trees. **No outlines on terrain.**
- Soft ellipse drop-shadow directly beneath trees/props — no directional offset.
- Implied upper-left sun; highlights consistently on upper-left of volumes.
- Palette is warm, slightly desaturated. Greens lean yellow.
- Nothing screams; everything harmonizes.

**Complementary techniques to borrow:**
- **Neo Turf Masters** — bold fairway mow stripes, sharp bunker scalloping, crisp green/fringe/fairway separation. Gold standard for top-down golf.
- **Stardew Valley** — scattered grass tufts, 3-shade canopies, animated 4-frame water (later).
- **Eastward** — palette discipline: a limited color ramp per scene.

## 2. Earth palette (reference)

Golf Story palette, slightly refined. All values are final for v1.

| Surface | Hex | Notes |
| --- | --- | --- |
| Fairway | `#8bc24c` | Warm lime-grass, slightly yellow bias |
| Putting green | `#a3d155` | Brighter + cooler than fairway |
| Fringe | `#6fa544` | Intermediate — always 1-band ring around green |
| Rough | `#4f8c34` | Muted olive |
| Deep rough | `#2a5a24` | Deep pine, used sparingly |
| Sand bunker | `#e8d7a3` | Pale wheat/cream — NOT yellow, NOT white |
| Sand rim | `#c9b27a` | 2px inner-rim shadow |
| Water | `#4fb8c9` | Cyan-turquoise, NOT navy — reads tropical/shallow |
| Water highlight | `#8fe0e8` | Broken-line ripple bands |
| Tree trunk | `#6b4423` | Warm brown, only partly visible |
| Birch bark | `#e8e4d8` | Off-white with horizontal `#2a1f1a` tick marks |
| Canopy base | `#3e7a2a` | Back/shadow tone |
| Canopy mid | `#4f8c34` | Same as rough — visual unity |
| Canopy highlight | `#6fa544` | Upper-left sun tone |
| Canopy outline | `#1f4a1c` | 1.2px stroke |
| Character outline | `#2a1f1a` | Dark desaturated brown, not pure black |
| Drop shadow | `rgba(26,36,20,0.5)` | Flat ellipse beneath every volume |
| Flag red | `#e85c4a` | Warm accent — pair with flag stick `#f8fafc` |

## 3. Surface treatment

Each surface is rendered as **base fill** + **pattern overlay**. Specs below
are what `designer/shared/theme.js` encodes; both renderers build native
patterns (Canvas 2D tiles for designer, SVG `<pattern>` for game) from
these numbers.

### Fairway
- **Recommended (v1 pick, Variant C):** flat `#8bc24c` + sparse grass stipple (3 light dots + 2 dark dots per 24×24 tile). Golf-Story cozy, no stripes.
- **Alternative A** — vertical mowing stripes every 16px at 12% opacity. Reads more like Neo Turf.
- **Alternative B** — diagonal stripes at 30°, Augusta-style. Prestige but busy on short holes.

### Putting green
- **Recommended (v1 pick, Variant A):** `#a3d155` + faint 45° diagonal light stripes (2px every 18px). Classic PGA look.
- **Alternative B** — radial sheen gradient (`#b9e67a` center → `#7fc350` edges). No pattern.
- **Alternative C** — tight stipple like Fairway C, matches if Fairway C is picked.

### Fringe
- A single 1-band ring of `#6fa544`, ~8px wide. No pattern. Always present around the green — matches Golf Story / Neo Turf convention.

### Rough
- **Recommended (v1 pick, Variant A):** `#4f8c34` + small curved grass-blade strokes at low opacity. Golf Story does this exactly.
- **Alternative B** — mixed light + dark tuft dots.
- **Alternative C** — dark crosshatch. Good at distance; busy up close.

### Deep rough
- **Recommended (v1 pick, Variant A):** `#2a5a24` + taller grass-blade strokes, same motif as Rough A.
- **Alternative B** — dark clump circles (dense shrub).
- **Alternative C** — flat color, no pattern.

### Sand bunker
- **Recommended (v1 pick, Variant C):** `#e8d7a3` + fine warm-brown grain dots + crisp 2px `#c9b27a` inner-rim shadow. Sharpest bunker read; matches Neo Turf rim treatment.
- **Alternative A** — stipple only (no rim).
- **Alternative B** — radial-gradient inset shadow (bright center → dark edges).

### Water
- **Recommended (v1 pick, Variant B):** `#4fb8c9` + horizontal broken-line highlights (`#8fe0e8` dash segments). The exact Golf Story / Sports Story water treatment.
- **Alternative A** — smooth cyan gradient + wave-shaped highlight curves.
- **Alternative C** — sparkle dots (lighter + darker). Busier.

## 4. Tree species library

Every tree renders: **drop-shadow ellipse** → **trunk (with 1.2px outline)** →
**canopy (3 layered shapes with 1.2px outline on the back layer only, highlights
unoutlined)**.

Pinned species (Set 1 · Golf Story Chunky):

### Pine
- 3 stacked triangles, darker base → brightest top (`#3e7a2a` → `#4f8c34` → `#6fa544`).
- Trunk `#6b4423`, 8×28px.
- Back triangle outlined; top two unoutlined for softer highlights.

### Oak
- Large base circle `#3e7a2a` (outlined), two un-outlined highlight circles `#4f8c34` and `#6fa544` on the upper-left.
- Trunk `#6b4423`, 6×24px.

### Palm
- 5 frond-ellipses fanned from a central trunk `#8b5e3c` (taller/ochre than other trunks).
- Base fronds `#4f8c34`, top fronds `#6fa544`.
- Central `#1f4a1c` dot at frond origin.

### Birch
- Off-white trunk `#e8e4d8`, 4×34px, with 3 horizontal tick marks `#2a1f1a`.
- Single oval canopy `#6fa544` + smaller highlight oval `#a3d155` on upper-left.

### Cypress
- Tall vertical teardrop, 2 tones only (`#1f4a1c` base outlined + `#3e7a2a` mid). No highlight — used as vertical punctuation, not a focal point.

## 5. Characters

Golf Story characters are chunky, round, outlined, 3-tone shaded. IGT uses
the same recipe at two scales: **top-down sprite** (on-course, small) and
**portrait** (character creation / select / cutscenes, larger).

### Character color slots

Every character body has customizable slots. Keep each slot's base color
saturated but not loud, and always pair with a darker shade and lighter
highlight.

| Slot | Base (example) | Shade | Highlight | Notes |
| --- | --- | --- | --- | --- |
| Skin | `#f0c08c` | `#c38a5a` | `#fde0c0` | Add variants for species (Voss grey-blue, Rill pearl-white, Paxi amber, etc.) |
| Hair / Hat | `#263246` | `#141a26` | `#3a4866` | Hat takes priority when worn |
| Shirt | `#3f76c1` | `#254a80` | `#6aa0e2` | Sponsor override can replace |
| Pants | `#2e563c` | `#1a3426` | `#4f8055` | Usually darker than shirt |
| Shoes | `#2a1f1a` | — | `#5a4033` | Golf spikes |
| Glove | `#f5f3e8` | `#c9c5b0` | — | Single-hand |
| Club bag | varies by sponsor | — | — | Stands behind the character |
| Outline | `#2a1f1a` | — | — | 1.2px on all body parts |

### Top-down sprite (in-course)

Viewed from above. Simplified silhouette; player identity comes from hat + shirt color.

- Bounding box: ~32×32 world units (scales to ~10% of a 320-yd hole)
- Head: round, visible from above as a cap-top disc
- Hat: oval or curved-brim, covers head
- Shoulders: simple rounded rectangle
- Arms + club: visible when in swing pose — the club extends ~24 units diagonally
- Shadow: flat ellipse directly below, 24×7 at 50% opacity
- 1.2px outline on hat + shoulders, no outline between body parts

**Swing poses (drawn as 4 sprite frames, not procedural):**

| Frame | Pose | When shown |
| --- | --- | --- |
| `idle` | Standing, club resting beside | Between shots, in menus |
| `address` | Club held toward ball, knees bent | Aim / power-up mode |
| `backswing` | Arms raised behind shoulder | Pad pull-down phase |
| `contact` | Arms crossing body, club extended past ball | Strike moment |
| `follow-through` | Arms at opposite shoulder, club finished | 0.3s after strike |

Optional putting pose variant (address-putting — club straight down, knees more bent).

### Portrait (character creation / select / cutscenes)

Viewed 3/4 front. Larger, more detail, more customization visible.

- Bounding box: ~120×160 drawn units (rendered at 1:1 in the creation UI)
- Head: ~40% of vertical space — large face, cute proportions
- Eyes: 2–3 pixel dots. Different shapes per species (round, narrow, slitted)
- Mouth: single pixel (idle) or small curve (expressive)
- Hair: visible under hat rim; distinct color variant
- Body: slight perspective — front shoulder broader than back
- Shadow ellipse beneath feet
- All body parts outlined in `#2a1f1a` at 1.2px

**Emotes (portrait variants):**

Used in creation UI, caddie dialogue, and in-round reactions:

- `neutral` — default face
- `focused` — eyes narrower, slight brow
- `happy` — small smile, wider eyes
- `disappointed` — eyes closed, corners of mouth down
- `tilted` — one eye narrowed, mouth zigzag (for composure-break moments)
- `hype` — arms slightly raised, wide smile

Six total. Enough to cover shot outcomes without authoring a dozen.

### Species silhouettes

Even without species-specific art, the human/Voss/Rill/Paxi archetypes should
read differently at a glance via silhouette alone. Lock these shape cues now:

| Species | Head shape | Body proportion | Accent |
| --- | --- | --- | --- |
| Human | Round | Balanced | — |
| Voss | Elongated, small crest | Broad shoulders, thick legs | Skin `#8faab8` (pressure-adapted grey-blue) |
| Rill | Oval, tall | Narrow, tall | Skin `#f2e8d6` (pearl), metallic accessories |
| Paxi | Wedge, narrow | Slim, elegant | Skin `#e8c88a` (amber), biosensory "whiskers" near temples |

Draw humans first; species stubs come in Phase 1.3 per the roadmap.

## 6. Props & decorations

Supporting visual vocabulary. Each prop rendered as **outlined sprite** (not
terrain) with a drop-shadow ellipse. Sizes are world-unit defaults; they scale
with the in-game camera.

### Pin flag

- Pole: 2px wide, 24 units tall, `#f8fafc` with `#2a1f1a` outline
- Cup: 5 units wide, `#2a1f1a` hole at base of pole
- Flag: small triangular pennant
  - Regular pin: `#e85c4a` (warm red — IGT accent color)
  - Championship pin: `#f2b84b` (flag-yellow)
  - Paired with a 1px `#2a1f1a` outline
- Slight flag-wobble animation (out of scope v1; static)

### Ball

- 4–6 world-unit diameter depending on club
- Fill `#f8fafc`, 0.6px `#2a1f1a` outline
- Subtle 2-pixel dimple highlight on the upper-left (implied sun)
- Drop shadow when above ground (ball flight): small flat ellipse below launch point
- Ball-mark on green: a tiny dark `#1f4a1c` oval where the ball landed (stays for the round)

### Tee markers

Color-coded cubes on either side of the tee box:

| Tee | Color | Skill level |
| --- | --- | --- |
| Back (championship) | `#2a1f1a` | Hardest |
| Middle (regular) | `#3879c5` | Standard |
| Forward (member) | `#f8fafc` (white) | Easier |
| Ladies | `#e85c4a` | Shortest |

Rendered as 4×3 outlined blocks. Only the tee you're playing from is visible in-round.

### Yardage markers & OB stakes

- **150-yard marker:** short white stone `#f0ece0` with `#2a1f1a` outline, centered in fairway
- **Red hazard stakes:** `#e85c4a` vertical posts, 3×14 units, edge of lateral water
- **Yellow hazard stakes:** `#f2b84b` vertical posts, edge of frontal water
- **White OB stakes:** `#f8fafc` vertical posts, 3×12 units, outside bounds

All stakes have a 1.2px `#2a1f1a` outline.

### Cart path

- Fill `#c9b27a` (same as sand rim — warm tan)
- Darker `#8b6a3a` edge strokes on both sides, 1px
- Rendered as a capsule chain, same system as fairway waypoints

### Bridge (over water)

- Fill `#8b5e3c` (warm wood brown)
- 2 darker `#5a3a1e` plank lines across the deck (perpendicular to travel)
- Side rails: 1px `#2a1f1a` lines
- Drop shadow ellipse beneath

### Rocks

- 3–5 sizes: small (4r), medium (8r), large (14r)
- Fill: grey `#8a8a82` with darker `#5a5a52` shadow dot on lower-right
- 1.2px `#2a1f1a` outline
- Scatter in rough, deep rough, desert; framing for water edges

### Flowers

- 4 colors: white `#f8fafc`, red `#e85c4a`, yellow `#f2b84b`, purple `#a07ac8`
- Drawn as 5-petal cluster (5 small circles around a center dot)
- 2–4 scale variants, always with `#1f4a1c` base dot and no outline (small enough)
- Scatter in rough patches, tee-box edges, decorative corners

### Fairway divots

- After a full shot: small teardrop patch of `#6b4423` (dirt) in the fairway where the club contacted
- 3×4 world units, rotated toward shot direction
- 1px `#4a2e16` outline
- Persist for the round

### Ball marks on greens

- After a putt-chip landing: small dark oval `#1f4a1c`, 2×1 units
- Persist for the round; cleaned up between rounds

### Divot tools / sand rake

- Rake trails: alternating `#c9b27a` and `#b39660` parallel lines across a bunker (3–5 lines)
- Purely decorative; doesn't affect physics

### Spectators / gallery (tournament courses only)

- Abstract blobs in `#2a1f1a` outline with 2-tone fill
- Drawn as small chunky silhouettes at course edges
- Scale: ~18×24 units each
- Scope-cut for v1; queued for Phase 3 tournament content

## 7. Z-order (all renderers)

Back to front:

1. Course backdrop (dominant hole `background` color)
2. Water hazards
3. `desert` / `deepRough` / `rough` surface patches
4. Fairway
5. Fringe
6. Green
7. Green slope arrows (putting mode only)
8. Sand bunkers
9. Tee box
10. Trees (with drop shadows)
11. Cup + flag

Sand is drawn **over** fairway / green because real bunkers are surface
features on the turf, not subterranean. Water is **under** fairway because
a fairway can run alongside water (water reads as outside-the-corridor).

## 8. Scope cuts for v1

- No animation. Flag stays still, water is static, trees don't rustle.
  Animation comes in a later pass.
- No weather or time-of-day variation. Single overhead lighting only.
- No per-planet palette variants yet. We nail Earth first, then recolor
  for Keldara (rust), Rill (ice-blue), Paxi (canyon), Aeris (orbital neon).

## 9. Changing the theme

Edit `designer/shared/theme.js`. Both renderers pick it up.

```js
// shared theme (partial)
export const SURFACE_COLORS = {
  fairway: '#8bc24c',
  green:   '#a3d155',
  fringe:  '#6fa544',
  ...
};

export const PATTERNS = {
  fairway: { size: 24, base: '#8bc24c', overlay: { kind: 'stipple', ... } },
  ...
};

export const TREES = {
  pine: [
    { kind: 'triangle', h: -40, b: 28, y: 22, fill: '#3e7a2a' },
    ...
  ],
  ...
};
```

## 10. Change log

| Version | Date | Notes |
| --- | --- | --- |
| v1.0 | 2026-04-19 | Initial Earth design guide. Golf Story / Sports Story reference. |
| v1.1 | 2026-04-19 | User picks locked (fairway B / green A / rough B / deepRough B / sand A / water B / trees Set 1). Added Characters (top-down sprite + portrait + emotes + species silhouettes), Props (flag, ball, tee markers, yardage + OB stakes, cart paths, bridges, rocks, flowers, divots, ball marks, rake lines, spectators). |
