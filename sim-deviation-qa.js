#!/usr/bin/env node
// QA for the deviation → curve pipeline around swing #229.
// Reproduces: strikeBall's tempoAdjustedDeviation clamp plus getLaunchData's
// rawCurveDeg formula, so we can verify that a jerky + max-slice gesture on
// a max-skill golfer produces a visible curve instead of being silently
// absorbed by the old [-1, 1] clamp.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const SURFACE = {
  fairway: 1.0,
  rough: 1.2,
  deepRough: 1.5,
  sand: 1.6,
  pluggedSand: 2.0,
  fringe: 1.05,
  secondCut: 1.1,
  tee: 1.0,
  green: 1.0,
};

function effectiveSkill({ golfer, mental, club, puttingMode = false }) {
  if (puttingMode) {
    return golfer.putting * 0.45 + golfer.touch * 0.2 + mental.focus * 0.15 + mental.composure * 0.2;
  }
  return golfer.accuracy * 0.34 + mental.focus * 0.22 + mental.composure * 0.14
       + mental.courseManagement * 0.12 + club.accuracy * 0.18;
}

function forgivenessFactor({ club, skill, puttingMode = false }) {
  return clamp(
    1.18 - ((club.forgiveness - 50) * 0.004 + (skill - 50) * 0.003 + (puttingMode ? (club.feel - 50) * 0.002 : 0)),
    0.7, 1.45
  );
}

function recoveryFactor({ lie, recovery }) {
  if (lie === 'rough' || lie === 'deepRough' || lie === 'sand' || lie === 'pluggedSand') {
    return clamp(1.12 - (recovery - 50) * 0.003, 0.82, 1.18);
  }
  return 1;
}

function computeCurve({ deviation, tempoMult, golfer, mental, club, lie, powerPct, clampRange }) {
  const tempoAdj = clamp(deviation * tempoMult, -clampRange, clampRange);
  const skill = effectiveSkill({ golfer, mental, club });
  const fg = forgivenessFactor({ club, skill });
  const rec = recoveryFactor({ lie, recovery: golfer.recovery });
  const lieSens = SURFACE[lie] ?? 1.0;
  const overPct = Math.max(0, powerPct - 100);
  const overpowerMult = overPct > 0 ? 1 + overPct * 0.025 : 1.0;
  const baseSens = 28;
  const raw = tempoAdj * baseSens * lieSens * overpowerMult * fg * rec;
  const curve = clamp(raw, -45, 45);
  return { tempoAdj, curve, raw, fg, rec, lieSens, overpowerMult };
}

// Kraal the Debtkeeper + pro_dr from swing #229
const kraal = { power: 90, accuracy: 95, touch: 90, spinControl: 95, putting: 95, recovery: 95 };
const kraalMental = { focus: 100, composure: 100, courseManagement: 100 };
const proDr = { distance: 100, accuracy: 100, forgiveness: 100, spin: 100, feel: 50 };

// Swing #229 verbatim: max slice dev (+1.0), jerky back/fwd + coasted (1.736 mult)
const baseCase = {
  deviation: 1.0,
  tempoMult: 1.736,
  golfer: kraal, mental: kraalMental, club: proDr,
  lie: 'tee', powerPct: 74,
};

function row(label, r) {
  return [
    label.padEnd(34),
    `tempoAdj=${r.tempoAdj.toFixed(3).padStart(6)}`,
    `curve=${r.curve.toFixed(2).padStart(6)}°`,
    `raw=${r.raw.toFixed(2).padStart(6)}°`,
    `fg=${r.fg.toFixed(2)}`,
  ].join('  ');
}

console.log('=== Deviation clamp QA — swing #229 repro ===\n');
console.log('Old clamp [-1, 1]:');
const oldResult = computeCurve({ ...baseCase, clampRange: 1 });
console.log(' ', row('Kraal jerky+slice (driver, 74%)', oldResult));
console.log('New clamp [-1.8, 1.8]:');
const newResult = computeCurve({ ...baseCase, clampRange: 1.8 });
console.log(' ', row('Kraal jerky+slice (driver, 74%)', newResult));

console.log('\n=== Regression checks (should NOT over-penalize clean swings) ===');
const cleanCases = [
  { name: 'Kraal clean dev=0',        deviation: 0,    tempoMult: 0.86 },
  { name: 'Kraal clean dev=0.1',      deviation: 0.1,  tempoMult: 0.86 },
  { name: 'Kraal mild push dev=0.3',  deviation: 0.3,  tempoMult: 1.0  },
  { name: 'Kraal heavy push dev=0.6', deviation: 0.6,  tempoMult: 1.2  },
  { name: 'Kraal max dev, clean',     deviation: 1.0,  tempoMult: 1.0  },
  { name: 'Kraal max dev, slight jerk',deviation: 1.0, tempoMult: 1.2  },
  { name: 'Kraal max dev, severe jerk',deviation: 1.0, tempoMult: 1.736},
];
for (const c of cleanCases) {
  const r = computeCurve({ ...baseCase, deviation: c.deviation, tempoMult: c.tempoMult, clampRange: 1.8 });
  console.log(' ', row(c.name, r));
}

console.log('\n=== Avg-skill golfer (50 across) gets sliced harder at max swing ===');
const midGolfer = { power: 50, accuracy: 50, touch: 50, spinControl: 50, putting: 50, recovery: 50 };
const midMental = { focus: 50, composure: 50, courseManagement: 50 };
const stockDr = { distance: 50, accuracy: 50, forgiveness: 50, spin: 50, feel: 50 };
const midCase = {
  deviation: 1.0, tempoMult: 1.736, golfer: midGolfer, mental: midMental,
  club: stockDr, lie: 'tee', powerPct: 74, clampRange: 1.8,
};
console.log(' ', row('Avg skill jerky+slice', computeCurve(midCase)));
console.log(' ', row('Avg skill clean dev=0.5', computeCurve({ ...midCase, deviation: 0.5, tempoMult: 1.0 })));

console.log('\n=== Assertions ===');
const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (got ${actual})`);
assert(newResult.curve > 35, 'Max-skill jerky slice produces big curve (>35°)', newResult.curve.toFixed(2));
assert(newResult.curve < 45.001, 'Max-skill jerky slice still capped at 45°', newResult.curve.toFixed(2));
assert(newResult.curve > oldResult.curve + 10, 'New clamp produces noticeably bigger curve than old', `old=${oldResult.curve.toFixed(1)} new=${newResult.curve.toFixed(1)}`);
const cleanZero = computeCurve({ ...baseCase, deviation: 0, tempoMult: 0.86, clampRange: 1.8 });
assert(Math.abs(cleanZero.curve) < 0.5, 'Perfect swing still produces near-zero curve', cleanZero.curve.toFixed(2));
const cleanMild = computeCurve({ ...baseCase, deviation: 0.1, tempoMult: 1.0, clampRange: 1.8 });
assert(Math.abs(cleanMild.curve) < 3, 'Tiny deviation still produces tiny curve', cleanMild.curve.toFixed(2));
