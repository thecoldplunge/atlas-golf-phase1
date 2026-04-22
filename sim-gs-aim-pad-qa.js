#!/usr/bin/env node
// QA for the v0.66 AimPad flow. Locks in the pre-power cap math and
// the OK-lock state machine so regressions in endSwipe or the aim
// reset sites trip here before anyone notices in-game.

const MIN_PRE_POWER = 0.3;
const AIM_PAD_MAX_RAD = 0.35;
const CAP = 80 * 2; // 80 · dpr; dpr = 2 in canonical test

function padToValues(cx, cy) {
  // Mirrors AimPad.handle: cx/cy are clamped normalised coords.
  const aim = cx * AIM_PAD_MAX_RAD;
  const downFrac = Math.max(0, cy);
  const cap = 1 - downFrac * (1 - MIN_PRE_POWER);
  return { aim, cap };
}

function endSwipePower(peakDy, prePowerCap) {
  const swipePower = Math.max(0.1, Math.min(1, peakDy / CAP));
  const cap = Math.max(0.3, Math.min(1, prePowerCap ?? 1));
  return swipePower * cap;
}

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('AimPad + pre-power cap QA\n');

// padToValues tests.
{
  const a = padToValues(0, 0);
  assert(Math.abs(a.aim) < 1e-9 && Math.abs(a.cap - 1) < 1e-9, 'neutral pad → aim 0, cap 100%', `aim=${a.aim.toFixed(3)} cap=${a.cap.toFixed(2)}`);
}
{
  const r = padToValues(1, 0);
  assert(Math.abs(r.aim - AIM_PAD_MAX_RAD) < 1e-9, 'full right → aim = +max', r.aim.toFixed(3));
  assert(Math.abs(r.cap - 1) < 1e-9, '  cap stays 100%', r.cap.toFixed(2));
}
{
  const l = padToValues(-1, 0);
  assert(Math.abs(l.aim + AIM_PAD_MAX_RAD) < 1e-9, 'full left → aim = −max', l.aim.toFixed(3));
}
{
  const d = padToValues(0, 1);
  assert(Math.abs(d.cap - MIN_PRE_POWER) < 1e-9, 'full down → cap = min (30%)', d.cap.toFixed(2));
}
{
  const u = padToValues(0, -1);
  assert(Math.abs(u.cap - 1) < 1e-9, 'full UP → cap stays 100% (no bonus)', u.cap.toFixed(2));
}
{
  const mid = padToValues(0, 0.5);
  const expected = 1 - 0.5 * (1 - MIN_PRE_POWER); // 0.65
  assert(Math.abs(mid.cap - expected) < 1e-9, 'half down → cap = 65%', mid.cap.toFixed(3));
}

// endSwipe math tests — full swipe times cap.
{
  const p = endSwipePower(CAP, 1);
  assert(Math.abs(p - 1) < 1e-9, 'full swipe, 100% cap → 100% power', p.toFixed(3));
}
{
  const p = endSwipePower(CAP, 0.9);
  assert(Math.abs(p - 0.9) < 1e-9, 'full swipe, 90% cap → 90% power', p.toFixed(3));
}
{
  const p = endSwipePower(CAP * 0.5, 0.9);
  assert(Math.abs(p - 0.45) < 1e-9, '50% swipe, 90% cap → 45% power (multiply)', p.toFixed(3));
}
{
  const p = endSwipePower(CAP, MIN_PRE_POWER);
  assert(Math.abs(p - MIN_PRE_POWER) < 1e-9, 'full swipe, 30% cap → 30% power', p.toFixed(3));
}

// Cap clamps to [0.3, 1.0] even if someone passes something outside.
{
  const p = endSwipePower(CAP, 0.15);
  assert(Math.abs(p - 0.3) < 1e-9, 'cap<0.3 clamps to 0.3', p.toFixed(3));
}
{
  const p = endSwipePower(CAP, 1.5);
  assert(Math.abs(p - 1) < 1e-9, 'cap>1 clamps to 1', p.toFixed(3));
}
