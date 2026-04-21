#!/usr/bin/env node
// QA for Golf Story v0.30 single-phase swing power.
// Reverts the v0.27–v0.29 two-phase model. Power is now just:
//   power = clamp(maxMag / (80·dpr), 0.1, 1)
// This lets a simple pull-and-lift actually launch the ball — the
// two-phase model required the player to swipe back toward the start,
// which on mobile registered as "zero follow-through → 0 power" and
// left the ball motionless.

const DPR = 2;
const CAP = 80 * DPR;

function computePower({ startX, startY, peakX, peakY, endX, endY }) {
  // maxMag = max pull distance observed during the swipe.
  const magPeak = Math.hypot(peakX - startX, peakY - startY);
  const magEnd  = Math.hypot(endX  - startX, endY  - startY);
  const maxMag  = Math.max(magPeak, magEnd);
  return { maxMag, power: Math.max(0.1, Math.min(1, maxMag / CAP)) };
}

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('Single-phase swing QA (cap = 80×dpr = 160 canvas px, dpr=2)\n');

// 1. Full pull, finger lifts at peak → 100% power.
let r = computePower({ startX: 200, startY: 500, peakX: 200, peakY: 660, endX: 200, endY: 660 });
assert(Math.abs(r.power - 1) < 0.001, 'Full pull + lift at peak → 100%', r.power.toFixed(3));

// 2. 50% pull, finger lifts at peak → 50% power.
r = computePower({ startX: 200, startY: 500, peakX: 200, peakY: 580, endX: 200, endY: 580 });
assert(Math.abs(r.power - 0.5) < 0.02, '50% pull + lift at peak → 50%', r.power.toFixed(3));

// 3. Full pull, swipe back to start → still 100% (max held).
r = computePower({ startX: 200, startY: 500, peakX: 200, peakY: 660, endX: 200, endY: 500 });
assert(Math.abs(r.power - 1) < 0.001, 'Full pull + return to start → 100%', r.power.toFixed(3));

// 4. Tiny pull → min-floor 10%.
r = computePower({ startX: 200, startY: 500, peakX: 200, peakY: 505, endX: 200, endY: 505 });
assert(r.power <= 0.11, 'Tiny pull → min floor 10%', r.power.toFixed(3));

// 5. Past-cap pull → clamped at 100%.
r = computePower({ startX: 200, startY: 500, peakX: 200, peakY: 700, endX: 200, endY: 700 });
assert(r.power === 1, 'Past-cap pull → clamped 100%', r.power.toFixed(3));

// 6. Horizontal pull (left) → same power as vertical pull of same length.
r = computePower({ startX: 200, startY: 500, peakX: 40, peakY: 500, endX: 40, endY: 500 });
assert(Math.abs(r.power - 1) < 0.001, 'Horizontal full pull → 100% (direction-agnostic)', r.power.toFixed(3));
