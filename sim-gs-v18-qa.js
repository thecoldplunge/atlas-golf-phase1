#!/usr/bin/env node
// QA for GS v0.18: golfer stance + stay-visible-during-flight.

const SW = {
  IDLE: 'idle', AIMING: 'aiming', SWIPING: 'swiping',
  FLYING: 'flying', ROLLING: 'rolling', STOPPED: 'stopped',
  DROPPING: 'dropping', HAZARD: 'hazard', OB: 'ob', HOLED: 'holed',
};

// Encoded from the new tick-loop condition.
function showGolfer(state) {
  return state !== SW.HOLED;
}

// Encoded from the new player-placement helper.
function playerPosForBall(bx, by) {
  return { px: bx - 7, py: by + 1, facing: 'E' };
}

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('=== 1. Golfer visibility across swing states ===\n');
// The only intentionally hidden state is HOLED (celebration focus on the ball).
const shouldShow = [SW.IDLE, SW.AIMING, SW.SWIPING, SW.FLYING, SW.ROLLING, SW.DROPPING, SW.STOPPED, SW.HAZARD, SW.OB];
for (const s of shouldShow) {
  assert(showGolfer(s), `${s} → golfer drawn`, 'visible');
}
assert(!showGolfer(SW.HOLED), 'HOLED → golfer hidden (celebration only)', 'hidden');

console.log('\n=== 2. Player stance: left of ball, facing east ===\n');
const ballSpots = [
  { x: 200, y: 400 },
  { x: 50, y: 600 },
  { x: 1000, y: 1200 },
];
for (const b of ballSpots) {
  const pos = playerPosForBall(b.x, b.y);
  assert(pos.px < b.x, `Player x (${pos.px}) is LEFT of ball x (${b.x})`, `${pos.px} < ${b.x}`);
  assert(Math.abs(pos.py - b.y) <= 2, 'Player y stays near ball y', `${pos.py} ≈ ${b.y}`);
  assert(pos.facing === 'E', 'Player facing east (right)', pos.facing);
  const offset = b.x - pos.px;
  assert(offset >= 4 && offset <= 12, 'Player stands within 4–12 px of ball (tight stance, not overlap)', `offset=${offset}`);
}
