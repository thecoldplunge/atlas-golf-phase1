#!/usr/bin/env node
// QA for the GS match state machine. Mirrors the transition rules
// that settleBallTransitions + pickNextPlayerIdx drive:
//
//   1. On hole start, every player is set to un-teed.
//   2. Turn order honours: tee-off first (by slot order), then
//      farthest-from-pin among players who haven't holed out.
//   3. settleBallTransitions finishes a hole for a player when their
//      ball reaches 'holed' and marks holedOutThisHole. The next
//      player is looked up via pickNextPlayerIdx.
//   4. When every player has holed out, the scorecard state fires.

function pickNextPlayerIdx(players, flag) {
  const untee = players.findIndex((pl) => !pl.holedOutThisHole && !pl.teedOff);
  if (untee >= 0) return untee;
  let bestIdx = -1, bestDist = -Infinity;
  for (let i = 0; i < players.length; i++) {
    const pl = players[i];
    if (pl.holedOutThisHole) continue;
    const d = Math.hypot(pl.ballX - flag.x, pl.ballY - flag.y);
    if (d > bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

function makePlayer(id, isNPC) {
  return { id, isNPC, teedOff: false, holedOutThisHole: false, ballX: 0, ballY: 0 };
}

const assert = (ok, msg, actual) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('GS match turn-engine QA\n');

const flag = { x: 0, y: 0 };

// 1. Tee-off order starts at slot 0, walks through untee'd players.
{
  const ps = [makePlayer('p1', false), makePlayer('p2', true)];
  assert(pickNextPlayerIdx(ps, flag) === 0, 'slot 0 tees off first', pickNextPlayerIdx(ps, flag));
  ps[0].teedOff = true;
  ps[0].ballX = 200; ps[0].ballY = 0;
  assert(pickNextPlayerIdx(ps, flag) === 1, 'slot 1 tees off after slot 0', pickNextPlayerIdx(ps, flag));
}

// 2. Once everyone teed off, farthest-from-pin plays next.
{
  const ps = [makePlayer('p1', false), makePlayer('p2', true), makePlayer('p3', true)];
  ps[0].teedOff = true; ps[0].ballX = 100; ps[0].ballY = 0;
  ps[1].teedOff = true; ps[1].ballX = 300; ps[1].ballY = 0;
  ps[2].teedOff = true; ps[2].ballX = 50;  ps[2].ballY = 0;
  assert(pickNextPlayerIdx(ps, flag) === 1, 'farthest player plays next', pickNextPlayerIdx(ps, flag));
}

// 3. Holed-out players are skipped.
{
  const ps = [makePlayer('p1', false), makePlayer('p2', true)];
  ps[0].teedOff = true; ps[0].ballX = 50;  ps[0].ballY = 0; ps[0].holedOutThisHole = true;
  ps[1].teedOff = true; ps[1].ballX = 200; ps[1].ballY = 0;
  assert(pickNextPlayerIdx(ps, flag) === 1, 'skip holed players', pickNextPlayerIdx(ps, flag));
}

// 4. All holed — pickNextPlayerIdx returns -1 so the scorecard fires.
{
  const ps = [makePlayer('p1', false), makePlayer('p2', true)];
  ps[0].teedOff = true; ps[0].holedOutThisHole = true;
  ps[1].teedOff = true; ps[1].holedOutThisHole = true;
  assert(pickNextPlayerIdx(ps, flag) === -1, 'all holed → scorecard sentinel', pickNextPlayerIdx(ps, flag));
}

// 5. 1-player mode behaves like the old single-player flow.
{
  const ps = [makePlayer('p1', false)];
  assert(pickNextPlayerIdx(ps, flag) === 0, '1P: player 0 tees off', pickNextPlayerIdx(ps, flag));
  ps[0].teedOff = true; ps[0].ballX = 120; ps[0].ballY = 0;
  assert(pickNextPlayerIdx(ps, flag) === 0, '1P: player 0 keeps playing', pickNextPlayerIdx(ps, flag));
  ps[0].holedOutThisHole = true;
  assert(pickNextPlayerIdx(ps, flag) === -1, '1P: holed → scorecard', pickNextPlayerIdx(ps, flag));
}

// 6. 4-player tee order: slots 0→1→2→3 in the tee phase.
{
  const ps = [
    makePlayer('p1', false), makePlayer('p2', true),
    makePlayer('p3', true),  makePlayer('p4', true),
  ];
  for (let i = 0; i < 4; i++) {
    const pickedIdx = pickNextPlayerIdx(ps, flag);
    assert(pickedIdx === i, `tee order: slot ${i}`, pickedIdx);
    ps[i].teedOff = true;
    ps[i].ballX = 100 + i * 10;
  }
}
