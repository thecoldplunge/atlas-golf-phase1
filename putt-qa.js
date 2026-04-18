#!/usr/bin/env node
// Putt Physics QA Simulator
// Tests slope effects on putts from various positions and angles

const YARDS_PER_WORLD = 1.3;
const SLOPE_FORCE = 5.0;
const PUTT_PREVIEW_DT = 1 / 120;
const GREEN_FRICTION = 2.6;
const FRINGE_FRICTION = 3.8;
const FRINGE_BUFFER = 8;
const PUTTER_CARRY_YARDS = 40;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const magnitude = (v) => Math.hypot(v.x, v.y);
const normalize = (v) => { const m = magnitude(v); return m < 0.0001 ? {x:0,y:0} : {x:v.x/m,y:v.y/m}; };

const WIND_DIRS = {
  N: {x:0,y:-1}, S: {x:0,y:1}, E: {x:1,y:0}, W: {x:-1,y:0},
  NE: {x:0.707,y:-0.707}, NW: {x:-0.707,y:-0.707},
  SE: {x:0.707,y:0.707}, SW: {x:-0.707,y:0.707}
};

const pointInRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const expandRect = (rect, inset) => ({ x: rect.x - inset, y: rect.y - inset, w: rect.w + inset * 2, h: rect.h + inset * 2 });

function getSurfaceAtPoint(hole, point) {
  const terrain = hole.terrain;
  if (terrain?.green && pointInRect(point, terrain.green)) return 'green';
  if (terrain?.green && pointInRect(point, expandRect(terrain.green, FRINGE_BUFFER))) return 'fringe';
  return 'rough';
}

function getGreenSlopeForce(hole, point, surfaceName) {
  if (surfaceName !== 'green' && surfaceName !== 'fringe') return { x: 0, y: 0 };
  const green = hole.terrain?.green;
  if (!green || !hole.slopes?.length) return { x: 0, y: 0 };
  let ax = 0, ay = 0;
  hole.slopes.forEach(slope => {
    const centerX = green.x + green.w * clamp(slope.cx ?? 0.5, 0, 1);
    const centerY = green.y + green.h * clamp(slope.cy ?? 0.5, 0, 1);
    const nx = (point.x - centerX) / Math.max(1, green.w * 0.8);
    const ny = (point.y - centerY) / Math.max(1, green.h * 0.8);
    const influence = clamp(1 - Math.hypot(nx, ny), 0, 1);
    if (influence <= 0) return;
    const dir = normalize(WIND_DIRS[slope.dir] || {x:0,y:0});
    const strength = clamp(slope.strength ?? 0, 0, 1);
    ax += dir.x * strength * influence;
    ay += dir.y * strength * influence;
  });
  return { x: ax * SLOPE_FORCE, y: ay * SLOPE_FORCE };
}

function puttPowerForDistance(distanceWorld) {
  const basePuttSpeed = (PUTTER_CARRY_YARDS / YARDS_PER_WORLD) * 2.8;
  const v0Needed = distanceWorld * GREEN_FRICTION * 1.04;
  const launchRatio = basePuttSpeed > 0 ? v0Needed / basePuttSpeed : 0;
  return clamp(Math.round(clamp(launchRatio, 0, 1) * 125), 5, 125);
}

function simulatePutt(hole, startPos, aimAngle, powerPct) {
  const basePuttSpeed = (PUTTER_CARRY_YARDS / YARDS_PER_WORLD) * 2.8;
  const launchRatio = clamp(powerPct / 125, 0, 1);
  const puttSpeed = basePuttSpeed * launchRatio;
  const vel = {
    x: Math.cos(aimAngle) * puttSpeed,
    y: Math.sin(aimAngle) * puttSpeed
  };
  let pos = { ...startPos };
  const maxTicks = 120 * 10; // 10 seconds max

  for (let i = 0; i < maxTicks; i++) {
    const surfaceName = getSurfaceAtPoint(hole, pos);
    const friction = surfaceName === 'green' ? GREEN_FRICTION : surfaceName === 'fringe' ? FRINGE_FRICTION : 4.2;
    const dragFactor = Math.max(0, 1 - friction * PUTT_PREVIEW_DT);
    vel.x *= dragFactor;
    vel.y *= dragFactor;
    const slope = getGreenSlopeForce(hole, pos, surfaceName);
    const spdCap = Math.min(1.0, magnitude(vel) / 2.0);
    vel.x += slope.x * spdCap * PUTT_PREVIEW_DT;
    vel.y += slope.y * spdCap * PUTT_PREVIEW_DT;
    pos.x += vel.x * PUTT_PREVIEW_DT;
    pos.y += vel.y * PUTT_PREVIEW_DT;
    if (magnitude(vel) < 0.3) break;
  }
  return pos;
}

