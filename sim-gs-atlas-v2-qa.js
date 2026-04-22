#!/usr/bin/env node
// QA for v0.80 multi-sheet atlas. Tests the new atlas shape where
// each animation carries a {sheet, frames, flipX} object, plus the
// _animEntry normaliser for backward-compat with the old array shape.

const fs = require('fs');
const path = require('path');

// Load the actual production atlas.
const atlas = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'GolfStory', 'golfer-atlas.json')
));

// Mirror the production _animEntry + pickSpriteAnimation helpers.
function _animEntry(a, key) {
  const v = a[key];
  if (!v) return null;
  if (Array.isArray(v)) return { sheet: 'main', frames: v, flipX: false };
  return { sheet: v.sheet || 'main', frames: v.frames || [], flipX: !!v.flipX };
}
function aimAngleToCompass8(aim) {
  if (typeof aim !== 'number') return 'N';
  let a = aim % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round(a / (Math.PI / 4)) % 8];
}
function pick(atlas, facing, phase, swingInfo, facing8) {
  const a = atlas.animations;
  if (swingInfo?.phase === 'celebrate') {
    const e = _animEntry(a, 'CELEBRATIONS_MISC') || _animEntry(a, 'IDLE');
    return { ...e, frameIdx: swingInfo.celebIdx || 0 };
  }
  if (swingInfo?.phase === 'back' || swingInfo?.phase === 'forward') {
    const cat = swingInfo.clubCategory;
    const base = cat === 'putter' ? 'PUTTING' : cat === 'wedge' ? 'CHIPPING' : cat === 'wood' ? 'WOODS' : 'IRONS';
    const compass = aimAngleToCompass8(swingInfo.aimAngle);
    const isN = compass === 'N' || compass === 'NE' || compass === 'NW';
    const isS = compass === 'S' || compass === 'SE' || compass === 'SW';
    const tryKeys = isN ? [`${base}_N`, `${base}_BACK`, base] : isS ? [`${base}_S`, base] : [`${base}_E`, `${base}_W`, base];
    let e = null;
    for (const k of tryKeys) { const c = _animEntry(a, k); if (c && c.frames.length) { e = c; break; } }
    if (!e) e = _animEntry(a, base) || _animEntry(a, 'IDLE');
    return { ...e, frameIdx: 0 };
  }
  if (typeof phase === 'number') {
    const tryKeys = [];
    if (facing8) tryKeys.push(`WALK_${facing8}`);
    if (facing === 'N') tryKeys.push('WALK_UP', 'WALK_NW', 'WALK_NE');
    else if (facing === 'S') tryKeys.push('WALK_DOWN', 'WALK_SW', 'WALK_SE');
    else if (facing === 'W') tryKeys.push('WALK_LEFT', 'WALK_NW', 'WALK_SW');
    else if (facing === 'E') tryKeys.push('WALK_RIGHT', 'WALK_NE', 'WALK_SE');
    let e = null;
    for (const k of tryKeys) { const c = _animEntry(a, k); if (c && c.frames.length) { e = c; break; } }
    if (!e) e = _animEntry(a, 'IDLE');
    return { ...e, frameIdx: 0 };
  }
  return _animEntry(a, 'IDLE');
}

const assert = (ok, msg, actual) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);
  if (!ok) process.exitCode = 1;
};

console.log('v0.80 multi-sheet atlas QA\n');

// --- Atlas shape -------------------------------------------------------
assert(atlas.sheets?.main, 'atlas has sheets.main', Object.keys(atlas.sheets || {}).join(','));
assert(atlas.sheets?.walk, 'atlas has sheets.walk', atlas.sheets?.walk?.path || 'missing');
assert(atlas.sheets?.swing, 'atlas has sheets.swing', atlas.sheets?.swing?.path || 'missing');

// Every animation entry must be either an array or a {sheet, frames} object.
for (const [key, v] of Object.entries(atlas.animations)) {
  const e = _animEntry(atlas.animations, key);
  assert(e && Array.isArray(e.frames), `${key} normalises to {frames: []}`, typeof v);
  assert(e.frames.length > 0, `${key} has frames`, e.frames.length);
  assert(atlas.sheets[e.sheet], `${key} references existing sheet (${e.sheet})`, e.sheet);
}

// --- Walk routing ------------------------------------------------------
{
  const r = pick(atlas, 'S', 1.0, null, null);
  assert(r.sheet === 'walk' && r.frames.length, 'WALK_DOWN picks walk sheet', `${r.sheet} · ${r.frames.length}f`);
}
{
  const r = pick(atlas, 'E', 1.0, null, null);
  assert(r.sheet === 'walk' && !r.flipX, 'WALK_RIGHT picks walk sheet, no flip', `sheet=${r.sheet} flip=${r.flipX}`);
}
{
  const r = pick(atlas, 'W', 1.0, null, null);
  assert(r.sheet === 'walk' && r.flipX === true, 'WALK_LEFT picks walk sheet with flipX=true', `sheet=${r.sheet} flip=${r.flipX}`);
}
{
  const r = pick(atlas, 'N', 1.0, null, null);
  assert(r.sheet === 'walk' && !r.flipX, 'WALK_UP picks walk sheet, no flip', `sheet=${r.sheet} flip=${r.flipX}`);
}

// --- Swing routing -----------------------------------------------------
{
  const r = pick(atlas, 'N', null, { phase: 'back', power: 0.5, clubCategory: 'wood', aimAngle: 0 }, null);
  assert(r.sheet === 'swing', 'driver swing → swing sheet', r.sheet);
}
{
  const r = pick(atlas, 'N', null, { phase: 'back', power: 0.5, clubCategory: 'iron', aimAngle: 0 }, null);
  assert(r.sheet === 'swing', 'iron swing → swing sheet', r.sheet);
}
{
  const r = pick(atlas, 'N', null, { phase: 'back', power: 0.5, clubCategory: 'putter', aimAngle: 0 }, null);
  assert(r.sheet === 'swing', 'putter swing → swing sheet', r.sheet);
}
{
  const r = pick(atlas, 'N', null, { phase: 'back', power: 0.5, clubCategory: 'wedge', aimAngle: 0 }, null);
  assert(r.sheet === 'swing', 'wedge (chipping) → swing sheet', r.sheet);
}

// --- Idle + celebration -----------------------------------------------
{
  const r = pick(atlas, 'S', null, null, null);
  assert(r.sheet === 'main', 'IDLE picks main sheet', r.sheet);
  assert(r.frames.length > 0, 'IDLE has frames', r.frames.length);
}
{
  const r = pick(atlas, 'S', null, { phase: 'celebrate', celebIdx: 0 }, null);
  assert(r.sheet === 'main' && r.frames.length, 'CELEBRATIONS_MISC from main sheet', `${r.sheet} · ${r.frames.length}f`);
}

// --- Frame coord sanity ------------------------------------------------
for (const key of ['WALK_DOWN', 'WALK_RIGHT', 'WALK_UP', 'PUTTING', 'IRONS', 'WOODS']) {
  const e = _animEntry(atlas.animations, key);
  assert(e.frames.length === 6, `${key} has 6 frames`, e.frames.length);
  for (const f of e.frames) {
    const sheetW = 1448, sheetH = 1086;
    assert(
      f.x >= 0 && f.y >= 0 && f.w > 0 && f.h > 0 && f.x + f.w <= sheetW && f.y + f.h <= sheetH,
      `${key} frame in-bounds`, `x=${f.x} y=${f.y} w=${f.w} h=${f.h}`,
    );
  }
}
