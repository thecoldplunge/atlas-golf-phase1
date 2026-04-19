#!/usr/bin/env node
/**
 * Faithful mirror of App.js shot physics for stat-impact testing.
 * Mirrors strikeBall + tick loop exactly (dt=1/60, same drag, same friction,
 * same getLaunchData formulas). Use this to verify every character stat
 * actually affects gameplay the way it should.
 *
 * Usage:
 *   node sim-stats.js                 # full stat matrix
 *   node sim-stats.js --compare       # low/mid/high character side-by-side
 *   node sim-stats.js --stat power    # isolate one stat
 *   node sim-stats.js --trace         # verbose per-shot breakdown
 */

const YARDS_PER_WORLD = 1.3;
const GRAVITY = 30;
const GROUND_EPSILON = 0.05;
const MIN_BOUNCE_VZ = 3.2;
const AIR_DRAG = 0.14;
const DT = 1 / 60;
const CURVE_LAUNCH_BLEND = 1.15;
const CURVE_FORCE = 1.35;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const degToRad = (d) => (d * Math.PI) / 180;

const CLUBS = [
  { key: 'PT', name: 'Putter',      launch: 0.03, spin: 1.22, carryYards: 40 },
  { key: 'LW', name: 'Lob Wedge',   launch: 1.18, spin: 0.82, carryYards: 70 },
  { key: 'SW', name: 'Sand Wedge',  launch: 1.08, spin: 0.85, carryYards: 80 },
  { key: 'GW', name: 'Gap Wedge',   launch: 0.98, spin: 0.90, carryYards: 90 },
  { key: 'PW', name: 'Pitching W.', launch: 0.90, spin: 0.93, carryYards: 105 },
  { key: '9I', name: '9 Iron',      launch: 0.82, spin: 0.97, carryYards: 120 },
  { key: '8I', name: '8 Iron',      launch: 0.76, spin: 1.00, carryYards: 130 },
  { key: '7I', name: '7 Iron',      launch: 0.70, spin: 1.02, carryYards: 140 },
  { key: '6I', name: '6 Iron',      launch: 0.65, spin: 1.04, carryYards: 150 },
  { key: '5I', name: '5 Iron',      launch: 0.60, spin: 1.06, carryYards: 160 },
  { key: '4I', name: '4 Iron',      launch: 0.56, spin: 1.08, carryYards: 170 },
  { key: '3I', name: '3 Iron',      launch: 0.52, spin: 1.10, carryYards: 180 },
  { key: '7W', name: '7 Wood',      launch: 0.62, spin: 1.00, carryYards: 190 },
  { key: '5W', name: '5 Wood',      launch: 0.57, spin: 0.98, carryYards: 210 },
  { key: '3W', name: '3 Wood',      launch: 0.50, spin: 0.96, carryYards: 225 },
  { key: 'DR', name: 'Driver',      launch: 0.46, spin: 0.92, carryYards: 250 },
];

const SURFACE_PHYSICS = {
  rough:        { rollFriction: 4.2, bounce: 0.18, landingDamping: 0.72, powerPenalty: [0.80, 0.90], swingSensitivity: 1.4 },
  deepRough:    { rollFriction: 7.0, bounce: 0.12, landingDamping: 0.60, powerPenalty: [0.65, 0.75], swingSensitivity: 1.8 },
  secondCut:    { rollFriction: 3.8, bounce: 0.20, landingDamping: 0.76, powerPenalty: [0.88, 0.92], swingSensitivity: 1.2 },
  fairway:      { rollFriction: 3.3, bounce: 0.24, landingDamping: 0.80, powerPenalty: [0.95, 0.95], swingSensitivity: 1.0 },
  fringe:       { rollFriction: 3.8, bounce: 0.20, landingDamping: 0.76, powerPenalty: [0.95, 0.95], swingSensitivity: 1.1 },
  sand:         { rollFriction: 6.5, bounce: 0.10, landingDamping: 0.54, powerPenalty: [0.60, 0.65], swingSensitivity: 2.0 },
  pluggedSand:  { rollFriction: 8.0, bounce: 0.05, landingDamping: 0.40, powerPenalty: [0.35, 0.45], swingSensitivity: 2.4 },
  green:        { rollFriction: 2.6, bounce: 0.14, landingDamping: 0.82, powerPenalty: [1.00, 1.00], swingSensitivity: 1.0 },
  tee:          { rollFriction: 3.0, bounce: 0.22, landingDamping: 0.85, powerPenalty: [1.00, 1.00], swingSensitivity: 1.0 },
};

