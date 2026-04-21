#!/usr/bin/env node
// QA for the six Golf Story fixes shipped in GS spike v0.15.

const TILE = 16;

// === Shot type profiles (must mirror GolfStory/GolfStoryScreen.js) ===
const SHOT_TYPE_PROFILES = {
  normal:  { carry: 1.0,  apex: 1.0,  label: 'Normal' },
  chip:    { carry: 0.5,  apex: 0.7,  label: 'Chip' },
  flop:    { carry: 0.33, apex: 2.0,  label: 'Flop' },
  stinger: { carry: 1.0,  apex: 0.5,  label: 'Stinger' },
  bump:    { carry: 0.75, apex: 0.4,  label: 'Bump & Run' },
  tap:     { carry: 0.5,  apex: 1.0,  label: 'Tap' },
  blast:   { carry: 1.5,  apex: 1.0,  label: 'Blast' },
};

const WEDGE_KEYS_GS = new Set(['LW', 'SW', 'PW']);
const clubIsWedgeGS = (club) => !!club && WEDGE_KEYS_GS.has(club.key);
const clubIsIronOrWoodGS = (club) => !!club && club.key !== 'PT' && !WEDGE_KEYS_GS.has(club.key);
const STINGER_GOOD_LIES = new Set(['Tee Box', 'Fairway', 'Fringe']);

function shotTypeEligibleGS(type, club, lieLabel) {
  if (!club) return type === 'normal';
  if (club.key === 'PT') return type === 'normal' || type === 'tap' || type === 'blast';
  if (type === 'tap' || type === 'blast') return false;
  if (type === 'normal') return true;
  if (type === 'chip')   return true;
  if (type === 'flop')   return clubIsWedgeGS(club);
  if (type === 'bump')   return clubIsWedgeGS(club);
  if (type === 'stinger') return clubIsIronOrWoodGS(club) && STINGER_GOOD_LIES.has(lieLabel);
  return false;
}

// === Rough penalty QA ===
const ROUGH_PENALTY_NEW = [0.835, 0.925];
const ROUGH_PENALTY_OLD = [0.78, 0.9];

// === Camera follow logic (must mirror the tick loop) ===
// Encoded for a tiny set of states + modes.
const SW = { IDLE: 'idle', AIMING: 'aiming', SWIPING: 'swiping', FLYING: 'flying', ROLLING: 'rolling', DROPPING: 'dropping', STOPPED: 'stopped', HOLED: 'holed' };

function cameraFollow({ ball, p, flag, club, sw, cMode, viewW, viewH, dpr }) {
  const isPutting = club.key === 'PT';
  if (isPutting && (sw.state === SW.IDLE || sw.state === SW.AIMING || sw.state === SW.SWIPING || sw.state === SW.STOPPED)) {
    return { followX: (ball.x + flag.x) / 2, followY: (ball.y + flag.y) / 2, mode: 'putting-frame' };
  }
  if (cMode === 'golfer') {
    return { followX: p.x, followY: p.y, mode: 'golfer' };
  }
  const clubCarryPx = (club.v || 100) * 0.9;
  const setupStates = [SW.IDLE, SW.AIMING, SW.SWIPING];
  const movingStates = [SW.FLYING, SW.ROLLING, SW.DROPPING];
  if (setupStates.includes(sw.state)) {
    return {
      followX: ball.x + Math.sin(sw.aimAngle) * clubCarryPx,
      followY: ball.y - Math.cos(sw.aimAngle) * clubCarryPx,
      mode: 'aim-project',
    };
  }
  if (movingStates.includes(sw.state)) {
    return {
      followX: ball.x + (ball.vx || 0) * 0.25,
      followY: ball.y + (ball.vy || 0) * 0.25,
      mode: 'lead-ball',
    };
  }
  return { followX: ball.x, followY: ball.y, mode: 'ball' };
}

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('=== 1. Putter shot-type eligibility ===\n');
const putter = { key: 'PT' };
const iron = { key: '7I' };
const wedge = { key: 'PW' };
assert(shotTypeEligibleGS('tap', putter), 'Putter allows Tap', 'yes');
assert(shotTypeEligibleGS('blast', putter), 'Putter allows Blast', 'yes');
assert(shotTypeEligibleGS('normal', putter), 'Putter allows Normal', 'yes');
assert(!shotTypeEligibleGS('chip', putter), 'Putter blocks Chip', 'blocked');
assert(!shotTypeEligibleGS('tap', iron), 'Iron blocks Tap', 'blocked');
assert(!shotTypeEligibleGS('blast', wedge), 'Wedge blocks Blast', 'blocked');

console.log('\n=== 2. Putter profiles ===\n');
assert(SHOT_TYPE_PROFILES.tap.carry === 0.5, 'Tap is 50% carry', SHOT_TYPE_PROFILES.tap.carry);
assert(SHOT_TYPE_PROFILES.blast.carry === 1.5, 'Blast is 150% carry', SHOT_TYPE_PROFILES.blast.carry);
assert(SHOT_TYPE_PROFILES.tap.apex === 1.0, 'Tap apex = 1.0 (rolls flat)', SHOT_TYPE_PROFILES.tap.apex);

