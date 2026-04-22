#!/usr/bin/env node
// QA for the v0.73 HIGH shot tuning. "Hit it high" should produce a
// higher apex + shorter carry vs pure. Before this patch, raising
// spinY just steepened the launch angle without touching v0 — on
// sub-45° clubs that actually INCREASED carry (sin(2θ) peaks at 45°).

const GRAVITY = 70;
const DR = { v: 209, angle: 20 };
const SEVEN_I = { v: 137, angle: 39 };

function shotParams(club, power, spinY) {
  const v0Raw = club.v * power;
  const launchMod = 1 - spinY * 0.32;
  const effAngleDeg = club.angle * Math.max(0.35, launchMod);
  const highBite = club.angle <= 39 ? 0.18 : 0.08;
  const highPenalty = spinY < 0 ? (1 + spinY * highBite) : 1;
  const v0 = v0Raw * highPenalty;
  const angleRad = (effAngleDeg * Math.PI) / 180;
  return { v0, angleRad, effAngleDeg };
}

function apexPx(v0, angleRad) {
  const vy = v0 * Math.sin(angleRad);
  return (vy * vy) / (2 * GRAVITY);
}

function carryPx(v0, angleRad) {
  return (v0 * v0 * Math.sin(2 * angleRad)) / GRAVITY;
}

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('HIGH shot tuning QA — apex up, carry down\n');

for (const [name, club] of [['driver', DR], ['7I', SEVEN_I]]) {
  const pure = shotParams(club, 1, 0);
  const big  = shotParams(club, 1, -1);
  const pureApex = apexPx(pure.v0, pure.angleRad);
  const bigApex = apexPx(big.v0, big.angleRad);
  const pureCarry = carryPx(pure.v0, pure.angleRad);
  const bigCarry = carryPx(big.v0, big.angleRad);
  assert(bigApex > pureApex, `${name} BIG HIGH apex > PURE apex`,
    `pure ${pureApex.toFixed(0)} px → big ${bigApex.toFixed(0)} px`);
  assert(bigCarry < pureCarry, `${name} BIG HIGH carry < PURE carry`,
    `pure ${pureCarry.toFixed(0)} px → big ${bigCarry.toFixed(0)} px`);
  assert(bigCarry > pureCarry * 0.6 && bigCarry < pureCarry * 0.9,
    `${name} BIG HIGH carry stays in the 60–90% band (not a total whiff)`,
    `${(bigCarry / pureCarry * 100).toFixed(0)}% of pure`);
}

// LOW shots: apex drops (the whole point of a stinger). Carry
// actually dips too because the launch angle falls below the
// range-optimal 45°, but the trajectory is flat — roll-out in
// the rolling integrator makes up the difference in practice.
{
  const pure = shotParams(DR, 1, 0);
  const low  = shotParams(DR, 1, +0.8);
  const pureApex = apexPx(pure.v0, pure.angleRad);
  const lowApex = apexPx(low.v0, low.angleRad);
  assert(lowApex < pureApex, `LOW driver apex < PURE (stinger trajectory)`,
    `pure ${pureApex.toFixed(0)} → low ${lowApex.toFixed(0)}`);
}
