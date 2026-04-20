// -----------------------------------------------------------------------------
// designer/shared/theme.js — SINGLE SOURCE OF TRUTH for the game's visual
// language. Consumed by:
//   - the designer canvas    (designer/lib/renderer.ts)
//   - the game's SVG layer   (App.js)
//
// Earth v1.1 — locked picks from preview gallery:
//   Fairway B (Augusta diagonal stripes)
//   Green   A (diagonal mowing)
//   Rough   B (tuft dots — light highlight + dark shadow)
//   DeepR   B (dense dark clumps)
//   Sand    A (pure grain stipple, NO rim)
//   Water   B (broken-line ripples — Golf Story style)
//   Trees   Set 1 Golf Story Chunky (3-tone canopy + 1.2 outline + warm trunk + flat shadow)
// -----------------------------------------------------------------------------

// Fill / stroke palette. Keep all visual color constants here.
export const SURFACE_COLORS = {
  // Grass family
  fairway: '#8bc24c',
  green: '#a3d155',
  fringe: '#6fa544',
  rough: '#4f8c34',
  deepRough: '#2a5a24',

  // Arid
  sand: '#e8d7a3',
  sandShadow: '#c9b27a',
  desert: '#d8b57b',

  // Water
  water: '#4fb8c9',
  waterHi: '#8fe0e8',
  waterStroke: '#1c4a85', // reserved — not used for Earth (no rim) but available for other planets

  // Wood + earth
  treeTrunk: '#6b4423',
  treeTrunkAlt: '#8b5e3c', // palm trunk (warmer)
  birchBark: '#e8e4d8',

  // Tree canopy (Golf Story 3-tone)
  canopyShadow: '#1f4a1c',
  canopyBase: '#3e7a2a',
  canopyMid: '#4f8c34',
  canopyHi: '#6fa544',

  // Birch-specific highlight
  canopyBright: '#a3d155',

  // Teeing
  tee: '#5aad6a',
  teeStroke: '#3a8a4a',

  // UI accents
  flagRed: '#e85c4a',
  flagYellow: '#f2b84b',
  cupWhite: '#f8fafc',

  // Chrome
  outline: '#2a1f1a',      // 1.2px dark outline on all sprite props (trees, characters, ball, flag)
  dropShadow: 'rgba(26,36,20,0.5)', // flat ellipse under every sprite
};

// Universal outline spec — every sprite primitive with `outline: true` draws
// its stroke using this. Keep in one place so both renderers match.
export const OUTLINE = {
  color: SURFACE_COLORS.outline,
  width: 1.2,
};

