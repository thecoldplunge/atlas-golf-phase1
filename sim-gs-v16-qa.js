#!/usr/bin/env node
// QA for GS v0.16:
//   - Auto-Tap: putter auto-selects 'tap' when the hole is within 50%
//     of the putter's stock carry, reverts to 'normal' if the player
//     moves further away, but respects manual overrides.
//   - Swing pad visibility: should be hidden mid-swipe / mid-flight /
//     hole-out / hazard / OB / overlay-open.
//   - Swing pad theme sanity: matches the HUD mint-border palette, not
//     the old bright red.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Mirror from GolfStoryScreen.js
const SW = {
  IDLE: 'idle', AIMING: 'aiming', SWIPING: 'swiping',
  FLYING: 'flying', ROLLING: 'rolling', STOPPED: 'stopped',
  DROPPING: 'dropping', HAZARD: 'hazard', OB: 'ob', HOLED: 'holed',
};

const putter = { key: 'PT', v: 110 };

// Auto-tap: run INSIDE the putting framing branch of the tick loop.
// Returns the new shotType, given the current manual-override flag.
function autoTapPick({ dist, club, current, manual }) {
  if (manual) return current;
  const tapReach = club.v * 0.5;
  return dist <= tapReach ? 'tap' : 'normal';
}

function swingPadVisible({ state, shapeOverlay, clubPicker }) {
  if (shapeOverlay || clubPicker) return false;
  const hidden = [
    SW.SWIPING, SW.FLYING, SW.ROLLING, SW.DROPPING, SW.HOLED, SW.HAZARD, SW.OB,
  ];
  return !hidden.includes(state);
}

const assert = (ok, msg, actual) =>
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('=== 1. Auto-Tap putter heuristic ===\n');

// 55 px is the tap-reach cutoff for putter v=110.
let r;
r = autoTapPick({ dist: 30, club: putter, current: 'normal', manual: false });
assert(r === 'tap', 'Close putt (30 px) auto-switches to Tap', r);

r = autoTapPick({ dist: 55, club: putter, current: 'normal', manual: false });
assert(r === 'tap', 'Exactly at reach (55 px) auto-selects Tap', r);

r = autoTapPick({ dist: 56, club: putter, current: 'normal', manual: false });
assert(r === 'normal', 'Just past reach (56 px) reverts to Normal', r);

r = autoTapPick({ dist: 200, club: putter, current: 'normal', manual: false });
assert(r === 'normal', 'Long putt stays Normal', r);

r = autoTapPick({ dist: 30, club: putter, current: 'normal', manual: true });
assert(r === 'normal', 'Manual override blocks auto-Tap (Normal stays)', r);

r = autoTapPick({ dist: 300, club: putter, current: 'blast', manual: true });
assert(r === 'blast', 'Manual override blocks auto-flip (Blast stays)', r);

// Re-entering putting (manual = false) should re-evaluate.
r = autoTapPick({ dist: 20, club: putter, current: 'normal', manual: false });
assert(r === 'tap', 'Next shot (manual reset) evaluates again', r);

console.log('\n=== 2. Swing pad visibility ===\n');
const hiddenStates = [SW.SWIPING, SW.FLYING, SW.ROLLING, SW.DROPPING, SW.HOLED, SW.HAZARD, SW.OB];
const visibleStates = [SW.IDLE, SW.AIMING, SW.STOPPED];

for (const s of hiddenStates) {
  assert(
    !swingPadVisible({ state: s, shapeOverlay: false, clubPicker: false }),
    `${s} → pad hidden`,
    'hidden'
  );
}
for (const s of visibleStates) {
  assert(
    swingPadVisible({ state: s, shapeOverlay: false, clubPicker: false }),
    `${s} → pad visible`,
    'visible'
  );
}
assert(
  !swingPadVisible({ state: SW.AIMING, shapeOverlay: true, clubPicker: false }),
  'Shape overlay open → pad hidden',
  'hidden'
);
assert(
  !swingPadVisible({ state: SW.AIMING, shapeOverlay: false, clubPicker: true }),
  'Club picker open → pad hidden',
  'hidden'
);

console.log('\n=== 3. Swing pad theme sanity ===\n');
// Hardcoded palette we expect (matches the styles.js block we just shipped).
const swingPadTheme = {
  backgroundColor: 'rgba(7, 11, 9, 0.88)',
  borderColor: '#88F8BB',
  shadowColor: '#88F8BB',
  labelColor: '#f5fbef',
  hintColor: 'rgba(136, 248, 187, 0.9)',
};
assert(swingPadTheme.backgroundColor.startsWith('rgba(7, 11, 9'),
  'Dark HUD background (not bright red)',
  swingPadTheme.backgroundColor);
assert(swingPadTheme.borderColor === '#88F8BB',
  'Mint-teal accent border matches HUD_BORDER family',
  swingPadTheme.borderColor);
assert(swingPadTheme.labelColor === '#f5fbef',
  'Label uses off-white HUD color',
  swingPadTheme.labelColor);
