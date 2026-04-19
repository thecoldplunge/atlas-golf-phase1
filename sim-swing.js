#!/usr/bin/env node
/**
 * Swing tempo simulator.
 *
 * Generates synthetic swing samples (the same shape the PanResponder produces:
 * {x, y, t, phase}) with controllable characteristics — smooth vs jerky,
 * paused vs snappy transition, decelerating vs committed forward swing —
 * and scores them with the new tempo algorithm so we can verify the ordering
 * before wiring it into App.js.
 *
 * The tempo algorithm replaces the old "how many ms did the forward swing
 * take" window with a smoothness / pause / follow-through model:
 *
 *   - Backswing jerk          → penalty (no crazy accel ramps going back)
 *   - Transition pause        → penalty (hovering at the top makes it easier
 *                               to aim, so we tax it hard)
 *   - Forward jerk            → penalty (abrupt direction flip)
 *   - Forward deceleration    → penalty (slowing down before impact)
 *   - Follow-through strength → bonus (velocity still peaking at release =
 *                               committed, powerful swing)
 *
 * A "Pure" swing (no penalties, strong follow-through) gets the biggest
 * bonus. A paused + decel'd swing gets stacked penalties.
 */

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// ═══════════════ Tempo algorithm ═══════════════
//
// This is the NEW tempo evaluator. Copy into App.js verbatim (minus the
// `module.exports`). Takes a timestamped sample stream and returns
// { tempoMult, tempoTag, metrics }. tempoMult > 1 amplifies deviation
// (penalty); tempoMult < 1 dampens it (bonus).

