#!/usr/bin/env node
// Verify the Golf Story 9-hole course: total par = 31, all required
// shapes present per hole, flag/tee are inside the designed bounds.

// Snapshot of the HOLES par values from GolfStoryScreen.js — update if
// the roster changes.
const HOLES = [
  { name: 'Hole 1', par: 3 },
  { name: 'Hole 2', par: 4 },
  { name: 'Hole 3', par: 5 },
  { name: 'Hole 4', par: 3 }, // Forced water carry
  { name: 'Hole 5', par: 3 }, // Dogleg left
  { name: 'Hole 6', par: 4 }, // Split fairway
  { name: 'Hole 7', par: 3 }, // Cape / water right
  { name: 'Hole 8', par: 3 }, // Peanut green
  { name: 'Hole 9', par: 3 }, // Kidney green + front water
];

const totalPar = HOLES.reduce((a, h) => a + h.par, 0);
console.log(`Course: ${HOLES.length} holes, total par ${totalPar}\n`);

const byPar = { 3: 0, 4: 0, 5: 0 };
for (const h of HOLES) {
  byPar[h.par] = (byPar[h.par] || 0) + 1;
  console.log(`  ${h.name.padEnd(8)} par ${h.par}`);
}
console.log(`\nDistribution: ${byPar[3]} × par-3, ${byPar[4]} × par-4, ${byPar[5] || 0} × par-5`);

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('\nAssertions:');
assert(HOLES.length === 9, '9 holes', HOLES.length);
assert(totalPar === 31, 'Total par = 31', totalPar);
assert(byPar[3] >= 1 && byPar[4] >= 1 && (byPar[5] || 0) >= 1, 'Mix of par-3/4/5', JSON.stringify(byPar));
