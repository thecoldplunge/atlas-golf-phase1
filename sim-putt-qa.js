// QA: verify puttPowerForDistance produces correct roll distances on flat green
const YARDS_PER_WORLD = 1.3;
const GREEN_FRICTION = 2.6;
const PUTT_CARRY_YARDS = 40;
const DT = 1 / 120; // matches PUTT_PREVIEW_DT

const basePuttSpeed = (PUTT_CARRY_YARDS / YARDS_PER_WORLD) * 2.8;

function puttPowerForDistance(distWorld) {
  const v0Needed = distWorld * GREEN_FRICTION * 1.04;
  const launchRatio = v0Needed / basePuttSpeed;
  return Math.max(5, Math.min(125, Math.round(Math.max(0, Math.min(1, launchRatio)) * 125)));
}

function simulatePutt(powerPct) {
  const launchRatio = Math.max(0, Math.min(1, powerPct / 125));
  const puttSpeed = basePuttSpeed * launchRatio;
  let vx = puttSpeed; // pure x direction
  let x = 0;
  for (let i = 0; i < 5000; i++) {
    const drag = Math.max(0, 1 - GREEN_FRICTION * DT);
    vx *= drag;
    x += vx * DT;
    if (Math.abs(vx) < 0.3) break;
  }
  return x;
}

console.log('Target Dist (yd) | Power% | Actual Roll (world) | Actual Roll (yd) | Error');
console.log('─────────────────|────────|─────────────────────|──────────────────|──────');

for (const targetYards of [5, 8, 10, 15, 19, 25, 30, 40]) {
  const targetWorld = targetYards / YARDS_PER_WORLD;
  const power = puttPowerForDistance(targetWorld);
  const actualWorld = simulatePutt(power);
  const actualYards = actualWorld * YARDS_PER_WORLD;
  const errorPct = Math.round((actualYards / targetYards - 1) * 100);
  console.log(
    `${String(targetYards).padStart(16)}y | ${String(power).padStart(5)}% | ${actualWorld.toFixed(1).padStart(19)} | ${actualYards.toFixed(1).padStart(16)}y | ${errorPct > 0 ? '+' : ''}${errorPct}%`
  );
}