// ═══════════════ TEST CASES ═══════════════

const H_OFF_X = 170, H_OFF_Y = 200;

// Pine Valley Hole 1 - has a SE slope
const hole1 = {
  terrain: {
    green: { x: H_OFF_X + 134, y: H_OFF_Y + 14, w: 48, h: 52, r: 26 }
  },
  slopes: [{ cx: 0.34, cy: 0.32, strength: 0.54, dir: 'SE' }],
  hazards: [],
  cup: { x: H_OFF_X + 156, y: H_OFF_Y + 36 }
};

// Michael's Course Hole 2 - has two N slopes on the green
const hole2_michael = {
  terrain: {
    green: { x: 302, y: 103, w: 40, h: 40, r: 10 }
  },
  slopes: [
    { cx: 0.699, cy: 0.692, strength: 0.35, dir: 'N' },
    { cx: 0.205, cy: 0.663, strength: 0.35, dir: 'N' }
  ],
  hazards: [],
  cup: { x: 319.96, y: 124.02 }
};

console.log('═══════════════════════════════════════');
console.log('  PUTT PHYSICS QA SIMULATOR');
console.log('═══════════════════════════════════════\n');

// Test 1: Flat putt (no slope) — should go straight
console.log('TEST 1: Flat putt (no slope hole)');
const flatHole = {
  terrain: { green: { x: 300, y: 200, w: 60, h: 60, r: 16 } },
  slopes: [],
  hazards: [],
  cup: { x: 330, y: 220 }
};
const flatStart = { x: 330, y: 250 };
const flatAngle = Math.atan2(flatHole.cup.y - flatStart.y, flatHole.cup.x - flatStart.x);
const flatDist = Math.hypot(flatHole.cup.x - flatStart.x, flatHole.cup.y - flatStart.y);
const flatPower = puttPowerForDistance(flatDist);
const flatEnd = simulatePutt(flatHole, flatStart, flatAngle, flatPower);
const flatMiss = Math.hypot(flatEnd.x - flatHole.cup.x, flatEnd.y - flatHole.cup.y);
console.log(`  Start: (${flatStart.x}, ${flatStart.y}), Cup: (${flatHole.cup.x}, ${flatHole.cup.y})`);
console.log(`  Distance: ${(flatDist * YARDS_PER_WORLD).toFixed(1)} yards, Power: ${flatPower}%`);
console.log(`  End: (${flatEnd.x.toFixed(1)}, ${flatEnd.y.toFixed(1)}), Miss: ${(flatMiss * YARDS_PER_WORLD).toFixed(1)} yards`);
console.log(`  ${flatMiss < 2 ? '✅ PASS' : '❌ FAIL'} — flat putt should be close to cup\n`);

// Test 2: Putt with SE slope — should curve to the right and down
console.log('TEST 2: Putt with SE slope (Pine Valley Hole 1)');
const h1Start = { x: hole1.terrain.green.x + 10, y: hole1.terrain.green.y + 40 };
const h1Angle = Math.atan2(hole1.cup.y - h1Start.y, hole1.cup.x - h1Start.x);
const h1Dist = Math.hypot(hole1.cup.x - h1Start.x, hole1.cup.y - h1Start.y);
const h1Power = puttPowerForDistance(h1Dist);
const h1End = simulatePutt(hole1, h1Start, h1Angle, h1Power);
const h1Miss = Math.hypot(h1End.x - hole1.cup.x, h1End.y - hole1.cup.y);
const h1Drift = { x: h1End.x - hole1.cup.x, y: h1End.y - hole1.cup.y };
console.log(`  Start: (${h1Start.x}, ${h1Start.y}), Cup: (${hole1.cup.x}, ${hole1.cup.y})`);
console.log(`  Distance: ${(h1Dist * YARDS_PER_WORLD).toFixed(1)} yards, Power: ${h1Power}%`);
console.log(`  End: (${h1End.x.toFixed(1)}, ${h1End.y.toFixed(1)}), Miss: ${(h1Miss * YARDS_PER_WORLD).toFixed(1)} yards`);
console.log(`  Drift direction: dx=${h1Drift.x.toFixed(1)} dy=${h1Drift.y.toFixed(1)} (SE slope should push +x, +y)`);
console.log(`  ${h1Miss > 1 ? '✅ PASS' : '⚠️  CHECK'} — slope SHOULD cause a miss if not aimed to compensate`);
console.log(`  ${h1Drift.x > 0 || h1Drift.y > 0 ? '✅ PASS' : '❌ FAIL'} — drift should be in SE direction\n`);