// -----------------------------------------------------------------------------
// PATTERNS — repeating tile specs applied on top of the surface base fill.
//
// Structure:
//   {
//     size: Number,            // tile side length (square)
//     base: '#rrggbb',         // base fill
//     rotation?: Number,       // optional rotation of the tile (degrees)
//     overlays: [              // ordered, painted on top of base
//       { kind: 'rect',   x, y, w, h, fill },
//       { kind: 'circle', cx, cy, r, fill },
//     ]
//   }
//
// Each pattern here matches the variant Mike picked in the gallery.
// -----------------------------------------------------------------------------
export const PATTERNS = {
  // Fairway B — Augusta diagonal stripes
  fairway: {
    size: 22,
    base: '#8bc24c',
    rotation: 30,
    overlays: [
      { kind: 'rect', x: 0, y: 0, w: 11, h: 22, fill: 'rgba(0,0,0,0.08)' },
      { kind: 'rect', x: 0, y: 0, w: 1,  h: 22, fill: 'rgba(255,255,255,0.15)' },
    ],
  },

  // Green A — diagonal mowing stripes (same angle family as fairway, tighter)
  green: {
    size: 18,
    base: '#a3d155',
    rotation: 45,
    overlays: [
      { kind: 'rect', x: 0, y: 0, w: 2, h: 18, fill: 'rgba(255,255,255,0.12)' },
    ],
  },

  // Fringe — intermediate band color, subtle half-shade
  fringe: {
    size: 12,
    base: '#6fa544',
    overlays: [
      { kind: 'rect', x: 0, y: 0, w: 6, h: 12, fill: 'rgba(0,0,0,0.05)' },
    ],
  },

  // Rough B — tuft dots: light highlight + dark shadow mixed
  rough: {
    size: 18,
    base: '#4f8c34',
    overlays: [
      { kind: 'circle', cx: 5,  cy: 7,  r: 1.6, fill: 'rgba(150,200,110,0.30)' },
      { kind: 'circle', cx: 13, cy: 13, r: 1.6, fill: 'rgba(150,200,110,0.30)' },
      { kind: 'circle', cx: 15, cy: 3,  r: 1.0, fill: 'rgba(40,80,30,0.45)' },
    ],
  },

  // Deep rough B — dense dark clumps
  deepRough: {
    size: 16,
    base: '#2a5a24',
    overlays: [
      { kind: 'circle', cx: 4,  cy: 5,  r: 2.4, fill: 'rgba(40,70,30,0.60)' },
      { kind: 'circle', cx: 11, cy: 10, r: 2.4, fill: 'rgba(40,70,30,0.60)' },
    ],
  },

  // Desert — warm-brown speckle on tan
  desert: {
    size: 18,
    base: '#d8b57b',
    overlays: [
      { kind: 'circle', cx: 4,  cy: 5,  r: 1.0, fill: 'rgba(120,80,30,0.26)' },
      { kind: 'circle', cx: 13, cy: 11, r: 1.0, fill: 'rgba(120,80,30,0.26)' },
    ],
  },

  // Sand A — pure grain stipple on pale cream, NO rim
  sand: {
    size: 18,
    base: '#e8d7a3',
    overlays: [
      { kind: 'circle', cx: 3,  cy: 4,  r: 0.9, fill: 'rgba(170,130,70,0.35)' },
      { kind: 'circle', cx: 10, cy: 9,  r: 0.9, fill: 'rgba(170,130,70,0.35)' },
      { kind: 'circle', cx: 14, cy: 3,  r: 0.7, fill: 'rgba(170,130,70,0.35)' },
      { kind: 'circle', cx: 6,  cy: 14, r: 0.7, fill: 'rgba(170,130,70,0.35)' },
    ],
  },

  // Water B — broken-line ripples (Golf Story signature)
  water: {
    size: 38,
    base: '#4fb8c9',
    overlays: [
      { kind: 'rect', x: 0,  y: 6,  w: 14, h: 2, fill: '#8fe0e8' },
      { kind: 'rect', x: 20, y: 6,  w: 10, h: 2, fill: '#8fe0e8' },
      { kind: 'rect', x: 6,  y: 18, w: 18, h: 2, fill: '#8fe0e8' },
    ],
  },
};

// -----------------------------------------------------------------------------
// TREES — species-aware sprite primitives.
//
// Each species is { halfWidth, primitives[] } where:
//   - halfWidth  is the tree's horizontal half-extent in native units
//   - primitives is a list drawn in order, first-to-last (shadow first).
//
// When rendering an obstacle with radius r, scale = r / halfWidth. All coords
// in primitives are multiplied by that scale. Pine with r=12 → scale ≈ 0.43.
//
// Primitive kinds (both renderers understand these):
//   { kind: 'ellipse',  cx, cy, rx, ry, fill, outline?, rotation? }
//   { kind: 'rect',     x, y, w, h, fill, outline? }
//   { kind: 'triangle', points: [[x,y],[x,y],[x,y]], fill, outline? }
//   { kind: 'circle',   cx, cy, r, fill, outline? }
//
// `outline: true` → stroked with OUTLINE.color at OUTLINE.width.
// -----------------------------------------------------------------------------

const C = SURFACE_COLORS;