function evaluateTempo(samples, { focus = 50, composure = 50 } = {}) {
  // --- 1. Split into phases ---------------------------------------------
  const back = [];
  const forward = [];
  let transitionIndex = -1;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s.phase === 'forward') {
      if (transitionIndex < 0) transitionIndex = i;
      forward.push(s);
    } else {
      back.push(s);
    }
  }
  if (back.length < 3 || forward.length < 3) {
    return { tempoMult: 1.0, tempoTag: 'Normal', metrics: { reason: 'too-short' } };
  }

  // --- 2. Speed profile (px/ms) -----------------------------------------
  const speeds = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dt = Math.max(1, b.t - a.t);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    speeds.push({ t: b.t, v: Math.hypot(dx, dy) / dt, phase: b.phase });
  }

  const backSpeeds = speeds.filter((s) => s.phase !== 'forward');
  const forwardSpeeds = speeds.filter((s) => s.phase === 'forward');

  const peakBack = Math.max(0.001, ...backSpeeds.map((s) => s.v));
  const peakForward = Math.max(0.001, ...forwardSpeeds.map((s) => s.v));

  // --- 3. Jerk (smoothness) ---------------------------------------------
  // Jerk = mean abs change in accel between adjacent samples, normalised
  // by the peak speed in that phase so slow swings aren't unfairly hit.
  function jerkScore(phaseSpeeds, peak) {
    if (phaseSpeeds.length < 3) return 0;
    let sum = 0;
    let count = 0;
    for (let i = 2; i < phaseSpeeds.length; i++) {
      const a0 = phaseSpeeds[i - 1].v - phaseSpeeds[i - 2].v;
      const a1 = phaseSpeeds[i].v - phaseSpeeds[i - 1].v;
      sum += Math.abs(a1 - a0);
      count++;
    }
    return count > 0 ? (sum / count) / peak : 0;
  }
  const backJerk = jerkScore(backSpeeds, peakBack);
  const forwardJerk = jerkScore(forwardSpeeds, peakForward);

  // --- 4. Pause at top ---------------------------------------------------
  // Look for a window around the transition where pointer speed stays
  // near zero. Pause = total duration (ms) where speed is below 12% of
  // peak backswing speed within ±200ms of the transition. This catches
  // long held pauses as their full length, ignores the unavoidable
  // ~30ms natural reversal dip.
  const pauseThresh = peakBack * 0.12;
  const transitionT = samples[transitionIndex].t;
  let pauseMsRaw = 0;
  for (let i = 1; i < samples.length; i++) {
    const mid = (samples[i].t + samples[i - 1].t) / 2;
    if (Math.abs(mid - transitionT) > 200) continue;
    const dt = Math.max(0, samples[i].t - samples[i - 1].t);
    if (dt <= 0) continue;
    const dx = samples[i].x - samples[i - 1].x;
    const dy = samples[i].y - samples[i - 1].y;
    const v = Math.hypot(dx, dy) / dt;
    if (v < pauseThresh) pauseMsRaw += dt;
  }
  // Subtract ~30ms natural reversal floor so a smooth swing reads 0.
  const pauseMs = Math.max(0, pauseMsRaw - 30);

  // --- 5. Forward deceleration ------------------------------------------
  // Find peak forward speed, then measure how much speed drops from the
  // peak to the release (last sample). Expressed as fraction of peak.
  let peakIdx = 0;
  for (let i = 0; i < forwardSpeeds.length; i++) {
    if (forwardSpeeds[i].v > forwardSpeeds[peakIdx].v) peakIdx = i;
  }
  const releaseV = forwardSpeeds.length > 0 ? forwardSpeeds[forwardSpeeds.length - 1].v : 0;
  const decelFrac = peakForward > 0 ? clamp(1 - releaseV / peakForward, 0, 1) : 0;

  // --- 6. Follow-through strength ---------------------------------------
  // Where in the forward swing does the peak occur? If peak is near the
  // END (>70% through), the swing is committed. Near the START → they
  // yanked and coasted. Fraction of forward samples BEFORE the peak.
  const peakPosition = forwardSpeeds.length > 1
    ? peakIdx / (forwardSpeeds.length - 1)
    : 0.5;
  // 0.0 = peak at start (coasted), 1.0 = peak at release (full commit)
  const followThrough = clamp(peakPosition, 0, 1);

  // --- 7. Combine into multiplier + tag ---------------------------------
  // Baseline is 1.0 (neutral — matches the old "Normal"). Stack penalties
  // for every flaw, then apply follow-through as a bonus or additional
  // penalty if the swing coasted.
  let mult = 1.0;
  const tags = [];
  const focusBias = clamp((focus - 50) / 100, -0.5, 0.5);
  const composureSoften = clamp(1 - (composure - 50) * 0.003, 0.85, 1.15);

  // Pause penalty — the marquee change. Pre-subtracted ~30ms natural
  // reversal floor. Any remaining pause > 20ms starts biting, ramps hard
  // past 120ms. Focus tightens this window.
  const pauseTolerance = 20 * (1 - focusBias * 0.4);
  if (pauseMs > pauseTolerance) {
    const over = pauseMs - pauseTolerance;
    mult *= 1 + clamp(over / 100, 0, 0.9);
    tags.push('Paused');
  }

  // Backswing jerk penalty. Threshold tuned so a clean 300ms pull stays
  // under it, and a rattled yank-back trips it.
  if (backJerk > 0.18) {
    mult *= 1 + clamp((backJerk - 0.18) * 2.0, 0, 0.5);
    tags.push('Jerky Back');
  }

  // Forward jerk penalty. Forward swing is short, so slightly more
  // tolerant — it's a fast, accelerating motion.
  if (forwardJerk > 0.30) {
    mult *= 1 + clamp((forwardJerk - 0.30) * 1.8, 0, 0.5);
    tags.push('Jerky Forward');
  }

  // Deceleration penalty — losing speed before release. Natural arc
  // swings have decelFrac near 1.0 (release at zero speed). We only
  // flag clearly decelerating swings (release speed under ~35% of peak).
  if (decelFrac > 0.65) {
    mult *= 1 + clamp((decelFrac - 0.65) * 1.4, 0, 0.5);
    tags.push('Decel');
  }

  // Follow-through scoring — peak position in the forward swing.
  // followThrough: 0 = coasted (bad), 1 = committed (great).
  if (followThrough >= 0.70 && tags.length === 0) {
    mult *= 0.88;
    tags.push('Committed');
  } else if (followThrough < 0.25) {
    mult *= 1.15;
    tags.push('Coasted');
  }

  // Apply composure to penalties (penalties shrink with composure=100,
  // grow with composure=0). Bonuses untouched.
  if (mult > 1.0) {
    mult = 1 + (mult - 1) * composureSoften;
  }

  // "Pure" — the perfect swing. No penalties AND strong follow-through
  // AND low overall jerk. Gets the best modifier in the system.
  const pureBonus = tags.length === 1 && tags[0] === 'Committed'
    && backJerk < 0.12 && forwardJerk < 0.18 && pauseMs < 15
    && decelFrac < 0.05;
  if (pureBonus) {
    mult = 0.78;
    tags.length = 0;
    tags.push('Pure');
  }

  return {
    tempoMult: +mult.toFixed(3),
    tempoTag: tags.length ? tags.join(' + ') : 'Smooth',
    metrics: {
      backJerk: +backJerk.toFixed(3),
      forwardJerk: +forwardJerk.toFixed(3),
      pauseMs: Math.round(pauseMs),
      decelFrac: +decelFrac.toFixed(3),
      followThrough: +followThrough.toFixed(2),
      peakBack: +peakBack.toFixed(2),
      peakForward: +peakForward.toFixed(2),
    },
  };
}

