#!/usr/bin/env node
// QA for v0.78.6 picker extensions: diagonal walk preference,
// back/front-facing swing selection by aim direction, graceful
// fallback when the new atlas keys aren't present.

function aimAngleToCompass8(aim) {
  if (typeof aim !== 'number') return 'N';
  let a = aim % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  const sector = Math.round(a / (Math.PI / 4)) % 8;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][sector];
}

function pickSpriteAnimation(atlas, facing, phase, swingInfo, state, facing8) {
  const a = atlas.animations;
  if (swingInfo && swingInfo.phase === 'celebrate') {
    const frames = a.CELEBRATIONS_MISC || a.CELEBRATIONS || a.IDLE;
    return { key: 'CELEBRATION', frames, frameIdx: swingInfo.celebIdx || 0 };
  }
  if (swingInfo && (swingInfo.phase === 'back' || swingInfo.phase === 'forward')) {
    const cat = swingInfo.clubCategory;
    const compass = aimAngleToCompass8(swingInfo.aimAngle);
    const isN = compass === 'N' || compass === 'NE' || compass === 'NW';
    const isS = compass === 'S' || compass === 'SE' || compass === 'SW';
    const base = cat === 'putter' ? 'PUTTING' : cat === 'wedge' ? 'CHIPPING' : cat === 'wood' ? 'WOODS' : 'IRONS';
    const tryKeys = isN ? [`${base}_N`, `${base}_BACK`, base]
                  : isS ? [`${base}_S`, base]
                        : [`${base}_E`, `${base}_W`, base];
    let frames = null, usedKey = null;
    for (const k of tryKeys) { if (a[k] && a[k].length) { frames = a[k]; usedKey = k; break; } }
    if (!frames) { frames = a[base] || a.IDLE; usedKey = a[base] ? base : 'IDLE'; }
    const mid = Math.floor(frames.length / 2);
    let idx;
    if (swingInfo.phase === 'back') {
      const p = Math.max(0, Math.min(1, swingInfo.power || 0));
      idx = Math.min(mid, Math.floor(p * (mid + 1)));
    } else {
      const t = Math.max(0, Math.min(1, swingInfo.forwardT || 0));
      idx = mid + Math.floor(t * (frames.length - mid - 1));
    }
    return { key: usedKey, frames, frameIdx: Math.max(0, Math.min(frames.length - 1, idx)) };
  }
  if (typeof phase === 'number') {
    const tryKeys = [];
    if (facing8) tryKeys.push(`WALK_${facing8}`);
    if (facing === 'N') tryKeys.push('WALK_UP', 'WALK_NW', 'WALK_NE');
    else if (facing === 'S') tryKeys.push('WALK_DOWN', 'WALK_SW', 'WALK_SE');
    else if (facing === 'W') tryKeys.push('WALK_RIGHT', 'WALK_NW', 'WALK_SW');
    else if (facing === 'E') tryKeys.push('WALK_LEFT', 'WALK_NE', 'WALK_SE');
    let frames = null, usedKey = null;
    for (const k of tryKeys) { if (a[k] && a[k].length) { frames = a[k]; usedKey = k; break; } }
    if (!frames) { frames = a.IDLE; usedKey = 'IDLE'; }
    const idx = Math.floor(phase / (Math.PI / 2)) % frames.length;
    return { key: usedKey, frames, frameIdx: idx };
  }
  return { key: 'IDLE', frames: a.IDLE, frameIdx: 0 };
}

const assert = (ok, msg, actual) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);
  if (!ok) process.exitCode = 1;
};

console.log('v0.78.6 picker extensions QA\n');

// Compass bucketing
{
  assert(aimAngleToCompass8(0) === 'N', 'aim=0 → N', aimAngleToCompass8(0));
  assert(aimAngleToCompass8(Math.PI / 2) === 'E', 'aim=π/2 → E', aimAngleToCompass8(Math.PI / 2));
  assert(aimAngleToCompass8(Math.PI) === 'S', 'aim=π → S', aimAngleToCompass8(Math.PI));
  assert(aimAngleToCompass8(-Math.PI / 2) === 'W', 'aim=-π/2 → W', aimAngleToCompass8(-Math.PI / 2));
  assert(aimAngleToCompass8(Math.PI / 4) === 'NE', 'aim=π/4 → NE', aimAngleToCompass8(Math.PI / 4));
  assert(aimAngleToCompass8(-Math.PI / 4) === 'NW', 'aim=-π/4 → NW', aimAngleToCompass8(-Math.PI / 4));
}

