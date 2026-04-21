#!/usr/bin/env node
// QA for GS v0.31 two-phase swing, modeled on the main IGT game's
// lock-on-reversal state machine.
//
//   Phase 1 (backswing): pull DOWN. peakDy charges power. Release
//     WITHOUT a reversal → swing is aborted, no shot fired.
//   Phase 2 (forward):   after the finger reverses upward past an
//     8·dpr threshold, power is LOCKED at peakDy. From that moment,
//     horizontal drift from the lock point scores hook / slice.

const DPR = 2;
const CAP = 80 * DPR;
const LOCK_THRESHOLD = 8 * DPR;
const MIN_BACK = 20 * DPR;
const ACC_SCALE = 45 * DPR;

function makeSwipe(startX, startY) {
  return {
    startX, startY,
    currentX: startX, currentY: startY,
    peakDy: 0, peakX: startX, peakY: startY,
    locked: false, fwdPeakDevX: 0,
  };
}

// Mirrors GolfStoryScreen.js updateSwipe.
function feed(s, x, y) {
  s.currentX = x; s.currentY = y;
  const dy = y - s.startY;
  if (!s.locked) {
    if (dy > s.peakDy) {
      s.peakDy = dy;
      s.peakX = x;
      s.peakY = y;
    } else if (s.peakDy > MIN_BACK && (s.peakY - y) > LOCK_THRESHOLD) {
      s.locked = true;
    }
  } else {
    const dev = (x - s.peakX) / ACC_SCALE;
    const clamped = Math.max(-1, Math.min(1, dev));
    if (Math.abs(clamped) > Math.abs(s.fwdPeakDevX)) {
      s.fwdPeakDevX = clamped;
    }
  }
}

// Mirrors GolfStoryScreen.js endSwipe.
function release(s) {
  if (!s.locked || s.peakDy < MIN_BACK) return { fired: false };
  const power = Math.max(0.1, Math.min(1, s.peakDy / CAP));
  const backDev = Math.max(-1, Math.min(1, (s.peakX - s.startX) / ACC_SCALE));
  const accuracy = Math.max(-1, Math.min(1, s.fwdPeakDevX + backDev * 0.25));
  return { fired: true, power, accuracy };
}

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('Two-phase lock-on-reversal QA\n');

// 1. Pure pull-and-release → NO shot fires (user's core bug).
{
  const s = makeSwipe(200, 400);
  feed(s, 200, 500);      // full 100 px pull down
  feed(s, 200, 560);      // further 160 total
  const r = release(s);
  assert(!r.fired, 'Pull-and-lift without reversal → no shot', String(r.fired));
}

// 2. Pull + small reversal → locks, fires at locked power.
{
  const s = makeSwipe(200, 400);
  feed(s, 200, 560);      // 160 down (100%)
  feed(s, 200, 540);      // 20 px back up — crosses lock threshold
  const r = release(s);
  assert(r.fired, 'Pull + reversal → shot fires', String(r.fired));
  assert(Math.abs(r.power - 1) < 0.001, '  locked power = 100%', r.power.toFixed(3));
  assert(Math.abs(r.accuracy) < 0.01, '  straight swipe → accuracy ≈ 0', r.accuracy.toFixed(3));
}

// 3. Continuing to pull AFTER lock must NOT boost power.
{
  const s = makeSwipe(200, 400);
  feed(s, 200, 480);      // 80 down (50%)
  feed(s, 200, 450);      // reverse 30 px → lock at 50%
  feed(s, 200, 560);      // drags down again after lock
  const r = release(s);
  assert(r.fired, 'Late down-drag still fires', String(r.fired));
  assert(Math.abs(r.power - 0.5) < 0.02, '  locked power stays at 50%', r.power.toFixed(3));
}

// 4. Hook: full pull, reverse, drift LEFT during forward swing.
{
  const s = makeSwipe(200, 400);
  feed(s, 200, 560);
  feed(s, 200, 540);      // lock
  feed(s, 110, 500);      // drift 90 px left (full hook at ACC_SCALE = 45·dpr)
  feed(s, 170, 450);      // recover toward center
  const r = release(s);
  assert(r.fired, 'Hook: fires', String(r.fired));
  assert(r.accuracy <= -0.95, '  peak deviation latched → strong hook', r.accuracy.toFixed(3));
}

// 5. Slice: drift RIGHT.
{
  const s = makeSwipe(200, 400);
  feed(s, 200, 560);
  feed(s, 200, 540);
  feed(s, 290, 500);      // 90 px right (full slice)
  const r = release(s);
  assert(r.fired, 'Slice: fires', String(r.fired));
  assert(r.accuracy >= 0.95, '  peak deviation latched → strong slice', r.accuracy.toFixed(3));
}

// 6. Tiny backswing (below MIN_BACK) → aborts even with reversal.
{
  const s = makeSwipe(200, 400);
  feed(s, 200, 420);      // only 20 px (below MIN_BACK of 40)
  feed(s, 200, 400);
  const r = release(s);
  assert(!r.fired, 'Sub-threshold pull → swing aborted', String(r.fired));
}

// 7. Backswing drift contributes 25% to final accuracy.
{
  const s = makeSwipe(200, 400);
  feed(s, 290, 560);      // pull down AND 90 px right — backDev = +1
  feed(s, 290, 540);      // lock
  feed(s, 290, 500);      // straight up from lock — fwdPeakDevX = 0
  const r = release(s);
  assert(r.fired, 'Back-drift only: fires', String(r.fired));
  assert(Math.abs(r.accuracy - 0.25) < 0.02, '  accuracy = 0 + 1 × 0.25', r.accuracy.toFixed(3));
}