const DEFAULT_GOLFER = {
  power: 50, accuracy: 50, touch: 50, spinControl: 50,
  putting: 50, recovery: 50, focus: 50, composure: 50, courseManagement: 50,
};
const DEFAULT_CLUB_STATS = { distance: 50, accuracy: 50, forgiveness: 50, spin: 50, feel: 50 };

// ═══════════════ MIRRORS getLaunchData ═══════════════
function getLaunchData({
  deviation = 0,
  powerPct = 100,
  aimAngle = 0,
  golfer = DEFAULT_GOLFER,
  clubStats = DEFAULT_CLUB_STATS,
  surface = 'tee',
  puttingMode = false,
}) {
  const g = { ...DEFAULT_GOLFER, ...golfer };
  const c = { ...DEFAULT_CLUB_STATS, ...clubStats };
  const lieSwingSens = (SURFACE_PHYSICS[surface] || SURFACE_PHYSICS.rough).swingSensitivity;

  const effectiveSkill = puttingMode
    ? (g.putting * 0.45 + g.touch * 0.20 + g.focus * 0.15 + g.composure * 0.20)
    : (g.accuracy * 0.34 + g.focus * 0.22 + g.composure * 0.14 + g.courseManagement * 0.12 + c.accuracy * 0.18);

  let overpowerMult = 1.0;
  if (powerPct > 100) overpowerMult = 1.0 + (powerPct - 100) * 0.025;
  const baseSensitivity = 40;
  const forgivenessFactor = clamp(
    1.18 - ((c.forgiveness - 50) * 0.004 + (effectiveSkill - 50) * 0.003 + (puttingMode ? (c.feel - 50) * 0.002 : 0)),
    0.7, 1.45
  );
  const recoveryFactor = (surface === 'rough' || surface === 'deepRough' || surface === 'sand' || surface === 'pluggedSand')
    ? clamp(1.12 - (g.recovery - 50) * 0.003, 0.82, 1.18) : 1;

  const rawCurveDeg = deviation * baseSensitivity * lieSwingSens * overpowerMult * forgivenessFactor * recoveryFactor;
  const swingCurveDeg = clamp(rawCurveDeg, -45, 45);
  const totalCurveDeg = swingCurveDeg; // neutral spin offset
  const launchCurveDeg = totalCurveDeg * CURVE_LAUNCH_BLEND;
  const finalAngle = aimAngle + degToRad(launchCurveDeg);
  const direction = { x: Math.cos(finalAngle), y: Math.sin(finalAngle) };

  const powerFactor = puttingMode
    ? clamp(1 + ((g.putting - 50) * 0.0015 + (c.feel - 50) * 0.0015), 0.88, 1.12)
    : clamp(1 + ((g.power - 50) * 0.003 + (c.distance - 50) * 0.003), 0.75, 1.25);
  const touchFactor = puttingMode
    ? clamp(1 + ((g.touch - 50) * 0.002 + (c.feel - 50) * 0.002), 0.86, 1.14)
    : clamp(1 + (g.touch - 50) * 0.0015, 0.9, 1.1);
  const launchRatio = clamp((powerPct / 125) * powerFactor * touchFactor, 0, 1.1);
  const spinFactor = puttingMode
    ? clamp(1 + ((g.putting - 50) * 0.001 + (c.feel - 50) * 0.001), 0.9, 1.1)
    : clamp(1 + ((g.spinControl - 50) * 0.0025 + (c.spin - 50) * 0.0025), 0.8, 1.25);

  return {
    swingCurveDeg, totalCurveDeg, finalAngle, direction,
    effectivePower: powerPct,
    powerFactor, touchFactor, launchRatio, spinFactor,
    shotMetrics: { launchAdjust: 1, spinAdjust: 1, curveDeg: 0 },
  };
}