// New atlas with diagonal walks + labelled swings.
const NEW_ATLAS = { animations: {
  IDLE:           [{ x:0,y:0,w:40,h:100 }, { x:40,y:0,w:40,h:100 }],
  WALK_NW:        [{ x:0,y:100,w:40,h:100 }, { x:40,y:100,w:40,h:100 }, { x:80,y:100,w:40,h:100 }, { x:120,y:100,w:40,h:100 }],
  WALK_NE:        [{ x:0,y:200,w:40,h:100 }, { x:40,y:200,w:40,h:100 }, { x:80,y:200,w:40,h:100 }, { x:120,y:200,w:40,h:100 }],
  WALK_SW:        [{ x:0,y:300,w:40,h:100 }, { x:40,y:300,w:40,h:100 }, { x:80,y:300,w:40,h:100 }, { x:120,y:300,w:40,h:100 }],
  WALK_SE:        [{ x:0,y:400,w:40,h:100 }, { x:40,y:400,w:40,h:100 }, { x:80,y:400,w:40,h:100 }, { x:120,y:400,w:40,h:100 }],
  PUTTING_N:      [{ x:0,y:500,w:40,h:100 }, { x:40,y:500,w:40,h:100 }, { x:80,y:500,w:40,h:100 }, { x:120,y:500,w:40,h:100 }, { x:160,y:500,w:40,h:100 }],
  PUTTING_S:      [{ x:0,y:600,w:40,h:100 }, { x:40,y:600,w:40,h:100 }, { x:80,y:600,w:40,h:100 }, { x:120,y:600,w:40,h:100 }, { x:160,y:600,w:40,h:100 }],
  CHIPPING_N:     [{ x:0,y:700,w:40,h:100 }, { x:40,y:700,w:40,h:100 }, { x:80,y:700,w:40,h:100 }, { x:120,y:700,w:40,h:100 }, { x:160,y:700,w:40,h:100 }],
  CHIPPING_S:     [{ x:0,y:800,w:40,h:100 }, { x:40,y:800,w:40,h:100 }, { x:80,y:800,w:40,h:100 }, { x:120,y:800,w:40,h:100 }, { x:160,y:800,w:40,h:100 }],
  IRONS_N:        [{ x:0,y:900,w:40,h:100 }, { x:40,y:900,w:40,h:100 }, { x:80,y:900,w:40,h:100 }, { x:120,y:900,w:40,h:100 }, { x:160,y:900,w:40,h:100 }],
  IRONS_S:        [{ x:0,y:1000,w:40,h:100 }, { x:40,y:1000,w:40,h:100 }, { x:80,y:1000,w:40,h:100 }, { x:120,y:1000,w:40,h:100 }, { x:160,y:1000,w:40,h:100 }],
  WOODS_N:        [{ x:0,y:1100,w:40,h:100 }, { x:40,y:1100,w:40,h:100 }, { x:80,y:1100,w:40,h:100 }, { x:120,y:1100,w:40,h:100 }, { x:160,y:1100,w:40,h:100 }],
  WOODS_S:        [{ x:0,y:1200,w:40,h:100 }, { x:40,y:1200,w:40,h:100 }, { x:80,y:1200,w:40,h:100 }, { x:120,y:1200,w:40,h:100 }, { x:160,y:1200,w:40,h:100 }],
}};
// Legacy (existing) atlas — only cardinal walks, generic swings.
const OLD_ATLAS = { animations: {
  IDLE:      [{ x:0,y:0,w:40,h:100 }],
  WALK_UP:   [{ x:0,y:1,w:40,h:100 }, { x:40,y:1,w:40,h:100 }, { x:80,y:1,w:40,h:100 }, { x:120,y:1,w:40,h:100 }],
  WALK_DOWN: [{ x:0,y:2,w:40,h:100 }, { x:40,y:2,w:40,h:100 }, { x:80,y:2,w:40,h:100 }, { x:120,y:2,w:40,h:100 }],
  WALK_LEFT: [{ x:0,y:3,w:40,h:100 }, { x:40,y:3,w:40,h:100 }, { x:80,y:3,w:40,h:100 }, { x:120,y:3,w:40,h:100 }],
  WALK_RIGHT:[{ x:0,y:4,w:40,h:100 }, { x:40,y:4,w:40,h:100 }, { x:80,y:4,w:40,h:100 }, { x:120,y:4,w:40,h:100 }],
  IRONS:     [{ x:0,y:5,w:40,h:100 }, { x:40,y:5,w:40,h:100 }, { x:80,y:5,w:40,h:100 }, { x:120,y:5,w:40,h:100 }, { x:160,y:5,w:40,h:100 }],
  WOODS:     [{ x:0,y:6,w:40,h:100 }],
  PUTTING:   [{ x:0,y:7,w:40,h:100 }],
  CHIPPING:  [{ x:0,y:8,w:40,h:100 }],
}};

