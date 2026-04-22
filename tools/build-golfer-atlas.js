#!/usr/bin/env node
// Auto-detect sprite frames in assets/golfer-sprites.png and emit a
// JSON atlas at GolfStory/golfer-atlas.json.
//
// The sheet is a 1536×1024 pixel-art grid with mostly-black background.
// We decode the PNG with pure Node stdlib (zlib for IDAT inflate), then:
//   1. Find the right panel (OUTFIT VARIATIONS) via the visible box
//      border and skip everything to its right.
//   2. In the remaining sprite area, find rows of frames by scanning
//      for horizontal strips where ANY non-background pixel exists.
//   3. Within each row, find columns of frames by the same technique.
//   4. Each connected rect becomes a frame. Order top-to-bottom,
//      left-to-right.
//   5. Map the row sequences to animation names: IDLE / PUTTING /
//      CHIPPING / IRONS / WOODS / WALK_UP / WALK_DOWN / WALK_LEFT /
//      WALK_RIGHT / JOG_* / CELEBRATIONS / MISC.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SHEET = path.join(__dirname, '..', 'assets', 'golfer-sprites.png');
const OUT   = path.join(__dirname, '..', 'GolfStory', 'golfer-atlas.json');

// ─── Minimal PNG decoder (stdlib only) ─────────────────────────────
function decodePng(buf) {
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('Not a PNG');
  }
  let i = 8;
  let ihdr = null;
  const idatChunks = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i); i += 4;
    const type = buf.slice(i, i + 4).toString('ascii'); i += 4;
    const data = buf.slice(i, i + len); i += len;
    i += 4; // CRC
    if (type === 'IHDR') {
      ihdr = {
        width:  data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth:  data[8],
        colorType: data[9],
      };
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (!ihdr) throw new Error('No IHDR');
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const { width, height, colorType } = ihdr;
  const bpp = colorType === 2 ? 3 : (colorType === 6 ? 4 : (colorType === 0 ? 1 : null));
  if (bpp == null) throw new Error(`Unsupported colorType ${colorType}`);
  const stride = width * bpp;
  const pixels = Buffer.alloc(width * height * bpp);
  let rawOff = 0;
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[rawOff]; rawOff += 1;
    const row = pixels.slice(y * stride, y * stride + stride);
    for (let x = 0; x < stride; x++) {
      const curr = raw[rawOff + x];
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let pred = 0;
      if (filter === 0) pred = 0;
      else if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[x] = (curr + pred) & 0xff;
    }
    row.copy(prev);
    rawOff += stride;
  }
  return { width, height, bpp, pixels };
}

// ─── Frame detection ────────────────────────────────────────────────
function isContent(img, x, y) {
  const { pixels, bpp, width } = img;
  const i = (y * width + x) * bpp;
  const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
  // Background is solid dark. Anything non-zero counts.
  return (r + g + b) > 36;
}

function rowDensity(img, y, x0, x1) {
  let c = 0;
  for (let x = x0; x < x1; x++) if (isContent(img, x, y)) c++;
  return c;
}
function colDensity(img, x, y0, y1) {
  let c = 0;
  for (let y = y0; y < y1; y++) if (isContent(img, x, y)) c++;
  return c;
}

// Scan for bands along an axis — a "line" counts only if its density
// >= minDensity, which filters out thin label text and leaves the
// fat sprite rows. Returns [{ start, end }] for each connected run.
function findBands(densityAt, axisLen, minDensity, minGap = 3, minSize = 6) {
  const bands = [];
  let start = -1;
  let gap = 0;
  for (let i = 0; i < axisLen; i++) {
    if (densityAt(i) >= minDensity) {
      if (start < 0) start = i;
      gap = 0;
    } else if (start >= 0) {
      gap++;
      if (gap >= minGap) {
        const end = i - gap;
        if (end - start >= minSize) bands.push({ start, end });
        start = -1;
        gap = 0;
      }
    }
  }
  if (start >= 0) {
    const end = axisLen - gap;
    if (end - start >= minSize) bands.push({ start, end });
  }
  return bands;
}

// ─── Main ──────────────────────────────────────────────────────────
const img = decodePng(fs.readFileSync(SHEET));
console.log(`sheet: ${img.width} × ${img.height}, colorType bpp=${img.bpp}`);

// The OUTFIT VARIATIONS panel sits on the right; we cut the sheet off
// around x=1240 since the character rows stop there. Bottom palette /
// label block sits around y=910 but celebration sprites span ~y=600-900.
const SPRITE_X_MAX = 1230;

