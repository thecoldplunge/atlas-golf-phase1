#!/usr/bin/env node
// QA for v0.78 sprite-sheet integration: atlas correctness, animation
// pick logic, and palette-swap colour match/tolerance.

const fs = require('fs');
const path = require('path');

const atlas = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'GolfStory', 'golfer-atlas.json'),
));

const assert = (ok, msg, actual) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);
  if (!ok) process.exitCode = 1;
};

console.log('v0.78 sprite atlas QA\n');

// Atlas sanity
assert(atlas.sheet === 'assets/golfer-sprites.png', 'atlas references correct sheet', atlas.sheet);
assert(atlas.sheetW === 1536 && atlas.sheetH === 1024, 'atlas records sheet dims', `${atlas.sheetW}x${atlas.sheetH}`);
for (const key of ['IDLE', 'PUTTING', 'CHIPPING', 'IRONS', 'WOODS', 'WALK_UP', 'WALK_DOWN', 'WALK_LEFT', 'WALK_RIGHT']) {
  const frames = atlas.animations[key];
  assert(frames && frames.length >= 4, `atlas has ${key} with ≥4 frames`, frames?.length);
  for (const f of frames) {
    assert(
      f.x >= 0 && f.y >= 0 && f.w > 0 && f.h > 0 &&
      f.x + f.w <= atlas.sheetW && f.y + f.h <= atlas.sheetH,
      `${key} frame in-bounds`,
      `x=${f.x} y=${f.y} w=${f.w} h=${f.h}`,
    );
  }
}

// Animation pick — replicates pickSpriteAnimation inline.
function pickSpriteAnimation(atlas, facing, phase, swingInfo) {
  const a = atlas.animations;
  if (swingInfo && (swingInfo.phase === 'back' || swingInfo.phase === 'forward')) {
    const cat = swingInfo.clubCategory;
    let key = 'IRONS';
    if (cat === 'putter')     key = 'PUTTING';
    else if (cat === 'wedge') key = 'CHIPPING';
    else if (cat === 'wood')  key = 'WOODS';
    const frames = a[key] || a.IDLE;
    const mid = Math.floor(frames.length / 2);
    let idx;
    if (swingInfo.phase === 'back') {
      const p = Math.max(0, Math.min(1, swingInfo.power || 0));
      idx = Math.min(mid, Math.floor(p * (mid + 1)));
    } else {
      const t = Math.max(0, Math.min(1, swingInfo.forwardT || 0));
      idx = mid + Math.floor(t * (frames.length - mid - 1));
    }
    return { key, frames, frameIdx: Math.max(0, Math.min(frames.length - 1, idx)) };
  }
  if (typeof phase === 'number') {
    const key =
      facing === 'N' ? 'WALK_UP' :
      facing === 'S' ? 'WALK_DOWN' :
      facing === 'W' ? 'WALK_LEFT' : 'WALK_RIGHT';
    const frames = a[key] || a.IDLE;
    const idx = Math.floor(phase / (Math.PI / 2)) % frames.length;
    return { key, frames, frameIdx: idx };
  }
  const frames = a.IDLE;
  return { key: 'IDLE', frames, frameIdx: 0 };
}

// Idle → IDLE[0]
{
  const p = pickSpriteAnimation(atlas, 'S', null, null);
  assert(p.key === 'IDLE' && p.frameIdx === 0, 'idle picks IDLE[0]', `${p.key}/${p.frameIdx}`);
}

// Walking N → WALK_UP
{
  const p = pickSpriteAnimation(atlas, 'N', Math.PI, null);
  assert(p.key === 'WALK_UP', 'walking N → WALK_UP', p.key);
  assert(p.frameIdx >= 0 && p.frameIdx < p.frames.length, 'walk frame idx in range', p.frameIdx);
}

// Walking E → WALK_RIGHT, cycles
{
  const p0 = pickSpriteAnimation(atlas, 'E', 0, null);
  const p1 = pickSpriteAnimation(atlas, 'E', Math.PI / 2, null);
  const p2 = pickSpriteAnimation(atlas, 'E', Math.PI, null);
  assert(p0.key === 'WALK_RIGHT', 'walking E → WALK_RIGHT', p0.key);
  assert(p0.frameIdx !== p1.frameIdx, 'walk cycles frame with phase', `${p0.frameIdx}→${p1.frameIdx}`);
  assert(p1.frameIdx !== p2.frameIdx, 'walk cycles frame with phase (again)', `${p1.frameIdx}→${p2.frameIdx}`);
}

