#!/usr/bin/env node
// Physics simulation that mirrors the game's exact tick loop
// Tests every club at various power levels to verify distance accuracy

const YARDS_PER_WORLD = 1.3;
const GRAVITY = 30;
const GROUND_EPSILON = 0.05;
const GREEN_ROLL_FRICTION = 2.6;
const FAIRWAY_ROLL_FRICTION = 3.3;
const AIR_DRAG = 0.14;
const DT = 1 / 60; // 60fps

const CLUBS = [
  { key: 'PT', name: 'Putter', short: 'PT', speed: 0.16, launch: 0.03, roll: 0.95, spin: 1.22, carryYards: 40 },
  { key: 'LW', name: 'Lob Wedge', short: 'LW', speed: 0.44, launch: 1.18, roll: 0.52, spin: 0.82, carryYards: 70 },
  { key: 'SW', name: 'Sand Wedge', short: 'SW', speed: 0.5, launch: 1.08, roll: 0.56, spin: 0.85, carryYards: 80 },
  { key: 'GW', name: 'Gap Wedge', short: 'GW', speed: 0.56, launch: 0.98, roll: 0.6, spin: 0.9, carryYards: 90 },
  { key: 'PW', name: 'Pitching Wedge', short: 'PW', speed: 0.64, launch: 0.9, roll: 0.66, spin: 0.93, carryYards: 105 },
  { key: '9I', name: '9 Iron', short: '9i', speed: 0.72, launch: 0.82, roll: 0.72, spin: 0.97, carryYards: 120 },
  { key: '8I', name: '8 Iron', short: '8i', speed: 0.8, launch: 0.76, roll: 0.78, spin: 1, carryYards: 130 },
  { key: '7I', name: '7 Iron', short: '7i', speed: 0.88, launch: 0.7, roll: 0.84, spin: 1.02, carryYards: 140 },
  { key: '6I', name: '6 Iron', short: '6i', speed: 0.96, launch: 0.65, roll: 0.9, spin: 1.04, carryYards: 150 },
  { key: '5I', name: '5 Iron', short: '5i', speed: 1.04, launch: 0.6, roll: 0.96, spin: 1.06, carryYards: 160 },
  { key: '4I', name: '4 Iron', short: '4i', speed: 1.12, launch: 0.56, roll: 1.02, spin: 1.08, carryYards: 170 },
  { key: '3I', name: '3 Iron', short: '3i', speed: 1.18, launch: 0.52, roll: 1.06, spin: 1.1, carryYards: 180 },
  { key: '7W', name: '7 Wood', short: '7w', speed: 1.08, launch: 0.62, roll: 0.98, spin: 1, carryYards: 190 },
  { key: '5W', name: '5 Wood', short: '5w', speed: 1.18, launch: 0.57, roll: 1.04, spin: 0.98, carryYards: 210 },
  { key: '3W', name: '3 Wood', short: '3w', speed: 1.3, launch: 0.5, roll: 1.1, spin: 0.96, carryYards: 225 },
  { key: 'DR', name: 'Driver', short: 'DR', speed: 1.46, launch: 0.46, roll: 1.16, spin: 0.92, carryYards: 250 }
];

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function speedFromPower(powerPct, club) {
  const normalized = clamp(powerPct / 100, 0, 1.2);
  const targetWorldDist = (club.carryYards / YARDS_PER_WORLD) * normalized;
  return targetWorldDist * SPEED_MULT;
}

