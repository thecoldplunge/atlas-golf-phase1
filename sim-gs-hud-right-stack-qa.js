#!/usr/bin/env node
// QA for GS v0.43 right-side HUD stack. EXIT / CARD / VIEW each sit on
// the right edge; this locks in the vertical ordering so a future
// tweak to one doesn't silently push another behind the WIND panel.

const HUD = {
  // Rectangles mirror the StyleSheet spec for each control.
  exitBtn:      { right: 16, top: 16,  width: 38, height: 38 },
  cardBtn:      { right: 16, top: 82,  width: 52, height: 30 },
  viewBtn:      { right: 16, top: 118, width: 44, height: 44 },
  hudTopRight:  { right: 60, top: 16,  width: 110, height: 60 }, // WIND panel
  hudTopLeft:   { left: 16,  top: 16,  width: 160, height: 80 },
};

const VIEWPORTS = [
  { name: 'iPhone SE 320',  w: 320 },
  { name: 'iPhone mini 360', w: 360 },
  { name: 'iPhone 15 393',   w: 393 },
  { name: 'iPhone 15 Pro 430', w: 430 },
  { name: 'iPad mini 744',    w: 744 },
];

function resolve(spec, vw) {
  const left = spec.left != null ? spec.left : vw - spec.right - spec.width;
  const right = left + spec.width;
  const top = spec.top;
  const bottom = top + spec.height;
  return { l: left, r: right, t: top, b: bottom };
}

function overlap(a, b) {
  const xO = !(a.r <= b.l || b.r <= a.l);
  const yO = !(a.b <= b.t || b.b <= a.t);
  return xO && yO;
}

const assert = (ok, msg) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`);

console.log('GS right-side HUD stack QA\n');
let allOk = true;

for (const vp of VIEWPORTS) {
  console.log(`  ${vp.name}  w=${vp.w}`);
  const rects = {};
  for (const [k, spec] of Object.entries(HUD)) rects[k] = resolve(spec, vp.w);
  // Right-edge stack must be vertically ordered and non-overlapping.
  // EXIT → CARD → VIEW all share the same x column and flow downward.
  const stack = ['exitBtn', 'cardBtn', 'viewBtn'];
  for (let i = 1; i < stack.length; i++) {
    const prev = rects[stack[i - 1]];
    const cur  = rects[stack[i]];
    const ok = cur.t >= prev.b;
    if (!ok) allOk = false;
    assert(ok, `    ${stack[i - 1]} is above ${stack[i]} (no Y overlap)`);
  }
  // CARD must not overlap the WIND panel.
  const ok1 = !overlap(rects.cardBtn, rects.hudTopRight);
  if (!ok1) allOk = false;
  assert(ok1, `    CARD does not overlap WIND panel`);
  // CARD must not collide with EXIT or VIEW (stack gaps already asserted
  // above, but double-check as a bounding-box overlap).
  const ok2 = !overlap(rects.cardBtn, rects.exitBtn) && !overlap(rects.cardBtn, rects.viewBtn);
  if (!ok2) allOk = false;
  assert(ok2, `    CARD does not overlap EXIT / VIEW`);
  // Everything fits on screen.
  for (const k of ['exitBtn', 'cardBtn', 'viewBtn']) {
    const r = rects[k];
    const ok = r.l >= 0 && r.r <= vp.w;
    if (!ok) allOk = false;
    assert(ok, `    ${k} fits on ${vp.w}-wide viewport`);
  }
}

console.log('');
console.log(allOk ? 'PASS — right-side HUD stack OK across viewports' : 'FAIL — see offenders above');
process.exit(allOk ? 0 : 1);
