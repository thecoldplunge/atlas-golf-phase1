# IGT Visual Design Guide — Earth v1

> Soft-pixel modern retro, Golf-Story-inspired. Earth only for now; per-planet
> variants (Keldara, Rill, Paxi, Aeris) layer on top of this reference.

**Owner:** visual direction lives in `designer/shared/theme.js` — that file is
the single source of truth. Both the designer canvas (`designer/lib/renderer.ts`)
and the game's SVG layer (`App.js`) read from it.

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

## 5. Z-order (all renderers)

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

## 6. Scope cuts for v1

- No animation. Flag stays still, water is static, trees don't rustle.
  Animation comes in a later pass.
- No weather or time-of-day variation. Single overhead lighting only.
- No per-planet palette variants yet. We nail Earth first, then recolor
  for Keldara (rust), Rill (ice-blue), Paxi (canyon), Aeris (orbital neon).

## 7. Changing the theme

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

## 8. Change log

| Version | Date | Notes |
| --- | --- | --- |
| v1 | 2026-04-19 | Initial Earth design guide. Golf Story / Sports Story reference. |