function simulateShot(club, powerPct, surface = 'fairway') {
  const effectivePower = powerPct;
  const launchRatio = clamp(effectivePower / 125, 0, 1);
  
  const rollFriction = surface === 'green' ? GREEN_ROLL_FRICTION : FAIRWAY_ROLL_FRICTION;
  
  // Putter: pure ground roll
  if (club.key === 'PT') {
    const puttSpeed = (club.carryYards / YARDS_PER_WORLD) * launchRatio * 2.8;
    let vx = puttSpeed;
    let x = 0;
    let z = 0;
    let vz = 0;
    let carry = 0;
    let hasLanded = false;
    
    for (let tick = 0; tick < 6000; tick++) {
      // Ground friction
      const dragFactor = Math.max(0, 1 - GREEN_ROLL_FRICTION * DT);
      vx *= dragFactor;
      x += vx * DT;
      
      if (Math.abs(vx) < 0.3) break;
    }
    
    const totalYards = Math.round(x * YARDS_PER_WORLD);
    return { carry: totalYards, roll: 0, total: totalYards, peakFt: 0 };
  }
  
  // Regular clubs
  const speed = speedFromPower(effectivePower, club);
  const horizSpeed = speed;
  const clubLaunchBoost = 0.92 + club.launch * 0.42;
  // Constant hang time per club loft, no power scaling
  const targetHangTime = 0.8 + club.launch * 1.0;
  const launchVz = (GRAVITY * targetHangTime * 0.5) * Math.sqrt(launchRatio);
  
  let vx = horizSpeed;
  let x = 0;
  let z = 0.08;
  let vz = launchVz;
  let peakZ = 0;
  let carryX = 0;
  let hasLanded = false;
  
  for (let tick = 0; tick < 6000; tick++) {
    if (z > GROUND_EPSILON || vz > 0.3) {
      // Airborne
      const airDrag = Math.max(0, 1 - AIR_DRAG * DT);
      vx *= airDrag;
      vz -= GRAVITY * DT;
      
      if (z > peakZ) peakZ = z;
    } else {
      // On ground
      if (!hasLanded) {
        hasLanded = true;
        carryX = x;
        // Landing damping
        vx *= 0.8;
        vz = 0;
        z = 0;
      }
      const dragFactor = Math.max(0, 1 - rollFriction * DT);
      vx *= dragFactor;
      vz = 0;
      z = 0;
    }
    
    x += vx * DT;
    z += vz * DT;
    if (z < 0) z = 0;
    
    if (hasLanded && Math.abs(vx) < 0.3) break;
  }
  
  if (!hasLanded) carryX = x;
  
  const carryYards = Math.round(carryX * YARDS_PER_WORLD);
  const totalYards = Math.round(x * YARDS_PER_WORLD);
  const rollYards = totalYards - carryYards;
  const peakFt = Math.round(peakZ * 3);
  
  return { carry: carryYards, roll: rollYards, total: totalYards, peakFt };
}

// Run simulation
console.log('═══════════════════════════════════════════════════════════════');
console.log('  ATLAS GOLF PHYSICS SIMULATION — v1.1.2');
console.log('═══════════════════════════════════════════════════════════════\n');

const powerLevels = [25, 50, 75, 100];

console.log('Club            | Target | 25%    | 50%    | 75%    | 100%   | Accuracy');
console.log('────────────────|────────|────────|────────|────────|────────|──────────');

let totalError = 0;
let errorCount = 0;

for (const club of CLUBS) {
  const results = powerLevels.map(pwr => {
    const surface = club.key === 'PT' ? 'green' : 'fairway';
    return simulateShot(club, pwr, surface);
  });
  
  const expectedAt100 = club.carryYards;
  const actualAt100 = results[3].total;
  const errorPct = Math.round(Math.abs(actualAt100 - expectedAt100) / expectedAt100 * 100);
  totalError += errorPct;
  errorCount++;
  
  const cols = results.map(r => `${r.total}y`.padStart(6));
  const accuracy = errorPct <= 10 ? `✅ ${errorPct}%` : errorPct <= 20 ? `⚠️  ${errorPct}%` : `❌ ${errorPct}%`;
  
  console.log(`${(club.name).padEnd(16)}| ${(expectedAt100 + 'y').padStart(6)} | ${cols.join(' | ')} | ${accuracy}`);
}

console.log('────────────────|────────|────────|────────|────────|────────|──────────');
console.log(`Average error: ${Math.round(totalError / errorCount)}%\n`);

// Detailed shots for key clubs
console.log('\n📊 Detailed breakdown for key clubs:\n');
for (const clubKey of ['PT', 'LW', 'PW', '7I', 'DR']) {
  const club = CLUBS.find(c => c.key === clubKey);
  console.log(`  ${club.name} (target: ${club.carryYards}y):`);
  for (const pwr of [25, 50, 75, 100]) {
    const surface = club.key === 'PT' ? 'green' : 'fairway';
    const r = simulateShot(club, pwr, surface);
    const expected = Math.round(club.carryYards * pwr / 100);
    const diff = r.total - expected;
    const marker = Math.abs(diff) <= expected * 0.1 ? '✅' : Math.abs(diff) <= expected * 0.2 ? '⚠️' : '❌';
    console.log(`    ${pwr}% → carry: ${r.carry}y, roll: ${r.roll}y, total: ${r.total}y (expected ~${expected}y, ${diff > 0 ? '+' : ''}${diff}y) ${marker} | peak: ${r.peakFt}ft`);
  }
  console.log('');
}