// ═══════════════ Synthetic swing generators ═══════════════
//
// Generate timestamped {x, y, t, phase} sample streams for each archetype.
// The pan responder fires at roughly 60Hz, so we sample at 16ms intervals.

const DT = 16; // ms per sample
const START = { x: 200, y: 400 };

function makeSwing({
  backMs = 350,
  pauseMs = 0,
  forwardMs = 150,
  backDist = 220,
  forwardDist = 110,
  backProfile = 'smooth',       // 'smooth' | 'jerky' | 'easeIn' | 'easeOut'
  forwardProfile = 'smooth',    // 'smooth' | 'committed' | 'coast' | 'decel' | 'jerky'
}) {
  const samples = [];
  let t = 0;
  samples.push({ x: START.x, y: START.y, t, phase: 'start' });

  // Backswing — pointer moves DOWN (y+), matching App.js convention where
  // dragging down charges the power meter.
  const backSteps = Math.max(2, Math.round(backMs / DT));
  for (let i = 1; i <= backSteps; i++) {
    const u = i / backSteps;
    let progress;
    switch (backProfile) {
      case 'jerky':
        // Random juddery motion
        progress = u + Math.sin(u * 40) * 0.08;
        break;
      case 'easeIn':
        progress = u * u;
        break;
      case 'easeOut':
        progress = 1 - (1 - u) ** 2;
        break;
      case 'smooth':
      default:
        progress = 0.5 - Math.cos(u * Math.PI) / 2; // sinusoidal ease
    }
    progress = clamp(progress, 0, 1);
    t += DT;
    samples.push({
      x: START.x,
      y: START.y + progress * backDist,
      t,
      phase: i === backSteps ? 'back' : 'back',
    });
  }

  // Pause at top — pointer stays put.
  const pauseSteps = Math.round(pauseMs / DT);
  const topX = samples[samples.length - 1].x;
  const topY = samples[samples.length - 1].y;
  for (let i = 1; i <= pauseSteps; i++) {
    t += DT;
    samples.push({ x: topX + (Math.random() - 0.5) * 0.4, y: topY + (Math.random() - 0.5) * 0.4, t, phase: 'back' });
  }

  // Transition → forward (first forward sample).
  t += DT;
  samples.push({ x: topX, y: topY - 2, t, phase: 'forward' });

  // Forward swing — pointer moves UP (y-). Different peak-speed locations
  // per profile:
  //   smooth:    peak mid-swing
  //   committed: peak at end (follow-through)
  //   coast:     peak near start, long coast
  //   decel:     peak early, slows before release
  //   jerky:     random spikes
  const fwdSteps = Math.max(2, Math.round(forwardMs / DT));
  for (let i = 1; i <= fwdSteps; i++) {
    const u = i / fwdSteps;
    let speedScale;
    switch (forwardProfile) {
      case 'committed':
        // Speed ramps to the END
        speedScale = 0.25 + u * 0.75;
        break;
      case 'coast':
        // Big burst early, then trail off
        speedScale = 1.0 - u * 0.6;
        break;
      case 'decel':
        // Peaks at 30%, then drops hard
        speedScale = u < 0.3 ? u / 0.3 : (1 - (u - 0.3) * 1.3);
        break;
      case 'jerky':
        speedScale = 0.5 + Math.sin(u * 15) * 0.3;
        break;
      case 'smooth':
      default:
        // Symmetric peak at middle
        speedScale = Math.sin(u * Math.PI);
    }
    speedScale = Math.max(0.05, speedScale);
    t += DT;
    // Integrate the speed profile numerically to position
    const progress = integrateProfile(forwardProfile, u, fwdSteps);
    samples.push({
      x: topX + (Math.random() - 0.5) * 1.5,
      y: topY - progress * forwardDist,
      t,
      phase: 'forward',
    });
  }
  return samples;
}

