#!/usr/bin/env node
// QA for GS v0.38 auto-club rule.
// pickClubForDistance(distYd, onGreen) should return the smallest
// non-putter whose full carry covers (distYd − 20), falling back to
// the longest non-putter only when no club reaches that threshold.
// On-green shots always pick the putter (last club).

const TILE = 16;
const YARDS_PER_TILE = 10;
const GRAVITY = 70;

const CLUBS = [
  { key: 'DR', v: 225, angle: 20 },
  { key: '3W', v: 205, angle: 24 },
  { key: '5W', v: 190, angle: 28 },
  { key: '5I', v: 170, angle: 33 },
  { key: '7I', v: 148, angle: 39 },
  { key: '9I', v: 128, angle: 45 },
  { key: 'PW', v: 112, angle: 51 },
  { key: 'SW', v: 96,  angle: 58 },
  { key: 'PT', v: 110, angle: 0  },
];

function computeCarry(club, power) {
  const v = club.v * power;
  const angleRad = (club.angle * Math.PI) / 180;
  if (club.angle === 0) return v * 0.9;
  return Math.max(0, (v * v * Math.sin(2 * angleRad)) / GRAVITY);
}

function pickClubForDistance(distYd, onGreen) {
  if (onGreen) return CLUBS.length - 1;
  const minAcceptable = distYd - 20;
  const carries = [];
  for (let i = 0; i < CLUBS.length - 1; i++) {
    const carryPx = computeCarry(CLUBS[i], 1.0);
    carries.push({ idx: i, carryYd: (carryPx / TILE) * YARDS_PER_TILE });
  }
  carries.sort((a, b) => a.carryYd - b.carryYd);
  for (const c of carries) {
    if (c.carryYd >= minAcceptable) return c.idx;
  }
  return carries[carries.length - 1].idx;
}

const carryYd = (i) => Math.round((computeCarry(CLUBS[i], 1.0) / TILE) * YARDS_PER_TILE);
const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('Auto-club QA — reach OR within 20 yd short\n');
console.log('  Club carries (yd):');
for (let i = 0; i < CLUBS.length; i++) {
  console.log(`    ${CLUBS[i].key.padEnd(3)}  ${carryYd(i)}`);
}
console.log('');

// Green check.
{
  const idx = pickClubForDistance(15, true);
  assert(CLUBS[idx].key === 'PT', 'On-green → putter', CLUBS[idx].key);
}

// For each fairway distance, the chosen club must cover distYd − 20.
const distances = [30, 60, 90, 120, 160, 200, 240, 300];
for (const d of distances) {
  const idx = pickClubForDistance(d, false);
  const c = CLUBS[idx];
  const cy = (computeCarry(c, 1.0) / TILE) * YARDS_PER_TILE;
  const reaches = cy >= d - 20;
  const isLongest = idx === 0 || /* driver is strongest */ false;
  assert(reaches || isLongest, `${d}yd → ${c.key} (${Math.round(cy)}yd carry) covers d−20=${d - 20}`, `carry=${Math.round(cy)}, minAcceptable=${d - 20}`);
}

// Smallest-reaching check: for a 100 yd shot, the chosen club should
// NOT be bigger than necessary (not more than one club larger than the
// smallest that reaches (d − 20) = 80).
{
  const d = 100;
  const idx = pickClubForDistance(d, false);
  const c = CLUBS[idx];
  const cy = (computeCarry(c, 1.0) / TILE) * YARDS_PER_TILE;
  // Find the true smallest reaching club independently.
  let smallestReach = null;
  const sorted = [...CLUBS.slice(0, -1)].map((cc, i) => ({ cc, i, cy: (computeCarry(cc, 1.0) / TILE) * YARDS_PER_TILE }));
  sorted.sort((a, b) => a.cy - b.cy);
  for (const s of sorted) {
    if (s.cy >= d - 20) { smallestReach = s; break; }
  }
  assert(idx === smallestReach.i, `${d}yd picks smallest reacher (${smallestReach.cc.key})`, `picked ${c.key}`);
}

// Out-of-range distance (past driver) falls back to the longest club.
{
  const d = 1000;
  const idx = pickClubForDistance(d, false);
  assert(CLUBS[idx].key === 'DR', `unreachable ${d}yd → driver fallback`, CLUBS[idx].key);
}