// Test 3: Michael's course - N slope, putt from south to north
console.log('TEST 3: Putt with N slope (Michael Hole 2)');
const h2Start = { x: 320, y: 138 }; // south of green
const h2Angle = Math.atan2(hole2_michael.cup.y - h2Start.y, hole2_michael.cup.x - h2Start.x);
const h2Dist = Math.hypot(hole2_michael.cup.x - h2Start.x, hole2_michael.cup.y - h2Start.y);
const h2Power = puttPowerForDistance(h2Dist);
const h2End = simulatePutt(hole2_michael, h2Start, h2Angle, h2Power);
const h2Miss = Math.hypot(h2End.x - hole2_michael.cup.x, h2End.y - hole2_michael.cup.y);
const h2Surface = getSurfaceAtPoint(hole2_michael, h2Start);
console.log(`  Surface at start: ${h2Surface}`);
console.log(`  Start: (${h2Start.x}, ${h2Start.y}), Cup: (${hole2_michael.cup.x.toFixed(1)}, ${hole2_michael.cup.y.toFixed(1)})`);
console.log(`  Distance: ${(h2Dist * YARDS_PER_WORLD).toFixed(1)} yards, Power: ${h2Power}%`);
console.log(`  End: (${h2End.x.toFixed(1)}, ${h2End.y.toFixed(1)}), Miss: ${(h2Miss * YARDS_PER_WORLD).toFixed(1)} yards`);
console.log(`  N slope should help (putt going north same as slope) — less overshoot`);
const h2SlopeForce = getGreenSlopeForce(hole2_michael, h2Start, h2Surface);
console.log(`  Slope force at start: x=${h2SlopeForce.x.toFixed(2)}, y=${h2SlopeForce.y.toFixed(2)}`);
console.log(`  ${Math.abs(h2SlopeForce.x) > 0.1 || Math.abs(h2SlopeForce.y) > 0.1 ? '✅ PASS' : '❌ FAIL'} — slope force should be non-zero\n`);

// Test 4: Cross-slope putt — putt east, slope goes north, should curve north
console.log('TEST 4: Cross-slope putt (east putt, N slope)');
const h4Start = { x: 305, y: 123 };
const h4Angle = 0; // east
const h4Power = 60;
const h4End = simulatePutt(hole2_michael, h4Start, h4Angle, h4Power);
console.log(`  Start: (${h4Start.x}, ${h4Start.y}), Aim: East`);
console.log(`  End: (${h4End.x.toFixed(1)}, ${h4End.y.toFixed(1)})`);
console.log(`  Drift Y: ${(h4End.y - h4Start.y).toFixed(1)} (should be negative = north)`);
console.log(`  ${h4End.y < h4Start.y ? '✅ PASS' : '❌ FAIL'} — ball should drift north from N slope\n`);

// Test 5: Slope magnitude check — are slopes strong enough?
console.log('TEST 5: Slope strength check');
const testPos = { x: hole2_michael.terrain.green.x + 20, y: hole2_michael.terrain.green.y + 27 };
const sf = getGreenSlopeForce(hole2_michael, testPos, 'green');
console.log(`  Force at center of green: x=${sf.x.toFixed(3)}, y=${sf.y.toFixed(3)}`);
console.log(`  Force magnitude: ${magnitude(sf).toFixed(3)} units/s²`);
// A 15-foot putt at stimp 10 on a 2% slope should break about 6 inches
// In our sim: 15ft = 5yd = 3.85 world units. Green friction 2.6.
// At stimp-equivalent, force should noticeably curve a 5-yard putt
const testPuttDist = 3.85; // world units (5 yards)
const testPuttPower = puttPowerForDistance(testPuttDist);
const testAngle = 0; // east
const testEnd = simulatePutt(hole2_michael, testPos, testAngle, testPuttPower);
const lateralDrift = Math.abs(testEnd.y - testPos.y);
console.log(`  5-yard putt east: lateral drift = ${(lateralDrift * YARDS_PER_WORLD).toFixed(2)} yards`);
console.log(`  ${lateralDrift > 0.5 ? '✅ PASS' : '❌ FAIL — slopes too weak'} — should drift at least 0.5 world units (0.65 yards)\n`);

console.log('═══════════════════════════════════════');
console.log('  QA COMPLETE');
console.log('═══════════════════════════════════════');
