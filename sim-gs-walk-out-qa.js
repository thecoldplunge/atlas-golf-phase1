#!/usr/bin/env node
// QA for the v0.74 walk-to-next-hole. Proves the fade-in / advanceHole
// / fade-out sequencing, and that arrow rotation points from player
// to waypoint (top-center of world) as the player drifts around.

const FADE_DUR = 0.45;
const TRIGGER_R = 24;
const WORLD_W = 1500;
const WORLD_H = 2000;

function makeWalkOut() {
  return {
    active: true, fading: false, fadeT: 0, fadePhase: 'in',
    targetX: WORLD_W / 2, targetY: 12,
    advanceCalls: 0,
  };
}

// One tick of the walk-out loop. Returns { fadeAlpha } for the HUD.
function tick(wo, p, dt) {
  const dx = wo.targetX - p.x;
  const dy = wo.targetY - p.y;
  if (!wo.fading) {
    if (Math.hypot(dx, dy) < TRIGGER_R || p.y < 24) {
      wo.fading = true;
      wo.fadeT = 0;
      wo.fadePhase = 'in';
    }
  } else {
    wo.fadeT += dt;
    if (wo.fadePhase === 'in') {
      if (wo.fadeT >= FADE_DUR) {
        wo.advanceCalls++;
        wo.fadePhase = 'out';
        wo.fadeT = 0;
      }
    } else {
      if (wo.fadeT >= FADE_DUR) {
        wo.active = false;
        wo.fading = false;
        wo.fadeT = 0;
      }
    }
  }
  let fadeAlpha = 0;
  if (wo.fading) {
    const t = Math.max(0, Math.min(1, wo.fadeT / FADE_DUR));
    fadeAlpha = wo.fadePhase === 'in' ? t : (1 - t);
  }
  return { fadeAlpha };
}

const assert = (ok, msg, actual) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);
  if (!ok) process.exitCode = 1;
};

console.log('v0.74 walk-to-next-hole QA\n');

// Walk north for 10s at 50 px/s from y=1000 → should cross into
// trigger radius near top edge and then fade.
{
  const wo = makeWalkOut();
  const p = { x: WORLD_W / 2, y: 1000 };
  const dt = 1 / 60;
  let ticks = 0;
  let triggeredAt = null;
  while (wo.active && ticks < 3600) {
    if (!wo.fading) p.y -= 50 * dt;
    tick(wo, p, dt);
    if (wo.fading && triggeredAt === null) triggeredAt = p.y;
    ticks++;
  }
  // Trigger fires when hypot(dx, dy) < 24 OR p.y < 24. Walking due
  // north, the hypot is just |dy| = |12 - y|, so trigger at y ≈ 36.
  assert(triggeredAt !== null && triggeredAt < 40, `fade triggers near north edge`, `triggered at y=${triggeredAt?.toFixed(1)}`);
  assert(wo.advanceCalls === 1, `advanceHole fires exactly once`, `calls=${wo.advanceCalls}`);
  assert(ticks < 3600, `walk-out terminates`, `${ticks} ticks`);
}

// Fade alpha ramps 0 → 1 → 0 across the two phases.
{
  const wo = makeWalkOut();
  wo.fading = true; wo.fadePhase = 'in'; wo.fadeT = 0;
  const p = { x: 0, y: 0 };
  const samples = [];
  const dt = 0.05;
  for (let i = 0; i < 30 && wo.active; i++) {
    const r = tick(wo, p, dt);
    samples.push(r.fadeAlpha);
  }
  const peak = Math.max(...samples);
  const end = samples[samples.length - 1];
  assert(peak > 0.95, `fade reaches near-full cover at peak`, peak.toFixed(3));
  assert(end < 0.05, `fade clears by end of walk-out`, end.toFixed(3));
  assert(wo.advanceCalls === 1, `advanceHole fires once during fade`, `calls=${wo.advanceCalls}`);
}

// Arrow direction math: dir=atan2(targetY-p.y, targetX-p.x). For a
// player south of the top-center target, dir should be ≈ -π/2 (up).
{
  const dir = Math.atan2(12 - 1600, 750 - 750);
  const cssRot = dir * 180 / Math.PI + 90;
  assert(Math.abs(dir + Math.PI / 2) < 1e-6, `arrow direction = -π/2 when target due north`, dir.toFixed(3));
  assert(Math.abs(cssRot - 0) < 1e-6, `css rotation for up-arrow = 0°`, cssRot.toFixed(3));
}

// Player west of target (target east of them): dir should be 0,
// arrow rotate +90° to point east.
{
  const dir = Math.atan2(0, 500);
  const cssRot = dir * 180 / Math.PI + 90;
  assert(Math.abs(cssRot - 90) < 1e-6, `css rotation = 90° (east)`, cssRot.toFixed(3));
}

// Player north-east of target (dir ≈ π, arrow pointing west).
{
  const dir = Math.atan2(0, -500);
  const cssRot = ((dir * 180 / Math.PI + 90) + 360) % 360;
  assert(Math.abs(cssRot - 270) < 1e-6, `css rotation = 270° (west)`, cssRot.toFixed(3));
}
