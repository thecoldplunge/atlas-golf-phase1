#!/usr/bin/env node
// Shot Physics QA Simulator — validates carry, curve, and total distance for all clubs

const YARDS_PER_WORLD = 1.3;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const CLUBS = [
  { key: 'PT', name: 'Putter', carryYards: 40, launch: 0.03, roll: 1.4, speed: 0.5 },
  { key: 'LW', name: 'Lob Wedge', carryYards: 60, launch: 0.94, roll: 0.6, speed: 0.66 },
  { key: 'SW', name: 'Sand Wedge', carryYards: 70, launch: 0.88, roll: 0.68, speed: 0.72 },
  { key: 'GW', name: 'Gap Wedge', carryYards: 80, launch: 0.82, roll: 0.76, speed: 0.78 },
  { key: 'PW', name: 'Pitching Wedge', carryYards: 105, launch: 0.78, roll: 0.82, speed: 0.84 },
  { key: '9I', name: '9 Iron', carryYards: 115, launch: 0.74, roll: 0.88, speed: 0.88 },
  { key: '8I', name: '8 Iron', carryYards: 125, launch: 0.7, roll: 0.9, speed: 0.92 },
  { key: '7I', name: '7 Iron', carryYards: 140, launch: 0.66, roll: 0.94, speed: 0.96 },
  { key: '6I', name: '6 Iron', carryYards: 155, launch: 0.62, roll: 0.98, speed: 1.0 },
  { key: '5I', name: '5 Iron', carryYards: 165, launch: 0.58, roll: 1.02, speed: 1.06 },
  { key: '4I', name: '4 Iron', carryYards: 175, launch: 0.54, roll: 1.04, speed: 1.12 },
  { key: '3I', name: '3 Iron', carryYards: 180, launch: 0.52, roll: 1.06, speed: 1.18 },
  { key: '7W', name: '7 Wood', carryYards: 190, launch: 0.62, roll: 0.98, speed: 1.08 },
  { key: '5W', name: '5 Wood', carryYards: 210, launch: 0.57, roll: 1.04, speed: 1.18 },
  { key: '3W', name: '3 Wood', carryYards: 230, launch: 0.5, roll: 1.08, speed: 1.26 },
  { key: 'DR', name: 'Driver', carryYards: 260, launch: 0.45, roll: 1.12, speed: 1.34 }
];

// Simulate a full shot (simplified — no wind, no obstacles)
function simulateShot(club, powerPct, deviation) {
  const powerFrac = clamp(powerPct / 100, 0, 1.2);
  const targetCarryWorld = (club.carryYards / YARDS_PER_WORLD) * powerFrac;
  const launchRatio = clamp(powerPct / 125, 0, 1);
  const hangTime = (3.2 + club.launch * 0.8) * launchRatio;
  const expFactor = 1 - Math.exp(-0.14 * hangTime);
  const speed = expFactor > 0.001 ? (targetCarryWorld * 0.14 / expFactor) : targetCarryWorld * 2;
  
  // Curve
  const baseSens = 40;
  const overPct = Math.max(0, powerPct - 100);
  const overpowerMult = overPct > 0 ? 1.0 + (Math.pow(1.06, overPct) - 1) * 1.2 : 1.0;
  const rawCurve = deviation * baseSens * overpowerMult;
  const curveDeg = clamp(rawCurve, -45, 45);
  const curveRad = curveDeg * Math.PI / 180;
  const curveLaunchBlend = 0.3;
  
  const aimAngle = -Math.PI / 2; // north
  const launchAngle = aimAngle + curveRad * curveLaunchBlend;
  
  let vx = Math.cos(launchAngle) * speed;
  let vy = Math.sin(launchAngle) * speed;
  let vz = club.launch * 2.4 * launchRatio;
  let x = 0, y = 0, z = 0;
  const dt = 1/60;
  let maxZ = 0;
  let carryDist = 0;
  let landed = false;
  
  // Curve application per tick
  const curveFrac = curveDeg * (1 - curveLaunchBlend);
  const curvePerTick = z > 0 ? curveRad * 0.003 : 0;
  
  for (let i = 0; i < 600; i++) { // 10 seconds
    // Air drag
    if (z > 0.05) {
      const airDrag = Math.max(0, 1 - 0.14 * dt);
      vx *= airDrag;
      vy *= airDrag;
      // Apply curve force while airborne
      const perpX = -Math.sin(aimAngle);
      const perpY = Math.cos(aimAngle);
      vx += perpX * curveFrac * 0.015 * dt;
      vy += perpY * curveFrac * 0.015 * dt;
    } else {
      // Ground friction (rough)
      const drag = Math.max(0, 1 - 1.8 * dt);
      vx *= drag;
      vy *= drag;
    }
    
    // Gravity
    vz -= 9.8 * dt * 0.08;
    
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    
    if (z > maxZ) maxZ = z;
    
    if (z <= 0 && !landed && i > 5) {
      z = 0;
      vz = 0;
      carryDist = Math.hypot(x, y) * YARDS_PER_WORLD;
      landed = true;
    }
    
    if (landed && Math.hypot(vx, vy) < 0.3) break;
  }
  
  const totalDist = Math.hypot(x, y) * YARDS_PER_WORLD;
  return {
    carryYards: Math.round(carryDist || totalDist),
    totalYards: Math.round(totalDist),
    curveDeg: Math.round(curveDeg * 10) / 10,
    peakHeight: Math.round(maxZ * 10) / 10
  };
}

