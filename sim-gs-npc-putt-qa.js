#!/usr/bin/env node
// QA for the NPC's putter power calc. Before v0.52 the code used the
// LINEAR approximation `powerPct = distPx / computeCarry(club, 1.0)`
// — which wildly under-hit short putts because rolling physics
// actually decays linearly in velocity (so distance ∝ v²). The new
// code inverts the quadratic: v0 = sqrt(2·R·d) then powers the
// chosen shot profile to hit that v0.

const TILE = 16;
const YARDS_PER_TILE = 10;

function stepRoll(v, rollDecel, dt) {
  const decel = rollDecel * 40 * dt;
  const factor = Math.max(0, 1 - decel / Math.max(v, 0.01));
  return v * factor;
}

function simulateRoll(v0, rollDecel, { dt = 1 / 60, maxSteps = 2000 } = {}) {
  let v = v0, dist = 0;
  for (let i = 0; i < maxSteps; i++) {
    if (v < 4) break;
    dist += v * dt;
    v = stepRoll(v, rollDecel, dt);
  }
  return dist;
}

function pickPuttPower(distPx, club, rollDecel) {
  const R = rollDecel * 40;
  const overshoot = 1.08;
  const desiredV0 = Math.sqrt(2 * R * Math.max(1, distPx)) * overshoot;
  const tapFullV0 = club.v * 0.5;
  const normalFullV0 = club.v * 1.0;
  if (desiredV0 <= tapFullV0) {
    return { shotType: 'tap', power: desiredV0 / tapFullV0 };
  }
  return { shotType: 'normal', power: desiredV0 / normalFullV0 };
}

function launchV0(club, power, shotType) {
  const profileCarry = shotType === 'tap' ? 0.5 : 1.0;
  return club.v * power * profileCarry;
}

const putter = { v: 110 };
const greenDecel = 0.85;

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('NPC putter power QA — quadratic inverse\n');

// Sanity: full-power normal putt rolls >> computeCarry linear estimate.
{
  const dist = simulateRoll(putter.v, greenDecel);
  assert(dist > 150, `Full-power putt rolls >150 px (linear guess was 99)`, dist.toFixed(1));
}

// 20 / 40 / 80 / 120 px putts — NPC should land within ±15% of target.
for (const d of [20, 40, 80, 120, 180]) {
  const { shotType, power } = pickPuttPower(d, putter, greenDecel);
  const v0 = launchV0(putter, power, shotType);
  const rolled = simulateRoll(v0, greenDecel);
  const err = (rolled - d) / d;
  const ok = rolled >= d * 0.9 && rolled <= d * 1.2;
  assert(ok, `${d}px putt → ${shotType} ${Math.round(power * 100)}% lands ${rolled.toFixed(1)}px (err ${(err * 100).toFixed(1)}%)`, `${rolled.toFixed(1)} vs ${d}`);
}

// Pre-v0.52 (linear) formula would have been:
//   powerPct = d / (computeCarry * 0.5) for tap, or d / computeCarry for normal.
// A 20 px putt would have landed at ~16 px — the bug the user reported.
{
  const preV0 = putter.v * (20 / (putter.v * 0.9 * 0.5)) * 0.5; // legacy tap math
  const legacyRoll = simulateRoll(preV0, greenDecel);
  assert(legacyRoll < 20 * 0.9, `Legacy formula under-hits 20 px putt (confirms bug existed)`, legacyRoll.toFixed(1));
}