// Pre-computed per-step position for each forward profile (0 → 1 over u).
function integrateProfile(profile, u, steps) {
  const N = 200;
  let total = 0;
  const samples = [];
  for (let i = 1; i <= N; i++) {
    const x = i / N;
    let s;
    switch (profile) {
      case 'committed': s = 0.25 + x * 0.75; break;
      case 'coast':     s = 1.0 - x * 0.6;   break;
      case 'decel':     s = x < 0.3 ? x / 0.3 : Math.max(0.05, 1 - (x - 0.3) * 1.3); break;
      case 'jerky':     s = 0.5 + Math.sin(x * 15) * 0.3; break;
      case 'smooth':
      default:          s = Math.sin(x * Math.PI);
    }
    s = Math.max(0.05, s);
    total += s;
    samples.push(total);
  }
  const idx = clamp(Math.round(u * (N - 1)), 0, N - 1);
  return samples[idx] / total;
}

// ═══════════════ Scenarios ═══════════════
const SCENARIOS = [
  { name: 'Pure          (smooth back, no pause, committed fwd)',
    opts: { backMs: 380, pauseMs: 0, forwardMs: 160, backProfile: 'smooth', forwardProfile: 'committed' } },
  { name: 'Smooth        (smooth back, no pause, symmetric fwd)',
    opts: { backMs: 380, pauseMs: 0, forwardMs: 150, backProfile: 'smooth', forwardProfile: 'smooth' } },
  { name: 'Paused        (smooth back, 100ms pause, smooth fwd)',
    opts: { backMs: 380, pauseMs: 100, forwardMs: 150, backProfile: 'smooth', forwardProfile: 'smooth' } },
  { name: 'Long Pause    (smooth back, 250ms pause, smooth fwd)',
    opts: { backMs: 380, pauseMs: 250, forwardMs: 150, backProfile: 'smooth', forwardProfile: 'smooth' } },
  { name: 'Jerky Back    (rattled back, no pause, smooth fwd)',
    opts: { backMs: 380, pauseMs: 0, forwardMs: 150, backProfile: 'jerky', forwardProfile: 'smooth' } },
  { name: 'Decel Forward (smooth back, no pause, slows before release)',
    opts: { backMs: 380, pauseMs: 0, forwardMs: 200, backProfile: 'smooth', forwardProfile: 'decel' } },
  { name: 'Coast Forward (smooth back, no pause, peak early then fade)',
    opts: { backMs: 380, pauseMs: 0, forwardMs: 180, backProfile: 'smooth', forwardProfile: 'coast' } },
  { name: 'Rushed All    (short back, no pause, short fwd)',
    opts: { backMs: 180, pauseMs: 0, forwardMs: 80,  backProfile: 'easeIn', forwardProfile: 'smooth' } },
  { name: 'Slow Smooth   (very slow smooth back + fwd)',
    opts: { backMs: 700, pauseMs: 0, forwardMs: 260, backProfile: 'smooth', forwardProfile: 'smooth' } },
  { name: 'Paused+Decel  (worst — pause AND decel AND jerky)',
    opts: { backMs: 380, pauseMs: 140, forwardMs: 180, backProfile: 'jerky', forwardProfile: 'decel' } },
];

if (require.main === module) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log('\n════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  NEW SWING TEMPO ALGORITHM — simulator');
  console.log('  (tempoMult > 1 = penalty; < 1 = bonus)\n');
  console.log(pad('Scenario', 60) + pad('mult', 6) + pad('tag', 26) + 'metrics');
  console.log('─'.repeat(156));
  const results = SCENARIOS.map((s) => {
    const samples = makeSwing(s.opts);
    const out = evaluateTempo(samples);
    return { name: s.name, out };
  });
  for (const r of results) {
    const m = r.out.metrics;
    const metricStr = `backJerk=${m.backJerk} fwdJerk=${m.forwardJerk} pause=${m.pauseMs}ms decel=${m.decelFrac} follow=${m.followThrough}`;
    console.log(pad(r.name, 60) + pad(r.out.tempoMult, 6) + pad(r.out.tempoTag, 26) + metricStr);
  }
  console.log('');
  // Sanity rank check
  const byMult = [...results].sort((a, b) => a.out.tempoMult - b.out.tempoMult);
  console.log('Ranked best → worst:');
  for (const r of byMult) console.log(`  ${r.out.tempoMult.toFixed(3)}  ${r.out.tempoTag.padEnd(24)} ${r.name}`);
}

module.exports = { evaluateTempo, makeSwing };