export const TREES = {
  pine: {
    halfWidth: 28,
    primitives: [
      { kind: 'ellipse', cx: 0, cy: 50, rx: 22, ry: 6, fill: C.dropShadow },
      { kind: 'rect', x: -4, y: 20, w: 8, h: 28, fill: C.treeTrunk, outline: true },
      { kind: 'triangle', points: [[-28, 22], [0, -40], [28, 22]], fill: C.canopyBase, outline: true },
      { kind: 'triangle', points: [[-24, 6],  [0, -34], [24, 6]],  fill: C.canopyMid,  outline: true },
      { kind: 'triangle', points: [[-18, -10],[0, -28], [18, -10]],fill: C.canopyHi,   outline: true },
    ],
  },

  oak: {
    halfWidth: 28,
    primitives: [
      { kind: 'ellipse', cx: 0, cy: 50, rx: 24, ry: 7, fill: C.dropShadow },
      { kind: 'rect', x: -3, y: 20, w: 6, h: 24, fill: C.treeTrunk, outline: true },
      { kind: 'circle', cx: 0,  cy: 0,  r: 28, fill: C.canopyBase, outline: true },
      { kind: 'circle', cx: -8, cy: -6, r: 12, fill: C.canopyMid },
      { kind: 'circle', cx: 10, cy: -8, r: 9,  fill: C.canopyHi },
      { kind: 'circle', cx: 2,  cy: -18,r: 6,  fill: C.canopyHi },
    ],
  },

  palm: {
    halfWidth: 22,
    primitives: [
      { kind: 'ellipse', cx: 0, cy: 50, rx: 20, ry: 5, fill: C.dropShadow },
      { kind: 'rect', x: -3, y: 10, w: 6, h: 36, fill: C.treeTrunkAlt, outline: true },
      // trunk segment ringlets
      { kind: 'rect', x: -3, y: 14, w: 6, h: 1.5, fill: 'rgba(0,0,0,0.35)' },
      { kind: 'rect', x: -3, y: 22, w: 6, h: 1.5, fill: 'rgba(0,0,0,0.35)' },
      { kind: 'rect', x: -3, y: 30, w: 6, h: 1.5, fill: 'rgba(0,0,0,0.35)' },
      // Fronds — explicit ellipses (not ellipseFan) so we can stagger colors/angles per frond.
      { kind: 'ellipse', cx: -16, cy: 4,  rx: 18, ry: 6, fill: C.canopyMid, outline: true, rotation: -20 },
      { kind: 'ellipse', cx: 16,  cy: 4,  rx: 18, ry: 6, fill: C.canopyMid, outline: true, rotation: 20 },
      { kind: 'ellipse', cx: 0,   cy: -10,rx: 20, ry: 6, fill: C.canopyHi,  outline: true },
      { kind: 'ellipse', cx: -14, cy: -4, rx: 16, ry: 5, fill: C.canopyHi,  outline: true, rotation: -40 },
      { kind: 'ellipse', cx: 14,  cy: -4, rx: 16, ry: 5, fill: C.canopyHi,  outline: true, rotation: 40 },
      { kind: 'circle', cx: 0, cy: 0, r: 3, fill: C.canopyShadow },
    ],
  },

  birch: {
    halfWidth: 20,
    primitives: [
      { kind: 'ellipse', cx: 0, cy: 50, rx: 18, ry: 5, fill: C.dropShadow },
      { kind: 'rect', x: -2, y: 12, w: 4, h: 34, fill: C.birchBark, outline: true },
      // bark tick marks
      { kind: 'rect', x: -2, y: 16, w: 4, h: 2, fill: C.outline },
      { kind: 'rect', x: -2, y: 24, w: 4, h: 2, fill: C.outline },
      { kind: 'rect', x: -2, y: 34, w: 4, h: 2, fill: C.outline },
      { kind: 'ellipse', cx: 0,  cy: -4,  rx: 20, ry: 24, fill: C.canopyHi, outline: true },
      { kind: 'ellipse', cx: -5, cy: -12, rx: 10, ry: 12, fill: C.canopyBright },
    ],
  },

  cypress: {
    halfWidth: 12,
    primitives: [
      { kind: 'ellipse', cx: 0, cy: 50, rx: 16, ry: 5, fill: C.dropShadow },
      { kind: 'ellipse', cx: 0,  cy: 8,  rx: 12, ry: 38, fill: C.canopyShadow, outline: true },
      { kind: 'ellipse', cx: -2, cy: 0,  rx: 8,  ry: 32, fill: C.canopyBase },
    ],
  },
};

// Fallback for legacy / unknown tree looks.
export const GENERIC_TREE = TREES.pine;

// Layer order used by both renderers. Highest index renders on top.
export const LAYER_ORDER = [
  'water',
  'desert',
  'deepRough',
  'rough',
  'fairway',
  'fringe',
  'green',
  'slopes',
  'tee',
  'sand',
  'trees',
  'cup',
];