// ═══════════════ MIRRORS speedFromPower ═══════════════
function speedFromPower(powerPct, club) {
  const powerFrac = clamp(powerPct / 100, 0, 1.2);
  const targetCarryWorld = (club.carryYards / YARDS_PER_WORLD) * powerFrac;
  const launchRatio = clamp(powerPct / 125, 0, 1);
  const hangTime = (3.2 + club.launch * 0.8) * launchRatio;
  const expFactor = 1 - Math.exp(-0.14 * hangTime);
  return expFactor > 0.001 ? (targetCarryWorld * 0.14 / expFactor) : targetCarryWorld * 2;
}

// ═══════════════ MIRRORS strikeBall + tick loop ═══════════════
function simulateShot({
  club,
  powerPct = 100,
  golfer = DEFAULT_GOLFER,
  clubStats = DEFAULT_CLUB_STATS,
  surface = 'tee',
  landingSurface = 'fairway',
  deviation = 0,
  tempoMult = 1.0,
  wind = { speed: 0, dir: 'N' },
  seed = null,
}) {
  // Deterministic lie penalty for reproducibility (use midpoint unless seed supplied)
  const lieSeed = typeof seed === 'number' ? seed : 0.5;
  const tempoAdjDev = clamp(deviation * tempoMult, -1, 1);
  const launch = getLaunchData({
    deviation: tempoAdjDev, powerPct, golfer, clubStats, surface,
    puttingMode: club.key === 'PT',
  });
  const liePhys = SURFACE_PHYSICS[surface] || SURFACE_PHYSICS.rough;
  const [penMin, penMax] = liePhys.powerPenalty;

  const recoveryBoost = (surface === 'rough' || surface === 'deepRough' || surface === 'sand' || surface === 'pluggedSand')
    ? clamp(1 + ((golfer.recovery ?? 50) - 50) * 0.0035, 0.82, 1.18) : 1;
  const liePenalty = clamp((penMin + lieSeed * (penMax - penMin)) * recoveryBoost, 0.35, 1.05);

  // Mirrors the App.js fix: solve for the speed that lands the ball at the
  // aim-line carry (club.carryYards * powerFactor * touchFactor) using the
  // ACTUAL flight hangTime the ball will experience.
  const spinLaunchMod = clamp(0.94 + (launch.spinFactor - 1) * 0.35, 0.82, 1.12);
  const actualHangTime = (3.2 + club.launch * 0.8)
    * launch.launchRatio
    * launch.shotMetrics.launchAdjust
    * spinLaunchMod;
  const powerFrac = clamp(launch.effectivePower / 100, 0, 1.2);
  const targetCarryWorld = (club.carryYards / YARDS_PER_WORLD)
    * powerFrac
    * launch.powerFactor
    * launch.touchFactor;
  const expFactor = 1 - Math.exp(-0.14 * actualHangTime);
  const speed = expFactor > 0.001
    ? (targetCarryWorld * 0.14 / expFactor)
    : targetCarryWorld * 2;

  const horizSpeed = speed * liePenalty;

  const vel = { x: launch.direction.x * horizSpeed, y: launch.direction.y * horizSpeed };
  const shotCurveDeg = launch.totalCurveDeg;
  const aimAngle = 0;
  const courseMgmt = golfer.courseManagement ?? 50;
  const windResist = clamp(1 - (courseMgmt - 50) * 0.006, 0.7, 1.3);

  let flight;
  if (club.key === 'PT') {
    const puttSpeed = (club.carryYards / YARDS_PER_WORLD) * launch.launchRatio * 2.8;
    vel.x = launch.direction.x * puttSpeed;
    vel.y = launch.direction.y * puttSpeed;
    flight = { z: 0, vz: 0 };
  } else {
    const targetHangTime = (3.2 + club.launch * 0.8) * launch.launchRatio;
    const launchVz = (GRAVITY * targetHangTime * 0.5)
      * launch.shotMetrics.launchAdjust
      * clamp(0.94 + (launch.spinFactor - 1) * 0.35, 0.82, 1.12);
    flight = { z: 0.08, vz: launchVz };
  }

  // Tick loop
  let pos = { x: 0, y: 0 };
  let landed = false;
  let carryWorld = 0;
  let peakZ = 0;
  let hasBeenAirborne = flight.z > GROUND_EPSILON;

  for (let t = 0; t < 6000; t++) {
    const speedMag = Math.hypot(vel.x, vel.y);
    const onGround = flight.z <= GROUND_EPSILON && Math.abs(flight.vz) < 0.3;
    if (speedMag < 0.3 && onGround) break;
    if (flight.z > peakZ) peakZ = flight.z;

    // Active surface for rolling (landing surface when on ground)
    const activeSurface = onGround ? landingSurface : surface;
    const sPhys = SURFACE_PHYSICS[activeSurface];

    if (onGround) {
      const dragFactor = Math.max(0, 1 - sPhys.rollFriction * DT);
      vel.x *= dragFactor;
      vel.y *= dragFactor;
    } else {
      const airDrag = Math.max(0, 1 - AIR_DRAG * DT);
      vel.x *= airDrag;
      vel.y *= airDrag;
      // Wind
      const WIND_DIRS = { N:{x:0,y:-1},S:{x:0,y:1},E:{x:1,y:0},W:{x:-1,y:0} };
      const wDir = WIND_DIRS[wind.dir] || {x:0,y:0};
      const wForce = wind.speed * 0.35 * windResist * DT;
      vel.x += wDir.x * wForce;
      vel.y += wDir.y * wForce;
      // Curve shape force
      if (Math.abs(shotCurveDeg) > 0.01) {
        const fwdDir = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };
        const perpDir = { x: -Math.sin(aimAngle), y: Math.cos(aimAngle) };
        const fwdSpeed = vel.x * fwdDir.x + vel.y * fwdDir.y;
        const sideSpeed = vel.x * perpDir.x + vel.y * perpDir.y;
        const sideTarget = clamp((shotCurveDeg / 85) * Math.max(0, fwdSpeed) * 0.55, -fwdSpeed*0.65, fwdSpeed*0.65);
        const sideBlend = clamp(CURVE_FORCE * DT * 0.55, 0, 0.12);
        const nextSideSpeed = sideSpeed + (sideTarget - sideSpeed) * sideBlend;
        const nextFwdSpeed = Math.max(0, fwdSpeed * (1 - Math.abs(nextSideSpeed - sideSpeed) * 0.018));
        vel.x = fwdDir.x * nextFwdSpeed + perpDir.x * nextSideSpeed;
        vel.y = fwdDir.y * nextFwdSpeed + perpDir.y * nextSideSpeed;
      }
    }

    flight.vz -= GRAVITY * DT;
    flight.z += flight.vz * DT;
    if (flight.z <= 0) {
      const impactVz = Math.abs(flight.vz);
      flight.z = 0;
      if (impactVz > MIN_BOUNCE_VZ) {
        flight.vz = impactVz * sPhys.bounce;
        vel.x *= sPhys.landingDamping;
        vel.y *= sPhys.landingDamping;
      } else {
        flight.vz = 0;
      }
    }
    const next = { x: pos.x + vel.x * DT, y: pos.y + vel.y * DT };
    if (!landed && hasBeenAirborne && flight.z <= GROUND_EPSILON) {
      landed = true;
      carryWorld = Math.hypot(next.x - 0, next.y - 0);
    }
    if (flight.z > GROUND_EPSILON) hasBeenAirborne = true;
    pos = next;
    if (Math.hypot(vel.x, vel.y) < 6 && flight.z <= GROUND_EPSILON && Math.abs(flight.vz) < 0.35) {
      vel.x = 0; vel.y = 0;
    }
    if (flight.z <= GROUND_EPSILON && Math.abs(flight.vz) < 0.35) {
      flight.z = 0; flight.vz = 0;
    }
  }

  const totalWorld = Math.hypot(pos.x, pos.y);
  if (!landed) carryWorld = totalWorld;

  // Lateral deviation from aim line (used for accuracy tests)
  const lateralWorld = pos.y;
  const lateralYards = lateralWorld * YARDS_PER_WORLD;

  return {
    stockYardsUI: Math.round(club.carryYards * launch.powerFactor * launch.touchFactor),
    carry: Math.round(carryWorld * YARDS_PER_WORLD),
    total: Math.round(totalWorld * YARDS_PER_WORLD),
    roll: Math.round((totalWorld - carryWorld) * YARDS_PER_WORLD),
    peakFt: Math.round(peakZ * 3),
    swingCurveDeg: +launch.swingCurveDeg.toFixed(2),
    lateralYards: +lateralYards.toFixed(1),
    launch,
  };
}

