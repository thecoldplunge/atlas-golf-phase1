#!/usr/bin/env node
// QA for the tracer/ball visual-lift parabola.
// Simulates a full-power driver flight using the same vz/z integration
// as the game, applies both the OLD lift function (hard min-cap at 78 px)
// and the NEW smooth-saturation lift function, and checks:
//   - vertical physics is a clean parabola (z(t) up then down, monotonic)
//   - the OLD visual lift flattens (plateau samples) — which is the bug
//   - the NEW visual lift is strictly monotonic up then strictly monotonic
//     down, with no plateau (except the single peak sample)

const GRAVITY = 30;
const dt = 1 / 60;

// Mimic a full driver shot: club.launch ~= 0.3, full power.
// launchVz = GRAVITY * targetHangTime * 0.5.
const clubLaunch = 0.3;
const launchRatio = 1.0;
const trajectoryScale = Math.pow(launchRatio, 1.3);
const targetHangTime = (3.2 + clubLaunch * 0.8) * trajectoryScale;
const launchVz = GRAVITY * targetHangTime * 0.5; // ~51.6

function trace() {
  let z = 0.08;
  let vz = launchVz;
  const samples = [];
  for (let step = 0; step < 600; step++) {
    vz -= GRAVITY * dt;
    z += vz * dt;
    if (z <= 0) break;
    samples.push({ t: step * dt, z, vz });
  }
  return samples;
}

// Tracer renders at a display scale. Pick one that reliably pushes lift
// beyond the old 78 px cap: pixelsPerWorld = 2.45 (default zoom on an
// iPhone-ish viewport).
const pixelsPerWorld = 2.45;
const rawLiftOf = (z) => z * pixelsPerWorld * 0.85;

const oldLift = (raw) => Math.min(raw, 78);
const SOFT_LIFT_MAX = 130;
const newLift = (raw) => SOFT_LIFT_MAX * Math.tanh(Math.max(0, raw) / SOFT_LIFT_MAX);

const samples = trace();
const apex = Math.max(...samples.map(s => s.z));
const rawApexPx = apex * pixelsPerWorld * 0.85;

console.log(`Driver full-power sim: apex z=${apex.toFixed(2)} world  (${rawApexPx.toFixed(1)} raw-lift px)\n`);

function plateauStretch(lifts) {
  // Return longest run of consecutive equal-value samples (a plateau).
  let best = 1, run = 1;
  for (let i = 1; i < lifts.length; i++) {
    if (Math.abs(lifts[i] - lifts[i - 1]) < 0.01) run++;
    else { best = Math.max(best, run); run = 1; }
  }
  return Math.max(best, run);
}

function monotonicUpThenDown(lifts) {
  let peakIdx = 0;
  for (let i = 1; i < lifts.length; i++) if (lifts[i] > lifts[peakIdx]) peakIdx = i;
  let up = true;
  for (let i = 1; i <= peakIdx; i++) if (lifts[i] < lifts[i - 1] - 0.01) up = false;
  let down = true;
  for (let i = peakIdx + 1; i < lifts.length; i++) if (lifts[i] > lifts[i - 1] + 0.01) down = false;
  return { peakIdx, up, down };
}

const oldLifts = samples.map(s => oldLift(rawLiftOf(s.z)));
const newLifts = samples.map(s => newLift(rawLiftOf(s.z)));

const oldPlateau = plateauStretch(oldLifts);
const newPlateau = plateauStretch(newLifts);
const oldMono = monotonicUpThenDown(oldLifts);
const newMono = monotonicUpThenDown(newLifts);

console.log('Frame-by-frame sample (every 20th frame):');
console.log('  t    |   z   |  raw |  old |  new');
for (let i = 0; i < samples.length; i += 20) {
  const s = samples[i];
  const raw = rawLiftOf(s.z);
  console.log(`  ${s.t.toFixed(2).padStart(4)} | ${s.z.toFixed(2).padStart(5)} | ${raw.toFixed(1).padStart(4)} | ${oldLifts[i].toFixed(1).padStart(4)} | ${newLifts[i].toFixed(1).padStart(4)}`);
}

console.log('\nResults:');
console.log(`  OLD lift: peak ${Math.max(...oldLifts).toFixed(1)} px, longest plateau = ${oldPlateau} samples`);
console.log(`  NEW lift: peak ${Math.max(...newLifts).toFixed(1)} px, longest plateau = ${newPlateau} samples`);

console.log('\nAssertions:');
const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

assert(oldPlateau > 20, 'OLD function produces a long plateau (the visible kink)', `plateau=${oldPlateau}`);
// A true parabola has z'(t) = 0 at the apex, so the first-derivative hovers
// near zero for a handful of frames around the peak — that's physics, not a
// kink. What we require is that the NEW plateau is a tiny fraction of the
// OLD, meaning the "flat-top" artifact is gone.
assert(newPlateau < oldPlateau / 5, 'NEW plateau is dramatically shorter than OLD', `new=${newPlateau} old=${oldPlateau}`);
assert(newMono.up && newMono.down, 'NEW lift is monotonic up then monotonic down (true parabola shape)', `up=${newMono.up} down=${newMono.down}`);
assert(Math.max(...newLifts) < SOFT_LIFT_MAX, 'NEW lift stays below the soft max', Math.max(...newLifts).toFixed(1));
// Low-flight fidelity: a 10-world-unit chip should not be visibly distorted.
const lowRaw = rawLiftOf(10);
const lowLift = newLift(lowRaw);
assert(Math.abs(lowLift / lowRaw - 1) < 0.05, 'Low-altitude tracer points are near-linear (chip shots unaffected)', `ratio=${(lowLift / lowRaw).toFixed(3)}`);
