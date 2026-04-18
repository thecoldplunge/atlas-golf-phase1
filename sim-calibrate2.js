#!/usr/bin/env node
// Physics: given a target carry distance, compute the exact speed needed
// Hang time = GRAVITY * vz / 2 => vz = sqrt(2*g*h), hangTime = 2*vz/g
// With air drag, the ball travels: integrate vx*e^(-drag*t) dt from 0 to hangTime
// carryDist = vx * (1 - e^(-drag*hangTime)) / drag
// So: vx = carryDist * drag / (1 - e^(-drag*hangTime))

const YARDS_PER_WORLD = 1.3;
const GRAVITY = 30;
const GROUND_EPSILON = 0.05;
const FAIRWAY_ROLL_FRICTION = 3.3;
const AIR_DRAG = 0.14;
const DT = 1 / 60;

const CLUBS = [
  { key: 'LW', name: 'Lob Wedge', launch: 1.18, carryYards: 70 },
  { key: 'SW', name: 'Sand Wedge', launch: 1.08, carryYards: 80 },
  { key: 'GW', name: 'Gap Wedge', launch: 0.98, carryYards: 90 },
  { key: 'PW', name: 'Pitching Wedge', launch: 0.9, carryYards: 105 },
  { key: '9I', name: '9 Iron', launch: 0.82, carryYards: 120 },
  { key: '8I', name: '8 Iron', launch: 0.76, carryYards: 130 },
  { key: '7I', name: '7 Iron', launch: 0.7, carryYards: 140 },
  { key: '5I', name: '5 Iron', launch: 0.6, carryYards: 160 },
  { key: '3W', name: '3 Wood', launch: 0.5, carryYards: 225 },
  { key: 'DR', name: 'Driver', launch: 0.46, carryYards: 250 },
];

function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

// Simulate shot with analytic-derived initial speed
function simulateShot(club, powerPct) {
  const powerFrac = clamp(powerPct / 100, 0, 1.2);
  const targetCarryWorld = (club.carryYards / YARDS_PER_WORLD) * powerFrac;

  // Hang time based on club loft: higher loft = longer hang
  const hangTime = (0.6 + club.launch * 0.9) * powerFrac;

  // Analytically compute horizSpeed so ball carries exactly targetCarryWorld
  // carryDist = vx * (1 - e^(-drag*hangTime)) / drag
  const expFactor = 1 - Math.exp(-AIR_DRAG * hangTime);
  const vx = expFactor > 0.001 ? (targetCarryWorld * AIR_DRAG / expFactor) : targetCarryWorld * 2;

  // launchVz from hang time: hangTime = 2*vz / GRAVITY
  const launchVz = (GRAVITY * hangTime) / 2;

  let velx = vx, x = 0, z = 0.08, vz = launchVz;
  let carryX = 0, hasLanded = false;

  for (let tick = 0; tick < 6000; tick++) {
    if (z > GROUND_EPSILON || vz > 0.3) {
      velx *= Math.max(0, 1 - AIR_DRAG * DT);
      vz -= GRAVITY * DT;
    } else {
      if (!hasLanded) {
        hasLanded = true;
        carryX = x;
        velx *= 0.8;
        vz = 0; z = 0;
      }
      velx *= Math.max(0, 1 - FAIRWAY_ROLL_FRICTION * DT);
      vz = 0; z = 0;
    }
    x += velx * DT;
    z = Math.max(0, z + vz * DT);
    if (hasLanded && Math.abs(velx) < 0.3) break;
  }
  if (!hasLanded) carryX = x;
  return {
    carry: Math.round(carryX * YARDS_PER_WORLD),
    total: Math.round(x * YARDS_PER_WORLD),
    vx: Math.round(vx),
    launchVz: Math.round(launchVz * 10) / 10,
    hangTime: Math.round(hangTime * 100) / 100
  };
}

console.log('\nClub              | Target | 25%    | 50%    | 75%    | 100%   | vx@100  | hangT@100');
console.log('──────────────────|────────|────────|────────|────────|────────|─────────|──────────');
for (const club of CLUBS) {
  const r = [25, 50, 75, 100].map(p => simulateShot(club, p));
  const err = Math.round(Math.abs(r[3].carry - club.carryYards) / club.carryYards * 100);
  const mark = err <= 10 ? '✅' : err <= 20 ? '⚠️' : '❌';
  console.log(`${club.name.padEnd(18)}| ${(club.carryYards+'y').padStart(6)} | ${r.map(x=>(x.carry+'y').padStart(6)).join(' | ')} | ${(r[3].vx).toString().padStart(7)} | ${r[3].hangTime}s  ${mark}${err}%`);
}