module.exports = { simulateShot, getLaunchData, CLUBS, DEFAULT_GOLFER };

// ═══════════════ RUN ═══════════════
if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes(`--${n}`);
  const driver = CLUBS.find(c => c.key === 'DR');
  const pw = CLUBS.find(c => c.key === 'PW');
  const putter = CLUBS.find(c => c.key === 'PT');

  const fmt = (v, w=6) => String(v).padStart(w);

  if (flag('compare')) {
    const bots = {
      'Weak   (all 20) ': { power:20, accuracy:20, touch:20, spinControl:20, putting:20, recovery:20, focus:20, composure:20, courseManagement:20 },
      'Avg    (all 50) ': { power:50, accuracy:50, touch:50, spinControl:50, putting:50, recovery:50, focus:50, composure:50, courseManagement:50 },
      'Strong (power100)': { power:100, accuracy:50, touch:77, spinControl:50, putting:50, recovery:50, focus:50, composure:50, courseManagement:50 },
      'Pro    (all 100)': { power:100, accuracy:100, touch:100, spinControl:100, putting:100, recovery:100, focus:100, composure:100, courseManagement:100 },
    };
    console.log(`\nDRIVER @ 100% power — tee → fairway (no wind)\n`);
    console.log('Character         | UI stock | sim carry | sim total | match?');
    console.log('------------------|----------|-----------|-----------|--------');
    for (const [name, g] of Object.entries(bots)) {
      const r = simulateShot({ club: driver, powerPct: 100, golfer: g, surface: 'tee', landingSurface: 'fairway' });
      const delta = Math.abs(r.total - r.stockYardsUI);
      const match = delta <= 10 ? 'OK' : `off by ${r.total - r.stockYardsUI}`;
      console.log(`${name} | ${fmt(r.stockYardsUI+'y',8)} | ${fmt(r.carry+'y',9)} | ${fmt(r.total+'y',9)} | ${match}`);
    }
  }

  if (flag('stat') || args.length === 0) {
    const stat = args[args.indexOf('--stat')+1] || 'power';
    const levels = [0, 25, 50, 75, 100];
    console.log(`\nIsolating "${stat}" — other stats = 50, Driver @ 100% power, tee → fairway\n`);
    console.log(`${stat.padEnd(12)} | UI stock | sim carry | sim total | lateral yd | curve° `);
    console.log('-------------|----------|-----------|-----------|------------|-------');
    for (const val of levels) {
      const g = { ...DEFAULT_GOLFER, [stat]: val };
      // For accuracy tests, apply a fixed deviation to measure dispersion
      const dev = (stat === 'accuracy' || stat === 'focus' || stat === 'composure') ? 0.3 : 0;
      const r = simulateShot({ club: driver, powerPct: 100, golfer: g, surface: 'tee', landingSurface: 'fairway', deviation: dev });
      console.log(`${String(val).padEnd(12)} | ${fmt(r.stockYardsUI+'y',8)} | ${fmt(r.carry+'y',9)} | ${fmt(r.total+'y',9)} | ${fmt(r.lateralYards,10)} | ${fmt(r.swingCurveDeg,6)}`);
    }
  }

  if (flag('all')) {
    const stats = ['power','accuracy','touch','spinControl','putting','recovery','focus','composure','courseManagement'];
    for (const stat of stats) {
      console.log(`\n── ${stat.toUpperCase()} ──`);
      const levels = [0, 50, 100];
      for (const val of levels) {
        const g = { ...DEFAULT_GOLFER, [stat]: val };
        // Drive test
        const rd = simulateShot({ club: driver, powerPct: 100, golfer: g, surface: 'tee', landingSurface: 'fairway', deviation: 0.3 });
        // Rough recovery test
        const rr = simulateShot({ club: pw, powerPct: 100, golfer: g, surface: 'rough', landingSurface: 'fairway', deviation: 0.3 });
        // Putt test
        const rp = simulateShot({ club: putter, powerPct: 80, golfer: g, surface: 'green', landingSurface: 'green', deviation: 0.3 });
        console.log(`  ${stat}=${String(val).padEnd(3)} | DR total: ${fmt(rd.total+'y',6)}  DR lateral: ${fmt(rd.lateralYards,6)}y  curve: ${fmt(rd.swingCurveDeg,5)}°  | PW-rough total: ${fmt(rr.total+'y',6)}  | putt total: ${fmt(rp.total+'y',6)} lateral: ${fmt(rp.lateralYards,5)}y`);
      }
    }
  }
}
