#!/usr/bin/env node
// QA for GS v0.34 lie-penalty halving.
// Every surface's powerPenalty endpoint should sit halfway between its
// pre-v0.34 value and 1.0 (the "clean lie" reference). Any new surface
// tuning that skips this file is a hint to re-check the balance.

const PRE = {
  Green:   [1.0, 1.0],
  Fairway: [0.95, 0.98],
  Rough:   [0.835, 0.925],
  Fringe:  [0.93, 0.97],
  'Tee Box': [1.0, 1.0],
  Bunker:  [0.55, 0.7],
  Dirt:    [0.7, 0.82],
  Water:   [1.0, 1.0],
};

const POST = {
  Green:   [1.0, 1.0],
  Fairway: [0.975, 0.99],
  Rough:   [0.9175, 0.9625],
  Fringe:  [0.965, 0.985],
  'Tee Box': [1.0, 1.0],
  Bunker:  [0.775, 0.85],
  Dirt:    [0.85, 0.91],
  Water:   [1.0, 1.0],
};

const halve = (v) => 1 - (1 - v) * 0.5;
const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('Lie-penalty halving QA (distance loss ~50% of GS ≤ v0.33)\n');

let allOk = true;
for (const label of Object.keys(PRE)) {
  const [preLo, preHi] = PRE[label];
  const [postLo, postHi] = POST[label];
  const expLo = halve(preLo);
  const expHi = halve(preHi);
  const ok = Math.abs(postLo - expLo) < 1e-3 && Math.abs(postHi - expHi) < 1e-3;
  if (!ok) allOk = false;
  assert(ok, `${label.padEnd(8)}  ${preLo}–${preHi}  →  ${postLo}–${postHi}`, `expected ${expLo.toFixed(4)}–${expHi.toFixed(4)}`);
}

// Bunker sanity: a 100% swing on Bunker should keep ≥ 77.5% of launch
// velocity (was 55%). Worst-case Dirt should keep ≥ 85% (was 70%).
assert(POST.Bunker[0] >= 0.775, 'Bunker min keep ≥ 77.5%', POST.Bunker[0].toFixed(3));
assert(POST.Dirt[0]   >= 0.850, 'Dirt   min keep ≥ 85.0%', POST.Dirt[0].toFixed(3));

process.exit(allOk ? 0 : 1);
