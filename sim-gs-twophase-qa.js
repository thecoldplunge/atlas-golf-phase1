#!/usr/bin/env node
// QA for Golf Story v0.27 two-phase swing power.
// backPct × followPct should match the user-facing rule:
//   pull to X% and return fully → X% carry
//   pull to X% and return Y% of the way → X% × Y% carry

const DPR = 2;
const CAP = 80 * DPR;

function computePower({ startX, startY, peakX, peakY, endX, endY }) {
  const maxMag = Math.hypot(peakX - startX, peakY - startY);
  const followDist = Math.hypot(endX - peakX, endY - peakY);
  const backPct = Math.min(1, maxMag / CAP);
  const followPct = maxMag > 0 ? Math.min(1, followDist / maxMag) : 0;
  return { backPct, followPct, power: Math.max(0.08, backPct * followPct) };
}

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('Two-phase swing QA (cap = 80×dpr = 160 canvas px, dpr=2)\n');

// 1. Full backswing, full follow-through → 100% power.
let r = computePower({ startX: 200, startY: 500, peakX: 200, peakY: 660, endX: 200, endY: 500 });
assert(Math.abs(r.power - 1) < 0.001, 'Full back + full follow → 100%', r.power.toFixed(3));

// 2. Full backswing, NO follow-through (finger stays at peak) → 0 (min floor).
r = computePower({ startX: 200, startY: 500, peakX: 200, peakY: 660, endX: 200, endY: 660 });
assert(r.power <= 0.09, 'Full back + zero follow → min floor', r.power.toFixed(3));

// 3. 50% backswing, full follow → 50% power.
r = computePower({ startX: 200, startY: 500, peakX: 200, peakY: 580, endX: 200, endY: 500 });
assert(Math.abs(r.power - 0.5) < 0.02, '50% back + full follow → 50%', r.power.toFixed(3));

// 4. 100% back, 50% follow → 50% power.
r = computePower({ startX: 200, startY: 500, peakX: 200, peakY: 660, endX: 200, endY: 580 });
assert(Math.abs(r.power - 0.5) < 0.02, '100% back + 50% follow → 50%', r.power.toFixed(3));

// 5. 50% back, 50% follow → 25% power.
r = computePower({ startX: 200, startY: 500, peakX: 200, peakY: 580, endX: 200, endY: 540 });
assert(Math.abs(r.power - 0.25) < 0.02, '50% back + 50% follow → 25%', r.power.toFixed(3));

// 6. 120% back (past cap) + full follow → clamped 100%.
r = computePower({ startX: 200, startY: 500, peakX: 200, peakY: 700, endX: 200, endY: 500 });
assert(r.power === 1, 'Past-cap back + full follow → 100%', r.power.toFixed(3));

// 7. Follow-through past start (overshoot) → still clamps at 100% of back.
r = computePower({ startX: 200, startY: 500, peakX: 200, peakY: 580, endX: 200, endY: 400 });
assert(Math.abs(r.power - 0.5) < 0.02, 'Overshoot start → clamped at backPct', r.power.toFixed(3));