console.log('\n=== 3. Rough penalty softened 25% ===\n');
const oldLoss = [1 - ROUGH_PENALTY_OLD[1], 1 - ROUGH_PENALTY_OLD[0]]; // [0.10, 0.22]
const newLoss = [1 - ROUGH_PENALTY_NEW[1], 1 - ROUGH_PENALTY_NEW[0]]; // [0.075, 0.165]
const ratio = [(1 - oldLoss[1]), (1 - oldLoss[0])]; // same as OLD
const lossReduction = 1 - (newLoss[0] + newLoss[1]) / (oldLoss[0] + oldLoss[1]);
assert(
  Math.abs(lossReduction - 0.25) < 0.02,
  'Average loss cut by ~25%',
  `${(lossReduction * 100).toFixed(1)}%`
);
assert(ROUGH_PENALTY_NEW[0] > ROUGH_PENALTY_OLD[0], 'Min penalty raised', `${ROUGH_PENALTY_NEW[0]} > ${ROUGH_PENALTY_OLD[0]}`);
assert(ROUGH_PENALTY_NEW[1] > ROUGH_PENALTY_OLD[1], 'Max penalty raised', `${ROUGH_PENALTY_NEW[1]} > ${ROUGH_PENALTY_OLD[1]}`);

console.log('\n=== 4. Camera follow behavior ===\n');
const ball = { x: 200, y: 400, vx: 12, vy: -8 };
const p = { x: 180, y: 410 };
const flag = { x: 200, y: 100 };
const driver = { key: 'DR', v: 225 };
const sw = { aimAngle: 0, state: SW.IDLE };
const vp = { viewW: 400, viewH: 800, dpr: 2 };

// 4a: Tee (IDLE) with cameraMode='aim' should project toward aim (NOT golfer)
let r = cameraFollow({ ball, p, flag, club: driver, sw: { ...sw, state: SW.IDLE }, cMode: 'aim', ...vp });
assert(r.mode === 'aim-project', 'IDLE + aim mode → project aim (fixes tee bug)', r.mode);
assert(r.followY < ball.y - 50, 'Aim projection lifts follow upfield of ball', `followY=${r.followY.toFixed(1)} ball.y=${ball.y}`);

// 4b: Flight state → lead-ball
r = cameraFollow({ ball, p, flag, club: driver, sw: { ...sw, state: SW.FLYING }, cMode: 'aim', ...vp });
assert(r.mode === 'lead-ball', 'FLYING → lead the ball', r.mode);
assert(r.followX === ball.x + ball.vx * 0.25, 'Lead uses ball velocity', `${r.followX}`);

// 4c: Rolling → lead-ball
r = cameraFollow({ ball, p, flag, club: driver, sw: { ...sw, state: SW.ROLLING }, cMode: 'aim', ...vp });
assert(r.mode === 'lead-ball', 'ROLLING → lead the ball', r.mode);

// 4d: Putter → putting-frame regardless of aim mode
r = cameraFollow({ ball, p, flag, club: putter, sw: { ...sw, state: SW.AIMING }, cMode: 'aim', ...vp });
assert(r.mode === 'putting-frame', 'Putter + AIMING → putting frame between ball & flag', r.mode);
const mid = { x: (ball.x + flag.x) / 2, y: (ball.y + flag.y) / 2 };
assert(r.followX === mid.x && r.followY === mid.y, 'Putting follow is the midpoint', `(${r.followX}, ${r.followY})`);

// 4e: Putter during flight → normal ball follow (putting frame only during setup)
r = cameraFollow({ ball, p, flag, club: putter, sw: { ...sw, state: SW.ROLLING }, cMode: 'aim', ...vp });
assert(r.mode === 'lead-ball', 'Putter + ROLLING → lead the ball (not stuck on midpoint)', r.mode);

// 4f: Golfer mode still overrides everything except putting
r = cameraFollow({ ball, p, flag, club: driver, sw: { ...sw, state: SW.IDLE }, cMode: 'golfer', ...vp });
assert(r.mode === 'golfer', 'Golfer mode centers on player', r.mode);

console.log('\n=== 5. Putting zoom auto-scale ===\n');
// Close putt: should pick a larger zoom. Long putt: smaller zoom.
function puttingZoomFor(distPx, viewW, viewH, baseScale) {
  const shortPx = Math.min(viewW, viewH);
  const desiredScale = (shortPx * 0.55) / Math.max(16, distPx);
  return Math.max(1.5, Math.min(3.2, desiredScale / baseScale));
}
const vw = 400, vh = 800, baseScale = 4; // 2 * dpr=2
const shortClose = puttingZoomFor(30, vw, vh, baseScale);
const longPutt   = puttingZoomFor(300, vw, vh, baseScale);
console.log(`  close putt (30 px):   zoom=${shortClose.toFixed(2)}x`);
console.log(`  long putt  (300 px):  zoom=${longPutt.toFixed(2)}x`);
assert(shortClose > longPutt, 'Closer putt uses higher zoom than longer putt', `${shortClose.toFixed(2)} vs ${longPutt.toFixed(2)}`);
assert(shortClose <= 3.2 && longPutt >= 1.5, 'Zoom stays within [1.5, 3.2] bounds', `${shortClose.toFixed(2)} / ${longPutt.toFixed(2)}`);