// Find sprite rows — density threshold filters out label text.
// Sprite rows typically hit 300+ density, label rows ~30-170.
const rows = findBands(
  (y) => rowDensity(img, y, 4, SPRITE_X_MAX),
  img.height,
  /*minDensity*/ 220,
  /*minGap*/ 4,
  /*minSize*/ 40,
);
console.log(`rows detected: ${rows.length}`);
for (const r of rows) console.log(`  row  y ${r.start}–${r.end}  (h=${r.end - r.start})`);

// For each row, find individual sprite frames. Frames are typically
// 40-90 px wide with 4-8 px of black between them. Density threshold
// keeps us from latching onto the thin bottom-label captions.
const rowsWithFrames = rows.map((row) => {
  const cols = findBands(
    (x) => colDensity(img, x, row.start, row.end),
    SPRITE_X_MAX,
    /*minDensity*/ 6,
    /*minGap*/ 3,
    /*minSize*/ 12,
  );
  return { ...row, frames: cols };
});

// Name rows by index. This matches the user-provided labels.
// The last row visually combines CELEBRATIONS + MISC/EXTRAS as one
// tall band, so we split it into two sub-groups by the large gap
// between "KNEEL" and "LOOK LEFT".
const ROW_LABELS = [
  ['IDLE', 'PUTTING', 'CHIPPING'],
  ['IRONS', 'WOODS', 'BACKSWING'],       // last 3 are back-facing
  ['WALK_UP', 'WALK_DOWN', 'WALK_LEFT', 'WALK_RIGHT'],
  ['JOG_UP', 'JOG_DOWN', 'JOG_LEFT', 'JOG_RIGHT'],
  ['CELEBRATIONS_MISC'],                 // handled specially below
];

// The expected frame counts per labelled animation. Any extra frames
// in the row are attributed to adjacent labels (the 2nd row has 5+5+3).
const LABEL_FRAME_COUNTS = {
  IDLE: 6, PUTTING: 6, CHIPPING: 5,
  IRONS: 5, WOODS: 5, BACKSWING: 3,
  WALK_UP: 4, WALK_DOWN: 4, WALK_LEFT: 4, WALK_RIGHT: 4,
  JOG_UP: 4, JOG_DOWN: 4, JOG_LEFT: 4, JOG_RIGHT: 4,
};

const atlas = {
  sheet: 'assets/golfer-sprites.png',
  sheetW: img.width,
  sheetH: img.height,
  animations: {},
};

for (let ri = 0; ri < rowsWithFrames.length; ri++) {
  const row = rowsWithFrames[ri];
  const labels = ROW_LABELS[ri] || [];
  if (ri < 4 && labels.length) {
    // Split this row's frames across the labels by expected count.
    let frameIdx = 0;
    for (const label of labels) {
      const expect = LABEL_FRAME_COUNTS[label] || 0;
      const take = row.frames.slice(frameIdx, frameIdx + expect);
      frameIdx += expect;
      if (take.length) {
        atlas.animations[label] = take.map((f) => ({
          x: f.start, y: row.start,
          w: f.end - f.start, h: row.end - row.start,
        }));
      }
    }
    // Any leftover frames in this row get tacked onto the last label.
    if (frameIdx < row.frames.length) {
      const last = labels[labels.length - 1];
      const extra = row.frames.slice(frameIdx).map((f) => ({
        x: f.start, y: row.start,
        w: f.end - f.start, h: row.end - row.start,
      }));
      atlas.animations[last] = [...(atlas.animations[last] || []), ...extra];
    }
  } else if (ri === 4) {
    // Last row: 4 celebrations + JUMP + 3 more celebrations + 4 misc.
    // We just emit them all in order under CELEBRATIONS, and the game
    // maps indexes to labels by convention.
    atlas.animations.CELEBRATIONS_MISC = row.frames.map((f) => ({
      x: f.start, y: row.start,
      w: f.end - f.start, h: row.end - row.start,
    }));
  }
}

// Also emit a single-frame IDLE fallback. Useful so anything that
// doesn't have a mapped animation can still render.
if (atlas.animations.IDLE && atlas.animations.IDLE[0]) {
  atlas.animations.DEFAULT = [atlas.animations.IDLE[0]];
}

fs.writeFileSync(OUT, JSON.stringify(atlas, null, 2));
console.log(`\nwrote ${OUT}`);
for (const [k, v] of Object.entries(atlas.animations)) {
  console.log(`  ${k.padEnd(18)} ${v.length} frames`);
}
