#!/usr/bin/env node
// QA for v0.78.5 aim-joystick integration. The AimPad emits a
// continuous joyX in [-1, 1]; the tick loop integrates it into
// sw.aimAngle every frame. This sim mirrors the tick's aim-rotation
// block and asserts the expected behaviours.

const AIM_ROT_SPEED = 0.8;   // v0.79: slowed from 1.5 rad/s
const AIM_DEADZONE = 0.1;

function tickAim(sw, joyX, dt) {
  if (sw.state !== 'AIMING' || sw.aimLocked) return;
  if (Math.abs(joyX) <= AIM_DEADZONE) return;
  sw.aimAngle += joyX * AIM_ROT_SPEED * dt;
  while (sw.aimAngle > Math.PI)  sw.aimAngle -= 2 * Math.PI;
  while (sw.aimAngle < -Math.PI) sw.aimAngle += 2 * Math.PI;
}

const assert = (ok, msg, actual) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);
  if (!ok) process.exitCode = 1;
};

console.log('v0.78.5 aim joystick QA\n');

// Full deflection right for 1 second should rotate by AIM_ROT_SPEED.
{
  const sw = { state: 'AIMING', aimLocked: false, aimAngle: 0 };
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) tickAim(sw, 1.0, dt);
  assert(Math.abs(sw.aimAngle - AIM_ROT_SPEED) < 0.02,
    `full-right for 1s → ~${AIM_ROT_SPEED} rad`, sw.aimAngle.toFixed(3));
}

// Full deflection left for 1s → -AIM_ROT_SPEED.
{
  const sw = { state: 'AIMING', aimLocked: false, aimAngle: 0 };
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) tickAim(sw, -1.0, dt);
  assert(Math.abs(sw.aimAngle + AIM_ROT_SPEED) < 0.02,
    `full-left for 1s → ~-${AIM_ROT_SPEED} rad`, sw.aimAngle.toFixed(3));
}

// Half deflection = half rate.
{
  const sw = { state: 'AIMING', aimLocked: false, aimAngle: 0 };
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) tickAim(sw, 0.5, dt);
  assert(Math.abs(sw.aimAngle - AIM_ROT_SPEED * 0.5) < 0.02,
    `half deflection = half rate`, sw.aimAngle.toFixed(3));
}

// Deadzone — tiny |joyX| does not rotate.
{
  const sw = { state: 'AIMING', aimLocked: false, aimAngle: 0 };
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) tickAim(sw, 0.05, dt);
  assert(sw.aimAngle === 0, `|joyX|=0.05 inside deadzone → no rotation`, sw.aimAngle);
}

// Release while deflected: subsequent joyX=0 stops rotating; aim holds.
{
  const sw = { state: 'AIMING', aimLocked: false, aimAngle: 0 };
  const dt = 1 / 60;
  for (let i = 0; i < 30; i++) tickAim(sw, 1.0, dt);  // 0.5 s full right
  const after = sw.aimAngle;
  for (let i = 0; i < 60; i++) tickAim(sw, 0.0, dt);  // released for 1 s
  assert(sw.aimAngle === after,
    `release stops rotation; aim persists at last angle`,
    `before=${after.toFixed(3)} after=${sw.aimAngle.toFixed(3)}`);
}

// Full rotation: 360° at full deflection takes ~2π / AIM_ROT_SPEED ≈ 4.19 s.
{
  const sw = { state: 'AIMING', aimLocked: false, aimAngle: 0 };
  const dt = 1 / 60;
  const ticksFor2Pi = Math.round((2 * Math.PI / AIM_ROT_SPEED) / dt);
  for (let i = 0; i < ticksFor2Pi; i++) tickAim(sw, 1.0, dt);
  // Normalized angle should be near 0 (back to start) — full circle.
  assert(Math.abs(sw.aimAngle) < 0.05,
    `full 360° rotation returns to ~0 angle`, sw.aimAngle.toFixed(3));
}

// aimLocked blocks rotation (AimPad shouldn't be shown but just in case).
{
  const sw = { state: 'AIMING', aimLocked: true, aimAngle: 0.5 };
  tickAim(sw, 1.0, 0.1);
  assert(sw.aimAngle === 0.5, `aimLocked blocks joystick rotation`, sw.aimAngle);
}

// Normalisation — rotating past +π wraps to negative half.
{
  const sw = { state: 'AIMING', aimLocked: false, aimAngle: Math.PI - 0.1 };
  for (let i = 0; i < 30; i++) tickAim(sw, 1.0, 1 / 60);  // +0.75 rad
  assert(sw.aimAngle < 0, `wrapping past +π lands in (−π, 0)`, sw.aimAngle.toFixed(3));
  assert(sw.aimAngle > -Math.PI, `wrapped angle still in range`, sw.aimAngle.toFixed(3));
}

// Only SW.AIMING rotates — e.g. SWIPING is frozen so the player can't
// swing-aim during the swing itself.
{
  const sw = { state: 'SWIPING', aimLocked: false, aimAngle: 0.2 };
  tickAim(sw, 1.0, 0.5);
  assert(sw.aimAngle === 0.2, `SWIPING state does not rotate aim`, sw.aimAngle);
}
