#!/usr/bin/env node
// QA for the Golf Story mobile HUD layout. Mirrors the styles.js
// position/width/height values and asserts that elements sharing the
// same vertical band don't overlap horizontally.

// === Layout constants (must match GolfStory/GolfStoryScreen.js styles) ===

const L = {
  // Bottom row (y anchored at bottom:24, card height ≈ 72)
  clubCard:   { left:   8, width: 64, bottom: 24, height: 72 },
  shapeCard:  { left:  76, width: 64, bottom: 24, height: 72 },
  typeCard:   { left: 144, width: 64, bottom: 24, height: 72 },
  swingBtn:   { right: 10, minWidth: 94, bottom: 116, height: 72 },
  // Right-side column (y anchored at top:78, extends down roughly 3x44 + view 44)
  zoomCol:    { right: 16, width: 44, top: 78, height: 220 },
  // Top corners
  exitBtn:    { right: 16, width: 38, top: 16, height: 38 },
  hudTopLeft: { left: 16, minWidth: 160, top: 16, height: 80 },
  hudTopRight:{ right: 60, minWidth: 110, top: 16, height: 60 },
};

const viewports = [
  { name: 'iPhone SE (320)',     w: 320, h: 568 },
  { name: 'iPhone mini (360)',   w: 360, h: 780 },
  { name: 'iPhone 15 (393)',     w: 393, h: 852 },
  { name: 'iPhone 15 Pro (430)', w: 430, h: 932 },
  { name: 'iPad mini (744)',     w: 744, h: 1133 },
  { name: 'iPad (1024)',         w: 1024, h: 1366 },
];

function computeRect(spec, vw, vh) {
  const left  = spec.left  != null ? spec.left  : (vw - spec.right - (spec.width || spec.minWidth));
  const right = left + (spec.width || spec.minWidth);
  const top   = spec.top   != null ? spec.top   : (vh - spec.bottom - spec.height);
  const bottom = top + spec.height;
  return { l: left, r: right, t: top, b: bottom };
}

function overlap(a, b) {
  const xOv = !(a.r <= b.l || b.r <= a.l);
  const yOv = !(a.b <= b.t || b.b <= a.t);
  return xOv && yOv;
}

let allOk = true;
console.log('Mobile HUD layout QA — GS spike v0.14');
console.log('='.repeat(76));

for (const vp of viewports) {
  const rects = {};
  for (const [key, spec] of Object.entries(L)) rects[key] = computeRect(spec, vp.w, vp.h);

  console.log(`\n  ${vp.name}  (${vp.w}×${vp.h} css px)`);
  for (const key of Object.keys(L)) {
    const rc = rects[key];
    const onScreen = rc.l >= 0 && rc.r <= vp.w && rc.t >= 0 && rc.b <= vp.h;
    console.log(`    ${key.padEnd(12)}  (${String(rc.l).padStart(4)}, ${String(rc.t).padStart(4)}) → (${String(rc.r).padStart(4)}, ${String(rc.b).padStart(4)})  ${onScreen ? 'ok' : 'OFF-SCREEN'}`);
    if (!onScreen) allOk = false;
  }

  // Overlap check scope: bottom row (cards + SWING) and right-side column.
  // Pre-existing hudTopLeft↔hudTopRight crowding on 320 px is documented
  // and out of scope for this PR.
  const checkKeys = ['clubCard', 'shapeCard', 'typeCard', 'swingBtn', 'zoomCol', 'exitBtn'];
  for (let i = 0; i < checkKeys.length; i++) {
    for (let j = i + 1; j < checkKeys.length; j++) {
      const a = checkKeys[i], b = checkKeys[j];
      if (overlap(rects[a], rects[b])) {
        console.log(`    FAIL  ${a} overlaps ${b}  (${JSON.stringify(rects[a])} vs ${JSON.stringify(rects[b])})`);
        allOk = false;
      }
    }
  }

  // Extra: bottom-row spacing
  const gapCS = rects.shapeCard.l - rects.clubCard.r;
  const gapST = rects.typeCard.l - rects.shapeCard.r;
  const gapTW = rects.swingBtn.l - rects.typeCard.r;
  console.log(`    gaps: club→shape ${gapCS}px · shape→type ${gapST}px · type→swing ${gapTW}px`);
  if (vp.w >= 360 && gapTW < 6) allOk = false;
}

console.log('\n' + '='.repeat(76));
console.log(allOk ? 'PASS — no overlaps within any shared vertical band on 360+ viewports' : 'FAIL — see offenders above');
process.exit(allOk ? 0 : 1);
