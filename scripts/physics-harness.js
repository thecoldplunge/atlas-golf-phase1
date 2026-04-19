const YARDS_PER_WORLD = 4;
const CURVE_FORCE = 1.35;
const CURVE_LAUNCH_BLEND = 1.15;
const WIND_FORCE_SCALE = 0.35;
const BALL_RADIUS_WORLD = 1.2;
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
const SURFACE_PHYSICS = {
  rough: { rollFriction: 4.2, bounce: 0.18, landingDamping: 0.72, swingSensitivity: 1.4 },
  deepRough: { rollFriction: 5.8, bounce: 0.12, landingDamping: 0.6, swingSensitivity: 1.8 },
  fairway: { rollFriction: 3.3, bounce: 0.24, landingDamping: 0.8, swingSensitivity: 1.0 },
  sand: { rollFriction: 6.5, bounce: 0.1, landingDamping: 0.54, swingSensitivity: 2.0 },
  tee: { rollFriction: 3.0, bounce: 0.22, landingDamping: 0.85, swingSensitivity: 1.0 }
};
const WIND_DIRS = { N:{x:0,y:-1}, S:{x:0,y:1}, E:{x:1,y:0}, W:{x:-1,y:0}, NE:{x:0.707,y:-0.707}, NW:{x:-0.707,y:-0.707}, SE:{x:0.707,y:0.707}, SW:{x:-0.707,y:0.707} };
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const degToRad = (deg) => deg * Math.PI / 180;
const magnitude = (v) => Math.hypot(v.x, v.y);
const speedFromPower = (powerPct, club) => {
  const powerFrac = clamp(powerPct / 100, 0, 1.2);
  const targetCarryWorld = (club.carryYards / YARDS_PER_WORLD) * powerFrac;
  const launchRatio = clamp(powerPct / 125, 0, 1);
  const hangTime = (3.2 + club.launch * 0.8) * launchRatio;
  const expFactor = 1 - Math.exp(-0.14 * hangTime);
  return expFactor > 0.001 ? (targetCarryWorld * 0.14 / expFactor) : targetCarryWorld * 2;
};
function getLaunchData({ club, powerPct, spinXNorm, spinYNorm, swingDeviation, lie='fairway', aimAngle=-Math.PI/2 }) {
  const launchAdjust = clamp(1 - spinYNorm * 0.4, 0.68, 1.38);
  const spinAdjust = clamp(1 - spinYNorm * 0.36, 0.7, 1.34);
  const curveDeg = -spinXNorm * 85;
  const lieSwingSens = SURFACE_PHYSICS[lie].swingSensitivity || 1;
  let overpowerMult = 1;
  if (powerPct > 100) {
    const overPct = powerPct - 100;
    overpowerMult = 1 + (Math.pow(1.06, overPct) - 1) * 1.2;
  }
  const swingCurveDeg = clamp(swingDeviation * 40 * lieSwingSens * overpowerMult, -45, 45);
  const totalCurveDeg = curveDeg + swingCurveDeg;
  const launchCurveDeg = totalCurveDeg * CURVE_LAUNCH_BLEND;
  const finalAngle = aimAngle + degToRad(launchCurveDeg);
  const dir = { x: Math.cos(finalAngle), y: Math.sin(finalAngle) };
  return { launchAdjust, spinAdjust, totalCurveDeg, dir, finalAngle, launchRatio: clamp(powerPct / 125, 0, 1) };
}
function simulateShot(opts) {
  const club = CLUBS.find(c => c.key === opts.clubKey);
  const launch = getLaunchData({ ...opts, club });
  const lie = SURFACE_PHYSICS[opts.lie];
  let pos = { x: 0, y: 0 };
  let vel = { x: launch.dir.x * speedFromPower(opts.powerPct, club) * club.speed * launch.launchAdjust, y: launch.dir.y * speedFromPower(opts.powerPct, club) * club.speed * launch.launchAdjust };
  let z = 0;
  let vz = (1.05 + club.launch * 1.55) * launch.launchRatio * launch.launchAdjust;
  const wind = WIND_DIRS[opts.windDir || 'N'];
  let apex = 0;
  const dt = 1/60;
  let airborneFrames = 0;
  for (let frame = 0; frame < 2000; frame++) {
    const speed = magnitude(vel);
    if (speed < 0.03 && z <= 0.001 && frame > 10) break;
    vel.x += wind.x * (opts.windSpeed || 0) * WIND_FORCE_SCALE * 0.0009 * dt;
    vel.y += wind.y * (opts.windSpeed || 0) * WIND_FORCE_SCALE * 0.0009 * dt;
    if (z > 0.01 || vz > 0.01) {
      airborneFrames++;
      const aim = launch.finalAngle;
      const fwdDir = { x: Math.cos(aim), y: Math.sin(aim) };
      const perpDir = { x: -Math.sin(aim), y: Math.cos(aim) };
      const fwdSpeed = vel.x * fwdDir.x + vel.y * fwdDir.y;
      const sideSpeed = vel.x * perpDir.x + vel.y * perpDir.y;
      const sideTarget = clamp((launch.totalCurveDeg / 85) * Math.max(0, fwdSpeed) * 0.55, -Math.max(0, fwdSpeed) * 0.65, Math.max(0, fwdSpeed) * 0.65);
      const sideBlend = clamp(CURVE_FORCE * dt * 0.55, 0, 0.12);
      const nextSideSpeed = sideSpeed + (sideTarget - sideSpeed) * sideBlend;
      const nextFwdSpeed = Math.max(0, fwdSpeed * (1 - Math.abs(nextSideSpeed - sideSpeed) * 0.018));
      vel.x = fwdDir.x * nextFwdSpeed + perpDir.x * nextSideSpeed;
      vel.y = fwdDir.y * nextFwdSpeed + perpDir.y * nextSideSpeed;
      vz -= 0.028;
      z += vz * dt * 60;
      apex = Math.max(apex, z);
      if (z <= 0) {
        z = 0;
        vz = -vz * lie.bounce;
        vel.x *= lie.landingDamping;
        vel.y *= lie.landingDamping;
      }
    } else {
      const drag = Math.max(0, 1 - lie.rollFriction * 0.016 * dt * 60);
      vel.x *= drag;
      vel.y *= drag;
    }
    pos.x += vel.x * dt * 60;
    pos.y += vel.y * dt * 60;
  }
  const carryYards = airborneFrames > 0 ? Math.abs(pos.y) * YARDS_PER_WORLD : 0;
  const offlineYards = pos.x * YARDS_PER_WORLD;
  const totalYards = magnitude(pos) * YARDS_PER_WORLD;
  return { club: club.key, lie: opts.lie, power: opts.powerPct, spinX: opts.spinXNorm, spinY: opts.spinYNorm, swing: opts.swingDeviation, wind: `${opts.windDir || 'N'} ${opts.windSpeed || 0}`, totalCurveDeg: Math.round(launch.totalCurveDeg*10)/10, launchAngleDeg: Math.round(launch.finalAngle * 180 / Math.PI), totalYards: Math.round(totalYards), offlineYards: Math.round(offlineYards), apex: Math.round(apex*10)/10, end:{x:pos.x,y:pos.y} };
}
function buildScenarios() {
  const scenarios = [];
  const clubs = ['DR','3W','5I','7I','PW'];
  const lies = ['tee','fairway','rough','deepRough','sand'];
  const powers = [60, 85, 100, 115];
  const spinXs = [-1,-0.5,0,0.5,1];
  const swings = [-0.8,-0.3,0,0.3,0.8];
  for (const clubKey of clubs) {
    for (const lie of lies) {
      for (const powerPct of powers) {
        scenarios.push({ clubKey, lie, powerPct, spinXNorm:0, spinYNorm:0, swingDeviation:0, windDir:'N', windSpeed:0, label:'stock' });
      }
    }
  }
  clubs.forEach(clubKey => {
    [-1,-0.5,0.5,1].forEach(spinXNorm => scenarios.push({ clubKey, lie:'fairway', powerPct:100, spinXNorm, spinYNorm:0, swingDeviation:0, windDir:'N', windSpeed:0, label:'shape' }));
    [-0.8,-0.3,0.3,0.8].forEach(swingDeviation => scenarios.push({ clubKey, lie:'fairway', powerPct:100, spinXNorm:0, spinYNorm:0, swingDeviation, windDir:'N', windSpeed:0, label:'swing' }));
    scenarios.push({ clubKey, lie:'fairway', powerPct:100, spinXNorm:1, spinYNorm:0, swingDeviation:0.8, windDir:'N', windSpeed:0, label:'max-right-miss' });
    scenarios.push({ clubKey, lie:'fairway', powerPct:100, spinXNorm:-1, spinYNorm:0, swingDeviation:-0.8, windDir:'N', windSpeed:0, label:'max-left-miss' });
  });
  return scenarios;
}
const results = buildScenarios().map(simulateShot);
const flags = results.filter(r => Math.abs(r.offlineYards) > r.totalYards * 0.9 || r.totalYards > 420 || Number.isNaN(r.totalYards));
const summary = {
  totalScenarios: results.length,
  flagged: flags.length,
  sampleFlags: flags.slice(0, 20),
  shapeMatrix: results.filter(r => r.lie === 'fairway' && r.power === 100 && ['DR','3W','5I','7I','PW'].includes(r.club) && [-1, -0.5, 0.5, 1].includes(r.spinX)),
};
console.log(JSON.stringify(summary, null, 2));
