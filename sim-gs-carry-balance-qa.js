#!/usr/bin/env node
// QA for the v0.72 power rebalance. Target carry distances:
//   50 PWR + 50 TCH + 50 club distance → 250 yd driver
//   95 PWR + 95 TCH + 100 club distance → 400 yd driver
// With the rebalance (driver v 225 → 209) + tightened multiplier
// exponents (0.003 → 0.0022 for power, 0.003 → 0.0017 for distance)
// the carry math below should match the targets within a small margin.

const TILE = 16;
const YARDS_PER_TILE = 10;
const GRAVITY = 70;

// Mirrors the updated CLUBS table.
const DR = { v: 209, angle: 20 };

function computeCarry(club, power) {
  const v = club.v * power;
  const a = (club.angle * Math.PI) / 180;
  if (club.angle === 0) return v * 0.9;
  return Math.max(0, (v * v * Math.sin(2 * a)) / GRAVITY);
}

function golferPowerMul(power, touch) {
  const pf = Math.max(0.80, Math.min(1.20, 1 + (power - 50) * 0.0022));
  const tf = Math.max(0.92, Math.min(1.08, 1 + (touch - 50) * 0.0015));
  return pf * tf;
}

function clubDistanceMul(distance) {
  return Math.max(0.92, Math.min(1.09, 1 + (distance - 50) * 0.0017));
}

function driveYd({ pwr, tch, clubDist }) {
  const v0Mul = golferPowerMul(pwr, tch) * clubDistanceMul(clubDist);
  // carry ∝ v², so multiplying v0 by v0Mul multiplies carry by v0Mul².
  const baseCarryPx = computeCarry(DR, 1.0);
  const carryPx = baseCarryPx * v0Mul * v0Mul;
  return carryPx / TILE * YARDS_PER_TILE;
}

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('v0.72 carry rebalance QA — driver targets\n');

const baselineYd = driveYd({ pwr: 50, tch: 50, clubDist: 50 });
assert(Math.abs(baselineYd - 250) < 10, `50/50/50 → 250 yd driver (±10)`, baselineYd.toFixed(1));

const maxedYd = driveYd({ pwr: 95, tch: 95, clubDist: 100 });
assert(Math.abs(maxedYd - 400) < 15, `95/95/100 → 400 yd driver (±15)`, maxedYd.toFixed(1));

// Sanity: mid-stat golfer with mid clubs sits between baseline and max.
const midYd = driveYd({ pwr: 70, tch: 70, clubDist: 70 });
assert(midYd > baselineYd && midYd < maxedYd, `70/70/70 drive sits between 50 and max`, midYd.toFixed(1));

// Floor: low-stat golfer, low club — carry should noticeably drop.
const lowYd = driveYd({ pwr: 30, tch: 30, clubDist: 30 });
assert(lowYd < baselineYd, `30/30/30 < 50/50/50`, `${lowYd.toFixed(1)} < ${baselineYd.toFixed(1)}`);

// Scaling sanity — max / baseline should be ~1.6 (1.27² since carry
// is quadratic in the v multiplier).
const scale = maxedYd / baselineYd;
assert(scale > 1.45 && scale < 1.70, `max/baseline carry scale ~1.6 (quadratic of 1.27)`, scale.toFixed(2));