// Diagonal walks prefer facing8 keys when atlas has them.
{
  const r = pickSpriteAnimation(NEW_ATLAS, 'N', 0, null, null, 'NW');
  assert(r.key === 'WALK_NW', 'NEW atlas + facing8=NW → WALK_NW', r.key);
  const r2 = pickSpriteAnimation(NEW_ATLAS, 'S', Math.PI/2, null, null, 'SE');
  assert(r2.key === 'WALK_SE', 'NEW atlas + facing8=SE → WALK_SE', r2.key);
}
// Diagonal fallback to cardinal preferred when atlas has only that.
{
  const r = pickSpriteAnimation(OLD_ATLAS, 'N', 0, null, null, 'NW');
  assert(r.key === 'WALK_UP', 'OLD atlas + facing8=NW falls back to WALK_UP', r.key);
  const r2 = pickSpriteAnimation(OLD_ATLAS, 'E', 0, null, null, null);
  assert(r2.key === 'WALK_LEFT', 'OLD atlas facing=E still picks WALK_LEFT (inverted)', r2.key);
}
// Aim north → driver swing uses WOODS_N.
{
  const r = pickSpriteAnimation(NEW_ATLAS, 'N', null,
    { phase: 'back', power: 0.6, clubCategory: 'wood', aimAngle: 0 }, null, null);
  assert(r.key === 'WOODS_N', 'aim N + driver → WOODS_N', r.key);
}
// Aim south → driver swing uses WOODS_S.
{
  const r = pickSpriteAnimation(NEW_ATLAS, 'S', null,
    { phase: 'back', power: 0.6, clubCategory: 'wood', aimAngle: Math.PI }, null, null);
  assert(r.key === 'WOODS_S', 'aim S + driver → WOODS_S', r.key);
}
// Aim east on new atlas — neither E nor W key exists, fall back to WOODS base.
{
  const limited = { animations: { IDLE: NEW_ATLAS.animations.IDLE, WOODS: [{x:0,y:0,w:40,h:100},{x:40,y:0,w:40,h:100},{x:80,y:0,w:40,h:100}] }};
  const r = pickSpriteAnimation(limited, 'E', null,
    { phase: 'forward', forwardT: 0.5, clubCategory: 'wood', aimAngle: Math.PI / 2 }, null, null);
  assert(r.key === 'WOODS', 'aim E with no directional WOODS → base WOODS', r.key);
}
// Old atlas w/ generic IRONS — swing picker still works.
{
  const r = pickSpriteAnimation(OLD_ATLAS, 'N', null,
    { phase: 'back', power: 0.5, clubCategory: 'iron', aimAngle: 0 }, null, null);
  assert(r.key === 'IRONS', 'OLD atlas + iron swing → IRONS (no _N suffix)', r.key);
}
// Celebration path unchanged.
{
  const r = pickSpriteAnimation(
    { animations: { IDLE: [{x:0,y:0,w:40,h:100}], CELEBRATIONS_MISC: [{x:0,y:0,w:40,h:100},{x:40,y:0,w:40,h:100}] }},
    'S', null, { phase: 'celebrate', celebIdx: 1, clubCategory: 'iron' }, null, null);
  assert(r.key === 'CELEBRATION' && r.frameIdx === 1, 'celebrate picks correct celebIdx', `${r.key}/${r.frameIdx}`);
}
