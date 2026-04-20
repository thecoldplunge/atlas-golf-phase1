#!/usr/bin/env node
// QA for the tempoMult → carry-distance penalty added in v3.33.
// A jerky/coasted swing should lose carry in addition to the existing
// pauseDistanceMult and deviation penalties.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function tempoCarryMult(tempoMult) {
  return tempoMult > 1 ? clamp(1 / Math.pow(tempoMult, 0.3), 0.55, 1.0) : 1.0;
}

// Stock driver baseline. We don't care about absolute yards, just the
// ratio to full-carry (1.0x mult) to verify the curve is sensible.
const cases = [
  { name: 'Perfect (0.86)', tempoMult: 0.86 },
  { name: 'Smooth (1.00)', tempoMult: 1.00 },
  { name: 'Slight wobble (1.20)', tempoMult: 1.20 },
  { name: 'One jerky tag (1.50)', tempoMult: 1.50 },
  { name: 'Rushed (1.55)', tempoMult: 1.55 },
  { name: 'Jerky + Coasted (1.736)', tempoMult: 1.736 },
  { name: 'Swing #248: 2 tags (2.15)', tempoMult: 2.15 },
  { name: 'Worst case (3.0)', tempoMult: 3.0 },
];

console.log('tempoMult → carry fraction:\n');
for (const c of cases) {
  const m = tempoCarryMult(c.tempoMult);
  const pct = Math.round(m * 100);
  console.log(`  ${c.name.padEnd(26)}  mult=${m.toFixed(3)}  (${pct}% of full carry)`);
}

console.log('\nAssertions:');
const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (got ${actual})`);

const m215 = tempoCarryMult(2.15);
assert(m215 > 0.78 && m215 < 0.82, 'Swing #248 mult 2.15 lands near 80% carry', m215.toFixed(3));

const m100 = tempoCarryMult(1.0);
assert(m100 === 1.0, 'Clean Smooth swing has zero carry penalty', m100);

const m086 = tempoCarryMult(0.86);
assert(m086 === 1.0, 'Perfect swing does NOT boost carry (bonus is via pauseDistance etc.)', m086);

const m120 = tempoCarryMult(1.20);
assert(m120 > 0.93, 'Tiny wobble barely dents carry', m120.toFixed(3));

const m300 = tempoCarryMult(3.0);
assert(m300 < 0.75 && m300 >= 0.55, 'Worst case is heavily penalized but clamped at 55%', m300.toFixed(3));
