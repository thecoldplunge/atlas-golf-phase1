#!/usr/bin/env node
// QA for the "pause at top → release without forward motion = infinite
// power" bug. Reproduces the exact user scenario: long dragged backswing,
// a pause, then a finger-lift with fewer than 3 forward samples captured.
//
// Before v3.39:
//   evaluateTempo returned { tempoMult: 1.0, tempoTag: 'Normal' } whenever
//   forward.length < 3, which silently disabled both the tempo penalty and
//   the pause distance penalty. A 120% backswing launched at full carry.
//
// After v3.39:
//   A missing forward trace returns a 1.8× tempoMult + an exp(-0.005 *
//   pauseMs) pauseDistanceMult so the shot bleeds carry and sprays.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const TEMPO_THRESHOLDS = {
  backJerk: 0.38,
  forwardJerk: 0.50,
  pauseTolerance: 0,
  pauseNaturalFloorMs: 40,
  pauseDistanceK: 0.005,
};

// Mirrors the App.js function shape — we only exercise the new short-forward
// branch here.
function evaluateTempoShortForward(samples) {
  const back = samples.filter((s) => s.phase !== 'forward');
  const forward = samples.filter((s) => s.phase === 'forward');
  if (back.length < 3 && forward.length < 3) {
    return { tempoMult: 1.0, tempoTag: 'Normal', metrics: { reason: 'too-short' } };
  }
  if (forward.length < 3) {
    const tailCount = Math.min(back.length, 12);
    let hoverMs = 0;
    for (let i = back.length - tailCount + 1; i < back.length; i++) {
      const a = back[i - 1];
      const b = back[i];
      const dt = Math.max(0, b.t - a.t);
      if (dt <= 0) continue;
      const v = Math.hypot(b.x - a.x, b.y - a.y) / dt;
      if (v < 0.08) hoverMs += dt;
    }
    const pauseMs = Math.max(0, hoverMs - TEMPO_THRESHOLDS.pauseNaturalFloorMs);
    const pauseDistanceMult = pauseMs > 0
      ? Math.exp(-TEMPO_THRESHOLDS.pauseDistanceK * pauseMs)
      : 1.0;
    return {
      tempoMult: 1.8,
      tempoTag: pauseMs > 120 ? 'Paused + Rushed' : 'Rushed',
      metrics: { pauseMs, pauseDistanceMult: +pauseDistanceMult.toFixed(3), reason: 'no-forward' },
    };
  }
  return null; // normal path tested elsewhere
}

// Build a synthetic swing: 30 back samples pulling down, 400ms pause at the
// bottom, then 1 forward sample (a fast flick release). This mirrors what
// the user described.
function buildBuggyScenario(pauseMs) {
  const samples = [];
  // Backswing: y from 500 → 600 over 30 samples, 16ms each.
  for (let i = 0; i <= 30; i++) {
    samples.push({
      x: 400 + (Math.random() - 0.5) * 2,
      y: 500 + (i / 30) * 100,
      t: i * 16,
      phase: 'back',
    });
  }
  // Pause: no movement for pauseMs, appended as one trailing back sample.
  samples.push({
    x: samples[samples.length - 1].x,
    y: samples[samples.length - 1].y,
    t: samples[samples.length - 1].t + pauseMs,
    phase: 'back',
  });
  // Release: single forward sample (fewer than the 3-sample gate).
  samples.push({
    x: samples[samples.length - 1].x,
    y: samples[samples.length - 1].y - 80,
    t: samples[samples.length - 1].t + 20,
    phase: 'forward',
  });
  return samples;
}

// What the shot speed WOULD be (rough approximation of targetCarryWorld):
//   stock × (peakPower/100) × powerFactor × touchFactor × pauseDistanceMult × tempoCarryMult
// We skip golfer/club factors here; focus is on the pause + tempo terms.
function carryFraction(tempoMult, pauseDistanceMult, peakPowerPct) {
  const tempoCarryMult = tempoMult > 1
    ? clamp(1 / Math.pow(tempoMult, 0.3), 0.55, 1.0)
    : 1.0;
  const powerFrac = clamp(peakPowerPct / 100, 0, 1.2);
  return powerFrac * pauseDistanceMult * tempoCarryMult;
}

console.log('=== Buggy-scenario sweep (120% backswing + pause + flick release) ===\n');
for (const pauseMs of [0, 50, 100, 200, 400, 800]) {
  const samples = buildBuggyScenario(pauseMs);
  const r = evaluateTempoShortForward(samples);
  const frac = carryFraction(r.tempoMult, r.metrics.pauseDistanceMult ?? 1, 120);
  console.log(`  pause=${String(pauseMs).padStart(3)}ms  tempoMult=${r.tempoMult.toFixed(2)}  pauseDistMult=${(r.metrics.pauseDistanceMult ?? 1).toFixed(3)}  carryFrac=${frac.toFixed(3)}  tag="${r.tempoTag}"`);
}

console.log('\n=== OLD behavior would have been (tempoMult=1.0, pauseDistMult=1.0, peak=120%) ===');
const oldFrac = carryFraction(1.0, 1.0, 120);
console.log(`  carryFrac=${oldFrac.toFixed(3)}  ← full 120% carry, no penalty`);

console.log('\n=== Assertions ===');
const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

const noPause = evaluateTempoShortForward(buildBuggyScenario(0));
assert(noPause.tempoMult >= 1.5, 'Flick-release WITHOUT pause still gets a tempo penalty', `mult=${noPause.tempoMult}`);

const shortPause = evaluateTempoShortForward(buildBuggyScenario(200));
assert(shortPause.metrics.pauseDistanceMult < 0.85, 'Short 200ms pause cuts carry noticeably', `pauseDistMult=${shortPause.metrics.pauseDistanceMult}`);

const longPause = evaluateTempoShortForward(buildBuggyScenario(500));
assert(longPause.metrics.pauseDistanceMult < 0.2, 'Long 500ms pause cuts carry dramatically', `pauseDistMult=${longPause.metrics.pauseDistanceMult}`);

const carryWithBug = carryFraction(1.0, 1.0, 120);
const carryWithFix = carryFraction(longPause.tempoMult, longPause.metrics.pauseDistanceMult, 120);
assert(carryWithFix < carryWithBug * 0.3, 'Fix cuts the buggy full-120% carry by >70% on a 500ms pause', `bug=${carryWithBug.toFixed(2)} fix=${carryWithFix.toFixed(2)}`);

// Sanity: normal paths (both arms ≥ 3 samples) should still reach the
// full evaluateTempo path, which our stub skips.
const normalSamples = [
  ...Array.from({ length: 6 }, (_, i) => ({ x: 400, y: 500 + i * 20, t: i * 16, phase: 'back' })),
  ...Array.from({ length: 6 }, (_, i) => ({ x: 400, y: 620 - i * 20, t: 100 + i * 16, phase: 'forward' })),
];
const normalResult = evaluateTempoShortForward(normalSamples);
assert(normalResult === null, 'Normal swing falls through to the full evaluator (returned null from this stub)', `result=${normalResult}`);
