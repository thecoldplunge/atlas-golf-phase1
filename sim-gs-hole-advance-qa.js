#!/usr/bin/env node
// QA for the "ball drops in cup → advance to next hole" state machine.
// Reproduces the v0.18/v0.25 bug where settleBallTransitions combined the
// 'stopped' and 'holed' ball states into one `else if` branch, which
// silently consumed the 'holed' case for stats and left sw.state stuck
// at SW.DROPPING forever — no transition to SW.HOLED, no messageTimer
// countdown, no advanceHole() call.

const SW = {
  IDLE: 'idle', AIMING: 'aiming', SWIPING: 'swiping',
  FLYING: 'flying', ROLLING: 'rolling', STOPPED: 'stopped',
  DROPPING: 'dropping', HAZARD: 'hazard', OB: 'ob', HOLED: 'holed',
};

function makeSettle({ advanceOnTimer }) {
  return function settleBallTransitions(ball, sw) {
    if (ball.state === 'rolling') sw.state = SW.ROLLING;
    else if (ball.state === 'dropping') sw.state = SW.DROPPING;
    else if (ball.state === 'stopped' || ball.state === 'holed') {
      if (ball.state === 'stopped') {
        ball.state = 'rest';
        sw.state = SW.AIMING;
      } else {
        sw.state = SW.HOLED;
        sw.messageTimer = 3;
      }
    }
    else if (ball.state === 'hazard') { sw.state = SW.HAZARD; sw.messageTimer = 2.2; }
    else if (ball.state === 'ob') { sw.state = SW.OB; sw.messageTimer = 2.2; }
  };
}

// Tick step — mirrors the real tick loop's state machine.
function tickStep(ball, sw, dt, settle, advanceHole) {
  if (sw.state === SW.FLYING || sw.state === SW.ROLLING || sw.state === SW.DROPPING) {
    // Simulate stepBall: if dropping, advance dropT; if dropT > 0.75, hole.
    if (ball.state === 'dropping') {
      ball.dropT = (ball.dropT || 0) + dt;
      if (ball.dropT > 0.75) ball.state = 'holed';
    }
    settle(ball, sw);
  } else if (sw.state === SW.HOLED) {
    sw.messageTimer -= dt;
    if (sw.messageTimer <= 0) advanceHole();
  }
}

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('Hole-advance state machine QA\n');

// === Scenario: ball drops in cup on hole 1, should end on hole 2 ===
const settle = makeSettle({ advanceOnTimer: true });
let holeIdx = 0;
// advanceHole resets ball + sw — mirrors the real setBallOnTee call
// at the end of the real advanceHole().
const ball = { state: 'dropping', dropT: 0 };
const sw = { state: SW.FLYING, messageTimer: 0 };
const advanceHole = () => {
  holeIdx += 1;
  ball.state = 'rest';
  ball.dropT = 0;
  sw.state = SW.AIMING;
  sw.messageTimer = 0;
};

// 30 ticks at ~16ms each = ~0.5s — should reach 'holed'
for (let i = 0; i < 60; i++) {
  tickStep(ball, sw, 0.016, settle, advanceHole);
}

assert(ball.state === 'holed', 'Ball reaches holed state within ~1s', ball.state);
assert(sw.state === SW.HOLED, 'Swing state transitions to SW.HOLED (was stuck at DROPPING)', sw.state);
assert(sw.messageTimer > 0, 'messageTimer is set to the holed display window', sw.messageTimer.toFixed(2));

// Continue ticking for 4 more seconds — should auto-advance.
for (let i = 0; i < 250; i++) {
  tickStep(ball, sw, 0.016, settle, advanceHole);
}
assert(holeIdx === 1, 'advanceHole() fires after messageTimer expires → hole 2', holeIdx);

// === Scenario: ball rolls to a stop — should NOT advance ===
const ball2 = { state: 'rolling' };
const sw2 = { state: SW.FLYING, messageTimer: 0 };
settle(ball2, sw2);
assert(sw2.state === SW.ROLLING, 'Rolling ball → SW.ROLLING', sw2.state);
ball2.state = 'stopped';
settle(ball2, sw2);
assert(sw2.state === SW.AIMING, 'Stopped ball → SW.AIMING (not HOLED!)', sw2.state);