// Swing back / forward picks right animation by club cat
{
  const driver = pickSpriteAnimation(atlas, 'E', null, { phase: 'back', power: 0.8, clubCategory: 'wood' });
  assert(driver.key === 'WOODS', 'driver swing → WOODS', driver.key);
  const iron = pickSpriteAnimation(atlas, 'E', null, { phase: 'forward', forwardT: 0.3, clubCategory: 'iron' });
  assert(iron.key === 'IRONS', 'iron swing → IRONS', iron.key);
  const wedge = pickSpriteAnimation(atlas, 'E', null, { phase: 'back', power: 0.5, clubCategory: 'wedge' });
  assert(wedge.key === 'CHIPPING', 'wedge swing → CHIPPING', wedge.key);
  const putter = pickSpriteAnimation(atlas, 'E', null, { phase: 'back', power: 1, clubCategory: 'putter' });
  assert(putter.key === 'PUTTING', 'putter swing → PUTTING', putter.key);
}

// Back-phase frame climbs with power; forward-phase descends from mid.
{
  const back0 = pickSpriteAnimation(atlas, 'E', null, { phase: 'back', power: 0, clubCategory: 'iron' });
  const backFull = pickSpriteAnimation(atlas, 'E', null, { phase: 'back', power: 1, clubCategory: 'iron' });
  assert(back0.frameIdx === 0, 'back power 0 → frame 0', back0.frameIdx);
  assert(backFull.frameIdx > back0.frameIdx, 'back full power advances frame', `${back0.frameIdx}→${backFull.frameIdx}`);
  const fwdMid = pickSpriteAnimation(atlas, 'E', null, { phase: 'forward', forwardT: 0, clubCategory: 'iron' });
  const fwdEnd = pickSpriteAnimation(atlas, 'E', null, { phase: 'forward', forwardT: 1, clubCategory: 'iron' });
  assert(fwdEnd.frameIdx >= fwdMid.frameIdx, 'forward advances toward end', `${fwdMid.frameIdx}→${fwdEnd.frameIdx}`);
}

// --- Palette swap colour detection ---------------------------------
const SHIRT = { r: 96, g: 62, b: 160 };
const PANTS = { r: 188, g: 159, b: 120 };
const TOL = 32; // per-channel avg × 3

function isNearShirt(r, g, b) { return Math.abs(r - SHIRT.r) + Math.abs(g - SHIRT.g) + Math.abs(b - SHIRT.b) < TOL * 3; }
function isNearPants(r, g, b) { return Math.abs(r - PANTS.r) + Math.abs(g - PANTS.g) + Math.abs(b - PANTS.b) < TOL * 3; }

// Sampled shirt pixels from the atlas (from build-time probe).
const sampled = [
  { rgb: [92, 59, 168], expect: 'shirt' },
  { rgb: [98, 62, 158], expect: 'shirt' },
  { rgb: [91, 56, 155], expect: 'shirt' },
  { rgb: [188, 159, 120], expect: 'pants' },
  // skin / hair — must NOT match either
  { rgb: [160, 118, 89], expect: 'skin' },
  { rgb: [44, 39, 31],   expect: 'hair' },
  { rgb: [58, 55, 44],   expect: 'hair' },
];
for (const s of sampled) {
  const [r, g, b] = s.rgb;
  const shirt = isNearShirt(r, g, b);
  const pants = isNearPants(r, g, b);
  if (s.expect === 'shirt') assert(shirt && !pants, `shirt pixel (${r},${g},${b}) matches shirt only`, `shirt=${shirt} pants=${pants}`);
  else if (s.expect === 'pants') assert(pants && !shirt, `pants pixel (${r},${g},${b}) matches pants only`, `shirt=${shirt} pants=${pants}`);
  else assert(!shirt && !pants, `${s.expect} pixel (${r},${g},${b}) matches neither`, `shirt=${shirt} pants=${pants}`);
}

// Shade-match: preserves relative luminance.
function shadeMatch(r, g, b, base, target) {
  const srcLum = (r + g + b) / 3;
  const baseLum = (base.r + base.g + base.b) / 3;
  const ratio = srcLum / baseLum;
  return {
    r: Math.round(target.r * ratio),
    g: Math.round(target.g * ratio),
    b: Math.round(target.b * ratio),
  };
}
// Shading a mid-shirt pixel with the target red shirt produces a red
// pixel darker than the pure red target (since src pixel is darker
// than base).
{
  const darkShirt = { r: 72, g: 34, b: 22 };  // sampled
  const redTarget = { r: 192, g: 56, b: 56 };
  const out = shadeMatch(darkShirt.r, darkShirt.g, darkShirt.b, SHIRT, redTarget);
  const outLum = (out.r + out.g + out.b) / 3;
  const tgtLum = (redTarget.r + redTarget.g + redTarget.b) / 3;
  assert(outLum < tgtLum, 'shade-matched pixel darker than target for dark source', `outLum=${outLum.toFixed(0)} tgt=${tgtLum.toFixed(0)}`);
  const srcLum = (darkShirt.r + darkShirt.g + darkShirt.b) / 3;
  const baseLum = (SHIRT.r + SHIRT.g + SHIRT.b) / 3;
  const expectLum = tgtLum * (srcLum / baseLum);
  assert(Math.abs(outLum - expectLum) < 1.5, 'shade-matched luminance preserved', `|${outLum.toFixed(1)}-${expectLum.toFixed(1)}|`);
}