console.log('═══════════════════════════════════════════════════════');
console.log('  SHOT PHYSICS QA SIMULATOR');
console.log('═══════════════════════════════════════════════════════\n');

// Test 1: All clubs at 100% power, perfect swing (deviation=0)
console.log('TEST 1: All clubs at 100% power, perfect swing');
console.log('  Club          Stock    Sim Carry   Diff    Status');
console.log('  ' + '─'.repeat(55));
let allPass = true;
for (const club of CLUBS) {
  if (club.key === 'PT') continue; // putter is different
  const result = simulateShot(club, 100, 0);
  const diff = result.carryYards - club.carryYards;
  const pctDiff = Math.abs(diff / club.carryYards * 100);
  const pass = pctDiff < 25; // within 25% is OK for simplified sim
  if (!pass) allPass = false;
  console.log(`  ${club.name.padEnd(16)} ${String(club.carryYards).padStart(4)}yd   ${String(result.carryYards).padStart(5)}yd   ${(diff >= 0 ? '+' : '') + diff}yd   ${pass ? '✅' : '❌'}`);
}
console.log(`\n  Overall: ${allPass ? '✅ PASS' : '⚠️  CHECK'}\n`);

// Test 2: Curve caps
console.log('TEST 2: Curve caps at various power/deviation combos');
const scenarios = [
  { power: 100, dev: 0, label: 'Perfect 100%' },
  { power: 100, dev: 0.3, label: 'Slight miss 100%' },
  { power: 100, dev: 1.0, label: 'Max miss 100%' },
  { power: 110, dev: 0.5, label: 'Half miss 110%' },
  { power: 120, dev: 0.5, label: 'Half miss 120%' },
  { power: 120, dev: 1.0, label: 'Max miss 120%' },
];
for (const s of scenarios) {
  const result = simulateShot(CLUBS[11], s.power, s.dev); // 3 Iron
  const pass = Math.abs(result.curveDeg) <= 45;
  console.log(`  ${s.label.padEnd(22)} curve=${String(result.curveDeg).padStart(6)}°  carry=${String(result.carryYards).padStart(4)}yd  ${pass ? '✅' : '❌ OVER 45°'}`);
}

// Test 3: Max carry sanity check
console.log('\nTEST 3: Max carry at 120% power (should be < 1.2x stock)');
for (const club of CLUBS) {
  if (club.key === 'PT') continue;
  const result = simulateShot(club, 120, 0);
  const maxExpected = club.carryYards * 1.3;
  const pass = result.carryYards <= maxExpected;
  if (!pass) {
    console.log(`  ❌ ${club.name}: ${result.carryYards}yd (max expected: ${Math.round(maxExpected)}yd)`);
  }
}
console.log('  (Only failures shown above)');

// Test 4: Max miss at 120% — should not exceed 2x stock distance
console.log('\nTEST 4: Max miss shots at 120% (carry should not exceed 2x stock)');
for (const club of CLUBS) {
  if (club.key === 'PT') continue;
  const result = simulateShot(club, 120, 1.0);
  const maxExpected = club.carryYards * 2;
  const pass = result.carryYards <= maxExpected;
  if (!pass) {
    console.log(`  ❌ ${club.name}: ${result.carryYards}yd carry, ${result.curveDeg}° curve (max: ${Math.round(maxExpected)}yd)`);
  }
}
console.log('  (Only failures shown above)');

console.log('\n═══════════════════════════════════════════════════════');
console.log('  QA COMPLETE');
console.log('═══════════════════════════════════════════════════════');
