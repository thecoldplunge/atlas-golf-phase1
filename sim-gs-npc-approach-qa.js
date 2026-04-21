#!/usr/bin/env node
// QA for the v0.56 NPC approach-shot power tuning. The pre-v0.56 code
// hit shots noticeably short on approaches (power mean was pin-distance
// with no bias + symmetric noise), so a 50-PWR CPU routinely took two
// approach shots to reach the green. v0.56 adds a 6–10% overshoot bias
// plus positive-skewed noise so distance distributions centre AT or
// slightly past the pin, with tighter spread for higher-stat golfers.

const TILE = 16;
const GRAVITY = 70;
const CLUB_7I = { v: 148, angle: 39 };

function computeCarry(club, power) {
  const v = club.v * power;
  const angleRad = (club.angle * Math.PI) / 180;
  if (club.angle === 0) return v * 0.9;
  return Math.max(0, (v * v * Math.sin(2 * angleRad)) / GRAVITY);
}

function legacyPower(distPx, club, pwrStat) {
  const carry = computeCarry(club, 1.0);
  let powerPct = Math.max(0.15, Math.min(1.0, distPx / Math.max(1, carry)));
  const noise = (Math.random() - 0.5) * 2 * (0.22 - pwrStat / 600);
  return Math.max(0.1, Math.min(1.0, powerPct + noise));
}

function newPower(distPx, club, pwrStat) {
  const carry = computeCarry(club, 1.0);
  const ratio = Math.max(0, Math.min(1, distPx / Math.max(1, carry)));
  let powerPct = Math.max(0.2, Math.min(1.0, Math.sqrt(ratio) * 1.03));
  const noiseRange = Math.max(0.03, 0.17 - pwrStat / 700);
  const noise = (Math.random() - 0.5) * 2 * noiseRange;
  return Math.max(0.15, Math.min(1.0, powerPct + noise));
}

function actualCarry(club, power) {
  return computeCarry(club, power);
}

function sampleMean(fn, n) {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += fn();
  return sum / n;
}

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('NPC approach power QA — v0.56 bias tuning\n');

// 7-iron full carry ~ 313 world px (= 196 yd).
const fullCarry = computeCarry(CLUB_7I, 1.0);

for (const pwrStat of [50, 75, 95]) {
  for (const distPx of [120, 180, 240]) {
    const legacyLanding = sampleMean(() => actualCarry(CLUB_7I, legacyPower(distPx, CLUB_7I, pwrStat)), 5000);
    const newLanding = sampleMean(() => actualCarry(CLUB_7I, newPower(distPx, CLUB_7I, pwrStat)), 5000);
    // New mean should land AT LEAST within 20% of target, prefer over
    // rather than under (± 15% is great, ± 30% short is bad).
    const newErr = (newLanding - distPx) / distPx;
    const legacyErr = (legacyLanding - distPx) / distPx;
    const ok = newErr >= -0.05 && newErr <= 0.25;
    assert(ok, `PWR ${pwrStat}, ${distPx}px target → new mean ${newLanding.toFixed(0)}px (err ${(newErr * 100).toFixed(1)}%) vs legacy ${legacyLanding.toFixed(0)}px (err ${(legacyErr * 100).toFixed(1)}%)`,
      `new ${newLanding.toFixed(0)} vs legacy ${legacyLanding.toFixed(0)}`);
  }
}

// High-stat golfer should have tighter variance than low-stat on 180 px target.
{
  const samples50 = [];
  const samples95 = [];
  for (let i = 0; i < 3000; i++) {
    samples50.push(actualCarry(CLUB_7I, newPower(180, CLUB_7I, 50)));
    samples95.push(actualCarry(CLUB_7I, newPower(180, CLUB_7I, 95)));
  }
  const std = (arr) => {
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
  };
  const lowSpread = std(samples50);
  const highSpread = std(samples95);
  assert(highSpread < lowSpread * 0.8, `High-PWR spread tighter than low-PWR`,
    `σ(95)=${highSpread.toFixed(1)} < 0.8·σ(50)=${(lowSpread * 0.8).toFixed(1)}`);
}
