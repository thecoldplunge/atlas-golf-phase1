// -----------------------------------------------------------------------------
// shared/theme.js — single source of truth for terrain colors, pattern params,
// and tree species art. Consumed by BOTH the game (App.js) and the designer
// (designer/lib/renderer.ts via designer/lib/shared-theme.ts shim).
//
// If you change a visual here, both renderers pick it up. Keep values as plain
// JS primitives so Metro and Next.js can import this without transpilation
// fuss.
// -----------------------------------------------------------------------------

// Fill colors for each terrain class. Matches the designer canvas exactly.
export const SURFACE_COLORS = {
  // Backdrop / rough
  rough: '#2a5220',
  // Fairway
  fairway: '#7ab855',
  // Putting green + fringe
  green: '#4ec96a',
  fringe: '#5fa048',
  // Secondary surfaces
  deepRough: '#193818',
  desert: '#d8b57b',
  // Hazards
  sand: '#d4b96a',
  sandStroke: '#b59b6a',
  water: '#3f88bc',
  waterStroke: '#1c4a85',
  // Other
  tee: '#5aad6a',
  teeStroke: '#3a8a4a',
};

// Pattern specifications. Each pattern is a small repeating tile that overlays
// a surface's base fill to add texture (mowing stripes, sand stipple, water
// waves, etc). Both renderers build their native pattern representation from
// these specs — the game uses SVG <pattern>, the designer uses a Canvas 2D
// offscreen bitmap, but the numbers are the same.
export const PATTERNS = {
  rough: {
    size: 20,
    base: '#2a5220',
    // Two diagonal hairlines running SW→NE every 6px, at low opacity.
    overlay: { kind: 'diagonalLines', stroke: 'rgba(0,0,0,0.08)', strokeWidth: 1, spacing: 6, angle: -45 },
  },
  fairway: {
    size: 16,
    base: '#7ab855',
    // Mowing stripes: darker half on the right + light sheen band on the left.
    overlay: {
      kind: 'stripes',
      bands: [
        { offsetX: 0, width: 2,  color: 'rgba(255,255,255,0.08)' }, // sheen
        { offsetX: 8, width: 8,  color: 'rgba(0,0,0,0.07)' },       // shade
      ],
    },
  },
  fringe: {
    size: 12,
    base: '#5fa048',
    overlay: {
      kind: 'stripes',
      bands: [{ offsetX: 0, width: 6, color: 'rgba(0,0,0,0.05)' }],
    },
  },
  green: {
    size: 18,
    base: '#4ec96a',
    // Diagonal light mowing stripes.
    overlay: {
      kind: 'diagonalLines',
      stroke: 'rgba(255,255,255,0.07)',
      strokeWidth: 1,
      spacing: 6,
      angle: 45,
    },
  },
  sand: {
    size: 18,
    base: '#d4b96a',
    // Sand-grain stipple: small filled dots on a 5px vertical, 6px horizontal
    // staggered grid.
    overlay: {
      kind: 'stipple',
      fill: 'rgba(180,148,80,0.45)',
      dotRadius: 1.2,
      // grid: y in {2,7,12,17}; x offset alternates 2/4 each row
      grid: { rowStep: 5, colStep: 6, rowOffset: [2, 4] },
    },
  },
  water: {
    size: 24,
    base: '#3f88bc',
    // Horizontal wavy lines every 8px.
    overlay: {
      kind: 'waves',
      stroke: 'rgba(214,236,255,0.28)',
      strokeWidth: 1.5,
      rowStep: 8,
      rowStart: 4,
      amplitude: 2.5,
      segmentWidth: 4,
    },
  },
};

// Tree species art. Each entry is an ordered list of primitives rendered at
// (centerX, centerY) with radius `r`. Primitive coordinates are in UNITS OF r,
// so a `dx: 0.4, dy: -0.2, r: 0.74` means "a circle centered at (cx + 0.4*r,
// cy − 0.2*r) with radius 0.74*r". Matches the designer's drawTree() exactly.
export const TREES = {
  pine: [
    { kind: 'circle', dx: 0,    dy: -0.2, r: 0.74, fill: '#2f6e3e' },
    { kind: 'circle', dx: -0.4, dy: 0.2,  r: 0.58, fill: '#2f6e3e' },
    { kind: 'circle', dx: 0.4,  dy: 0.2,  r: 0.58, fill: '#2f6e3e' },
    { kind: 'circle', dx: 0,    dy: 0,    r: 0.32, fill: '#214e2b' },
  ],
  oak: [
    { kind: 'circle', dx: 0,     dy: 0,     r: 0.9,  fill: '#2f6e3e' },
    { kind: 'circle', dx: -0.22, dy: -0.14, r: 0.25, fill: '#1f4c28' },
    { kind: 'circle', dx: 0.18,  dy: -0.2,  r: 0.25, fill: '#1f4c28' },
    { kind: 'circle', dx: 0,     dy: 0.2,   r: 0.25, fill: '#1f4c28' },
  ],
  palm: [
    // 6 leaves as ellipses rotated around the trunk + a small trunk center.
    { kind: 'ellipseFan', count: 6, orbitR: 0.18, rx: 0.72, ry: 0.22, fill: '#2f6e3e' },
    { kind: 'circle', dx: 0, dy: 0, r: 0.24, fill: '#214e2b' },
  ],
  birch: [
    { kind: 'circle', dx: 0, dy: 0, r: 0.88, fill: '#86bf6a' },
    { kind: 'circleStroke', dx: 0, dy: 0, r: 0.42, stroke: '#edf1ea', strokeWidth: 1.2 },
  ],
  cypress: [
    { kind: 'ellipse', dx: 0, dy: 0,     rx: 0.55, ry: 0.95, fill: '#214e2b' },
    { kind: 'ellipse', dx: 0, dy: -0.08, rx: 0.38, ry: 0.68, fill: '#2f6e3e' },
  ],
};

// Fallback when a species name is unknown (shouldn't happen for data from the
// designer, but guards legacy courses).
export const GENERIC_TREE = TREES.pine;

// Layer order used by both renderers. Highest-index renders on top.
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
