#!/usr/bin/env node
// v0.80 — multi-sheet atlas builder. The new sheets are uniform 3×6
// grids, so we build frame coords by formula rather than auto-detect
// (which had trouble with merged club-head pixels on the WOODS row).
//
// Sheets:
//   assets/golfer-sprites.png   — keeps IDLE + CELEBRATIONS_MISC
//   assets/golfer-walk-v2.png   — row 0 DOWN, row 1 RIGHT, row 2 UP
//   assets/golfer-swing-v2.png  — row 0 PUTTING, row 1 IRONS, row 2 WOODS
//
// WALK_LEFT is declared as a flipX variant of WALK_RIGHT so we don't
// need a dedicated row. CHIPPING reuses IRONS frames.

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'GolfStory', 'golfer-atlas.json');

// Preserve IDLE + CELEBRATIONS from the existing auto-detected atlas.
// (The old atlas was generated against the opaque sheet; those frame
// coords still align with the transparent-bg variant since the sheet
// content is identical, just exported with a different background.)
let existing = {};
try { existing = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}

const idle = existing.animations?.IDLE || [{ x: 26, y: 54, w: 41, h: 112 }];
const celebs = existing.animations?.CELEBRATIONS_MISC || [];

// Uniform 6-col grid helpers for the new sheets. Both are 1448×1086
// and laid out 3 rows × 6 frames with ~222 px horizontal spacing.
function rowFrames(startX, y, w, h, spacing = 222, count = 6) {
  const out = [];
  for (let i = 0; i < count; i++) out.push({ x: startX + i * spacing, y, w, h });
  return out;
}

const atlas = {
  // v0.80 — sheets[] tells the loader which PNG each animation
  // belongs to. `path` is relative to the bundler's root so Metro
  // can require() it.
  sheets: {
    main:  { path: 'assets/golfer-sprites.png' },
    walk:  { path: 'assets/golfer-walk-v2.png' },
    swing: { path: 'assets/golfer-swing-v2.png' },
  },
  animations: {
    IDLE: {
      sheet: 'main',
      frames: idle,
    },
    CELEBRATIONS_MISC: {
      sheet: 'main',
      frames: celebs.length ? celebs : [{ x: 26, y: 789, w: 90, h: 137 }],
    },
    // Walk rows: detected row y-bounds from build-golfer-atlas.js run.
    // Height padded a few px so antialiased edges don't clip.
    WALK_DOWN: {
      sheet: 'walk',
      frames: rowFrames(108, 160, 130, 168),
    },
    WALK_RIGHT: {
      sheet: 'walk',
      frames: rowFrames(108, 468, 130, 165),
    },
    WALK_UP: {
      sheet: 'walk',
      frames: rowFrames(108, 774, 130, 166),
    },
    // WALK_LEFT is WALK_RIGHT flipped horizontally — game renders
    // with ctx.scale(-1, 1) around the frame centre.
    WALK_LEFT: {
      sheet: 'walk',
      frames: rowFrames(108, 468, 130, 165),
      flipX: true,
    },
    // Swing rows — sequence reads Address → Backswing → Top →
    // Downswing → Contact → Follow-through over 6 frames.
    PUTTING: {
      sheet: 'swing',
      frames: rowFrames(100, 128, 155, 180),
    },
    IRONS: {
      sheet: 'swing',
      frames: rowFrames(100, 465, 155, 182),
    },
    WOODS: {
      sheet: 'swing',
      frames: rowFrames(100, 786, 155, 182),
    },
    // No dedicated chipping row — reuse IRONS, looks close enough.
    CHIPPING: {
      sheet: 'swing',
      frames: rowFrames(100, 465, 155, 182),
    },
  },
  // Back-compat alias so old drawGolfer callers that read sheetW /
  // sheetH still work.
  sheet: 'assets/golfer-sprites.png',
  sheetW: 1448,
  sheetH: 1086,
};

fs.writeFileSync(OUT, JSON.stringify(atlas, null, 2));
console.log('wrote', OUT);
console.log('sheets:', Object.keys(atlas.sheets).join(', '));
for (const [key, def] of Object.entries(atlas.animations)) {
  console.log(`  ${key.padEnd(20)} → ${def.sheet.padEnd(6)} · ${def.frames.length} frames${def.flipX ? ' · flipX' : ''}`);
}
