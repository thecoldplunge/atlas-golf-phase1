#!/usr/bin/env node
// Calibration: find the best SPEED_MULT that minimizes distance error across all clubs

const YARDS_PER_WORLD = 1.3;
const GRAVITY = 30;
const GROUND_EPSILON = 0.05;
const GREEN_ROLL_FRICTION = 2.6;
const FAIRWAY_ROLL_FRICTION = 3.3;
const AIR_DRAG = 0.14;
const DT = 1 / 60;

const CLUBS = [
  { key: 'LW', name: 'Lob Wedge', launch: 1.18, roll: 0.52, carryYards: 70 },
  { key: 'PW', name: 'Pitching Wedge', launch: 0.9, roll: 0.66, carryYards: 105 },
  { key: '7I', name: '7 Iron', launch: 0.7, roll: 0.84, carryYards: 140 },
  { key: '5I', name: '5 Iron', launch: 0.6, roll: 0.96, carryYards: 160 },
  { key: '3W', name: '3 Wood', launch: 0.5, roll: 1.1, carryYards: 225 },
  { key: 'DR', name: 'Driver', launch: 0.46, roll: 1.16, carryYards: 250 },
];

function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

function simulateShot(club, powerPct, speedMult, hangMult) {
  const launchRatio = clamp(powerPct / 125, 0, 1);
  const normalized = clamp(powerPct / 100, 0, 1.2);
  const targetWorldDist = (club.carryYards / YARDS_PER_WORLD) * normalized;
  const horizSpeed = targetWorldDist * speedMult;

  const targetHangTime = (0.8 + club.launch * 1.0) * hangMult;
  const launchVz = (GRAVITY * targetHangTime * 0.5) * Math.sqrt(launchRatio);

  let vx = horizSpeed;
  let x = 0, z = 0.08, vz = launchVz;
  let carryX = 0;
  let hasLanded = false;

  for (let tick = 0; tick < 6000; tick++) {
    if (z > GROUND_EPSILON || vz > 0.3) {
      vx *= Math.max(0, 1 - AIR_DRAG * DT);
      vz -= GRAVITY * DT;
    } else {
      if (!hasLanded) {
        hasLanded = true;
        carryX = x;
        vx *= 0.8;
        vz = 0; z = 0;
      }
      vx *= Math.max(0, 1 - FAIRWAY_ROLL_FRICTION * DT);
      vz = 0; z = 0;
    }
    x += vx * DT;
    z = Math.max(0, z + vz * DT);
    if (hasLanded && Math.abs(vx) < 0.3) break;
  }
  if (!hasLanded) carryX = x;
  return Math.round(x * YARDS_PER_WORLD);
}

// Find best speedMult
let bestMult = 1.0, bestHangMult = 1.0, bestErr = Infinity;

for (let sm = 0.5; sm <= 1.5; sm += 0.05) {
  for (let hm = 0.5; hm <= 2.0; hm += 0.1) {
    let totalErr = 0;
    for (const club of CLUBS) {
      for (const pwr of [50, 75, 100]) {
        const actual = simulateShot(club, pwr, sm, hm);
        const expected = Math.round(club.carryYards * pwr / 100);
        totalErr += Math.abs(actual - expected) / expected;
      }
    }
    if (totalErr < bestErr) {
      bestErr = totalErr;
      bestMult = sm;
      bestHangMult = hm;
    }
  }
}

console.log(`\nBest speedMult: ${bestMult.toFixed(2)}, hangMult: ${bestHangMult.toFixed(1)}, avg error: ${(bestErr / (CLUBS.length * 3) * 100).toFixed(1)}%\n`);

// Show results at best params
console.log('Club              | Target | 50%    | 75%    | 100%   | Error');
console.log('──────────────────|────────|────────|────────|────────|──────');
for (const club of CLUBS) {
  const r50 = simulateShot(club, 50, bestMult, bestHangMult);
  const r75 = simulateShot(club, 75, bestMult, bestHangMult);
  const r100 = simulateShot(club, 100, bestMult, bestHangMult);
  const err = Math.round(Math.abs(r100 - club.carryYards) / club.carryYards * 100);
  const mark = err <= 10 ? '✅' : err <= 20 ? '⚠️' : '❌';
  console.log(`${club.name.padEnd(18)}| ${(club.carryYards+'y').padStart(6)} | ${(r50+'y').padStart(6)} | ${(r75+'y').padStart(6)} | ${(r100+'y').padStart(6)} | ${mark} ${err}%`);
}
